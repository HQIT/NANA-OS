import { useEffect, useState } from "react";
import type { Connector } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";

interface PresetConnector {
  type: string;
  label: string;
  description: string;
  defaultConfig: Record<string, unknown>;
}

const PRESETS: PresetConnector[] = [
  {
    type: "git_webhook",
    label: "Git Webhook",
    description: "接收 GitHub / GitLab / Gitea 等 Git 平台的 Webhook 事件",
    defaultConfig: { platform: "github", secret: "" },
  },
  {
    type: "imap",
    label: "邮件收取 (IMAP)",
    description: "定期轮询 IMAP 邮箱，将新邮件转为事件",
    defaultConfig: { host: "", port: 993, user: "", password: "", mailbox: "INBOX" },
  },
  {
    type: "generic",
    label: "通用 Webhook",
    description: "接收任意 HTTP POST 请求作为事件源",
    defaultConfig: {},
  },
];

const GIT_PLATFORMS = [
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
  { value: "gitea", label: "Gitea" },
];

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [editType, setEditType] = useState<string | null>(null);

  const load = () => api.listConnectors().then(setConnectors);
  useEffect(() => { load(); }, []);

  const findByType = (type: string): Connector | undefined => {
    if (type === "git_webhook") {
      return connectors.find((c) => c.type === "git_webhook" || ["github", "gitlab", "gitea"].includes(c.type));
    }
    return connectors.find((c) => c.type === type);
  };

  const toggleEnabled = async (preset: PresetConnector) => {
    const existing = findByType(preset.type);
    if (existing) {
      await api.updateConnector(existing.id, { enabled: !existing.enabled });
    } else {
      await api.createConnector({
        type: preset.type,
        name: preset.label,
        enabled: true,
        config: preset.defaultConfig,
      });
    }
    load();
  };

  const openConfig = (type: string) => {
    setEditType(type);
  };

  const editPreset = editType ? PRESETS.find((p) => p.type === editType) : null;

  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (editType) {
      const existing = findByType(editType);
      setLocalConfig(existing?.config as Record<string, unknown> ?? editPreset?.defaultConfig ?? {});
    }
  }, [editType, connectors]);

  const updateConfig = (key: string, value: unknown) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const saveConfig = async () => {
    if (!editType) return;
    const existing = findByType(editType);
    if (existing) {
      await api.updateConnector(existing.id, { config: localConfig });
    } else {
      const preset = PRESETS.find((p) => p.type === editType)!;
      await api.createConnector({
        type: editType,
        name: preset.label,
        enabled: true,
        config: localConfig,
      });
    }
    setEditType(null);
    load();
  };

  return (
    <div className="panel">
      <p className="text-muted" style={{ marginBottom: 12 }}>
        事件源负责将外部事件（Webhook、邮件等）接入 NANA-OS，用于触发 Agent。
      </p>

      <div className="card-grid">
        {PRESETS.map((preset) => {
          const conn = findByType(preset.type);
          const enabled = conn?.enabled ?? false;
          return (
            <div key={preset.type} className={`entity-card ${enabled ? "" : "connector-disabled"}`}>
              <div className="entity-card-header">
                <span className="entity-card-name">{preset.label}</span>
                <label className="sub-toggle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleEnabled(preset)}
                  />
                  <span>{enabled ? "已启用" : "未启用"}</span>
                </label>
              </div>
              <p className="entity-card-desc">{preset.description}</p>
              <div className="entity-card-actions">
                <button className="btn-sm btn-secondary" onClick={() => openConfig(preset.type)}>配置</button>
              </div>
            </div>
          );
        })}
      </div>

      <Drawer
        open={!!editType}
        title={`配置 - ${editPreset?.label ?? ""}`}
        onClose={() => setEditType(null)}
      >
        {editType === "git_webhook" && (
          <div className="drawer-form">
            <label>平台</label>
            <select
              value={(localConfig.platform as string) || "github"}
              onChange={(e) => updateConfig("platform", e.target.value)}
            >
              {GIT_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>

            <label>Webhook Secret</label>
            <input
              type="password"
              value={(localConfig.secret as string) || ""}
              onChange={(e) => updateConfig("secret", e.target.value)}
              placeholder="可选"
            />

            <label>Callback URL（请填入 Git 平台的 Webhook 设置）</label>
            <input
              readOnly
              value={`${window.location.origin}/api/events/webhook/${(localConfig.platform as string) || "github"}`}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ color: "var(--color-info)", cursor: "pointer" }}
            />

            <div className="drawer-actions">
              <button onClick={saveConfig}>保存</button>
              <button className="btn-secondary" onClick={() => setEditType(null)}>取消</button>
            </div>
          </div>
        )}

        {editType === "imap" && (
          <div className="drawer-form">
            <label>Host</label>
            <input
              value={(localConfig.host as string) || ""}
              onChange={(e) => updateConfig("host", e.target.value)}
              placeholder="imap.example.com"
            />
            <label>Port</label>
            <input
              type="number"
              value={(localConfig.port as number) ?? 993}
              onChange={(e) => updateConfig("port", Number(e.target.value) || 993)}
            />
            <label>User</label>
            <input
              value={(localConfig.user as string) || ""}
              onChange={(e) => updateConfig("user", e.target.value)}
            />
            <label>Password</label>
            <input
              type="password"
              value={(localConfig.password as string) || ""}
              onChange={(e) => updateConfig("password", e.target.value)}
            />
            <label>Mailbox</label>
            <input
              value={(localConfig.mailbox as string) || "INBOX"}
              onChange={(e) => updateConfig("mailbox", e.target.value)}
            />
            <div className="drawer-actions">
              <button onClick={saveConfig}>保存</button>
              <button className="btn-secondary" onClick={() => setEditType(null)}>取消</button>
            </div>
          </div>
        )}

        {editType === "generic" && (
          <div className="drawer-form">
            <label>Callback URL</label>
            <input
              readOnly
              value={`${window.location.origin}/api/events/webhook/generic`}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ color: "var(--color-info)", cursor: "pointer" }}
            />
            <p className="text-muted">通用 Webhook 无需额外配置，启用后即可接收任意 POST 请求。</p>
            <div className="drawer-actions">
              <button onClick={saveConfig}>保存</button>
              <button className="btn-secondary" onClick={() => setEditType(null)}>取消</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
