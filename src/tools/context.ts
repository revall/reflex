import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolContext } from "./index.js";

export function createContextTools(ctx: ToolContext) {
  const contextGet = tool(
    ({ key }) => Promise.resolve(ctx.nodeContext.get(key) ?? "null"),
    {
      name: "context_get",
      description: "Get a value from this node's persistent context store.",
      schema: z.object({ key: z.string() }),
    }
  );

  const contextSet = tool(
    ({ key, value }) => {
      ctx.nodeContext.set(key, value);
      return Promise.resolve("ok");
    },
    {
      name: "context_set",
      description: "Store a value in this node's persistent context store.",
      schema: z.object({ key: z.string(), value: z.string() }),
    }
  );

  const contextDelete = tool(
    ({ key }) => {
      ctx.nodeContext.delete(key);
      return Promise.resolve("ok");
    },
    {
      name: "context_delete",
      description: "Delete a key from this node's persistent context store.",
      schema: z.object({ key: z.string() }),
    }
  );

  return [contextGet, contextSet, contextDelete];
}
