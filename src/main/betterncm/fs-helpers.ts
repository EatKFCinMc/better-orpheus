import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, sep } from "node:path";
import { unzipSync } from "fflate";
import { pluginPath } from "./files";

export function unpackSync(archive: string, dest: string) {
  const entries = unzipSync(fs.readFileSync(archive));
  fs.mkdirSync(dest, { recursive: true });
  // Resolve all entries first, so a bad path cannot leave a partial install.
  const files = Object.entries(entries).map(([name, bytes]) => ({
    name,
    bytes,
    path: pluginPath(dest, name),
  }));
  for (const file of files) {
    if (file.name.endsWith("/")) fs.mkdirSync(file.path, { recursive: true });
    else {
      fs.mkdirSync(dirname(file.path), { recursive: true });
      fs.writeFileSync(file.path, file.bytes);
    }
  }
  return 0;
}

export function directorySnapshot(root: string, input: string) {
  const directory = pluginPath(root, input);
  const entries: Record<string, string> = Object.create(null);
  const walk = (path: string) => {
    for (const item of fs.readdirSync(path, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const file = pluginPath(root, join(path, item.name));
      const stat = fs.statSync(file);
      entries[relative(directory, file).split(sep).join("/")] =
        `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      if (item.isDirectory()) walk(file);
    }
  };
  walk(directory);
  return entries;
}

export function mountedDirectoryUrl(root: string, directory: string) {
  const path = relative(root, directory).split(sep).map(encodeURIComponent).join("/");
  return `betterncm://runtime/local/${path}`;
}

export function dialogFilters(filter: string) {
  const parts = filter.split("\0").filter(Boolean);
  const result: Array<{ name: string; extensions: string[] }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const extensions = parts[i + 1]
      .split(";")
      .map((x) => x.trim().replace(/^\*\./, ""))
      .filter((x) => /^[\w-]+$/.test(x) || x === "*");
    if (extensions.length) result.push({ name: parts[i], extensions });
  }
  return result;
}

/** Available mounted volumes; inaccessible and duplicate volumes are skipped. */
export function getDisks(platform: NodeJS.Platform = process.platform) {
  const disks: Array<{ disk: string; name: string; used: number; size: number }> = [];
  let mounts: Array<{ path: string; name: string; source: string }> = [
    { path: "/", name: "Filesystem", source: "/" },
  ];
  try {
    if (platform === "win32") {
      // Query the system drive list rather than probing every possible drive letter.
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[System.IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name }",
        ],
        { encoding: "utf8", timeout: 5000, windowsHide: true }
      );
      mounts = output
        .trim()
        .split(/\r?\n/)
        .filter((path) => /^[a-z]:\\$/i.test(path))
        .map((path) => ({ path, name: path, source: path.toLowerCase() }));
    } else if (platform === "darwin") {
      mounts.push(
        ...fs.readdirSync("/Volumes").map((name) => ({
          path: join("/Volumes", name),
          name,
          source: join("/Volumes", name),
        }))
      );
    } else if (platform === "linux")
      mounts = fs
        .readFileSync("/proc/self/mountinfo", "utf8")
        .trim()
        .split("\n")
        .flatMap((line) => {
          const [head, tail] = line.split(" - ");
          const fields = head.split(" ");
          const [type, source] = tail.split(" ");
          const path = fields[4].replace(/\\([0-7]{3})/g, (_, octal) =>
            String.fromCharCode(parseInt(octal, 8))
          );
          return path === "/" || source.startsWith("/dev/") ? [{ path, name: type, source }] : [];
        })
        .sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));
  } catch {
    // Keep a useful system-volume fallback when mount metadata is unavailable.
    if (platform === "win32") {
      const path = /^[a-z]:$/i.test(process.env.SystemDrive || "")
        ? process.env.SystemDrive + "\\"
        : "C:\\";
      mounts = [{ path, name: path, source: path }];
    }
  }
  const seen = new Set<string>();
  for (const mount of mounts) {
    if (seen.has(mount.source)) continue;
    try {
      if (!fs.statSync(mount.path).isDirectory()) continue;
      const identity = platform === "darwin" ? String(fs.statSync(mount.path).dev) : mount.source;
      if (seen.has(identity)) continue;
      const stat = fs.statfsSync(mount.path);
      disks.push({
        disk: mount.path,
        name: mount.name,
        size: stat.blocks * stat.bsize,
        used: Math.max(0, stat.blocks - stat.bfree) * stat.bsize,
      });
      seen.add(identity);
    } catch {
      /* Skip detached or inaccessible filesystems. */
    }
  }
  return disks;
}
