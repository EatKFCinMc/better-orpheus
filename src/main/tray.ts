import os from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { app, Menu, MenuItemConstructorOptions, nativeImage, NativeImage, Tray } from "electron";

import { mainWindow } from "./window";
import { registerShutdownTask } from "./lifecycle";
import { kv as settings } from "./settings";
import showManageWindow from "./windows/manage";

import iconFilename from "../../assets/icon_256.png?no-inline";

const defaultIconPath = iconFilename.startsWith("file:")
  ? fileURLToPath(iconFilename)
  : resolve(import.meta.dirname, `.${iconFilename}`);
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
const defaultMenuItems: MenuItemConstructorOptions[] = [
  { label: "显示主窗口", click: showMainWindow },
  {
    label: "管理 Better Orpheus",
    click: () => {
      showManageWindow();
    },
  },
  {
    label: "退出",
    click: () => {
      // Use the host shutdown sequence; legacy pages may ignore exitApp menu events.
      app.quit();
    },
  },
];

export let trayInstalled = false;

let icon: NativeImage | null = null;
let tooltip: string | null = null;

const defaultIcon = createIconForDarwin(nativeImage.createFromPath(defaultIconPath));

const trayIcon = new Tray(defaultIcon);

trayIcon.setToolTip("Better Orpheus 启动中");
trayIcon.setContextMenu(Menu.buildFromTemplate(defaultMenuItems));
trayIcon.on("click", clickHandler);
trayIcon.on("right-click", rightClickHandler);

function createIconForDarwin(icon: NativeImage) {
  if (os.platform() !== "darwin") return icon;
  // On macOS, we need to generate a set of icons with different sizes
  const image = nativeImage.createEmpty();

  const sizes = [16, 32, 64];

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    image.addRepresentation({
      scaleFactor: i + 1,
      width: size,
      height: size,
      buffer: icon.resize({ width: size, height: size }).toPNG(),
    });
  }

  return image;
}

export function setIcon(newIcon: NativeImage) {
  if (newIcon.isEmpty()) {
    LOGGER.warn("Ignoring empty tray icon");
    return;
  }
  newIcon = createIconForDarwin(newIcon);
  icon = newIcon;
  if (trayInstalled) {
    trayIcon.setImage(newIcon);
  }
  LOGGER.debug({ installed: trayInstalled, platform: os.platform() }, "Tray icon updated");
}

export function setTooltip(newTooltip: string) {
  tooltip = newTooltip;
  if (trayInstalled) {
    trayIcon.setToolTip(newTooltip);
  }
}

async function clickHandler() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (os.platform() !== "linux") {
    if (trayInstalled) mainWindow.webContents.send("channel.call", "trayicon.onclick");
    else showMainWindow();
    return;
  }
  const clickBehavior = await settings.get("tray.clickBehavior");
  if (
    clickBehavior === "always-show-main-window" ||
    (clickBehavior !== "always-show-menu" && (!mainWindow.isVisible() || mainWindow.isMinimized()))
  ) {
    showMainWindow();
  } else {
    trayIcon.popUpContextMenu();
  }
}

function rightClickHandler() {
  if (os.platform() === "linux" || !trayInstalled) trayIcon.popUpContextMenu();
  else if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("channel.call", "trayicon.onrightclick");
}

export function install() {
  // Legacy clients may install before supplying a custom image, and may repeat
  // installation after a renderer reload. The host icon is always available.
  trayIcon.setImage(icon || defaultIcon);
  if (tooltip) {
    trayIcon.setToolTip(tooltip);
  } else {
    trayIcon.setToolTip("");
  }
  if (os.platform() === "linux") {
    trayIcon.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "显示网易云音乐菜单",
          click: () => {
            // Although it can't be non-existing...
            if (!mainWindow || mainWindow.isDestroyed()) return;
            mainWindow.webContents.send("channel.call", "trayicon.onrightclick");
          },
        },
        {
          type: "separator",
        },
        ...defaultMenuItems,
      ])
    );
  } else {
    trayIcon.setContextMenu(null);
  }
  trayInstalled = true;
}

export function uninstall() {
  trayIcon.setToolTip("Open Orpheus");
  trayIcon.setImage(defaultIcon);
  trayIcon.setContextMenu(Menu.buildFromTemplate(defaultMenuItems));
  trayInstalled = false;
}

/** Destroy the tray icon on shutdown. */
export function destroyTray() {
  LOGGER.debug("Destroying tray icon");
  trayIcon.destroy();
}

registerShutdownTask({ name: "tray", run: destroyTray });
