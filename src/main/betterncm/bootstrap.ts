import type { BrowserWindow } from "electron";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import versions from "../../../versions.json";
import { getStartupScripts } from "./startup";
import { setHijackPlugins } from "./hijacks";
import { root, assets, config, token } from "./host";
import { refreshHijacks } from "./plugin-runtime";

export function bootstrapPayload(safeMode = false) {
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
  const state = await wnd.webContents.executeJavaScript(
    '({started:Boolean(window.__betterNCMStarted),safe:localStorage.getItem("betterncm.safemode")==="true"})'
  );
  if (state?.started) return;
  const payload = bootstrapPayload(Boolean(state?.safe));
  await wnd.webContents.executeJavaScript(`if (!window.__betterNCMStarted) {
    window.BETTERNCM_API_KEY=${JSON.stringify(payload.key)};
    window.BETTERNCM_API_PORT=0;
    window.BETTERNCM_API_PATH='betterncm://runtime/api';
    window.BETTERNCM_FILES_PATH='betterncm://runtime/local';
    window.__betterNCMStartupScripts=${JSON.stringify(payload.startupScripts)};
    ${payload.source}\n window.__betterNCMStarted = true; }`);
}
