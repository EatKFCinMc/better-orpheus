import { expect, it, vi } from "vitest";
import { installLoggerStub } from "../helpers/globals";
import { MediaPlaybackBackend } from "../../src/preload/backends/MediaPlaybackBackend";

it("notifies load once even when restoring progress triggers canplay again", async () => {
  installLoggerStub();
  class AudioFixture extends EventTarget {
    currentTime = 0;
    load() {}
    pause() {}
    removeAttribute() {}
  }
  const element = new AudioFixture();
  vi.stubGlobal("Audio", function () {
    return element;
  });
  try {
    const events: string[] = [];
    const backend = new MediaPlaybackBackend(
      { createMediaElementSource: () => ({}) } as unknown as AudioContext,
      (name) => {
        events.push(name);
        if (name === "load") {
          backend.seek(101);
          element.dispatchEvent(new Event("canplay"));
        }
      }
    );
    await backend.load();
    element.dispatchEvent(new Event("canplay"));
    element.dispatchEvent(new Event("canplay"));
    expect(events).toEqual(["load"]);
    expect(backend.currentTime).toBe(101);
    element.dispatchEvent(new Event("seeked"));
    expect(events).toEqual(["load", "seeked"]);
    await backend.load();
    element.dispatchEvent(new Event("canplay"));
    expect(events.filter((name) => name === "load")).toHaveLength(2);
    backend.stop();
    element.dispatchEvent(new Event("canplay"));
    expect(events.filter((name) => name === "load")).toHaveLength(2);
    await backend.load();
    await backend.dispose();
    element.dispatchEvent(new Event("canplay"));
    expect(events.filter((name) => name === "load")).toHaveLength(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
