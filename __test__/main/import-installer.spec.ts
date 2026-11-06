import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importInstaller, resourceEntry } from "../../src/main/packs/import-installer";
it("accepts resource trees and rejects traversal and other installer contents", () => {
  expect(resourceEntry("package/orpheus.ntpk")).toBe(true);
  expect(resourceEntry("resource/3D环绕.ncae")).toBe(true);
  for (const path of [
    "package/../../escape",
    "resource/../escape",
    "/package/a",
    "cloudmusic.exe",
    "package/C:/file",
  ])
    expect(resourceEntry(path)).toBe(false);
});
it("does not replace existing resources when the selected file is not an installer", async () => {
  const root = await mkdtemp(join(tmpdir(), "resource-import-test-"));
  try {
    const existing = join(root, "existing");
    await writeFile(existing, "preserve");
    const bad = join(root, "bad.exe");
    await writeFile(bad, "not an executable");
    await expect(importInstaller(bad, existing)).rejects.toThrow("EXE");
    expect(await readFile(existing, "utf8")).toBe("preserve");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
