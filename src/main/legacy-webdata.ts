import { mkdir, readdir, copyFile, writeFile, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { normalizePath, sanitizeRelativePath } from "./util/path";
export function storageWritePath(data: string, input: string, type?: string): string {
  const normalized = normalizePath(input);
  if (type === "abs" && isAbsolute(normalized)) return normalized;
  const path = sanitizeRelativePath(data, input);
  if (path === false) throw new Error(`Forbidden file path access attempt: ${input}`);
  return path;
}
/** Recover old development writes without touching sources or replacing newer data. */
export async function migrateLegacyWebdata(
  data: string,
  workingDirectory = process.cwd()
): Promise<number> {
  // Isolated/custom profiles must never inherit another profile's playback queue.
  if (resolve(data) !== resolve(workingDirectory, "data")) return 0;
  const source = join(workingDirectory, "webdata");
  let copied = 0;
  async function walk(directory: string, prefix = "") {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relative = join(prefix, entry.name);
      if (entry.isDirectory()) await walk(join(directory, entry.name), relative);
      else if (entry.isFile()) {
        const target = join(data, "webdata", relative);
        await mkdir(dirname(target), { recursive: true });
        try {
          await copyFile(join(directory, entry.name), target, constants.COPYFILE_EXCL);
          copied++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
    }
  }
  await walk(source);
  return copied;
}
async function atomicWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const pendingWrites = new Map<string, Promise<void>>();
export function writeStorageFile(path: string, content: string): Promise<void> {
  const task = (pendingWrites.get(path) || Promise.resolve())
    .catch(() => {})
    .then(() => atomicWrite(path, content));
  pendingWrites.set(path, task);
  const cleanup = () => {
    if (pendingWrites.get(path) === task) pendingWrites.delete(path);
  };
  void task.then(cleanup, cleanup);
  return task;
}
export async function flushStorageWrites() {
  await Promise.all(pendingWrites.values());
}
