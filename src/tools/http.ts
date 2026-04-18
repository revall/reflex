import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function createHttpTools() {
  const httpGet = tool(
    async ({ url, headers }) => {
      const res = await fetch(url, { headers });
      return res.text();
    },
    {
      name: "http_get",
      description: "Make an HTTP GET request and return the response body.",
      schema: z.object({
        url: z.string().url(),
        headers: z.record(z.string()).optional().describe("Optional request headers"),
      }),
    }
  );

  const httpPost = tool(
    async ({ url, body, headers }) => {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json", ...headers },
      });
      return res.text();
    },
    {
      name: "http_post",
      description: "Make an HTTP POST request and return the response body.",
      schema: z.object({
        url: z.string().url(),
        body: z.string().describe("Request body as string"),
        headers: z.record(z.string()).optional().describe("Optional request headers"),
      }),
    }
  );

  return [httpGet, httpPost];
}
