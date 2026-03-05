import { useEffect, useState, useCallback } from "react";
import AgentList from "./components/AgentList";
import ModelManager from "./components/ModelManager";
import EventLogList from "./components/EventLogList";

type GlobalTab = "agents" | "models" | "events";
const VALID_TABS: GlobalTab[] = ["agents", "events", "models"];

function readHash(): { tab: GlobalTab; sub: string } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [first, ...rest] = raw.split("/");
  const tab = VALID_TABS.includes(first as GlobalTab) ? (first as GlobalTab) : "agents";
  return { tab, sub: rest.join("/") };
}

export default function App() {
  const [globalTab, setGlobalTab] = useState<GlobalTab>(() => readHash().tab);
  const [subHash, setSubHash] = useState(() => readHash().sub);

  useEffect(() => {
    const onHash = () => { const h = readHash(); setGlobalTab(h.tab); setSubHash(h.sub); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((tab: GlobalTab, sub = "") => {
    window.location.hash = sub ? `${tab}/${sub}` : tab;
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>NANA OS</h1>
        <nav className="header-nav">
          <button className={globalTab === "agents" ? "header-tab active" : "header-tab"} onClick={() => navigate("agents")}>Agents</button>
          <button className={globalTab === "events" ? "header-tab active" : "header-tab"} onClick={() => navigate("events")}>Events</button>
          <button className={globalTab === "models" ? "header-tab active" : "header-tab"} onClick={() => navigate("models")}>Models</button>
        </nav>
      </header>

      <div className="main-content" style={{ height: "calc(100vh - 57px)" }}>
        {globalTab === "agents" && <AgentList />}
        {globalTab === "events" && <EventLogList subTab={subHash === "logs" ? "logs" : "catalog"} onSubTabChange={(s: string) => navigate("events", s)} />}
        {globalTab === "models" && <ModelManager />}
      </div>
    </div>
  );
}
