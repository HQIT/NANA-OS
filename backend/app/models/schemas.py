from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# ── LLMModel ──

class LLMModelCreate(BaseModel):
    name: str
    provider: str = "openai"
    model: str
    base_url: str
    api_key: str = ""
    display_name: str = ""
    description: str = ""
    context_length: Optional[int] = None


class LLMModelUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    context_length: Optional[int] = None


class LLMModelOut(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    base_url: str
    api_key: str
    display_name: str
    description: str
    context_length: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Agent ──

class AgentCreate(BaseModel):
    name: str
    group: str = ""
    role: str = "agent"
    description: str = ""
    model: str = ""
    system_prompt: str = ""
    skills: list[str] = []
    mcp_config_path: str = ""
    mcp_server_ids: list[str] = []
    workspace_path: str = ""


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    group: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    skills: Optional[list[str]] = None
    mcp_config_path: Optional[str] = None
    mcp_server_ids: Optional[list[str]] = None
    workspace_path: Optional[str] = None


class AgentOut(BaseModel):
    id: str
    name: str
    group: str
    role: str
    description: str
    model: str
    system_prompt: str
    skills: list[str]
    mcp_config_path: str
    mcp_server_ids: list[str]
    workspace_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Connector ──

class ConnectorCreate(BaseModel):
    type: str  # github, gitlab, gitea, imap, generic
    name: str
    enabled: bool = True
    config: dict = {}


class ConnectorUpdate(BaseModel):
    type: Optional[str] = None
    name: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[dict] = None


class ConnectorOut(BaseModel):
    id: str
    type: str
    name: str
    enabled: bool
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}


# ── McpServer ──

class McpServerCreate(BaseModel):
    name: str
    command: str
    args: list = []
    env: dict = {}


class McpServerUpdate(BaseModel):
    name: Optional[str] = None
    command: Optional[str] = None
    args: Optional[list] = None
    env: Optional[dict] = None


class McpServerOut(BaseModel):
    id: str
    name: str
    command: str
    args: list
    env: dict
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Subscription ──

class SubscriptionCreate(BaseModel):
    source_pattern: str
    event_types: list[str]
    filter_rules: dict = {}
    cron_expression: str = ""
    enabled: bool = True


class SubscriptionUpdate(BaseModel):
    source_pattern: Optional[str] = None
    event_types: Optional[list[str]] = None
    filter_rules: Optional[dict] = None
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None


class SubscriptionOut(BaseModel):
    id: str
    agent_id: str
    source_pattern: str
    event_types: list[str]
    filter_rules: dict
    cron_expression: str
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── EventLog ──

class EventLogOut(BaseModel):
    id: str
    source: str
    event_type: str
    subject: str
    cloud_event: dict
    matched_agent_ids: list[str]
    status: str
    created_at: datetime
    retry_count: int = 0
    max_retries: int = 3
    next_retry_at: Optional[datetime] = None
    error_message: str = ""
    dedup_hash: str = ""

    model_config = {"from_attributes": True}
