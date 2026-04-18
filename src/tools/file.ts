import fs from "node:fs";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolContext } from "./index.js";

function resolveSafe(workdir: string, filePath: string): string {
  const resolved = path.resolve(workdir, filePath);
  if (!resolved.startsWith(path.resolve(workdir))) {
    throw new Error(`Path traversal blocked: "${filePath}"`);
  }
  return resolved;
}

export function createFileTools(ctx: ToolContext) {
  const fileRead = tool(
    ({ path: filePath }) => {
      const abs = resolveSafe(ctx.workdir, filePath);
      return Promise.resolve(fs.readFileSync(abs, "utf8"));
    },
    {
      name: "file_read",
      description: "Read a file from the workspace. Path is relative to workdir.",
      schema: z.object({ path: z.string().describe("Relative file path") }),
    }
  );

  const fileWrite = tool(
    ({ path: filePath, content }) => {
      const abs = resolveSafe(ctx.workdir, filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
      return Promise.resolve("ok");
    },
    {
      name: "file_write",
      description: "Write content to a file in the workspace. Path is relative to workdir.",
      schema: z.object({
        path: z.string().describe("Relative file path"),
        content: z.string().describe("Content to write"),
      }),
    }
  );

  return [fileRead, fileWrite];
}
