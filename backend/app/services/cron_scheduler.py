"""内置 CRON 事件源：扫描带 cron_expression 的 Subscription，到点时生成 cron.tick 事件并分发。"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session
from app.models.tables import Subscription
from app.services.event_normalizer import _make_event
from app.services.event_dispatcher import dispatch_event

logger = logging.getLogger(__name__)

_CHECK_INTERVAL = 30


class CronScheduler:

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._last_fire: dict[str, datetime] = {}

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._loop())
        logger.info("CronScheduler started")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        logger.info("CronScheduler stopped")

    async def _loop(self) -> None:
        while True:
            try:
                await self._tick()
            except Exception:
                logger.exception("CronScheduler tick error")
            await asyncio.sleep(_CHECK_INTERVAL)

    async def _tick(self) -> None:
        now = datetime.now(timezone.utc)

        async with async_session() as db:
            result = await db.execute(
                select(Subscription).where(
                    Subscription.cron_expression != "",
                    Subscription.enabled == True,  # noqa: E712
                )
            )
            subs = list(result.scalars().all())

            for sub in subs:
                expr = sub.cron_expression.strip()
                if not expr:
                    continue
                try:
                    cron = croniter(expr, self._last_fire.get(sub.id, now))
                except (ValueError, KeyError):
                    logger.warning("Invalid cron expression for subscription %s: %s", sub.id, expr)
                    continue

                next_fire = cron.get_next(datetime).replace(tzinfo=timezone.utc)
                if next_fire <= now:
                    await self._fire(sub, db)
                    self._last_fire[sub.id] = now

    async def _fire(self, sub: Subscription, db: AsyncSession) -> None:
        event = _make_event(
            source=f"cron/{sub.agent_id}",
            event_type="cron.tick",
            subject=sub.cron_expression,
            data={"agent_id": sub.agent_id, "subscription_id": sub.id},
        )
        await dispatch_event(event, [sub.agent_id], db)
        logger.info("CRON fired for subscription %s (agent %s)", sub.id, sub.agent_id)


cron_scheduler = CronScheduler()
