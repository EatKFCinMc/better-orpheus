import { readFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import WebPack from "./WebPack";
import SkinPack from "./SkinPack";
import type { ImportProgress } from "../../shared/types/package-download";
export type { ImportProgress } from "../../shared/types/package-download";

export function resourceEntry(path: string): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  return (
    ["package", "resource"].includes(parts[0]) &&
    parts.length > 1 &&
    parts.every((p) => p !== ".." && p !== "." && !p.includes(":"))
  );
}
/** Read the installer as an archive; never execute its code. Publish only validated resources. */
export async function importInstaller(
  installer: string,
  destination: string,
  progress?: (value: ImportProgress) => void
) {
  const bytes = await readFile(installer);
  if (bytes.subarray(0, 2).toString() !== "MZ")
    throw new Error("请选择官方网易云音乐 Windows EXE 安装包。");
  progress?.({ step: "extracting" });
  const output: number[] = [];
  const sevenZip = await (
    await import("7z-wasm")
  ).default({
    stdout: (char: number) => {
      output.push(char);
    },
  });
  sevenZip.FS.writeFile("installer.exe", bytes);
  const listed: unknown = sevenZip.callMain(["l", "-slt", "installer.exe"]);
  if (typeof listed === "number" && listed > 1)
    throw new Error("无法读取安装包，请确认文件完整且版本受支持。");
  const paths = new TextDecoder()
    .decode(Uint8Array.from(output))
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Path = "))
    .map((line) => line.slice(7))
    .filter(resourceEntry);
  if (!paths.some((p) => p.startsWith("resource/")) || !paths.includes("package/orpheus.ntpk"))
    throw new Error("安装包中未找到完整的网易云资源。");
  const extracted: unknown = sevenZip.callMain([
    "x",
    "-y",
    "installer.exe",
    "package/*",
    "resource/*",
  ]);
  if (typeof extracted === "number" && extracted > 1) throw new Error("安装包解压失败。");
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(join(dirname(destination), ".resource-import-"));
  const staged = join(temporary, "package");
  const backup = join(temporary, "previous");
  try {
    let count = 0;
    for (const file of paths) {
      if (sevenZip.FS.isDir(sevenZip.FS.stat(file).mode)) continue;
      const target = resolve(staged, file);
      await mkdir(dirname(target), { recursive: true });
      await (await import("node:fs/promises")).writeFile(target, sevenZip.FS.readFile(file));
      progress?.({ step: "saving", fileIndex: ++count, fileCount: paths.length });
    }
    const web = new WebPack(join(staged, "package/orpheus.ntpk"));
    await web.readPack();
    await web.readFile("/pub/app.html");
    // This fork targets 2.x; 3.x packs use a different skin/API layout.
    const { access } = await import("node:fs/promises");
    try {
      await access(join(staged, "package/default.skin"));
      await access(join(staged, "package/red.skin"));
    } catch {
      throw new Error("此分支支持网易云 2.x 资源，请选择 2.10.13 安装包。");
    }
    for (const name of ["default", "red"]) {
      const skin = new SkinPack(join(staged, `package/${name}.skin`));
      await skin.readPack();
    }
    let previous = false;
    try {
      await rename(destination, backup);
      previous = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(staged, destination);
    } catch (error) {
      if (previous) await rename(backup, destination);
      throw error;
    }
    progress?.({ step: "completed", progress: 1 });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
