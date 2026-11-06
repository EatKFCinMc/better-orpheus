import { contextBridge, ipcRenderer } from "electron";
import { channel } from "./util";
import { createBetterNCMBridge } from "./betterncm-bridge";
if (channel === "main") {
  const call = (name: string, ...args: unknown[]) => {
    const result = ipcRenderer.sendSync("betterncm.native", name, args);
    if (!result) throw new Error(`BetterNCM host unavailable: ${name}`);
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  const { bridge, dispose } = createBetterNCMBridge(call, (path) =>
    ipcRenderer.invoke("betterncm.nativeAsync", "fs.readFileText", [path])
  );
  contextBridge.exposeInMainWorld("betterncm_native", bridge);
  window.addEventListener("unload", dispose, { once: true });
}

export function bootstrapBetterNCM() {
  if (channel !== "main") return;
  try {
    const result = ipcRenderer.sendSync("betterncm.native", "internal.bootstrap", [
      String(localStorage.getItem("betterncm.safemode") === "true"),
    ]);
    if (!result || result.error) throw new Error(result?.error || "BetterNCM host unavailable");
    contextBridge.executeInMainWorld({
      func: (payload: { source: string; key: string; startupScripts: unknown[] }) => {
        if ((window as any).__betterNCMStarted) return;
        Object.assign(window, {
          BETTERNCM_API_KEY: payload.key,
          BETTERNCM_API_PORT: 0,
          BETTERNCM_API_PATH: "betterncm://runtime/api",
          BETTERNCM_FILES_PATH: "betterncm://runtime/local",
          __betterNCMStartupScripts: payload.startupScripts,
        });
        // Execute the bundled framework in the page realm before its own scripts.
        // oxlint-disable-next-line eslint/no-eval
        (0, eval)(payload.source);
        (window as any).__betterNCMStarted = true;
      },
      args: [result.value],
    });
  } catch (error) {
    LOGGER.error({ err: error }, "BetterNCM early bootstrap failed");
  }
}
