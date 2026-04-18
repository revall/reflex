import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Blocks requests to loopback, link-local, and RFC-1918 private ranges to
// prevent SSRF. Cloud metadata endpoints (169.254.x.x) are also covered.
function assertSafeUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: "${rawUrl}"`);
  }

  const host = parsed.hostname;

  // Reject non-http(s) schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: "${parsed.protocol}"`);
  }

  // Resolve to IPv4 octets when possible for range checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (
      a === 10 ||                          // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) ||          // 192.168.0.0/16
      a === 127 ||                         // 127.0.0.0/8 loopback
      (a === 169 && b === 254)             // 169.254.0.0/16 link-local / metadata
    ) {
      throw new Error(`Blocked private/reserved address: "${host}"`);
    }
  }

  // Block localhost by name
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error(`Blocked private host: "${host}"`);
  }
}

export function createHttpTools() {
  const httpGet = tool(
    async ({ url, headers }) => {
      assertSafeUrl(url);
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
      assertSafeUrl(url);
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
