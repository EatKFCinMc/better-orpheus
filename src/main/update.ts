import { app } from "electron";
import semver from "semver";

import { homepage } from "../../package.json";
import type { UpdateInfo } from "@shared/types/update";

let cachedUpdateInfo: UpdateInfo | null | false = false;

export async function checkUpdate(ignoreCache = false): Promise<UpdateInfo | null> {
  if (!ignoreCache && cachedUpdateInfo !== false) return cachedUpdateInfo;

  const releaseUrl = new URL(
    `https://api.github.com/repos${new URL(homepage).pathname}/releases/latest`
  );
  const response = await fetch(releaseUrl);
  if (response.status === 404) return (cachedUpdateInfo = null);
  if (!response.ok) throw new Error(`GitHub release check failed (HTTP ${response.status}).`);

  const res: {
    tag_name: string;
    html_url: string;
    published_at: string;
    body: string;
  } = await response.json();

  const current = semver.coerce(app.getVersion());
  const latest = semver.coerce(res.tag_name);

  if (!current || !latest) {
    throw new Error("Invalid version syntaxes.");
  }

  if (!semver.gt(latest, current)) {
    LOGGER.debug({ current: current.version }, "No update available");
    return (cachedUpdateInfo = null);
  }

  LOGGER.info({ current: current.version, latest: latest.version }, "Update available");

  return (cachedUpdateInfo = {
    version: res.tag_name,
    releaseNote: res.body,
    url: res.html_url,
    time: res.published_at,
  });
}
