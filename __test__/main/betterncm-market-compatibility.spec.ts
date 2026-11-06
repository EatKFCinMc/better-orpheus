import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { marketMatchesNCM, transformMarketSource } from "../../src/betterncm/market-compatibility";

it("uses declared NCM ranges and exact version metadata, never names or ncm3-compatible as a blocklist", () => {
  const plugin = { slug: "Any plugin", version: "1", "ncm-version-req": ">=3.1.11" };
  expect(marketMatchesNCM(plugin, "2.10.13")).toBe(false);
  expect(marketMatchesNCM(plugin, "3.1.41")).toBe(true);
  expect(marketMatchesNCM({ ...plugin, "ncm-version-req": ">=2.10.0 <3" }, "2.10.13")).toBe(true);
  expect(marketMatchesNCM({ ...plugin, "ncm-version-req": "broken" }, "2.10.13")).toBe(false);
  expect(marketMatchesNCM({ slug: "Unknown", version: "1" }, "2.10.13")).toBe(true);
  const next = {
    repo: "SUlTlUS/refined-now-playing-netease-next",
    slug: "RefinedNowPlayingNext",
    version: "3.0.2",
  };
  expect(marketMatchesNCM(next, "2.10.13")).toBe(false);
  expect(marketMatchesNCM({ ...next, version: "99.0.0" }, "2.10.13")).toBe(true);
});
it("adds the range check to the actual bundled market while retaining its show-unmatched option", () => {
  const archive = unzipSync(readFileSync("chromatic/resource/PluginMarket.plugin"));
  const source = strFromU8(archive["main.js"]);
  const transformed = transformMarketSource(source);
  expect(transformed).not.toBe(source);
  expect(transformed).toContain(
    "if (!window.betterNCMMarketMatches(plugin) && !_this6.state.showVersionUnmatchedPlugins) return false;"
  );
  expect(transformed).toContain("_this6.state.showVersionUnmatchedPlugins");
  expect(transformMarketSource("/* unrelated plugin */")).toBe("/* unrelated plugin */");
});

it("applies publisher-documented version limits only to the audited package version", () => {
  const theme = {
    repo: "long45343/material-you-theme-NCMv3",
    slug: "material-u-theme-ncmv3",
    version: "v1.0.6",
  };
  expect(marketMatchesNCM(theme, "2.10.13")).toBe(false);
  expect(marketMatchesNCM(theme, "3.1.39")).toBe(true);
  expect(
    marketMatchesNCM(
      { repo: "solstice23/material-you-theme-netease", slug: "MaterialYouTheme", version: "2.9.0" },
      "2.10.13"
    )
  ).toBe(true);
});
