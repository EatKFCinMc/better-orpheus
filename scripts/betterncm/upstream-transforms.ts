/** Apply reviewed compatibility changes without modifying the pinned upstream. */
function replaceRequired(
  source: string,
  pattern: string | RegExp,
  replacement: string | (() => string),
  label: string
) {
  const updated = source.replace(
    pattern,
    typeof replacement === "string" ? () => replacement : replacement
  );
  if (updated === source) throw new Error(`BetterNCM upstream changed: cannot apply ${label}`);
  return updated;
}
export function transformLoader(source: string, loader: string): string {
  source = replaceRequired(
    source,
    /export async function enableSafeMode\(\) \{\s*return;/,
    "export async function enableSafeMode() {",
    "enable safe mode"
  );
  source = replaceRequired(
    source,
    'window.addEventListener("DOMContentLoaded",',
    'window.addEventListener("betterncm-ready",',
    "startup lifecycle"
  );
  return replaceRequired(
    source,
    /async function loadPlugins\(\) \{[\s\S]*?(?=async function onLoadError)/,
    () => loader + "\n",
    "isolated plugin loader"
  );
}
export function transformPlugin(source: string): string {
  source = replaceRequired(
    source,
    "fn.call(this, evt.detail, evt);",
    "((this as any).__pendingLoads ||= []).push(Promise.resolve(fn.call(this, evt.detail, evt)));",
    "async plugin lifecycle"
  );
  source = replaceRequired(
    source,
    "fn.call(this, evt.detail, evt);",
    `try {
    const pending = Promise.resolve(fn.call(this, evt.detail, evt));
    ((this as any).__pendingAllLoads ||= []).push(pending);
    pending.catch(error => { this.loadError = error; });
  } catch (error) { this.loadError = error; }`,
    "async all-plugins lifecycle"
  );
  source = replaceRequired(
    source,
    /let config = JSON.parse\([\s\S]*?\);/,
    `let config = Object.create(null);
    try {
      const parsed = JSON.parse(localStorage.getItem(\`config.betterncm.\${this.manifest.slug}\`) || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(config, parsed);
    } catch { }`,
    "recover malformed plugin config"
  );
  source = replaceRequired(
    source,
    "this.configViewElement = fn.call(this, evt.detail);",
    `try { this.configViewElement = fn.call(this, evt.detail); (this as any).configError = null; }
    catch (error) { (this as any).configError = error; }`,
    "isolate config lifecycle"
  );
  source = replaceRequired(
    source,
    "return this.configViewElement;",
    "if ((this as any).configError) throw (this as any).configError; return this.configViewElement;",
    "report config lifecycle errors"
  );
  return replaceRequired(
    source,
    "if (config[key] !== undefined)",
    "if (config && Object.hasOwn(config, key) && config[key] !== undefined)",
    "own plugin config values"
  );
}

export function transformPluginManager(source: string): string {
  return replaceRequired(
    source,
    "for (const ele of e.path)",
    "for (const ele of e.composedPath())",
    "modern DOM event path"
  );
}

export function transformBrowserApi(source: string, filename: string): string {
  if (filename === "app.ts") {
    source = replaceRequired(source, /return p\.replace\([^\n]+/, "return p;", "Linux data path");
    source = replaceRequired(
      source,
      "defaultValue: string)",
      'defaultValue = "")',
      "config default argument"
    );
  }
  if (filename === "app.ts" || filename === "fs.ts") {
    // A failed read must not be mistaken for the requested file or screenshot.
    source = source.replace(
      /(\s*)(return await r\.(?:text|json|blob)\(\);|const p = await r.text\(\);)/g,
      "$1if (!r.ok) throw new Error(`BetterNCM request failed (${r.status}): ${await r.text()}`);$1$2"
    );
  }
  if (filename === "tests.ts") {
    source = replaceRequired(
      source,
      '"/__TEST_FAILED__.txt"',
      '"__TEST_FAILED__.txt"',
      "test result path"
    );
    source = replaceRequired(
      source,
      '"/__TEST_SUCCEEDED__.txt"',
      '"__TEST_SUCCEEDED__.txt"',
      "test result path"
    );
  }
  return source;
}
