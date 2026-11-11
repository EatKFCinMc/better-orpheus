import { app, BrowserWindow, ipcMain } from "electron";
import { join, dirname, basename, extname } from "node:path";
import * as fs from "node:fs";
import { unpackSync, directorySnapshot, getDisks } from "./fs-helpers";
import { root, pathFor, readPath, readDirectory, readText, mkdir, rename, version } from "./host";
import { removePath, reloadPlugins } from "./plugin-runtime";
import { bootstrapPayload } from "./bootstrap";

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
      return readDirectory(path());
    case "fs.getProperties":
      return properties(readPath(args[0]));
    case "fs.readDirWithDetails":
      return fs
        .readdirSync(path())
        .map((n) => ({ ...properties(join(path(), n)), path: join(path(), n) }));
    case "fs.readFileText":
      return readText(args[0]);
    case "fs.writeFileText":
      fs.mkdirSync(dirname(path()), { recursive: true });
      fs.writeFileSync(path(), args[1]);
      return true;
    case "fs.mkdir":
      mkdir(path());
      return true;
    case "fs.remove":
      removePath(args[0]);
      return true;
    case "fs.rename":
      rename(path(), args[1]);
      return true;
    case "app.version":
      return version;
    case "app.datapath":
      return root;
    case "app.ncmpath":
      return app.getAppPath();
    case "app.reloadIgnoreCache":
      void reloadPlugins()
        .then(() => {
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
export function registerBetterNCMIpc() {
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
}
