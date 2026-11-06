import { expect, it } from "vitest";
import { AudioOperations } from "../../src/preload/audio-operations";
it("echoes transport and seek tokens so legacy restore can finish and accept progress", () => {
  const operations = new AudioOperations();
  operations.setSeek("track", "track|seek|restore");
  expect(operations.takeSeekId("stale-track")).toBe("");
  expect(operations.takeSeekId("track")).toBe("track|seek|restore");
  expect(operations.takeSeekId("track")).toBe("");
  operations.setTransport("track", "track|resume|first");
  expect(operations.transportId("track")).toBe("track|resume|first");
  operations.setTransport("track", "track|pause|second");
  expect(operations.transportId("track")).toBe("track|pause|second");
  expect(operations.transportId("other")).toBe("");
  operations.reset();
  expect(operations.transportId("track")).toBe("");
});
