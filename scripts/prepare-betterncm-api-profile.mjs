import { cp, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { zipSync, strToU8 } from "fflate";
const [profileArg, packArg] = process.argv.slice(2);
if (!profileArg || !packArg)
  throw Error(
    "Usage: node scripts/prepare-betterncm-api-profile.mjs /tmp/orpheus-bncm-api-NAME /path/to/package-directory"
  );
const profile = resolve(profileArg),
  pack = resolve(packArg);
if (!profile.startsWith("/tmp/orpheus-bncm-api-"))
  throw Error("A disposable /tmp/orpheus-bncm-api-* path is required");
try {
  await access(profile);
  throw Error("Profile already exists; choose a fresh directory");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await access(join(pack, "package/orpheus.ntpk"));
await mkdir(join(profile, "betterncm/plugins"), { recursive: true });
await cp(pack, join(profile, "package"), { recursive: true });
await writeFile(join(profile, "betterncm/API_AUDIT_PROFILE"), "disposable unsigned-in API test");
const manifest = {
  manifest_version: 1,
  name: "APIContract",
  slug: "APIContract",
  version: "1.0.0",
  injects: { Main: [{ file: "main.js" }] },
  hijacks: {
    ">=2.10.0": {
      "orpheus://orpheus/pub/core.": {
        type: "prepend",
        code: "window.__apiContractStartupAtCore=Boolean(window.__apiContractStartup);\n",
        id: "core-startup",
      },
    },
  },
};
const startup =
  'window.__apiContractStartup={readyState:document.readyState,coreExists:typeof window.NEJ!=="undefined",hReady:typeof h==="function"};';
const main = `plugin.onLoad(function(){window.__apiContractLoaded=true;this.setConfig("loaded",true);localStorage.setItem("api.contract.loads",String(Number(localStorage.getItem("api.contract.loads")||0)+1));});
plugin.onAllPluginsLoaded(async function(){await betterncm.utils.delay(1);window.__apiContractAll=true;});
plugin.onConfig(tools=>{const view=dom("div",{textContent:"API contract settings"});view.append(tools.makeBtn("contract button",()=>{}),tools.makeInput("contract input"));return view;});`;
await writeFile(
  join(profile, "betterncm/plugins/APIContract.plugin"),
  zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "startup_script.js": strToU8(startup),
    "main.js": strToU8(main),
  })
);
console.log(profile);
