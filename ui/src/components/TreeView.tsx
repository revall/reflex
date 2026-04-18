import { useEffect, useState, useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { client } from "../api/client";
import NodeCard, { type AgentNode } from "./NodeCard";
import type { NodeStatus, TreeConfig } from "../types";

const nodeTypes = { agent: NodeCard } as const;

const NODE_W = 240;
const NODE_H_BASE = 72;
const TRACE_ROW_H = 20;

function nodeHeight(status: NodeStatus): number {
  const traceLen = status.lastSignal?.trace.length ?? 0;
  return NODE_H_BASE + (traceLen > 0 ? 8 + traceLen * TRACE_ROW_H : 0);
}

function buildLayout(config: TreeConfig, nodes: Map<string, NodeStatus>, selectedId: string | null) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // TB = top-to-bottom; root at top, leaves at bottom (signal flows up)
  g.setGraph({ rankdir: "BT", nodesep: 40, ranksep: 60 });

  for (const agent of config.agents) {
    const status = nodes.get(agent.id) ?? { id: agent.id, state: "idle" as const, severity: null, processedCount: 0, lastSignal: null, lastSignalAt: null, errorMessage: null };
    g.setNode(agent.id, { width: NODE_W, height: nodeHeight(status) });
  }

  for (const agent of config.agents) {
    for (const child of agent.children) {
      g.setEdge(child, agent.id);
    }
  }

  dagre.layout(g);

  const rfNodes: AgentNode[] = config.agents.map((agent) => {
    const { x, y } = g.node(agent.id);
    const status = nodes.get(agent.id) ?? { id: agent.id, state: "idle" as const, severity: null, processedCount: 0, lastSignal: null, lastSignalAt: null, errorMessage: null };
    return {
      id: agent.id,
      type: "agent",
      position: { x: x - NODE_W / 2, y: y - nodeHeight(status) / 2 },
      data: { status, selected: agent.id === selectedId },
    };
  });

  const rfEdges: Edge[] = config.agents.flatMap((agent) =>
    agent.children.map((child) => ({
      id: `${child}->${agent.id}`,
      source: child,
      target: agent.id,
      style: { stroke: "#475569" },
      animated: nodes.get(child)?.state === "processing",
    }))
  );

  return { rfNodes, rfEdges };
}

interface Props {
  nodes: Map<string, NodeStatus>;
  onNodeSelect: (id: string) => void;
  selectedNodeId: string | null;
}

export default function TreeView({ nodes, onNodeSelect, selectedNodeId }: Props) {
  const [config, setConfig] = useState<TreeConfig | null>(null);

  useEffect(() => {
    client.getConfig().then(setConfig).catch(console.error);
  }, []);

  const { rfNodes, rfEdges } = useMemo(
    () => config ? buildLayout(config, nodes, selectedNodeId) : { rfNodes: [], rfEdges: [] },
    [config, nodes, selectedNodeId]
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    onNodeSelect(node.id);
  }, [onNodeSelect]);

  if (!config) {
    return <div className="flex h-full items-center justify-center text-slate-500">Loading tree…</div>;
  }

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      fitView
      className="bg-slate-950"
    >
      <Background color="#1e293b" gap={24} />
      <Controls className="!bg-slate-900 !border-slate-700 !text-slate-300" />
    </ReactFlow>
  );
}
