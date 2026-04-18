import { useEffect, useRef } from "react";

type Handler = (data: unknown) => void;

export function useSSE(url: string, handlers: Record<string, Handler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource(url);

      es.addEventListener("node_update",  (e) => handlersRef.current["node_update"]?.(JSON.parse(e.data)));
      es.addEventListener("signal_fired", (e) => handlersRef.current["signal_fired"]?.(JSON.parse(e.data)));
      es.addEventListener("run_update",   (e) => handlersRef.current["run_update"]?.(JSON.parse(e.data)));

      es.onerror = () => {
        es.close();
        retryTimer = setTimeout(connect, 2_000);
      };
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [url]);
}
