"""事件重试 Worker：后台扫描失败的事件并自动重试。"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session
from app.models.tables import EventLog

logger = logging.getLogger(__name__)

RETRY_CHECK_INTERVAL = 30  # 秒


class EventRetryWorker:
    """后台扫描需要重试的事件，重新投递"""
    
    def __init__(self):
        self._task: asyncio.Task | None = None
    
    async def _tick(self):
        """扫描并重试失败的事件"""
        from app.services.event_dispatcher import dispatch_event
        
        async with async_session() as db:
            now = datetime.now(timezone.utc)
            
            # 查询需要重试的事件
            result = await db.execute(
                select(EventLog).where(
                    EventLog.status == "failed",
                    EventLog.retry_count < EventLog.max_retries,
                    EventLog.next_retry_at <= now,
                ).limit(10)  # 每次最多处理 10 个，避免阻塞
            )
            
            events_to_retry = list(result.scalars().all())
            
            if not events_to_retry:
                return
            
            logger.info("Found %d events to retry", len(events_to_retry))
            
            for event_log in events_to_retry:
                try:
                    logger.info(
                        "Retrying event %s (attempt %d/%d)",
                        event_log.id, event_log.retry_count + 1, event_log.max_retries
                    )
                    
                    # 标记为 dispatching，避免重复处理
                    event_log.status = "dispatching"
                    event_log.retry_count += 1
                    await db.commit()
                    
                    # 重新投递
                    new_log, error = await dispatch_event(
                        event_log.cloud_event,
                        event_log.matched_agent_ids,
                        db,
                        is_retry=True,
                        original_log_id=event_log.id,
                    )
                    
                    # 更新状态
                    if new_log and new_log.status == "dispatched":
                        event_log.status = "dispatched"
                        event_log.error_message = ""
                        logger.info("Event %s retry succeeded", event_log.id)
                    else:
                        if event_log.retry_count >= event_log.max_retries:
                            event_log.status = "dead_letter"
                            logger.warning("Event %s moved to dead letter queue after %d retries", 
                                         event_log.id, event_log.retry_count)
                        else:
                            event_log.status = "failed"
                            # 指数退避：2^retry_count * 60 秒
                            delay_seconds = (2 ** event_log.retry_count) * 60
                            event_log.next_retry_at = now + timedelta(seconds=delay_seconds)
                            logger.info("Event %s retry failed, will retry in %d seconds", 
                                      event_log.id, delay_seconds)
                        
                        if error:
                            event_log.error_message = error
                    
                    await db.commit()
                    
                except Exception:
                    logger.exception("Failed to retry event %s", event_log.id)
                    # 出错时回滚状态，下次再试
                    try:
                        event_log.status = "failed"
                        delay_seconds = (2 ** event_log.retry_count) * 60
                        event_log.next_retry_at = now + timedelta(seconds=delay_seconds)
                        await db.commit()
                    except Exception:
                        logger.exception("Failed to rollback event %s status", event_log.id)
    
    async def _loop(self):
        """持续运行的后台任务"""
        logger.info("Event retry worker started")
        while True:
            try:
                await self._tick()
            except Exception:
                logger.exception("Event retry worker tick failed")
            await asyncio.sleep(RETRY_CHECK_INTERVAL)
    
    def start(self):
        """启动后台任务"""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())
            logger.info("Event retry worker task created")
    
    def stop(self):
        """停止后台任务"""
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Event retry worker stopped")


# 全局单例
retry_worker = EventRetryWorker()
