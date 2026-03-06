"""MCP Registry 代理：从官方 registry 搜索 MCP servers，避免前端 CORS。"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Query

router = APIRouter(prefix="/mcp-registry", tags=["mcp-registry"])
logger = logging.getLogger(__name__)

_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers"
_CACHE: list[dict[str, Any]] = []
_CACHE_CURSOR: str | None = ""


def _simplify(server_raw: dict) -> dict[str, Any]:
    """将 registry 返回的原始数据简化为前端需要的字段。"""
    s = server_raw.get("server", server_raw)
    name = s.get("name", "")
    desc = s.get("description", "")
    version = s.get("version", "")

    command = ""
    args: list[str] = []
    env: dict[str, str] = {}
    transport = ""

    for pkg in s.get("packages", []):
        rt = pkg.get("registryType", "")
        identifier = pkg.get("identifier", "")
        t = pkg.get("transport", {})
        transport = t.get("type", "")
        if rt == "npm":
            command = "npx"
            args = ["-y", identifier]
        elif rt == "oci":
            command = "docker"
            args = ["run", "-i", "--rm", identifier]
        elif rt == "pip":
            command = "uvx"
            args = [identifier]
        for ev in pkg.get("environmentVariables", []):
            env[ev.get("name", "")] = ev.get("description", "")
        if command:
            break

    for remote in s.get("remotes", []):
        if not transport:
            transport = remote.get("type", "")

    return {
        "name": name,
        "description": desc,
        "version": version,
        "command": command,
        "args": args,
        "env_hints": env,
        "transport": transport,
    }


@router.get("/search")
async def search_registry(
    q: str = Query("", description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100),
):
    global _CACHE, _CACHE_CURSOR

    if not _CACHE:
        try:
            await _fetch_all()
        except Exception as e:
            logger.warning("Failed to fetch MCP registry: %s", e)
            return {"servers": [], "total": 0}

    if q:
        q_lower = q.lower()
        matched = [s for s in _CACHE if q_lower in s["name"].lower() or q_lower in s["description"].lower()]
    else:
        matched = _CACHE

    return {"servers": matched[:limit], "total": len(matched)}


async def _fetch_all():
    """拉取 registry 全部 servers 并缓存。"""
    global _CACHE, _CACHE_CURSOR
    all_servers: list[dict[str, Any]] = []
    cursor: str | None = None
    async with httpx.AsyncClient(timeout=30) as client:
        for _ in range(20):
            params: dict[str, Any] = {"limit": 100}
            if cursor:
                params["cursor"] = cursor
            resp = await client.get(_REGISTRY_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            for raw in data.get("servers", []):
                simplified = _simplify(raw)
                if simplified["name"]:
                    all_servers.append(simplified)
            cursor = data.get("metadata", {}).get("nextCursor")
            if not cursor:
                break

    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for s in all_servers:
        if s["name"] not in seen:
            seen.add(s["name"])
            deduped.append(s)
    _CACHE = deduped
    logger.info("MCP Registry cache loaded: %d servers", len(_CACHE))
