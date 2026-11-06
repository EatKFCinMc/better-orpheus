import { describe, it, expect } from "vitest";
import {
  applyHijacks,
  setHijackPlugins,
  getSucceededHijacks,
} from "../../src/main/betterncm/hijacks";
describe("BetterNCM resource transformations", () => {
  it("applies matching version rules in order and records only successful actions", () => {
    setHijackPlugins([
      {
        name: "ui",
        hijacks: {
          ">=2.10.4": {
            "orpheus://orpheus/pub/core": [
              { type: "replace", from: "old", to: "new", id: "replace" },
              { type: "regex", from: "new", to: "patched" },
              { type: "append", code: ";end" },
              { type: "prepend", code: "start;" },
              { type: "replace", from: "absent", to: "x", id: "miss" },
            ],
          },
        },
      },
    ]);
    expect(applyHijacks("orpheus://orpheus/pub/core.test.js", "old", "2.10.13")).toBe(
      "start;patched;end"
    );
    expect(getSucceededHijacks()).toContain("ui::replace");
    expect(getSucceededHijacks()).not.toContain("ui::miss");
    expect(applyHijacks("orpheus://orpheus/pub/core.js", "old", "2.9.0")).toBe("old");
    expect(applyHijacks("orpheus://orpheus/pub/other.js", "old", "2.10.13")).toBe("old");
  });
  it("ignores invalid regex without aborting later plugins", () => {
    setHijackPlugins([
      {
        name: "bad",
        hijacks: {
          "*": {
            "orpheus://": [
              { type: "regex", from: "[", to: "x" },
              { type: "append", code: "ok" },
            ],
          },
        },
      },
    ]);
    expect(applyHijacks("orpheus://x", "", "2.10.13")).toBe("ok");
  });
});

it("reports the original BetterNCM slug-qualified hijack IDs", () => {
  setHijackPlugins([
    {
      name: "Fluent Cover",
      slug: "FluentMusicCover",
      hijacks: {
        "*": {
          "orpheus://": {
            type: "replace",
            from: "original",
            to: "patched",
            id: "fluentMusicCover.hackNCMTemplateParse",
          },
        },
      },
    },
  ]);
  applyHijacks("orpheus://orpheus/pub/core.js", "original", "2.10.13");
  expect(getSucceededHijacks()).toEqual([
    "FluentMusicCover::fluentMusicCover.hackNCMTemplateParse",
  ]);
});
