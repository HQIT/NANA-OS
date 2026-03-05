from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# ── Team ──

class TeamCreate(BaseModel):
    name: str
    description: str = ""
    default_model: str = ""


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_model: Optional[str] = None


class TeamOut(BaseModel):
    id: str
    name: str
    description: str
    workspace_path: str
    default_model: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Agent ──

class AgentCreate(BaseModel):
    name: str
    role: str = "sub"  # main / sub
    description: str = ""
    model: str = ""
    system_prompt: str = ""
    skills: list[str] = []
    mcp_config_path: str = ""


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    skills: Optional[list[str]] = None
    mcp_config_path: Optional[str] = None


class AgentOut(BaseModel):
    id: str
    team_id: str
    name: str
    role: str
    description: str
    model: str
    system_prompt: str
    skills: list[str]
    mcp_config_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Run ──

class RunCreate(BaseModel):
    task: str
    model: Optional[str] = None
    temperature: Optional[float] = None


class RunOut(BaseModel):
    id: str
    team_id: str
    task_text: str
    status: str
    container_id: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    log_path: Optional[str] = None
    result_path: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
