import { app, BrowserWindow, protocol, dialog, nativeTheme, shell } from "electron";
import { join, dirname } from "node:path";
import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import mime from "mime";
import { executePluginCommand } from "./commands";
import { unpackSync, mountedDirectoryUrl, dialogFilters } from "./fs-helpers";
import { getSucceededHijacks } from "./hijacks";
import {
  root,
  assets,
  grantedReads,
  hostErrors,
  token,
  pathFor,
  readPath,
  config,
  writeConfig,
  readDirectory,
  readText,
  mkdir,
  rename,
  version,
} from "./host";
import { removePath, reloadPlugins } from "./plugin-runtime";

const mountedFiles = new Map<string, string>();
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

export function registerBetterNCMProtocol() {
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
          return text(version);
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
          writeConfig(p.get("key") || "", p.get("value") || "");
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
          return json(readDirectory(path()));
        case "/api/fs/read_file_text":
          return text(readText(p.get("path") || ""));
        case "/api/fs/read_file":
          return new Response(fs.readFileSync(readPath(p.get("path") || "")));
        case "/api/fs/exists":
          return json(fs.existsSync(readPath(p.get("path") || "")));
        case "/api/fs/mkdir":
          mkdir(path());
          return text("ok");
        case "/api/fs/remove":
          removePath(p.get("path") || "");
          return text("ok");
        case "/api/fs/rename":
          rename(path(), p.get("dest") || "");
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
