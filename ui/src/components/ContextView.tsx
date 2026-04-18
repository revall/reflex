import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client";

interface Props {
  nodeId: string;
}

export default function ContextView({ nodeId }: Props) {
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    client.getContext(nodeId).then(setCtx).catch(() => setCtx({}));
  }, [nodeId]);

  useEffect(() => { load(); }, [load]);

  const clear = async () => {
    setClearing(true);
    await client.clearContext(nodeId).catch(() => null);
    setClearing(false);
    load();
  };

  const entries = Object.entries(ctx);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400 uppercase tracking-wide">Context</span>
        {entries.length > 0 && (
          <button
            onClick={clear}
            disabled={clearing}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {clearing ? "clearing…" : "Clear"}
          </button>
        )}
      </div>
      {entries.length === 0
        ? <p className="text-slate-600 text-xs">empty</p>
        : (
          <table className="w-full text-xs">
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k} className="border-b border-slate-800">
                  <td className="py-1 pr-3 text-slate-400 font-semibold truncate max-w-24">{k}</td>
                  <td className="py-1 text-slate-300 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  );
}
