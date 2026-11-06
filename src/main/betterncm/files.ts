import { resolve, relative, isAbsolute, sep } from "node:path";
import { existsSync, realpathSync } from "node:fs";
export function pluginPath(root: string, input: string): string {
  const path = resolve(root, input.replaceAll("\\", "/"));
  const check = (candidate: string) => {
    const rel = relative(root, candidate);
    if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return;
    throw new Error("BetterNCM path is outside its data directory");
  };
  check(path);
  let parent = path;
  while (!existsSync(parent)) parent = resolve(parent, "..");
  check(realpathSync(parent));
  return path;
}

/** Windows API callers use /Cache as a data-root path, not a Linux filesystem root. */
export function legacyPluginPath(root: string, input: string): string {
  try {
    return pluginPath(root, input);
  } catch (error) {
    const path = input.replaceAll("\\", "/");
    const first = path.split("/")[1];
    // Preserve real Linux absolute paths and selected-file permission checks.
    if (path.startsWith("/") && first && !existsSync("/" + first))
      return pluginPath(root, path.slice(1));
    throw error;
  }
}
