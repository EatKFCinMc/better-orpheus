import { expect, it, vi } from "vitest";
import { disableClientUpdateChecks } from "../../src/main/packs/client-update";

it("stops both automatic and manual checks inside the imported updater", () => {
  const source =
    'const cname="_p._$$Updater";t.bU=function(url,manual,auto){"store"===APP_CONF.channel||"cybercafe"===APP_CONF.channel||request(url,manual,auto)};t.other=()=>request("unrelated");';
  const request = vi.fn();
  const controller: any = {};
  // Execute only this synthetic updater fixture, never proprietary resource code.
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function("t", "APP_CONF", "request", disableClientUpdateChecks(source))(
    controller,
    { channel: "netease" },
    request
  );
  controller.bU("/api/pc/upgrade/get", false, true);
  controller.bU("/api/pc/upgrade/get", true, false);
  expect(request).not.toHaveBeenCalled();
  controller.other();
  expect(request).toHaveBeenCalledExactlyOnceWith("unrelated");
});
it("leaves unrelated modules and unrecognized resource versions untouched", () => {
  const ordinary =
    't.bU=function(){"store"===APP_CONF.channel||"cybercafe"===APP_CONF.channel||request()}';
  expect(disableClientUpdateChecks(ordinary)).toBe(ordinary);
  expect(disableClientUpdateChecks('const cname="_p._$$Updater";t.other=function(){}')).toBe(
    'const cname="_p._$$Updater";t.other=function(){}'
  );
});
