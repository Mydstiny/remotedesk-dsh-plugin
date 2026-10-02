import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadQrGenerator() {
  const source = readFileSync(new URL("../vendor/qrcode-generator-2.0.4.js", import.meta.url), "utf8") +
    "\nthis.qrcodeExport = qrcode;";
  const context = {};
  vm.runInNewContext(source, context);
  return context.qrcodeExport;
}

test("vendored QR generator encodes a real RemoteDesk invite payload", () => {
  const qrcode = loadQrGenerator();
  const invite = {
    code: "invite-code-0123456789",
    expires: Date.now() + 120000,
    ca: "-----BEGIN CERTIFICATE-----\\n" + "A".repeat(1440) + "\\n-----END CERTIFICATE-----\\n",
    serverInstance: "server-instance-0123456789",
  };
  const qr = qrcode(0, "M");
  qr.addData(JSON.stringify(invite), "Byte");
  qr.make();
  assert.ok(qr.getModuleCount() >= 21);
  assert.match(qr.createDataURL(4, 4), /^data:image\/gif;base64,/);
});
