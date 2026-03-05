"""根据 Agent + 系统模型配置生成 DiAgent agent-task.json。"""

import json
from pathlib import Path
from typing import Any

from app.models.tables import Agent, LLMModel


def build_task_config(
    agent: Agent,
    llm_models: list[LLMModel],
    task_text: str,
    run_id: str,
    *,
    model_override: str | None = None,
    temperature: float | None = None,
) -> dict[str, Any]:
    model_map = {m.name: m for m in llm_models}
    used_model = model_override or agent.model

    all_model_names = {used_model}
    all_model_names.discard("")

    models_section: dict[str, Any] = {
        "default_model": used_model,
        "models": {},
    }
    for name in all_model_names:
        if name and name in model_map:
            m = model_map[name]
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
            models_section["models"][name] = entry

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

    if agent.system_prompt:
        task_section["system_prompt"] = agent.system_prompt
    if agent.skills:
        task_section["skill_names"] = agent.skills
    if agent.mcp_config_path:
        task_section["mcp_config_path"] = agent.mcp_config_path

    return {"models": models_section, "task": task_section}


def write_task_config(workspace: Path, run_id: str, config: dict) -> Path:
    config_path = workspace / f"agent-task-{run_id}.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    return config_path
