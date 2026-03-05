from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.models.tables import Team
from app.models.schemas import TeamCreate, TeamUpdate, TeamOut

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamOut])
async def list_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team).order_by(Team.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=TeamOut, status_code=201)
async def create_team(body: TeamCreate, db: AsyncSession = Depends(get_db)):
    team = Team(name=body.name, description=body.description, default_model=body.default_model)
    workspace = settings.workspace_root / team.id
    workspace.mkdir(parents=True, exist_ok=True)
    team.workspace_path = str(workspace)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: str, db: AsyncSession = Depends(get_db)):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return team


@router.put("/{team_id}", response_model=TeamOut)
async def update_team(team_id: str, body: TeamUpdate, db: AsyncSession = Depends(get_db)):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(team, field, value)
    await db.commit()
    await db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=204)
async def delete_team(team_id: str, db: AsyncSession = Depends(get_db)):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    await db.delete(team)
    await db.commit()
