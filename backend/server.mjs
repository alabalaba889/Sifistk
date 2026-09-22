import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, "..", "web");
const STORE = process.env.SIFISTK_STORE_PATH || path.join(ROOT, "data-store.json");
const PORT = Number(process.env.PORT || 8787);
const PKG_VERSION = "8.4.0";
const HOST = process.env.HOST || "127.0.0.1";
const ORIGIN = (process.env.SIFISTK_PUBLIC_ORIGIN || `http://${HOST}:${PORT}`).replace(/\/$/,"");
const VERSION = process.env.SIFISTK_VERSION || PKG_VERSION;
const EXTENSION_DOWNLOAD_URL = process.env.SIFISTK_EXTENSION_DOWNLOAD_URL || "";
const INVITE_REQUIRED = process.env.SIFISTK_INVITE_REQUIRED !== "false";
const INVITE_MINUTES = Number(process.env.SIFISTK_INVITE_MINUTES || 60);
const empty={users:[],sessions:[],invites:[],audit:[],extensionTokens:[],licenses:[],reports:[]};
function load(){try{return{...empty,...JSON.parse(fs.readFileSync(STORE,"utf8"))}}catch{return structuredClone(empty)}}
let db=load(); for(const k of Object.keys(empty))if(!Array.isArray(db[k]))db[k]=[];
function save(){fs.mkdirSync(path.dirname(STORE),{recursive:true});fs.writeFileSync(STORE,JSON.stringify(db,null,2),{mode:0o600})}
function id(p){return p+"_"+crypto.randomBytes(12).toString("hex")}
function hash(v){return crypto.createHash("sha256").update(String(v)).digest("hex")}
function passwordHash(p){const s=crypto.randomBytes(16),k=crypto.scryptSync(p,s,64);return s.toString("hex")+":"+k.toString("hex")}
function passwordVerify(p,stored){try{const[s,k]=String(stored).split(":");const got=crypto.scryptSync(p,Buffer.from(s,"hex"),64);return crypto.timingSafeEqual(got,Buffer.from(k,"hex"))}catch{return false}}
function json(res,status,data,headers={}){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers});res.end(JSON.stringify(data))}
function cookie(req,name){return(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||null}
function userFrom(req){const raw=cookie(req,"sifistk_session");if(!raw)return null;const s=db.sessions.find(x=>x.tokenHash===hash(raw)&&x.expiresAt>Date.now());return s?db.users.find(u=>u.id===s.userId)||null:null}
function extensionFrom(req){const h=String(req.headers.authorization||"");if(!h.startsWith("Bearer "))return null;const raw=h.slice(7).trim();if(!raw)return null;const t=db.extensionTokens.find(x=>x.tokenHash===hash(raw)&&x.expiresAt>Date.now());return t?db.users.find(u=>u.id===t.userId)||null:null}
function session(res,userId){const raw=crypto.randomBytes(32).toString("base64url");db.sessions.push({id:id("ses"),userId,tokenHash:hash(raw),expiresAt:Date.now()+7*864e5});db.sessions=db.sessions.filter(s=>s.expiresAt>Date.now());save();res.setHeader("Set-Cookie",`sifistk_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`)}
async function body(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>1e6)throw Object.assign(Error("Payload too large"),{status:413})}try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(Error("JSON inválido"),{status:400})}}
function audit(action,userId=null,meta={}){db.audit.push({id:id("aud"),action,userId,at:Date.now(),meta});db.audit=db.audit.slice(-5000);save()}
function consumeInvite(raw){if(!raw)return null;const i=db.invites.findIndex(x=>x.tokenHash===hash(raw)&&!x.usedAt&&x.expiresAt>Date.now());if(i<0)return null;const inv=db.invites[i];inv.usedAt=Date.now();save();return inv}
function publicUser(u){return u&&{id:u.id,name:u.name,email:u.email,verified:!!u.verified,role:u.role||"USER"}}
function extensionSession(userId){const raw=crypto.randomBytes(32).toString("base64url");db.extensionTokens=db.extensionTokens.filter(x=>x.expiresAt>Date.now());db.extensionTokens.push({id:id("ext"),userId,tokenHash:hash(raw),createdAt:Date.now(),expiresAt:Date.now()+30*864e5});save();return raw}
function licenseFor(userId){return db.licenses.find(x=>x.userId===userId&&!x.revokedAt)||null}
function publicLicense(l){return l?{id:l.id,keyMasked:l.key.slice(0,4)+"••••"+l.key.slice(-4),status:l.revokedAt?"revoked":(l.expiresAt&&l.expiresAt<Date.now()?"expired":l.status||"active"),expiresAt:l.expiresAt||null}:null}
function extHeaders(){return {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type, Authorization","access-control-max-age":"600"}}

async function route(req,res){
 const url=new URL(req.url||"/",ORIGIN),p=url.pathname;
 if(req.method==="OPTIONS"&&p.startsWith("/api/extension/"))return json(res,204,{},extHeaders());
 if(req.method==="GET"&&p==="/api/health")return json(res,200,{ok:true,service:"sifistk",version:VERSION});
 if(req.method==="GET"&&p==="/api/config")return json(res,200,{version:VERSION,inviteRequired:INVITE_REQUIRED,portal:"/app/"});
 if(req.method==="POST"&&p==="/api/invites/validate"){const b=await body(req),t=String(b.token||"");const valid=!!db.invites.find(x=>x.tokenHash===hash(t)&&!x.usedAt&&x.expiresAt>Date.now());return json(res,valid?200:400,valid?{valid:true}:{valid:false,error:"Convite inválido, expirado ou já utilizado."})}
 if(req.method==="POST"&&p==="/api/auth/register"){const b=await body(req),name=String(b.name||"").trim(),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||""),inviteToken=String(b.invite||"");if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return json(res,400,{error:"Nome, e-mail válido e senha de pelo menos 8 caracteres são obrigatórios."});if(db.users.some(u=>u.email===email))return json(res,409,{error:"E-mail já cadastrado."});let invite=null;if(INVITE_REQUIRED){invite=consumeInvite(inviteToken);if(!invite)return json(res,403,{error:"É necessário um convite válido para criar uma conta."})}const user={id:id("usr"),name,email,password:passwordHash(password),verified:true,role:"USER",createdAt:Date.now(),inviteId:invite?.id||null};db.users.push(user);save();audit("REGISTER",user.id,{invited:!!invite});session(res,user.id);return json(res,201,{user:publicUser(user)})}
 if(req.method==="POST"&&p==="/api/auth/login"){const b=await body(req),user=db.users.find(u=>u.email===String(b.email||"").trim().toLowerCase());if(!user||!passwordVerify(String(b.password||""),user.password))return json(res,401,{error:"E-mail ou senha inválidos."});session(res,user.id);audit("LOGIN",user.id);return json(res,200,{user:publicUser(user)})}
 if(req.method==="POST"&&p==="/api/auth/logout"){const raw=cookie(req,"sifistk_session");if(raw){db.sessions=db.sessions.filter(s=>s.tokenHash!==hash(raw));save()}res.setHeader("Set-Cookie","sifistk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");return json(res,200,{ok:true})}
 if(req.method==="GET"&&p==="/api/me")return json(res,200,{user:publicUser(userFrom(req))});
 if(req.method==="POST"&&p==="/api/admin/bootstrap"){const key=req.headers["x-sifistk-admin-key"];if(!process.env.SIFISTK_ADMIN_KEY||key!==process.env.SIFISTK_ADMIN_KEY)return json(res,403,{error:"Acesso negado."});if(db.users.some(u=>u.role==="SUPER_ADMIN"))return json(res,409,{error:"Administrador inicial já configurado."});const b=await body(req),name=String(b.name||"Sifistk").trim(),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return json(res,400,{error:"E-mail válido e senha de pelo menos 12 caracteres são obrigatórios."});const user={id:id("usr"),name,email,password:passwordHash(password),verified:true,role:"SUPER_ADMIN",createdAt:Date.now()};db.users.push(user);save();audit("ADMIN_BOOTSTRAP",user.id);return json(res,201,{user:publicUser(user)})}
 if(req.method==="POST"&&p==="/api/admin/invites"){const admin=userFrom(req);if(!admin||admin.role!=="SUPER_ADMIN")return json(res,403,{error:"Acesso negado."});const raw=crypto.randomBytes(18).toString("base64url"),inv={id:id("inv"),tokenHash:hash(raw),createdAt:Date.now(),expiresAt:Date.now()+INVITE_MINUTES*60000,usedAt:null};db.invites.push(inv);save();audit("INVITE_CREATED",admin.id,{inviteId:inv.id});return json(res,201,{invite:raw,expiresAt:inv.expiresAt,url:`${ORIGIN}/?invite=${encodeURIComponent(raw)}`})}
 if(req.method==="GET"&&p==="/api/admin/audit"){const admin=userFrom(req);if(!admin||admin.role!=="SUPER_ADMIN")return json(res,403,{error:"Acesso negado."});return json(res,200,{audit:db.audit.slice(-500).reverse()})}
 if(req.method==="GET"&&p==="/api/extension/health")return json(res,200,{ok:true,service:"sifistk-extension-api",version:VERSION},extHeaders());
 if(req.method==="GET"&&p==="/api/extension/version")return json(res,200,{latestVersion:VERSION,minVersion:"8.4.0",downloadUrl:EXTENSION_DOWNLOAD_URL},extHeaders());
 if(req.method==="POST"&&p==="/api/extension/login"){const b=await body(req),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||""),user=db.users.find(u=>u.email===email);if(!user||!passwordVerify(password,user.password))return json(res,401,{error:"E-mail ou senha inválidos."},extHeaders());const token=extensionSession(user.id);audit("EXTENSION_LOGIN",user.id);return json(res,200,{token,user:publicUser(user),license:publicLicense(licenseFor(user.id))},extHeaders());}
 if(req.method==="POST"&&p==="/api/extension/logout"){const raw=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");if(raw){db.extensionTokens=db.extensionTokens.filter(x=>x.tokenHash!==hash(raw));save();}return json(res,200,{ok:true},extHeaders());}
 if(req.method==="GET"&&p==="/api/extension/me"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Sessão da extensão inválida ou expirada."},extHeaders());return json(res,200,{user:publicUser(user),license:publicLicense(licenseFor(user.id))},extHeaders());}
 if(req.method==="GET"&&p==="/api/extension/license"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());return json(res,200,{license:publicLicense(licenseFor(user.id))},extHeaders());}
 if(req.method==="POST"&&p==="/api/extension/report"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());const b=await body(req);if(!b.report||typeof b.report!=="object")return json(res,400,{error:"Relatório inválido."},extHeaders());const rec={id:id("rep"),userId:user.id,createdAt:Date.now(),report:b.report};db.reports.push(rec);db.reports=db.reports.slice(-500);save();audit("EXTENSION_REPORT",user.id,{reportId:rec.id});return json(res,201,{id:rec.id},extHeaders());}
 if(req.method==="GET"&&p==="/api/extension/reports"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());return json(res,200,{reports:db.reports.filter(x=>x.userId===user.id).slice(-50).reverse()},extHeaders());}
 if(req.method==="POST"&&p==="/api/extension/heartbeat"){const user=extensionFrom(req);if(!user)return json(res,401,{error:"Autenticação necessária."},extHeaders());const b=await body(req);audit("EXTENSION_HEARTBEAT",user.id,{installId:String(b.installId||"").slice(0,120),version:String(b.version||"").slice(0,30)});return json(res,200,{ok:true,at:Date.now(),license:publicLicense(licenseFor(user.id))},extHeaders());}
 if(req.method==="POST"&&p==="/api/admin/license"){const admin=userFrom(req);if(!admin||admin.role!=="SUPER_ADMIN")return json(res,403,{error:"Acesso negado."});const b=await body(req),email=String(b.email||"").trim().toLowerCase(),expiresAt=b.expiresAt?Number(b.expiresAt):null,user=db.users.find(u=>u.email===email);if(!user)return json(res,404,{error:"Usuário não encontrado."});const key="SIF-"+crypto.randomBytes(10).toString("hex").toUpperCase(),license={id:id("lic"),userId:user.id,key,status:"active",createdAt:Date.now(),expiresAt};db.licenses=db.licenses.filter(x=>x.userId!==user.id);db.licenses.push(license);save();audit("LICENSE_CREATED",admin.id,{userId:user.id,licenseId:license.id});return json(res,201,{license:{id:license.id,key,status:license.status,expiresAt}},extHeaders());}
 if(req.method==="GET")return serveStatic(res,p);
 return json(res,404,{error:"Not found"});
}
function serveStatic(res,pathname){
 let relative=pathname==="/"?"index.html":pathname.replace(/^\/+/,"");
 if(relative.includes("..")||relative.startsWith("backend")||relative.startsWith("data-store"))return json(res,404,{error:"Not found"});
 let file=path.resolve(WEB,relative);
 if(!file.startsWith(path.resolve(WEB)+path.sep))return json(res,404,{error:"Not found"});
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,"index.html");
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:"Not found"});
 const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon",".txt":"text/plain; charset=utf-8"};
 res.writeHead(200,{"content-type":types[path.extname(file)]||"application/octet-stream","x-content-type-options":"nosniff","content-security-policy":"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});fs.createReadStream(file).pipe(res)
}
http.createServer((req,res)=>route(req,res).catch(err=>{console.error(err);json(res,err.status||500,{error:err.status?err.message:"Erro interno."})})).listen(PORT,HOST,()=>console.log(`Sifistk server: ${ORIGIN}`));