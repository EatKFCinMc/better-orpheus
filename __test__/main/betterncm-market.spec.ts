import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  removeInstalledPath,
  listInstalledPlugins,
  removeSelectedPlugins,
} from "../../src/main/betterncm/installation";
it("removes archive and generated runtime without touching other plugins or data", () => {
  const root = mkdtempSync(join(tmpdir(), "bncm-uninstall-"));
  try {
    mkdirSync(join(root, "plugins"));
    mkdirSync(join(root, "plugins_runtime/Test-1"), { recursive: true });
    writeFileSync(join(root, "plugins/Test-1.plugin"), "fixture");
    writeFileSync(join(root, "plugins/Keep.plugin"), "keep");
    writeFileSync(join(root, "plugins_runtime/Test-1/main.js"), "fixture");
    removeInstalledPath(root, "plugins/Test-1.plugin");
    expect(existsSync(join(root, "plugins/Test-1.plugin"))).toBe(false);
    expect(existsSync(join(root, "plugins_runtime/Test-1"))).toBe(false);
    expect(existsSync(join(root, "plugins/Keep.plugin"))).toBe(true);
    expect(() => removeInstalledPath(root, "..")).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("counts installs once and clears all plugin copies while retaining configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "bncm-clear-"));
  try {
    mkdirSync(join(root, "plugins"));
    mkdirSync(join(root, "plugins_runtime/Test-1"), { recursive: true });
    mkdirSync(join(root, "plugins_dev/Development"), { recursive: true });
    writeFileSync(join(root, "plugins/Test-1.plugin"), "fixture");
    writeFileSync(join(root, "plugins/PluginMarket.plugin"), "fixture");
    writeFileSync(join(root, "plugins_runtime/Test-1/manifest.json"), "{}");
    writeFileSync(join(root, "plugins_dev/Development/manifest.json"), "{}");
    writeFileSync(join(root, "config.json"), "{}");
    expect(listInstalledPlugins(root).length).toBe(3);
    expect(() =>
      removeSelectedPlugins(root, ["plugins/Test-1.plugin", "plugins/PluginMarket.plugin"])
    ).toThrow("PluginMarket cannot be removed");
    expect(existsSync(join(root, "plugins/Test-1.plugin"))).toBe(true);
    removeSelectedPlugins(
      root,
      listInstalledPlugins(root)
        .filter((plugin) => !plugin.protected)
        .map((plugin) => plugin.id)
    );
    expect(listInstalledPlugins(root).map((plugin) => plugin.id)).toEqual([
      "plugins/PluginMarket.plugin",
    ]);
    expect(existsSync(join(root, "plugins_runtime/Test-1"))).toBe(false);
    expect(existsSync(join(root, "plugins_dev/Development"))).toBe(false);
    expect(existsSync(join(root, "plugins"))).toBe(true);
    expect(existsSync(join(root, "config.json"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("deletes only selected installs and rejects arbitrary paths before mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "bncm-select-"));
  try {
    mkdirSync(join(root, "plugins"));
    mkdirSync(join(root, "plugins_runtime/Test-1"), { recursive: true });
    writeFileSync(join(root, "plugins/Test-1.plugin"), "fixture");
    writeFileSync(join(root, "plugins/Keep.plugin"), "fixture");
    writeFileSync(
      join(root, "plugins_runtime/Test-1/manifest.json"),
      JSON.stringify({ name: "Test", version: "1" })
    );
    expect(listInstalledPlugins(root)).toContainEqual({
      id: "plugins/Test-1.plugin",
      name: "Test",
      version: "1",
      development: false,
      protected: false,
    });
    expect(() =>
      removeSelectedPlugins(root, ["plugins/Test-1.plugin", "../config.json"])
    ).toThrow();
    expect(existsSync(join(root, "plugins/Test-1.plugin"))).toBe(true);
    removeSelectedPlugins(root, ["plugins/Test-1.plugin"]);
    expect(existsSync(join(root, "plugins_runtime/Test-1"))).toBe(false);
    expect(listInstalledPlugins(root).map((plugin) => plugin.id)).toEqual(["plugins/Keep.plugin"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
