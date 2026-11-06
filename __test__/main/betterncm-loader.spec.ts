import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
it("isolates broken and native plugins while loading dependencies before healthy dependants", async () => {
  vi.useFakeTimers();
  const manifests: Record<string, object> = {
    Broken: { name: "Broken", slug: "Broken", injects: { Main: [{ file: "main.js" }] } },
    Dependant: { name: "Dependant", slug: "Dependant", requirements: ["Base"], injects: {} },
    OptionalUI: {
      name: "OptionalUI",
      slug: "OptionalUI",
      loadAfter: ["Broken", "OptionalBase"],
      injects: {},
    },
    OptionalBase: { name: "OptionalBase", slug: "OptionalBase", version: "1.1.0" },
    Base: { name: "Base", slug: "Base", injects: {} },
    Missing: { name: "Missing", slug: "Missing", requirements: ["absent"], injects: {} },
    Native: { name: "Native", slug: "Native", native_plugin: "x.dll" },
  };
  const loaded = {};
  const order: string[] = [];
  class Main {
    injects = [];
    finished = false;
    constructor(
      public manifest: any,
      public pluginPath: string
    ) {
      order.push(manifest.slug);
    }
  }
  class Inject extends EventTarget {
    loadError = null;
    __pendingLoads = [];
  }
  const host = {
    betterNCMPluginErrors: {},
    betterNCMSatisfies: () => true,
  };
  vi.stubGlobal("window", host);
  vi.stubGlobal("location", { pathname: "/pub/app.html" });
  const native = {
    fs: {
      readDir: (folder: string) =>
        folder === "plugins_runtime"
          ? Object.keys(manifests).map((n) => `plugins_runtime/${n}`)
          : [],
      readFileText: (path: string) =>
        path.endsWith("manifest.json")
          ? JSON.stringify(manifests[path.split("/")[1]])
          : 'throw new Error("fixture failure");',
    },
  };
  try {
    const source = readFileSync("src/betterncm/loader-function.txt", "utf8");
    const run = new Function(
      "loadedPlugins",
      "isSafeMode",
      "betterncm_native",
      "betterncm",
      "NCMPlugin",
      "NCMInjectPlugin",
      "onPluginLoaded",
      source + "; return loadPlugins();"
    );
    await run(
      loaded,
      () => false,
      native,
      { ncm: { getNCMVersion: () => "2.10.13" } },
      Main,
      Inject,
      () => {}
    );
    expect(Object.keys(loaded).sort()).toEqual(["Base", "Dependant", "OptionalBase", "OptionalUI"]);
    expect(order.indexOf("Base")).toBeLessThan(order.indexOf("Dependant"));
    expect(Object.keys(host.betterNCMPluginErrors).sort()).toEqual(["Broken", "Missing", "Native"]);
    vi.runOnlyPendingTimers();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
it("times out an unresolved plugin script without blocking the next plugin", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { betterNCMSatisfies: () => true });
  vi.stubGlobal("location", { pathname: "/pub/app.html" });
  class Main {
    injects = [];
    constructor(public manifest: any) {}
  }
  class Inject extends EventTarget {
    loadError = null;
    __pendingLoads = [];
  }
  const loaded: Record<string, any> = {};
  const fs = {
    readDir: (folder: string) => (folder === "plugins_runtime" ? ["Slow", "Healthy"] : []),
    readFileText: (path: string) =>
      path.endsWith("manifest.json")
        ? JSON.stringify({ name: path.split("/")[0], injects: { Main: [{ file: "main.js" }] } })
        : path.startsWith("Slow/")
          ? "await new Promise(()=>{});"
          : "",
  };
  // The fixture executes the same loader script supplied to the framework build.
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function(
    "loadedPlugins",
    "isSafeMode",
    "betterncm_native",
    "betterncm",
    "NCMPlugin",
    "NCMInjectPlugin",
    "onPluginLoaded",
    readFileSync("src/betterncm/loader-function.txt", "utf8") + ";return loadPlugins();"
  );
  try {
    const pending = run(
      loaded,
      () => false,
      { fs },
      { ncm: { getNCMVersion: () => "2.10.13" } },
      Main,
      Inject,
      () => {}
    );
    await vi.advanceTimersByTimeAsync(10010);
    await pending;
    expect(loaded.Healthy).toBeDefined();
    expect((window as any).betterNCMPluginErrors.Slow).toMatch(/script startup timed out/);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
