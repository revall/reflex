import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { v4 as uuidv4 } from "uuid";
import type { Engine } from "../graph/builder.js";
import type { NodeStore, RunStore } from "./store.js";

const NodeStatusSchema = z.object({
  id: z.string(),
  state: z.enum(["idle", "processing", "silent", "error"]),
  severity: z.enum(["critical", "warning", "info"]).nullable(),
  lastSignalAt: z.string().nullable(),
  lastSignal: z.any(),
  errorMessage: z.string().nullable(),
  processedCount: z.number(),
});

const RunRecordSchema = z.object({
  runId: z.string(),
  status: z.enum(["running", "complete", "silent", "error"]),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  rootOutput: z.any(),
});

const ErrorSchema = z.object({ error: z.string() });

export function createRoutes(engine: Engine, nodeStore: NodeStore, runStore: RunStore) {
  const app = new OpenAPIHono();

  app.openapi(
    createRoute({
      method: "get", path: "/config",
      tags: ["Config"],
      summary: "Get loaded tree config",
      responses: { 200: { content: { "application/json": { schema: z.any() } }, description: "Tree config" } },
    }),
    (c) => c.json(engine.getConfig(), 200)
  );

  app.openapi(
    createRoute({
      method: "get", path: "/nodes",
      tags: ["Nodes"],
      summary: "All node statuses",
      responses: { 200: { content: { "application/json": { schema: z.array(NodeStatusSchema) } }, description: "Nodes" } },
    }),
    (c) => c.json(nodeStore.getAll(), 200)
  );

  app.openapi(
    createRoute({
      method: "get", path: "/nodes/{id}",
      tags: ["Nodes"],
      summary: "Single node status",
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: NodeStatusSchema } }, description: "Node" },
        404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
      },
    }),
    (c) => {
      try {
        return c.json(nodeStore.get(c.req.valid("param").id), 200);
      } catch {
        return c.json({ error: "Node not found" }, 404);
      }
    }
  );

  app.openapi(
    createRoute({
      method: "post", path: "/nodes/{id}/signal",
      tags: ["Nodes"],
      summary: "Inject a signal into a specific node",
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                payload: z.any(),
                source: z.string().default("system"),
                trace: z.array(z.any()).default([]),
              }),
            },
          },
        },
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ queued: z.boolean(), nodeId: z.string(), queueDepth: z.number() }) } }, description: "Queued" },
        404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
      },
    }),
    (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      try {
        const { queueDepth } = engine.submitToNode(id, body.payload, body.source, body.trace);
        return c.json({ queued: true, nodeId: id, queueDepth }, 200);
      } catch {
        return c.json({ error: "Node not found" }, 404);
      }
    }
  );

  app.openapi(
    createRoute({
      method: "get", path: "/nodes/{id}/context",
      tags: ["Nodes"],
      summary: "Get all context keys for a node",
      request: { params: z.object({ id: z.string() }) },
      responses: { 200: { content: { "application/json": { schema: z.record(z.string()) } }, description: "Context" } },
    }),
    (c) => {
      const ctx = engine.getNodeContext(c.req.valid("param").id);
      return c.json(Object.fromEntries(ctx), 200);
    }
  );

  app.openapi(
    createRoute({
      method: "delete", path: "/nodes/{id}/context",
      tags: ["Nodes"],
      summary: "Clear all context for a node",
      request: { params: z.object({ id: z.string() }) },
      responses: { 200: { content: { "application/json": { schema: z.object({ cleared: z.boolean(), nodeId: z.string() }) } }, description: "Cleared" } },
    }),
    (c) => {
      const { id } = c.req.valid("param");
      engine.clearNodeContext(id);
      return c.json({ cleared: true, nodeId: id }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post", path: "/run",
      tags: ["Runs"],
      summary: "Submit a raw event to all leaf nodes",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                payload: z.any(),
                source: z.string().default("system"),
              }),
            },
          },
        },
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ runId: z.string(), status: z.string(), startedAt: z.string() }) } }, description: "Run started" },
      },
    }),
    (c) => {
      const body = c.req.valid("json");
      const event = {
        id: uuidv4(),
        source: body.source,
        payload: body.payload,
        timestamp: new Date().toISOString(),
      };
      const runId = engine.submitRun(event);
      const run = runStore.get(runId)!;
      return c.json({ runId, status: "running", startedAt: run.startedAt }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "get", path: "/runs/{runId}",
      tags: ["Runs"],
      summary: "Get status of a specific run",
      request: { params: z.object({ runId: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: RunRecordSchema } }, description: "Run" },
        404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
      },
    }),
    (c) => {
      const run = runStore.get(c.req.valid("param").runId);
      if (!run) return c.json({ error: "Run not found" }, 404);
      return c.json(run, 200);
    }
  );

  return app;
}
