import { resolve } from "node:path";
import {
  transformLoader,
  transformPlugin,
  transformPluginManager,
  transformBrowserApi,
} from "./betterncm/upstream-transforms.ts";
import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
await mkdir("assets/betterncm", { recursive: true });
await build({
  entryPoints: ["src/betterncm/runtime.ts"],
  bundle: true,
  outfile: "assets/betterncm/framework.js",
  plugins: [
    {
      name: "electron-lifecycle",
      setup(build) {
        build.onLoad(
          { filter: /js-framework\/src\/betterncm-api\/(base|utils|ncm)\.ts$/ },
          async (args) => ({
            contents: await readFile(`src/betterncm/api/${args.path.split("/").pop()}`, "utf8"),
            loader: "ts",
          })
        );
        build.onLoad(
          { filter: /js-framework\/src\/betterncm-api\/(app|fs|tests)\.ts$/ },
          async (args) => ({
            contents: transformBrowserApi(
              await readFile(args.path, "utf8"),
              args.path.split("/").pop()!
            ),
            loader: "ts",
            resolveDir: resolve(args.path, ".."),
          })
        );
        build.onLoad({ filter: /js-framework\/src\/loader\.ts$/ }, async (args) => ({
          contents: transformLoader(
            await readFile(args.path, "utf8"),
            await readFile("src/betterncm/loader-function.txt", "utf8")
          ),
          loader: "ts",
        }));
        build.onLoad(
          { filter: /js-framework\/src\/plugin-manager\/index\.tsx$/ },
          async (args) => ({
            contents: transformPluginManager(await readFile(args.path, "utf8")),
            loader: "tsx",
          })
        );
        build.onLoad({ filter: /js-framework\/src\/plugin\.ts$/ }, async (args) => ({
          contents: transformPlugin(await readFile(args.path, "utf8")),
          loader: "ts",
        }));
      },
    },
  ],
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  define: { "process.env.NODE_ENV": '"production"' },
});
await copyFile("chromatic/resource/PluginMarket.plugin", "assets/betterncm/PluginMarket.plugin");
await copyFile("chromatic/LICENSE", "assets/betterncm/LICENSE");
