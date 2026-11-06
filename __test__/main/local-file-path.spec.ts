import { expect, it } from "vitest";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { localFilePath } from "../../src/main/util/path";

it("recognizes legacy backslash absolute Linux paths before testing absoluteness", async () => {
  const fixture = resolve("__test__/fixtures/downloaded-music/comment.flac");
  const legacy = fixture.replaceAll("/", "\\");
  expect(localFilePath("/tmp/profile", legacy)).toBe(fixture);
  await expect(access(localFilePath("/tmp/profile", legacy) as string)).resolves.toBeUndefined();
  expect(localFilePath("/tmp/profile", fixture)).toBe(fixture);
});
it("uses the active profile for relative paths and rejects escaping it", () => {
  expect(localFilePath("/tmp/profile", "storage\\queue.json")).toBe(
    "/tmp/profile/storage/queue.json"
  );
  expect(localFilePath("/tmp/profile", "..\\outside")).toBe(false);
});
