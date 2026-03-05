export interface Team {
  id: string;
  name: string;
  description: string;
  workspace_path: string;
  default_model: string;
  created_at: string;
}

export interface Agent {
  id: string;
  team_id: string;
  name: string;
  role: "main" | "sub";
  description: string;
  model: string;
  system_prompt: string;
  skills: string[];
  mcp_config_path: string;
  created_at: string;
}

export interface Run {
  id: string;
  team_id: string;
  task_text: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled" | "queued";
  container_id?: string;
  started_at?: string;
  finished_at?: string;
  log_path?: string;
  result_path?: string;
  created_at: string;
}
