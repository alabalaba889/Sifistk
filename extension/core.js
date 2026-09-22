const SIFISTK=globalThis.SIFISTK||{};
SIFISTK.VERSION="9.0.2";
SIFISTK.DEFAULTS={apiOrigin:"http://localhost:8787",settings:{saveActionHistory:true}};
SIFISTK.getState=async()=>{
  const d=await chrome.storage.local.get(["apiOrigin","user","license","installId","agentConversation","agentInputHistory","agentThreadId","actionHistory"]);
  const sensitive=await chrome.storage.session.get(["authToken"]);
  return {
    ...SIFISTK.DEFAULTS,
    ...d,
    ...sensitive,
    settings:{...SIFISTK.DEFAULTS.settings,...(d.settings||{})},
    actionHistory:Array.isArray(d.actionHistory)?d.actionHistory:[],
    conversation:Array.isArray(d.agentConversation)?d.agentConversation:[],
    agentInputHistory:Array.isArray(d.agentInputHistory)?d.agentInputHistory:[]
  };
};
SIFISTK.ensureDefaults=async()=>{
  const s=await SIFISTK.getState(),p={};
  if(!s.apiOrigin)p.apiOrigin=SIFISTK.DEFAULTS.apiOrigin;
  if(!s.installId)p.installId="ins_"+crypto.randomUUID();
  if(Object.keys(p).length)await chrome.storage.local.set(p);
  return{...s,...p};
};
SIFISTK.normalizeOrigin=v=>{
  const raw=String(v||"").trim().replace(/\/$/,"");
  const u=new URL(raw);
  if(!["http:","https:"].includes(u.protocol))throw Error("O servidor deve usar HTTP ou HTTPS.");
  if(u.username||u.password)throw Error("A URL não pode conter credenciais.");
  if(u.pathname!="/"||u.search||u.hash)throw Error("Informe somente a origem do servidor, por exemplo http://localhost:8787.");
  return u.origin;
};
SIFISTK.setApiOrigin=async value=>{
  const origin=SIFISTK.normalizeOrigin(value);
  await chrome.storage.local.set({apiOrigin:origin});
  return origin;
};
SIFISTK.api=async(path,options={})=>{
  const s=await SIFISTK.getState(),o=SIFISTK.normalizeOrigin(s.apiOrigin);
  const h={Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})};
  if(s.authToken)h.Authorization="Bearer "+s.authToken;
  let r;
  try{
    r=await fetch(o+path,{...options,headers:h,cache:"no-store"});
  }catch(e){
    if(e?.name==="AbortError")throw e;
    throw Error("Não foi possível conectar ao servidor da Sifistk em "+o+". Verifique se o backend está ligado e se este servidor foi autorizado na extensão.");
  }
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=Error(d.error||"Operação recusada.");e.status=r.status;throw e}
  return d;
};
SIFISTK.recordAction=async(action,detail={})=>{
  const s=await SIFISTK.getState();
  if(!s.settings.saveActionHistory)return;
  const x={id:crypto.randomUUID(),action:String(action),detail:detail||{},at:Date.now()},h=[x,...s.actionHistory].slice(0,200);
  await chrome.storage.local.set({actionHistory:h});
  return x;
};
SIFISTK.login=async(email,password)=>{
  const d=await SIFISTK.api("/api/extension/login",{method:"POST",body:JSON.stringify({email:String(email||"").trim().toLowerCase(),password:String(password||"")})});
  await chrome.storage.session.set({authToken:d.token});
  await chrome.storage.local.set({user:d.user,license:d.license||null});
  return d;
};
SIFISTK.logout=async()=>{
  try{await SIFISTK.api("/api/extension/logout",{method:"POST"})}catch{}
  await chrome.storage.session.remove(["authToken"]);
  await chrome.storage.local.remove(["user","license","agentThreadId"]);
};
SIFISTK.clearConversation=async()=>chrome.storage.local.remove(["agentConversation","agentInputHistory","agentThreadId"]);
SIFISTK.saveConversation=async(c,h,threadId=null)=>chrome.storage.local.set({
  agentConversation:Array.isArray(c)?c.slice(-100):[],
  agentInputHistory:Array.isArray(h)?h.slice(-40):[],
  agentThreadId:threadId||null
});
SIFISTK.collectDiagnostics=async()=>{
  const s=await SIFISTK.getState();let server={ok:false,error:"Não testado"};
  try{const h=await SIFISTK.api("/api/extension/health");server={ok:true,version:h.version,service:h.service,agentEnabled:!!h.agentEnabled}}
  catch(e){server={ok:false,error:e.message}};
  return{schemaVersion:2,extension:{version:SIFISTK.VERSION,id:chrome.runtime.id,manifestVersion:chrome.runtime.getManifest().manifest_version},runtime:{online:navigator.onLine,userAgent:navigator.userAgent},server,account:s.user?{id:s.user.id,email:s.user.email,role:s.user.role}:null,license:s.license||null,permissions:{activeTab:true,scripting:true,sidePanel:true},generatedAt:new Date().toISOString()};
};
