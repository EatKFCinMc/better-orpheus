import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveDirectoryPreference,
  readDirectoryPreferences,
  copyDownloads,
} from "../../src/main/storage-directories";
it("persists independently selected directories and preserves settings after a bad selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "storage-settings-"));
  try {
    const download = join(root, "音乐 下载"),
      cache = join(root, "缓存");
    await mkdir(download);
    await mkdir(cache);
    const file = join(root, "settings.json");
    await saveDirectoryPreference(file, "download", download.replaceAll("/", "\\"));
    await saveDirectoryPreference(file, "cache", cache);
    expect(await readDirectoryPreferences(file)).toEqual({ download, cache });
    await expect(
      saveDirectoryPreference(file, "download", join(root, "missing"))
    ).rejects.toThrow();
    expect((await readDirectoryPreferences(file)).download).toBe(download);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("copies nested music while preserving originals and refuses overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "storage-copy-"));
  try {
    const from = join(root, "from"),
      to = join(root, "to");
    await mkdir(join(from, "专辑"), { recursive: true });
    await mkdir(to);
    await writeFile(join(from, "专辑/song.flac"), "music bytes");
    await copyDownloads(from, to);
    expect(await readFile(join(from, "专辑/song.flac"), "utf8")).toBe("music bytes");
    expect(await readFile(join(to, "专辑/song.flac"), "utf8")).toBe("music bytes");
    await expect(copyDownloads(from, to)).rejects.toThrow("同名");
    expect(await readFile(join(to, "专辑/song.flac"), "utf8")).toBe("music bytes");
    await expect(copyDownloads(from, from)).rejects.toThrow("包含");
    const alias = join(root, "alias");
    await symlink(from, alias);
    await expect(copyDownloads(from, alias)).rejects.toThrow("包含");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
