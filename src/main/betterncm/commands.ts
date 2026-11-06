import { spawn, execFile } from "node:child_process";
import { win32 } from "node:path";

type CommandOptions = {
  shell: {
    openExternal(url: string): Promise<void>;
    openPath(path: string): Promise<string>;
    showItemInFolder(path: string): void;
  };
  pathFor(path: string): string;
  elevate?: boolean;
  showWindow?: boolean;
  platform?: NodeJS.Platform;
};

/** Parse Windows quoting without interpreting shell operators or expanding variables. */
export function commandArguments(command: string): string[] {
  const args: string[] = [];
  let value = "",
    quoted = false,
    started = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "\\") {
      let count = 1;
      while (command[i + 1] === "\\") {
        count++;
        i++;
      }
      if (command[i + 1] === '"') {
        value += "\\".repeat(Math.floor(count / 2));
        i++;
        if (count % 2) value += '"';
        else quoted = !quoted;
      } else value += "\\".repeat(count);
      started = true;
    } else if (char === '"') {
      quoted = !quoted;
      started = true;
    } else if (/\s/.test(char) && !quoted) {
      if (started) args.push(value);
      value = "";
      started = false;
    } else {
      value += char;
      started = true;
    }
  }
  if (quoted) throw new Error("Unterminated command quote");
  if (started) args.push(value);
  return args;
}

// Start-Process joins ArgumentList into one Windows command line. Quote each
// argument using Windows escaping, then quote that string as a PowerShell literal.
function windowsArgument(value: string) {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, "$&$&") + '"';
}
const psLiteral = (value: string) => "'" + value.replaceAll("'", "''") + "'";

async function launch(args: string[], elevate: boolean, showWindow: boolean) {
  if (elevate) {
    const script =
      "$ErrorActionPreference = 'Stop'; Start-Process -Verb RunAs -FilePath " +
      psLiteral(args[0]) +
      (args.length > 1
        ? " -ArgumentList " + psLiteral(args.slice(1).map(windowsArgument).join(" "))
        : "") +
      (showWindow ? "" : " -WindowStyle Hidden");
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { windowsHide: true, timeout: 60000 },
        (error) => (error ? reject(error) : resolve())
      );
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(args[0], args.slice(1), {
        shell: false,
        detached: true,
        stdio: "ignore",
        windowsHide: !showWindow,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }
}

export async function executePluginCommand(command: string, options: CommandOptions) {
  const platform = options.platform ?? process.platform;
  const unsupported = () => new Response(`Command is unsupported on ${platform}`, { status: 501 });
  if (options.elevate && platform !== "win32") return unsupported();
  command = command.trim();
  if (!command || command.includes("\0")) return new Response("Invalid command", { status: 400 });
  try {
    if (/^https?:\/\//i.test(command)) {
      await options.shell.openExternal(new URL(command).href);
      return new Response("ok");
    }
    const args = commandArguments(command);
    if (/^(?:explorer(?:\.exe)?)$/i.test(args[0])) {
      let target = args.slice(1).join(" ");
      const select = /^\/select\s*,\s*/i.test(target);
      if (select) target = target.replace(/^\/select\s*,\s*/i, "");
      if (!target) return new Response("Unsupported Explorer arguments", { status: 400 });
      // Preserve the existing data-directory access boundary for plugin paths.
      const path = options.pathFor(target);
      if (select) options.shell.showItemInFolder(path);
      else {
        const error = await options.shell.openPath(path);
        if (error) return new Response(error, { status: 500 });
      }
      return new Response("ok");
    }
    if (platform !== "win32" || !/\.exe$/i.test(args[0])) return unsupported();
    // Script interpreters and shell built-ins are not a portable program API.
    if (/^(?:cmd|powershell|pwsh|wscript|cscript|mshta)\.exe$/i.test(win32.basename(args[0])))
      return unsupported();
    await launch(args, !!options.elevate, !!options.showWindow);
    return new Response("ok");
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 400 });
  }
}
