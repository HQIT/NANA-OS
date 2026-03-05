import { useEffect, useState } from "react";
import type { Agent } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";
import ModelSelect from "./ModelSelect";
import SubscriptionEditor from "./SubscriptionEditor";

const EMPTY: Partial<Agent> = {
  name: "", group: "", role: "agent", description: "", model: "",
  system_prompt: "", skills: [], mcp_config_path: "", workspace_path: "",
};

export default function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [subAgentId, setSubAgentId] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState("");

  const load = () => api.listAgents().then(setAgents);
  useEffect(() => { load(); }, []);

  const groups = [...new Set(agents.map((a) => a.group).filter(Boolean))];
  const filtered = filterGroup ? agents.filter((a) => a.group === filterGroup) : agents;

  const startEdit = (a?: Agent) => {
    setSubAgentId(null);
    if (a) {
      setEditId(a.id);
      setEditing({ ...a });
    } else {
      setEditId(null);
      setEditing({ ...EMPTY });
    }
  };

  const openSubscriptions = (agentId: string) => {
    setEditing(null);
    setEditId(null);
    setSubAgentId(agentId);
  };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    const data = {
      name: editing.name,
      group: editing.group || "",
      role: editing.role || "agent",
      description: editing.description || "",
      model: editing.model || "",
      system_prompt: editing.system_prompt || "",
      skills: editing.skills || [],
      mcp_config_path: editing.mcp_config_path || "",
      workspace_path: editing.workspace_path || "",
    };
    if (editId) {
      await api.updateAgent(editId, data);
    } else {
      await api.createAgent(data);
    }
    setEditing(null);
    setEditId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteAgent(id);
    load();
  };

  return (
    <div className="panel">
      {groups.length > 0 && (
        <div className="panel-toolbar">
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} style={{ fontSize: 13, maxWidth: 160 }}>
            <option value="">全部分组</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      )}

      <div className="card-grid">
        <div className="entity-card add-card" onClick={() => startEdit()}>
          <span className="add-card-icon">+</span>
          <span className="add-card-label">添加 Agent</span>
        </div>
        {filtered.map((a) => (
          <div key={a.id} className="entity-card" onClick={() => startEdit(a)}>
            <div className="entity-card-header">
              <span className="entity-card-name">{a.name}</span>
              {a.group && <span className="entity-card-tag">{a.group}</span>}
            </div>
            {a.description && <p className="entity-card-desc">{a.description}</p>}
            <div className="entity-card-meta">
              <span>{a.model || "default model"}</span>
            </div>
            <div className="entity-card-actions">
              <button className="btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openSubscriptions(a.id); }}>订阅</button>
              <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}>删除</button>
            </div>
          </div>
        ))}
      </div>

      <Drawer open={!!editing} title={editId ? "编辑 Agent" : "添加 Agent"} onClose={() => setEditing(null)}>
        {editing && (
          <div className="drawer-form">
            <label>名称 *</label>
            <input placeholder="例如：code-reviewer" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />

            <label>分组</label>
            <input placeholder="可选，如：代码审查、论文写作" value={editing.group || ""} onChange={(e) => setEditing({ ...editing, group: e.target.value })} />

            <label>模型</label>
            <ModelSelect value={editing.model || ""} onChange={(v) => setEditing({ ...editing, model: v })} emptyLabel="未指定" />

            <label>描述</label>
            <input placeholder="该 Agent 的职责说明" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />

            <label>系统提示词</label>
            <textarea placeholder="System prompt" value={editing.system_prompt || ""} onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })} rows={4} />

            <div className="drawer-actions">
              <button onClick={save}>保存</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>取消</button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={subAgentId !== null}
        title={`事件订阅 - ${agents.find((a) => a.id === subAgentId)?.name ?? ""}`}
        onClose={() => setSubAgentId(null)}
      >
        {subAgentId && <SubscriptionEditor agentId={subAgentId} />}
      </Drawer>
    </div>
  );
}
