import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { downloadInstaller } from "../../src/main/packs/download-installer";

it("streams installer bytes and reports download progress", async () => {
  const root = await mkdtemp(join(tmpdir(), "installer-download-"));
  try {
    const destination = join(root, "installer.exe");
    const progress = vi.fn();
    const fetcher = vi.fn(
      async () => new Response("MZexample", { headers: { "content-length": "9" } })
    );
    await downloadInstaller(
      "https://example.com/installer.exe",
      destination,
      progress,
      undefined,
      fetcher
    );
    expect(await readFile(destination, "utf8")).toBe("MZexample");
    expect(progress).toHaveBeenLastCalledWith({
      step: "downloading",
      receivedBytes: 9,
      totalBytes: 9,
      progress: 1,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects HTTP failures and truncated downloads without keeping partial files", async () => {
  const root = await mkdtemp(join(tmpdir(), "installer-download-"));
  try {
    const destination = join(root, "installer.exe");
    await expect(
      downloadInstaller(
        "https://example.com",
        destination,
        undefined,
        undefined,
        async () => new Response("denied", { status: 403 })
      )
    ).rejects.toThrow("HTTP 403");
    await expect(
      downloadInstaller(
        "https://example.com",
        destination,
        undefined,
        undefined,
        async () => new Response("MZ", { headers: { "content-length": "10" } })
      )
    ).rejects.toThrow("下载不完整");
    await expect(access(destination)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("cancels an in-flight download and removes the partial file", async () => {
  const root = await mkdtemp(join(tmpdir(), "installer-download-"));
  const controller = new AbortController();
  try {
    const destination = join(root, "installer.exe");
    const fetcher = async () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(new TextEncoder().encode("MZ"));
            setTimeout(() => controller.abort(), 20);
          },
        })
      );
    await expect(
      downloadInstaller("https://example.com", destination, undefined, controller.signal, fetcher)
    ).rejects.toThrow();
    await expect(access(destination)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
