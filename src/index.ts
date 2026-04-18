import { serve } from "@hono/node-server";
import { loadConfig } from "./config/loader.js";
import { createModel } from "./graph/model.js";
import { Engine } from "./graph/builder.js";
import { NodeStore, RunStore } from "./api/store.js";
import { createApp } from "./api/server.js";

const args = process.argv.slice(2);
const configIdx = args.indexOf("--config");
if (configIdx === -1 || !args[configIdx + 1]) {
  process.stderr.write("Usage: node dist/index.js --config <path.yaml>\n");
  process.exit(1);
}

const configPath = args[configIdx + 1];
const port = Number(process.env["PORT"] ?? 3000);
const workdir = process.env["WORKDIR"] ?? "./workspace";
const debug = args.includes("--debug") || process.env["DEBUG"] === "true";

const config = loadConfig(configPath);
const nodeStore = new NodeStore();
const runStore = new RunStore();
const engine = new Engine(config, createModel, nodeStore, runStore, workdir, debug);

engine.start();

const app = createApp(engine, nodeStore, runStore);

const server = serve({ fetch: app.fetch, port }, () => {
  process.stdout.write(`Neuron Agent Engine running on http://localhost:${port}\n`);
  process.stdout.write(`  Config: ${configPath} (${config.agents.length} agents)\n`);
  process.stdout.write(`  Swagger UI: http://localhost:${port}/doc\n`);
});

function shutdown() {
  process.stdout.write("\nShutting down...\n");
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
