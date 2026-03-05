import { useEffect, useState } from "react";
import type { LLMModel } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";

const genId = () => crypto.randomUUID().slice(0, 8);

const EMPTY: Partial<LLMModel> = { name: "", provider: "openai", model: "", base_url: "", api_key: "", display_name: "", description: "" };

export default function ModelManager() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [editing, setEditing] = useState<Partial<LLMModel> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const load = () => api.listModels().then(setModels);
  useEffect(() => { load(); }, []);

  const startEdit = (m?: LLMModel) => {
    if (m) { setEditId(m.id); setEditing({ ...m }); }
    else { setEditId(null); setEditing({ ...EMPTY, name: genId() }); }
  };

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.model?.trim() || !editing?.base_url?.trim()) return;
    const data = {
      name: editing.name, provider: editing.provider || "openai",
      model: editing.model, base_url: editing.base_url,
      api_key: editing.api_key || "", display_name: editing.display_name || "",
      description: editing.description || "",
      context_length: editing.context_length || null,
    };
    if (editId) await api.updateModel(editId, data);
    else await api.createModel(data);
    setEditing(null);
    setEditId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteModel(id);
    load();
  };

  return (
    <div className="panel">
      <div className="card-grid">
        <div className="entity-card add-card" onClick={() => startEdit()}>
          <span className="add-card-icon">+</span>
          <span className="add-card-label">添加模型</span>
        </div>
        {models.map((m) => (
          <div key={m.id} className="entity-card" onClick={() => startEdit(m)}>
            <div className="entity-card-header">
              <span className="entity-card-name">{m.display_name || m.name}</span>
              <span className="entity-card-tag">{m.provider}</span>
            </div>
            {m.description && <p className="entity-card-desc">{m.description}</p>}
            <div className="entity-card-meta">
              <span>{m.model}</span>
              {m.context_length && <span>{m.context_length.toLocaleString()} tokens</span>}
            </div>
            <div className="entity-card-actions">
              <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>删除</button>
            </div>
          </div>
        ))}
      </div>

      <Drawer open={!!editing} title={editId ? "编辑模型" : "添加模型"} onClose={() => setEditing(null)}>
        {editing && (
          <div className="drawer-form">
            <label>名称（ID）*</label>
            <input placeholder="唯一标识，如 gpt-4o" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />

            <label>显示名称</label>
            <input placeholder="可选，如 GPT-4o" value={editing.display_name || ""} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />

            <label>描述</label>
            <textarea placeholder="模型用途说明（可选）" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />

            <label>API 协议</label>
            <select value={editing.provider || "openai"} onChange={(e) => setEditing({ ...editing, provider: e.target.value })}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>

            <label>模型名 *</label>
            <input placeholder="实际模型名，如 gpt-4o" value={editing.model || ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })} />

            <label>API Base URL *</label>
            <input placeholder="https://api.openai.com/v1" value={editing.base_url || ""} onChange={(e) => setEditing({ ...editing, base_url: e.target.value })} />

            <label>API Key</label>
            <input type="password" placeholder="sk-..." value={editing.api_key || ""} onChange={(e) => setEditing({ ...editing, api_key: e.target.value })} />

            <label>上下文长度</label>
            <input type="number" placeholder="128000" value={editing.context_length ?? ""} onChange={(e) => setEditing({ ...editing, context_length: e.target.value ? Number(e.target.value) : undefined })} />

            <div className="drawer-actions">
              <button onClick={save}>保存</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>取消</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
