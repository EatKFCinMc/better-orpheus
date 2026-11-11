import type { BrowserWindow } from "electron";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import versions from "../../../versions.json";
import { getStartupScripts } from "./startup";
import { setHijackPlugins } from "./hijacks";
import { root, assets, config, token } from "./host";
import { refreshHijacks } from "./plugin-runtime";

import {
  readBetterNCMPageState,
  startBetterNCMInPage,
  type BetterNCMBootstrapPayload,
} from "@shared/betterncm-bootstrap";

export function bootstrapPayload(safeMode = false): BetterNCMBootstrapPayload {
  if (safeMode) setHijackPlugins([]);
  else refreshHijacks();
  return {
    source: readFileSync(join(assets(), "framework.js"), "utf8"),
    key: token,
    startupScripts:
      safeMode || config["cc.microblock.betterncm.cpp_side_inject_feature_disabled"] === "true"
        ? []
        : getStartupScripts(root, versions.version),
  };
}
export async function injectBetterNCM(wnd: BrowserWindow) {
  // Fallback for a preload failure; normal startup happens before page scripts.
  const state = await wnd.webContents.executeJavaScript(`(${readBetterNCMPageState.toString()})()`);
  if (state?.started) return;
  const payload = bootstrapPayload(Boolean(state?.safe));
  await wnd.webContents.executeJavaScript(
    `(${startBetterNCMInPage.toString()})(${JSON.stringify(payload)})`
  );
}
