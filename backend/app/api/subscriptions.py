"""Agent 事件订阅管理 CRUD。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.tables import Agent, Subscription
from app.models.schemas import SubscriptionCreate, SubscriptionUpdate, SubscriptionOut

router = APIRouter(tags=["subscriptions"])


# ── 全局订阅列表（拓扑图用） ──

@router.get("/subscriptions", response_model=list[SubscriptionOut])
async def list_all_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).order_by(Subscription.created_at))
    return result.scalars().all()


# ── Per-agent CRUD ──

async def _ensure_agent(agent_id: str, db: AsyncSession) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.get("/agents/{agent_id}/subscriptions", response_model=list[SubscriptionOut])
async def list_subscriptions(agent_id: str, db: AsyncSession = Depends(get_db)):
    await _ensure_agent(agent_id, db)
    result = await db.execute(
        select(Subscription)
        .where(Subscription.agent_id == agent_id)
        .order_by(Subscription.created_at)
    )
    return result.scalars().all()


@router.post("/agents/{agent_id}/subscriptions", response_model=SubscriptionOut, status_code=201)
async def create_subscription(
    agent_id: str,
    body: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_agent(agent_id, db)
    sub = Subscription(
        agent_id=agent_id,
        source_pattern=body.source_pattern,
        event_types=body.event_types,
        filter_rules=body.filter_rules,
        enabled=body.enabled,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.put("/agents/{agent_id}/subscriptions/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(
    agent_id: str,
    sub_id: str,
    body: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_agent(agent_id, db)
    sub = await db.get(Subscription, sub_id)
    if not sub or sub.agent_id != agent_id:
        raise HTTPException(404, "Subscription not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sub, field, value)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/agents/{agent_id}/subscriptions/{sub_id}", status_code=204)
async def delete_subscription(
    agent_id: str,
    sub_id: str,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_agent(agent_id, db)
    sub = await db.get(Subscription, sub_id)
    if not sub or sub.agent_id != agent_id:
        raise HTTPException(404, "Subscription not found")
    await db.delete(sub)
    await db.commit()
