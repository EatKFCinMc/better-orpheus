import path from "node:path";

import { dialog, type BrowserWindowConstructorOptions } from "electron";

import packManager from "../pack";
import { PackageDownloadReason } from "@shared/types/package-download";
import { ManagedWindow } from "../window";
import { toError } from "@shared/util";

const packageDownloadWindowOptions = {
  width: 1000,
  height: 600,
  title: "Better Orpheus",
  show: true,
  frame: true,
  webPreferences: {
    partition: "open-orpheus",
    preload: path.join(import.meta.dirname, "package-download.cjs"),
  },
} satisfies BrowserWindowConstructorOptions;

class PackageDownloadWindow extends ManagedWindow {
  private readonly downloadReason: PackageDownloadReason;

  constructor(downloadReason: PackageDownloadReason) {
    super();
    this.downloadReason = downloadReason;
    this.createBrowserWindow({
      ...packageDownloadWindowOptions,
      webPreferences: {
        ...packageDownloadWindowOptions.webPreferences,
        additionalArguments: [`--download-reason=${downloadReason.toString()}`],
      },
    });
    this.hideMenuBar();
    this.loadGuiRoute("/package-download");
  }

  /**
   * Resolves when the package finishes downloading, rejects with `"CANCEL"`
   * when the window is closed early.
   */
  show(): Promise<void> {
    const wnd = this.window;
    if (!wnd) {
      LOGGER.error(
        { downloadReason: PackageDownloadReason[this.downloadReason] },
        "Package download window was not created"
      );
      return Promise.reject(new Error("Package download window was not created"));
    }

    const reasonName = PackageDownloadReason[this.downloadReason];
    const noUsablePack =
      this.downloadReason === PackageDownloadReason.NotFound ||
      this.downloadReason === PackageDownloadReason.LoadFailed;

    return new Promise<void>((resolve, reject) => {
      let downloadSuccess = false;
      let importing = false;
      const controller = new AbortController();
      wnd.webContents.ipc.on("download-package", async (_event, source?: string) => {
        if (importing) return;
        importing = true;
        try {
          const report = (progress: import("@shared/types/package-download").ImportProgress) => {
            if (!wnd.isDestroyed()) wnd.webContents.send("download-package-progress", progress);
          };
          if (source === "manual") {
            const result = await dialog.showOpenDialog(wnd, {
              title: "选择网易云音乐安装包",
              properties: ["openFile"],
              filters: [{ name: "网易云音乐 Windows 安装包", extensions: ["exe"] }],
            });
            if (wnd.isDestroyed()) return;
            if (result.canceled || !result.filePaths[0]) {
              report({ step: "cancelled" });
              return;
            }
            await packManager.importPackage(result.filePaths[0], report);
          } else {
            await packManager.downloadPackage(report, controller.signal);
          }
          downloadSuccess = true;
          resolve();
          if (!wnd.isDestroyed()) wnd.close();
        } catch (error) {
          LOGGER.error({ err: toError(error) }, "Resource import failed");
          if (!wnd.isDestroyed())
            wnd.webContents.send("download-package-progress", {
              step: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
        } finally {
          importing = false;
        }
      });
      wnd.on("closed", () => {
        controller.abort();
        if (downloadSuccess) return;
        if (noUsablePack) {
          LOGGER.fatal(
            { downloadReason: reasonName },
            "No usable web pack and package download was cancelled; exiting"
          );
        } else {
          LOGGER.info({ downloadReason: reasonName }, "Package download cancelled");
        }
        reject("CANCEL");
      });
    });
  }
}

export default function showPackgeDownloadWindow(
  downloadReason = PackageDownloadReason.LoadFailed
): Promise<void> {
  LOGGER.info(
    { downloadReason: PackageDownloadReason[downloadReason] },
    "Showing package download window"
  );
  return new PackageDownloadWindow(downloadReason).show();
}
