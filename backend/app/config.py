from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./nanaos.db"
    workspace_root: Path = Path(__file__).resolve().parent.parent.parent / "workspace"
    # Docker Socket 模式下，宿主机上 workspace 的真实路径
    # 容器内 /workspace 和宿主机路径不同，挂载给兄弟容器时需要宿主机路径
    host_workspace_root: str = ""
    diagent_image: str = "ghcr.io/hqit/diagent/agent-task:latest"
    max_concurrent_runs: int = 5

    # Webhook 签名验证密钥，按平台名存储
    # 如 {"github": "xxx", "gitlab": "yyy", "gitea": "zzz"}
    webhook_secrets: dict[str, str] = {}
    
    # 事件重试配置
    event_max_retries: int = 3
    
    # 事件去重配置
    event_dedup_enabled: bool = True
    event_dedup_window_hours: int = 1
    event_dedup_exclude_types: list[str] = ["cron.tick", "manual.trigger"]

    model_config = {"env_prefix": "NANAOS_"}


settings = Settings()
