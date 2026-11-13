import { execFile as execFileCb } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createProjectTarball } from "../common/archive.ts";

const execFile = promisify(execFileCb);
const frameworkPath = "chromatic/src/js-framework";

export async function createFlatpakSourceTarball(
  projectRoot: string,
  dest: string,
  name: string,
  version: string
) {
  const { stdout } = await execFile(
    "git",
    ["-C", resolve(projectRoot, frameworkPath), "ls-files", "--cached", "-z"],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const frameworkFiles = stdout.split("\0").filter(Boolean);
  if (!frameworkFiles.includes("src/index.ts")) {
    throw new Error(
      "BetterNCM framework is missing. Run git submodule update --init && git -C chromatic submodule update --init src/js-framework."
    );
  }

  const sourceFiles = [
    "chromatic/LICENSE",
    "chromatic/resource/PluginMarket.plugin",
    ...frameworkFiles.map((file) => `${frameworkPath}/${file}`),
  ];
  await Promise.all(sourceFiles.map((file) => access(resolve(projectRoot, file))));
  await createProjectTarball(projectRoot, dest, name, version, [], sourceFiles);
}
