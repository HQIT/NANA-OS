import { useEffect, useState } from "react";
import type { Team } from "../types";
import { api } from "../api/client";

interface Props {
  onSelect: (team: Team) => void;
  selected?: Team;
}

export default function TeamList({ onSelect, selected }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");

  const load = () => api.listTeams().then(setTeams);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await api.createTeam({ name: name.trim(), default_model: model.trim() });
    setName("");
    setModel("");
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteTeam(id);
    load();
  };

  return (
    <div className="panel">
      <h2>Teams</h2>
      <div className="form-row">
        <input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Default model" value={model} onChange={(e) => setModel(e.target.value)} />
        <button onClick={handleCreate}>Create</button>
      </div>
      <ul className="item-list">
        {teams.map((t) => (
          <li key={t.id} className={selected?.id === t.id ? "active" : ""}>
            <span className="item-name" onClick={() => onSelect(t)}>{t.name}</span>
            <span className="item-meta">{t.default_model || "no model"}</span>
            <button className="btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
