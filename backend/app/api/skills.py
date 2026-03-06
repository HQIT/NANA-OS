"""Skills catalog: 返回系统可用的 skills 列表（内建 + 自定义）。"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/skills", tags=["skills"])

_BUILTIN_SKILLS: list[dict[str, str]] = [
    {"name": "git_tool", "description": "Git 操作：clone / commit / push / pull 等"},
    {"name": "code_review", "description": "代码审查与质量分析"},
    {"name": "web_search", "description": "网络搜索与信息检索"},
    {"name": "file_manager", "description": "文件读写与目录管理"},
    {"name": "shell_exec", "description": "执行 Shell 命令"},
    {"name": "text_analysis", "description": "文本摘要、翻译与分析"},
    {"name": "code_writer", "description": "代码生成与重构"},
    {"name": "test_runner", "description": "运行测试用例并收集结果"},
]


def _scan_custom_skills() -> list[dict[str, str]]:
    """扫描 workspace/skills/ 目录下的自定义 SKILL.md 文件。"""
    skills_dir = Path(os.getenv("SKILLS_DIR", "workspace/skills"))
    results: list[dict[str, str]] = []
    if not skills_dir.is_dir():
        return results
    for child in sorted(skills_dir.iterdir()):
        if not child.is_dir():
            continue
        skill_md = child / "SKILL.md"
        if not skill_md.exists():
            continue
        desc = ""
        try:
            for line in skill_md.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if stripped.startswith("description:"):
                    desc = stripped.split(":", 1)[1].strip().strip('"').strip("'")
                    break
        except OSError:
            pass
        results.append({
            "name": child.name,
            "description": desc or child.name,
            "source": "custom",
        })
    return results


@router.get("/catalog")
async def skills_catalog():
    builtin = [{"name": s["name"], "description": s["description"], "source": "builtin"} for s in _BUILTIN_SKILLS]
    custom = _scan_custom_skills()
    return builtin + custom
