import { satisfies } from "semver";
import requirements from "./metadata/market-requirements.json";
import publisherRequirements from "./metadata/publisher-requirements.json";

type CatalogPlugin = {
  repo?: string;
  slug: string;
  version: string;
  "ncm-version-req"?: string;
};

/** Exact package versions only: a later release must not inherit an older restriction. */
export function marketMatchesNCM(plugin: CatalogPlugin, version: string): boolean {
  const key = `${plugin.repo}:${plugin.slug}@${plugin.version}`;
  const range =
    plugin["ncm-version-req"] ||
    (requirements as Record<string, string | null>)[key] ||
    (publisherRequirements as Record<string, { range: string }>)[key]?.range;
  if (!range) return true;
  try {
    return satisfies(version, range, { loose: true });
  } catch {
    return false;
  }
}

/** Preserve the market's explicit "show incompatible versions" option. */
export function transformMarketSource(source: string): string {
  return source.replace(
    /(if \(!plugin\.betterncm_version && !is3xx\) return true;(?:\\n|\n)\s*return [^;]+ \|\| ([\w$]+\.state\.showVersionUnmatchedPlugins);)/g,
    "if (!window.betterNCMMarketMatches(plugin) && !$2) return false; $1"
  );
}
