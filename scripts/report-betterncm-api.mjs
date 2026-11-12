import { readFile, writeFile } from "node:fs/promises";
const resultPath = process.argv[2];
if (!resultPath) throw Error("Pass the runtime-results JSON path");
const report = JSON.parse(await readFile(resultPath, "utf8"));
const checks = new Map(report.results.map((row) => [row.name, row]));
const unit = new Set(report.unitOnly);
const unsupported = new Set([
  "app.takeBackgroundScreenshot",
  "native.app.auto_update",
  "native.app.crash",
  "native.native_plugin.call",
]);
function row(name) {
  if (!checks.has(name) && !unit.has(name)) throw Error("Missing API validation: " + name);
  const result = checks.get(name);
  return {
    name,
    verification: result ? result.status : "unit-tested",
    capability: unsupported.has(name)
      ? "explicitly unsupported"
      : name === "app.setRoundedCorner"
        ? "Linux compatibility no-op"
        : name === "app.exec"
          ? "HTTP(S) URLs and plugin-directory explorer action only"
          : "supported within plugin file permissions",
    ...(result?.error ? { error: result.error } : {}),
  };
}
const sdk = [];
for (const namespace of ["app", "fs", "ncm", "utils", "tests"]) {
  const source = await readFile(
    `chromatic/src/js-framework/src/betterncm-api/${namespace}.ts`,
    "utf8"
  );
  for (const name of new Set(
    [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((match) => match[1])
  ))
    sdk.push(row(namespace + "." + name));
}
sdk.push(row("reload"), row("betterncmFetch"));
const cpp = await readFile("chromatic/src/v8NativeCalls.cpp", "utf8");
const native = [];
for (const name of new Set(
  [...cpp.matchAll(/DEFINE_API\(\s*([\w.]+)\s*,/g)]
    .map((match) => match[1])
    .filter((name) => name.includes("."))
))
  native.push(row("native." + name));
const server = await readFile("chromatic/src/App.cpp", "utf8");
const protocol = [
  ...new Set([...server.matchAll(/svr->(?:Get|Post)\("([^"]+)"/g)].map((match) => match[1])),
].map((name) => ({
  name,
  verification: "unit-tested",
  test: "__test__/main/betterncm-api.spec.ts; endpoint coverage guard",
}));
const matrix = {
  scope:
    "chromatic v2 declared SDK/native/protocol contracts; Better Orpheus on Linux, NetEase Cloud Music 2.10.13",
  sdk,
  native,
  protocol,
  runtime: { passed: report.passed, failed: report.failed, pageErrors: report.errors },
  unitOnly: report.unitOnly,
  limitations: report.limitations,
};
await writeFile("docs/reports/betterncm-api-matrix.json", JSON.stringify(matrix, null, 2) + "\n");
console.log(
  `SDK ${sdk.length}; native ${native.length}; protocol ${protocol.length}; runtime ${report.passed} passed / ${report.failed} failed`
);
if (report.failed) process.exitCode = 1;
