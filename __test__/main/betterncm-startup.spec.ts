import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getStartupScripts } from "../../src/main/betterncm/startup";
it("discovers default/custom startup scripts, honours versions/native limits and lets development copies override archives", () => {
  const root = mkdtempSync(join(tmpdir(), "bncm-startup-"));
  try {
    for (const folder of ["plugins_runtime", "plugins_dev"]) mkdirSync(join(root, folder));
    const add = (folder: string, name: string, manifest: object, file: string, source: string) => {
      const dir = join(root, folder, name);
      mkdirSync(dir);
      writeFileSync(join(dir, "manifest.json"), JSON.stringify({ name, slug: name, ...manifest }));
      writeFileSync(join(dir, file), source);
    };
    add("plugins_runtime", "Standard", {}, "startup_script.js", "old");
    add("plugins_dev", "Standard", {}, "startup_script.js", "development");
    add("plugins_runtime", "Custom", { startup_script: "boot.js" }, "boot.js", "custom");
    add("plugins_runtime", "Future", { "ncm-version-req": ">=3" }, "startup_script.js", "future");
    add("plugins_runtime", "Native", { native_plugin: "x.dll" }, "startup_script.js", "native");
    expect(getStartupScripts(root, "2.10.13")).toEqual([
      { slug: "Custom", source: "custom" },
      { slug: "Standard", source: "development" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
