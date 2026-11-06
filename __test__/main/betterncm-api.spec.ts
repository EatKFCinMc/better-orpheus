import { beforeAll, afterAll, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";
import { installLoggerStub } from "../helpers/globals";
const state = vi.hoisted(() => ({
  data: "",
  archive: new Uint8Array(),
  route: null as any,
  called: new Set<string>(),
  nativeCalled: new Set<string>(),
  handlers: {} as Record<string, any>,
  asyncHandlers: {} as Record<string, any>,
  wc: {
    getURL: () => "orpheus://orpheus/pub/app.html",
    reloadIgnoringCache: vi.fn(),
    openDevTools: vi.fn(),
    closeDevTools: vi.fn(),
    executeJavaScript: vi.fn(),
  },
  dialog: vi.fn(),
  openPath: vi.fn(async () => ""),
  openExternal: vi.fn(async () => {}),
  relaunch: vi.fn(),
  quit: vi.fn(),
}));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    copyFileSync: (src: string, dest: string) =>
      src.endsWith("PluginMarket.plugin")
        ? actual.writeFileSync(dest, state.archive)
        : actual.copyFileSync(src, dest),
    readFileSync: (path: any, options: any) =>
      String(path).endsWith("framework.js")
        ? "void 0;"
        : String(path).endsWith("framework.css")
          ? Buffer.from(".fixture{}")
          : actual.readFileSync(path, options),
  };
});
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "/fixture/app",
    getPath: (name: string) => `/fixture/${name}`,
    relaunch: state.relaunch,
    quit: state.quit,
  },
  BrowserWindow: {
    fromWebContents: () => ({ webContents: state.wc, isDestroyed: () => false }),
    getAllWindows: () => [{ webContents: state.wc, getPosition: () => [12, 34] }],
  },
  ipcMain: {
    on: (name: string, handler: any) => {
      state.handlers[name] = handler;
    },
    handle: (name: string, handler: any) => {
      state.asyncHandlers[name] = handler;
    },
  },
  protocol: {
    handle: (_name: string, handler: any) => {
      state.route = handler;
    },
  },
  dialog: { showOpenDialog: state.dialog },
  shell: { openPath: state.openPath, openExternal: state.openExternal },
  nativeTheme: { shouldUseDarkColors: false },
}));
vi.mock("../../src/main/folders", () => ({
  get data() {
    return state.data;
  },
}));
vi.mock("../../src/main/window", () => ({
  mainWindow: { isDestroyed: () => false, webContents: state.wc },
}));
let key = "",
  root = "",
  temp = "";
let host: typeof import("../../src/main/betterncm");
function event(url = "orpheus://orpheus/pub/app.html") {
  const frame = { url };
  return { sender: { mainFrame: frame }, senderFrame: frame, returnValue: undefined } as any;
}
function native(name: string, ...args: unknown[]) {
  state.nativeCalled.add(name);
  const e = event();
  state.handlers["betterncm.native"](e, name, args);
  if (e.returnValue.error) throw Error(e.returnValue.error);
  return e.returnValue.value;
}
async function request(path: string, params: Record<string, string> = {}, init: RequestInit = {}) {
  state.called.add(path);
  return state.route(
    new Request("betterncm://runtime" + path + "?" + new URLSearchParams(params), {
      ...init,
      headers: new Headers([["BETTERNCM_API_KEY", key], ...new Headers(init.headers).entries()]),
    })
  ) as Promise<Response>;
}
beforeAll(async () => {
  installLoggerStub();
  temp = fs.mkdtempSync(join(tmpdir(), "bncm-api-"));
  state.data = join(temp, "data");
  root = join(state.data, "betterncm");
  state.archive = zipSync({
    "manifest.json": strToU8(JSON.stringify({ name: "PluginMarket", version: "fixture" })),
  });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(join(root, "config.json"), "{broken");
  host = await import("../../src/main/betterncm");
  await host.initializeBetterNCM();
  await host.injectBetterNCM({ webContents: state.wc } as never);
  key = JSON.parse(
    state.wc.executeJavaScript.mock.calls
      .find((call) => call[0].includes("window.BETTERNCM_API_KEY="))![0]
      .match(/BETTERNCM_API_KEY=("[^"]+")/)[1]
  );
});
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));
it("checks authentication, main frame, exact document and unknown APIs", async () => {
  expect((await state.route(new Request("betterncm://runtime/api/app/version"))).status).toBe(401);
  expect((await state.route(new Request("betterncm://other/api/app/version"))).status).toBe(404);
  expect((await request("/api/unknown")).status).toBe(501);
  const e = event("orpheus://orpheus/pub/app.html.evil");
  state.handlers["betterncm.native"](e, "app.version", []);
  expect(e.returnValue.error).toMatch(/Invalid/);
  await expect(
    state.asyncHandlers["betterncm.nativeAsync"](event("https://example.com"), "fs.readFileText", [
      "x",
    ])
  ).rejects.toThrow("Invalid");
  expect(() => native("unknown")).toThrow("unsupported");
});
it("verifies every app query and persistent config, including inherited keys and Unicode", async () => {
  for (const [path, value] of [
    ["version", "1.3.4"],
    ["datapath", root],
    ["ncmpath", "/fixture/app"],
  ])
    expect(await (await request("/api/app/" + path)).text()).toBe(value);
  expect(await (await request("/api/app/get_win_position")).json()).toEqual({ x: 12, y: 34 });
  expect(await (await request("/api/app/is_light_theme")).json()).toBe(true);
  expect(await (await request("/api/app/get_succeeded_hijacks")).json()).toEqual([]);
  expect((await request("/api/internal/framework.css")).headers.get("content-type")).toBe(
    "text/css"
  );
  expect((await (await request("/api/app/compatibility")).json()).errors.config).toMatch(
    /Invalid config/
  );
  expect(
    await (await request("/api/app/read_config", { key: "toString", default: "fallback" })).text()
  ).toBe("fallback");
  for (const name of ["unicode", "__proto__"]) {
    expect(
      (await request("/api/app/write_config", { key: name, value: "汉字 # & ?\n✓" })).status
    ).toBe(200);
    expect(await (await request("/api/app/read_config", { key: name })).text()).toBe(
      "汉字 # & ?\n✓"
    );
  }
  expect(JSON.parse(fs.readFileSync(join(root, "config.json"), "utf8")).unicode).toContain("汉字");
});
it("verifies console, rounded corner, URL/folder actions and explicit unsupported actions without executing programs", async () => {
  await request("/api/app/show_console");
  expect(state.wc.openDevTools).toHaveBeenCalled();
  await request("/api/app/show_console", { hide: "" });
  expect(state.wc.closeDevTools).toHaveBeenCalled();
  expect((await request("/api/app/set_rounded_corner", { enable: "false" })).status).toBe(200);
  await request("/api/app/exec", {}, { method: "POST", body: "https://example.com/help" });
  expect(state.openExternal).toHaveBeenCalledWith("https://example.com/help");
  await request(
    "/api/app/exec",
    {},
    { method: "POST", body: 'explorer "' + join(root, "plugins") + '"' }
  );
  expect(state.openPath).toHaveBeenCalledWith(join(root, "plugins"));
  for (const path of ["exec_ele", "bg_screenshot"])
    expect((await request("/api/app/" + path)).status).toBe(501);
  expect(
    (await request("/api/app/exec", {}, { method: "POST", body: "cmd /c something" })).status
  ).toBe(501);
});
it("verifies UTF-8/binary writes and reads, boolean existence, rename and special-character mounts", async () => {
  const folder = "接口 # ? & %";
  await request("/api/fs/mkdir", { path: folder });
  const file = folder + "/文本 #?.txt";
  await request("/api/fs/write_file_text", { path: file }, { method: "POST", body: "你好\n✓" });
  expect(await (await request("/api/fs/read_file_text", { path: file })).text()).toBe("你好\n✓");
  expect(await (await request("/api/fs/exists", { path: file })).json()).toBe(true);
  expect(await (await request("/api/fs/exists", { path: "missing" })).json()).toBe(false);
  expect(await (await request("/api/fs/read_dir", { path: folder })).json()).toContain(
    join(root, file)
  );
  const data = new Uint8Array([0, 255, 17, 128]);
  const form = new FormData();
  form.set("file", new Blob([data]));
  await request("/api/fs/write_file", { path: folder + "/binary" }, { method: "POST", body: form });
  expect(
    new Uint8Array(
      await (await request("/api/fs/read_file", { path: folder + "/binary" })).arrayBuffer()
    )
  ).toEqual(data);
  const mount = await (await request("/api/fs/mount_dir", { path: folder })).text();
  expect(mount).toContain("%23");
  expect(mount).toContain("%3F");
  const asset = await state.route(new Request(mount + "/" + encodeURIComponent("文本 #?.txt")));
  expect(await asset.text()).toBe("你好\n✓");
  await request("/api/fs/rename", { path: folder + "/binary", dest: folder + "/renamed" });
  const mounted = await (await request("/api/fs/mount_file", { path: folder + "/renamed" })).text();
  expect(new Uint8Array(await (await state.route(new Request(mounted))).arrayBuffer())).toEqual(
    data
  );
  expect((await state.route(new Request("betterncm://runtime/mounted/missing"))).status).toBe(404);
  await request("/api/fs/remove", { path: folder });
  expect(fs.existsSync(join(root, folder))).toBe(false);
});
it("honours file-dialog filters, initial directory, cancellation and read-only file grants", async () => {
  state.dialog.mockResolvedValueOnce({ filePaths: [] });
  expect(
    await (
      await request("/api/app/open_file_dialog", {
        filter: "Images\0*.png;*.jpg\0All\0*.*\0",
        initialDir: "/fixture/pictures",
      })
    ).text()
  ).toBe("");
  expect(state.dialog.mock.calls.at(-1)![0]).toMatchObject({
    defaultPath: "/fixture/pictures",
    filters: [
      { name: "Images", extensions: ["png", "jpg"] },
      { name: "All", extensions: ["*"] },
    ],
  });
  const file = join(temp, "selected.txt");
  fs.writeFileSync(file, "chosen");
  expect((await request("/api/fs/read_file_text", { path: file })).status).toBe(500);
  state.dialog.mockResolvedValueOnce({ filePaths: [file] });
  await request("/api/app/open_file_dialog");
  expect(await (await request("/api/fs/read_file_text", { path: file })).text()).toBe("chosen");
  expect(
    (
      await request(
        "/api/fs/write_file_text",
        { path: file },
        { method: "POST", body: "overwrite" }
      )
    ).status
  ).toBe(500);
  expect(fs.readFileSync(file, "utf8")).toBe("chosen");
});
it("verifies both ZIP APIs, directory lifecycle and escape rejection", async () => {
  fs.writeFileSync(join(root, "valid.zip"), zipSync({ "nested/文字.txt": strToU8("zip") }));
  expect(
    await (await request("/api/fs/unzip_file", { path: "valid.zip", dest: "unpacked" })).text()
  ).toBe("0");
  expect(native("fs.unzip", "valid.zip", "native-unpacked")).toBe(0);
  expect(fs.readFileSync(join(root, "native-unpacked/nested/文字.txt"), "utf8")).toBe("zip");
  fs.writeFileSync(join(root, "invalid.zip"), zipSync({ "../escape": strToU8("bad") }));
  expect(
    (await request("/api/fs/unzip_file", { path: "invalid.zip", dest: "rejected" })).status
  ).toBe(500);
  expect(fs.existsSync(join(root, "escape"))).toBe(false);
  expect((await request("/api/fs/reload_plugin")).status).toBe(501);
  expect((await request("/api/app/reload_plugin")).status).toBe(200);
});
it("verifies every native filesystem method and asynchronous text read", async () => {
  expect(native("fs.mkdir", "native")).toBe(true);
  expect(native("fs.writeFileText", "native/a.txt", "原生")).toBe(true);
  expect(native("fs.readFileText", "native/a.txt")).toBe("原生");
  expect(native("fs.exists", "native/a.txt")).toBe(true);
  expect(native("fs.readDir", "native")).toContain(join(root, "native/a.txt"));
  expect(native("fs.getProperties", "native/a.txt")).toMatchObject({
    name: "a.txt",
    path: join(root, "native"),
    type: "file",
    extension: ".txt",
    size: 6,
    hidden: false,
    system: false,
  });
  expect(native("fs.readDirWithDetails", "native")[0].path).toBe(join(root, "native/a.txt"));
  expect(native("fs.rename", "native/a.txt", "native/b.txt")).toBe(true);
  expect(
    await state.asyncHandlers["betterncm.nativeAsync"](event(), "fs.readFileText", ["native/b.txt"])
  ).toBe("原生");
  expect(native("fs.watchSnapshot", "native")).toHaveProperty("b.txt");
  expect(native("fs.getDisks")[0]).toMatchObject({ disk: "/", name: expect.any(String) });
  expect(native("fs.getLibraries")).toHaveLength(6);
  expect(native("fs.remove", "native")).toBe(true);
  expect(native("fs.exists", "native")).toBe(false);
});
it("verifies native app and extension methods without crashing, updating or restarting the test runner", async () => {
  expect(native("app.version")).toBe("1.3.4");
  expect(native("app.datapath")).toBe(root);
  expect(native("app.ncmpath")).toBe("/fixture/app");
  expect(native("app.reloadIgnoreCache")).toBe(true);
  await host.getInstalledPlugins();
  expect(state.wc.reloadIgnoringCache).toHaveBeenCalled();
  expect(native("app.restart")).toBe(true);
  expect(state.relaunch).toHaveBeenCalled();
  expect(state.quit).toHaveBeenCalled();
  expect(native("native_plugin.getRegisteredAPIs")).toEqual([]);
  expect(() => native("native_plugin.call", "dll.fn", [])).toThrow("unsupported");
  expect(() => native("app.auto_update", "source")).toThrow("unsupported");
  expect(() => native("app.crash")).toThrow("disabled");
  expect(native("test.add", 2, 3.5)).toBe(5.5);
  expect(native("test.m.i.c.r.o.b.l.o.c.k", 2, 3.5)).toBe("🍊🍊🍊5.500000");
  expect(() => native("test.add", "bad", 3)).toThrow("numbers");
});

it("covers every HTTP endpoint and native declaration in chromatic v2", () => {
  const server = fs.readFileSync("chromatic/src/App.cpp", "utf8");
  const endpoints = [
    ...new Set([...server.matchAll(/svr->(?:Get|Post)\("([^"]+)"/g)].map((match) => match[1])),
  ];
  expect(endpoints.filter((path) => !state.called.has(path))).toEqual([]);
  const native = fs.readFileSync("chromatic/src/v8NativeCalls.cpp", "utf8");
  const names = [
    ...new Set(
      [...native.matchAll(/DEFINE_API\(\s*([\w.]+)\s*,/g)]
        .map((match) => match[1])
        .filter((name) => name.includes("."))
    ),
  ];
  const preloadCovered = new Set(["fs.readFileTextAsync", "fs.watchDirectory"]);
  expect(
    names.filter((name) => !state.nativeCalled.has(name) && !preloadCovered.has(name))
  ).toEqual([]);
});
