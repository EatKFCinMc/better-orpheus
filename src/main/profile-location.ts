import { existsSync, renameSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const legacyNames = ["open-orpheus", "open-orphesu"];

/** Migrate before opening databases or logs; never merge or overwrite profiles. */
export function packagedProfileLocation(appData: string): string {
  const target = join(appData, "better-orpheus");
  if (!existsSync(target)) {
    const source = legacyNames.map((name) => join(appData, name)).find(existsSync);
    if (source) renameSync(source, target);
  }
  return target;
}

/** Older page settings can retain absolute cache paths inside the renamed profile. */
export function relocatedProfilePath(path: string, profile: string): string {
  if (!path || basename(profile) !== "better-orpheus") return path;
  const normalized = resolve(path.replaceAll("\\", "/"));
  for (const name of legacyNames) {
    const oldRoot = resolve(dirname(profile), name);
    if (normalized === oldRoot || normalized.startsWith(oldRoot + sep)) {
      return join(profile, relative(oldRoot, normalized));
    }
  }
  return path;
}
