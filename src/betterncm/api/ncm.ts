declare const channel: {
  call: (name: string, callback: (...args: unknown[]) => void, params: unknown[]) => void;
};
type Found = [any, any, string[]];
function entries(root: any): Array<[string, any]> {
  try {
    return Object.keys(root).flatMap((key) => {
      try {
        return [[key, root[key]] as [string, any]];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
function search(
  matcher: (value: any, key: string) => boolean,
  root: any,
  path: string[],
  ancestors: any[],
  result: Found[],
  functionsOnly: boolean,
  first = false,
  lookupKey?: string,
  visited = new WeakSet<object>(),
  budget = { remaining: 50000 }
): Found[] {
  // Visit application namespaces before deep browser/DOM object graphs consume
  // the search budget. Depth-first traversal could never reach window.nm.
  const queue = [{ value: root, path }];
  for (let index = 0; index < queue.length && budget.remaining > 0; index++) {
    const { value: current, path: currentPath } = queue[index];
    if (
      current == null ||
      (typeof current !== "object" && typeof current !== "function") ||
      ancestors.includes(current) ||
      visited.has(current)
    )
      continue;
    visited.add(current);
    budget.remaining--;
    const properties = entries(current);
    if (lookupKey && !properties.some(([key]) => key === lookupKey)) {
      try {
        properties.push([lookupKey, current[lookupKey]]);
      } catch {
        /* Protected getter. */
      }
    }
    for (const [key, value] of properties) {
      if ((!functionsOnly || typeof value === "function") && matcher(value, key)) {
        result.push([value, current, [...currentPath]]);
        if (first) return result;
      }
    }
    if (currentPath.length >= 10) continue;
    for (const [key, value] of properties) {
      if (
        !value ||
        typeof value !== "object" ||
        visited.has(value) ||
        (current === globalThis.window && key === "betterncm")
      )
        continue;
      queue.push({ value, path: [...currentPath, key] });
    }
  }
  return result;
}
let playingFunction: Found | null = null;
let playingWindow: unknown;
export namespace ncm {
  export function findNativeFunction(obj: any, identifiers: string | string[]) {
    const markers = Array.isArray(identifiers) ? identifiers : [identifiers];
    return entries(obj).find(
      ([, value]) =>
        typeof value === "function" &&
        markers.every((marker) => Function.prototype.toString.call(value).includes(marker))
    )?.[0];
  }
  export function openUrl(url: string) {
    channel.call("os.navigateExternal", () => {}, [url]);
  }
  export function getNCMPackageVersion(): string {
    return String((window as any).APP_CONF?.packageVersion || "0000000");
  }
  export function getNCMFullVersion(): string {
    return String((window as any).APP_CONF?.appver || "0.0.0.0");
  }
  export function getNCMVersion(): string {
    return getNCMFullVersion().split(".").slice(0, 3).join(".");
  }
  export function getNCMBuild(): number {
    return parseInt(getNCMFullVersion().split(".")[3], 10) || 0;
  }
  export function searchApiFunction(
    finder: string | ((fn: Function) => boolean),
    root: any = window,
    currentPath = ["window"],
    prevObjects: any[] = [],
    result: Found[] = []
  ): Found[] {
    return search(
      (value, key) => (typeof finder === "string" ? key === finder : finder(value)),
      root,
      currentPath,
      prevObjects,
      result,
      true,
      false,
      typeof finder === "string" ? finder : undefined
    );
  }
  export function findApiFunction(
    finder: string | ((fn: Function) => boolean),
    root: any = window,
    currentPath = ["window"],
    prevObjects: any[] = []
  ): Found | null {
    return (
      search(
        (value, key) => (typeof finder === "string" ? key === finder : finder(value)),
        root,
        currentPath,
        prevObjects,
        [],
        true,
        true,
        typeof finder === "string" ? finder : undefined
      )[0] || null
    );
  }
  export function searchForData(
    finder: (value: any) => boolean,
    root: any = window,
    currentPath = ["window"],
    prevObjects: any[] = [],
    result: Found[] = []
  ): Found[] {
    return search((value) => finder(value), root, currentPath, prevObjects, result, false);
  }
  export function getPlayingSong() {
    if (playingWindow !== window) {
      playingWindow = window;
      playingFunction = null;
    }
    playingFunction ||= findApiFunction("getPlaying");
    return playingFunction ? playingFunction[0].call(playingFunction[1]) : null;
  }
  export function getPlaying() {
    const song = getPlayingSong();
    return song?.data
      ? { id: song.data.id, title: song.data.name, type: song.from?.fm ? "fm" : "normal" }
      : null;
  }
}
