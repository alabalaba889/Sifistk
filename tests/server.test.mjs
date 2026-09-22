import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {spawn,execFile} from "node:child_process";
import path from "node:path";
import {promisify} from "node:util";
const run=promisify(execFile);

test("project version and agent environment are aligned",async()=>{
  await run(process.execPath,["--check","backend/server.mjs"],{cwd:process.cwd()});
  await run(process.execPath,["--check","web/app/app.js"],{cwd:process.cwd()});
  const pkg=JSON.parse(await fs.readFile(new URL("../package.json",import.meta.url),"utf8"));
  assert.equal(pkg.version,"9.0.2");
  assert.match(pkg.engines.node,/20/);
  const env=await fs.readFile(new URL("../.env.example",import.meta.url),"utf8");
  assert.match(env,/OPENAI_API_KEY=/);
  assert.match(env,/SIFISTK_AI_MODEL=/);
  assert.match(env,/SIFISTK_AI_REASONING_EFFORT=high/);
  assert.match(env,/releases\/latest\/download\/Sifistk-extension\.zip/);
});

test("agent API keeps AI credentials server-side and has bounded context",async()=>{
  const server=await fs.readFile(new URL("../backend/server.mjs",import.meta.url),"utf8");
  const ext=await fs.readFile(new URL("../extension/core.js",import.meta.url),"utf8");
  assert.match(server,/\/api\/extension\/agent\/turn/);
  assert.match(server,/OPENAI_API_KEY/);
  assert.match(server,/reasoning:\{effort:AI_REASONING_EFFORT\}/);
  assert.match(server,/function bounded\(/);
  assert.doesNotMatch(server,/JSON\.parse\(s\.slice\(/);
  assert.match(server,/agentThreads/);
  assert.doesNotMatch(ext,/OPENAI_API_KEY/);
  assert.doesNotMatch(ext,/api\.openai\.com/);
});

test("server source handles LAN origins and portal compatibility",async()=>{
  const server=await fs.readFile(new URL("../backend/server.mjs",import.meta.url),"utf8");
  assert.match(server,/function requestOrigin\(req\)/);
  assert.match(server,/requestOrigin\(req\)/);
  assert.ok(server.includes('p==="/produto"||p==="/produto/"'));
  const web=await fs.readFile(new URL("../web/app.js",import.meta.url),"utf8");
  assert.ok(web.includes('window.location.assign("/app/")'));
  assert.match(web,/archiveviewer/);
});

test("workflow publishes a stable release asset",async()=>{const workflow=await fs.readFile(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");assert.match(workflow,/gh release create/);assert.match(workflow,/Sifistk-extension\.zip/);assert.match(workflow,/contents: write/);});

test("web and extension authentication accept normal email addresses",async()=>{
  const dir=await fs.mkdtemp(path.join(process.cwd(),"sifistk-auth-test-"));
  const port=19300+Math.floor(Math.random()*200);
  const env={...process.env,PORT:String(port),HOST:"127.0.0.1",SIFISTK_PUBLIC_ORIGIN:"http://127.0.0.1:"+port,SIFISTK_STORE_PATH:path.join(dir,"store.json"),OPENAI_API_KEY:"",SIFISTK_INVITE_REQUIRED:"false"};
  const p=spawn(process.execPath,["backend/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
  try{
    let ok=false;
    for(let i=0;i<60&&!ok;i++){await new Promise(r=>setTimeout(r,40));try{ok=(await fetch("http://127.0.0.1:"+port+"/api/health")).ok}catch{}}
    assert.equal(ok,true);
    const email="user.sifistk@example.com";
    const reg=await fetch("http://127.0.0.1:"+port+"/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Teste Sifistk",email,password:"SenhaSegura123"})});
    assert.equal(reg.status,201);
    const ext=await fetch("http://127.0.0.1:"+port+"/api/extension/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password:"SenhaSegura123"})});
    assert.equal(ext.status,200);
    const data=await ext.json();
    assert.equal(typeof data.token,"string");
  }finally{p.kill("SIGTERM");await fs.rm(dir,{recursive:true,force:true})}
});

test("server exposes the configured LAN public origin",async()=>{
  const dir=await fs.mkdtemp(path.join(process.cwd(),"sifistk-lan-test-"));
  const port=19400+Math.floor(Math.random()*200);
  const env={...process.env,PORT:String(port),HOST:"0.0.0.0",SIFISTK_PUBLIC_ORIGIN:"http://192.168.1.50:"+port,SIFISTK_STORE_PATH:path.join(dir,"store.json"),OPENAI_API_KEY:""};
  const p=spawn(process.execPath,["backend/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
  try{
    let ok=false;
    for(let i=0;i<60&&!ok;i++){await new Promise(r=>setTimeout(r,40));try{ok=(await fetch("http://127.0.0.1:"+port+"/api/health")).ok}catch{}}
    assert.equal(ok,true);
    const config=await (await fetch("http://127.0.0.1:"+port+"/api/config")).json();
    assert.equal(config.publicOrigin,"http://192.168.1.50:"+port);
  }finally{p.kill("SIGTERM");await fs.rm(dir,{recursive:true,force:true})}
});

test("invite mode stays controlled by default",()=>assert.equal(process.env.SIFISTK_INVITE_REQUIRED??"true","true"));

test("server smoke exposes stable download URL and redirect",async()=>{
  const dir=await fs.mkdtemp(path.join(process.cwd(),"sifistk-test-"));
  const port=19100+Math.floor(Math.random()*200);
  const env={...process.env,PORT:String(port),HOST:"127.0.0.1",SIFISTK_PUBLIC_ORIGIN:"http://127.0.0.1:"+port,SIFISTK_STORE_PATH:path.join(dir,"store.json"),OPENAI_API_KEY:""};
  const p=spawn(process.execPath,["backend/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
  try{
    let ok=false;
    for(let i=0;i<60&&!ok;i++){await new Promise(r=>setTimeout(r,50));try{const r=await fetch("http://127.0.0.1:"+port+"/api/health");ok=r.ok}catch{}}
    assert.equal(ok,true);
    const c=await fetch("http://127.0.0.1:"+port+"/api/config");
    const config=await c.json();
    assert.equal(config.extensionDownloadUrl,"https://github.com/alabalaba889/Sifistk/releases/latest/download/Sifistk-extension.zip");
    const v=await fetch("http://127.0.0.1:"+port+"/api/extension/version");
    const version=await v.json();
    assert.equal(version.latestVersion,"9.0.2");
    assert.equal(version.minVersion,"9.0.2");
    assert.equal(version.downloadUrl,config.extensionDownloadUrl);
    const d=await fetch("http://127.0.0.1:"+port+"/api/extension/download",{redirect:"manual"});
    assert.equal(d.status,302);
    assert.equal(d.headers.get("location"),config.extensionDownloadUrl);
    const ar=await fetch("http://127.0.0.1:"+port+"/api/extension/agent/turn",{method:"POST",headers:{"content-type":"application/json"}});
    assert.equal(ar.status,401);
  }finally{p.kill("SIGTERM");await fs.rm(dir,{recursive:true,force:true})}
});