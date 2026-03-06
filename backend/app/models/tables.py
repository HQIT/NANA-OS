import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, String, Text, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class LLMModel(Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    provider: Mapped[str] = mapped_column(String(32), default="openai")
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    api_key: Mapped[str] = mapped_column(String(512), default="")
    display_name: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    context_length: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    group: Mapped[str] = mapped_column(String(128), default="")
    role: Mapped[str] = mapped_column(String(16), default="agent")
    description: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    mcp_config_path: Mapped[str] = mapped_column(String(512), default="")
    mcp_server_ids: Mapped[list] = mapped_column(JSON, default=list)  # 选中的 McpServer id 列表，下发时生成 config
    workspace_path: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ── Connectors (事件源) ──


class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # github, gitlab, gitea, imap, generic
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # type 相关: webhook secret, IMAP 参数等
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ── MCP（供 DiAgent 使用） ──


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    command: Mapped[str] = mapped_column(String(512), nullable=False)
    args: Mapped[list] = mapped_column(JSON, default=list)
    env: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ── Event Gateway ──


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    agent_id: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    source_pattern: Mapped[str] = mapped_column(String(256), nullable=False)
    event_types: Mapped[list] = mapped_column(JSON, nullable=False)
    filter_rules: Mapped[dict] = mapped_column(JSON, default=dict)
    cron_expression: Mapped[str] = mapped_column(String(64), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EventLog(Base):
    __tablename__ = "event_logs"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    source: Mapped[str] = mapped_column(String(256), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    subject: Mapped[str] = mapped_column(String(256), default="")
    cloud_event: Mapped[dict] = mapped_column(JSON, nullable=False)
    matched_agent_ids: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="received")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
