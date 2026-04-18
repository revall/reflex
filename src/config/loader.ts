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

// DFS cycle detection — a cycle would cause signals to loop forever
function hasCycle(
  id: string,
  childMap: Map<string, string[]>,
  visited: Set<string>,
  stack: Set<string>
): boolean {
  visited.add(id);
  stack.add(id);
  for (const child of childMap.get(id) ?? []) {
    if (stack.has(child)) return true;
    if (!visited.has(child) && hasCycle(child, childMap, visited, stack)) return true;
  }
  stack.delete(id);
  return false;
}

export function loadConfig(filePath: string): TreeConfig {
  const raw = fs.readFileSync(filePath, "utf8");
  const config = TreeConfigSchema.parse(yaml.load(raw));
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

  const childMap = new Map(config.agents.map((a) => [a.id, a.children]));
  const visited = new Set<string>();
  for (const id of ids) {
    if (!visited.has(id) && hasCycle(id, childMap, visited, new Set())) {
      throw new Error(`Config contains a cycle involving agent "${id}"`);
    }
  }

  return config as TreeConfig;
}
