import { marketMatchesNCM, transformMarketSource } from "./market-compatibility";
import { satisfies } from "semver";
import React from "react";
import * as ReactDOM from "react-dom";
Object.assign(window, {
  React,
  ReactDOM,
  h: React.createElement,
  f: React.Fragment,
  betterncm: {},
  loadedPlugins: {},
  betterNCMSatisfies: satisfies,
  betterNCMMarketMatches: (plugin: Parameters<typeof marketMatchesNCM>[0]) =>
    marketMatchesNCM(plugin, (window as any).betterncm.ncm.getNCMVersion()),
  betterNCMTransformPluginSource: transformMarketSource,
});
// The bundled 2024 market's default GitCode mirror now returns 403.
// Fall back only for that mirror, retaining upstream package paths and metadata.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const prefix = "https://raw.gitcode.com/intensity/bncm-plugin-packed/raw/master/";
  let response: Response;
  if (!url.startsWith(prefix)) response = await originalFetch(input, init);
  else {
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
    }
    if (!response! || !response.ok)
      response = await originalFetch(
        "https://raw.githubusercontent.com/BetterNCM/BetterNCM-Packed-Plugins/master/" +
          url.slice(prefix.length),
        init
      );
  }
  return response!;
};
// Keep API initialization synchronous: startup scripts run before the page core.
// esbuild bundles this local require; it does not require Node in the renderer.
require("../../chromatic/src/js-framework/src/index");
(window as any).betterNCMStartupErrors = {};
for (const script of (window as any).__betterNCMStartupScripts || []) {
  try {
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function(
      script.source + "\n//# sourceURL=betterncm-startup://" + encodeURIComponent(script.slug)
    )();
  } catch (error) {
    (window as any).betterNCMStartupErrors[script.slug] = String(error);
    console.error("[BetterNCM] Startup script failed", script.slug, error);
  }
}
if (document.readyState === "loading")
  window.addEventListener(
    "DOMContentLoaded",
    () => window.dispatchEvent(new Event("betterncm-ready")),
    { once: true }
  );
else window.dispatchEvent(new Event("betterncm-ready"));

Object.assign(window, {
  betterNCMReportErrors: () => {
    const manager = document.querySelector(".better-ncm-manager");
    if (!manager) return;
    document.getElementById("betterncm-compatibility-errors")?.remove();
    const errors = Object.entries((window as any).betterNCMPluginErrors || {});
    if (!errors.length) return;
    const details = document.createElement("details");
    details.id = "betterncm-compatibility-errors";
    details.style.cssText =
      "padding:12px;margin:12px;border:1px solid currentColor;border-radius:6px";
    const summary = document.createElement("summary");
    summary.textContent = `${errors.length} 个插件未能完整加载`;
    details.append(summary);
    for (const [name, error] of errors) {
      const line = document.createElement("p");
      line.textContent = `${name}: ${String(error)}`;
      details.append(line);
    }
    manager.prepend(details);
  },
});
document.addEventListener("click", (event) => {
  if ((event.target as Element)?.closest?.('[title="BetterNCM"]')) {
    setTimeout(() => (window as any).betterNCMReportErrors?.(), 0);
  }
});
