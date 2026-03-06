from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def _add_agent_mcp_server_ids(sync_conn):
    try:
        from sqlalchemy import text
        sync_conn.execute(text("ALTER TABLE agents ADD COLUMN mcp_server_ids TEXT DEFAULT '[]'"))
    except Exception:
        pass


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    if "sqlite" in settings.database_url:
        async with engine.connect() as conn:
            await conn.run_sync(_add_agent_mcp_server_ids)
            await conn.commit()


async def get_db():
    async with async_session() as session:
        yield session
