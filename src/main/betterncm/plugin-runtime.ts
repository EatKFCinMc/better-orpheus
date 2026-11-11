import { join, dirname, basename } from "node:path";
import * as fs from "node:fs";
import unzipper from "unzipper";
import { mainWindow } from "../window";
import { listInstalledPlugins, removeSelectedPlugins, removeInstalledPath } from "./installation";
import { pluginPath } from "./files";
import { setHijackPlugins } from "./hijacks";
import { root, assets, config, hostErrors, pathFor, loadConfig } from "./host";

async function unpack(path: string, dest: string) {
  const archive = await unzipper.Open.file(path);
  for (const entry of archive.files) {
    if (entry.type !== "File") continue;
    const target = pluginPath(dest, entry.path);
    fs.mkdirSync(dirname(target), { recursive: true });
    fs.writeFileSync(target, await entry.buffer());
  }
}
let pluginOperation: Promise<unknown> = Promise.resolve();
function withPluginOperation<T>(operation: () => Promise<T> | T): Promise<T> {
  const result = pluginOperation.then(operation);
  pluginOperation = result.catch(() => {});
  return result;
}
export async function reloadPlugins() {
  await withPluginOperation(reloadPluginFiles);
  refreshHijacks();
}

export function removePath(input: string) {
  removeInstalledPath(root, input);
  refreshHijacks();
}
export function getInstalledPlugins() {
  return withPluginOperation(() => listInstalledPlugins(root));
}
export function deleteInstalledPlugins(ids: string[]) {
  return withPluginOperation(() => {
    removeSelectedPlugins(root, ids);
    if (!ids.length) return;
    for (const key of Object.keys(hostErrors)) delete hostErrors[key];
    refreshHijacks();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
  });
}
async function reloadPluginFiles() {
  const expected = new Set(
    fs
      .readdirSync(join(root, "plugins"))
      .filter((name) => name.endsWith(".plugin"))
      .map((name) => basename(name, ".plugin"))
  );
  for (const name of fs.readdirSync(join(root, "plugins_runtime"))) {
    if (!expected.has(name))
      fs.rmSync(pathFor(`plugins_runtime/${name}`), { recursive: true, force: true });
  }
  for (const name of fs.readdirSync(join(root, "plugins"))) {
    if (!name.endsWith(".plugin")) continue;
    const dest = pathFor(`plugins_runtime/${basename(name, ".plugin")}`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    try {
      await unpack(pathFor(`plugins/${name}`), dest);
      fs.writeFileSync(join(dest, ".plugin.path.meta"), pathFor(`plugins/${name}`));
      delete hostErrors[name];
    } catch (error) {
      hostErrors[name] = String(error);
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }
}
export function refreshHijacks() {
  if (config["cc.microblock.betterncm.cpp_side_inject_feature_disabled"] === "true") {
    setHijackPlugins([]);
    return;
  }
  const manifests = [];
  for (const folder of ["plugins_runtime", "plugins_dev"]) {
    for (const entry of fs.readdirSync(join(root, folder))) {
      try {
        const manifest = JSON.parse(
          fs.readFileSync(join(root, folder, entry, "manifest.json"), "utf8")
        );
        if (!manifest.native_plugin) manifests.push(manifest);
      } catch (error) {
        console.warn("BetterNCM manifest skipped", entry, error);
      }
    }
  }
  setHijackPlugins(manifests);
}

export async function initializePlugins() {
  const firstSetup = !fs.existsSync(join(root, "plugins"));
  for (const dir of ["plugins", "plugins_runtime", "plugins_dev"])
    fs.mkdirSync(join(root, dir), { recursive: true });
  loadConfig();
  if (firstSetup)
    fs.copyFileSync(
      join(assets(), "PluginMarket.plugin"),
      join(root, "plugins", "PluginMarket.plugin")
    );
  await reloadPlugins();
}
