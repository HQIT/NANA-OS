from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.tables import Agent, Team
from app.models.schemas import AgentCreate, AgentUpdate, AgentOut

router = APIRouter(prefix="/teams/{team_id}/agents", tags=["agents"])


async def _ensure_team(team_id: str, db: AsyncSession) -> Team:
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return team


@router.get("", response_model=list[AgentOut])
async def list_agents(team_id: str, db: AsyncSession = Depends(get_db)):
    await _ensure_team(team_id, db)
    result = await db.execute(
        select(Agent).where(Agent.team_id == team_id).order_by(Agent.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(team_id: str, body: AgentCreate, db: AsyncSession = Depends(get_db)):
    await _ensure_team(team_id, db)
    agent = Agent(
        team_id=team_id,
        name=body.name,
        role=body.role,
        description=body.description,
        model=body.model,
        system_prompt=body.system_prompt,
        skills=body.skills,
        mcp_config_path=body.mcp_config_path,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(team_id: str, agent_id: str, db: AsyncSession = Depends(get_db)):
    await _ensure_team(team_id, db)
    agent = await db.get(Agent, agent_id)
    if not agent or agent.team_id != team_id:
        raise HTTPException(404, "Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(team_id: str, agent_id: str, body: AgentUpdate, db: AsyncSession = Depends(get_db)):
    await _ensure_team(team_id, db)
    agent = await db.get(Agent, agent_id)
    if not agent or agent.team_id != team_id:
        raise HTTPException(404, "Agent not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(team_id: str, agent_id: str, db: AsyncSession = Depends(get_db)):
    await _ensure_team(team_id, db)
    agent = await db.get(Agent, agent_id)
    if not agent or agent.team_id != team_id:
        raise HTTPException(404, "Agent not found")
    await db.delete(agent)
    await db.commit()
