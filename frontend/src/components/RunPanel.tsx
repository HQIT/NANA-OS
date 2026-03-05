import { useEffect, useState } from "react";
import type { Run, Team } from "../types";
import { api } from "../api/client";

interface Props {
  team: Team;
}

export default function RunPanel({ team }: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [task, setTask] = useState("");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [logContent, setLogContent] = useState("");
  const [resultContent, setResultContent] = useState("");

  const load = () => api.listRuns(team.id).then(setRuns);
  useEffect(() => { load(); }, [team.id]);

  const handleRun = async () => {
    if (!task.trim()) return;
    await api.createRun(team.id, { task: task.trim() });
    setTask("");
    load();
  };

  const viewRun = async (r: Run) => {
    setSelectedRun(r);
    const [log, result] = await Promise.all([api.getRunLog(r.id), api.getRunResult(r.id)]);
    setLogContent(log.content);
    setResultContent(result.content);
  };

  const handleStop = async (r: Run) => {
    await api.stopRun(r.id);
    load();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "running": return "var(--color-info)";
      case "success": return "var(--color-success)";
      case "failed": return "var(--color-danger)";
      case "cancelled": return "var(--color-warning)";
      default: return "var(--color-muted)";
    }
  };

  return (
    <div className="panel">
      <h2>Runs - {team.name}</h2>
      <div className="form-row">
        <input className="flex-1" placeholder="Task description..." value={task} onChange={(e) => setTask(e.target.value)} />
        <button onClick={handleRun}>Run</button>
        <button className="btn-secondary" onClick={load}>Refresh</button>
      </div>

      <ul className="item-list">
        {runs.map((r) => (
          <li key={r.id}>
            <span className="status-dot" style={{ background: statusColor(r.status) }} />
            <span className="item-name" onClick={() => viewRun(r)}>
              {r.task_text.length > 60 ? r.task_text.slice(0, 60) + "..." : r.task_text}
            </span>
            <span className="item-meta">{r.status}</span>
            {r.status === "running" && <button className="btn-sm btn-danger" onClick={() => handleStop(r)}>Stop</button>}
          </li>
        ))}
      </ul>

      {selectedRun && (
        <div className="run-detail">
          <h3>Run {selectedRun.id}</h3>
          <p>Status: <strong style={{ color: statusColor(selectedRun.status) }}>{selectedRun.status}</strong></p>
          <p>Task: {selectedRun.task_text}</p>
          {logContent && (
            <details open>
              <summary>Log</summary>
              <pre className="log-box">{logContent}</pre>
            </details>
          )}
          {resultContent && (
            <details open>
              <summary>Result</summary>
              <pre className="log-box">{resultContent}</pre>
            </details>
          )}
          <button className="btn-secondary" onClick={() => setSelectedRun(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
