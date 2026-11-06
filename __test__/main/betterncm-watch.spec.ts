import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { directorySnapshot } from "../../src/main/betterncm/fs-helpers";
it("detects edits within nested directories and skips symlink escapes", () => {
  const root = mkdtempSync(join(tmpdir(), "bncm-watch-"));
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested/style.css"), "a{}");
    symlinkSync(tmpdir(), join(root, "escape"));
    const before = directorySnapshot(root, ".");
    writeFileSync(join(root, "nested/style.css"), "b{}");
    utimesSync(join(root, "nested/style.css"), 1000, 1000);
    const after = directorySnapshot(root, ".");
    expect(before["nested/style.css"]).not.toBe(after["nested/style.css"]);
    expect(Object.keys(after).some((key) => key.startsWith("escape"))).toBe(false);
    rmSync(join(root, "nested/style.css"));
    expect(directorySnapshot(root, ".")).not.toHaveProperty("nested/style.css");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
