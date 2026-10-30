#!/usr/bin/env node
"use strict";
// Trạm Orbit — máy chủ cục bộ. Chỉ nghe 127.0.0.1, không gửi dữ liệu ra ngoài, không cần thư viện ngoài.
//   node server.js          theo dõi các phiên Claude Code thật trên máy
//   node server.js --demo   chế độ trình diễn với phi hành đoàn giả lập
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { loadConfig } = require("./lib/config");
const { Inbox, formatOrders } = require("./lib/inbox");
const { Waker } = require("./lib/wake");
const { Standby } = require("./lib/standby");
const { Tracker } = require("./lib/claude");
const { launchSession } = require("./lib/launch");
const { MonthStats } = require("./lib/month");
const { pageReplies, findReply } = require("./lib/replies");
const { clip, oneLine, mask } = require("./lib/util");
const i18n = require("./lib/i18n");
const { t: T, codedError } = i18n;

let CFG;
try { CFG = loadConfig({ create: true }); } catch (e) { console.error(e.message); process.exit(1); }
const DEMO = process.argv.includes("--demo");
// tăng số này mỗi khi đổi giao diện/API: trang web so sánh để nhắc khởi động lại trạm khi máy chủ còn chạy bản cũ
const BUILD = "2026.10.30-7";
const PUBLIC = path.join(CFG.root, "public");
fs.mkdirSync(CFG.dataDir, { recursive: true });

const inbox = new Inbox(DEMO ? path.join(CFG.dataDir, "demo") : CFG.dataDir);
const tracker = DEMO ? new (require("./lib/demo").Demo)(CFG, inbox) : new Tracker(CFG);
// Đánh thức phiên bằng `claude --resume` đã TẮT mặc định (có thể tạo bản sao phiên). Bật lại bằng "wake": true trong config.json.
const WAKE = !DEMO && CFG.wake === true;
// luôn dò lệnh claude (để mở phiên mới từ giao diện); WAKE chỉ quyết định có đánh thức phiên rảnh hay không
const waker = DEMO ? null : new Waker(CFG);
const standby = new Standby(inbox.dir);
const month = DEMO ? null : new MonthStats(CFG);

// hooks đã được cài vào ~/.claude/settings.json chưa (đọc lại mỗi 10 giây)
let hooksCheck = { at: 0, installed: false, standbyReady: false };
function hooksInfo() {
  if (Date.now() - hooksCheck.at < 10000) return hooksCheck;
  let installed = false, standbyReady = false;
  for (const f of ["settings.json", "settings.local.json"]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(CFG.claudeDir, f), "utf8"));
      for (const [ev, groups] of Object.entries(j.hooks || {})) for (const g of groups || []) for (const h of g.hooks || []) {
        if (typeof h.command === "string" && /claude-agents-orbit-station-view-hook|tram-orbit-hook/.test(h.command)) { installed = true; if (ev === "Stop" && (h.timeout || 60) >= 600) standbyReady = true; }
      }
    } catch {}
  }
  hooksCheck = { at: Date.now(), installed, standbyReady };
  return hooksCheck;
}
const hooksInstalled = () => hooksInfo().installed;

// giao ngay các lệnh đang chờ của một phiên bằng cách đánh thức nó
async function wakeAgent(a) {
  const pending = inbox.pendingFor(a.id);
  if (!pending.length) throw codedError("noPending");
  if (!WAKE) throw codedError("wakeOff");
  const st = tracker.status(a, Date.now());
  if (st === "working") throw codedError("working");
  const ids = pending.map((m) => m.id);
  inbox.markDelivered(ids, "wake:start"); // giữ chỗ để hook không giao trùng
  try {
    const r = await waker.wake(a, formatOrders(pending, CFG.commander), path.join(CFG.dataDir, "wake.log"));
    for (const id of ids) inbox.append({ type: "wakeinfo", id, via: r.via, copy: r.copy || null, bgId: r.bgId || null });
    return r;
  } catch (e) {
    for (const id of ids) inbox.append({ type: "wakeinfo", id, via: "wake:failed" });
    for (const id of ids) inbox.markDone(id, T("note.wakeFailed", { e: e.message }), "wake");
    throw e;
  }
}

// bản sao chạy nền (khi phiên gốc đang mở ở nơi khác): mã bản sao → lệnh
function copyMap() {
  const map = new Map();
  for (const m of inbox.read().msgs.values()) if (m.copy) map.set(m.copy, m);
  return map;
}
// thư mục dự án gợi ý cho hộp "Phiên mới": thư mục của các phiên đã thấy + "projects" trong config, mới nhất trước
function knownFolders() {
  const seen = new Map();
  for (const a of tracker.agents.values()) if (a.cwd) seen.set(a.cwd, Math.max(seen.get(a.cwd) || 0, a.lastActivity || 0));
  for (const p of CFG.projects) if (!seen.has(p)) seen.set(p, 0);
  const isDir = (d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
  return [...seen].filter(([d]) => isDir(d)).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([p, at]) => ({ path: p, name: path.basename(p), at }));
}
const findAgent = (prefix) => tracker.agents.get(prefix) || [...tracker.agents.values()].find((x) => x.id.startsWith(String(prefix).slice(0, 8)));

// Mã bảo vệ: WEB_TOKEN chèn vào trang (trang lạ không đọc được) — mọi lệnh POST từ giao diện phải kèm.
// HOOK_SECRET nằm trong data/.hook-secret — chỉ hook chạy trên máy này đọc được.
const WEB_TOKEN = crypto.randomBytes(18).toString("hex");
const SECRET_FILE = path.join(CFG.dataDir, ".hook-secret");
let HOOK_SECRET;
try { HOOK_SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch {}
if (!HOOK_SECRET) { HOOK_SECRET = crypto.randomBytes(18).toString("hex"); fs.writeFileSync(SECRET_FILE, HOOK_SECRET, { mode: 0o600 }); }

// ---------- vòng lặp ----------
const seenInbox = new Set();
function syncInbox() {
  const { msgs, reports } = inbox.read();
  const nameOf = (id) => { const a = tracker.agents.get(id) || [...tracker.agents.values()].find((x) => x.id.startsWith(String(id).slice(0, 8))); return a ? a.id : id; };
  for (const m of msgs.values()) {
    const k = m.id + ":msg";
    if (!seenInbox.has(k)) {
      seenInbox.add(k);
      const fromCmd = !m.from || m.from.kind === "commander";
      tracker.pushEvent({ t: m.t, kind: fromCmd ? "order" : "msg", from: fromCmd ? "commander" : nameOf(m.from.id), to: nameOf(m.to.id), text: clip(oneLine(m.text), 200) });
    }
    if ((m.status === "done") && !seenInbox.has(m.id + ":done")) {
      seenInbox.add(m.id + ":done");
      tracker.pushEvent({ t: m.doneAt, kind: "done", from: nameOf(m.to.id), to: m.from && m.from.kind === "agent" ? nameOf(m.from.id) : "commander", text: clip(oneLine(m.note || T("note.done")), 200) });
    }
    // Lệnh đã giao qua hook mà agent đã kết thúc lượt sau đó → tự đóng, lấy câu trả lời cuối làm ghi chú.
    // Lệnh chạy trong bản sao: lấy kết quả từ bản sao, không phải phiên gốc.
    if (!DEMO && m.status === "delivered" && /^(hook|wake:bg|wake:print|wake:copy)/.test(m.via || "")) {
      const a = m.copy ? findAgent(m.copy) : findAgent(m.to.id);
      if (a && a.endAt > (m.deliveredAt || 0) + 500 && !a.turnOpen) inbox.markDone(m.id, a.lastTextFull || a.lastText || T("note.turnDone"), m.copy ? "copy" : "auto");
    }
  }
  for (const r of reports) {
    if (seenInbox.has(r.id)) continue;
    seenInbox.add(r.id);
    tracker.pushEvent({ t: r.t, kind: "report", from: nameOf(r.from && r.from.id), to: "commander", text: clip(oneLine(r.text), 200) });
  }
}

let discoverAt = 0;
function tick() {
  try {
    if (Date.now() - discoverAt > 4000) { tracker.discover(); discoverAt = Date.now(); }
    tracker.tick();
    syncInbox();
  } catch (e) { console.error("tick:", e.message); }
}

function snapshot() {
  const s = tracker.snapshot();
  const now = Date.now();
  const byId = new Map(s.agents.map((a) => [a.id, a]));
  const { msgs } = inbox.read();
  const orders = [...msgs.values()].slice(-60).reverse().map((m) => ({
    id: m.id, t: m.t, text: m.text, status: m.status, via: m.via || "", copy: m.copy || null, note: clip(m.note || "", 600), noteLong: (m.note || "").length > 600, doneAt: m.doneAt || 0, deliveredAt: m.deliveredAt || 0,
    from: m.from && m.from.kind === "agent" ? (byId.get(m.from.id) || {}).name || m.from.name : CFG.commander,
    fromAgent: m.from && m.from.kind === "agent" ? m.from.id : null,
    to: m.to.id, toName: (byId.get(m.to.id) || {}).name || m.to.name || m.to.id.slice(0, 8),
  }));
  for (const ag of s.agents) ag.standby = DEMO ? (ag.standby || null) : standby.get(ag.id);
  const copies = copyMap();
  for (const ag of s.agents) {
    for (const [prefix, m] of copies) if (ag.id.startsWith(prefix)) {
      const parent = byId.get(m.to.id);
      ag.copyOf = m.to.id; ag.copyOrder = m.id;
      ag.name = T("copy.name", { n: parent ? parent.name : m.to.name || T("session") });
      ag.title = T("copy.title", { t: clip(oneLine(m.text), 50), id: prefix });
    }
  }
  const tot = s.agents.reduce((o, a) => { o.tokens += a.today.tokens; o.cost += a.today.cost; o.tools += a.today.tools; o.errors += a.today.errors; return o; }, { tokens: 0, cost: 0, tools: 0, errors: 0 });
  const counts = { working: 0, ask: 0, done: 0, idle: 0, blocked: 0, offline: 0 };
  for (const a of s.agents) counts[a.status] = (counts[a.status] || 0) + 1;
  for (const a of s.agents) a.openOrders = orders.filter((o) => o.to === a.id && (o.status === "pending" || o.status === "delivered")).length;
  return {
    now, build: BUILD, demo: DEMO, title: CFG.title, subtitle: CFG.subtitle, commander: CFG.commander, commanderTitle: CFG.commanderTitle,
    budget: CFG.dailyBudgetUsd, projects: CFG.projects,
    hooks: { active: now - (s.hooksLastAt || 0) < 15 * 60e3, lastAt: s.hooksLastAt || 0, installed: DEMO || hooksInstalled(), standbyReady: DEMO || hooksInfo().standbyReady },
    wake: WAKE ? { available: waker.info.available, mode: waker.info.mode, version: waker.info.version, error: waker.info.error } : { available: false, disabled: true },
    launch: DEMO ? null : { claude: waker.info.available, bg: waker.info.mode === "bg", terminal: process.platform === "darwin", desktop: process.platform === "darwin" },
    hasMonth: !DEMO,
    counts, totals: { ...tot, cost: +tot.cost.toFixed(3) },
    agents: s.agents, events: s.events.slice().sort((x, y) => x.t - y.t || x.id - y.id), orders, commanderLast: s.commanderLast,
  };
}

// ---------- HTTP ----------
const ALLOWED_HOSTS = new Set([`127.0.0.1:${CFG.port}`, `localhost:${CFG.port}`, `[::1]:${CFG.port}`]);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" };

const err = (code) => ({ error: T("err." + code), code });
function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...SEC_HEADERS });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, max = 20000) {
  return new Promise((ok, bad) => {
    let b = ""; req.setEncoding("utf8");
    req.on("data", (c) => { b += c; if (b.length > max) { bad(new Error(T("err.tooLong"))); req.destroy(); } });
    req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch (e) { bad(e); } });
    req.on("error", bad);
  });
}
// Lệnh từ giao diện: phải đúng Host (chặn DNS rebinding), đúng Origin, đúng mã trang, và là JSON (buộc preflight CORS).
function uiAllowed(req) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, ""))) return false;
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) return false;
  const tok = String(req.headers["x-orbit-token"] || "");
  return tok.length === WEB_TOKEN.length && crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(WEB_TOKEN));
}

const sseClients = new Set();
setInterval(() => {
  tick();
  if (!sseClients.size) return;
  const d = "data: " + JSON.stringify(snapshot()) + "\n\n";
  for (const r of sseClients) r.write(d);
}, 1000);
setInterval(() => { for (const r of sseClients) r.write(": ping\n\n"); }, 20000);

let indexCache = null;
const server = http.createServer(async (req, res) => {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || ""))) return send(res, 421, { error: "Sai Host" });
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/state" && req.method === "GET") return send(res, 200, snapshot());
    if (p === "/api/events" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", ...SEC_HEADERS });
      res.write("retry: 2000\n\ndata: " + JSON.stringify(snapshot()) + "\n\n");
      sseClients.add(res); req.on("close", () => sseClients.delete(res));
      return;
    }
    // toàn văn một tin dài (lệnh, ghi chú kết quả, báo cáo, lời nhắn của subagent) để mở trong hộp đọc
    if (p === "/api/text" && req.method === "GET") {
      const kind = url.searchParams.get("kind"), id = String(url.searchParams.get("id") || "");
      if (kind === "order" || kind === "order-text") {
        const m = inbox.read().msgs.get(id); if (!m) return send(res, 404, err("notFound"));
        return send(res, 200, { text: kind === "order" ? m.note || "" : m.text || "", at: kind === "order" ? m.doneAt : m.t });
      }
      const a = tracker.agents.get(id); if (!a) return send(res, 404, err("notFound"));
      if (kind === "reply" && url.searchParams.has("sub")) {
        const r = findReply(a.replies, Number(url.searchParams.get("sub")));
        return r ? send(res, 200, { text: r.text, at: r.t }) : send(res, 404, err("notFound"));
      }
      if (kind === "reply") return send(res, 200, { text: a.lastTextFull || a.lastText || "", at: a.lastTextAt });
      if (kind === "prompt") return send(res, 200, { text: a.lastPromptFull || a.lastPrompt || "", at: a.promptAt });
      if (kind === "sub" && a.subs) { const x = a.subs.get(String(url.searchParams.get("sub") || "")); if (x) return send(res, 200, { text: x.lastTextFull || x.lastText || "", at: x.endedAt || x.lastActivity }); }
      return send(res, 404, err("notFound"));
    }
    // các reply trước của một phiên, phân trang theo seq (mới nhất trước)
    if (p === "/api/replies" && req.method === "GET") {
      const a = tracker.agents.get(String(url.searchParams.get("id") || ""));
      if (!a || !a.replies) return send(res, 404, err("notFound"));
      const before = Number(url.searchParams.get("before")) || a.replies.seq + 1;
      const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 8));
      return send(res, 200, pageReplies(a.replies, before, limit));
    }
    if (p === "/api/hook" && req.method === "POST") {
      const s = String(req.headers["x-orbit-hook"] || "");
      if (s.length !== HOOK_SECRET.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(HOOK_SECRET))) return send(res, 403, { error: T("err.hookSecret") });
      const b = await readBody(req);
      if (!DEMO) tracker.onHook(b);
      return send(res, 200, { ok: true });
    }
    if (p === "/api/send" && req.method === "POST") {
      if (!uiAllowed(req)) return send(res, 403, err("badRequest"));
      const b = await readBody(req);
      const a = tracker.agents.get(String(b.to || ""));
      const text = String(b.text || "").trim();
      if (!a) return send(res, 400, err("noAgent"));
      if (!text || text.length > 4000) return send(res, 400, err("emptyText"));
      const lang = i18n.LANGS.includes(b.lang) ? b.lang : undefined;
      const snapA = snapshot().agents.find((x) => x.id === a.id) || {};
      const id = inbox.send({ from: { kind: "commander", name: CFG.commander }, to: { id: a.id, name: snapA.name || a.short }, text, lang });
      let via = null, wakeError = null;
      let copy = null, wakeCode = null;
      if (b.wake) { try { const r = await wakeAgent(a); via = r.via; copy = r.copy || null; } catch (e) { wakeError = e.message; wakeCode = e.code || null; } }
      tick();
      return send(res, 200, { ok: true, id, via, copy, wakeError, wakeCode });
    }
    if (p === "/api/wake" && req.method === "POST") {
      if (!uiAllowed(req)) return send(res, 403, err("badRequest"));
      const b = await readBody(req);
      const a = tracker.agents.get(String(b.to || ""));
      if (!a) return send(res, 400, err("noAgent"));
      try { const r = await wakeAgent(a); tick(); return send(res, 200, { ok: true, via: r.via, copy: r.copy || null }); }
      catch (e) { return send(res, 400, { error: e.message, code: e.code }); }
    }
    if (p === "/api/month" && req.method === "GET") {
      if (!month) return send(res, 404, err("notFound"));
      return send(res, 200, month.summary(url.searchParams.get("range") === "month" ? "month" : "30"));
    }
    if (p === "/api/folders" && req.method === "GET") return send(res, 200, { folders: DEMO ? [] : knownFolders(), home: os.homedir() });
    if (p === "/api/launch" && req.method === "POST") {
      if (!uiAllowed(req)) return send(res, 403, err("badRequest"));
      if (DEMO) return send(res, 400, err("demoLaunch"));
      const b = await readBody(req);
      const prompt = String(b.prompt || "").trim();
      if (prompt.length > 4000) return send(res, 400, err("promptLong"));
      try {
        const r = await launchSession(waker.info, { mode: b.mode, cwd: b.cwd, prompt, logFile: path.join(CFG.dataDir, "launch.log") });
        tick();
        return send(res, 200, { ok: true, ...r });
      } catch (e) { return send(res, 400, { error: clip(mask(e.message), 200), code: e.code || null }); }
    }
    if (p === "/api/standby" && req.method === "POST") {
      if (!uiAllowed(req)) return send(res, 403, err("badRequest"));
      const b = await readBody(req);
      const a = tracker.agents.get(String(b.to || ""));
      if (!a) return send(res, 400, err("noAgent"));
      if (DEMO) { a.standby = b.on ? { on: true, minutes: Number(b.minutes) || 30 } : null; return send(res, 200, { ok: true }); }
      standby.set(a.id, !!b.on, b.minutes);
      return send(res, 200, { ok: true, standby: standby.get(a.id) });
    }
    if (p === "/api/cancel" && req.method === "POST") {
      if (!uiAllowed(req)) return send(res, 403, err("badRequest"));
      const b = await readBody(req);
      const m = inbox.read().msgs.get(String(b.id || ""));
      if (!m || m.status !== "pending") return send(res, 400, err("cancelPending"));
      inbox.markDone(m.id, T("note.cancelled"), "commander", true);
      return send(res, 200, { ok: true });
    }
    if (req.method !== "GET") return send(res, 405, { error: T("err.method") });
    if (p === "/" || p === "/index.html") {
      if (!indexCache || DEMO === false) indexCache = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
      return send(res, 200, indexCache.replace("__ORBIT_TOKEN__", WEB_TOKEN).replace("__ORBIT_LANG__", CFG.lang === "vi" || CFG.lang === "en" ? CFG.lang : ""), MIME[".html"]);
    }
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "", "text/plain");
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, T("err.notFound"), "text/plain; charset=utf-8");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": p.startsWith("/vendor/") ? "max-age=86400" : "no-cache", ...SEC_HEADERS });
      res.end(buf);
    });
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: clip(mask(e.message), 200) });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(T("con.portBusy", { p: CFG.port }));
  else console.error(e);
  process.exit(1);
});

tick();
if (month) month.start();
server.listen(CFG.port, CFG.host === "127.0.0.1" || CFG.host === "localhost" ? CFG.host : "127.0.0.1", () => {
  const n = tracker.agents.size;
  console.log(`\n  🛰  ${CFG.title === "Trạm Orbit" ? T("title") : CFG.title}${DEMO ? T("con.demo") : ""}`);
  console.log(`  ${T("con.open")} http://localhost:${CFG.port}`);
  if (!DEMO) {
    console.log(`  ${T("con.watch")} ${CFG.projects.length ? CFG.projects.join(", ") : T("con.all", { d: CFG.claudeDir })}`);
    console.log(`  ${T("con.crew")} ${T("con.crewN", { n, h: CFG.keepHours })}`);
  }
  console.log("");
});
