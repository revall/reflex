import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../src/tools/index.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workdir: "/workspace",
    nodeContext: new Map(),
    ...overrides,
  };
}

// ── file tools ────────────────────────────────────────────────────────────────

describe("file tools", () => {
  beforeEach(() => {
    vi.mock("node:fs", () => ({
      default: {
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      },
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it("file_read returns file content", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue("hello world");

    const { createFileTools } = await import("../src/tools/file.js");
    const [fileRead] = createFileTools(makeCtx());
    const result = await fileRead.invoke({ path: "notes.txt" });

    expect(result).toBe("hello world");
    expect(fs.readFileSync).toHaveBeenCalledWith("/workspace/notes.txt", "utf8");
  });

  it("file_write writes content and returns ok", async () => {
    const fs = (await import("node:fs")).default;
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

    const { createFileTools } = await import("../src/tools/file.js");
    const [, fileWrite] = createFileTools(makeCtx());
    const result = await fileWrite.invoke({ path: "out.txt", content: "data" });

    expect(result).toBe("ok");
    expect(fs.writeFileSync).toHaveBeenCalledWith("/workspace/out.txt", "data", "utf8");
  });

  it("file_read blocks path traversal", async () => {
    const { createFileTools } = await import("../src/tools/file.js");
    const [fileRead] = createFileTools(makeCtx());
    await expect(fileRead.invoke({ path: "../../etc/passwd" })).rejects.toThrow(/traversal/);
  });

  it("file_write blocks path traversal", async () => {
    const { createFileTools } = await import("../src/tools/file.js");
    const [, fileWrite] = createFileTools(makeCtx());
    await expect(fileWrite.invoke({ path: "../secret.txt", content: "x" })).rejects.toThrow(/traversal/);
  });
});

// ── http tools ────────────────────────────────────────────────────────────────

describe("http tools", () => {
  afterEach(() => vi.restoreAllMocks());

  it("http_get fetches URL and returns body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => '{"ok":true}' });
    vi.stubGlobal("fetch", fetchMock);

    const { createHttpTools } = await import("../src/tools/http.js");
    const [httpGet] = createHttpTools();
    const result = await httpGet.invoke({ url: "https://example.com/api" });

    expect(result).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api", expect.objectContaining({}));
  });

  it("http_post sends body and returns response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => "created" });
    vi.stubGlobal("fetch", fetchMock);

    const { createHttpTools } = await import("../src/tools/http.js");
    const [, httpPost] = createHttpTools();
    const result = await httpPost.invoke({ url: "https://example.com/api", body: '{"x":1}' });

    expect(result).toBe("created");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api",
      expect.objectContaining({ method: "POST", body: '{"x":1}' })
    );
  });

  it("http_get passes custom headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => "ok" });
    vi.stubGlobal("fetch", fetchMock);

    const { createHttpTools } = await import("../src/tools/http.js");
    const [httpGet] = createHttpTools();
    await httpGet.invoke({ url: "https://example.com", headers: { Authorization: "Bearer token" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ headers: { Authorization: "Bearer token" } })
    );
  });
});

// ── context tools ─────────────────────────────────────────────────────────────

describe("context tools", () => {
  it("context_set stores a value and context_get retrieves it", async () => {
    const { createContextTools } = await import("../src/tools/context.js");
    const ctx = makeCtx();
    const [contextGet, contextSet] = createContextTools(ctx);

    await contextSet.invoke({ key: "my_key", value: "my_value" });
    const result = await contextGet.invoke({ key: "my_key" });

    expect(result).toBe("my_value");
  });

  it("context_get returns 'null' string for missing key", async () => {
    const { createContextTools } = await import("../src/tools/context.js");
    const [contextGet] = createContextTools(makeCtx());
    const result = await contextGet.invoke({ key: "missing" });
    expect(result).toBe("null");
  });

  it("context_delete removes a key", async () => {
    const { createContextTools } = await import("../src/tools/context.js");
    const ctx = makeCtx();
    const [contextGet, contextSet, contextDelete] = createContextTools(ctx);

    await contextSet.invoke({ key: "k", value: "v" });
    await contextDelete.invoke({ key: "k" });
    const result = await contextGet.invoke({ key: "k" });

    expect(result).toBe("null");
  });

  it("context is isolated per ToolContext instance", async () => {
    const { createContextTools } = await import("../src/tools/context.js");
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();
    const [, set1] = createContextTools(ctx1);
    const [get2] = createContextTools(ctx2);

    await set1.invoke({ key: "shared", value: "from-ctx1" });
    const result = await get2.invoke({ key: "shared" });

    expect(result).toBe("null");
  });
});

// ── buildTools registry ───────────────────────────────────────────────────────

describe("buildTools", () => {
  it("returns only requested tools", async () => {
    const { buildTools } = await import("../src/tools/index.js");
    const tools = buildTools(["file"], makeCtx());
    const names = tools.map((t) => t.name);
    expect(names).toContain("file_read");
    expect(names).toContain("file_write");
    expect(names).not.toContain("http_get");
    expect(names).not.toContain("context_get");
  });

  it("returns all tools for combined names", async () => {
    const { buildTools } = await import("../src/tools/index.js");
    const tools = buildTools(["file", "http", "context"], makeCtx());
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "file_read", "file_write",
      "http_get", "http_post",
      "context_get", "context_set", "context_delete",
    ]));
  });

  it("returns empty array for unknown tool names", async () => {
    const { buildTools } = await import("../src/tools/index.js");
    const tools = buildTools(["nonexistent"], makeCtx());
    expect(tools).toHaveLength(0);
  });
});
