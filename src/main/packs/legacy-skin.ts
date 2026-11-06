import { join } from "node:path";
import SkinPack from "./SkinPack";

export function parseLegacySkinPath(pathname: string) {
  const parts = pathname.split("/").slice(1);
  const web = parts.indexOf("web");
  if (
    (web !== 1 && web !== 2) ||
    parts.slice(0, web).some((name) => !/^[\w-]+$/.test(name)) ||
    parts
      .slice(web + 1)
      .some((part) => !part || part === "." || part === ".." || /[\\%]/.test(part))
  )
    return null;
  return { name: parts[web - 1], path: "/" + parts.slice(web).join("/") };
}

const packs = new Map<string, Promise<SkinPack>>();
export async function readLegacySkinAsset(base: string, name: string, path: string) {
  if (!/^[\w-]+$/.test(name)) throw new Error("Invalid skin name");
  const file = join(base, "package", `${name}.skin`);
  let pending = packs.get(file);
  if (!pending) {
    pending = (async () => {
      const pack = new SkinPack(file);
      await pack.readPack();
      return pack;
    })();
    packs.set(file, pending);
    pending.catch(() => {
      if (packs.get(file) === pending) packs.delete(file);
    });
  }
  return (await pending).readFile(path);
}
