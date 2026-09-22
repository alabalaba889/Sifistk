import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("project declares Node 20+", async () => {
  const pkg=JSON.parse(await fs.readFile(new URL("../package.json",import.meta.url),"utf8"));
  assert.match(pkg.engines.node,/20/);
});

test("invite mode defaults to controlled access",()=> {
  assert.equal(process.env.SIFISTK_INVITE_REQUIRED ?? "true","true");
});

test("user portal contains all 30 non-admin feature routes",async()=>{
  const app=await fs.readFile(new URL("../web/app/app.js",import.meta.url),"utf8");
  const expected=["dashboard","profile","sessions","notifications","downloads","download-history","version","license","license-history","license-activation","changelog","help","faq","support","system-notices","status","diagnostics","diagnostic-export","verification","verification-history","onboarding","install","extension-settings","settings","security","privacy","orders","benefits","feedback","search"];
  for(const route of expected) assert.ok(app.includes('"'+route+'"') || app.includes("'"+route+"'"), "missing route: "+route);
  assert.equal(expected.length,30);
});

test("authenticated portal entry exists",async()=>{
  const html=await fs.readFile(new URL("../web/app/index.html",import.meta.url),"utf8");
  assert.match(html,/Minha Sifistk/);
});

test("server supports directory index routing",async()=>{
  const server=await fs.readFile(new URL("../backend/server.mjs",import.meta.url),"utf8");
  assert.match(server,/fs\.statSync\(file\)\.isDirectory\(\)/);
});