import { useState } from "react";
import { Link } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import TreeView from "./components/TreeView";
import NodePanel from "./components/NodePanel";
import SignalFeed from "./components/SignalFeed";
import RunModal from "./components/RunModal";
import { useNodes } from "./hooks/useNodes";
import { useSignalFeed } from "./hooks/useSignalFeed";
import { useNodeHistory } from "./hooks/useNodeHistory";

export default function App() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { nodes, loading } = useNodes();
  const { feed } = useSignalFeed();
  const { history } = useNodeHistory();

  const selectedNode = selectedNodeId ? (nodes.get(selectedNodeId) ?? null) : null;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-mono text-sm">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 shrink-0">
        <span className="text-slate-400 font-semibold tracking-wide uppercase text-xs">
          Spinal Cord
        </span>
        <span className="text-slate-700 text-xs">reflex</span>
        <Link to="/dashboard" className="text-slate-500 hover:text-slate-300 text-xs ml-2">Dashboard →</Link>
        {loading && <span className="text-slate-500 text-xs">connecting…</span>}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0">
          <ReactFlowProvider>
            <TreeView
              nodes={nodes}
              onNodeSelect={setSelectedNodeId}
              selectedNodeId={selectedNodeId}
            />
          </ReactFlowProvider>
        </div>

        {selectedNode && (
          <div className="w-96 border-l border-slate-800 overflow-y-auto shrink-0">
            <NodePanel
              nodeStatus={selectedNode}
              outcomes={history.get(selectedNode.id) ?? []}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>

      <div className="h-40 border-t border-slate-800 shrink-0">
        <SignalFeed feed={feed} />
      </div>

      <RunModal />
    </div>
  );
}
