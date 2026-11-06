import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginPath, legacyPluginPath } from "../../src/main/betterncm/files";
describe("BetterNCM file boundary", () => {
  it("accepts Linux and legacy separators while rejecting escapes and symlinks", () => {
    const temp = mkdtempSync(join(tmpdir(), "bncm-boundary-"));
    const root = join(temp, "data");
    mkdirSync(root);
    try {
      expect(pluginPath(root, "plugins\\example\\manifest.json")).toBe(
        join(root, "plugins/example/manifest.json")
      );
      expect(() => pluginPath(root, "../outside")).toThrow();
      symlinkSync(temp, join(root, "escape"));
      expect(() => pluginPath(root, "escape/secret")).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

it("maps Windows data-root virtual paths without granting real Linux filesystem access", () => {
  const root = mkdtempSync(join(tmpdir(), "bncm-virtual-"));
  try {
    expect(legacyPluginPath(root, "/BNCMVirtualCache/file")).toBe(
      join(root, "BNCMVirtualCache/file")
    );
    expect(legacyPluginPath(root, join(root, "file"))).toBe(join(root, "file"));
    expect(() => legacyPluginPath(root, "/etc/passwd")).toThrow();
    expect(() => legacyPluginPath(root, "../escape")).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
