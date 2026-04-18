import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { NodeStatus } from "../types";

function stateColour(n: NodeStatus): string {
  if (n.state === "processing") return "border-blue-500 bg-blue-950 text-blue-200";
  if (n.state === "error")      return "border-red-500 bg-red-950 text-red-200";
  if (n.state === "silent")     return "border-yellow-500 bg-yellow-950 text-yellow-200";
  if (n.severity === "critical") return "border-red-400 bg-red-950 text-red-200";
  if (n.severity === "warning")  return "border-orange-400 bg-orange-950 text-orange-200";
  if (n.severity === "info")     return "border-green-400 bg-green-950 text-green-200";
  return "border-slate-600 bg-slate-900 text-slate-300";
}

function dot(n: NodeStatus): string {
  if (n.state === "processing") return "bg-blue-400 animate-pulse";
  if (n.state === "error")      return "bg-red-400";
  if (n.state === "silent")     return "bg-yellow-400";
  if (n.severity === "critical") return "bg-red-400";
  if (n.severity === "warning")  return "bg-orange-400";
  if (n.severity === "info")     return "bg-green-400";
  return "bg-slate-600";
}

export type AgentNodeData = { status: NodeStatus; selected: boolean } & Record<string, unknown>;
export type AgentNode = Node<AgentNodeData, "agent">;

function NodeCard({ data }: NodeProps<AgentNode>) {
  const { status, selected } = data;
  return (
    <div className={`px-3 py-2 rounded border text-xs min-w-24 cursor-pointer transition-all ${stateColour(status)} ${selected ? "ring-2 ring-white/40" : ""}`}>
      <Handle type="target" position={Position.Bottom} className="!bg-slate-600" />
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot(status)}`} />
        <span className="font-semibold truncate">{status.id}</span>
      </div>
      <div className="text-slate-500 mt-0.5">{status.state}</div>
      <Handle type="source" position={Position.Top} className="!bg-slate-600" />
    </div>
  );
}

export default memo(NodeCard);
