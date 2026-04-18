import fs from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";
import type { TreeConfig } from "../types.js";

const AgentConfigSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  tools: z.array(z.string()).default([]),
  children: z.array(z.string()).default([]),
});

const TreeConfigSchema = z.object({
  version: z.number().int().positive(),
  root: z.string().min(1),
  agents: z.array(AgentConfigSchema).min(1),
});

export function loadConfig(path: string): TreeConfig {
  const raw = fs.readFileSync(path, "utf8");
  const parsed = yaml.load(raw);
  const config = TreeConfigSchema.parse(parsed);

  const ids = new Set(config.agents.map((a) => a.id));

  if (ids.size !== config.agents.length) {
    throw new Error("Config has duplicate agent IDs");
  }

  if (!ids.has(config.root)) {
    throw new Error(`Root agent "${config.root}" not found in agents list`);
  }

  for (const agent of config.agents) {
    for (const child of agent.children) {
      if (!ids.has(child)) {
        throw new Error(`Agent "${agent.id}" references unknown child "${child}"`);
      }
    }
  }

  return config as TreeConfig;
}
