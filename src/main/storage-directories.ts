import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  mkdtemp,
  readdir,
  lstat,
  copyFile,
  realpath,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join, dirname, relative, isAbsolute, sep } from "node:path";
import { isWritableDir } from "./util/fs";
export type DirectoryKind = "download" | "cache";
export type DirectoryPreferences = Partial<Record<DirectoryKind, string>>;
export async function readDirectoryPreferences(file: string): Promise<DirectoryPreferences> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
export function normalizeDirectory(path: string) {
  const normalized = path.replaceAll("\\", "/");
  if (!isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized))
    throw new Error("请选择 Linux 绝对目录路径。");
  return resolve(normalized);
}
async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
/** Copy and verify without deleting originals or overwriting destination files. */
export async function copyDownloads(source: string, destination: string) {
  const from = await realpath(normalizeDirectory(source)),
    to = await realpath(normalizeDirectory(destination));
  const rel = relative(from, to),
    reverse = relative(to, from);
  const within = (value: string) =>
    value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
  if (within(rel) || within(reverse)) throw new Error("迁移目录不能相同或互相包含。");
  const staging = await mkdtemp(join(to, ".music-copy-"));
  const published: string[] = [];
  try {
    const files: string[] = [];
    async function walk(base: string, prefix = "") {
      for (const entry of await readdir(base, { withFileTypes: true })) {
        const name = join(prefix, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`目录中存在符号链接，未复制：${name}`);
        if (entry.isDirectory()) await walk(join(base, entry.name), name);
        else if (entry.isFile()) files.push(name);
      }
    }
    await walk(from);
    for (const file of files) {
      const target = join(to, file);
      let parent = dirname(target);
      while (parent !== to) {
        try {
          if ((await lstat(parent)).isSymbolicLink())
            throw new Error(`目标子目录包含符号链接：${file}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        parent = dirname(parent);
      }
      try {
        await lstat(target);
        throw new Error(`目标已有同名文件：${file}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const staged = join(staging, file);
      await mkdir(dirname(staged), { recursive: true });
      await copyFile(join(from, file), staged);
      if ((await digest(join(from, file))) !== (await digest(staged)))
        throw new Error(`文件复制校验失败：${file}`);
    }
    for (const file of files) {
      const target = join(to, file);
      await mkdir(dirname(target), { recursive: true });
      // Exclusive copy also protects against files created after the initial check.
      await copyFile(join(staging, file), target, 1);
      published.push(target);
    }
  } catch (error) {
    for (const file of published) await rm(file, { force: true });
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export async function saveDirectoryPreference(
  file: string,
  kind: DirectoryKind,
  requested: string
) {
  const path = normalizeDirectory(requested);
  if (!(await isWritableDir(path))) throw new Error("所选目录不存在或不可写，请选择其他目录。");
  const preferences = await readDirectoryPreferences(file);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ ...preferences, [kind]: path }, null, 2), {
      mode: 0o600,
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return path;
}
