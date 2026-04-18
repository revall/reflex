# Spec: Neuron Agent Engine — UI (Phase 2)

## Objective

A React web app that connects to a running Neuron Agent Engine and provides:
- A live visual tree of agents and their current status
- Real-time signal feed via SSE
- Per-node side panel: status, last signal, context viewer, signal injection

**Target users:** developers running the engine locally who want to observe and interact with agent trees without using `curl`.

**Engine dependency:** connects to a running engine at a configurable base URL (default `http://localhost:3000`). The engine API is defined in `API.md`.

---

## Commands

```bash
# From the ui/ directory:
npm install
npm run dev          # Vite dev server (default port 5173)
npm run build        # Production build → dist/
npm run preview      # Serve production build locally
npm test             # Vitest component tests
```

Environment variable (optional, `.env`):
```
VITE_ENGINE_URL=http://localhost:3000
```

---

## Phase 2 Engine Changes Required

The following must be added to the engine before the UI can work:

### `GET /events` — SSE stream

Returns a persistent `text/event-stream` connection. Emits events whenever node or run state changes.

**Event types:**

```
event: node_update
data: {"nodeId":"leaf_a","state":"processing","severity":null,"processedCount":1}

event: signal_fired
data: {"fromAgent":"leaf_a","toAgent":"root","severity":"warning","summary":"...","trace":[...]}

event: run_update
data: {"runId":"run_abc","status":"complete"}

event: ping
data: {}
```

- `ping` sent every 15s to keep the connection alive
- Client reconnects automatically on disconnect (SSE spec behaviour)
- No auth in Phase 2 — single-user local tool

Add to `src/api/routes.ts` and wire an `EventEmitter` through the Engine so every state change publishes to open SSE connections.

---

## Project Structure

```
ui/
  src/
    api/
      client.ts          # fetch wrappers for all engine REST endpoints
      sse.ts             # EventSource hook — connects to GET /events
    components/
      TreeView.tsx        # React Flow graph — nodes + edges from GET /config
      NodeCard.tsx        # Node shape inside the graph (status colour, label)
      NodePanel.tsx       # Side panel for selected node
      SignalFeed.tsx      # Live scrolling list of signal_fired + run_update events
      InjectForm.tsx      # Form to POST /nodes/:id/signal
      ContextView.tsx     # GET /nodes/:id/context + DELETE button
    hooks/
      useNodes.ts         # Polls or merges SSE node_update into local state
      useSSE.ts           # Manages EventSource lifecycle
    App.tsx               # Layout: TreeView (left) + NodePanel (right) + SignalFeed (bottom)
    main.tsx
  index.html
  vite.config.ts
  tsconfig.json
  package.json
```

---

## Core Features

### 1 — Visual Tree (`TreeView`)

- Fetch `GET /config` on mount to build the graph
- Render with **React Flow**: agents as nodes, `children` relationships as edges
- Edges point **upward** (leaf → parent) to reflect signal direction
- Node colour reflects current state:

  | State | Colour |
  |-------|--------|
  | `idle` | grey |
  | `processing` | blue (pulsing) |
  | `silent` | yellow |
  | `error` | red |
  | fired (last signal severity `critical`) | red |
  | fired (last signal severity `warning`) | orange |
  | fired (last signal severity `info`) | green |

- Clicking a node opens the **Node Panel**
- State updates arrive via SSE `node_update` events — no polling

### 2 — Node Panel (`NodePanel`)

Shown in a right-side drawer when a node is selected. Sections:

**Status**
- Agent id, current state, processedCount
- Severity badge if last signal fired

**Last Signal**
- `fromAgent → toAgent`, severity, timestamp
- Payload as formatted JSON
- Trace entries as a timeline: `agentId · summary · firedAt`

**Context**
- `GET /nodes/:id/context` on open
- Key–value table, editable view (display only in Phase 2)
- "Clear context" button → `DELETE /nodes/:id/context`

**Inject Signal**
- Text area pre-filled with `{ "payload": {}, "source": "ui", "trace": [] }`
- "Send" → `POST /nodes/:id/signal`
- Shows queued confirmation (`{ queued: true, queueDepth: N }`)

### 3 — Signal Feed (`SignalFeed`)

- Scrolling list at the bottom of the screen
- Populated by SSE `signal_fired` and `run_update` events
- Each entry: timestamp · from → to · severity badge · summary text
- Run completion / silent entries shown with run id and final status
- Auto-scrolls to latest; pause-on-hover

### 4 — Submit Run

- Floating "Run" button opens a modal
- JSON editor for the event payload and source
- Submit → `POST /run`
- Response shows `runId`; status updates appear in the Signal Feed

---

## Code Style

- TypeScript strict mode
- **Vite** + React 18
- **React Flow** (`@xyflow/react`) for graph rendering
- **Tailwind CSS** for styling — utility classes only, no custom CSS files
- No Redux or Zustand — React state + context is sufficient
- `api/client.ts` exports typed async functions for every endpoint; no raw `fetch` in components
- SSE managed in a single `useSSE` hook; components subscribe via `useNodes` and `useSignalFeed`
- No `any` — use `unknown` and narrow, or import types from the engine's `types.ts`

---

## Testing Strategy

- **Unit**: `api/client.ts` functions (mock `fetch`), `useSSE` hook (mock `EventSource`)
- **Component**: `NodePanel` renders correct sections; `InjectForm` calls client on submit
- **Integration**: `TreeView` builds correct node/edge layout from a fixture config
- Test runner: **Vitest** + **React Testing Library**
- No browser E2E tests in Phase 2 (out of scope)

---

## Phase 2 "Done" Criteria

- [ ] Engine exposes `GET /events` SSE stream with `node_update`, `signal_fired`, `run_update`, `ping` events
- [ ] UI connects to SSE and reflects live node state changes without polling
- [ ] Tree renders correctly from `GET /config` using React Flow
- [ ] Node colour updates in real time as signals flow through the tree
- [ ] Clicking a node opens Node Panel with status, last signal, trace, and context
- [ ] "Inject Signal" form posts to `POST /nodes/:id/signal` and shows confirmation
- [ ] "Clear Context" deletes node context and refreshes the view
- [ ] Signal Feed shows live `signal_fired` events with severity and summary
- [ ] "Submit Run" button submits a raw event and shows the runId
- [ ] UI auto-reconnects to SSE on disconnect

---

## Out of Scope (Phase 2)

- Auth / multi-tenancy
- Editing agent prompts or config via UI
- Streaming LLM token output
- Persistent signal history across page reloads
- Mobile layout
- Dark/light theme toggle
