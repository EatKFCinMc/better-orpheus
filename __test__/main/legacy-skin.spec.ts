import { expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/main/packs/SkinPack", () => ({
  default: class {
    constructor(public path: string) {}
    readPack = read;
    async readFile(path: string) {
      return Buffer.from(this.path + ":" + path);
    }
  },
}));
import { parseLegacySkinPath, readLegacySkinAsset } from "../../src/main/packs/legacy-skin";
it("resolves legacy colour skins and their relative image URLs", async () => {
  expect(parseLegacySkinPath("/default/red/web/css/skin.ls.css")).toEqual({
    name: "red",
    path: "/web/css/skin.ls.css",
  });
  expect(parseLegacySkinPath("/default/red/web/img/topbar_bg.png")?.name).toBe("red");
  expect(parseLegacySkinPath("/pub/web/css/skin.ls.css")?.name).toBe("pub");
  expect(parseLegacySkinPath("/default/%2e%2e/web/css/skin.ls.css")).toBeNull();
  expect(parseLegacySkinPath("/default/red/web/../secret")).toBeNull();
  expect((await readLegacySkinAsset("/fixture", "red", "/web/css/skin.ls.css")).toString()).toBe(
    "/fixture/package/red.skin:/web/css/skin.ls.css"
  );
  await readLegacySkinAsset("/fixture", "red", "/web/img/topbar_bg.png");
  expect(read).toHaveBeenCalledTimes(1);
});
