import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db, async_session
from app.models.tables import Team, Agent, Run
from app.models.schemas import RunCreate, RunOut
from app.services.config_generator import build_task_config, write_task_config
from app.services.docker_runner import (
    start_container,
    get_container_status,
    get_container_exit_code,
    stop_container,
    remove_container,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["runs"])


async def _poll_container(run_id: str, container_id: str):
    """后台轮询容器状态，完成后更新 Run 记录。"""
    while True:
        await asyncio.sleep(5)
        status = get_container_status(container_id)
        if status is None or status == "exited":
            break

    exit_code = get_container_exit_code(container_id)
    final_status = "success" if exit_code == 0 else "failed"

    async with async_session() as db:
        run = await db.get(Run, run_id)
        if run:
            run.status = final_status
            run.finished_at = datetime.now(timezone.utc)
            await db.commit()

    remove_container(container_id)
    logger.info("Run %s finished with status %s", run_id, final_status)


@router.post("/teams/{team_id}/run", response_model=RunOut, status_code=201)
async def create_run(team_id: str, body: RunCreate, db: AsyncSession = Depends(get_db)):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    agents_result = await db.execute(select(Agent).where(Agent.team_id == team_id))
    agents = list(agents_result.scalars().all())

    run = Run(team_id=team_id, task_text=body.task)
    db.add(run)
    await db.commit()
    await db.refresh(run)

    workspace = Path(team.workspace_path)
    config = build_task_config(
        team, agents, body.task, run.id,
        model_override=body.model,
        temperature=body.temperature,
    )
    write_task_config(workspace, run.id, config)
    (workspace / "output" / "runs" / run.id).mkdir(parents=True, exist_ok=True)

    try:
        container_id = start_container(run.id, workspace)
        run.status = "running"
        run.container_id = container_id
        run.started_at = datetime.now(timezone.utc)
        run.log_path = f"output/runs/{run.id}/task.log"
        run.result_path = f"output/runs/{run.id}/task_result.md"
        await db.commit()
        await db.refresh(run)
        asyncio.create_task(_poll_container(run.id, container_id))
    except Exception as e:
        logger.error("Failed to start container for run %s: %s", run.id, e)
        run.status = "failed"
        run.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(run)

    return run


@router.get("/runs", response_model=list[RunOut])
async def list_runs(team_id: str | None = None, status: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Run).order_by(Run.created_at.desc())
    if team_id:
        query = query.where(Run.team_id == team_id)
    if status:
        query = query.where(Run.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/runs/{run_id}/log")
async def get_run_log(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    team = await db.get(Team, run.team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    log_file = Path(team.workspace_path) / (run.log_path or f"output/runs/{run_id}/task.log")
    if log_file.exists():
        return {"content": log_file.read_text(encoding="utf-8", errors="replace")}
    return {"content": ""}


@router.get("/runs/{run_id}/result")
async def get_run_result(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    team = await db.get(Team, run.team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    result_file = Path(team.workspace_path) / (run.result_path or f"output/runs/{run_id}/task_result.md")
    if result_file.exists():
        return {"content": result_file.read_text(encoding="utf-8", errors="replace")}
    return {"content": ""}


@router.post("/runs/{run_id}/stop")
async def stop_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status != "running" or not run.container_id:
        raise HTTPException(400, "Run is not running")

    stopped = stop_container(run.container_id)
    if stopped:
        run.status = "cancelled"
        run.finished_at = datetime.now(timezone.utc)
        await db.commit()
        remove_container(run.container_id)
    return {"stopped": stopped}
