export function createBetterNCMBridge(
  call: (name: string, ...args: unknown[]) => any,
  readAsync: (path: string) => Promise<string>
) {
  const watchers = new Map<number, ReturnType<typeof setInterval>>();
  let nextWatcher = 1;
  const unwatchDirectory = (id: number) => {
    const timer = watchers.get(id);
    if (timer !== undefined) clearInterval(timer);
    watchers.delete(id);
  };
  const dispose = () => {
    for (const id of watchers.keys()) unwatchDirectory(id);
  };
  const bridge = {
    fs: {
      ...Object.fromEntries(
        [
          "readDirWithDetails",
          "getProperties",
          "getDisks",
          "getLibraries",
          "unzip",
          "readDir",
          "readFileText",
          "writeFileText",
          "mkdir",
          "remove",
          "rename",
          "exists",
        ].map((name) => [name, (...args: unknown[]) => call(`fs.${name}`, ...args)])
      ),
      readFileTextAsync(path: string, callback: (text: string) => void) {
        if (typeof callback !== "function")
          throw new TypeError("readFileTextAsync requires a callback");
        void readAsync(path).then(callback, (error) => {
          console.warn("BetterNCM asynchronous read failed", error);
          callback("");
        });
      },
      watchDirectory(path: string, callback: (directory: string, filename: string) => void) {
        if (typeof callback !== "function")
          throw new TypeError("watchDirectory requires a callback");
        let previous = call("fs.watchSnapshot", path) as Record<string, string>;
        const id = nextWatcher++;
        const timer = setInterval(() => {
          try {
            const current = call("fs.watchSnapshot", path) as Record<string, string>;
            const changed = [
              ...new Set([...Object.keys(previous), ...Object.keys(current)]),
            ].filter((name) => previous[name] !== current[name]);
            previous = current;
            for (const name of changed) callback(path, name);
          } catch (error) {
            unwatchDirectory(id);
            console.warn("BetterNCM directory watch stopped", error);
          }
        }, 500);
        watchers.set(id, timer);
        return id;
      },
      unwatchDirectory,
    },
    app: Object.fromEntries(
      [
        "version",
        "datapath",
        "ncmpath",
        "reloadIgnoreCache",
        "restart",
        "auto_update",
        "crash",
      ].map((name) => [name, (...args: unknown[]) => call(`app.${name}`, ...args)])
    ),
    native_plugin: {
      getRegisteredAPIs: () => call("native_plugin.getRegisteredAPIs"),
      call: (...args: unknown[]) => call("native_plugin.call", ...args),
    },
    test: {
      add: (a: number, b: number) => call("test.add", a, b),
      m: {
        i: {
          c: {
            r: {
              o: {
                b: {
                  l: {
                    o: {
                      c: { k: (a: number, b: number) => call("test.m.i.c.r.o.b.l.o.c.k", a, b) },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return { bridge, dispose };
}
