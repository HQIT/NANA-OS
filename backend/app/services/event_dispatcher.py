"""事件投递：为匹配的 Agent 生成 task config 并启动 DiAgent 容器。

Phase 1 使用 task 模式（一次性容器），复用现有 docker_runner。
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import Agent, LLMModel, EventLog, McpServer
from app.services.docker_runner import (
    start_container,
    get_container_status,
    get_container_exit_code,
    remove_container,
)
from app.services.event_normalizer import CloudEvent

logger = logging.getLogger(__name__)


def _build_event_task_config(
    agent: Agent,
    llm_models: list[LLMModel],
    event: CloudEvent,
    run_id: str,
    default_model: str = "",
    mcp_config_path_override: str | None = None,
) -> dict[str, Any]:
    """根据 Agent 配置 + 事件内容生成 DiAgent task config。"""
    model_map = {m.name: m for m in llm_models}
    used_model = agent.model or default_model

    models_section: dict[str, Any] = {"default_model": used_model, "models": {}}
    if used_model and used_model in model_map:
        m = model_map[used_model]
        entry: dict[str, Any] = {
            "provider": m.provider,
            "model": m.model,
            "base_url": m.base_url,
        }
        if m.api_key:
            entry["api_key"] = m.api_key
        if m.display_name:
            entry["display_name"] = m.display_name
        if m.context_length:
            entry["context_length"] = m.context_length
        models_section["models"][used_model] = entry

    event_summary = (
        f"[Event type={event.get('type')} source={event.get('source')} "
        f"subject={event.get('subject', '')}]\n\n"
        f"{json.dumps(event.get('data', {}), ensure_ascii=False, indent=2)}"
    )

    task_section: dict[str, Any] = {
        "task": event_summary,
        "model": used_model,
        "temperature": 0.7,
        "workspace": "/workspace",
        "output": {
            "log_file": "task.log",
            "result_file": "task_result.md",
        },
        "output_dir": f"output/events/{run_id}",
        "trigger": {"mode": "once"},
        "recursion_limit": 100,
    }

    if agent.system_prompt:
        task_section["system_prompt"] = agent.system_prompt
    if agent.skills:
        task_section["skill_names"] = agent.skills
    mcp_path = mcp_config_path_override or getattr(agent, "mcp_config_path", None) or ""
    if mcp_path:
        task_section["mcp_config_path"] = mcp_path

    return {"models": models_section, "task": task_section}


async def _poll_event_container(run_id: str, container_id: str):
    """后台轮询事件触发的容器状态，完成后清理。"""
    while True:
        await asyncio.sleep(5)
        status = get_container_status(container_id)
        if status is None or status == "exited":
            break

    exit_code = get_container_exit_code(container_id)
    result = "success" if exit_code == 0 else "failed"
    remove_container(container_id)
    logger.info("Event container %s (run %s) finished: %s", container_id[:12], run_id, result)


async def dispatch_event(
    event: CloudEvent,
    agent_ids: list[str],
    db: AsyncSession,
) -> tuple[EventLog, str | None]:
    """将事件投递给匹配的 Agent 列表，创建 EventLog 记录。"""
    event_log = EventLog(
        source=event.get("source", ""),
        event_type=event.get("type", ""),
        subject=event.get("subject", ""),
        cloud_event=event,
        matched_agent_ids=agent_ids,
        status="received",
    )
    db.add(event_log)
    await db.commit()
    await db.refresh(event_log)

    if not agent_ids:
        return event_log, None

    agents_result = await db.execute(
        select(Agent).where(Agent.id.in_(agent_ids))
    )
    agents = {a.id: a for a in agents_result.scalars().all()}

    models_result = await db.execute(select(LLMModel))
    llm_models = list(models_result.scalars().all())

    dispatched = False
    reasons: list[str] = []
    for agent_id in agent_ids:
        agent = agents.get(agent_id)
        if not agent:
            reasons.append(f"Agent {agent_id} not found")
            logger.warning("Agent %s not found, skipping dispatch", agent_id)
            continue

        if not agent.workspace_path:
            reasons.append(f"Agent {agent_id} has no workspace_path")
            logger.warning("Agent %s has no workspace_path, skipping", agent_id)
            continue

        run_id = uuid.uuid4().hex[:12]
        workspace = Path(agent.workspace_path)

        mcp_override = None
        mcp_ids = getattr(agent, "mcp_server_ids", None) or []
        if mcp_ids:
            mcp_result = await db.execute(select(McpServer).where(McpServer.id.in_(mcp_ids)))
            mcp_servers = list(mcp_result.scalars().all())
            if mcp_servers:
                mcp_list = [
                    {"name": s.name, "command": s.command, "args": s.args or [], "env": s.env or {}}
                    for s in mcp_servers
                ]
                config_dir = workspace / "config"
                config_dir.mkdir(parents=True, exist_ok=True)
                mcp_file = config_dir / f"mcp_servers_{run_id}.json"
                mcp_file.write_text(json.dumps(mcp_list, ensure_ascii=False, indent=2), encoding="utf-8")
                mcp_override = f"/workspace/config/mcp_servers_{run_id}.json"

        config = _build_event_task_config(
            agent, llm_models, event, run_id,
            default_model="",
            mcp_config_path_override=mcp_override,
        )

        config_path = workspace / f"agent-task-{run_id}.json"
        try:
            config_path.parent.mkdir(parents=True, exist_ok=True)
            config_path.write_text(
                json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            (workspace / "output" / "events" / run_id).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            reasons.append(f"Agent {agent_id}: write config failed: {e}")
            logger.exception("Write config failed for agent %s", agent_id)
            continue

        try:
            container_id = start_container(run_id, workspace)
            asyncio.create_task(_poll_event_container(run_id, container_id))
            dispatched = True
            logger.info(
                "Dispatched event %s to agent %s (container %s)",
                event_log.id, agent_id, container_id[:12],
            )
        except Exception as e:
            reasons.append(f"Agent {agent_id}: {type(e).__name__}: {e}")
            logger.exception("Failed to dispatch event to agent %s", agent_id)

    event_log.status = "dispatched" if dispatched else "failed"
    await db.commit()
    await db.refresh(event_log)
    error_detail = "; ".join(reasons) if reasons else None
    return event_log, error_detail
