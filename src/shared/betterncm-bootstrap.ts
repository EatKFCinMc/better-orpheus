export interface BetterNCMBootstrapPayload {
  source: string;
  key: string;
  startupScripts: { slug: string; source: string }[];
}

type BetterNCMPage = Window & { __betterNCMStarted?: boolean };

// Electron serializes these functions for execution in the page's main world.
// Keep their bodies independent of module-scope values.
export function readBetterNCMPageState() {
  return {
    started: Boolean((window as BetterNCMPage).__betterNCMStarted),
    safe: localStorage.getItem("betterncm.safemode") === "true",
  };
}

export function startBetterNCMInPage(payload: BetterNCMBootstrapPayload) {
  const page = window as BetterNCMPage;
  if (page.__betterNCMStarted) return;
  Object.assign(page, {
    BETTERNCM_API_KEY: payload.key,
    BETTERNCM_API_PORT: 0,
    BETTERNCM_API_PATH: "betterncm://runtime/api",
    BETTERNCM_FILES_PATH: "betterncm://runtime/local",
    __betterNCMStartupScripts: payload.startupScripts,
  });
  // Execute the bundled framework in the page realm.
  // oxlint-disable-next-line eslint/no-eval
  (0, eval)(payload.source);
  page.__betterNCMStarted = true;
}
