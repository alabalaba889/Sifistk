import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, "..", "web");
const STORE = process.env.SIFISTK_STORE_PATH || path.join(ROOT, "data-store.json");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const ORIGIN = (process.env.SIFISTK_PUBLIC_ORIGIN || `http://${HOST}:${PORT}`).replace(/\/$/, "");
const INVITE_REQUIRED = process.env.SIFISTK_INVITE_REQUIRED !== "false";
const INVITE_MINUTES = Number(process.env.SIFISTK_INVITE_MINUTES || 60);

const empty = { users: [], sessions: [], invites: [], audit: [] };
function load() {
  try { return { ...empty, ...JSON.parse(fs.readFileSync(STORE, "utf8")) }; }
  catch { return structuredClone(empty); }
}
let db = load();
for (const key of Object.keys(empty)) if (!Array.isArray(db[key])) db[key] = [];

function save() {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(db, null, 2), { mode: 0o600 });
}
function id(prefix) { return prefix + "_" + crypto.randomBytes(12).toString("hex"); }
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return salt.toString("hex") + ":" + key.toString("hex");
}
function passwordVerify(password, stored) {
  try {
    const [salt, key] = String(stored).split(":");
    const got = crypto.scryptSync(password, Buffer.from(salt, "hex"), 64);
    return crypto.timingSafeEqual(got, Buffer.from(key, "hex"));
  } catch { return false; }
}
function json(res, status, data, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  });
  res.end(JSON.stringify(data));
}
function cookie(req, name) {
  return (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(name + "="))?.slice(name.length + 1) || null;
}
function userFrom(req) {
  const raw = cookie(req, "sifistk_session");
  if (!raw) return null;
  const session = db.sessions.find(s => s.tokenHash === hash(raw) && s.expiresAt > Date.now());
  return session ? db.users.find(u => u.id === session.userId) || null : null;
}
function session(res, userId) {
  const raw = crypto.randomBytes(32).toString("base64url");
  db.sessions.push({ id: id("ses"), userId, tokenHash: hash(raw), expiresAt: Date.now() + 7 * 864e5 });
  db.sessions = db.sessions.filter(s => s.expiresAt > Date.now());
  save();
  res.setHeader("Set-Cookie", `sifistk_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw Object.assign(new Error("Payload too large"), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); }
}
function audit(action, userId = null, meta = {}) {
  db.audit.push({ id: id("aud"), action, userId, at: Date.now(), meta });
  db.audit = db.audit.slice(-5000);
  save();
}
function inviteFrom(req) {
  const url = new URL(req.url, ORIGIN);
  return url.searchParams.get("invite") || req.headers["x-sifistk-invite"] || null;
}
function consumeInvite(raw) {
  if (!raw) return null;
  const index = db.invites.findIndex(x => x.tokenHash === hash(raw) && !x.usedAt && x.expiresAt > Date.now());
  if (index < 0) return null;
  const invite = db.invites[index];
  invite.usedAt = Date.now();
  save();
  return invite;
}
function publicUser(u) {
  return u && { id: u.id, name: u.name, email: u.email, verified: !!u.verified, role: u.role || "USER" };
}

async function route(req, res) {
  const url = new URL(req.url || "/", ORIGIN);
  const p = url.pathname;

  if (req.method === "GET" && p === "/api/health")
    return json(res, 200, { ok: true, service: "sifistk", version: "8.0.0" });

  if (req.method === "GET" && p === "/api/config")
    return json(res, 200, { version: "8.0.0", inviteRequired: INVITE_REQUIRED });

  if (req.method === "POST" && p === "/api/invites/validate") {
    const b = await body(req);
    const token = String(b.token || "");
    const valid = !!db.invites.find(x => x.tokenHash === hash(token) && !x.usedAt && x.expiresAt > Date.now());
    return json(res, valid ? 200 : 400, valid ? { valid: true } : { valid: false, error: "Convite inválido, expirado ou já utilizado." });
  }

  if (req.method === "POST" && p === "/api/auth/register") {
    const b = await body(req);
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    const inviteToken = String(b.invite || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
      return json(res, 400, { error: "Nome, e-mail válido e senha de pelo menos 8 caracteres são obrigatórios." });
    if (db.users.some(u => u.email === email)) return json(res, 409, { error: "E-mail já cadastrado." });

    let invite = null;
    if (INVITE_REQUIRED) {
      invite = consumeInvite(inviteToken);
      if (!invite) return json(res, 403, { error: "É necessário um convite válido para criar uma conta." });
    }
    const user = { id: id("usr"), name, email, password: passwordHash(password), verified: true, role: "USER", createdAt: Date.now(), inviteId: invite?.id || null };
    db.users.push(user);
    save();
    audit("REGISTER", user.id, { invited: !!invite });
    session(res, user.id);
    return json(res, 201, { user: publicUser(user) });
  }

  if (req.method === "POST" && p === "/api/auth/login") {
    const b = await body(req);
    const user = db.users.find(u => u.email === String(b.email || "").trim().toLowerCase());
    if (!user || !passwordVerify(String(b.password || ""), user.password))
      return json(res, 401, { error: "E-mail ou senha inválidos." });
    session(res, user.id);
    audit("LOGIN", user.id);
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST" && p === "/api/auth/logout") {
    const raw = cookie(req, "sifistk_session");
    if (raw) {
      db.sessions = db.sessions.filter(s => s.tokenHash !== hash(raw));
      save();
    }
    res.setHeader("Set-Cookie", "sifistk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && p === "/api/me") {
    return json(res, 200, { user: publicUser(userFrom(req)) });
  }

  if (req.method === "POST" && p === "/api/admin/bootstrap") {
    const key = req.headers["x-sifistk-admin-key"];
    if (!process.env.SIFISTK_ADMIN_KEY || key !== process.env.SIFISTK_ADMIN_KEY)
      return json(res, 403, { error: "Acesso negado." });
    if (db.users.some(u => u.role === "SUPER_ADMIN"))
      return json(res, 409, { error: "Administrador inicial já configurado." });
    const b = await body(req);
    const name = String(b.name || "Sifistk").trim();
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!email || !/^\\S+@\\S+\\.\\S+$/.test(email) || password.length < 12)
      return json(res, 400, { error: "E-mail válido e senha de pelo menos 12 caracteres são obrigatórios." });
    const user = { id: id("usr"), name, email, password: passwordHash(password), verified: true, role: "SUPER_ADMIN", createdAt: Date.now() };
    db.users.push(user);
    save();
    audit("ADMIN_BOOTSTRAP", user.id);
    return json(res, 201, { user: publicUser(user) });
  }

  if (req.method === "POST" && p === "/api/admin/invites") {
    const admin = userFrom(req);
    if (!admin || admin.role !== "SUPER_ADMIN") return json(res, 403, { error: "Acesso negado." });
    const raw = crypto.randomBytes(18).toString("base64url");
    const invite = { id: id("inv"), tokenHash: hash(raw), createdAt: Date.now(), expiresAt: Date.now() + INVITE_MINUTES * 60000, usedAt: null };
    db.invites.push(invite);
    save();
    audit("INVITE_CREATED", admin.id, { inviteId: invite.id });
    return json(res, 201, { invite: raw, expiresAt: invite.expiresAt, url: `${ORIGIN}/?invite=${encodeURIComponent(raw)}` });
  }

  if (req.method === "GET" && p === "/api/admin/audit") {
    const admin = userFrom(req);
    if (!admin || admin.role !== "SUPER_ADMIN") return json(res, 403, { error: "Acesso negado." });
    return json(res, 200, { audit: db.audit.slice(-500).reverse() });
  }

  if (req.method === "GET") return serveStatic(res, p, url.search);
  return json(res, 404, { error: "Not found" });
}

function serveStatic(res, pathname, search = "") {
  let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (relative.includes("..") || relative.startsWith("backend") || relative.startsWith("data-store"))
    return json(res, 404, { error: "Not found" });
  const file = path.resolve(WEB, relative);
  if (!file.startsWith(path.resolve(WEB) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    return json(res, 404, { error: "Not found" });
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
  res.writeHead(200, {
    "content-type": types[path.extname(file)] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => route(req, res).catch(err => {
  console.error(err);
  json(res, err.status || 500, { error: err.status ? err.message : "Erro interno." });
})).listen(PORT, HOST, () => console.log(`Sifistk server: ${ORIGIN}`));
