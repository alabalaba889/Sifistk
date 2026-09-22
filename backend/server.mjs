import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const WEB=path.join(ROOT,"..","web");
const STORE=process.env.SIFISTK_STORE_PATH||path.join(ROOT,"data-store.json");
const PORT=Number(process.env.PORT||8787);
const PKG_VERSION=JSON.parse(fs.readFileSync(path.join(ROOT,"..","package.json"),"utf8")).version;
const HOST=process.env.HOST||"127.0.0.1";
const ORIGIN_HOST=HOST==="0.0.0.0"||HOST==="::"?"127.0.0.1":HOST;
const EXPLICIT_PUBLIC_ORIGIN=String(process.env.SIFISTK_PUBLIC_ORIGIN||"").trim();
const ORIGIN=(EXPLICIT_PUBLIC_ORIGIN||`http://${ORIGIN_HOST}:${PORT}`).replace(/\/$/,"");
const VERSION=process.env.SIFISTK_VERSION||PKG_VERSION;
const DEFAULT_EXTENSION_DOWNLOAD_URL="https://github.com/alabalaba889/Sifistk/releases/latest/download/Sifistk-extension.zip";
const EXTENSION_DOWNLOAD_URL=process.env.SIFISTK_EXTENSION_DOWNLOAD_URL||DEFAULT_EXTENSION_DOWNLOAD_URL;
const INVITE_REQUIRED=process.env.SIFISTK_INVITE_REQUIRED!=="false";
const INVITE_MINUTES=Number(process.env.SIFISTK_INVITE_MINUTES||60);
const AI_MODEL=process.env.SIFISTK_AI_MODEL||"gpt-5.6-luna";
const ALLOWED_REASONING=new Set(["none","minimal","low","medium","high","xhigh"]);
const AI_REASONING_EFFORT=ALLOWED_REASONING.has(process.env.SIFISTK_AI_REASONING_EFFORT||"")?process.env.SIFISTK_AI_REASONING_EFFORT:"high";
const AI_WEB_SEARCH=process.env.SIFISTK_AGENT_WEB_SEARCH!=="false";
const OPENAI_API_KEY=process.env.OPENAI_API_KEY||"";
const empty={users:[],sessions:[],invites:[],audit:[],extensionTokens:[],licenses:[],reports:[],agentRuns:[]};
function load(){try{return{...empty,...JSON.parse(fs.readFileSync(STORE,"utf8"))}}catch{return structuredClone(empty)}}
let db=load();for(const k of Object.keys(empty))if(!Array.isArray(db[k]))db[k]=[];
const agentThreads=new Map();
const rateBuckets=new Map();

function save(){fs.mkdirSync(path.dirname(STORE),{recursive:true});fs.writeFileSync(STORE,JSON.stringify(db,null,2),{mode:0o600})}
function id(p){return p+"_"+crypto.randomBytes(12).toString("hex")}
function hash(v){return crypto.createHash("sha256").update(String(v)).digest("hex")}
function passwordHash(p){const s=crypto.randomBytes(16),k=crypto.scryptSync(p,s,64);return s.toString("hex")+":"+k.toString("hex")}
function passwordVerify(p,stored){try{const[s,k]=String(stored).split(":");const got=crypto.scryptSync(p,Buffer.from(s,"hex"),64);return crypto.timingSafeEqual(got,Buffer.from(k,"hex"))}catch{return false}}
function json(res,status,data,headers={}){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers});res.end(JSON.stringify(data))}
function cookie(req,name){return(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||null}
function userFrom(req){const raw=cookie(req,"sifistk_session");if(!raw)return null;const s=db.sessions.find(x=>x.tokenHash===hash(raw)&&x.expiresAt>Date.now());return s?db.users.find(u=>u.id===s.userId)||null:null}
function extensionFrom(req){const h=String(req.headers.authorization||"");if(!h.startsWith("Bearer "))return null;const raw=h.slice(7).trim();if(!raw)return null;const t=db.extensionTokens.find(x=>x.tokenHash===hash(raw)&&x.expiresAt>Date.now());return t?db.users.find(u=>u.id===t.userId)||null:null}
function session(res,userId){const raw=crypto.randomBytes(32).toString("base64url");db.sessions.push({id:id("ses"),userId,tokenHash:hash(raw),expiresAt:Date.now()+7*864e5});db.sessions=db.sessions.filter(s=>s.expiresAt>Date.now());const secure=ORIGIN.startsWith("https://")?"; Secure":"";res.setHeader("Set-Cookie",`sifistk_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`)}
function requestOrigin(req){
  if(EXPLICIT_PUBLIC_ORIGIN)return ORIGIN;
  if(HOST!=="0.0.0.0"&&HOST!=="::")return ORIGIN;
  const host=String(req.headers.host||"").trim();
  const valid=/^[A-Za-z0-9.-]+(?::\\d{1,5})?$/.test(host)||/^\\[[0-9A-Fa-f:]+\\](?::\\d{1,5})?$/.test(host);
  if(!valid)return ORIGIN;
  const forwarded=String(req.headers["x-forwarded-proto"]||"").split(",")[0].trim().toLowerCase();
  const proto=forwarded==="https"||req.socket.encrypted?"https":"http";
  return `${proto}://${host}`;
}
async function body(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>2e6)throw Object.assign(Error("Payload too large"),{status:413})}try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(Error("JSON inválido"),{status:400})}}
function audit(action,userId=null,meta={}){db.audit.push({id:id("aud"),action,userId,at:Date.now(),meta});db.audit=db.audit.slice(-5000);save()}
function consumeInvite(raw){if(!raw)return null;const i=db.invites.findIndex(x=>x.tokenHash===hash(raw)&&!x.usedAt&&x.expiresAt>Date.now());if(i<0)return null;const inv=db.invites[i];inv.usedAt=Date.now();save();return inv}
function publicUser(u){return u&&{id:u.id,name:u.name,email:u.email,verified:!!u.verified,role:u.role||"USER"}}
function extensionSession(userId){const raw=crypto.randomBytes(32).toString("base64url");db.extensionTokens=db.extensionTokens.filter(x=>x.expiresAt>Date.now());db.extensionTokens.push({id:id("ext"),userId,tokenHash:hash(raw),createdAt:Date.now(),expiresAt:Date.now()+30*864e5});save();return raw}
function licenseFor(userId){return db.licenses.find(x=>x.userId===userId&&!x.revokedAt)||null}
function publicLicense(l){return l?{id:l.id,keyMasked:l.key.slice(0,4)+"••••"+l.key.slice(-4),status:l.revokedAt?"revoked":(l.expiresAt&&l.expiresAt<Date.now()?"expired":l.status||"active"),expiresAt:l.expiresAt||null}:null}
function extHeaders(){return{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type, Authorization","access-control-max-age":"600"}}
function rateLimit(req,key,limit,windowMs){
  const ip=req.socket?.remoteAddress||"unknown",now=Date.now(),k=key+":"+ip,old=rateBuckets.get(k)||[];
  const fresh=old.filter(t=>t>now-windowMs);
  fresh.push(now);rateBuckets.set(k,fresh);
  return fresh.length<=limit;
}
function bounded(v,depth=0){
  if(depth>4)return typeof v==="string"?String(v).slice(0,800):null;
  if(v==null||typeof v==="number"||typeof v==="boolean")return v;
  if(typeof v==="string")return v.slice(0,8000);
  if(Array.isArray(v))return v.slice(0,120).map(x=>bounded(x,depth+1));
  if(typeof v==="object"){const o={};for(const k of Object.keys(v).slice(0,100))o[String(k).slice(0,120)]=bounded(v[k],depth+1);return o}
  return String(v).slice(0,800);
}
function safeContext(c){return c&&typeof c==="object"?bounded(c):{}}
function cleanHistory(items){
  if(!Array.isArray(items))return[];
  return items.slice(-40).filter(x=>x&&["user","assistant"].includes(x.role)).map(x=>({role:x.role,content:typeof x.content==="string"?x.content:bounded(x.content,1)}));
}
function cleanTurnOutputs(items){
  if(!Array.isArray(items))return[];
  return items.slice(-32).filter(x=>x&&typeof x.callId==="string").map(x=>({type:"function_call_output",call_id:x.callId,output:JSON.stringify(bounded(x.output??{ok:false,error:"Sem saída"}))}));
}
function threadFor(userId,threadId){
  if(!threadId)return null;
  const t=agentThreads.get(threadId);
  if(!t||t.userId!==userId||t.expiresAt<Date.now())return null;
  t.expiresAt=Date.now()+2*3600e3;
  return t;
}
function pruneThreads(){
  const now=Date.now();
  for(const [k,t] of agentThreads)if(t.expiresAt<now)agentThreads.delete(k);
  while(agentThreads.size>100){const first=agentThreads.keys().next().value;if(first)agentThreads.delete(first);else break}
}
const AGENT_FUNCTIONS=[
  {name:"page_analyze",description:"Analyze the active webpage using allowed DOM access. Use when the user asks to analyze or understand the current page.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"page_capture_context",description:"Capture current page context such as URL, title, selection, viewport and basic DOM counts.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"page_inspect_element",description:"Ask the user to click an element and return a limited technical inspection of that element.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"page_resources",description:"Inspect public script, stylesheet and image references present in the current document.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"page_links",description:"Map visible links on the current page and classify internal versus external destinations.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"page_screenshot",description:"Capture the visible area of the active tab when browser permissions allow it.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"browser_list_tabs",description:"List open browser tabs using only metadata available without the privileged tabs permission.",parameters:{type:"object",properties:{},additionalProperties:false}},
  {name:"browser_open_url",description:"Open an HTTP or HTTPS URL in a new tab. This changes browser state and should be used only when it advances the user's explicit goal.",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"],additionalProperties:false}},
  {name:"artifact_download",description:"Create a textual artifact and download it. This is a user-visible file operation and may require confirmation.",parameters:{type:"object",properties:{filename:{type:"string"},content:{type:"string"},mime:{type:"string"}},required:["filename","content"],additionalProperties:false}},
  {name:"extension_diagnostics",description:"Run diagnostics on the Sifistk extension, its local runtime and its configured server.",parameters:{type:"object",properties:{},additionalProperties:false}}
];
function agentTools(){const tools=AGENT_FUNCTIONS.map(x=>({type:"function",name:x.name,description:x.description,parameters:x.parameters,strict:true}));if(AI_WEB_SEARCH)tools.push({type:"web_search"});return tools}
const AGENT_INSTRUCTIONS=`Você é o agente operacional da extensão Sifistk. Transforme pedidos em trabalho real usando somente ferramentas autorizadas. Nunca diga que executou algo sem resultado verificável. Para tarefas complexas, planeje internamente e execute em etapas. Use contexto da aba somente quando relevante. Use pesquisa web quando a solicitação depender de informação atual ou documentação. Diferencie observação de inferência. Ações que mudam o navegador ou geram arquivos são sensíveis e precisam de confirmação do usuário na extensão. Depois das ferramentas, confira os resultados e informe limitações. Não exponha raciocínio privado passo a passo; forneça apenas resumo operacional e evidências.`;

function extractToolCalls(output){return(Array.isArray(output)?output:[]).filter(x=>x&&x.type==="function_call").map(x=>({callId:x.call_id,name:x.name,arguments:x.arguments||"{}"}))}
function textFromOutput(output){const parts=[];for(const x of Array.isArray(output)?output:[]){if(x.type==="message"&&Array.isArray(x.content))for(const c of x.content)if(c.type==="output_text"&&c.text)parts.push(c.text)}return parts.join("\n\n").trim()}
async function callAI(input){
  if(!OPENAI_API_KEY)throw Object.assign(Error("A IA do servidor não está configurada. Defina OPENAI_API_KEY no ambiente do backend."),{status:503});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+OPENAI_API_KEY},body:JSON.stringify({model:AI_MODEL,instructions:AGENT_INSTRUCTIONS,input,tools:agentTools(),tool_choice:"auto",store:false,reasoning:{effort:AI_REASONING_EFFORT}}),signal:controller.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(Error(d.error?.message||"Falha ao consultar a IA."),{status:r.status>=400&&r.status<500?502:503});
    return d;
  }catch(e){if(e.name==="AbortError")throw Object.assign(Error("A IA excedeu o tempo limite de 60 segundos."),{status:504});throw e}
  finally{clearTimeout(timer)}
}

async function agentTurn(req,res){
  const user=extensionFrom(req);
  if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());
  if(!rateLimit(req,"agent",30,60000))return json(res,429,{error:"Muitas solicitações de IA. Aguarde um momento."},extHeaders());
  const b=await body(req);
  const message=String(b.message||"").trim();
  let thread=threadFor(user.id,String(b.threadId||""));
  if(!thread){
    thread={id:id("thr"),userId:user.id,items:cleanHistory(b.history),expiresAt:Date.now()+2*3600e3};
    agentThreads.set(thread.id,thread);pruneThreads();
  }
  if(message){
    thread.items.push({role:"user",content:[{type:"input_text",text:message+"\n\nContexto disponível da extensão:\n"+JSON.stringify(safeContext(b.context))}]});
  }
  for(const x of cleanTurnOutputs(b.toolOutputs))thread.items.push(x);
  if(!message&&!Array.isArray(b.toolOutputs))return json(res,400,{error:"Mensagem vazia."},extHeaders());
  thread.items=thread.items.slice(-100);
  const started=Date.now(),response=await callAI(thread.items),calls=extractToolCalls(response.output),text=textFromOutput(response.output);
  for(const item of Array.isArray(response.output)?response.output:[])thread.items.push(item);
  thread.items=thread.items.slice(-120);thread.expiresAt=Date.now()+2*3600e3;
  const run={id:id("run"),userId:user.id,threadId:thread.id,createdAt:started,finishedAt:Date.now(),messageLength:message.length,toolCount:calls.length,model:AI_MODEL,status:response.status||"completed"};
  db.agentRuns.push(run);db.agentRuns=db.agentRuns.slice(-1000);save();audit("AGENT_TURN",user.id,{runId:run.id,threadId:thread.id,toolCount:calls.length});
  return json(res,200,{ok:true,runId:run.id,threadId:thread.id,status:response.status||"completed",text,toolCalls:calls,usage:response.usage||null},extHeaders());
}

async function route(req,res){
  const url=new URL(req.url||"/",ORIGIN),p=url.pathname;
  if(req.method==="OPTIONS"&&p.startsWith("/api/extension/"))return json(res,204,{},extHeaders());
  if(req.method==="GET"&&p==="/api/health")return json(res,200,{ok:true,service:"sifistk",version:VERSION});
  if(req.method==="GET"&&p==="/api/config")return json(res,200,{version:VERSION,inviteRequired:INVITE_REQUIRED,portal:"/app/",publicOrigin:requestOrigin(req),agent:{enabled:!!OPENAI_API_KEY,model:AI_MODEL,webSearch:AI_WEB_SEARCH,reasoningEffort:AI_REASONING_EFFORT},extensionDownloadUrl:EXTENSION_DOWNLOAD_URL});
  if(req.method==="POST"&&p==="/api/invites/validate"){const b=await body(req),t=String(b.token||"");const valid=!!db.invites.find(x=>x.tokenHash===hash(t)&&!x.usedAt&&x.expiresAt>Date.now());return json(res,valid?200:400,valid?{valid:true}:{valid:false,error:"Convite inválido, expirado ou já utilizado."})}
  if(req.method==="POST"&&p==="/api/auth/register"){if(!rateLimit(req,"register",20,600000))return json(res,429,{error:"Muitas tentativas de cadastro. Tente novamente mais tarde."});const b=await body(req),name=String(b.name||"").trim(),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||""),inviteToken=String(b.invite||"");if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return json(res,400,{error:"Nome, e-mail válido e senha de pelo menos 8 caracteres são obrigatórios."});if(db.users.some(u=>u.email===email))return json(res,409,{error:"E-mail já cadastrado."});let invite=null;if(INVITE_REQUIRED){invite=consumeInvite(inviteToken);if(!invite)return json(res,403,{error:"É necessário um convite válido para criar uma conta."})}const user={id:id("usr"),name,email,password:passwordHash(password),verified:true,role:"USER",createdAt:Date.now(),inviteId:invite?.id||null};db.users.push(user);save();audit("REGISTER",user.id,{invited:!!invite});session(res,user.id);return json(res,201,{user:publicUser(user)})}
  if(req.method==="POST"&&p==="/api/auth/login"){if(!rateLimit(req,"login",20,600000))return json(res,429,{error:"Muitas tentativas de login. Tente novamente mais tarde."});const b=await body(req),user=db.users.find(u=>u.email===String(b.email||"").trim().toLowerCase());if(!user||!passwordVerify(String(b.password||""),user.password))return json(res,401,{error:"E-mail ou senha inválidos."});session(res,user.id);audit("LOGIN",user.id);return json(res,200,{user:publicUser(user)})}
  if(req.method==="POST"&&p==="/api/auth/logout"){const raw=cookie(req,"sifistk_session");if(raw){db.sessions=db.sessions.filter(s=>s.tokenHash!==hash(raw));save()}res.setHeader("Set-Cookie","sifistk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");return json(res,200,{ok:true})}
  if(req.method==="GET"&&p==="/api/me")return json(res,200,{user:publicUser(userFrom(req))});
  if(req.method==="POST"&&p==="/api/admin/bootstrap"){const key=req.headers["x-sifistk-admin-key"];if(!process.env.SIFISTK_ADMIN_KEY||key!==process.env.SIFISTK_ADMIN_KEY)return json(res,403,{error:"Acesso negado."});if(db.users.some(u=>u.role==="SUPER_ADMIN"))return json(res,409,{error:"Administrador inicial já configurado."});const b=await body(req),name=String(b.name||"Sifistk").trim(),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return json(res,400,{error:"E-mail válido e senha de pelo menos 12 caracteres são obrigatórios."});const user={id:id("usr"),name,email,password:passwordHash(password),verified:true,role:"SUPER_ADMIN",createdAt:Date.now()};db.users.push(user);save();audit("ADMIN_BOOTSTRAP",user.id);return json(res,201,{user:publicUser(user)})}
  if(req.method==="POST"&&p==="/api/admin/invites"){const admin=userFrom(req);if(!admin||admin.role!=="SUPER_ADMIN")return json(res,403,{error:"Acesso negado."});const raw=crypto.randomBytes(18).toString("base64url"),inv={id:id("inv"),tokenHash:hash(raw),createdAt:Date.now(),expiresAt:Date.now()+INVITE_MINUTES*60000,usedAt:null};db.invites.push(inv);save();audit("INVITE_CREATED",admin.id,{inviteId:inv.id});return json(res,201,{invite:raw,expiresAt:inv.expiresAt,url:`${requestOrigin(req)}/?invite=${encodeURIComponent(raw)}`})}
  if(req.method==="GET"&&p==="/api/admin/audit"){const admin=userFrom(req);if(!admin||admin.role!=="SUPER_ADMIN")return json(res,403,{error:"Acesso negado."});return json(res,200,{audit:db.audit.slice(-500).reverse()})}
  if(req.method==="GET"&&p==="/api/extension/health")return json(res,200,{ok:true,service:"sifistk-extension-api",version:VERSION,agentEnabled:!!OPENAI_API_KEY},extHeaders());
  if(req.method==="GET"&&p==="/api/extension/version")return json(res,200,{latestVersion:VERSION,minVersion:VERSION,downloadUrl:EXTENSION_DOWNLOAD_URL},extHeaders());
  if(req.method==="GET"&&p==="/api/extension/download"){if(!EXTENSION_DOWNLOAD_URL)return json(res,503,{error:"Download da extensão não configurado."});res.writeHead(302,{"location":EXTENSION_DOWNLOAD_URL,"cache-control":"no-store"});res.end();return}
  if(req.method==="POST"&&p==="/api/extension/login"){if(!rateLimit(req,"ext-login",20,600000))return json(res,429,{error:"Muitas tentativas de login. Tente novamente mais tarde."},extHeaders());const b=await body(req),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||""),user=db.users.find(u=>u.email===email);if(!user||!passwordVerify(password,user.password))return json(res,401,{error:"E-mail ou senha inválidos."},extHeaders());const token=extensionSession(user.id);audit("EXTENSION_LOGIN",user.id);return json(res,200,{token,user:publicUser(user),license:publicLicense(licenseFor(user.id))},extHeaders())}
  if(req.method==="POST"&&p==="/api/extension/logout"){const raw=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(raw){db.extensionTokens=db.extensionTokens.filter(x=>x.tokenHash!==hash(raw));save()}return json(res,200,{ok:true},extHeaders())}
  if(req.method==="GET"&&p==="/api/extension/me"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Sessão da extensão inválida ou expirada."},extHeaders());return json(res,200,{user:publicUser(user),license:publicLicense(licenseFor(user.id))},extHeaders())}
  if(req.method==="GET"&&p==="/api/extension/license"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());return json(res,200,{license:publicLicense(licenseFor(user.id))},extHeaders())}
  if(req.method==="POST"&&p==="/api/extension/report"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());const b=await body(req);if(!b.report||typeof b.report!=="object")return json(res,400,{error:"Relatório inválido."},extHeaders());const rec={id:id("rep"),userId:user.id,createdAt:Date.now(),report:b.report};db.reports.push(rec);db.reports=db.reports.slice(-500);save();audit("EXTENSION_REPORT",user.id,{reportId:rec.id});return json(res,201,{id:rec.id},extHeaders())}
  if(req.method==="GET"&&p==="/api/extension/reports"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());return json(res,200,{reports:db.reports.filter(x=>x.userId===user.id).slice(-50).reverse()},extHeaders())}
  if(req.method==="POST"&&p==="/api/extension/heartbeat"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());const b=await body(req);audit("EXTENSION_HEARTBEAT",user.id,{installId:String(b.installId||"").slice(0,120),version:String(b.version||"").slice(0,30)});return json(res,200,{ok:true,at:Date.now(),license:publicLicense(licenseFor(user.id))},extHeaders())}
  if(req.method==="POST"&&p==="/api/extension/agent/turn")return agentTurn(req,res);
  if(req.method==="POST"&&p==="/api/admin/license"){const admin=userFrom(req);if(!admin||admin.role!=="SUPER_ADMIN")return json(res,403,{error:"Acesso negado."});const b=await body(req),email=String(b.email||"").trim().toLowerCase(),expiresAt=b.expiresAt?Number(b.expiresAt):null,user=db.users.find(u=>u.email===email);if(!user)return json(res,404,{error:"Usuário não encontrado."});const key="SIF-"+crypto.randomBytes(10).toString("hex").toUpperCase(),license={id:id("lic"),userId:user.id,key,status:"active",createdAt:Date.now(),expiresAt};db.licenses=db.licenses.filter(x=>x.userId!==user.id);db.licenses.push(license);save();audit("LICENSE_CREATED",admin.id,{userId:user.id,licenseId:license.id});return json(res,201,{license:{id:license.id,key,status:license.status,expiresAt}},extHeaders())}
  if(req.method==="GET"&&(p==="/produto"||p==="/produto/")){res.writeHead(302,{"location":"/app/","cache-control":"no-store"});res.end();return}
  if(req.method==="GET")return serveStatic(res,p);
  return json(res,404,{error:"Not found"});
}
function serveStatic(res,pathname){
  let relative=pathname==="/"?"index.html":pathname.replace(/^\/+/,"");
  if(relative.includes("..")||relative.startsWith("backend")||relative.startsWith("data-store"))return json(res,404,{error:"Not found"});
  const file=path.resolve(WEB,relative);
  if(!file.startsWith(path.resolve(WEB)+path.sep))return json(res,404,{error:"Not found"});
  let target=file;if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,"index.html");
  if(!fs.existsSync(target)||!fs.statSync(target).isFile())return json(res,404,{error:"Not found"});
  const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon",".txt":"text/plain; charset=utf-8"};
  res.writeHead(200,{"content-type":types[path.extname(target)]||"application/octet-stream","x-content-type-options":"nosniff","content-security-policy":"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});fs.createReadStream(target).pipe(res);
}
http.createServer((req,res)=>route(req,res).catch(err=>{console.error(err);json(res,err.status||500,{error:err.status?err.message:"Erro interno."})})).listen(PORT,HOST,()=>console.log(`Sifistk server: ${ORIGIN}`));