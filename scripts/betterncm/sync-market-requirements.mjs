// Extract declarations from the packed catalog; never infer compatibility from names.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
const root = resolve(process.argv[2] || "../BetterNCM-Packed-Plugins");
const catalog = JSON.parse(await readFile(resolve(root, "plugins.json"), "utf8"));
const declarations = {};
for (const plugin of catalog) {
  const zip = unzipSync(await readFile(resolve(root, plugin["file-url"])), {
    filter: (entry) => entry.name === "manifest.json",
  });
  const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
  declarations[`${plugin.repo}:${plugin.slug}@${plugin.version}`] =
    manifest["ncm-version-req"] || null;
}
await writeFile(
  "src/betterncm/metadata/market-requirements.json",
  JSON.stringify(declarations, null, 2) + "\n"
);
