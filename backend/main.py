from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.api import models, agents, events, subscriptions, connectors, mcp_servers, skills, mcp_registry
from app.services.cron_scheduler import cron_scheduler
from app.services.imap_poller import imap_poller
from app.services.event_retry_worker import retry_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await cron_scheduler.start()
    await imap_poller.start()
    retry_worker.start()
    yield
    retry_worker.stop()
    await imap_poller.stop()
    await cron_scheduler.stop()


app = FastAPI(title="NANA-OS", description="Network Attached Native Agent OS", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models.router)
app.include_router(agents.router)
app.include_router(events.router)
app.include_router(subscriptions.router)
app.include_router(connectors.router)
app.include_router(mcp_servers.router)
app.include_router(skills.router)
app.include_router(mcp_registry.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
