import { useState, useCallback } from "react";
import { useSSE } from "./useSSE";
import { client } from "../api/client";
import type { FeedEntry, SignalFiredEvent, RunUpdateEvent } from "../types";

const MAX = 200;

export function useSignalFeed() {
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const push = (entry: FeedEntry) =>
    setFeed((prev) => [entry, ...prev].slice(0, MAX));

  const onSignal = useCallback((data: unknown) => {
    push({ kind: "signal", ts: new Date().toISOString(), event: data as SignalFiredEvent });
  }, []);

  const onRun = useCallback((data: unknown) => {
    push({ kind: "run", ts: new Date().toISOString(), event: data as RunUpdateEvent });
  }, []);

  useSSE(client.eventsUrl(), { signal_fired: onSignal, run_update: onRun });

  return { feed };
}
