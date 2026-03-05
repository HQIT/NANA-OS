import { useEffect, useState } from "react";
import type { Agent, Team } from "../types";
import { api } from "../api/client";

interface Props {
  team: Team;
}

const EMPTY: Partial<Agent> = { name: "", role: "sub", description: "", model: "", system_prompt: "", skills: [], mcp_config_path: "" };

export default function AgentList({ team }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const load = () => api.listAgents(team.id).then(setAgents);
  useEffect(() => { load(); }, [team.id]);

  const startEdit = (a?: Agent) => {
    if (a) {
      setEditId(a.id);
      setEditing({ ...a });
    } else {
      setEditId(null);
      setEditing({ ...EMPTY });
    }
  };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    const data = {
      name: editing.name,
      role: editing.role || "sub",
      description: editing.description || "",
      model: editing.model || "",
      system_prompt: editing.system_prompt || "",
      skills: editing.skills || [],
      mcp_config_path: editing.mcp_config_path || "",
    };
    if (editId) {
      await api.updateAgent(team.id, editId, data);
    } else {
      await api.createAgent(team.id, data);
    }
    setEditing(null);
    setEditId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteAgent(team.id, id);
    load();
  };

  return (
    <div className="panel">
      <h2>Agents - {team.name}</h2>
      <button onClick={() => startEdit()}>+ Add Agent</button>

      {editing && (
        <div className="edit-form">
          <input placeholder="Name" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <select value={editing.role || "sub"} onChange={(e) => setEditing({ ...editing, role: e.target.value as "main" | "sub" })}>
            <option value="main">Main</option>
            <option value="sub">Sub</option>
          </select>
          <input placeholder="Model" value={editing.model || ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })} />
          <input placeholder="Description" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <textarea placeholder="System prompt" value={editing.system_prompt || ""} onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })} rows={3} />
          <div className="form-row">
            <button onClick={save}>Save</button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <ul className="item-list">
        {agents.map((a) => (
          <li key={a.id}>
            <span className={`role-badge role-${a.role}`}>{a.role}</span>
            <span className="item-name" onClick={() => startEdit(a)}>{a.name}</span>
            <span className="item-meta">{a.model || "default"}</span>
            <button className="btn-sm btn-danger" onClick={() => handleDelete(a.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
