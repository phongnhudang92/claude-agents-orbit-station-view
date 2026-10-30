"use strict";
// Theo dõi các phiên Claude Code trên máy: đọc nhật ký ~/.claude/projects/<dự án>/<phiên>.jsonl (chỉ đọc),
// cộng thêm tín hiệu tức thời từ hooks (nếu đã cài). Mỗi phiên = một robot trên trạm.
const fs = require("fs");
const path = require("path");
const { mask, clip, stripTags, oneLine, base, toolSummary, prettyTool, dayKey, hash } = require("./util");
const { BgTracker } = require("./bgtasks");
const { emptyWork, addWork, applyPlan, workSummary } = require("./turnwork");
const { emptyReplies, pushReply } = require("./replies");

const CALLSIGNS = ["ORION", "VEGA", "LYRA", "NOVA", "ATLAS", "IRIS", "KEPLER", "RIGEL", "ALTAIR", "CASSINI", "DRACO", "ELARA",
  "HALO", "JUNO", "LUNA", "MIRA", "PULSAR", "QUASAR", "SOLARIS", "TITAN", "ZENITH", "CYGNUS", "PHOEBE", "SIRIUS"];
const FIRST_READ = 6_000_000;
const MAX_READ = 12_000_000;
const NOT_HUMAN = /^(This session is being continued|Caveat:|\[Request interrupted|📡 TRẠM ORBIT|📡 ORBIT STATION|Stop hook feedback|<)/;
const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);
const ASK_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);
const WORK_EVENTS = new Set(["UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStop", "PreCompact"]);

const encDir = (p) => path.resolve(p).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

function safeStat(p) { try { return fs.statSync(p); } catch { return null; } }
function readRange(p, start, end) {
  const fd = fs.openSync(p, "r");
  try { const buf = Buffer.alloc(Math.max(0, end - start)); fs.readSync(fd, buf, 0, buf.length, start); return buf; }
  finally { fs.closeSync(fd); }
}

class Tracker {
  constructor(cfg) {
    this.cfg = cfg;
    this.agents = new Map(); // sessionId -> agent
    this.events = [];
    this.evSeq = 0;
    this.evKeys = new Set();
    this.hooksLastAt = 0;
    this.slots = new Map(); // sessionId -> chỗ ngồi cố định trên vành trạm
    this.hidden = new Set((cfg.hide || []).map((s) => String(s).toLowerCase()));
    this.commanderAt = 0;
  }

  // ---------- tìm phiên ----------
  dirInScope(d) {
    if (!this.cfg.projects.length) return true;
    const x = d.toLowerCase();
    return this.cfg.projects.some((p) => { const e = encDir(p); return x === e || x.startsWith(e + "-"); });
  }
  isHidden(id, name) {
    const s = String(id).toLowerCase();
    return [...this.hidden].some((h) => s.startsWith(h) || (name && String(name).toLowerCase() === h));
  }

  discover() {
    const now = Date.now(), keep = this.cfg.keepHours * 3600e3;
    const pdir = path.join(this.cfg.claudeDir, "projects");
    let dirs = [];
    try { dirs = fs.readdirSync(pdir, { withFileTypes: true }).filter((e) => e.isDirectory() && this.dirInScope(e.name)).map((e) => e.name); } catch {}
    for (const d of dirs) {
      let files = [];
      try { files = fs.readdirSync(path.join(pdir, d)).filter((x) => x.endsWith(".jsonl")); } catch { continue; }
      for (const x of files) {
        const id = x.slice(0, -6);
        if (this.agents.has(id) || this.isHidden(id)) continue;
        const f = path.join(pdir, d, x), st = safeStat(f);
        if (!st || now - st.mtimeMs > keep) continue;
        this.addAgent(id, f, d).mtime = st.mtimeMs;
      }
    }
    // cho rời trạm: im quá lâu, hoặc đã kết thúc phiên quá 10 phút
    for (const [id, a] of this.agents) {
      const last = Math.max(a.lastActivity || 0, a.mtime || 0, a.hook ? a.hook.t : 0);
      if (now - last > keep || (a.ended && now - a.ended > 10 * 60e3)) { this.agents.delete(id); this.slots.delete(id); }
    }
  }

  addAgent(id, file, dirName) {
    const a = {
      id, short: id.slice(0, 8), file, dirName, offset: 0, size: 0, mtime: 0,
      cwd: "", branch: "", model: "", version: "", customTitle: "", aiTitle: "",
      lastActivity: 0, startedAt: 0, lastPrompt: "", promptAt: 0, lastText: "", lastTextAt: 0, endAt: 0,
      turnOpen: false, pending: new Map(), tool: null, toolFeed: [], ask: null, hook: null, ended: 0,
      plan: [], work: emptyWork(), turnStart: 0, replies: emptyReplies(),
      seenMsg: new Set(), seenEnd: new Set(), days: {}, subs: new Map(), bg: new BgTracker(), mins: new Map(), reportedCost: null, sideAt: 0, subagents: 0,
    };
    a.hue = hash(id) % 360;
    this.agents.set(id, a);
    this.assignSlot(id);
    return a;
  }

  assignSlot(id) {
    if (this.slots.has(id)) return;
    const used = new Set(this.slots.values());
    let s = 0; while (used.has(s)) s++;
    this.slots.set(id, s);
  }

  // ---------- đọc nhật ký ----------
  pollAll() { const now = Date.now(); for (const a of this.agents.values()) { try { this.poll(a); a.bg.prune(now, this.cfg.keepHours * 3600e3); } catch {} } }

  // đọc phần mới của một file jsonl (lần đầu chỉ đọc phần cuối)
  readNew(o, file, onLine) {
    const st = safeStat(file); if (!st) return null;
    o.mtime = st.mtimeMs;
    if (st.size === o.size) return st;
    if (st.size < o.offset) o.offset = 0;
    let start = o.offset || Math.max(0, st.size - FIRST_READ);
    if (st.size - start > MAX_READ) start = st.size - MAX_READ;
    const jumped = start !== o.offset;
    const buf = readRange(file, start, st.size);
    const skip = jumped && start > 0 ? buf.indexOf(10) + 1 : 0;
    const lastNl = buf.lastIndexOf(10);
    if (lastNl < skip) return st;
    o.offset = start + lastNl + 1; o.size = st.size;
    for (const line of buf.slice(skip, lastNl).toString("utf8").split("\n")) {
      if (!line) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      onLine(j);
    }
    return st;
  }

  poll(a) {
    const st = this.readNew(a, a.file, (j) => this.parse(a, j));
    if (st && !a.startedAt) a.startedAt = st.birthtimeMs || st.ctimeMs;
    this.pollSubagents(a);
  }

  // ---------- subagent (drone) ----------
  // Claude Code ghi mỗi subagent vào <phiên>/subagents/agent-<id>.jsonl, kèm agent-<id>.meta.json (loại, mô tả, xong chưa).
  pollSubagents(a) {
    const dir = path.join(path.dirname(a.file), a.id, "subagents");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^agent-.+\.jsonl$/.test(f)); } catch {}
    const now = Date.now(), keep = this.cfg.keepHours * 3600e3;
    for (const f of files) {
      const sid = f.slice(6, -6);
      let sub = a.subs.get(sid);
      if (!sub) {
        const st = safeStat(path.join(dir, f));
        if (!st || now - st.mtimeMs > keep) continue;
        sub = { id: sid, file: path.join(dir, f), metaFile: path.join(dir, `agent-${sid}.meta.json`), offset: 0, size: 0, mtime: 0, metaM: 0,
          type: "", description: "", model: "", depth: 1, background: false, finished: false, failed: false, prompt: "",
          startedAt: 0, lastActivity: 0, endedAt: 0, tool: null, pending: new Map(), tools: 0, errors: 0, lastText: "", seenMsg: new Set(),
          tokens: 0, cost: 0, hue: hash(sid) % 360, announced: false, landed: false };
        a.subs.set(sid, sub);
      }
      const mst = safeStat(sub.metaFile);
      if (mst && mst.mtimeMs !== sub.metaM) {
        sub.metaM = mst.mtimeMs;
        try {
          const m = JSON.parse(fs.readFileSync(sub.metaFile, "utf8"));
          sub.type = m.agentType || sub.type; sub.description = m.description || sub.description; sub.model = m.model || sub.model;
          sub.depth = m.spawnDepth || 1; sub.background = m.requestShape === "background"; sub.toolUseId = m.toolUseId;
          if (m.finished && !sub.finished) { sub.finished = true; sub.endedAt = sub.endedAt || mst.mtimeMs; }
        } catch {}
      }
      this.readNew(sub, sub.file, (j) => this.parseSub(a, sub, j));
      if (!sub.startedAt) sub.startedAt = sub.mtime;
      // im quá 10 phút mà chưa báo xong: coi như đã dừng
      if (!sub.finished && now - Math.max(sub.lastActivity, sub.mtime) > 10 * 60e3) { sub.finished = true; sub.endedAt = Math.max(sub.lastActivity, sub.mtime); sub.stale = true; }
      const fresh = now - sub.startedAt < 2 * 60e3;
      if (!sub.announced) {
        sub.announced = true;
        if (fresh && !sub.finished) this.pushEvent({ t: sub.startedAt, kind: "spawn", from: a.id, to: "sub:" + sid, text: `${sub.type || "subagent"}: ${sub.description || clip(sub.prompt, 80)}` });
        else if (sub.finished) sub.landed = true;
      }
      if (sub.finished && !sub.landed) {
        sub.landed = true;
        this.pushEvent({ t: sub.endedAt || now, kind: "subdone", from: "sub:" + sid, to: a.id, text: `${sub.type || "subagent"} xong: ${oneLine(sub.lastText).slice(0, 140) || sub.description}` });
      }
    }
    for (const [sid, sub] of a.subs) if (now - Math.max(sub.lastActivity, sub.mtime) > keep) a.subs.delete(sid);
    let running = 0; for (const sub of a.subs.values()) if (!sub.finished) running++;
    // bản Claude Code cũ không có thư mục subagents: đếm Task chưa trả kết quả / dòng sidechain
    let legacy = 0; for (const p of a.pending.values()) if (SUBAGENT_TOOLS.has(p.name)) legacy++;
    if (now - a.sideAt < 90e3) legacy = Math.max(legacy, 1);
    a.subagents = Math.min(8, Math.max(running, a.subs.size ? 0 : legacy));
  }

  parseSub(a, sub, j) {
    const t = Date.parse(j.timestamp || "") || 0;
    const msg = j.message || {};
    if (t) { sub.lastActivity = Math.max(sub.lastActivity, t); if (!sub.startedAt || t < sub.startedAt) sub.startedAt = t; }
    if (j.type === "user") {
      if (typeof msg.content === "string" && !sub.prompt) sub.prompt = clip(oneLine(mask(stripTags(msg.content))), 300);
      if (Array.isArray(msg.content)) for (const x of msg.content) {
        if (!x || x.type !== "tool_result") continue;
        sub.pending.delete(x.tool_use_id);
        if (x.is_error) { sub.errors++; this.bucket(a, t).errors++; }
      }
      if (!sub.pending.size) sub.tool = null;
      return;
    }
    if (j.type !== "assistant") return;
    if (msg.model && msg.model !== "<synthetic>") sub.model = msg.model;
    const c0 = this.addUsage(a, msg, t, sub.seenMsg);
    if (c0) { sub.tokens += c0.tokens; sub.cost += c0.cost; }
    for (const c of Array.isArray(msg.content) ? msg.content : []) {
      if (c.type === "text" && c.text && c.text.trim()) { sub.lastTextFull = mask(c.text.trim()).slice(0, 30000); sub.lastText = clip(sub.lastTextFull, 600); }
      else if (c.type === "tool_use") {
        const summary = toolSummary(c.name, c.input);
        sub.pending.set(c.id, 1); sub.tool = { name: prettyTool(c.name), summary, t }; sub.tools++;
        this.bucket(a, t).tools++;
      }
    }
    if (msg.stop_reason === "end_turn") { sub.tool = null; sub.endTurnAt = t; }
  }

  // cộng token + chi phí của một tin trả lời vào ngày tương ứng (không đếm trùng các dòng cùng message.id)
  addUsage(a, msg, t, seen) {
    const id = msg.id;
    if (!msg.usage || !id || seen.has(id)) return null;
    seen.add(id);
    if (seen.size > 20000) { const keepIds = [...seen].slice(-5000); seen.clear(); for (const x of keepIds) seen.add(x); }
    const u = msg.usage, b = this.bucket(a, t), p = this.price(msg.model);
    const cw = u.cache_creation_input_tokens || 0;
    const cw1h = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
    const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + cw;
    const cost = ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out + (u.cache_read_input_tokens || 0) * p.in * 0.1
      + (cw - cw1h) * p.in * 1.25 + cw1h * p.in * 2) / 1e6;
    b.in += u.input_tokens || 0; b.out += u.output_tokens || 0; b.cr += u.cache_read_input_tokens || 0; b.cw += cw; b.cost += cost;
    return { tokens, cost };
  }

  bucket(a, t) {
    const k = dayKey(t || Date.now());
    return (a.days[k] ||= { in: 0, out: 0, cr: 0, cw: 0, cost: 0, tools: 0, errors: 0, turns: 0 });
  }
  price(model) {
    const P = this.cfg.prices, m = String(model || "").toLowerCase();
    for (const k of Object.keys(P)) if (k !== "default" && m.includes(k)) return P[k];
    return P.default;
  }

  parse(a, j) {
    const t = Date.parse(j.timestamp || "") || 0;
    if (j.cwd) a.cwd = j.cwd;
    if (j.gitBranch && j.gitBranch !== "HEAD") a.branch = j.gitBranch;
    if (j.version) a.version = j.version;
    // thông báo lệnh nền xong (có thể nằm ở nhiều loại bản ghi)
    const texts = [];
    if (typeof j.content === "string") texts.push(j.content);
    const mc = j.message && j.message.content;
    if (typeof mc === "string") texts.push(mc); else if (Array.isArray(mc)) for (const c of mc) if (c && c.type === "text") texts.push(c.text);
    if (j.attachment && typeof j.attachment === "object") for (const k of ["content", "prompt", "text"]) if (typeof j.attachment[k] === "string") texts.push(j.attachment[k]);
    for (const s of texts) a.bg.scanText(s, t, this.bgEvents(a));
    switch (j.type) {
      case "custom-title": if (j.customTitle) a.customTitle = String(j.customTitle); return;
      case "ai-title": if (j.aiTitle) a.aiTitle = String(j.aiTitle); return;
      case "summary": if (j.summary && !a.aiTitle) a.aiTitle = String(j.summary); return;
      case "cost-state": if (typeof j.totalCostUSD === "number") a.reportedCost = j.totalCostUSD; return;
      case "assistant": return this.onAssistant(a, j, t);
      case "user": return this.onUser(a, j, t);
    }
  }

  touch(a, t) {
    if (!t) return;
    if (t > a.lastActivity) a.lastActivity = t;
    if (!a.startedAt || t < a.startedAt) a.startedAt = t;
    const m = Math.floor(t / 60e3);
    a.mins.set(m, (a.mins.get(m) || 0) + 1);
    if (a.mins.size > 300) { const cut = Math.floor(Date.now() / 60e3) - 180; for (const k of a.mins.keys()) if (k < cut) a.mins.delete(k); }
  }

  onAssistant(a, j, t) {
    const msg = j.message || {};
    const side = !!j.isSidechain;
    this.touch(a, t);
    if (msg.model && msg.model !== "<synthetic>") a.model = msg.model;
    const id = msg.id || j.uuid;
    this.addUsage(a, { ...msg, id }, t, a.seenMsg);
    if (side) { a.sideAt = Math.max(a.sideAt, t); return; }
    for (const c of Array.isArray(msg.content) ? msg.content : []) {
      if (c.type === "text" && c.text && c.text.trim()) {
        a.lastTextFull = mask(c.text.trim()).slice(0, 30000); a.lastText = clip(a.lastTextFull, 1200); a.lastTextAt = t;
        a.replies = pushReply(a.replies, a.lastTextFull, t);
      } else if (c.type === "tool_use") {
        const name = c.name || "?", summary = toolSummary(name, c.input);
        a.pending.set(c.id, { name, summary, t });
        a.bg.onToolUse(c, t);
        a.plan = applyPlan(a.plan, name, c.input);
        a.work = addWork(a.work, name, c.input);
        a.tool = { name: prettyTool(name), raw: name, summary, t };
        a.toolFeed.push({ t, name: prettyTool(name), summary, err: false, id: c.id });
        if (a.toolFeed.length > 40) a.toolFeed.splice(0, a.toolFeed.length - 40);
        this.bucket(a, t).tools++;
        a.turnOpen = true;
        if (ASK_TOOLS.has(name)) {
          let q = name === "ExitPlanMode" ? "@plan" : summary || "@question";
          a.ask = { id: c.id, t, text: clip(q, 200) };
          this.pushEvent({ t, kind: "ask", from: a.id, to: "commander", text: a.ask.text });
        }
      }
    }
    if (msg.stop_reason === "end_turn" || msg.stop_reason === "stop_sequence") {
      a.turnOpen = false; a.endAt = Math.max(a.endAt, t); a.tool = null;
      if (id && !a.seenEnd.has(id)) { a.seenEnd.add(id); this.bucket(a, t).turns++; }
      // chỉ báo "trả lời" ở dòng có chữ, để không lấy nhầm câu của lượt trước
      const hasText = Array.isArray(msg.content) && msg.content.some((c) => c.type === "text" && c.text && c.text.trim());
      if (hasText) this.pushEvent({ t, kind: "reply", from: a.id, to: "commander", text: oneLine(a.lastText).slice(0, 180) });
    } else if (msg.stop_reason === "tool_use") a.turnOpen = true;
  }

  onUser(a, j, t) {
    const msg = j.message || {}, content = msg.content;
    if (j.isSidechain) { a.sideAt = Math.max(a.sideAt, t); return; }
    this.touch(a, t);
    if (Array.isArray(content)) {
      let hadResult = false;
      for (const x of content) {
        if (!x || x.type !== "tool_result") continue;
        hadResult = true;
        a.bg.onToolResult(x, j, t, this.bgEvents(a));
        a.pending.delete(x.tool_use_id);
        const f = a.toolFeed.find((r) => r.id === x.tool_use_id);
        if (x.is_error) { this.bucket(a, t).errors++; if (f) f.err = true; }
        if (a.ask && x.tool_use_id === a.ask.id) a.ask = null;
      }
      if (hadResult) { a.turnOpen = true; return; }
    }
    if (j.isMeta) return;
    let txt = typeof content === "string" ? content : Array.isArray(content) ? content.filter((x) => x && x.type === "text").map((x) => x.text).join("\n") : "";
    if (/^\s*\[Request interrupted/.test(txt)) { a.turnOpen = false; a.tool = null; a.pending.clear(); return; }
    // thông báo của hệ thống (lệnh nền xong, subagent xong…) không phải lệnh của bạn
    if (/<task-notification>|<local-command-|<bash-notification>|<command-message>/.test(txt) && !/<command-name>/.test(txt)) return;
    txt = stripTags(txt);
    if (!txt) return;
    if (/^📡 (TRẠM ORBIT|ORBIT STATION)/.test(txt)) { a.lastPromptFull = mask(txt).slice(0, 30000); a.lastPrompt = clip(a.lastPromptFull, 600); a.promptAt = t; a.turnOpen = true; a.ask = null; a.work = emptyWork(); a.turnStart = t; return; }
    if (NOT_HUMAN.test(txt)) return;
    a.lastPromptFull = mask(txt).slice(0, 30000); a.lastPrompt = clip(a.lastPromptFull, 600); a.promptAt = t; a.turnOpen = true; a.ask = null;
    a.work = emptyWork(); a.turnStart = t;
    if (t > this.commanderAt) { this.commanderAt = t; this.commanderLast = { to: a.id, text: clip(oneLine(mask(txt)), 160), t }; }
    this.pushEvent({ t, kind: "prompt", from: "commander", to: a.id, text: clip(oneLine(mask(txt)), 200) });
  }

  // biến sự kiện lệnh nền thành tín hiệu liên lạc
  bgEvents(a) {
    return { push: (e) => {
      const x = e.task, label = x.description || clip(oneLine(x.command), 80) || x.id;
      if (e.kind === "bgstart") this.pushEvent({ t: x.startedAt, kind: "bgstart", from: a.id, to: a.id, text: label, params: { how: x.how } });
      else this.pushEvent({ t: x.endedAt, kind: "bgdone", from: a.id, to: a.id, text: label, params: { status: x.status, exitCode: x.exitCode } });
    } };
  }

  // ---------- hooks (tức thời) ----------
  onHook(p) {
    const id = String(p.session_id || "");
    if (!/^[0-9a-f-]{8,}$/i.test(id)) return;
    let a = this.agents.get(id);
    if (!a) {
      const f = String(p.transcript_path || "");
      if (!f.endsWith(".jsonl") || !path.resolve(f).startsWith(path.join(this.cfg.claudeDir, "projects")) || !this.dirInScope(path.basename(path.dirname(f)))) return;
      if (this.isHidden(id)) return;
      a = this.addAgent(id, f, path.basename(path.dirname(f)));
      a.startedAt = Date.now();
    }
    const now = Date.now();
    this.hooksLastAt = now;
    const ev = String(p.event || "");
    // tín hiệu từ bên trong một subagent: cập nhật drone, giữ nguyên trạng thái của robot mẹ
    if (p.agent_id) {
      const sub = a.subs.get(String(p.agent_id));
      if (sub && ev === "PreToolUse" && p.tool) sub.tool = { name: prettyTool(p.tool), summary: clip(mask(p.summary || ""), 90), t: now };
      if (sub) sub.lastActivity = now;
      return;
    }
    const h = { event: ev, t: now, tool: p.tool ? prettyTool(p.tool) : "", summary: clip(mask(p.summary || ""), 90), message: clip(mask(p.message || ""), 200) };
    if (ev === "Notification") {
      h.waiting = /waiting for your input|đang chờ/i.test(p.message || "") || p.notification_type === "idle_prompt";
      if (!h.waiting) this.pushEvent({ t: now, kind: "ask", from: a.id, to: "commander", text: h.message || "@confirm" });
    }
    if (ev === "PreToolUse" && h.tool) a.tool = { name: h.tool, raw: p.tool, summary: h.summary, t: now };
    if (ev === "Stop") { a.tool = null; }
    if (ev === "StandbyStart") { h.until = now + (Number(p.message) || 30) * 60e3; a.tool = null; }
    if (ev === "SessionEnd") { a.ended = now; a.bg.endAll(now); }
    if (ev === "SessionStart") a.ended = 0;
    if (p.cwd) a.cwd = a.cwd || p.cwd;
    a.hook = h;
  }

  // ---------- trạng thái ----------
  status(a, now) {
    const last = Math.max(a.lastActivity || 0, a.startedAt || 0);
    const h = a.hook;
    if (a.ended && a.ended >= last) return "offline";
    if (a.ask) return "ask";
    if (h && h.t >= last - 1500) {
      if (h.event === "Notification") return h.waiting ? (now - h.t < 20 * 60e3 ? "done" : "idle") : "ask";
      if (WORK_EVENTS.has(h.event) && now - h.t < 15 * 60e3) return "working";
      if (h.event === "StandbyStart" && now < h.until) return "standby";
      if (h.event === "Stop" || h.event === "SessionStart" || h.event === "StandbyEnd" || h.event === "StandbyStart") return now - h.t < 20 * 60e3 ? "done" : "idle";
    }
    if (!a.turnOpen && /\[(CHẶN|BLOCKED)\]/i.test(a.lastText.slice(-400))) return "blocked";
    if (a.turnOpen && now - last < 10 * 60e3) return "working";
    if (now - last < 20 * 60e3) return "done";
    return "idle";
  }

  callsign(a, taken) {
    const o = (this.cfg.crew || []).find((c) => c.match && (a.id.startsWith(c.match) || (a.customTitle && a.customTitle.toLowerCase().includes(String(c.match).toLowerCase()))));
    if (o && o.name) return { name: o.name, role: o.role || "" };
    if (a.customTitle) return { name: clip(a.customTitle, 28), role: (o && o.role) || "" };
    let i = hash(a.id) % CALLSIGNS.length, n = 0;
    while (taken.has(CALLSIGNS[i]) && n++ < CALLSIGNS.length) i = (i + 1) % CALLSIGNS.length;
    return { name: CALLSIGNS[i], role: (o && o.role) || "" };
  }

  // ---------- sự kiện liên lạc ----------
  pushEvent(e) {
    const key = `${e.kind}|${e.from}|${e.to}|${String(e.text).slice(0, 60)}|${e.params ? JSON.stringify(e.params) : ""}|${Math.floor((e.t || 0) / 5000)}`;
    if (this.evKeys.has(key)) return;
    this.evKeys.add(key); if (this.evKeys.size > 5000) this.evKeys = new Set([...this.evKeys].slice(-2000));
    const ev = { id: ++this.evSeq, t: e.t || Date.now(), kind: e.kind, from: e.from, to: e.to, text: e.text || "", ...(e.params ? { params: e.params } : {}) };
    this.events.push(ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  snapshot() {
    const now = Date.now(), today = dayKey(now), taken = new Set();
    const minuteNow = Math.floor(now / 60e3);
    const list = [...this.agents.values()].sort((x, y) => (this.slots.get(x.id) ?? 99) - (this.slots.get(y.id) ?? 99));
    const agents = list.map((a) => {
      const cs = this.callsign(a, taken); taken.add(cs.name);
      const d = a.days[today] || { in: 0, out: 0, cr: 0, cw: 0, cost: 0, tools: 0, errors: 0, turns: 0 };
      const activity = []; for (let i = 59; i >= 0; i--) activity.push(a.mins.get(minuteNow - i) || 0);
      const status = this.status(a, now);
      const tool = status === "working" && a.tool ? a.tool : null;
      return {
        id: a.id, short: a.short, slot: this.slots.get(a.id) ?? 0, hue: a.hue,
        name: cs.name, role: cs.role, title: clip(a.customTitle && cs.name !== a.customTitle ? a.customTitle : a.aiTitle || "", 80),
        project: base(a.cwd) || a.dirName.split("-").filter(Boolean).pop() || "?", cwd: a.cwd, branch: a.branch, model: a.model, version: a.version,
        status, tool, ask: a.ask ? a.ask.text : (status === "ask" && a.hook ? a.hook.message : null),
        lastPrompt: a.lastPrompt, promptAt: a.promptAt, lastText: a.lastText, lastTextAt: a.lastTextAt,
        lastActivity: Math.max(a.lastActivity, a.hook ? a.hook.t : 0), startedAt: a.startedAt,
        subagents: a.subagents, subs: this.subList(a, now), bg: a.bg.list(now), toolFeed: a.toolFeed.slice(-14).map(({ id, ...r }) => r),
        today: { tokens: d.in + d.out + d.cr + d.cw, in: d.in, out: d.out, cacheRead: d.cr, cacheWrite: d.cw, cost: +d.cost.toFixed(4), tools: d.tools, errors: d.errors, turns: d.turns },
        replyCount: a.replies.list.length, replySeq: a.replies.seq,
        plan: a.plan, work: workSummary(a.work), turnStart: a.turnStart, turnEnd: a.turnOpen ? 0 : a.endAt,
        sessionCost: a.reportedCost, activity, viaHooks: !!a.hook, standbyUntil: status === "standby" ? a.hook.until : 0,
      };
    });
    return { agents, events: this.events.slice(-120), hooksLastAt: this.hooksLastAt, commanderLast: this.commanderLast || null };
  }

  subList(a, now) {
    return [...a.subs.values()]
      .filter((x) => !x.finished || now - (x.endedAt || x.lastActivity) < 20 * 60e3)
      .sort((x, y) => (x.finished - y.finished) || y.startedAt - x.startedAt)
      .slice(0, 10)
      .map((x) => ({ id: x.id, type: x.type || "subagent", description: x.description || clip(x.prompt, 80), model: x.model, depth: x.depth, background: x.background,
        status: x.finished ? (x.stale ? "stale" : x.errors && !x.lastText ? "failed" : "done") : "running",
        tool: x.finished ? null : x.tool, tools: x.tools, errors: x.errors, tokens: x.tokens, cost: +x.cost.toFixed(4),
        startedAt: x.startedAt, endedAt: x.endedAt || 0, lastActivity: x.lastActivity, lastText: clip(oneLine(x.lastText), 240), hue: x.hue }));
  }

  tick() { this.pollAll(); }
}

module.exports = { Tracker, CALLSIGNS };
