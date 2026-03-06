import { useEffect, useState } from "react";
import type { Agent } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";
import ModelSelect from "./ModelSelect";
import SubscriptionEditor from "./SubscriptionEditor";
import SkillsEditor from "./SkillsEditor";
import McpEditor from "./McpEditor";

const EMPTY: Partial<Agent> = {
  name: "", group: "", role: "agent", description: "", model: "",
  system_prompt: "", skills: [], mcp_config_path: "", mcp_server_ids: [], workspace_path: "",
};

type DrawerMode = "edit" | "subscriptions" | "skills" | "mcp";

export default function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null);
  const [targetAgentId, setTargetAgentId] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grid');

  const load = () => api.listAgents().then(setAgents);
  useEffect(() => { load(); }, []);

  const groups = [...new Set(agents.map((a) => a.group).filter(Boolean))];
  const filtered = filterGroup ? agents.filter((a) => a.group === filterGroup) : agents;
  
  // 按分组组织 Agent
  const grouped = agents.reduce<Record<string, Agent[]>>((acc, agent) => {
    const group = agent.group || '未分组';
    (acc[group] ||= []).push(agent);
    return acc;
  }, {});

  const closeAll = () => {
    setEditing(null);
    setEditId(null);
    setDrawerMode(null);
    setTargetAgentId(null);
  };

  const startEdit = (a?: Agent) => {
    closeAll();
    if (a) {
      setEditId(a.id);
      setEditing({ ...a });
    } else {
      setEditId(null);
      setEditing({ ...EMPTY });
    }
    setDrawerMode("edit");
  };

  const openDrawer = (agentId: string, mode: DrawerMode) => {
    closeAll();
    setTargetAgentId(agentId);
    setDrawerMode(mode);
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
      mcp_server_ids: editing.mcp_server_ids || [],
      workspace_path: editing.workspace_path || "",
    };
    if (editId) {
      await api.updateAgent(editId, data);
    } else {
      await api.createAgent(data);
    }
    closeAll();
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteAgent(id);
    load();
  };

  const saveSkills = async (skills: string[]) => {
    if (!targetAgentId) return;
    await api.updateAgent(targetAgentId, { skills });
    load();
  };

  const saveMcp = async (ids: string[]) => {
    if (!targetAgentId) return;
    await api.updateAgent(targetAgentId, { mcp_server_ids: ids });
    load();
  };

  const targetAgent = agents.find((a) => a.id === targetAgentId);
  
  const renderAgentCard = (a: Agent) => (
    <div key={a.id} className="entity-card" onClick={() => startEdit(a)}>
      <div className="entity-card-header">
        <span className="entity-card-name">{a.name}</span>
        {a.group && <span className="entity-card-tag">{a.group}</span>}
      </div>
      {a.description && <p className="entity-card-desc">{a.description}</p>}
      <div className="entity-card-meta">
        <span>{a.model || "default model"}</span>
        {(a.skills?.length || 0) > 0 && <span>Skills: {a.skills!.length}</span>}
        {(a.mcp_server_ids?.length || 0) > 0 && <span>MCP: {a.mcp_server_ids!.length}</span>}
      </div>
      <div className="entity-card-actions">
        <button className="btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openDrawer(a.id, "subscriptions"); }}>订阅</button>
        <button className="btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openDrawer(a.id, "skills"); }}>Skills</button>
        <button className="btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openDrawer(a.id, "mcp"); }}>MCP</button>
        <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}>删除</button>
      </div>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-toolbar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {groups.length > 0 && (
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} style={{ fontSize: 13, maxWidth: 160 }}>
            <option value="">全部分组</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <select value={viewMode} onChange={(e) => setViewMode(e.target.value as any)} style={{ fontSize: 13, maxWidth: 120 }}>
          <option value="grid">网格视图</option>
          <option value="grouped">分组视图</option>
        </select>
      </div>

      {viewMode === 'grid' && (
        <div className="card-grid">
          <div className="entity-card add-card" onClick={() => startEdit()}>
            <span className="add-card-icon">+</span>
            <span className="add-card-label">添加 Agent</span>
          </div>
          {filtered.map(renderAgentCard)}
        </div>
      )}

      {viewMode === 'grouped' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(grouped).map(([groupName, groupAgents]) => (
            <div key={groupName}>
              <h3 style={{ 
                fontSize: '14px', 
                fontWeight: 600, 
                marginBottom: '12px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {groupName}
                <span style={{ fontSize: '12px', opacity: 0.7 }}>({groupAgents.length})</span>
              </h3>
              <div className="card-grid">
                <div className="entity-card add-card" onClick={() => startEdit()}>
                  <span className="add-card-icon">+</span>
                  <span className="add-card-label">添加 Agent</span>
                </div>
                {groupAgents.map(renderAgentCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 基础信息 Drawer */}
      <Drawer open={drawerMode === "edit"} title={editId ? "编辑 Agent" : "添加 Agent"} onClose={closeAll}>
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
              <button className="btn-secondary" onClick={closeAll}>取消</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* 事件订阅 Drawer */}
      <Drawer
        open={drawerMode === "subscriptions" && !!targetAgentId}
        title={`事件订阅 - ${targetAgent?.name ?? ""}`}
        onClose={closeAll}
      >
        {drawerMode === "subscriptions" && targetAgentId && <SubscriptionEditor agentId={targetAgentId} />}
      </Drawer>

      {/* Skills Drawer */}
      <Drawer
        open={drawerMode === "skills" && !!targetAgentId}
        title={`Skills - ${targetAgent?.name ?? ""}`}
        onClose={closeAll}
      >
        {drawerMode === "skills" && targetAgent && (
          <SkillsEditor agentId={targetAgent.id} skills={targetAgent.skills || []} onSave={saveSkills} />
        )}
      </Drawer>

      {/* MCP Drawer */}
      <Drawer
        open={drawerMode === "mcp" && !!targetAgentId}
        title={`MCP 服务 - ${targetAgent?.name ?? ""}`}
        onClose={closeAll}
      >
        {drawerMode === "mcp" && targetAgent && (
          <McpEditor agentId={targetAgent.id} mcpServerIds={targetAgent.mcp_server_ids || []} onSave={saveMcp} />
        )}
      </Drawer>
    </div>
  );
}
