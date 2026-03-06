import { useEffect, useState } from "react";
import { api } from "../api/client";

interface SkillCatalogItem {
  name: string;
  description: string;
  source: string;
}

interface Props {
  agentId: string;
  skills: string[];
  onSave: (skills: string[]) => Promise<void>;
}

export default function SkillsEditor({ agentId, skills, onSave }: Props) {
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([]);
  const [selected, setSelected] = useState<string[]>(skills);

  const [saving, setSaving] = useState(false);

  useEffect(() => { setSelected(skills); }, [agentId, skills]);
  useEffect(() => { api.getSkillsCatalog().then(setCatalog).catch(() => {}); }, []);

  const toggle = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(selected); } finally { setSaving(false); }
  };

  const builtin = catalog.filter((s) => s.source === "builtin");
  const custom = catalog.filter((s) => s.source === "custom");
  const extraSelected = selected.filter((s) => !catalog.some((c) => c.name === s));

  return (
    <div className="sub-editor">
      {builtin.length > 0 && (
        <>
          <h4 className="catalog-section-title">内建 Skills</h4>
          <div className="skills-grid">
            {builtin.map((s) => (
              <label key={s.name} className="skill-option">
                <input type="checkbox" checked={selected.includes(s.name)} onChange={() => toggle(s.name)} />
                <span className="skill-name">{s.name}</span>
                <span className="skill-desc">{s.description}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {custom.length > 0 && (
        <>
          <h4 className="catalog-section-title" style={{ marginTop: 16 }}>自定义 Skills</h4>
          <div className="skills-grid">
            {custom.map((s) => (
              <label key={s.name} className="skill-option">
                <input type="checkbox" checked={selected.includes(s.name)} onChange={() => toggle(s.name)} />
                <span className="skill-name">{s.name}</span>
                <span className="skill-desc">{s.description}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {extraSelected.length > 0 && (
        <>
          <h4 className="catalog-section-title" style={{ marginTop: 16 }}>已选（手动添加）</h4>
          <div className="skills-grid">
            {extraSelected.map((name) => (
              <label key={name} className="skill-option">
                <input type="checkbox" checked onChange={() => toggle(name)} />
                <span className="skill-name">{name}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="drawer-actions">
        <button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</button>
      </div>
    </div>
  );
}
