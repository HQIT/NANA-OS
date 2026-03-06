import { useEffect, useState } from "react";
import type { EventLog, EventCatalog, EventCatalogType } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";

const STATUS_COLORS: Record<string, string> = {
  received: "var(--color-muted)",
  dispatched: "var(--color-success)",
  failed: "var(--color-danger)",
};

type SubTab = "logs" | "catalog";

export default function EventLogList({ subTab, onSubTabChange }: { subTab: SubTab; onSubTabChange: (t: SubTab) => void }) {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<EventCatalog | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<EventCatalogType | null>(null);
  const [triggerSource, setTriggerSource] = useState("manual/test");
  const [triggerSubject, setTriggerSubject] = useState("");
  const [triggerData, setTriggerData] = useState("{}");
  const [triggerLoading, setTriggerLoading] = useState(false);

  const loadLogs = () => {
    api.listEvents({
      source: sourceFilter || undefined,
      status: statusFilter || undefined,
      limit: 50,
    }).then(setEvents);
  };

  const loadCatalog = () => {
    api.getEventCatalog().then(setCatalog);
  };

  useEffect(() => { loadLogs(); }, [sourceFilter, statusFilter]);
  useEffect(() => { loadCatalog(); }, []);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  };

  const openTrigger = (et: EventCatalogType) => {
    setTriggerType(et);
    setTriggerSource("manual/test");
    setTriggerSubject("");
    setTriggerData("{}");
  };

  const doTrigger = async () => {
    if (!triggerType) return;
    setTriggerLoading(true);
    try {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(triggerData); } catch { /* keep empty */ }
      await api.triggerManualEvent({
        event_type: triggerType.type,
        source: triggerSource,
        subject: triggerSubject,
        data: parsed,
      });
      setTriggerType(null);
      loadLogs();
      onSubTabChange("logs");
    } finally {
      setTriggerLoading(false);
    }
  };

  const configuredCategories = catalog
    ? new Set(catalog.sources.filter((s) => catalog.connector_status?.[s.id] !== false).map((s) => s.id))
    : new Set<string>();
  const filteredTypes = catalog
    ? catalog.event_types.filter((et) => configuredCategories.has(et.category) && (!filterCategory || et.category === filterCategory))
    : [];
  const grouped = Object.entries(
    filteredTypes.reduce<Record<string, EventCatalogType[]>>((acc, et) => {
      (acc[et.category] ??= []).push(et);
      return acc;
    }, {}),
  );

  return (
    <div className="panel">
      <div className="tabs">
        <button className={`tab ${subTab === "logs" ? "active" : ""}`} onClick={() => onSubTabChange("logs")}>
          事件日志
        </button>
        <button className={`tab ${subTab === "catalog" ? "active" : ""}`} onClick={() => onSubTabChange("catalog")}>
          事件目录
        </button>
      </div>

      {subTab === "logs" && (
        <>
          <div className="event-filters">
            <input
              placeholder="按来源过滤 (如 github)"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">全部状态</option>
              <option value="received">received</option>
              <option value="dispatched">dispatched</option>
              <option value="failed">failed</option>
            </select>
            <button className="btn-sm btn-secondary" onClick={loadLogs}>刷新</button>
          </div>

          <div className="webhook-hint">
            Webhook URL: <code>POST /api/events/webhook/&#123;source&#125;</code>
            &nbsp; 支持 GitHub / GitLab / Gitea
          </div>

          {events.length === 0 ? (
            <p className="empty-hint">暂无事件记录</p>
          ) : (
            <ul className="item-list">
              {events.map((ev) => (
                <li key={ev.id} className="event-item">
                  <div className="event-row" onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}>
                    <span className="event-time">{fmtTime(ev.created_at)}</span>
                    <span className="event-source">{ev.source}</span>
                    <span className="event-type-badge">{ev.event_type}</span>
                    <span className="event-match">{ev.matched_agent_ids.length} 匹配</span>
                    <span
                      className="event-status"
                      style={{ color: STATUS_COLORS[ev.status] || "var(--text-secondary)" }}
                    >
                      {ev.status}
                    </span>
                  </div>
                  {expanded === ev.id && (
                    <div className="event-detail">
                      <div className="event-detail-row">
                        <strong>Subject:</strong> {ev.subject || "-"}
                      </div>
                      <div className="event-detail-row">
                        <strong>匹配 Agent:</strong>{" "}
                        {ev.matched_agent_ids.length > 0 ? ev.matched_agent_ids.join(", ") : "无匹配"}
                      </div>
                      <details>
                        <summary>CloudEvent 详情</summary>
                        <pre className="log-box">{JSON.stringify(ev.cloud_event, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {subTab === "catalog" && (
        <div className="catalog-view">
          {catalog && (
            <>
              <div className="catalog-sources">
                <h3 className="catalog-section-title">事件源</h3>
                <div className="catalog-source-grid">
                  {catalog.sources
                    .filter((s) => catalog.connector_status?.[s.id] !== false)
                    .map((s) => (
                      <div
                        key={s.id}
                        className={`catalog-source-card ${filterCategory === s.id ? "catalog-source-active" : ""}`}
                        onClick={() => setFilterCategory(filterCategory === s.id ? null : s.id)}
                      >
                        <span className="catalog-source-name">{s.name}</span>
                        <span className="catalog-source-desc">{s.description}</span>
                      </div>
                    ))}
                </div>
              </div>

              <h3 className="catalog-section-title" style={{ marginTop: 20 }}>
                事件类型
                {filterCategory && (
                  <button className="btn-sm btn-secondary" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => setFilterCategory(null)}>
                    清除过滤
                  </button>
                )}
              </h3>
              {grouped.map(([category, types]) => (
                <div key={category} className="catalog-category">
                  <h4 className="catalog-category-title">{category}</h4>
                  <div className="catalog-type-list">
                    {types.map((et) => (
                      <div key={et.type} className="catalog-type-row">
                        <span className="event-type-badge">{et.type}</span>
                        <span className="catalog-type-desc">{et.description}</span>
                        <button
                          className="btn-sm"
                          onClick={() => openTrigger(et)}
                        >
                          触发
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <Drawer
        open={triggerType !== null}
        title={`手动触发 - ${triggerType?.type ?? ""}`}
        onClose={() => setTriggerType(null)}
      >
        {triggerType && (
          <div className="drawer-form">
            <label>事件类型</label>
            <input value={triggerType.type} disabled />

            <label>来源 (source)</label>
            <input
              placeholder="manual/test"
              value={triggerSource}
              onChange={(e) => setTriggerSource(e.target.value)}
            />

            <label>主题 (subject)</label>
            <input
              placeholder="如 refs/heads/main"
              value={triggerSubject}
              onChange={(e) => setTriggerSubject(e.target.value)}
            />

            <label>数据 (JSON)</label>
            <textarea
              rows={6}
              value={triggerData}
              onChange={(e) => setTriggerData(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: 13 }}
            />

            <div className="drawer-actions">
              <button onClick={doTrigger} disabled={triggerLoading}>
                {triggerLoading ? "发送中..." : "触发事件"}
              </button>
              <button className="btn-secondary" onClick={() => setTriggerType(null)}>取消</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
