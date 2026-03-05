export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  display_name: string;
  description: string;
  context_length?: number;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  group: string;
  role: string;
  description: string;
  model: string;
  system_prompt: string;
  skills: string[];
  mcp_config_path: string;
  workspace_path: string;
  created_at: string;
}

export interface EventCatalogSource {
  id: string;
  name: string;
  description: string;
}

export interface EventCatalogType {
  type: string;
  category: string;
  description: string;
}

export interface EventCatalog {
  sources: EventCatalogSource[];
  event_types: EventCatalogType[];
}

export interface Subscription {
  id: string;
  agent_id: string;
  source_pattern: string;
  event_types: string[];
  filter_rules: Record<string, string>;
  cron_expression: string;
  enabled: boolean;
  created_at: string;
}

export interface EventLog {
  id: string;
  source: string;
  event_type: string;
  subject: string;
  cloud_event: Record<string, unknown>;
  matched_agent_ids: string[];
  status: string;
  created_at: string;
}
