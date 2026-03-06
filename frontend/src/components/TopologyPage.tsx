import { useEffect, useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { Agent, Connector, Subscription } from "../types";
import { api } from "../api/client";
import Drawer from "./Drawer";

/* ─── Constants ─── */

const EVENT_TYPE_OPTIONS = [
  { value: "git.push", label: "Git Push" },
  { value: "git.pull_request.opened", label: "PR Opened" },
  { value: "git.pull_request.closed", label: "PR Closed" },
  { value: "git.pull_request.merged", label: "PR Merged" },
  { value: "git.pull_request.review_submitted", label: "PR Review" },
  { value: "git.issues.opened", label: "Issue Opened" },
  { value: "git.issues.closed", label: "Issue Closed" },
  { value: "git.issue_comment.created", label: "Issue Comment" },
  { value: "cron.tick", label: "Cron Tick" },
  { value: "manual.trigger", label: "Manual Trigger" },
];

const SOURCE_OPTIONS = [
  { value: "github/*", label: "All GitHub Repos" },
  { value: "gitlab/*", label: "All GitLab Repos" },
  { value: "gitea/*", label: "All Gitea Repos" },
  { value: "cron/*", label: "Cron Jobs" },
  { value: "*", label: "Any Source" },
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;

/* ─── Dagre Layout ─── */

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 180 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const positioned = nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
  return { nodes: positioned, edges };
}

/* ─── Custom Nodes ─── */

function ConnectorNode({ data }: NodeProps) {
  const d = data as { label: string; type: string; enabled: boolean };
  return (
    <div className={`topo-node topo-connector ${d.enabled ? "" : "topo-disabled"}`}>
      <div className="topo-node-badge">{d.type}</div>
      <div className="topo-node-label">{d.label}</div>
      <div className="topo-node-status">{d.enabled ? "● Enabled" : "○ Disabled"}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function AgentNode({ data }: NodeProps) {
  const d = data as { label: string; group: string; model: string; skillCount: number; subCount: number };
  return (
    <div className="topo-node topo-agent">
      <div className="topo-node-header">
        <span className="topo-node-label">{d.label}</span>
        {d.group && <span className="topo-node-tag">{d.group}</span>}
      </div>
      <div className="topo-node-meta">
        {d.model && <span>{d.model}</span>}
        {d.skillCount > 0 && <span>Skills: {d.skillCount}</span>}
      </div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}

const nodeTypes = { connector: ConnectorNode, agent: AgentNode };

/* ─── Match source_pattern to connector ─── */

function matchConnector(sourcePattern: string, connectors: Connector[]): Connector | undefined {
  // Try exact type match first, then prefix match
  const pat = sourcePattern.replace("/*", "").replace("*", "");
  return connectors.find((c) => c.type === pat || c.type.startsWith(pat) || sourcePattern === "*");
}

/* ─── Subscription Create Form ─── */

function SubCreateForm({
  sourceConnector,
  targetAgent,
  onSave,
  onCancel,
}: {
  sourceConnector: Connector;
  targetAgent: Agent;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [sourcePattern, setSourcePattern] = useState(sourceConnector.type + "/*");
  const [saving, setSaving] = useState(false);

  const toggleType = (t: string) =>
    setEventTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleSave = async () => {
    if (eventTypes.length === 0) return;
    setSaving(true);
    await api.createSubscription(targetAgent.id, {
      source_pattern: sourcePattern,
      event_types: eventTypes,
      enabled: true,
    });
    setSaving(false);
    onSave();
  };

  return (
    <>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 12px" }}>
        {sourceConnector.name} → {targetAgent.name}
      </p>
      <label>Source</label>
      <select value={sourcePattern} onChange={(e) => setSourcePattern(e.target.value)}>
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <label style={{ marginTop: 8 }}>Event Types</label>
      <div className="event-type-grid">
        {EVENT_TYPE_OPTIONS.map((o) => (
          <label key={o.value} className="event-type-option">
            <input type="checkbox" checked={eventTypes.includes(o.value)} onChange={() => toggleType(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <div className="drawer-actions" style={{ marginTop: 12 }}>
        <button onClick={handleSave} disabled={saving || eventTypes.length === 0}>
          {saving ? "Creating..." : "Create Subscription"}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

/* ─── Subscription Edit Form ─── */

function SubEditPanel({
  sub,
  agents,
  connectors,
  onSave,
  onDelete,
}: {
  sub: Subscription;
  agents: Agent[];
  connectors: Connector[];
  onSave: () => void;
  onDelete: () => void;
}) {
  const agent = agents.find((a) => a.id === sub.agent_id);
  const conn = matchConnector(sub.source_pattern, connectors);
  const [enabled, setEnabled] = useState(sub.enabled);
  const [eventTypes, setEventTypes] = useState<string[]>([...sub.event_types]);
  const [saving, setSaving] = useState(false);

  const toggleType = (t: string) =>
    setEventTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleSave = async () => {
    setSaving(true);
    await api.updateSubscription(sub.agent_id, sub.id, { enabled, event_types: eventTypes });
    setSaving(false);
    onSave();
  };

  const handleDelete = async () => {
    await api.deleteSubscription(sub.agent_id, sub.id);
    onDelete();
  };

  return (
    <>
      <div className="topo-detail-body">
        <div className="topo-detail-row">
          <span className="topo-detail-label">Source</span>
          <span>{conn?.name || sub.source_pattern}</span>
        </div>
        <div className="topo-detail-row">
          <span className="topo-detail-label">Agent</span>
          <span>{agent?.name || sub.agent_id}</span>
        </div>
        <div className="topo-detail-row">
          <span className="topo-detail-label">Pattern</span>
          <span className="mono">{sub.source_pattern}</span>
        </div>
        <label style={{ marginTop: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ marginLeft: 6 }}>{enabled ? "Enabled" : "Disabled"}</span>
        </label>
        <label style={{ marginTop: 12 }}>Event Types</label>
        <div className="event-type-grid">
          {EVENT_TYPE_OPTIONS.map((o) => (
            <label key={o.value} className="event-type-option">
              <input type="checkbox" checked={eventTypes.includes(o.value)} onChange={() => toggleType(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <div className="drawer-actions" style={{ marginTop: 12 }}>
          <button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button className="btn-sm btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>
    </>
  );
}

/* ─── Detail Panels ─── */

function ConnectorDetail({ connector }: { connector: Connector }) {
  return (
    <div className="topo-detail-body">
      <div className="topo-detail-row"><span className="topo-detail-label">Name</span><span>{connector.name}</span></div>
      <div className="topo-detail-row"><span className="topo-detail-label">Type</span><span className="topo-node-badge" style={{ display: "inline-block" }}>{connector.type}</span></div>
      <div className="topo-detail-row"><span className="topo-detail-label">Status</span><span>{connector.enabled ? "✓ Enabled" : "✗ Disabled"}</span></div>
      <div className="topo-detail-row"><span className="topo-detail-label">Created</span><span>{new Date(connector.created_at).toLocaleString()}</span></div>
    </div>
  );
}

function AgentDetail({ agent, subCount }: { agent: Agent; subCount: number }) {
  return (
    <div className="topo-detail-body">
      <div className="topo-detail-row"><span className="topo-detail-label">Name</span><span>{agent.name}</span></div>
      {agent.group && <div className="topo-detail-row"><span className="topo-detail-label">Group</span><span>{agent.group}</span></div>}
      {agent.model && <div className="topo-detail-row"><span className="topo-detail-label">Model</span><span className="mono">{agent.model}</span></div>}
      {agent.description && <div className="topo-detail-row"><span className="topo-detail-label">Description</span><span>{agent.description}</span></div>}
      <div className="topo-detail-row"><span className="topo-detail-label">Skills</span><span>{agent.skills?.length || 0}</span></div>
      <div className="topo-detail-row"><span className="topo-detail-label">Subscriptions</span><span>{subCount}</span></div>
      <div className="topo-detail-row"><span className="topo-detail-label">Created</span><span>{new Date(agent.created_at).toLocaleString()}</span></div>
    </div>
  );
}

/* ─── Main Component ─── */

type PanelState =
  | { kind: "none" }
  | { kind: "connector"; connector: Connector }
  | { kind: "agent"; agent: Agent; subCount: number }
  | { kind: "sub-edit"; sub: Subscription }
  | { kind: "sub-create"; sourceConnector: Connector; targetAgent: Agent };

export default function TopologyPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [panel, setPanel] = useState<PanelState>({ kind: "none" });
  const dataRef = useRef({ agents: [] as Agent[], connectors: [] as Connector[], subscriptions: [] as Subscription[] });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, s] = await Promise.all([
        api.listAgents(),
        api.listConnectors(),
        api.listAllSubscriptions(),
      ]);
      setAgents(a);
      setConnectors(c);
      setSubscriptions(s);
      dataRef.current = { agents: a, connectors: c, subscriptions: s };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Build graph whenever data changes
  useEffect(() => {
    if (loading) return;

    const rawNodes: Node[] = [];
    const rawEdges: Edge[] = [];

    // Connector nodes (left side)
    connectors.forEach((c) => {
      rawNodes.push({
        id: `conn-${c.id}`,
        type: "connector",
        position: { x: 0, y: 0 },
        data: { label: c.name, type: c.type, enabled: c.enabled, _id: c.id },
      });
    });

    // Agent nodes (right side)
    agents.forEach((a) => {
      const subCount = subscriptions.filter((s) => s.agent_id === a.id).length;
      rawNodes.push({
        id: `agent-${a.id}`,
        type: "agent",
        position: { x: 0, y: 0 },
        data: {
          label: a.name,
          group: a.group,
          model: a.model,
          skillCount: a.skills?.length || 0,
          subCount,
          _id: a.id,
        },
      });
    });

    // Edges from subscriptions
    subscriptions.forEach((sub) => {
      const conn = matchConnector(sub.source_pattern, connectors);
      const sourceId = conn ? `conn-${conn.id}` : null;
      const targetId = `agent-${sub.agent_id}`;

      // If source_pattern=* create edges to a virtual "any" node, or if matched
      if (sourceId) {
        rawEdges.push({
          id: `sub-${sub.id}`,
          source: sourceId,
          target: targetId,
          label: sub.event_types.length <= 2 ? sub.event_types.join(", ") : `${sub.event_types.length} types`,
          animated: sub.enabled,
          style: { stroke: sub.enabled ? "var(--color-primary)" : "var(--color-muted)", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: sub.enabled ? "var(--color-primary)" : "var(--color-muted)" },
          data: { _subId: sub.id },
        });
      } else {
        // Create a virtual node for unmatched source patterns
        const virtualId = `virtual-${sub.source_pattern}`;
        if (!rawNodes.find((n) => n.id === virtualId)) {
          rawNodes.push({
            id: virtualId,
            type: "connector",
            position: { x: 0, y: 0 },
            data: { label: sub.source_pattern, type: "pattern", enabled: true, _id: null },
          });
        }
        rawEdges.push({
          id: `sub-${sub.id}`,
          source: virtualId,
          target: targetId,
          label: sub.event_types.length <= 2 ? sub.event_types.join(", ") : `${sub.event_types.length} types`,
          animated: sub.enabled,
          style: { stroke: sub.enabled ? "var(--color-primary)" : "var(--color-muted)", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: sub.enabled ? "var(--color-primary)" : "var(--color-muted)" },
          data: { _subId: sub.id },
        });
      }
    });

    const layout = getLayoutedElements(rawNodes, rawEdges);
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [agents, connectors, subscriptions, loading, setNodes, setEdges]);

  // Click node => detail panel
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const { agents, connectors, subscriptions } = dataRef.current;
    if (node.type === "connector") {
      const connId = (node.data as Record<string, unknown>)._id as string | null;
      const conn = connectors.find((c) => c.id === connId);
      if (conn) setPanel({ kind: "connector", connector: conn });
    } else if (node.type === "agent") {
      const agentId = (node.data as Record<string, unknown>)._id as string;
      const agent = agents.find((a) => a.id === agentId);
      const subCount = subscriptions.filter((s) => s.agent_id === agentId).length;
      if (agent) setPanel({ kind: "agent", agent, subCount });
    }
  }, []);

  // Click edge => edit subscription
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const subId = (edge.data as Record<string, unknown>)?._subId as string;
    const sub = dataRef.current.subscriptions.find((s) => s.id === subId);
    if (sub) setPanel({ kind: "sub-edit", sub });
  }, []);

  // Connect (drag from source to target) => create subscription
  const onConnect = useCallback((connection: Connection) => {
    const { agents, connectors } = dataRef.current;
    const connId = connection.source?.replace("conn-", "").replace("virtual-", "");
    const agentId = connection.target?.replace("agent-", "");
    const conn = connectors.find((c) => c.id === connId);
    const agent = agents.find((a) => a.id === agentId);
    if (conn && agent) {
      setPanel({ kind: "sub-create", sourceConnector: conn, targetAgent: agent });
    }
  }, []);

  const closePanel = useCallback(() => setPanel({ kind: "none" }), []);

  const refreshAfterEdit = useCallback(() => {
    setPanel({ kind: "none" });
    loadData();
  }, [loadData]);

  const empty = !loading && agents.length === 0 && connectors.length === 0;

  return (
    <div className="topo-container">
      {loading && (
        <div className="topo-loading">
          <div className="spinner" />
          <span>Loading topology...</span>
        </div>
      )}

      {empty && (
        <div className="topo-empty">
          <p>No Agents or Connectors found</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Add data on the Agents and Connectors pages first
          </p>
        </div>
      )}

      {!loading && !empty && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--bg)" }}
        >
          <Background color="var(--border)" gap={24} />
          <Controls
            showInteractive={false}
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          />
          <Panel position="top-right">
            <button className="btn-sm" onClick={loadData} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              ↻ Refresh
            </button>
          </Panel>
        </ReactFlow>
      )}

      {/* Detail / Edit Drawers */}
      <Drawer open={panel.kind === "connector"} title="Connector Details" onClose={closePanel}>
        {panel.kind === "connector" && <ConnectorDetail connector={panel.connector} />}
      </Drawer>
      <Drawer open={panel.kind === "agent"} title="Agent Details" onClose={closePanel}>
        {panel.kind === "agent" && <AgentDetail agent={panel.agent} subCount={panel.subCount} />}
      </Drawer>
      <Drawer open={panel.kind === "sub-edit"} title="Subscription Details" onClose={closePanel}>
        {panel.kind === "sub-edit" && (
          <SubEditPanel
            sub={panel.sub}
            agents={agents}
            connectors={connectors}
            onSave={refreshAfterEdit}
            onDelete={refreshAfterEdit}
          />
        )}
      </Drawer>
      <Drawer open={panel.kind === "sub-create"} title="Create Subscription" onClose={closePanel}>
        {panel.kind === "sub-create" && (
          <SubCreateForm
            sourceConnector={panel.sourceConnector}
            targetAgent={panel.targetAgent}
            onSave={refreshAfterEdit}
            onCancel={closePanel}
          />
        )}
      </Drawer>
    </div>
  );
}
