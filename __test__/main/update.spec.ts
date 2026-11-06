import { afterEach, expect, it, vi } from "vitest";

import { checkUpdate } from "../../src/main/update";

vi.mock("electron", () => ({ app: { getVersion: () => "0.1.0" } }));

afterEach(() => vi.unstubAllGlobals());

it("checks the Better Orpheus release feed", async () => {
  const releaseUrl = "https://github.com/EatKFCinMc/better-orpheus/releases/tag/v0.2.0";
  const fetchRelease = vi.fn().mockResolvedValue(
    Response.json({
      tag_name: "v0.2.0",
      html_url: releaseUrl,
      published_at: "2026-11-05T00:00:00Z",
      body: "Release notes",
    })
  );
  vi.stubGlobal("fetch", fetchRelease);

  await expect(checkUpdate(true)).resolves.toMatchObject({ version: "v0.2.0", url: releaseUrl });
  expect(fetchRelease).toHaveBeenCalledWith(
    new URL("https://api.github.com/repos/EatKFCinMc/better-orpheus/releases/latest")
  );
});

it("reports no update when GitHub has no latest release", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(checkUpdate(true)).resolves.toBeNull();
});
