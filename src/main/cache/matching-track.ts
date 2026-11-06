import { stat } from "node:fs/promises";
import type PlayCacheManager from "./PlayCacheManager";
export interface CacheQuery {
  songId: string;
  bitrate: number;
  md5?: string;
}
export const bitrateKbps = (value: number) => (value > 10000 ? value / 1000 : value);
export async function matchingCachedTrack(manager: PlayCacheManager | null, query: CacheQuery) {
  if (!manager) return null;
  const cached = await manager.getCachedTrack(String(query.songId));
  if (
    !cached ||
    !query.md5 ||
    cached.meta.md5 !== query.md5 ||
    bitrateKbps(cached.meta.bitrate) !== bitrateKbps(query.bitrate)
  )
    return null;
  try {
    const file = await stat(cached.audioPath);
    if (!file.isFile() || file.size === 0 || file.size !== cached.meta.fileSize) return null;
  } catch {
    return null;
  }
  return cached;
}
