import { executePluginCommand } from "./commands";
import { getStartupScripts } from "./startup";
import versions from "../../../versions.json";
import {
  unpackSync,
  directorySnapshot,
  mountedDirectoryUrl,
  dialogFilters,
  getDisks,
} from "./fs-helpers";
import { mainWindow } from "../window";
import { listInstalledPlugins, removeSelectedPlugins } from "./installation";
import { removeInstalledPath } from "./installation";
import { app, BrowserWindow, ipcMain, protocol, dialog, nativeTheme, shell } from "electron";
import { resolve, join, dirname, basename, extname } from "node:path";
import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import mime from "mime";
import unzipper from "unzipper";
import { data } from "../folders";
import { setHijackPlugins, getSucceededHijacks } from "./hijacks";
import { pluginPath, legacyPluginPath } from "./files";

const root = resolve(data, "betterncm");
const assets = () =>
  app.isPackaged ? join(process.resourcesPath, "betterncm") : resolve("assets/betterncm");
const grantedReads = new Set<string>();
const mountedFiles = new Map<string, string>();
const hostErrors: Record<string, string> = {};
const token = randomBytes(32).toString("hex");
let config: Record<string, string> = Object.create(null);
const pathFor = (path: string) => legacyPluginPath(root, path);
function readPath(path: string) {
  try {
    return pathFor(path);
  } catch (error) {
    const actual = fs.realpathSync(path.replaceAll("\\", "/"));
    if (grantedReads.has(actual)) return actual;
    throw error;
  }
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
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
function reloadPlugins() {
  return withPluginOperation(reloadPluginFiles);
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
function refreshHijacks() {
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

function properties(path: string) {
  const stat = fs.lstatSync(path);
  return {
    name: basename(path),
    path: dirname(path),
    extension: extname(path),
    type: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
    size: stat.size,
    lastModified: stat.mtimeMs + 11644473600000,
    hidden: basename(path).startsWith("."),
    system: false,
  };
}
function nativeCall(name: string, args: string[], wnd: BrowserWindow) {
  const path = () => pathFor(args[0]);
  switch (name) {
    case "internal.bootstrap":
      return bootstrapPayload(args[0] === "true");
    case "fs.watchSnapshot":
      return directorySnapshot(root, args[0]);
    case "fs.unzip":
      return unpackSync(readPath(args[0]), pathFor(args[1]));
    case "fs.getDisks":
      return getDisks();
    case "fs.getLibraries":
      return ["desktop", "downloads", "documents", "pictures", "music", "videos"].map((key) => ({
        name: key[0].toUpperCase() + key.slice(1),
        path: app.getPath(key as "desktop"),
      }));
    case "fs.exists":
      return fs.existsSync(readPath(args[0]));
    case "fs.readDir":
      return fs.readdirSync(path()).map((n) => join(path(), n));
    case "fs.getProperties":
      return properties(readPath(args[0]));
    case "fs.readDirWithDetails":
      return fs
        .readdirSync(path())
        .map((n) => ({ ...properties(join(path(), n)), path: join(path(), n) }));
    case "fs.readFileText":
      return fs.readFileSync(readPath(args[0]), "utf8");
    case "fs.writeFileText":
      fs.mkdirSync(dirname(path()), { recursive: true });
      fs.writeFileSync(path(), args[1]);
      return true;
    case "fs.mkdir":
      fs.mkdirSync(path(), { recursive: true });
      return true;
    case "fs.remove":
      removeInstalledPath(root, args[0]);
      refreshHijacks();
      return true;
    case "fs.rename":
      fs.renameSync(path(), pathFor(args[1]));
      return true;
    case "app.version":
      return "1.3.4";
    case "app.datapath":
      return root;
    case "app.ncmpath":
      return app.getAppPath();
    case "app.reloadIgnoreCache":
      void reloadPlugins()
        .then(() => {
          refreshHijacks();
          if (!wnd.isDestroyed()) wnd.webContents.reloadIgnoringCache();
        })
        .catch((error) => LOGGER.error({ err: error }, "BetterNCM reload failed"));
      return true;
    case "app.restart":
      app.relaunch({ args: process.argv.slice(1) });
      app.quit();
      return true;
    case "app.auto_update":
      throw new Error(
        "BetterNCM API unsupported on Linux: app.auto_update; use PluginMarket updates"
      );
    case "app.crash":
      throw new Error("BetterNCM debug crash API is disabled");
    case "test.add":
      if (
        args.length !== 2 ||
        args.some((value) => typeof value !== "number" || !Number.isFinite(value))
      )
        throw new TypeError("Expected two numbers");
      return Number(args[0]) + Number(args[1]);
    case "test.m.i.c.r.o.b.l.o.c.k":
      if (
        args.length !== 2 ||
        args.some((value) => typeof value !== "number" || !Number.isFinite(value))
      )
        throw new TypeError("Expected two numbers");
      return "🍊🍊🍊" + (Number(args[0]) + Number(args[1])).toFixed(6);
    case "native_plugin.getRegisteredAPIs":
      return [];
    default:
      throw new Error(`BetterNCM API unsupported on Linux: ${name}`);
  }
}
function isTrustedCaller(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  if (event.senderFrame !== event.sender.mainFrame || !event.senderFrame) return false;
  const url = new URL(event.senderFrame.url);
  return (
    url.protocol === "orpheus:" && url.hostname === "orpheus" && url.pathname === "/pub/app.html"
  );
}
export async function initializeBetterNCM() {
  const firstSetup = !fs.existsSync(join(root, "plugins"));
  for (const dir of ["plugins", "plugins_runtime", "plugins_dev"])
    fs.mkdirSync(join(root, dir), { recursive: true });
  const configFile = join(root, "config.json");
  if (fs.existsSync(configFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        config = Object.assign(Object.create(null), parsed);
    } catch (error) {
      hostErrors.config = `Invalid config.json: ${String(error)}`;
    }
  }
  if (firstSetup)
    fs.copyFileSync(
      join(assets(), "PluginMarket.plugin"),
      join(root, "plugins", "PluginMarket.plugin")
    );
  await reloadPlugins();
  refreshHijacks();
  ipcMain.on("betterncm.native", (event, name: string, args: string[]) => {
    try {
      const wnd = BrowserWindow.fromWebContents(event.sender);
      if (!wnd || !isTrustedCaller(event)) throw new Error("Invalid BetterNCM caller");
      event.returnValue = { value: nativeCall(name, args, wnd) };
    } catch (err) {
      event.returnValue = { error: String(err) };
    }
  });
  ipcMain.handle("betterncm.nativeAsync", async (event, name: string, args: string[]) => {
    if (!isTrustedCaller(event) || !BrowserWindow.fromWebContents(event.sender))
      throw new Error("Invalid BetterNCM caller");
    if (name === "fs.readFileText") return fs.promises.readFile(readPath(args[0]), "utf8");
    throw new Error(`Unsupported async API: ${name}`);
  });
  protocol.handle("betterncm", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "runtime") return new Response(null, { status: 404 });
      const p = url.searchParams;
      if (
        !url.pathname.startsWith("/local/") &&
        !url.pathname.startsWith("/mounted/") &&
        url.pathname !== "/api/app/get_win_position" &&
        request.headers.get("BETTERNCM_API_KEY") !== token
      )
        return new Response(null, { status: 401 });
      if (url.pathname.startsWith("/mounted/")) {
        const file = mountedFiles.get(url.pathname.slice(9));
        if (!file) return new Response(null, { status: 404 });
        return new Response(fs.readFileSync(file), {
          headers: { "Content-Type": mime.getType(file) || "application/octet-stream" },
        });
      }
      if (url.pathname.startsWith("/local/")) {
        const file = pathFor(decodeURIComponent(url.pathname.slice(7)));
        return new Response(fs.readFileSync(file), {
          headers: { "Content-Type": mime.getType(file) || "application/octet-stream" },
        });
      }
      const path = () => pathFor(p.get("path") || "");
      const text = (value: string) => new Response(value);
      switch (url.pathname) {
        case "/api/internal/framework.css":
          return new Response(fs.readFileSync(join(assets(), "framework.css")), {
            headers: { "Content-Type": "text/css" },
          });
        case "/api/app/compatibility":
          return json({
            platform: process.platform,
            nativePlugins: false,
            resourceHijacks: true,
            errors: hostErrors,
          });
        case "/api/app/version":
          return text("1.3.4");
        case "/api/app/datapath":
          return text(root);
        case "/api/app/show_console": {
          const wnd = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().startsWith("orpheus://orpheus/pub/app.html")
          );
          if (p.has("hide")) wnd?.webContents.closeDevTools();
          else wnd?.webContents.openDevTools({ mode: "detach" });
          return text("ok");
        }

        case "/api/app/bg_screenshot":
          return new Response("Background-only screen capture is unsupported on this host", {
            status: 501,
          });
        case "/api/app/exec_ele":
        case "/api/app/exec": {
          return executePluginCommand(await request.text(), {
            shell,
            pathFor,
            elevate: url.pathname.endsWith("exec_ele"),
            showWindow: p.has("_showWindow"),
          });
        }
        case "/api/app/ncmpath":
          return text(app.getAppPath());
        case "/api/app/read_config":
          return text(
            Object.hasOwn(config, p.get("key") || "")
              ? config[p.get("key") || ""]
              : (p.get("default") ?? "")
          );
        case "/api/app/write_config":
          config[p.get("key") || ""] = p.get("value") || "";
          fs.writeFileSync(configFile + ".tmp", JSON.stringify(config));
          fs.renameSync(configFile + ".tmp", configFile);
          delete hostErrors.config;
          return text("ok");
        case "/api/app/set_rounded_corner":
          return text("ok");
        case "/api/app/get_win_position": {
          const wnd = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().startsWith("orpheus://orpheus/pub/app.html")
          );
          const [x, y] = wnd?.getPosition() || [0, 0];
          return json({ x, y });
        }
        case "/api/app/is_light_theme":
          return json(!nativeTheme.shouldUseDarkColors);
        case "/api/app/get_succeeded_hijacks":
          return json(getSucceededHijacks());
        case "/api/app/reload_plugin":
          await reloadPlugins();
          refreshHijacks();
          return text("ok");
        case "/api/app/open_file_dialog": {
          const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            defaultPath: (p.get("initialDir") || root).replaceAll("\\", "/"),
            filters: dialogFilters(p.get("filter") || ""),
          });
          const selected = result.filePaths[0];
          if (selected) grantedReads.add(fs.realpathSync(selected));
          return text(selected || "");
        }
        case "/api/fs/read_dir":
          return json(fs.readdirSync(path()).map((n) => join(path(), n)));
        case "/api/fs/read_file_text":
          return text(fs.readFileSync(readPath(p.get("path") || ""), "utf8"));
        case "/api/fs/read_file":
          return new Response(fs.readFileSync(readPath(p.get("path") || "")));
        case "/api/fs/exists":
          return json(fs.existsSync(readPath(p.get("path") || "")));
        case "/api/fs/mkdir":
          fs.mkdirSync(path(), { recursive: true });
          return text("ok");
        case "/api/fs/remove":
          removeInstalledPath(root, p.get("path") || "");
          refreshHijacks();
          return text("ok");
        case "/api/fs/rename":
          fs.renameSync(path(), pathFor(p.get("dest") || ""));
          return text("ok");
        case "/api/fs/write_file_text":
        case "/api/fs/write_file": {
          fs.mkdirSync(dirname(path()), { recursive: true });
          const bytes = url.pathname.endsWith("write_file")
            ? (await request.formData()).get("file")
            : await request.text();
          if (typeof bytes === "string") fs.writeFileSync(path(), bytes);
          else if (bytes instanceof File)
            fs.writeFileSync(path(), Buffer.from(await bytes.arrayBuffer()));
          else throw new Error("Missing file");
          return text("ok");
        }
        case "/api/fs/unzip_file": {
          const dest = pathFor(p.get("dest") || "");
          unpackSync(readPath(p.get("path") || ""), dest);
          return text("0");
        }
        case "/api/fs/mount_file": {
          const id = randomBytes(24).toString("hex");
          const file = readPath(p.get("path") || "");
          if (!fs.statSync(file).isFile()) throw new Error("Expected a file");
          mountedFiles.set(id, file);
          return text(`betterncm://runtime/mounted/${id}`);
        }
        case "/api/fs/mount_dir":
          if (!fs.statSync(path()).isDirectory()) throw new Error("Expected a directory");
          return text(mountedDirectoryUrl(root, path()));
        default:
          return new Response("API not supported on Linux", { status: 501 });
      }
    } catch (err) {
      return new Response(String(err), { status: 500 });
    }
  });
}
function bootstrapPayload(safeMode = false) {
  if (safeMode) setHijackPlugins([]);
  else refreshHijacks();
  return {
    source: fs.readFileSync(join(assets(), "framework.js"), "utf8"),
    key: token,
    startupScripts:
      safeMode || config["cc.microblock.betterncm.cpp_side_inject_feature_disabled"] === "true"
        ? []
        : getStartupScripts(root, versions.version),
  };
}
export async function injectBetterNCM(wnd: BrowserWindow) {
  // Fallback for a preload failure; normal startup happens before page scripts.
  const state = await wnd.webContents.executeJavaScript(
    '({started:Boolean(window.__betterNCMStarted),safe:localStorage.getItem("betterncm.safemode")==="true"})'
  );
  if (state?.started) return;
  const payload = bootstrapPayload(Boolean(state?.safe));
  await wnd.webContents.executeJavaScript(`if (!window.__betterNCMStarted) {
    window.BETTERNCM_API_KEY=${JSON.stringify(payload.key)};
    window.BETTERNCM_API_PORT=0;
    window.BETTERNCM_API_PATH='betterncm://runtime/api';
    window.BETTERNCM_FILES_PATH='betterncm://runtime/local';
    window.__betterNCMStartupScripts=${JSON.stringify(payload.startupScripts)};
    ${payload.source}\n window.__betterNCMStarted = true; }`);
}
