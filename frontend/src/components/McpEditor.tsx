import { useEffect, useState } from "react";
import type { McpServer } from "../types";
import { api } from "../api/client";

interface Props {
  agentId: string;
  mcpServerIds: string[];
  onSave: (ids: string[]) => Promise<void>;
}

export default function McpEditor({ agentId, mcpServerIds, onSave }: Props) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selected, setSelected] = useState<string[]>(mcpServerIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSelected(mcpServerIds); }, [agentId, mcpServerIds]);
  useEffect(() => { api.listMcpServers().then(setServers).catch(() => {}); }, []);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(selected); } finally { setSaving(false); }
  };

  return (
    <div className="sub-editor">
      {servers.length === 0 ? (
        <p className="empty-hint">暂无 MCP 服务。请前往顶部导航「MCP」页面添加。</p>
      ) : (
        <div className="skills-grid">
          {servers.map((s) => (
            <label key={s.id} className="skill-option">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
              <span className="skill-name">{s.name}</span>
              <span className="skill-desc mono">{s.command} {(s.args || []).join(" ")}</span>
            </label>
          ))}
        </div>
      )}

      <div className="drawer-actions">
        <button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</button>
      </div>
    </div>
  );
}
