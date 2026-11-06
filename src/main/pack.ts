import versions from "../../versions.json";
import { downloadInstaller } from "./packs/download-installer";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

import Emittery from "emittery";

import { pack as base, tempDir } from "./folders";
import type Pack from "./packs/Pack";

import { importInstaller } from "./packs/import-installer";

export const NO_WEBPACK_ERROR_MESSAGE = "No usable web pack file found";

async function chooseWebPackFile() {
  const webPack = resolve(base, "package", "web.pack");
  try {
    await access(webPack);
    return webPack;
  } catch {
    /* empty */
  }
  const orpheusPack = resolve(base, "package", "orpheus.ntpk");
  try {
    await access(orpheusPack);
    return orpheusPack;
  } catch {
    /* empty */
  }
  throw new Error(NO_WEBPACK_ERROR_MESSAGE);
}

export type { ImportProgress as DownloadPackageProgress } from "./packs/import-installer";
import type { ImportProgress as DownloadPackageProgress } from "./packs/import-installer";

export type PackManagerEvents = Record<
  `${string}packloaded`,
  {
    name: string;
    pack: Pack;
    file?: string;
  }
>;

export class PackManager extends Emittery<PackManagerEvents> {
  readonly packs: Map<string, Pack> = new Map();

  async loadWebPack() {
    const webPackPath = await chooseWebPackFile();
    LOGGER.debug({ path: webPackPath }, "Selected web pack file");
    const WebPack = await import("./packs/WebPack").then((m) => m.default);
    const wp = new WebPack(webPackPath);
    await wp.readPack();
    this.packs.set("web", wp);
    LOGGER.info({ file: webPackPath, entries: wp.fileList.length }, "Web pack loaded");
    void this.emit("webpackloaded", { name: "web", pack: wp });
  }

  async loadSkinPack(name: string, name2: string) {
    const SkinPack = await import("./packs/SkinPack").then((m) => m.default);
    const loadOne = async (packKey: "skin" | "skin2", packName: string) => {
      const skinPackPath = resolve(base, "package", `${packName}.skin`);
      try {
        await access(skinPackPath);
      } catch (err) {
        throw new Error(`Cannot load skin pack: ${skinPackPath}`, {
          cause: err,
        });
      }
      const skinPack = new SkinPack(skinPackPath);
      await skinPack.readPack();
      this.packs.set(packKey, skinPack);
      void this.emit(`${packKey}packloaded`, {
        name: packKey,
        pack: skinPack,
        file: `${packName}.skin`,
      });
    };

    await loadOne("skin", name);
    await loadOne("skin2", name2);
    LOGGER.info({ packs: [name, name2] }, "Skin packs loaded");
  }

  getPack<T extends Pack>(pack: string): T {
    const p = this.packs.get(pack);
    if (!p) {
      throw new Error(`Pack not loaded: ${pack}`);
    }
    return p as T;
  }

  async getOrWaitPack<T extends Pack>(pack: string, signal?: AbortSignal): Promise<T> {
    const p = this.packs.get(pack);
    if (p?.isLoaded) {
      return p as T;
    }
    return (await this.once(`${pack}packloaded`, { signal })).data.pack as T;
  }

  async downloadPackage(
    onProgress?: (progress: DownloadPackageProgress) => void,
    signal?: AbortSignal
  ) {
    const { net, session } = await import("electron");
    await mkdir(tempDir, { recursive: true });
    const temporary = await mkdtemp(join(tempDir, "installer-download-"));
    try {
      const installer = join(temporary, "installer.exe");
      await downloadInstaller(versions.downloadUrl, installer, onProgress, signal, (url, options) =>
        net.fetch(typeof url === "string" ? url : url instanceof URL ? url.href : url.url, {
          ...options,
          headers: { "User-Agent": session.defaultSession.getUserAgent() },
        })
      );
      signal?.throwIfAborted();
      await this.importPackage(installer, onProgress);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  async importPackage(installer: string, onProgress?: (progress: DownloadPackageProgress) => void) {
    await importInstaller(installer, base, onProgress);
  }
}

const packManager = new PackManager();
export default packManager;
