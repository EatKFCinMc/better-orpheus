import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  transformLoader,
  transformPlugin,
  transformPluginManager,
} from "../../scripts/betterncm/upstream-transforms";
it("applies compatibility changes to the pinned upstream and preserves literal replacement characters", () => {
  const source = readFileSync("chromatic/src/js-framework/src/loader.ts", "utf8");
  const loader = readFileSync("src/betterncm/loader-function.txt", "utf8") + "\n// $& $` $'";
  expect(transformLoader(source, loader)).toContain(loader);
  expect(
    transformPlugin(readFileSync("chromatic/src/js-framework/src/plugin.ts", "utf8"))
  ).toContain("__pendingLoads");
});
it("fails explicitly when upstream hooks disappear instead of silently producing an incompatible build", () => {
  expect(() => transformLoader("changed upstream", "loader")).toThrow("upstream changed");
  expect(() => transformPlugin("changed upstream")).toThrow("upstream changed");
});

it("uses the standard event path when handling plugin settings clicks", () => {
  const source = readFileSync("chromatic/src/js-framework/src/plugin-manager/index.tsx", "utf8");
  expect(transformPluginManager(source)).toContain("for (const ele of e.composedPath())");
  expect(transformPluginManager(source)).not.toContain("for (const ele of e.path)");
  expect(() => transformPluginManager("changed upstream")).toThrow("upstream changed");
});
