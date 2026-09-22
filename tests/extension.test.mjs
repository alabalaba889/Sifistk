import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const run=promisify(execFile);

test("extension manifest is MV3 and keeps risky access optional",async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL("../extension/manifest.json",import.meta.url),"utf8"));
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.background.type,undefined);
  for(const p of ["storage","alarms","sidePanel","activeTab","scripting"])assert.ok(manifest.permissions.includes(p));
  for(const p of ["tabs","downloads","sessions","notifications","tabGroups"])assert.ok(manifest.optional_permissions.includes(p));
});

test("extension JavaScript passes Node syntax parsing",async()=>{
  for(const file of ["extension/core.js","extension/background.js","extension/popup.js","extension/sidepanel.js","extension/options.js"]){
    await run(process.execPath,["--check",file],{cwd:path.resolve(new URL("..",import.meta.url).pathname)});
  }
});

test("extension surfaces and green capabilities exist",async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL("../extension/manifest.json",import.meta.url),"utf8"));
  for(const file of [manifest.action.default_popup,manifest.side_panel.default_path,manifest.options_page,"core.js","background.js"]){
    const target=file==="core.js"||file==="background.js"?"../extension/"+file:"../extension/"+file;
    await fs.access(new URL(target,import.meta.url));
  }
  const core=await fs.readFile(new URL("../extension/core.js",import.meta.url),"utf8");
  const bg=await fs.readFile(new URL("../extension/background.js",import.meta.url),"utf8");
  for(const token of ["syncServer","collectDiagnostics","recordAction","saveSettings","downloadJson","requestPermissions"])assert.match(core,new RegExp(token));
  for(const token of ["ANALYZE_PAGE","CAPTURE_CONTEXT","INSPECT_ELEMENT","LIST_TABS","LIST_SESSIONS","DOWNLOAD_REPORT","CLEAR_DATA"])assert.match(bg,new RegExp(token));
});

test("extension API supports health, auth, reports and licensing",async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),"sifistk-test-"));
  const store=path.join(dir,"store.json");
  const port=18987+Math.floor(Math.random()*300);
  const env={...process.env,PORT:String(port),HOST:"127.0.0.1",SIFISTK_PUBLIC_ORIGIN:"http://127.0.0.1:"+port,SIFISTK_STORE_PATH:store,SIFISTK_ADMIN_KEY:"test-admin-key"};
  const proc=(await import("node:child_process")).spawn(process.execPath,["backend/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
  try{
    let ready=false;
    for(let i=0;i<40&&!ready;i++){
      await new Promise(r=>setTimeout(r,50));
      try{ready=(await fetch("http://127.0.0.1:"+port+"/api/health")).ok;}catch{}
    }
    assert.equal(ready,true,"server did not become ready");
    const j=async(url,opt={})=>{const r=await fetch("http://127.0.0.1:"+port+url,{...opt,headers:{"content-type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));return{r,d}};
    let x=await j("/api/admin/bootstrap",{method:"POST",headers:{"x-sifistk-admin-key":"test-admin-key"},body:JSON.stringify({name:"Admin",email:"admin@example.com",password:"LongAdminPass123!"})});
    assert.equal(x.r.status,201);
    let login=await j("/api/auth/login",{method:"POST",body:JSON.stringify({email:"admin@example.com",password:"LongAdminPass123!"})});
    assert.equal(login.r.status,200);
    const cookie=login.r.headers.get("set-cookie").split(";")[0];
    x=await j("/api/admin/invites",{method:"POST",headers:{cookie}});
    assert.equal(x.r.status,201);
    const invite=x.d.invite;
    x=await j("/api/auth/register",{method:"POST",body:JSON.stringify({name:"User",email:"user@example.com",password:"UserPass123!",invite})});
    assert.equal(x.r.status,201);
    x=await j("/api/extension/health");
    assert.equal(x.r.status,200);
    x=await j("/api/extension/login",{method:"POST",body:JSON.stringify({email:"user@example.com",password:"UserPass123!"})});
    assert.equal(x.r.status,200);
    const token=x.d.token;
    x=await j("/api/extension/me",{headers:{authorization:"Bearer "+token}});
    assert.equal(x.r.status,200);
    x=await j("/api/extension/report",{method:"POST",headers:{authorization:"Bearer "+token},body:JSON.stringify({report:{schemaVersion:1,ok:true}})});
    assert.equal(x.r.status,201);
    x=await j("/api/extension/reports",{headers:{authorization:"Bearer "+token}});
    assert.equal(x.r.status,200);
    assert.equal(x.d.reports.length,1);
    x=await j("/api/admin/license",{method:"POST",headers:{cookie},body:JSON.stringify({email:"user@example.com"})});
    assert.equal(x.r.status,201);
    x=await j("/api/extension/me",{headers:{authorization:"Bearer "+token}});
    assert.equal(x.r.status,200);
    assert.equal(x.d.license.status,"active");
  }finally{
    proc.kill("SIGTERM");
    await rm(dir,{recursive:true,force:true});
  }
});