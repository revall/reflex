import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createFileTools } from "./file.js";
import { createHttpTools } from "./http.js";
import { createContextTools } from "./context.js";

export interface ToolContext {
  workdir: string;
  nodeContext: Map<string, string>;
}

export function buildTools(names: string[], ctx: ToolContext): DynamicStructuredTool[] {
  const tools: DynamicStructuredTool[] = [];
  for (const name of names) {
    if (name === "file") tools.push(...(createFileTools(ctx) as DynamicStructuredTool[]));
    else if (name === "http") tools.push(...(createHttpTools() as DynamicStructuredTool[]));
    else if (name === "context") tools.push(...(createContextTools(ctx) as DynamicStructuredTool[]));
  }
  return tools;
}
