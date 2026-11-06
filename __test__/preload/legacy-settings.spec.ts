import { expect, it } from "vitest";
import { repairLegacySettings } from "../../src/preload/legacy-settings";

it("repairs partial settings without losing directories or playback state, and preserves a backup", () => {
  const original = JSON.stringify({
    storage: { path: "/music", cachePath: "/cache" },
    lastPlaying: { id: 123 },
  });
  const values = new Map([["NM_SETTING_CUSTOM", original]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  repairLegacySettings(storage);
  const result = JSON.parse(values.get("NM_SETTING_CUSTOM")!);
  expect(result.quantity.pathNameType).toBe(0);
  expect(result.localdir[1].name).toBe("<download>");
  expect(result.storage).toEqual({
    path: "/music",
    cachePath: "/cache",
    capacity: 1,
    min: 0.5,
    max: 10,
  });
  expect(result.lastPlaying).toEqual({ id: 123 });
  expect(values.get("open-orpheus.backup.NM_SETTING_CUSTOM.before-2x-repair")).toBe(original);
  const repaired = values.get("NM_SETTING_CUSTOM");
  repairLegacySettings(storage);
  expect(values.get("NM_SETTING_CUSTOM")).toBe(repaired);
  expect(values.get("open-orpheus.backup.NM_SETTING_CUSTOM.before-2x-repair")).toBe(original);
});
