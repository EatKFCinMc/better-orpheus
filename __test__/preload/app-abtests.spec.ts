import { expect, it, vi } from "vitest";
import CallDispatcher from "../../src/shared/CallDispatcher";
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock("../../src/preload/calls", () => ({
  registerCallHandler: (name: string, handler: (...args: unknown[]) => unknown) =>
    handlers.set(name, handler),
}));
vi.mock("../../src/preload/channel", () => ({ fireNativeCall: vi.fn() }));
vi.mock("../../src/preload/MusicRecognizer", () => ({ default: class {} }));
vi.mock("../../src/preload/util", () => ({ channel: null }));
import "../../src/preload/calls/app";
it("returns AB test keys as one array argument to the legacy callback", async () => {
  const dispatcher = new CallDispatcher();
  dispatcher.registerHandler(
    "app.getABTestKeys",
    handlers.get("app.getABTestKeys")! as () => [string[]]
  );
  const callback = vi.fn();
  await dispatcher.dispatch("app.getABTestKeys", callback);
  expect(callback.mock.calls).toHaveLength(1);
  expect(callback.mock.calls[0]).toHaveLength(1);
  const keys = callback.mock.calls[0][0];
  expect(Array.isArray(keys)).toBe(true);
  expect(() => keys.forEach((key: unknown) => expect(typeof key).toBe("string"))).not.toThrow();
});
