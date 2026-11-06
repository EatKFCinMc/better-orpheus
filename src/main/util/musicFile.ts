import mime from "mime";
import { extname } from "node:path";

// These audio containers are missing or misclassified in the MIME database.
const additionalAudioExtensions = new Set([".ape", ".wv", ".mpc", ".tta", ".dsf", ".dff"]);

export function isMusicFile(fileOrPath: string): boolean {
  return (
    additionalAudioExtensions.has(extname(fileOrPath).toLowerCase()) ||
    (mime.getType(fileOrPath)?.startsWith("audio/") ?? false)
  );
}
