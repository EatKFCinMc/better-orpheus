import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  transformLoader,
  transformPlugin,
  transformPluginManager,
} from "../../scripts/betterncm/upstream-transforms";
it("wires the local loader into the pinned upstream lifecycle", () => {
  const source = readFileSync("chromatic/src/js-framework/src/loader.ts", "utf8");
  const adapted = transformLoader(source);
  expect(adapted).toContain('from "../../../../src/betterncm/loader"');
  expect(adapted).toContain("return loadCompatiblePlugins({");
  expect(adapted).toContain('window.addEventListener("betterncm-ready",');
  expect(
    transformPlugin(readFileSync("chromatic/src/js-framework/src/plugin.ts", "utf8"))
  ).toContain("__pendingLoads");
});
it("fails explicitly when upstream hooks disappear instead of silently producing an incompatible build", () => {
  expect(() => transformLoader("changed upstream")).toThrow("upstream changed");
  expect(() => transformPlugin("changed upstream")).toThrow("upstream changed");
});

it("uses the standard event path when handling plugin settings clicks", () => {
  const source = readFileSync("chromatic/src/js-framework/src/plugin-manager/index.tsx", "utf8");
  expect(transformPluginManager(source)).toContain("for (const ele of e.composedPath())");
  expect(transformPluginManager(source)).not.toContain("for (const ele of e.path)");
  expect(() => transformPluginManager("changed upstream")).toThrow("upstream changed");
});
