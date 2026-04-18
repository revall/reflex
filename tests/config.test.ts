import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadConfig } from "../src/config/loader.js";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");
const configDir = path.resolve(import.meta.dirname, "../config");

describe("loadConfig", () => {
  it("parses example.yaml successfully", () => {
    const config = loadConfig(path.join(configDir, "example.yaml"));
    expect(config.version).toBe(1);
    expect(config.root).toBe("root_agent");
    expect(config.agents).toHaveLength(3);
  });

  it("parses org-alert.yaml successfully", () => {
    const config = loadConfig(path.join(fixturesDir, "org-alert.yaml"));
    expect(config.root).toBe("ceo");
    expect(config.agents.length).toBeGreaterThan(10);
  });

  it("identifies leaf nodes (no children)", () => {
    const config = loadConfig(path.join(configDir, "example.yaml"));
    const leaves = config.agents.filter((a) => a.children.length === 0);
    expect(leaves.map((a) => a.id)).toEqual(["agent_a", "agent_b"]);
  });

  it("throws on missing root agent", () => {
    expect(() =>
      loadConfig(path.join(fixturesDir, "invalid-root.yaml"))
    ).toThrow(/Root agent/);
  });

  it("throws on unknown child ID", () => {
    expect(() =>
      loadConfig(path.join(fixturesDir, "invalid-child.yaml"))
    ).toThrow(/unknown child/);
  });
});
