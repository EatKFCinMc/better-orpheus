import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { satisfies } from "semver";
import { pluginPath } from "./files";
export function getStartupScripts(root: string, version: string) {
  const scripts = new Map<string, { slug: string; source: string }>();
  for (const folder of ["plugins_runtime", "plugins_dev"])
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const directory = pluginPath(root, join(folder, entry.name));
        const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
        if (
          manifest.native_plugin ||
          (manifest["ncm-version-req"] &&
            !satisfies(version, manifest["ncm-version-req"], { loose: true }))
        )
          continue;
        const slug =
          manifest.slug || manifest.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "-");
        const file = pluginPath(directory, manifest.startup_script || "startup_script.js");
        scripts.delete(slug);
        if (existsSync(file)) scripts.set(slug, { slug, source: readFileSync(file, "utf8") });
      } catch (error) {
        console.warn("BetterNCM startup script skipped", entry.name, error);
      }
    }
  return [...scripts.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
