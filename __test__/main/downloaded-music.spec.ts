import { describe, expect, it } from "vitest";
import { resolve, relative } from "node:path";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  downloadedMetadataComment,
  readDownloadedMusicInfo,
} from "../../src/main/downloaded-music";
import { ID3JsonToComment } from "../../src/main/id3";
import { isMusicFile } from "../../src/main/util/musicFile";

const fixtureRoot = resolve("__test__/fixtures/downloaded-music");
const json = 'music:{"musicId":12345,"musicName":"Scanner fixture"}';

describe("downloaded music tags across containers", () => {
  it.each(["mp3", "flac", "ogg", "opus", "m4a", "wav", "aiff", "wv", "wma"])(
    "reads the original NetEase record from %s",
    async (extension) => {
      const file = `comment.${extension}`;
      expect(isMusicFile(file)).toBe(true);
      const info = await readDownloadedMusicInfo(file, resolve(fixtureRoot, file));
      expect(info?.comment).toBe(json);
      expect(info?.path).toBe(file);
      expect(info?.size).toBeGreaterThan(0);
    }
  );

  it("retains the complete relative filename for a base ending in a slash", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "download-scanner-"));
    try {
      const path = resolve(root, "首曲.flac");
      await copyFile(resolve(fixtureRoot, "comment.flac"), path);
      const file = relative(`${root}/`, path);
      expect(file).toBe("首曲.flac");
      expect((await readDownloadedMusicInfo(file, resolve(root, file)))?.comment).toBe(json);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves downloaded radio programs as well as music records", () => {
    const program = 'dj:{"programId":12345,"programName":"Radio fixture"}';
    expect(downloadedMetadataComment([{ text: ID3JsonToComment(program) }])).toBe(program);
  });

  it.each(["APE", "WV", "MPC", "TTA", "DSF", "DFF"])(
    "recognizes %s without relying on MIME",
    (extension) => {
      expect(isMusicFile(`track.${extension}`)).toBe(true);
    }
  );

  it("ignores ordinary comments and malformed records and tries subsequent values", () => {
    expect(downloadedMetadataComment(["An ordinary comment", null])).toBeNull();
    expect(downloadedMetadataComment([ID3JsonToComment("music:{broken")])).toBeNull();
    expect(downloadedMetadataComment([ID3JsonToComment('music:{"title":"no id"}')])).toBeNull();
    expect(
      downloadedMetadataComment([
        "An ordinary comment",
        "163 key(Don't modify):broken",
        { text: [ID3JsonToComment(json)] },
      ])
    ).toBe(json);
  });
});
