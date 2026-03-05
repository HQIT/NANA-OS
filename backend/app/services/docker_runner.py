"""通过 Docker SDK 管理 DiAgent 容器。"""

import logging
from pathlib import Path

import docker
from docker.errors import NotFound, APIError

from app.config import settings

logger = logging.getLogger(__name__)

_client: docker.DockerClient | None = None


def get_client() -> docker.DockerClient:
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def _host_path(workspace: Path) -> str:
    """返回宿主机上的 workspace 路径（Docker Socket 兄弟容器场景）。"""
    if settings.host_workspace_root:
        # 容器内路径到宿主机路径的映射
        relative = workspace.resolve().relative_to(settings.workspace_root.resolve())
        return str(Path(settings.host_workspace_root) / relative)
    return str(workspace.resolve())


def start_container(run_id: str, workspace: Path) -> str:
    """创建并启动一个 DiAgent 容器，返回 container_id。"""
    client = get_client()
    host_ws = _host_path(workspace)
    container = client.containers.run(
        image=settings.diagent_image,
        name=f"nanaos-run-{run_id}",
        labels={"nanaos.run_id": run_id},
        environment={
            "TASK_CONFIG": f"/workspace/agent-task-{run_id}.json",
        },
        volumes={
            host_ws: {"bind": "/workspace", "mode": "rw"},
        },
        detach=True,
        auto_remove=False,
    )
    logger.info("Started container %s for run %s", container.short_id, run_id)
    return container.id


def get_container_status(container_id: str) -> str | None:
    """返回容器状态：running / exited / ... 或 None（不存在）。"""
    client = get_client()
    try:
        c = client.containers.get(container_id)
        c.reload()
        return c.status
    except NotFound:
        return None


def get_container_exit_code(container_id: str) -> int | None:
    client = get_client()
    try:
        c = client.containers.get(container_id)
        c.reload()
        return c.attrs.get("State", {}).get("ExitCode")
    except NotFound:
        return None


def stop_container(container_id: str) -> bool:
    client = get_client()
    try:
        c = client.containers.get(container_id)
        c.stop(timeout=10)
        return True
    except (NotFound, APIError) as e:
        logger.warning("Failed to stop container %s: %s", container_id, e)
        return False


def remove_container(container_id: str) -> bool:
    client = get_client()
    try:
        c = client.containers.get(container_id)
        c.remove(force=True)
        return True
    except (NotFound, APIError):
        return False
