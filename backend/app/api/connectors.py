"""Connector CRUD：事件源（GitHub/GitLab/IMAP 等）的启用与配置。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.tables import Connector
from app.models.schemas import ConnectorCreate, ConnectorUpdate, ConnectorOut

router = APIRouter(prefix="/connectors", tags=["connectors"])

CONNECTOR_TYPES = ("git_webhook", "imap", "generic")
# 兼容旧数据
_LEGACY_GIT_TYPES = ("github", "gitlab", "gitea")
_GIT_PLATFORMS = ("github", "gitlab", "gitea")


@router.get("", response_model=list[ConnectorOut])
async def list_connectors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connector).order_by(Connector.type, Connector.created_at))
    return result.scalars().all()


@router.post("", response_model=ConnectorOut, status_code=201)
async def create_connector(body: ConnectorCreate, db: AsyncSession = Depends(get_db)):
    if body.type not in CONNECTOR_TYPES:
        raise HTTPException(400, f"type must be one of {CONNECTOR_TYPES}")
    if body.type == "git_webhook":
        platform = (body.config or {}).get("platform", "")
        if platform not in _GIT_PLATFORMS:
            raise HTTPException(400, f"git_webhook config.platform must be one of {_GIT_PLATFORMS}")
    conn = Connector(type=body.type, name=body.name, enabled=body.enabled, config=body.config)
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return conn


@router.get("/{connector_id}", response_model=ConnectorOut)
async def get_connector(connector_id: str, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    return conn


@router.put("/{connector_id}", response_model=ConnectorOut)
async def update_connector(
    connector_id: str,
    body: ConnectorUpdate,
    db: AsyncSession = Depends(get_db),
):
    conn = await db.get(Connector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    updates = body.model_dump(exclude_unset=True)
    new_type = updates.get("type", conn.type)
    if "type" in updates and new_type not in (*CONNECTOR_TYPES, *_LEGACY_GIT_TYPES):
        raise HTTPException(400, f"type must be one of {CONNECTOR_TYPES}")
    if new_type == "git_webhook":
        cfg = updates.get("config", conn.config) or {}
        platform = cfg.get("platform", "")
        if platform and platform not in _GIT_PLATFORMS:
            raise HTTPException(400, f"git_webhook config.platform must be one of {_GIT_PLATFORMS}")
    for k, v in updates.items():
        setattr(conn, k, v)
    await db.commit()
    await db.refresh(conn)
    return conn


@router.delete("/{connector_id}", status_code=204)
async def delete_connector(connector_id: str, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    await db.delete(conn)
    await db.commit()
