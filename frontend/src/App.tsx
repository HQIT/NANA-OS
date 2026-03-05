import { useState } from "react";
import type { Team } from "./types";
import TeamList from "./components/TeamList";
import AgentList from "./components/AgentList";
import RunPanel from "./components/RunPanel";

type Tab = "agents" | "runs";

export default function App() {
  const [selectedTeam, setSelectedTeam] = useState<Team | undefined>();
  const [tab, setTab] = useState<Tab>("agents");

  return (
    <div className="app">
      <header className="app-header">
        <h1>NANA-OS</h1>
        <span className="subtitle">Agent Teams Management</span>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <TeamList onSelect={setSelectedTeam} selected={selectedTeam} />
        </aside>
        <main className="main-content">
          {selectedTeam ? (
            <>
              <nav className="tabs">
                <button className={tab === "agents" ? "tab active" : "tab"} onClick={() => setTab("agents")}>Agents</button>
                <button className={tab === "runs" ? "tab active" : "tab"} onClick={() => setTab("runs")}>Runs</button>
              </nav>
              {tab === "agents" && <AgentList team={selectedTeam} />}
              {tab === "runs" && <RunPanel team={selectedTeam} />}
            </>
          ) : (
            <div className="placeholder">Select a team to get started</div>
          )}
        </main>
      </div>
    </div>
  );
}
