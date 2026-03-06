"""Event Gateway API: webhook 接收 + 手动触发 + 事件目录 + 事件日志查询。"""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Request, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.models.tables import Subscription, EventLog, Connector
from app.models.schemas import EventLogOut
from app.services.event_normalizer import (
    detect_and_normalize,
    get_event_catalog,
    _make_event,
)
from app.services.event_router import match_subscriptions
from app.services.event_dispatcher import dispatch_event

router = APIRouter(prefix="/events", tags=["events"])


async def _webhook_secrets(db: AsyncSession) -> dict[str, str]:
    """优先从 Connector 表取 webhook secret，否则用 settings。"""
    out = dict(settings.webhook_secrets)
    result = await db.execute(
        select(Connector).where(
            Connector.enabled == True,  # noqa: E712
            Connector.type.in_(["github", "gitlab", "gitea", "git_webhook"]),
        )
    )
    for c in result.scalars().all():
        secret = (c.config or {}).get("secret") or ""
        if not secret:
            continue
        if c.type == "git_webhook":
            platform = (c.config or {}).get("platform", "")
            if platform:
                out[platform] = secret
        else:
            out[c.type] = secret
    return out


class ManualEventBody(BaseModel):
    event_type: str
    source: str = "manual/test"
    subject: str = ""
    data: dict = {}


@router.post("/webhook/{source}")
async def receive_webhook(
    source: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """接收外部 webhook，自动识别平台、标准化、匹配订阅、投递。"""
    body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    headers = dict(request.headers)
    secrets = await _webhook_secrets(db)
    try:
        event = detect_and_normalize(headers, payload, body, secrets)
    except ValueError as e:
        raise HTTPException(403, str(e))

    subs_result = await db.execute(
        select(Subscription).where(Subscription.enabled == True)  # noqa: E712
    )
    subscriptions = list(subs_result.scalars().all())

    matched_ids = match_subscriptions(event, subscriptions)

    event_log, error_detail = await dispatch_event(event, matched_ids, db)

    return {
        "event_id": event_log.id,
        "type": event.get("type"),
        "source": event.get("source"),
        "matched_agents": matched_ids,
        "status": event_log.status,
        "error": error_detail,
    }


@router.get("/catalog")
async def event_catalog(db: AsyncSession = Depends(get_db)):
    """返回系统支持的所有事件源和事件类型，附带各 source 的 Connector 配置状态。"""
    catalog = get_event_catalog()

    result = await db.execute(
        select(Connector).where(Connector.enabled == True)  # noqa: E712
    )
    connectors = list(result.scalars().all())

    configured: set[str] = set()
    for c in connectors:
        if c.type in ("git_webhook", "github", "gitlab", "gitea"):
            configured.add("git")
        elif c.type == "imap":
            configured.add("email")
        elif c.type == "generic":
            configured.add("webhook")

    configured.update(["manual", "cron"])

    connector_status = {s["id"]: s["id"] in configured for s in catalog["sources"]}
    catalog["connector_status"] = connector_status
    return catalog


@router.post("/manual")
async def trigger_manual_event(
    body: ManualEventBody,
    db: AsyncSession = Depends(get_db),
):
    """手动触发一个事件，用于测试/模拟。"""
    event = _make_event(
        source=body.source,
        event_type=body.event_type,
        subject=body.subject,
        data=body.data,
    )

    subs_result = await db.execute(
        select(Subscription).where(Subscription.enabled == True)  # noqa: E712
    )
    subscriptions = list(subs_result.scalars().all())

    matched_ids = match_subscriptions(event, subscriptions)

    event_log, error_detail = await dispatch_event(event, matched_ids, db)

    return {
        "event_id": event_log.id,
        "type": event.get("type"),
        "source": event.get("source"),
        "matched_agents": matched_ids,
        "status": event_log.status,
        "error": error_detail,
    }


@router.get("", response_model=list[EventLogOut])
async def list_events(
    source: str | None = Query(None),
    event_type: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """查询事件日志。"""
    query = select(EventLog).order_by(EventLog.created_at.desc()).limit(limit)
    if source:
        query = query.where(EventLog.source.contains(source))
    if event_type:
        query = query.where(EventLog.event_type == event_type)
    if status:
        query = query.where(EventLog.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{event_id}", response_model=EventLogOut)
async def get_event(event_id: str, db: AsyncSession = Depends(get_db)):
    event_log = await db.get(EventLog, event_id)
    if not event_log:
        raise HTTPException(404, "Event not found")
    return event_log
