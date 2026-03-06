"""IMAP poller: fetch new mail from Connector(type=imap), emit email.received events."""

from __future__ import annotations

import asyncio
import email
import imaplib
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session
from app.models.tables import Connector, Subscription
from app.services.event_normalizer import _make_event
from app.services.event_router import match_subscriptions
from app.services.event_dispatcher import dispatch_event

logger = logging.getLogger(__name__)

POLL_INTERVAL = 60


def _parse_message(raw: bytes) -> dict:
    msg = email.message_from_bytes(raw)
    subject = msg.get("Subject", "")
    from_ = msg.get("From", "")
    to_ = msg.get("To", "")
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    body = (part.get_payload(decode=True) or b"").decode("utf-8", errors="replace")[:2000]
                except Exception:
                    pass
                break
    else:
        try:
            body = (msg.get_payload(decode=True) or b"").decode("utf-8", errors="replace")[:2000]
        except Exception:
            pass
    return {"from": from_, "to": to_, "subject": subject, "body_preview": body}


async def _poll_imap_connector(conn: Connector, db: AsyncSession) -> None:
    config = conn.config or {}
    host = (config.get("host") or "").strip()
    port = int(config.get("port") or 993)
    user = (config.get("user") or "").strip()
    password = (config.get("password") or "").strip()
    mailbox = config.get("mailbox", "INBOX")
    if not host or not user or not password:
        logger.warning("IMAP connector %s missing host/user/password", conn.id)
        return
    try:
        with imaplib.IMAP4_SSL(host, port=port) as imap:
            imap.login(user, password)
            imap.select(mailbox, readonly=False)
            _, data = imap.search(None, "UNSEEN")
            uids = (data[0] or b"").split()
            if not uids:
                return
            for uid in uids[:10]:
                try:
                    _, msg_data = imap.fetch(uid, "(RFC822)")
                    if not msg_data or not msg_data[0]:
                        continue
                    raw = msg_data[0][1]
                    parsed = _parse_message(raw)
                    event = _make_event(
                        source=f"imap/{conn.id}",
                        event_type="email.received",
                        subject=parsed.get("subject", ""),
                        data=parsed,
                    )
                    subs_result = await db.execute(
                        select(Subscription).where(Subscription.enabled == True)
                    )
                    subscriptions = list(subs_result.scalars().all())
                    matched_ids = match_subscriptions(event, subscriptions)
                    await dispatch_event(event, matched_ids, db)
                    imap.store(uid, "+FLAGS", "\\Seen")
                except Exception:
                    logger.exception("IMAP process message %s failed", uid)
    except Exception:
        logger.exception("IMAP connector %s poll failed", conn.id)


async def _tick(db: AsyncSession) -> None:
    result = await db.execute(
        select(Connector).where(Connector.type == "imap", Connector.enabled == True)
    )
    for conn in result.scalars().all():
        await _poll_imap_connector(conn, db)


class ImapPoller:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._loop())
        logger.info("ImapPoller started")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        logger.info("ImapPoller stopped")

    async def _loop(self) -> None:
        while True:
            try:
                async with async_session() as db:
                    await _tick(db)
            except Exception:
                logger.exception("ImapPoller tick error")
            await asyncio.sleep(POLL_INTERVAL)


imap_poller = ImapPoller()
