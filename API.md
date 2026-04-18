# Neuron Agent Engine — API Reference

Base URL: `http://localhost:3000`  
Interactive docs: `http://localhost:3000/doc`  
OpenAPI schema: `http://localhost:3000/openapi.json`

---

## Config

### `GET /config`
Returns the loaded tree config. Use this to visualize the agent graph.

**Response**
```json
{
  "version": 1,
  "root": "executive",
  "agents": [
    {
      "id": "executive",
      "prompt": "...",
      "model": "claude-sonnet-4-6",
      "tools": ["http"],
      "children": ["supply_chain"]
    }
  ]
}
```

---

## Nodes

### `GET /nodes`
All nodes and their current status.

**Response**
```json
[
  {
    "id": "warehouse_monitor",
    "state": "idle",
    "severity": null,
    "lastSignalAt": null,
    "lastSignal": null,
    "errorMessage": null,
    "processedCount": 0
  }
]
```

### `GET /nodes/:id`
Single node status and last signal.

**Response**
```json
{
  "id": "warehouse_monitor",
  "state": "idle",
  "severity": "critical",
  "lastSignalAt": "2026-04-18T10:23:00Z",
  "lastSignal": {
    "id": "sig_abc123",
    "fromAgent": "warehouse_monitor",
    "toAgent": "logistics",
    "payload": { },
    "trace": [
      { "agentId": "warehouse_monitor", "summary": "Detected fire at warehouse X", "firedAt": "2026-04-18T10:23:00Z" }
    ],
    "timestamp": "2026-04-18T10:23:00Z"
  },
  "errorMessage": null,
  "processedCount": 3
}
```

**Node states**

| `state` | Meaning |
|---------|---------|
| `idle` | Waiting for a signal |
| `processing` | Currently running LLM + tools |
| `silent` | Processed last signal, decided not to emit |
| `error` | Last signal caused an error |

**Severity** (set when a node fires, `null` otherwise)

| `severity` | Meaning |
|------------|---------|
| `critical` | Immediate action required |
| `warning` | Attention needed |
| `info` | Informational, low urgency |

### `POST /nodes/:id/signal`
Inject a signal directly into a specific node's queue. Use to test individual nodes or feed mid-tree signals.

**Request**
```json
{
  "payload": { "type": "fire", "location": "warehouse_X" },
  "source": "system",
  "trace": []
}
```

**Response**
```json
{ "queued": true, "nodeId": "warehouse_monitor", "queueDepth": 1 }
```

### `GET /nodes/:id/context`
Read all context keys stored by a node.

**Response**
```json
{ "last_incident": "power outage 2026-03-10", "alert_count": "3" }
```

### `DELETE /nodes/:id/context`
Clear all context for a node.

**Response**
```json
{ "cleared": true, "nodeId": "warehouse_monitor" }
```

---

## Runs

### `POST /run`
Submit a raw event to all leaf nodes simultaneously. Starts a full tree execution.

**Request**
```json
{
  "payload": { "type": "fire", "location": "warehouse_X", "severity": "high" },
  "source": "system"
}
```

**Response**
```json
{ "runId": "run_xyz789", "status": "running", "startedAt": "2026-04-18T10:23:00Z" }
```

### `GET /runs/:runId`
Status of a specific run.

**Response**
```json
{
  "runId": "run_xyz789",
  "status": "complete",
  "startedAt": "2026-04-18T10:23:00Z",
  "completedAt": "2026-04-18T10:23:08Z",
  "rootOutput": { }
}
```

**Run statuses**

| Status | Meaning |
|--------|---------|
| `running` | Tree is still processing |
| `complete` | Root agent fired, output available |
| `silent` | Root agent decided not to fire |
| `error` | One or more nodes errored |

---

## Signal Trace

Every signal carries a cumulative `trace` array — one entry per node that fired on the path from the originating raw event to the current node. Use this to visualize signal propagation in the UI.

```json
"trace": [
  { "agentId": "warehouse_monitor", "summary": "Fire detected at warehouse X, stock at risk", "firedAt": "..." },
  { "agentId": "logistics",         "summary": "12 deliveries affected, 2-week delay estimated", "firedAt": "..." },
  { "agentId": "supply_chain",      "summary": "Revenue impact $50k, urgency high", "firedAt": "..." }
]
```
