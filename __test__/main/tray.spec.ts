import { beforeEach, expect, it, vi } from "vitest";
import { app } from "electron";
import { installLoggerStub } from "../helpers/globals";
const mocks = vi.hoisted(() => {
  const image = { isEmpty: () => false };
  return {
    image,
    createFromPath: vi.fn((_path: string) => image),
    setImage: vi.fn(),
    setContextMenu: vi.fn(),
    popUpContextMenu: vi.fn(),
    listeners: {} as Record<string, () => unknown>,
    window: {
      isDestroyed: () => false,
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: { send: vi.fn() },
    },
    getSetting: vi.fn(),
  };
});
vi.mock("electron", () => ({
  app: { quit: vi.fn() },
  Menu: { buildFromTemplate: (items: unknown) => items },
  nativeImage: { createFromPath: mocks.createFromPath },
  Tray: class {
    constructor() {}
    setImage = mocks.setImage;
    setContextMenu = mocks.setContextMenu;
    setToolTip() {}
    on(event: string, callback: () => unknown) {
      mocks.listeners[event] = callback;
    }
    popUpContextMenu = mocks.popUpContextMenu;
    destroy() {}
  },
}));
vi.mock("../../assets/icon_256.png?no-inline", () => ({
  default: "file:///tmp/test%20assets/icon.png",
}));
vi.mock("node:os", () => ({ default: { platform: () => "linux" } }));
vi.mock("../../src/main/window", () => ({ mainWindow: mocks.window }));
vi.mock("../../src/main/lifecycle", () => ({ registerShutdownTask: vi.fn() }));
vi.mock("../../src/main/settings", () => ({ kv: { get: mocks.getSetting } }));
vi.mock("../../src/main/windows/manage", () => ({ default: vi.fn() }));
import { install, uninstall, setIcon } from "../../src/main/tray";
const importedIconPath = mocks.createFromPath.mock.calls[0]?.[0];
beforeEach(() => {
  installLoggerStub();
  vi.clearAllMocks();
  mocks.getSetting.mockResolvedValue(undefined);
  mocks.window.isMinimized.mockReturnValue(true);
  mocks.window.isVisible.mockReturnValue(true);
});
it("uses a decoded asset path and installs without a frontend icon", () => {
  expect(importedIconPath).toBe("/tmp/test assets/icon.png");
  install();
  expect(mocks.setImage).toHaveBeenLastCalledWith(mocks.image);
  expect(() => install()).not.toThrow();
});
it("restores a minimized window directly and retains recovery after uninstall", async () => {
  uninstall();
  await mocks.listeners.click();
  expect(mocks.window.restore).toHaveBeenCalled();
  expect(mocks.window.show).toHaveBeenCalled();
  expect(mocks.window.focus).toHaveBeenCalled();
  expect(mocks.window.webContents.send).not.toHaveBeenCalled();
  const items = mocks.setContextMenu.mock.lastCall![0];
  expect(items.some((item: { label: string }) => item.label === "显示主窗口")).toBe(true);
});
it("keeps the native menu accessible and ignores empty custom images", async () => {
  mocks.getSetting.mockResolvedValue("always-show-menu");
  await mocks.listeners.click();
  expect(mocks.popUpContextMenu).toHaveBeenCalled();
  setIcon({ isEmpty: () => true } as never);
  expect(mocks.setImage).not.toHaveBeenCalled();
});

it("quits on the first tray exit click even when the legacy page ignores menu events", () => {
  install();
  const items = mocks.setContextMenu.mock.lastCall![0];
  const exit = items.find((item: { label?: string }) => item.label === "退出");
  exit.click();
  expect(app.quit).toHaveBeenCalledTimes(1);
  expect(mocks.window.webContents.send).not.toHaveBeenCalled();
});
