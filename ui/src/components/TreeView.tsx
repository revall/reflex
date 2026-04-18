import { useEffect, useState, useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import { client } from "../api/client";
import NodeCard, { type AgentNode } from "./NodeCard";
import type { NodeStatus, TreeConfig } from "../types";

const nodeTypes = { agent: NodeCard } as const;

function buildLayout(config: TreeConfig, nodes: Map<string, NodeStatus>, selectedId: string | null) {
  const XGAP = 180;
  const YGAP = 120;

  // Assign depth (root = 0, children deeper)
  const depth = new Map<string, number>();
  const assign = (id: string, d: number) => {
    depth.set(id, d);
    const agent = config.agents.find((a) => a.id === id);
    agent?.children.forEach((c) => assign(c, d + 1));
  };
  assign(config.root, 0);

  // Group by depth
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const rfNodes: AgentNode[] = [];
  for (const [d, ids] of byDepth) {
    ids.forEach((id, i) => {
      const status = nodes.get(id) ?? { id, state: "idle" as const, severity: null, processedCount: 0, lastSignal: null, lastSignalAt: null, errorMessage: null };
      rfNodes.push({
        id,
        type: "agent",
        position: { x: i * XGAP - ((ids.length - 1) * XGAP) / 2, y: d * YGAP },
        data: { status, selected: id === selectedId },
      });
    });
  }

  const rfEdges: Edge[] = [];
  for (const agent of config.agents) {
    for (const child of agent.children) {
      rfEdges.push({
        id: `${child}->${agent.id}`,
        source: child,
        target: agent.id,
        style: { stroke: "#475569" },
        animated: nodes.get(child)?.state === "processing",
      });
    }
  }

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
