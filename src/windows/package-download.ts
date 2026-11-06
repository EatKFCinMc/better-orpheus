import { contextBridge, ipcRenderer } from "electron";

import type { DownloadPackageProgress } from "../main/pack";
import { PackageDownloadReason } from "@shared/types/package-download";

let downloadReason = PackageDownloadReason.NotFound;

for (let i = 0; i < process.argv.length; i++) {
  const item = process.argv[i];
  if (item.startsWith("--download-reason=")) {
    downloadReason = parseInt(item.substring("--download-reason=".length)) as PackageDownloadReason;
    break;
  }
}

contextBridge.exposeInMainWorld("downloadReason", downloadReason);

function startDownload(callback: (progress: DownloadPackageProgress) => void, source?: "manual") {
  if (!(downloadReason in PackageDownloadReason)) {
    LOGGER.warn({ reason: downloadReason }, "Unexpected package download reason");
  }
  LOGGER.info({ reason: downloadReason }, "Package download started");
  const listener = (event: Electron.IpcRendererEvent, progress: DownloadPackageProgress) => {
    if (["completed", "failed", "cancelled"].includes(progress.step)) {
      LOGGER.info({ reason: downloadReason }, "Package download completed");
      ipcRenderer.off("download-package-progress", listener);
    }
    callback(progress);
  };
  ipcRenderer.on("download-package-progress", listener);
  if (source) ipcRenderer.send("download-package", source);
  else ipcRenderer.send("download-package");
}
contextBridge.exposeInMainWorld(
  "downloadPackage",
  (callback: (progress: DownloadPackageProgress) => void) => startDownload(callback)
);
contextBridge.exposeInMainWorld(
  "importPackage",
  (callback: (progress: DownloadPackageProgress) => void) => startDownload(callback, "manual")
);
