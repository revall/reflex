import { useEffect, useRef, useState } from "react";
import type { FeedEntry } from "../types";

const SEV: Record<string, string> = {
  critical: "text-red-400",
  warning:  "text-orange-400",
  info:     "text-green-400",
};

const STATUS: Record<string, string> = {
  complete: "text-green-400",
  silent:   "text-yellow-400",
  error:    "text-red-400",
  running:  "text-blue-400",
};

interface Props {
  feed: FeedEntry[];
}

export default function SignalFeed({ feed }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed, paused]);

  return (
    <div
      className="h-full overflow-y-auto px-3 py-2 space-y-0.5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="text-slate-600 uppercase tracking-wide text-xs mb-1 sticky top-0 bg-slate-950 pb-1">
        Signal Feed
      </div>

      {feed.length === 0 && (
        <p className="text-slate-700 text-xs">No events yet — submit a run to start.</p>
      )}

      {[...feed].reverse().map((entry, i) => (
        <div key={i} className="flex gap-2 text-xs text-slate-400 font-mono">
          <span className="text-slate-600 shrink-0">
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
          {entry.kind === "signal" ? (
            <>
              <span className="text-slate-500">{entry.event.fromAgent}</span>
              <span className="text-slate-700">→</span>
              <span className="text-slate-500">{entry.event.toAgent}</span>
              <span className={`${SEV[entry.event.severity] ?? ""} shrink-0`}>
                {entry.event.severity}
              </span>
              <span className="truncate text-slate-300">"{entry.event.summary}"</span>
            </>
          ) : (
            <>
              <span className="text-slate-600 shrink-0">{entry.event.runId}</span>
              <span className={STATUS[entry.event.status] ?? ""}>{entry.event.status.toUpperCase()}</span>
            </>
          )}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
