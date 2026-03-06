import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.config import settings
from app.models.tables import Agent
from app.models.schemas import AgentCreate, AgentUpdate, AgentOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
async def list_agents(
    group: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Agent).order_by(Agent.created_at)
    if group:
        query = query.where(Agent.group == group)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent_id = uuid.uuid4().hex[:12]
    workspace = body.workspace_path.strip()
    if not workspace:
        workspace = str(settings.workspace_root / agent_id)
    Path(workspace).mkdir(parents=True, exist_ok=True)

    agent = Agent(
        id=agent_id,
        name=body.name,
        group=body.group,
        role=body.role,
        description=body.description,
        model=body.model,
        system_prompt=body.system_prompt,
        skills=body.skills,
        mcp_config_path=body.mcp_config_path,
        mcp_server_ids=getattr(body, "mcp_server_ids", []) or [],
        workspace_path=workspace,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: str, body: AgentUpdate, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    await db.delete(agent)
    await db.commit()
