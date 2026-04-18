import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import type { Engine } from "../graph/builder.js";
import type { NodeStore, RunStore } from "./store.js";
import { createRoutes } from "./routes.js";

export function createApp(engine: Engine, nodeStore: NodeStore, runStore: RunStore) {
  const app = new OpenAPIHono();

  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["Content-Type"],
  }));

  const routes = createRoutes(engine, nodeStore, runStore);
  app.route("/", routes);

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: { title: "Neuron Agent Engine", version: "0.1.0" },
  });

  app.get("/doc", swaggerUI({ url: "/openapi.json" }));

  return app;
}
