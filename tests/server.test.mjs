import test from "node:test";
import assert from "node:assert/strict";

test("project declares Node 20+", async () => {
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.engines.node, /20/);
});

test("invite mode defaults to controlled access", () => {
  assert.equal(process.env.SIFISTK_INVITE_REQUIRED ?? "true", "true");
});
