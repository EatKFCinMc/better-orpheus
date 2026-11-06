// Run only against an explicitly marked, disposable profile in /tmp.
import { chromium } from "playwright";
import { zipSync, strToU8 } from "fflate";
import { writeFile } from "node:fs/promises";
const port = process.env.BETTERNCM_TEST_PORT || "9366";
let browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
let page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().startsWith("orpheus://orpheus/pub/app.html"));
if (!page) throw Error("No main window");
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.waitForFunction(
    () => window.betterncm?.app?.getBetterNCMVersion && window.loadedPlugins?.APIContract,
    { timeout: 20000 }
  );
  const root = await page.evaluate(() => betterncm_native.app.datapath());
  if (
    !root.startsWith("/tmp/orpheus-bncm-api-") ||
    !(await page.evaluate(() => betterncm_native.fs.exists("API_AUDIT_PROFILE")))
  )
    throw Error("Refusing to run against a real user profile");
  const zip = Array.from(zipSync({ "nested/file.txt": strToU8("ZIP ✓") }));
  const results = await page.evaluate(
    async ({ zip }) => {
      const output = [];
      const assert = (condition, message = "assertion failed") => {
        if (!condition) throw Error(message);
      };
      const test = async (name, fn) => {
        try {
          await fn();
          output.push({ name, status: "passed" });
        } catch (error) {
          output.push({ name, status: "failed", error: String(error) });
        }
      };
      const native = betterncm_native,
        api = betterncm;
      const root = native.app.datapath(),
        base = "api-contract",
        folder = base + "/路径 #?&%",
        file = folder + "/内容 #?.txt";
      await test("betterncmFetch", async () => {
        const response = await api.betterncmFetch("/app/version", {
          headers: new Headers({ "X-Contract": "ok" }),
        });
        assert(response.ok && (await response.text()) === "1.3.4");
      });
      await test("startup_script", () =>
        assert(
          window.__apiContractStartup?.readyState === "loading" &&
            !window.__apiContractStartup.coreExists &&
            window.__apiContractStartupAtCore &&
            window.__apiContractStartup.hReady,
          "startup script did not run before core"
        ));
      await test("app.getBetterNCMVersion", async () =>
        assert((await api.app.getBetterNCMVersion()) === "1.3.4"));
      await test("app.getDataPath", async () => assert((await api.app.getDataPath()) === root));
      await test("app.getNCMPath", async () =>
        assert((await api.app.getNCMPath()) === native.app.ncmpath()));
      await test("app.getNCMWinPos", async () => {
        const p = await api.app.getNCMWinPos();
        assert(Number.isFinite(p.x) && Number.isFinite(p.y));
      });
      await test("app.isLightTheme", async () =>
        assert(typeof (await api.app.isLightTheme()) === "boolean"));
      await test("app.writeConfig", async () =>
        assert(await api.app.writeConfig("api.contract", "汉字 & ? #\n✓")));
      await test("app.readConfig", async () => {
        assert((await api.app.readConfig("api.contract")) === "汉字 & ? #\n✓");
        assert((await api.app.readConfig("api.absent", "fallback")) === "fallback");
        assert((await api.app.readConfig("api.absent")) === "");
      });
      await test("app.showConsole", async () => assert(await api.app.showConsole(false)));
      await test("app.setRoundedCorner", async () => assert(await api.app.setRoundedCorner(false)));
      await test("app.exec", async () =>
        assert((await api.app.exec("cmd /c unsupported")) === false));
      await test("app.exec.elevated", async () =>
        assert((await api.app.exec("unsupported", true)) === false));
      await test("app.takeBackgroundScreenshot", async () => {
        let rejected = false;
        try {
          await api.app.takeBackgroundScreenshot();
        } catch (error) {
          rejected = String(error).includes("501");
        }
        assert(rejected, "unsupported screenshot returned fake image data");
      });
      await test("app.getSucceededHijacks", async () =>
        assert((await api.app.getSucceededHijacks()).includes("APIContract::core-startup")));
      await test("fs.mkdir", async () => assert(await api.fs.mkdir(folder)));
      await test("fs.writeFileText", async () =>
        assert(await api.fs.writeFileText(file, "UTF-8 ✓\n你好")));
      await test("fs.readFileText", async () => {
        assert((await api.fs.readFileText(file)) === "UTF-8 ✓\n你好");
        let rejected = false;
        try {
          await api.fs.readFileText(base + "/missing");
        } catch {
          rejected = true;
        }
        assert(rejected);
      });
      await test("fs.exists", async () => {
        assert((await api.fs.exists(file)) === true);
        assert((await api.fs.exists(base + "/missing")) === false);
      });
      await test("fs.readDir", async () =>
        assert((await api.fs.readDir(folder)).includes(root + "/" + file)));
      await test("fs.writeFile", async () => {
        assert(
          await api.fs.writeFile(base + "/binary", new Blob([new Uint8Array([0, 255, 17, 128])]))
        );
        assert(await api.fs.writeFile(base + "/form-text", "文字"));
        assert((await api.fs.readFileText(base + "/form-text")) === "文字");
      });
      await test("fs.readFile", async () =>
        assert(
          JSON.stringify([
            ...new Uint8Array(await (await api.fs.readFile(base + "/binary")).arrayBuffer()),
          ]) === "[0,255,17,128]"
        ));
      await test("fs.mountDir", async () => {
        const url = await api.fs.mountDir(folder);
        assert(url.includes("%23") && url.includes("%3F"));
        assert(
          (await (await fetch(url + "/" + encodeURIComponent("内容 #?.txt"))).text()) ===
            "UTF-8 ✓\n你好"
        );
      });
      await test("fs.mountFile", async () => {
        const url = await api.fs.mountFile(file);
        assert((await (await fetch(url)).text()) === "UTF-8 ✓\n你好");
      });
      await test("fs.unzip", async () => {
        await api.fs.writeFile(base + "/fixture.zip", new Blob([new Uint8Array(zip)]));
        assert(await api.fs.unzip(base + "/fixture.zip", base + "/unzipped"));
        assert((await api.fs.readFileText(base + "/unzipped/nested/file.txt")) === "ZIP ✓");
      });
      await test("fs.legacy-root-path", async () => {
        assert(await api.fs.mkdir("/APIContractVirtual"));
        assert(await api.fs.writeFileText("/APIContractVirtual/file", "virtual"));
        assert((await api.fs.readFileText("APIContractVirtual/file")) === "virtual");
        await api.fs.remove("/APIContractVirtual");
      });
      await test("native.fs.mkdir", () => assert(native.fs.mkdir(base + "/native")));
      await test("native.fs.writeFileText", () =>
        assert(native.fs.writeFileText(base + "/native/a", "native ✓")));
      await test("native.fs.readFileText", () =>
        assert(native.fs.readFileText(base + "/native/a") === "native ✓"));
      await test("native.fs.readFileTextAsync", () =>
        new Promise((resolve, reject) => {
          let inline = true;
          native.fs.readFileTextAsync(base + "/native/a", (value) => {
            try {
              assert(!inline && value === "native ✓");
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          inline = false;
        }));
      await test("native.fs.exists", () =>
        assert(
          native.fs.exists(base + "/native/a") === true &&
            native.fs.exists(base + "/missing") === false
        ));
      await test("native.fs.readDir", () =>
        assert(native.fs.readDir(base + "/native").includes(root + "/" + base + "/native/a")));
      await test("native.fs.getProperties", () => {
        const p = native.fs.getProperties(base + "/native/a");
        assert(
          p.type === "file" && p.name === "a" && p.size > 0 && Number.isFinite(p.lastModified)
        );
      });
      await test("native.fs.readDirWithDetails", () =>
        assert(
          native.fs.readDirWithDetails(base + "/native")[0].path === root + "/" + base + "/native/a"
        ));
      await test("native.fs.getDisks", () =>
        assert(native.fs.getDisks().every((d) => d.size >= d.used && typeof d.disk === "string")));
      await test("native.fs.getLibraries", () => assert(native.fs.getLibraries().length === 6));
      await test("native.fs.rename", () =>
        assert(native.fs.rename(base + "/native/a", base + "/native/b")));
      await test("native.fs.unzip", () =>
        assert(native.fs.unzip(base + "/fixture.zip", base + "/native/zip") === 0));
      await test("native.fs.watchDirectory", async () => {
        const changed = [];
        native.fs.mkdir(base + "/watch/nested");
        const id = native.fs.watchDirectory(base + "/watch", (dir, name) =>
          changed.push([dir, name])
        );
        native.fs.writeFileText(base + "/watch/nested/file", "one");
        await api.utils.delay(700);
        assert(changed.some((x) => x[1] === "nested/file"));
        changed.length = 0;
        native.fs.writeFileText(base + "/watch/nested/file", "two changes");
        await api.utils.delay(700);
        assert(changed.some((x) => x[1] === "nested/file"));
        changed.length = 0;
        native.fs.remove(base + "/watch/nested/file");
        await api.utils.delay(700);
        assert(changed.some((x) => x[1] === "nested/file"));
        native.fs.unwatchDirectory(id);
      });
      await test("native.fs.remove", () => assert(native.fs.remove(base + "/watch")));
      await test("native.app.version", () => assert(native.app.version() === "1.3.4"));
      await test("native.app.datapath", () => assert(native.app.datapath() === root));
      await test("native.app.ncmpath", () => assert(typeof native.app.ncmpath() === "string"));
      for (const method of ["auto_update", "crash"])
        await test("native.app." + method, () => {
          let rejected = false;
          try {
            native.app[method]("unused");
          } catch {
            rejected = true;
          }
          assert(rejected);
        });
      await test("native.native_plugin.getRegisteredAPIs", () =>
        assert(native.native_plugin.getRegisteredAPIs().length === 0));
      await test("native.native_plugin.call", () => {
        let rejected = false;
        try {
          native.native_plugin.call("WindowsDLL", []);
        } catch {
          rejected = true;
        }
        assert(rejected);
      });
      await test("native.test.add", () => assert(native.test.add(2, 3.5) === 5.5));
      await test("native.test.m.i.c.r.o.b.l.o.c.k", () =>
        assert(native.test.m.i.c.r.o.b.l.o.c.k(2, 3.5) === "🍊🍊🍊5.500000"));
      await test("utils.dom", () => {
        const settings = {
          class: ["fixture"],
          style: { "--fixture": "yes", opacity: 0 },
          checked: false,
          value: 0,
        };
        const element = api.utils.dom("input", settings);
        assert(
          element.value === "0" &&
            !element.checked &&
            element.classList.contains("fixture") &&
            element.style.getPropertyValue("--fixture") === "yes"
        );
        assert(settings.class[0] === "fixture" && settings.style.opacity === 0);
      });
      await test("utils.debounce", async () => {
        let result;
        const receiver = {
          id: 7,
          fn: api.utils.debounce(function (...args) {
            result = [this.id, ...args];
          }, 10),
        };
        receiver.fn("old", 1);
        receiver.fn("last", 2);
        await api.utils.delay(40);
        assert(JSON.stringify(result) === '[7,"last",2]');
      });
      await test("utils.waitForFunction", async () =>
        assert((await api.utils.waitForFunction(() => 42, 10)) === 42));
      await test("utils.waitForElement", async () => {
        const div = document.createElement("div");
        div.id = "api-contract-element";
        document.body.append(div);
        assert((await api.utils.waitForElement("#api-contract-element", 10)) === div);
        div.remove();
      });
      await test("utils.delay", async () => {
        await api.utils.delay(1);
      });
      const fixture = {
        nested: {
          value: 42,
          marker() {
            return "unique contract marker";
          },
        },
      };
      fixture.cycle = fixture;
      await test("ncm.findNativeFunction", () =>
        assert(api.ncm.findNativeFunction(fixture.nested, ["unique contract"]) === "marker"));
      await test("ncm.searchApiFunction", () =>
        assert(api.ncm.searchApiFunction("marker", fixture).length === 1));
      await test("ncm.findApiFunction", () =>
        assert(api.ncm.findApiFunction("marker", fixture)[0] === fixture.nested.marker));
      await test("ncm.searchForData", () =>
        assert(api.ncm.searchForData((value) => value === 42, fixture)[0][0] === 42));
      await test("ncm.getNCMFullVersion", () =>
        assert(api.ncm.getNCMFullVersion() === APP_CONF.appver));
      await test("ncm.getNCMVersion", () => assert(api.ncm.getNCMVersion() === "2.10.13"));
      await test("ncm.getNCMBuild", () => assert(api.ncm.getNCMBuild() === 202675));
      await test("ncm.getNCMPackageVersion", () =>
        assert(api.ncm.getNCMPackageVersion() === APP_CONF.packageVersion));
      await test("ncm.getPlayingSong", () => api.ncm.getPlayingSong());
      await test("ncm.getPlaying", () => api.ncm.getPlaying());
      await test("tests.success", async () => {
        await api.tests.success("contract success");
        assert((await api.fs.readFileText("__TEST_SUCCEEDED__.txt")) === "contract success");
      });
      await test("tests.fail", async () => {
        await api.tests.fail("contract expected failure marker");
        assert(
          (await api.fs.readFileText("__TEST_FAILED__.txt")) === "contract expected failure marker"
        );
      });
      await test("globals.ReactDOM.h.f.dom", () =>
        assert(
          h === React.createElement &&
            f === React.Fragment &&
            typeof ReactDOM.render === "function" &&
            dom === api.utils.dom
        ));
      await test("plugin.lifecycle", () => {
        assert(window.__apiContractLoaded && window.__apiContractAll);
        const plugin = loadedPlugins.APIContract.injects[0];
        assert(plugin.getConfig("loaded") === true);
        const view = plugin._getConfigElement();
        assert(
          view.textContent.includes("API contract settings") &&
            view.querySelector("input").value === "contract input"
        );
      });
      await test("app.reloadPlugins", async () => assert(await api.app.reloadPlugins()));
      await test("fs.remove", async () => assert(await api.fs.remove(base)));
      return output;
    },
    { zip }
  );
  for (const mode of ["native", "javascript"]) {
    const before = await page.evaluate(() =>
      Number(localStorage.getItem("api.contract.loads") || 0)
    );
    const ready = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(
      (mode) =>
        setTimeout(
          () => (mode === "native" ? betterncm_native.app.reloadIgnoreCache() : betterncm.reload()),
          50
        ),
      mode
    );
    await ready;
    await page.waitForFunction(
      (before) =>
        Number(localStorage.getItem("api.contract.loads") || 0) > before && window.__apiContractAll,
      before,
      { timeout: 20000 }
    );
    results.push({
      name: mode === "native" ? "native.app.reloadIgnoreCache" : "reload",
      status: "passed",
    });
  }
  try {
    const ready = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(() => {
      betterncm_native.fs.mkdir("plugins_dev/APIDevContract");
      betterncm_native.fs.writeFileText(
        "plugins_dev/APIDevContract/manifest.json",
        JSON.stringify({
          name: "APIDevContract",
          slug: "APIDevContract",
          version: "1.0.0",
          injects: { Main: [{ file: "main.js" }] },
        })
      );
      betterncm_native.fs.writeFileText(
        "plugins_dev/APIDevContract/main.js",
        "window.__apiDevVersion=1;"
      );
      setTimeout(() => betterncm_native.app.reloadIgnoreCache(), 50);
    });
    await ready;
    await page.waitForFunction(
      () => window.__apiDevVersion === 1 && loadedPlugins.APIDevContract?.devMode,
      null,
      { timeout: 20000 }
    );
    let reloaded = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(() =>
      betterncm_native.fs.writeFileText(
        "plugins_dev/APIDevContract/main.js",
        "window.__apiDevVersion=2;"
      )
    );
    await reloaded;
    await page.waitForFunction(() => window.__apiDevVersion === 2, null, { timeout: 20000 });
    reloaded = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(() => {
      const file = "plugins_dev/APIDevContract/manifest.json";
      const manifest = JSON.parse(betterncm_native.fs.readFileText(file));
      manifest.noDevReload = true;
      betterncm_native.fs.writeFileText(file, JSON.stringify(manifest));
    });
    await reloaded;
    await page.waitForFunction(() => window.__apiDevVersion === 2, null, { timeout: 20000 });
    await page.evaluate(() =>
      betterncm_native.fs.writeFileText(
        "plugins_dev/APIDevContract/main.js",
        "window.__apiDevVersion=3;"
      )
    );
    await page.waitForTimeout(2000);
    if (!(await page.evaluate(() => window.__apiDevVersion === 2)))
      throw Error("noDevReload was ignored");
    reloaded = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(() => {
      betterncm_native.fs.remove("plugins_dev/APIDevContract");
      setTimeout(() => betterncm_native.app.reloadIgnoreCache(), 50);
    });
    await reloaded;
    await page.waitForFunction(() => window.__apiContractAll, null, { timeout: 20000 });
    results.push({ name: "developer reload lifecycle", status: "passed" });
  } catch (error) {
    results.push({ name: "developer reload lifecycle", status: "failed", error: String(error) });
  }
  try {
    let ready = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(async () => {
      await betterncm.app.writeConfig(
        "cc.microblock.betterncm.cpp_side_inject_feature_disabled",
        "true"
      );
      localStorage.setItem("betterncm.safemode", "true");
      setTimeout(() => betterncm_native.app.reloadIgnoreCache(), 50);
    });
    await ready;
    await page.waitForFunction(
      () =>
        window.__betterNCMStarted &&
        localStorage.getItem("betterncm.safemode") === "true" &&
        window.loadedPlugins &&
        Object.keys(loadedPlugins).length === 0,
      null,
      { timeout: 20000 }
    );
    const safe = await page.evaluate(
      () => !window.__apiContractStartup && !window.__apiContractStartupAtCore
    );
    if (!safe) throw Error("safe mode executed startup code or resource hijacks");
    const before = await page.evaluate(() =>
      Number(localStorage.getItem("api.contract.loads") || 0)
    );
    ready = page.waitForEvent("domcontentloaded", { timeout: 20000 });
    await page.evaluate(async () => {
      await betterncm.app.writeConfig(
        "cc.microblock.betterncm.cpp_side_inject_feature_disabled",
        "false"
      );
      localStorage.removeItem("betterncm.safemode");
      setTimeout(() => betterncm_native.app.reloadIgnoreCache(), 50);
    });
    await ready;
    await page.waitForFunction(
      (before) =>
        Number(localStorage.getItem("api.contract.loads") || 0) > before && window.__apiContractAll,
      before,
      { timeout: 20000 }
    );
    results.push({ name: "safe-mode lifecycle", status: "passed" });
  } catch (error) {
    results.push({ name: "safe-mode lifecycle", status: "failed", error: String(error) });
  }
  try {
    const before = await page.evaluate(() =>
      Number(localStorage.getItem("api.contract.loads") || 0)
    );
    const disconnected = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Restart did not disconnect the old process")),
        20000
      );
      browser.once("disconnected", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await page.evaluate(() => setTimeout(() => betterncm_native.app.restart(), 50));
    await disconnected;
    let next;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        next = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (!next) throw Error("Restart did not reopen the debugging endpoint");
    browser = next;
    for (let attempt = 0; attempt < 100; attempt++) {
      page = browser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith("orpheus://orpheus/pub/app.html"));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await page.waitForFunction(
      (before) =>
        Number(localStorage.getItem("api.contract.loads") || 0) > before && window.__apiContractAll,
      before,
      { timeout: 20000 }
    );
    results.push({ name: "native.app.restart", status: "passed" });
  } catch (error) {
    results.push({ name: "native.app.restart", status: "failed", error: String(error) });
  }
  const report = {
    results,
    errors,
    passed: results.filter((x) => x.status === "passed").length,
    failed: results.filter((x) => x.status === "failed").length,
    unitOnly: ["app.openFileDialog", "ncm.openUrl"],
    limitations: [
      "Windows DLL APIs unavailable",
      "Elevated/arbitrary Windows commands rejected",
      "Background-only screen capture unavailable",
      "Native debug crash and BetterNCM DLL auto-update disabled",
    ],
  };
  await writeFile(
    process.env.BETTERNCM_TEST_OUTPUT || "/tmp/orpheus-bncm-api-results.json",
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
} finally {
  await browser.close();
}
