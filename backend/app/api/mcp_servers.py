"""MCP Server CRUD：供 Agent 选用，下发任务时生成 mcp_servers.json。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.tables import McpServer
from app.models.schemas import McpServerCreate, McpServerUpdate, McpServerOut

router = APIRouter(prefix="/mcp-servers", tags=["mcp-servers"])


@router.get("", response_model=list[McpServerOut])
async def list_mcp_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(McpServer).order_by(McpServer.name))
    return result.scalars().all()


@router.post("", response_model=McpServerOut, status_code=201)
async def create_mcp_server(body: McpServerCreate, db: AsyncSession = Depends(get_db)):
    srv = McpServer(name=body.name, command=body.command, args=body.args, env=body.env)
    db.add(srv)
    await db.commit()
    await db.refresh(srv)
    return srv


@router.get("/{server_id}", response_model=McpServerOut)
async def get_mcp_server(server_id: str, db: AsyncSession = Depends(get_db)):
    srv = await db.get(McpServer, server_id)
    if not srv:
        raise HTTPException(404, "MCP server not found")
    return srv


@router.put("/{server_id}", response_model=McpServerOut)
async def update_mcp_server(
    server_id: str,
    body: McpServerUpdate,
    db: AsyncSession = Depends(get_db),
):
    srv = await db.get(McpServer, server_id)
    if not srv:
        raise HTTPException(404, "MCP server not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(srv, k, v)
    await db.commit()
    await db.refresh(srv)
    return srv


@router.delete("/{server_id}", status_code=204)
async def delete_mcp_server(server_id: str, db: AsyncSession = Depends(get_db)):
    srv = await db.get(McpServer, server_id)
    if not srv:
        raise HTTPException(404, "MCP server not found")
    await db.delete(srv)
    await db.commit()
