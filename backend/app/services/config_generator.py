"""根据 Team + Agents 生成 DiAgent agent-task.json 配置。"""

import json
from pathlib import Path
from typing import Any

from app.models.tables import Team, Agent


def build_task_config(
    team: Team,
    agents: list[Agent],
    task_text: str,
    run_id: str,
    *,
    model_override: str | None = None,
    temperature: float | None = None,
) -> dict[str, Any]:
    main_agent = next((a for a in agents if a.role == "main"), None)
    sub_agents = [a for a in agents if a.role == "sub"]

    used_model = model_override or (main_agent.model if main_agent and main_agent.model else team.default_model)

    models_section: dict[str, Any] = {
        "default_model": used_model,
        "models": {},
    }
    all_model_names = {used_model} | {a.model for a in agents if a.model}
    for m in all_model_names:
        if m:
            models_section["models"][m] = {
                "provider": "openai",
                "model": m,
                "base_url": "",
                "api_key": "",
            }

    task_section: dict[str, Any] = {
        "task": task_text,
        "model": used_model,
        "temperature": temperature or 0.7,
        "workspace": "/workspace",
        "output": {
            "log_file": "task.log",
            "result_file": "task_result.md",
        },
        "output_dir": f"output/runs/{run_id}",
        "trigger": {"mode": "once"},
        "recursion_limit": 100,
    }

    if main_agent and main_agent.system_prompt:
        task_section["system_prompt"] = main_agent.system_prompt
    if main_agent and main_agent.skills:
        task_section["skill_names"] = main_agent.skills
    if main_agent and main_agent.mcp_config_path:
        task_section["mcp_config_path"] = main_agent.mcp_config_path

    subagents_list = []
    for sa in sub_agents:
        entry: dict[str, Any] = {
            "name": sa.name,
            "description": sa.description,
            "prompt": sa.system_prompt or f"你是 {sa.name}",
        }
        if sa.model:
            entry["model"] = sa.model
        if sa.skills:
            entry["skill_names"] = sa.skills
        if sa.mcp_config_path:
            entry["mcp_config_path"] = sa.mcp_config_path
        subagents_list.append(entry)

    if subagents_list:
        task_section["subagents"] = subagents_list

    return {"models": models_section, "task": task_section}


def write_task_config(workspace: Path, run_id: str, config: dict) -> Path:
    config_path = workspace / f"agent-task-{run_id}.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return config_path
