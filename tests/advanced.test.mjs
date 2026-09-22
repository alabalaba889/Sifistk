import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run=promisify(execFile);

test("advanced module passes syntax check",async()=>{
  await run(process.execPath,["--check","extension/advanced.js"]);
});

test("advanced module exposes deterministic audit surfaces",async()=>{
  const c=await fs.readFile(new URL("../extension/advanced.js",import.meta.url),"utf8");
  for(const x of ["auditPage","compatibility","inspect","seo-title","a11y-image-alt","security-target-blank","perf-long-task","schemaVersion"]) assert.ok(c.includes(x), "missing "+x);
});

test("background wires yellow capabilities without debugger permission",async()=>{
  const m=JSON.parse(await fs.readFile(new URL("../extension/manifest.json",import.meta.url),"utf8"));
  const b=await fs.readFile(new URL("../extension/background.js",import.meta.url),"utf8");
  assert.equal(m.permissions.includes("debugger"),false);
  for(const x of ['importScripts("core.js","advanced.js")','ADVANCED_AUDIT','COMPATIBILITY','ADVANCED_INSPECT']) assert.ok(b.includes(x), "missing "+x);
});