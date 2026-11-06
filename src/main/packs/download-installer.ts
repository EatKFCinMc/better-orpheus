import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ImportProgress } from "@shared/types/package-download";

export async function downloadInstaller(
  url: string,
  destination: string,
  progress?: (value: ImportProgress) => void,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(url, { signal });
  if (!response.ok || !response.body)
    throw new Error(`下载安装包失败（HTTP ${response.status}）。`);
  const total = Number(response.headers.get("content-length")) || undefined;
  let received = 0,
    lastReported = 0;
  const report = () =>
    progress?.({
      step: "downloading",
      receivedBytes: received,
      totalBytes: total,
      progress: total ? received / total : undefined,
    });
  report();
  try {
    await pipeline(
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          if (Date.now() - lastReported >= 200) {
            lastReported = Date.now();
            report();
          }
          callback(null, chunk);
        },
      }),
      createWriteStream(destination, { flags: "wx" }),
      { signal }
    );
    if (!received || (total && received !== total)) throw new Error("安装包下载不完整，请重试。");
    report();
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}
