import { beforeEach, describe, expect, it, vi } from "vitest";

import { installLoggerStub } from "../helpers/globals";

const hoisted = vi.hoisted(() => ({
  /** Resolvers for the deletions the fake streamers are holding open. */
  deletions: new Map<string, () => void>(),
  cached: vi.fn(),
  /** Streamers whose deletion should reject. */
  failing: new Set<string>(),
}));

vi.mock("../../src/main/audio/OnlineStreamer", () => ({
  OnlineStreamer: class {
    constructor(readonly url: string) {}

    on() {
      return this;
    }

    destroy(): Promise<void> {
      if (hoisted.failing.has(this.url)) {
        return Promise.reject(new Error(`delete failed: ${this.url}`));
      }
      return new Promise<void>((resolve) => {
        hoisted.deletions.set(this.url, resolve);
      });
    }
  },
}));

// Only read for progress reporting and cache-on-complete, neither of which a
// teardown test reaches.
vi.mock("../../src/main/window", () => ({ mainWindow: null }));
vi.mock("../../src/main/cache", () => ({ playCacheManager: { getCachedTrack: hoisted.cached } }));
// Only path normalization is used here.
vi.mock("../../src/main/util/path", () => ({
  normalizePath: (value: string) => value,
}));

const logger = installLoggerStub();

import { MediaEngine } from "../../src/main/audio/MediaEngine";

/** An online (URL) play, the only kind that owns a temp file. */
function urlPlay(url: string): Parameters<MediaEngine["activate"]>[0] {
  return { type: 4, musicurl: url, songId: url } as never;
}

/** Let already-resolved promises settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  hoisted.cached.mockReset().mockResolvedValue(null);
  hoisted.deletions.clear();
  hoisted.failing.clear();
});

describe("MediaEngine.dispose", () => {
  it("waits for a deletion an earlier stop() left running", async () => {
    const engine = new MediaEngine();

    await engine.activate(urlPlay("url-a"));
    await engine.stop(); // Retires url-a without waiting for its deletion.
    await engine.activate(urlPlay("url-b"));

    let disposed = false;
    const disposal = engine.dispose().then(() => {
      disposed = true;
    });

    // Both the current stream and the one stop() retired are still deleting.
    expect(hoisted.deletions.has("url-a")).toBe(true);
    expect(hoisted.deletions.has("url-b")).toBe(true);

    hoisted.deletions.get("url-b")?.();
    await tick();
    // url-b alone must not be enough: the file stop() left behind still counts.
    expect(disposed).toBe(false);

    hoisted.deletions.get("url-a")?.();
    await disposal;
    expect(disposed).toBe(true);
  });

  it("reports a failed deletion of the current stream, and still resolves", async () => {
    const engine = new MediaEngine();
    await engine.activate(urlPlay("url-a"));
    hoisted.failing.add("url-a");
    logger.error.mockClear();

    await expect(engine.dispose()).resolves.toBeUndefined();

    // Resolving quietly would hide a temp file that was never deleted.
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("reports a failed deletion that stop() left running", async () => {
    const engine = new MediaEngine();
    await engine.activate(urlPlay("url-a"));
    hoisted.failing.add("url-a");
    logger.error.mockClear();

    await engine.stop();
    await tick();

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("resolves when nothing is playing", async () => {
    const engine = new MediaEngine();

    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});

it("replays a cached track even when the original online URL is no longer usable", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "cached-replay-"));
  try {
    const audioPath = join(root, "audio");
    await writeFile(audioPath, "cached-audio");
    hoisted.cached.mockResolvedValue({
      audioPath,
      meta: { md5: "same", bitrate: 320000, fileSize: 12 },
    });
    const engine = new MediaEngine();
    await engine.activate({
      type: 4,
      songId: "123",
      bitrate: 320,
      md5: "same",
      musicurl: "https://expired.invalid/song",
    } as never);
    const response = await engine.serve(new Request("audio://audio"));
    expect(await response.text()).toBe("cached-audio");
    await engine.dispose();
    expect(hoisted.deletions.size).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
