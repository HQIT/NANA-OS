import { useEffect, useState } from "react";
import type { McpServer } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";

interface RegistryServer {
  name: string;
  description: string;
  version: string;
  command: string;
  args: string[];
  env_hints: Record<string, string>;
  transport: string;
}

export default function McpServersPage() {
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpEdit, setMcpEdit] = useState<Partial<McpServer> | null>(null);
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string; hint?: string }[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RegistryServer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  const load = () => api.listMcpServers().then(setMcpServers);
  useEffect(() => { load(); }, []);

  const envToList = (env: Record<string, string>) =>
    Object.entries(env || {}).map(([key, value]) => ({ key, value, hint: "" }));
  const listToEnv = (pairs: { key: string; value: string }[]) =>
    Object.fromEntries(pairs.filter((p) => p.key.trim()).map((p) => [p.key, p.value]));

  const openEdit = (s?: McpServer) => {
    if (s) {
      setMcpEdit({ ...s });
      setEnvPairs(envToList(s.env || {}));
    } else {
      setMcpEdit({ name: "", command: "", args: [], env: {} });
      setEnvPairs([]);
    }
  };

  const save = async () => {
    if (!mcpEdit?.name?.trim() || !mcpEdit?.command?.trim()) return;
    const payload = {
      name: mcpEdit.name,
      command: mcpEdit.command,
      args: mcpEdit.args ?? [],
      env: listToEnv(envPairs),
    };
    if (mcpEdit.id) await api.updateMcpServer(mcpEdit.id, payload);
    else await api.createMcpServer(payload);
    setMcpEdit(null);
    load();
  };

  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchDone(false);
    try {
      const res = await api.searchMcpRegistry(searchQuery.trim(), 20);
      setSearchResults(res.servers);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  };

  const addFromRegistry = (srv: RegistryServer) => {
    const hints = srv.env_hints || {};
    setMcpEdit({
      name: srv.name.split("/").pop() || srv.name,
      command: srv.command,
      args: srv.args || [],
      env: Object.fromEntries(Object.entries(hints).map(([k]) => [k, ""])),
    });
    setEnvPairs(Object.entries(hints).map(([key, desc]) => ({ key, value: "", hint: desc })));
  };

  const updateArg = (idx: number, val: string) => {
    setMcpEdit((prev) => {
      if (!prev) return prev;
      const args = [...(prev.args || [])];
      args[idx] = val;
      return { ...prev, args };
    });
  };
  const removeArg = (idx: number) => {
    setMcpEdit((prev) => {
      if (!prev) return prev;
      return { ...prev, args: (prev.args || []).filter((_, i) => i !== idx) };
    });
  };
  const addArg = () => {
    setMcpEdit((prev) => prev ? { ...prev, args: [...(prev.args || []), ""] } : prev);
  };

  const updateEnvPair = (idx: number, field: "key" | "value", val: string) => {
    setEnvPairs((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  };
  const removeEnvPair = (idx: number) => {
    setEnvPairs((prev) => prev.filter((_, i) => i !== idx));
  };
  const addEnvPair = () => {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  };

  return (
    <div className="panel">
      <p className="text-muted" style={{ marginBottom: 12 }}>
        MCP servers provide tools for Agents (e.g. filesystem, API, email), separate from event sources.
      </p>

      {/* Registry Search */}
      <div className="registry-search">
        <h4 className="catalog-section-title">Search MCP Registry</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            style={{ flex: 1 }}
            placeholder="Search MCP servers, e.g. filesystem, github, slack ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          />
          <button className="btn-sm" onClick={doSearch} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="registry-results">
            {searchResults.map((srv) => {
              const hasCmd = !!srv.command;
              return (
                <div key={srv.name + srv.version} className="registry-result-item">
                  <div className="registry-result-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="registry-result-name">{srv.name}</span>
                      <span className={`transport-badge ${hasCmd ? "transport-stdio" : "transport-remote"}`}>
                        {srv.transport || "stdio"}
                      </span>
                      {srv.version && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>v{srv.version}</span>}
                    </div>
                    <span className="registry-result-desc">{srv.description}</span>
                    {hasCmd && <span className="registry-result-cmd">{srv.command} {srv.args.join(" ")}</span>}
                  </div>
                  {hasCmd ? (
                    <button className="btn-sm" onClick={() => addFromRegistry(srv)}>Add</button>
                  ) : (
                    <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>Remote only</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {searchDone && searchResults.length === 0 && (
          <p className="text-muted">No matching MCP servers found</p>
        )}
      </div>

      {/* 已添加列表 */}
      <h4 className="catalog-section-title" style={{ marginTop: 20 }}>Configured MCP Servers</h4>
      <div className="card-grid">
        {mcpServers.map((s) => (
          <div key={s.id} className="entity-card">
            <div className="entity-card-header">
              <span className="entity-card-name">{s.name}</span>
            </div>
            <div className="entity-card-meta">
              <span className="mono">{s.command} {(s.args || []).join(" ")}</span>
            </div>
            <div className="entity-card-actions">
              <button className="btn-sm btn-secondary" onClick={() => openEdit(s)}>Edit</button>
              <button className="btn-sm btn-danger" onClick={async () => { await api.deleteMcpServer(s.id); load(); }}>Delete</button>
            </div>
          </div>
        ))}
        <div className="entity-card add-card" onClick={() => openEdit()}>
          <span className="add-card-icon">+</span>
          <span className="add-card-label">Add MCP Server</span>
        </div>
      </div>

      <Drawer open={!!mcpEdit} title={mcpEdit?.id ? "Edit MCP Server" : "Add MCP Server"} onClose={() => setMcpEdit(null)}>
        {mcpEdit && (
          <div className="drawer-form">
            <label>Name</label>
            <input value={mcpEdit.name || ""} onChange={(e) => setMcpEdit({ ...mcpEdit, name: e.target.value })} placeholder="e.g. filesystem" />

            <label>Command</label>
            <input value={mcpEdit.command || ""} onChange={(e) => setMcpEdit({ ...mcpEdit, command: e.target.value })} placeholder="npx / uvx / docker" />

            <label>Args</label>
            {(mcpEdit.args || []).map((arg, i) => (
              <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <input style={{ flex: 1 }} value={arg} onChange={(e) => updateArg(i, e.target.value)} placeholder={`arg ${i + 1}`} />
                <button className="btn-sm btn-danger" onClick={() => removeArg(i)}>x</button>
              </div>
            ))}
            <button className="btn-sm btn-secondary" onClick={addArg} style={{ marginBottom: 8 }}>+ Add Arg</button>

            <label>Env</label>
            {envPairs.map((p, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <input style={{ flex: 1 }} value={p.key} onChange={(e) => updateEnvPair(i, "key", e.target.value)} placeholder="KEY" />
                  <input style={{ flex: 1 }} value={p.value} onChange={(e) => updateEnvPair(i, "value", e.target.value)} placeholder={p.hint || "VALUE"} />
                  <button className="btn-sm btn-danger" onClick={() => removeEnvPair(i)}>x</button>
                </div>
                {p.hint && !p.value && <span style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 4 }}>{p.hint}</span>}
              </div>
            ))}
            <button className="btn-sm btn-secondary" onClick={addEnvPair} style={{ marginBottom: 8 }}>+ Add Env</button>

            <div className="drawer-actions">
              <button onClick={save}>保存</button>
              <button className="btn-secondary" onClick={() => setMcpEdit(null)}>取消</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
