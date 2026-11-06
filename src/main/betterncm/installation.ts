import { dirname, join, basename } from "node:path";
import { rmSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { pluginPath } from "./files";
export function removeInstalledPath(root: string, input: string) {
  const path = pluginPath(root, input);
  if (path === root) throw new Error("Cannot remove data root");
  rmSync(path, { recursive: true, force: true });
  if (dirname(path) === join(root, "plugins") && path.endsWith(".plugin")) {
    rmSync(pluginPath(root, join("plugins_runtime", basename(path, ".plugin"))), {
      recursive: true,
      force: true,
    });
  }
}

import type { InstalledPlugin } from "@shared/types/manage";

/** Archive installs and development folders; extracted copies are not duplicated. */
export function listInstalledPlugins(root: string): InstalledPlugin[] {
  const plugins: InstalledPlugin[] = [];
  for (const folder of ["plugins", "plugins_dev"]) {
    const directory = join(root, folder);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const development = folder === "plugins_dev";
      if (development ? !entry.isDirectory() : !entry.isFile() || !entry.name.endsWith(".plugin"))
        continue;
      const id = `${folder}/${entry.name}`;
      const fallback = development ? entry.name : basename(entry.name, ".plugin");
      let manifest: { name?: unknown; version?: unknown; slug?: unknown } = {};
      try {
        const manifestPath = development
          ? `${id}/manifest.json`
          : `plugins_runtime/${fallback}/manifest.json`;
        manifest = JSON.parse(readFileSync(pluginPath(root, manifestPath), "utf8")) || {};
      } catch {
        /* Broken installs must remain visible and removable. */
      }
      plugins.push({
        id,
        name: typeof manifest.name === "string" ? manifest.name : fallback,
        version: typeof manifest.version === "string" ? manifest.version : "",
        development,
        protected:
          /^pluginmarket(?:-\d.*)?$/i.test(fallback) ||
          [manifest.name, manifest.slug].some(
            (value) => typeof value === "string" && value.toLowerCase() === "pluginmarket"
          ),
      });
    }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function removeSelectedPlugins(root: string, ids: string[]) {
  const installed = new Map(listInstalledPlugins(root).map((plugin) => [plugin.id, plugin]));
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !installed.has(id)))
    throw new Error("Invalid installed plugin selection");
  if (ids.some((id) => installed.get(id)?.protected))
    throw new Error("PluginMarket cannot be removed");
  // Validate every path before deleting any files.
  const paths = [...new Set(ids)].map((id) => pluginPath(root, id));
  for (const path of paths) removeInstalledPath(root, path);
}
