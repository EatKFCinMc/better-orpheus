import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchingCachedTrack } from "../../src/main/cache/matching-track";
it("only returns a complete matching cache and treats stale/truncated files as misses", async () => {
  const root = await mkdtemp(join(tmpdir(), "cache-match-"));
  try {
    const audioPath = join(root, "audio");
    await writeFile(audioPath, "audio");
    const cached = { audioPath, meta: { bitrate: 320000, md5: "good", fileSize: 5 } };
    const manager = { getCachedTrack: async () => cached } as never;
    expect(await matchingCachedTrack(manager, { songId: "1", bitrate: 320, md5: "good" })).toBe(
      cached
    );
    expect(
      await matchingCachedTrack(manager, { songId: "1", bitrate: 128, md5: "good" })
    ).toBeNull();
    expect(
      await matchingCachedTrack(manager, { songId: "1", bitrate: 320, md5: "bad" })
    ).toBeNull();
    await writeFile(audioPath, "shorter-data");
    expect(
      await matchingCachedTrack(manager, { songId: "1", bitrate: 320, md5: "good" })
    ).toBeNull();
    await rm(audioPath);
    expect(
      await matchingCachedTrack(manager, { songId: "1", bitrate: 320, md5: "good" })
    ).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
