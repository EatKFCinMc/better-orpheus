import { initializePlugins } from "./plugin-runtime";
import { registerBetterNCMIpc } from "./ipc";
import { registerBetterNCMProtocol } from "./protocol";

export { getInstalledPlugins, deleteInstalledPlugins } from "./plugin-runtime";
export { injectBetterNCM } from "./bootstrap";

export async function initializeBetterNCM() {
  await initializePlugins();
  registerBetterNCMIpc();
  registerBetterNCMProtocol();
}
