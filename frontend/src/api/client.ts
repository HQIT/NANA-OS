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
  // Models
  listModels: () => request<import("../types").LLMModel[]>("/models"),
  createModel: (data: Record<string, unknown>) =>
    request<import("../types").LLMModel>("/models", { method: "POST", body: JSON.stringify(data) }),
  updateModel: (id: string, data: Record<string, unknown>) =>
    request<import("../types").LLMModel>(`/models/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteModel: (id: string) => request<void>(`/models/${id}`, { method: "DELETE" }),

  // Agents
  listAgents: (group?: string) => {
    const q = group ? `?group=${encodeURIComponent(group)}` : "";
    return request<import("../types").Agent[]>(`/agents${q}`);
  },
  createAgent: (data: Record<string, unknown>) =>
    request<import("../types").Agent>("/agents", { method: "POST", body: JSON.stringify(data) }),
  updateAgent: (agentId: string, data: Record<string, unknown>) =>
    request<import("../types").Agent>(`/agents/${agentId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (agentId: string) =>
    request<void>(`/agents/${agentId}`, { method: "DELETE" }),

  // Subscriptions
  listSubscriptions: (agentId: string) =>
    request<import("../types").Subscription[]>(`/agents/${agentId}/subscriptions`),
  createSubscription: (agentId: string, data: Record<string, unknown>) =>
    request<import("../types").Subscription>(`/agents/${agentId}/subscriptions`, { method: "POST", body: JSON.stringify(data) }),
  updateSubscription: (agentId: string, subId: string, data: Record<string, unknown>) =>
    request<import("../types").Subscription>(`/agents/${agentId}/subscriptions/${subId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSubscription: (agentId: string, subId: string) =>
    request<void>(`/agents/${agentId}/subscriptions/${subId}`, { method: "DELETE" }),

  // Events
  listEvents: (params?: { source?: string; event_type?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.source) q.set("source", params.source);
    if (params?.event_type) q.set("event_type", params.event_type);
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<import("../types").EventLog[]>(`/events${qs ? `?${qs}` : ""}`);
  },
  getEvent: (eventId: string) => request<import("../types").EventLog>(`/events/${eventId}`),

  // Event Catalog & Manual Trigger
  getEventCatalog: () => request<import("../types").EventCatalog>("/events/catalog"),
  triggerManualEvent: (data: { event_type: string; source?: string; subject?: string; data?: Record<string, unknown> }) =>
    request<Record<string, unknown>>("/events/manual", { method: "POST", body: JSON.stringify(data) }),

  // Connectors
  listConnectors: () => request<import("../types").Connector[]>("/connectors"),
  createConnector: (data: Record<string, unknown>) =>
    request<import("../types").Connector>("/connectors", { method: "POST", body: JSON.stringify(data) }),
  updateConnector: (id: string, data: Record<string, unknown>) =>
    request<import("../types").Connector>(`/connectors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteConnector: (id: string) => request<void>(`/connectors/${id}`, { method: "DELETE" }),

  // Skills catalog
  getSkillsCatalog: () =>
    request<{ name: string; description: string; source: string }[]>("/skills/catalog"),

  // MCP Registry search
  searchMcpRegistry: (q: string, limit = 20) =>
    request<{ servers: { name: string; description: string; version: string; command: string; args: string[]; env_hints: Record<string, string>; transport: string }[]; total: number }>(`/mcp-registry/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // MCP Servers
  listMcpServers: () => request<import("../types").McpServer[]>("/mcp-servers"),
  createMcpServer: (data: Record<string, unknown>) =>
    request<import("../types").McpServer>("/mcp-servers", { method: "POST", body: JSON.stringify(data) }),
  updateMcpServer: (id: string, data: Record<string, unknown>) =>
    request<import("../types").McpServer>(`/mcp-servers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMcpServer: (id: string) => request<void>(`/mcp-servers/${id}`, { method: "DELETE" }),
};
