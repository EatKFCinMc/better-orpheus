/** Repair partial settings left by other client versions before the 2.x core reads them. */
export function repairLegacySettings(
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage
) {
  const key = "NM_SETTING_CUSTOM";
  const raw = storage.getItem(key);
  if (!raw) return;
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(raw);
  } catch {
    return;
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return;
  const defaults = {
    quantity: {
      listen: 320,
      download: 320,
      listenReg: 320,
      downloadReg: 320,
      listenAnon: 320,
      downloadAnon: 320,
      pathNameType: 0,
      fileNameType: 0,
    },
    localdir: [
      { sname: "我的音乐", name: "<mymusic>", hide: false },
      { sname: "下载", name: "<download>", hide: false },
      { sname: "Windows Media Player", name: "<windowsmedia>", hide: false },
      { sname: "iTunes", name: "<itunes>", hide: false },
    ],
    storage: { path: "", cachePath: "", capacity: 1, min: 0.5, max: 10 },
  };
  let changed = false;
  for (const [name, fallback] of Object.entries(defaults)) {
    const current = settings[name];
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) !== Array.isArray(fallback)
    ) {
      settings[name] = fallback;
      changed = true;
    } else if (!Array.isArray(fallback)) {
      const target = current as Record<string, unknown>;
      for (const [field, value] of Object.entries(fallback)) {
        if (target[field] == null) {
          target[field] = value;
          changed = true;
        }
      }
    }
  }
  if (!changed) return;
  const backup = "open-orpheus.backup.NM_SETTING_CUSTOM.before-2x-repair";
  if (storage.getItem(backup) === null) storage.setItem(backup, raw);
  storage.setItem(key, JSON.stringify(settings));
}
