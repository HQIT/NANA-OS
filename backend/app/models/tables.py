import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    workspace_path: Mapped[str] = mapped_column(String(512), default="")
    default_model: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    team_id: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default="sub")
    description: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    mcp_config_path: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    team_id: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    task_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    log_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    result_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
