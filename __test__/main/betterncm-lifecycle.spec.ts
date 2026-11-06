import { it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import { transformPlugin } from "../../scripts/betterncm/upstream-transforms";
async function classes() {
  const code = transformPlugin(readFileSync("chromatic/src/js-framework/src/plugin.ts", "utf8"));
  const compiled = await transform(code, { loader: "ts", format: "cjs", target: "es2022" });
  const module = { exports: {} as any };
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function("module", "exports", compiled.code)(module, module.exports);
  return module.exports;
}
afterEach(() => vi.unstubAllGlobals());
it("preserves lifecycle receivers and awaits both asynchronous load hooks", async () => {
  const { NCMPlugin, NCMInjectPlugin } = await classes();
  const main = new NCMPlugin({ slug: "fixture" }, "fixture", false);
  const inject = new NCMInjectPlugin(main, "fixture/main.js");
  main.injects.push(inject);
  const onLoad = vi.fn(async function (this: any, self: any) {
    expect(this).toBe(inject);
    expect(self).toBe(inject);
  });
  inject.onLoad(onLoad);
  inject.dispatchEvent(new CustomEvent("load", { detail: inject }));
  await Promise.all(inject.__pendingLoads);
  expect(onLoad).toHaveBeenCalledTimes(1);
  const all = vi.fn(async function (this: any, plugins: any) {
    expect(this).toBe(inject);
    expect(plugins.fixture).toBe(main);
    throw Error("async all-plugins failure");
  });
  inject.onAllPluginsLoaded(all);
  inject.dispatchEvent(new CustomEvent("allpluginsloaded", { detail: { fixture: main } }));
  await expect(Promise.all(inject.__pendingAllLoads)).rejects.toThrow("async all-plugins failure");
  expect(inject.loadError.message).toBe("async all-plugins failure");
});
it("repairs corrupt config, preserves false/zero values and reports configuration callback errors", async () => {
  const storage: Record<string, any> = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
  };
  vi.stubGlobal("localStorage", storage);
  const { NCMPlugin, NCMInjectPlugin } = await classes();
  const main = new NCMPlugin({ slug: "fixture" }, "fixture", false);
  const inject = new NCMInjectPlugin(main, "fixture/main.js");
  storage.setItem("config.betterncm.fixture", "broken");
  expect(inject.getConfig("value", 7)).toBe(7);
  inject.setConfig("zero", 0);
  inject.setConfig("false", false);
  expect(inject.getConfig("zero")).toBe(0);
  expect(inject.getConfig("false")).toBe(false);
  expect(inject.getConfig("toString", "fallback")).toBe("fallback");
  main.injects.push(inject);
  const view = { fixture: true };
  inject.onConfig(() => view);
  expect(inject._getConfigElement()).toBe(view);
  expect(main.haveConfigElement()).toBe(true);
  expect(new NCMPlugin({ slug: "empty" }, "empty", false).haveConfigElement()).toBe(false);
  const broken = new NCMInjectPlugin(main, "broken.js");
  broken.onConfig(() => {
    throw Error("config failed");
  });
  expect(() => broken._getConfigElement()).toThrow("config failed");
  const sync = new NCMInjectPlugin(main, "sync.js");
  sync.onAllPluginsLoaded(() => {
    throw Error("sync failed");
  });
  expect(() =>
    sync.dispatchEvent(new CustomEvent("allpluginsloaded", { detail: {} }))
  ).not.toThrow();
  expect(sync.loadError.message).toBe("sync failed");
});
