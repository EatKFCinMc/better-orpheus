import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  statfsSync: vi.fn(),
}));
vi.mock("node:child_process", () => mocks);
vi.mock("node:fs", async () => ({
  ...(await vi.importActual<typeof import("node:fs")>("node:fs")),
  ...mocks,
}));
import { getDisks } from "../../src/main/betterncm/fs-helpers";
import { commandArguments, executePluginCommand } from "../../src/main/betterncm/commands";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.statSync.mockImplementation((path: string) => ({
    isDirectory: () => true,
    dev: path === "/Volumes/System" ? 1 : path === "/" ? 1 : 2,
  }));
  mocks.statfsSync.mockReturnValue({ blocks: 100, bfree: 40, bsize: 1024 });
});
it("enumerates Windows system drives and skips unavailable media", () => {
  mocks.execFileSync.mockReturnValue("C:\\\r\nD:\\\r\nE:\\\r\n");
  mocks.statfsSync.mockImplementation((path: string) => {
    if (path === "D:\\") throw new Error("No media");
    return { blocks: 100, bfree: 40, bsize: 1024 };
  });
  expect(getDisks("win32")).toEqual([
    { disk: "C:\\", name: "C:\\", size: 102400, used: 61440 },
    { disk: "E:\\", name: "E:\\", size: 102400, used: 61440 },
  ]);
});
it("enumerates macOS volumes without duplicating the root volume", () => {
  mocks.readdirSync.mockReturnValue(["System", "External"]);
  expect(getDisks("darwin").map((d) => d.disk)).toEqual(["/", "/Volumes/External"]);
});
it("keeps root available if macOS mount metadata cannot be read", () => {
  mocks.readdirSync.mockImplementation(() => {
    throw new Error("Unavailable");
  });
  expect(getDisks("darwin").map((d) => d.disk)).toEqual(["/"]);
});
it("preserves Linux device deduplication and escaped mount paths", () => {
  mocks.readFileSync.mockReturnValue(
    "1 0 8:1 / / rw - ext4 /dev/sda rw\n" +
      "2 0 8:1 / /bind rw - ext4 /dev/sda rw\n" +
      "3 0 8:2 / /media/My\\040Disk rw - ext4 /dev/sdb rw"
  );
  expect(getDisks("linux").map((d) => d.disk)).toEqual(["/", "/media/My Disk"]);
});
const shell = () => ({
  openExternal: vi.fn(async () => {}),
  openPath: vi.fn(async () => ""),
  showItemInFolder: vi.fn(),
});
it.each(["linux", "darwin", "win32"] as const)(
  "opens and selects paths on %s",
  async (platform) => {
    const host = shell();
    const pathFor = vi.fn((path: string) => path);
    expect(
      (
        await executePluginCommand('explorer.exe /select,"folder/file name.txt"', {
          shell: host,
          pathFor,
          platform,
        })
      ).status
    ).toBe(200);
    expect(host.showItemInFolder).toHaveBeenCalledWith("folder/file name.txt");
    await executePluginCommand('explorer "folder name"', { shell: host, pathFor, platform });
    expect(host.openPath).toHaveBeenCalledWith("folder name");
  }
);
it("launches Windows executables without a shell and preserves quoted arguments", async () => {
  const child = { once: vi.fn(), unref: vi.fn() };
  child.once.mockImplementation((event, callback) => {
    if (event === "spawn") callback();
    return child;
  });
  mocks.spawn.mockReturnValue(child);
  expect(
    (
      await executePluginCommand('"C:\\Program Files\\App.exe" "hello world" "& calc.exe"', {
        shell: shell(),
        pathFor: (x) => x,
        platform: "win32",
      })
    ).status
  ).toBe(200);
  expect(mocks.spawn).toHaveBeenCalledWith(
    "C:\\Program Files\\App.exe",
    ["hello world", "& calc.exe"],
    expect.objectContaining({ shell: false })
  );
});
it("uses UAC with an encoded literal command for elevated Windows executables", async () => {
  mocks.execFile.mockImplementation((_exe, _args, _options, callback) => callback(null));
  const result = await executePluginCommand('app.exe "a\'b" "& calc.exe"', {
    shell: shell(),
    pathFor: (x) => x,
    platform: "win32",
    elevate: true,
  });
  expect(result.status).toBe(200);
  const [exe, args] = mocks.execFile.mock.calls[0];
  expect(exe).toBe("powershell.exe");
  const script = Buffer.from(args.at(-1), "base64").toString("utf16le");
  expect(script).toContain("-Verb RunAs");
  expect(script).toContain("a''b");
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it.each(["linux", "darwin"] as const)(
  "rejects Windows program and elevation requests on %s",
  async (platform) => {
    const options = { shell: shell(), pathFor: (x: string) => x, platform };
    expect((await executePluginCommand("app.exe", options)).status).toBe(501);
    expect((await executePluginCommand("app.exe", { ...options, elevate: true })).status).toBe(501);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
  }
);
it("reports malformed quoting and shell commands without launching them", async () => {
  const options = { shell: shell(), pathFor: (x: string) => x, platform: "win32" as const };
  expect((await executePluginCommand('app.exe "unterminated', options)).status).toBe(400);
  expect((await executePluginCommand("cmd.exe /c calc", options)).status).toBe(501);
  expect(commandArguments('app.exe "" "a b"')).toEqual(["app.exe", "", "a b"]);
  expect(mocks.spawn).not.toHaveBeenCalled();
});
