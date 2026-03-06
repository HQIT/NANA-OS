"""事件投递：为匹配的 Agent 生成 task config 并启动 DiAgent 容器。

Phase 1 使用 task 模式（一次性容器），复用现有 docker_runner。
支持重试机制和事件去重。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.tables import Agent, LLMModel, EventLog, McpServer
from app.services.docker_runner import (
    start_container,
    get_container_status,
    get_container_exit_code,
    remove_container,
)
from app.services.event_normalizer import CloudEvent, compute_dedup_hash
from app.services.metrics import metrics

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
    is_retry: bool = False,
    original_log_id: str | None = None,
) -> tuple[EventLog | None, str | None]:
    """将事件投递给匹配的 Agent 列表，创建 EventLog 记录。
    
    Args:
        event: CloudEvent 格式的事件
        agent_ids: 匹配的 Agent ID 列表
        db: 数据库会话
        is_retry: 是否为重试操作（跳过去重检查）
        original_log_id: 原始事件 log ID（重试时使用）
    
    Returns:
        (EventLog, error_message) 或 (None, error) 如果是去重
    """
    start_time = time.time()
    event_type = event.get("type", "")
    
    # 记录指标
    metrics.record_event_received(event_type)
    if is_retry:
        metrics.record_retry()
    
    # 1. 去重检查（非重试操作才检查）
    dedup_hash = compute_dedup_hash(event)
    
    if not is_retry and getattr(settings, "event_dedup_enabled", True):
        # 检查去重排除列表
        exclude_types = getattr(settings, "event_dedup_exclude_types", ["cron.tick", "manual.trigger"])
        if event_type not in exclude_types:
            # 查询最近时间窗口内是否有重复事件
            dedup_window_hours = getattr(settings, "event_dedup_window_hours", 1)
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=dedup_window_hours)
            
            existing = await db.execute(
                select(EventLog).where(
                    EventLog.dedup_hash == dedup_hash,
                    EventLog.created_at > cutoff_time,
                ).limit(1)
            )
            
            duplicate = existing.scalar_one_or_none()
            if duplicate:
                logger.info(
                    "Duplicate event detected (hash=%s), original event_id=%s",
                    dedup_hash[:8], duplicate.id
                )
                metrics.record_dedup()
                return None, f"Duplicate of event {duplicate.id}"
    
    # 2. 创建 EventLog 记录（如果是重试，更新原记录而不是创建新记录）
    if is_retry and original_log_id:
        event_log = await db.get(EventLog, original_log_id)
        if not event_log:
            logger.error("Original event log %s not found for retry", original_log_id)
            return None, "Original event log not found"
    else:
        event_log = EventLog(
            source=event.get("source", ""),
            event_type=event_type,
            subject=event.get("subject", ""),
            cloud_event=event,
            matched_agent_ids=agent_ids,
            status="received",
            dedup_hash=dedup_hash,
            retry_count=0,
            max_retries=getattr(settings, "event_max_retries", 3),
            next_retry_at=datetime.now(timezone.utc) + timedelta(minutes=1),
        )
        db.add(event_log)
        await db.commit()
        await db.refresh(event_log)

    if not agent_ids:
        event_log.status = "dispatched"  # 无匹配 Agent，视为完成
        await db.commit()
        return event_log, None

    # 3. 获取 Agent 和模型信息
    agents_result = await db.execute(
        select(Agent).where(Agent.id.in_(agent_ids))
    )
    agents = {a.id: a for a in agents_result.scalars().all()}

    models_result = await db.execute(select(LLMModel))
    llm_models = list(models_result.scalars().all())

    # 4. 逐个投递给 Agent
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

        # 生成 MCP 配置
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

        # 生成任务配置
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

        # 启动容器
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

    # 5. 更新状态
    event_log.status = "dispatched" if dispatched else "failed"
    error_detail = "; ".join(reasons) if reasons else None
    
    if not dispatched:
        event_log.error_message = error_detail or "Failed to dispatch to any agent"
    
    await db.commit()
    await db.refresh(event_log)
    
    # 6. 记录性能指标
    duration = time.time() - start_time
    metrics.record_dispatch(duration, dispatched, agent_ids)
    
    return event_log, error_detail
