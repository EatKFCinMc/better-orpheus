interface PluginManifest {
  name: string;
  slug: string;
  native_plugin?: string;
  "ncm-version-req"?: string;
  requirements?: string[];
  loadBefore?: string[];
  loadAfter?: string[];
  noDevReload?: boolean;
  injects?: Record<string, { file: string }[]>;
}

interface PluginInjection extends EventTarget {
  loadError?: unknown;
  finished?: boolean;
  __pendingLoads?: Promise<unknown>[];
  __pendingAllLoads?: Promise<unknown>[];
}

interface Plugin {
  injects: PluginInjection[];
  finished?: boolean;
}

interface LoaderOptions {
  page: {
    location: Pick<Location, "pathname">;
    loadedPlugins?: Record<string, Plugin>;
    betterNCMStartupErrors?: Record<string, string>;
    betterNCMPluginErrors?: Record<string, string>;
    betterNCMSatisfies(version: string, range: string): boolean;
    betterNCMTransformPluginSource?(source: string): string;
    betterNCMReportErrors?(): void;
  };
  loadedPlugins: Record<string, Plugin>;
  isSafeMode(): boolean;
  fs: {
    readDir(folder: string): string[];
    readFileText(path: string): string;
    watchDirectory(path: string, callback: (directory: string, file: string) => void): void;
  };
  getNCMVersion(): string;
  debounce(callback: () => void, delay: number): () => void;
  reload(): void;
  NCMPlugin: new (manifest: PluginManifest, path: string, devMode: boolean) => Plugin;
  NCMInjectPlugin: new (plugin: Plugin, path: string) => PluginInjection;
  onPluginLoaded(this: void, plugins: Record<string, Plugin>): void;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (this: Plugin, plugin: PluginInjection) => Promise<unknown>;

async function withTimeout(pending: Promise<unknown>, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pending,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadPlugins(options: LoaderOptions) {
  const { page, loadedPlugins, fs, NCMPlugin, NCMInjectPlugin, onPluginLoaded } = options;
  page.loadedPlugins = loadedPlugins;
  const errors = (page.betterNCMPluginErrors = { ...page.betterNCMStartupErrors });
  if (options.isSafeMode()) return;

  const manifests = new Map<string, { manifest: PluginManifest; path: string; devMode: boolean }>();
  for (const [folder, devMode] of [
    ["plugins_runtime", false],
    ["plugins_dev", true],
  ] as const) {
    for (const path of fs.readDir(folder)) {
      try {
        const manifest: PluginManifest = JSON.parse(fs.readFileText(path + "/manifest.json"));
        manifest.slug ||= manifest.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "-");
        manifests.set(manifest.slug, { manifest, path, devMode });
      } catch (error) {
        errors[path] = String(error);
      }
    }
  }

  for (const [slug, { manifest }] of manifests) {
    for (const target of manifest.loadBefore || []) {
      const next = manifests.get(target);
      if (next) next.manifest.loadAfter = [...(next.manifest.loadAfter || []), slug];
    }
  }

  const visiting = new Set<string>();
  const done = new Set<string>();
  async function load(slug: string): Promise<boolean> {
    if (done.has(slug)) return !!loadedPlugins[slug];
    if (visiting.has(slug)) throw new Error("Plugin dependency cycle: " + slug);
    const item = manifests.get(slug);
    if (!item) throw new Error("Missing plugin dependency: " + slug);

    const { manifest, path, devMode } = item;
    visiting.add(slug);
    try {
      if (manifest.native_plugin) throw new Error("Windows native plugin requires a Linux port");
      const range = manifest["ncm-version-req"];
      if (range && !page.betterNCMSatisfies(options.getNCMVersion(), range))
        throw new Error("Unsupported NCM version: " + range);

      for (const dependency of new Set(manifest.requirements || [])) {
        if (!(await load(dependency))) throw new Error("Dependency failed: " + dependency);
      }
      // Ordering hints are optional. A failed optional plugin does not block its dependants.
      for (const dependency of manifest.loadAfter || []) {
        if (manifests.has(dependency) && !visiting.has(dependency)) await load(dependency);
      }

      if (devMode && !manifest.noDevReload) {
        const reload = options.debounce(() => options.reload(), 1000);
        fs.watchDirectory(path, (_directory, file) => {
          if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith("manifest.json"))
            reload();
        });
      }

      const main = new NCMPlugin(manifest, path, devMode);
      loadedPlugins[slug] = main;
      const injects = [
        ...(manifest.injects?.Main || []),
        ...(manifest.injects?.[page.location.pathname] || []),
      ];
      for (const inject of injects) {
        const file = path + "/" + inject.file;
        const instance = new NCMInjectPlugin(main, file);
        const source = fs.readFileText(file);
        const script = new AsyncFunction(
          "plugin",
          page.betterNCMTransformPluginSource ? page.betterNCMTransformPluginSource(source) : source
        );
        await withTimeout(script.call(main, instance), "Plugin script startup timed out");
        instance.dispatchEvent(new CustomEvent("load", { detail: instance }));
        await withTimeout(Promise.all(instance.__pendingLoads || []), "Plugin startup timed out");
        if (instance.loadError) throw instance.loadError;
        instance.finished = true;
        main.injects.push(instance);
      }
      main.finished = true;
      return true;
    } catch (error) {
      delete loadedPlugins[slug];
      errors[slug] = String(error);
      console.error("[BetterNCM] Plugin failed", slug, error);
      return false;
    } finally {
      visiting.delete(slug);
      done.add(slug);
    }
  }

  for (const slug of manifests.keys()) {
    await load(slug);
    onPluginLoaded(loadedPlugins);
  }

  for (const [slug, main] of Object.entries(loadedPlugins)) {
    for (const instance of main.injects) {
      try {
        instance.dispatchEvent(new CustomEvent("allpluginsloaded", { detail: loadedPlugins }));
        await withTimeout(
          Promise.all(instance.__pendingAllLoads || []),
          "Plugin all-plugins startup timed out"
        );
        if (instance.loadError) throw instance.loadError;
      } catch (error) {
        errors[slug] = String(error);
      }
    }
  }

  onPluginLoaded(loadedPlugins);
  setTimeout(() => page.betterNCMReportErrors?.(), 100);
}
