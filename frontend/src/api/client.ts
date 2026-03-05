const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Teams
  listTeams: () => request<import("../types").Team[]>("/teams"),
  createTeam: (data: { name: string; description?: string; default_model?: string }) =>
    request<import("../types").Team>("/teams", { method: "POST", body: JSON.stringify(data) }),
  getTeam: (id: string) => request<import("../types").Team>(`/teams/${id}`),
  updateTeam: (id: string, data: Record<string, unknown>) =>
    request<import("../types").Team>(`/teams/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTeam: (id: string) => request<void>(`/teams/${id}`, { method: "DELETE" }),

  // Agents
  listAgents: (teamId: string) => request<import("../types").Agent[]>(`/teams/${teamId}/agents`),
  createAgent: (teamId: string, data: Record<string, unknown>) =>
    request<import("../types").Agent>(`/teams/${teamId}/agents`, { method: "POST", body: JSON.stringify(data) }),
  updateAgent: (teamId: string, agentId: string, data: Record<string, unknown>) =>
    request<import("../types").Agent>(`/teams/${teamId}/agents/${agentId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (teamId: string, agentId: string) =>
    request<void>(`/teams/${teamId}/agents/${agentId}`, { method: "DELETE" }),

  // Runs
  createRun: (teamId: string, data: { task: string; model?: string; temperature?: number }) =>
    request<import("../types").Run>(`/teams/${teamId}/run`, { method: "POST", body: JSON.stringify(data) }),
  listRuns: (teamId?: string) =>
    request<import("../types").Run[]>(`/runs${teamId ? `?team_id=${teamId}` : ""}`),
  getRun: (runId: string) => request<import("../types").Run>(`/runs/${runId}`),
  getRunLog: (runId: string) => request<{ content: string }>(`/runs/${runId}/log`),
  getRunResult: (runId: string) => request<{ content: string }>(`/runs/${runId}/result`),
  stopRun: (runId: string) => request<{ stopped: boolean }>(`/runs/${runId}/stop`, { method: "POST" }),
};
