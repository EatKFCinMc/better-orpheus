import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  storageWritePath,
  migrateLegacyWebdata,
  writeStorageFile,
} from "../../src/main/legacy-webdata";
it("resolves legacy writes to the same data path used by reads", () => {
  expect(storageWritePath("/profile", "webdata\\file\\queue")).toBe("/profile/webdata/file/queue");
  expect(storageWritePath("/profile", "webdata/file/queue", "rel")).toBe(
    "/profile/webdata/file/queue"
  );
  expect(storageWritePath("/profile", "/music/song.mp3", "abs")).toBe("/music/song.mp3");
  expect(() => storageWritePath("/profile", "../outside")).toThrow();
});
it("recovers queues without replacing existing data or importing into isolated profiles", async () => {
  const root = await mkdtemp(join(tmpdir(), "queue-recovery-"));
  try {
    const source = join(root, "webdata/file/queue"),
      data = join(root, "data");
    await mkdir(join(root, "webdata/file"), { recursive: true });
    await writeFile(source, "[1,2,3]");
    expect(await migrateLegacyWebdata(join(root, "isolated"), root)).toBe(0);
    expect(await migrateLegacyWebdata(data, root)).toBe(1);
    const target = storageWritePath(data, "webdata/file/queue");
    expect(await readFile(target, "utf8")).toBe("[1,2,3]");
    await writeStorageFile(target, "[4]");
    expect(await migrateLegacyWebdata(data, root)).toBe(0);
    expect(await readFile(target, "utf8")).toBe("[4]");
    expect(await readFile(source, "utf8")).toBe("[1,2,3]");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("serializes rapid queue saves so an older write cannot replace the latest queue", async () => {
  const root = await mkdtemp(join(tmpdir(), "queue-order-"));
  try {
    const path = join(root, "queue");
    await Promise.all(
      Array.from({ length: 20 }, (_, n) => writeStorageFile(path, JSON.stringify([n])))
    );
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual([19]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
