from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.api import models, agents, events, subscriptions
from app.services.cron_scheduler import cron_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await cron_scheduler.start()
    yield
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


@app.get("/health")
async def health():
    return {"status": "ok"}
