import { satisfies } from "semver";
export interface HijackAction {
  type: "replace" | "regex" | "append" | "prepend";
  from?: string;
  to?: string;
  code?: string;
  id?: string;
}
export interface HijackPlugin {
  name: string;
  slug?: string;
  hijacks?: Record<string, Record<string, HijackAction | HijackAction[]>>;
}
let plugins: HijackPlugin[] = [];
const succeeded = new Set<string>();
export function setHijackPlugins(value: HijackPlugin[]) {
  if (JSON.stringify(plugins) === JSON.stringify(value)) return;
  plugins = value;
  succeeded.clear();
}
export function getSucceededHijacks() {
  return [...succeeded];
}
export function applyHijacks(url: string, source: string, version: string) {
  let result = source;
  for (const plugin of plugins)
    for (const [range, rules] of Object.entries(plugin.hijacks || {})) {
      try {
        if (!satisfies(version, range, { loose: true })) continue;
      } catch {
        continue;
      }
      for (const [prefix, actions] of Object.entries(rules)) {
        if (!url.startsWith(prefix)) continue;
        for (const action of Array.isArray(actions) ? actions : [actions]) {
          const before = result;
          try {
            if (action.type === "replace" && action.from)
              result = result.split(action.from).join(action.to || "");
            else if (action.type === "regex" && action.from)
              result = result.replace(new RegExp(action.from, "g"), action.to || "");
            else if (action.type === "append") result += action.code || "";
            else if (action.type === "prepend") result = (action.code || "") + result;
            if (before !== result)
              succeeded.add(
                `${plugin.slug || plugin.name}::${action.id || `${prefix}:${action.type}`}`
              );
          } catch (err) {
            console.warn("BetterNCM hijack failed", plugin.name, err);
          }
        }
      }
    }
  return result;
}
