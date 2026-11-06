import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packagedProfileLocation, relocatedProfilePath } from "../../src/main/profile-location";

it("renames the old profile without overwriting an existing new profile", () => {
  const root = mkdtempSync(join(tmpdir(), "profile-migration-"));
  try {
    const old = join(root, "open-orpheus"),
      current = join(root, "better-orpheus");
    mkdirSync(old);
    writeFileSync(join(old, "config.json"), "original");
    expect(packagedProfileLocation(root)).toBe(current);
    expect(existsSync(old)).toBe(false);
    expect(readFileSync(join(current, "config.json"), "utf8")).toBe("original");
    mkdirSync(old);
    writeFileSync(join(old, "config.json"), "separate");
    expect(packagedProfileLocation(root)).toBe(current);
    expect(readFileSync(join(old, "config.json"), "utf8")).toBe("separate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("relocates saved internal cache paths while preserving external download directories", () => {
  expect(relocatedProfilePath("/config/open-orpheus/cache", "/config/better-orpheus")).toBe(
    "/config/better-orpheus/cache"
  );
  expect(relocatedProfilePath("\\config\\open-orpheus\\cache", "/config/better-orpheus")).toBe(
    "/config/better-orpheus/cache"
  );
  expect(relocatedProfilePath("/config/open-orpheus-other/cache", "/config/better-orpheus")).toBe(
    "/config/open-orpheus-other/cache"
  );
  expect(relocatedProfilePath("/music", "/config/better-orpheus")).toBe("/music");
  expect(relocatedProfilePath("/config/open-orpheus/cache", "/tmp/custom")).toBe(
    "/config/open-orpheus/cache"
  );
});
