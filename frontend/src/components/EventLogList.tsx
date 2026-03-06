import { useEffect, useState, useCallback } from "react";
import type { EventLog, EventCatalog, EventCatalogType } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";

const STATUS_COLORS: Record<string, string> = {
  received: "var(--color-muted)",
  dispatching: "var(--color-warning)",
  dispatched: "var(--color-success)",
  failed: "var(--color-warning)",
  dead_letter: "var(--color-danger)",
};

type SubTab = "logs" | "catalog";

export default function EventLogList({ subTab, onSubTabChange }: { subTab: SubTab; onSubTabChange: (t: SubTab) => void }) {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [catalog, setCatalog] = useState<EventCatalog | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<EventCatalogType | null>(null);
  const [triggerSource, setTriggerSource] = useState("manual/test");
  const [triggerSubject, setTriggerSubject] = useState("");
  const [triggerData, setTriggerData] = useState("{}");
  const [triggerLoading, setTriggerLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listEvents({
        source: sourceFilter || undefined,
        status: statusFilter || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setEvents(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, statusFilter, page]);

  const loadCatalog = () => {
    api.getEventCatalog().then(setCatalog);
  };

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadCatalog(); }, []);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && subTab === "logs") {
      const interval = setInterval(loadLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, subTab, loadLogs]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  };

  const handleRetry = async (eventId: string) => {
    if (!confirm('确认手动重试此事件？')) return;
    try {
      await api.retryEvent(eventId);
      alert('已重新加入重试队列');
      loadLogs();
    } catch (err: any) {
      alert('重试失败: ' + (err.message || '未知错误'));
    }
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

  const totalPages = Math.ceil(total / pageSize);

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
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
            />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">全部状态</option>
              <option value="received">received</option>
              <option value="dispatching">dispatching</option>
              <option value="dispatched">dispatched</option>
              <option value="failed">failed</option>
              <option value="dead_letter">dead_letter</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>自动刷新</span>
            </label>
            <button className="btn-sm btn-secondary" onClick={loadLogs} disabled={loading}>
              {loading ? '加载中...' : '刷新'}
            </button>
          </div>

          <div className="webhook-hint">
            Webhook URL: <code>POST /api/events/webhook/&#123;source&#125;</code>
            &nbsp; 支持 GitHub / GitLab / Gitea
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
              <div className="spinner"></div>
              <span>加载中...</span>
            </div>
          )}

          {!loading && events.length === 0 && (
            <p className="empty-hint">暂无事件记录</p>
          )}

          {!loading && events.length > 0 && (
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
                      {ev.status === 'failed' && ev.retry_count !== undefined && ` (${ev.retry_count}/${ev.max_retries})`}
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
                      
                      {ev.status === 'failed' && (
                        <div style={{ background: '#fff3cd', padding: '8px', borderRadius: '4px', marginTop: '8px' }}>
                          <div><strong>状态:</strong> 投递失败，等待重试</div>
                          <div><strong>重试:</strong> {ev.retry_count || 0} / {ev.max_retries || 3}</div>
                          {ev.next_retry_at && (
                            <div><strong>下次重试:</strong> {new Date(ev.next_retry_at).toLocaleString()}</div>
                          )}
                        </div>
                      )}
                      
                      {ev.status === 'dead_letter' && (
                        <div style={{ background: '#f8d7da', padding: '8px', borderRadius: '4px', marginTop: '8px' }}>
                          <div><strong>状态:</strong> 投递失败，已超过最大重试次数</div>
                          <button 
                            className="btn-sm" 
                            style={{ marginTop: '8px' }}
                            onClick={(e) => { e.stopPropagation(); handleRetry(ev.id); }}
                          >
                            手动重试
                          </button>
                        </div>
                      )}
                      
                      {ev.error_message && (
                        <div style={{ marginTop: '8px' }}>
                          <strong>错误详情:</strong>
                          <pre style={{ 
                            background: '#f5f5f5', 
                            padding: '8px', 
                            borderRadius: '4px',
                            fontSize: '12px',
                            overflow: 'auto',
                            maxHeight: '150px'
                          }}>
                            {ev.error_message}
                          </pre>
                        </div>
                      )}
                      
                      <details style={{ marginTop: '8px' }}>
                        <summary>CloudEvent 详情</summary>
                        <pre className="log-box">{JSON.stringify(ev.cloud_event, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              padding: '16px',
            }}>
              <button
                className="btn-sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              
              <span style={{ fontSize: '13px' }}>
                第 {page} / {totalPages} 页（共 {total} 条）
              </span>
              
              <button
                className="btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
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
