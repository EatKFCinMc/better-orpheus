import { afterEach, expect, it, vi } from "vitest";
import { utils } from "../../src/betterncm/api/utils";
import { ncm } from "../../src/betterncm/api/ncm";
import { betterncmFetch } from "../../src/betterncm/api/base";
import { createBetterNCMBridge } from "../../src/preload/betterncm-bridge";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("preserves debounce arguments, last call and receiver", async () => {
  vi.useFakeTimers();
  const callback = vi.fn(function (this: { id: number }, ...args: unknown[]) {
    return [this.id, ...args];
  });
  const object = { id: 7, run: utils.debounce(callback, 50) };
  object.run("first", 1);
  object.run("last", 2);
  await vi.advanceTimersByTimeAsync(49);
  expect(callback).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(callback.mock.calls).toEqual([["last", 2]]);
  expect(callback.mock.contexts[0]).toBe(object);
});
it("settles delay, polling and element lookup, and rejects throwing predicates without leaking timers", async () => {
  vi.useFakeTimers();
  const delayed = vi.fn();
  void utils.delay(20).then(delayed);
  await vi.advanceTimersByTimeAsync(20);
  expect(delayed).toHaveBeenCalled();
  let found = false;
  const waiting = utils.waitForFunction(() => found && "ready", 10);
  await vi.advanceTimersByTimeAsync(10);
  found = true;
  await vi.advanceTimersByTimeAsync(10);
  expect(await waiting).toBe("ready");
  const element = { id: "fixture" };
  vi.stubGlobal("document", { querySelector: () => element });
  const selection = utils.waitForElement("#fixture", 10);
  await vi.advanceTimersByTimeAsync(10);
  expect(await selection).toBe(element);
  const rejection = expect(
    utils.waitForFunction(() => {
      throw Error("predicate");
    }, 10)
  ).rejects.toThrow("predicate");
  await vi.advanceTimersByTimeAsync(10);
  await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
it("handles NCM API/data search, cycles, throwing getters, markers and no playing song", () => {
  const value = {
    marker: 42,
    call() {
      return "unique marker";
    },
  };
  const root: any = { nested: { value }, bad: null };
  root.self = root;
  Object.defineProperty(root, "inaccessible", {
    enumerable: true,
    get() {
      throw Error("denied");
    },
  });
  vi.stubGlobal("window", root);
  expect(
    ncm.findNativeFunction({ nil: null, numeric: 3, method: value.call }, ["unique", "marker"])
  ).toBe("method");
  expect(ncm.findNativeFunction({ method: value.call }, "absent")).toBeUndefined();
  expect(ncm.findApiFunction("call", root)?.[1]).toBe(value);
  expect(ncm.findApiFunction((fn) => fn.toString().includes("unique marker"), root)?.[0]).toBe(
    value.call
  );
  expect(ncm.searchApiFunction("call", root)).toHaveLength(1);
  expect(ncm.searchForData((x) => x === 42, root)[0]).toEqual([
    42,
    value,
    ["window", "nested", "value"],
  ]);
  expect(ncm.findApiFunction("missing", root)).toBeNull();
  expect(ncm.getPlayingSong()).toBeNull();
  expect(ncm.getPlaying()).toBeNull();
  root.player = {
    getPlaying() {
      return { data: { id: 123, name: "Song" }, from: { fm: true } };
    },
  };
  expect(ncm.getPlayingSong().data.name).toBe("Song");
  expect(ncm.getPlaying()).toEqual({ id: 123, title: "Song", type: "fm" });
  root.APP_CONF = { appver: "2.10.13.202675", packageVersion: "2acb09d" };
  expect(ncm.getNCMVersion()).toBe("2.10.13");
  expect(ncm.getNCMBuild()).toBe(202675);
  expect(ncm.getNCMFullVersion()).toBe("2.10.13.202675");
  expect(ncm.getNCMPackageVersion()).toBe("2acb09d");
  root.APP_CONF.appver = "2.10.13.202675%2C64";
  expect(ncm.getNCMBuild()).toBe(202675);
  root.APP_CONF = {};
  expect(ncm.getNCMBuild()).toBe(0);
  expect(ncm.getNCMFullVersion()).toBe("0.0.0.0");
  const call = vi.fn();
  vi.stubGlobal("channel", { call });
  ncm.openUrl("https://example.com");
  expect(call).toHaveBeenCalledWith("os.navigateExternal", expect.any(Function), [
    "https://example.com",
  ]);
});
it("supports every Headers form without mutating fetch options and respects ignored authentication", async () => {
  vi.stubGlobal("BETTERNCM_API_KEY", "fixture-key");
  vi.stubGlobal("BETTERNCM_API_PATH", "betterncm://runtime/api");
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("ok"));
  vi.stubGlobal("fetch", fetch);
  for (const headers of [
    new Headers({ "x-test": "value" }),
    { "x-test": "value" },
    [["x-test", "value"]] as [string, string][],
  ]) {
    const options = { headers };
    await betterncmFetch("/app/version", options);
    expect(new Headers(fetch.mock.calls.at(-1)![1]!.headers).get("BETTERNCM_API_KEY")).toBe(
      "fixture-key"
    );
    expect(options.headers).toBe(headers);
  }
  await betterncmFetch("/app/get_win_position", { ignoreApiKey: true });
  expect(new Headers(fetch.mock.calls.at(-1)![1]!.headers).has("BETTERNCM_API_KEY")).toBe(false);
});
it("delivers native async reads asynchronously and validates callbacks", async () => {
  const call = vi.fn();
  const read = vi.fn(async () => "native text");
  const { bridge } = createBetterNCMBridge(call, read);
  const callback = vi.fn();
  bridge.fs.readFileTextAsync("file", callback);
  expect(callback).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(callback).toHaveBeenCalledWith("native text");
  expect(call).not.toHaveBeenCalled();
  expect(() => bridge.fs.readFileTextAsync("file", null as never)).toThrow("callback");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const broken = createBetterNCMBridge(call, async () => {
    throw Error("missing");
  }).bridge;
  const empty = vi.fn();
  broken.fs.readFileTextAsync("missing", empty);
  await Promise.resolve();
  expect(empty).toHaveBeenCalledWith("");
});
it("reports recursive directory create/change/delete paths once per change and cleans up watchers", async () => {
  vi.useFakeTimers();
  let snapshot: Record<string, string> = { "sub/file": "1" };
  const call = vi.fn((name: string) => {
    if (name === "fs.watchSnapshot") return { ...snapshot };
  });
  const { bridge, dispose } = createBetterNCMBridge(call, async () => "");
  const changed = vi.fn();
  const first = bridge.fs.watchDirectory("plugins_dev", changed);
  snapshot = { "sub/file": "2", "sub/new": "1" };
  await vi.advanceTimersByTimeAsync(500);
  expect(changed.mock.calls).toEqual([
    ["plugins_dev", "sub/file"],
    ["plugins_dev", "sub/new"],
  ]);
  changed.mockClear();
  snapshot = { "sub/file": "2" };
  await vi.advanceTimersByTimeAsync(500);
  expect(changed).toHaveBeenCalledWith("plugins_dev", "sub/new");
  bridge.fs.unwatchDirectory(first);
  bridge.fs.watchDirectory("plugins_dev", changed);
  dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("exposes native calls with all required arguments and debug namespaces", () => {
  const call = vi.fn(() => true);
  const { bridge } = createBetterNCMBridge(call, async () => "");
  for (const name of [
    "readDirWithDetails",
    "getProperties",
    "getDisks",
    "getLibraries",
    "unzip",
    "readDir",
    "readFileText",
    "writeFileText",
    "mkdir",
    "remove",
    "rename",
    "exists",
  ]) {
    (bridge.fs as Record<string, Function>)[name]("path", "argument");
    expect(call).toHaveBeenLastCalledWith("fs." + name, "path", "argument");
  }
  for (const name of [
    "version",
    "datapath",
    "ncmpath",
    "reloadIgnoreCache",
    "restart",
    "auto_update",
    "crash",
  ]) {
    bridge.app[name]("argument");
    expect(call).toHaveBeenLastCalledWith("app." + name, "argument");
  }
  bridge.native_plugin.getRegisteredAPIs();
  expect(call).toHaveBeenLastCalledWith("native_plugin.getRegisteredAPIs");
  bridge.native_plugin.call("api", [1]);
  expect(call).toHaveBeenLastCalledWith("native_plugin.call", "api", [1]);
  bridge.test.add(1, 2);
  expect(call).toHaveBeenLastCalledWith("test.add", 1, 2);
  bridge.test.m.i.c.r.o.b.l.o.c.k(1, 2);
  expect(call).toHaveBeenLastCalledWith("test.m.i.c.r.o.b.l.o.c.k", 1, 2);
});

it("finds application APIs before a deep unrelated object graph exhausts the search budget", () => {
  const application = {
    getPlaying() {
      return { data: { id: 123 } };
    },
  };
  const root = { browserGraph: Array.from({ length: 50001 }, () => ({})), application };
  expect(ncm.findApiFunction("getPlaying", root)?.[1]).toBe(application);
});

it("finds named APIs inherited from the page controller prototype with their receiver", () => {
  const controller = Object.create({
    getPlaying(this: { song: unknown }) {
      return this.song;
    },
  });
  controller.song = { data: { id: 42, name: "Prototype song" }, from: {} };
  const root = { controller };
  vi.stubGlobal("window", root);
  expect(ncm.findApiFunction("getPlaying", root)?.[1]).toBe(controller);
  expect(ncm.getPlaying()).toEqual({ id: 42, title: "Prototype song", type: "normal" });
});
