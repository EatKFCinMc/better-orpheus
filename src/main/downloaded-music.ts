import { stat } from "node:fs/promises";
import { parseFile } from "music-metadata";
import { commentToID3Json } from "./id3";

export type DownloadScannerItem = {
  comment: string;
  creation_time: number;
  last_accessed: number;
  last_modified: number;
  path: string;
  size: number;
};

/** Keep the original encrypted NetEase record, regardless of its container's tag name. */
export function downloadedMetadataComment(values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const result = downloadedMetadataComment(value);
      if (result) return result;
    } else if (typeof value === "object" && value !== null && "text" in value) {
      const result = downloadedMetadataComment([value.text]);
      if (result) return result;
    } else if (typeof value === "string") {
      const json = commentToID3Json(value);
      if (!json || !(json.startsWith("music:") || json.startsWith("dj:"))) continue;
      try {
        const metadata = JSON.parse(json.slice(json.indexOf(":") + 1));
        if (
          metadata &&
          typeof metadata === "object" &&
          (metadata.musicId != null || metadata.programId != null)
        )
          return json;
      } catch {
        // A damaged tag must not hide a valid record in another comment field.
      }
    }
  }
  return null;
}

export async function readDownloadedMusicInfo(
  file: string,
  filePath: string
): Promise<DownloadScannerItem | undefined> {
  const metadata = await parseFile(filePath, { skipCovers: true, duration: false });
  const comment = downloadedMetadataComment([
    metadata.common.comment,
    ...Object.values(metadata.native).flatMap((tags) => tags.map((tag) => tag.value)),
  ]);
  if (!comment) return;
  const info = await stat(filePath);
  return {
    comment,
    creation_time: info.birthtimeMs,
    last_accessed: info.atimeMs,
    last_modified: info.mtimeMs,
    path: file,
    size: info.size,
  };
}
