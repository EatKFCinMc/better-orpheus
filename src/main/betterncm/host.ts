import { app } from "electron";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { data } from "../folders";
import { legacyPluginPath } from "./files";

export const root = resolve(data, "betterncm");
export const assets = () =>
  app.isPackaged ? join(process.resourcesPath, "betterncm") : resolve("assets/betterncm");
export const grantedReads = new Set<string>();
export const hostErrors: Record<string, string> = {};
export const token = randomBytes(32).toString("hex");
export let config: Record<string, string> = Object.create(null);
export const pathFor = (path: string) => legacyPluginPath(root, path);
export function readPath(path: string) {
  try {
    return pathFor(path);
  } catch (error) {
    const actual = fs.realpathSync(path.replaceAll("\\", "/"));
    if (grantedReads.has(actual)) return actual;
    throw error;
  }
}

const configFile = join(root, "config.json");

export function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        config = Object.assign(Object.create(null), parsed);
    } catch (error) {
      hostErrors.config = `Invalid config.json: ${String(error)}`;
    }
  }
}

export function writeConfig(key: string, value: string) {
  config[key] = value;
  fs.writeFileSync(configFile + ".tmp", JSON.stringify(config));
  fs.renameSync(configFile + ".tmp", configFile);
  delete hostErrors.config;
}

export const version = "1.3.4";

export function readDirectory(path: string) {
  return fs.readdirSync(path).map((name) => join(path, name));
}

export function readText(path: string) {
  return fs.readFileSync(readPath(path), "utf8");
}

export function mkdir(path: string) {
  fs.mkdirSync(path, { recursive: true });
}

export function rename(path: string, destination: string) {
  fs.renameSync(path, pathFor(destination));
}
