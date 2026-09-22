import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
const run=promisify(execFile);
const root=path.resolve(new URL("..",import.meta.url).pathname);

test("extension manifest is MV3 and permissions match implemented APIs",async()=>{
  const m=JSON.parse(await fs.readFile(path.join(root,"extension/manifest.json"),"utf8"));
  assert.equal(m.manifest_version,3);
  assert.equal(m.version,"9.0.1");
  assert.equal(m.side_panel.default_path,"agent.html");
  assert.equal(m.action.default_popup,undefined);
  assert.deepEqual(m.permissions.sort(),["activeTab","scripting","sidePanel","storage"]);
  assert.equal(m.optional_permissions,undefined);
  assert.equal(m.optional_host_permissions,undefined);
});

test("all extension JavaScript parses",async()=>{
  for(const f of ["extension/core.js","extension/background.js","extension/agent-tools.js","extension/agent.js"])await run(process.execPath,["--check",f],{cwd:root});
});

test("conversational UI has working auth, chat and task controls",async()=>{
  const html=await fs.readFile(path.join(root,"extension/agent.html"),"utf8");
  assert.match(html,/id="conversation"/);
  assert.match(html,/id="message"/);
  assert.match(html,/id="loginForm"/);
  assert.match(html,/id="serverOrigin"/);
  assert.match(html,/id="logoutBtn"/);
  assert.match(html,/id="cancelBtn"/);
  assert.doesNotMatch(html,/historyBtn/);
});

test("extension runtime does not use downloads permission or legacy save key",async()=>{
  const manifest=await fs.readFile(path.join(root,"extension/manifest.json"),"utf8");
  const core=await fs.readFile(path.join(root,"extension/core.js"),"utf8");
  const agent=await fs.readFile(path.join(root,"extension/agent.js"),"utf8");
  const bg=await fs.readFile(path.join(root,"extension/background.js"),"utf8");
  assert.doesNotMatch(manifest,/"downloads"/);
  assert.doesNotMatch(manifest,/"notifications"/);
  assert.doesNotMatch(bg,/chrome\.downloads/);
  assert.doesNotMatch(agent,/SAVE_CONVERSATION/);
  assert.match(core,/agentConversation/);
  assert.match(core,/agentInputHistory/);
});

test("safe agent controls exist",async()=>{
  const tools=await fs.readFile(path.join(root,"extension/agent-tools.js"),"utf8");
  const agent=await fs.readFile(path.join(root,"extension/agent.js"),"utf8");
  for(const name of ["page_analyze","page_capture_context","page_inspect_element","page_resources","page_links","page_screenshot","browser_open_url","artifact_download","extension_diagnostics"])assert.match(tools,new RegExp(name));
  assert.match(agent,/MAX_TOOL_ROUNDS=8/);
  assert.match(agent,/AbortController/);
  assert.match(agent,/downloadArtifact/);
});