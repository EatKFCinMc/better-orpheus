import { contextBridge, ipcRenderer } from "electron";
import { startBetterNCMInPage, type BetterNCMBootstrapPayload } from "@shared/betterncm-bootstrap";
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
    ]) as
      | { value: BetterNCMBootstrapPayload; error?: never }
      | { error: string; value?: never }
      | undefined;
    if (!result || result.error) throw new Error(result?.error || "BetterNCM host unavailable");
    contextBridge.executeInMainWorld({
      func: startBetterNCMInPage,
      args: [result.value],
    });
  } catch (error) {
    LOGGER.error({ err: error }, "BetterNCM early bootstrap failed");
  }
}
