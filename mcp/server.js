#!/usr/bin/env node
"use strict";
// MCP server (stdio) của Trạm Orbit — cho agent đọc lệnh, báo xong, nhắn đồng đội, báo cáo về đài chỉ huy.
// Cài cho Claude Code:  claude mcp add --scope user orbit -- node "<đường dẫn>/mcp/server.js"
const fs = require("fs");
const path = require("path");
const http = require("http");
const { loadConfig } = require("../lib/config");
const { t } = require("../lib/i18n");
const { Inbox, formatOrders } = require("../lib/inbox");

const CFG = loadConfig();
const inbox = new Inbox(CFG.dataDir);
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

// ---------- phiên nào đang gọi? ----------
function selfSession(arg) {
  if (arg && /^[0-9a-f]{8}/i.test(arg)) return String(arg);
  // 1) Claude Code ghi ~/.claude/sessions/<pid>.json cho phiên đang mở (nếu có)
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CFG.claudeDir, "sessions", `${process.ppid}.json`), "utf8"));
    if (d.sessionId) return d.sessionId;
  } catch {}
  // 2) nhật ký vừa ghi gần nhất trong thư mục dự án hiện tại
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dir = path.join(CFG.claudeDir, "projects", path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-"));
  try {
    const best = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0];
    if (best) return best.f.slice(0, -6);
  } catch {}
  return null;
}

function station() {
  return new Promise((ok) => {
    const req = http.get({ host: "127.0.0.1", port: CFG.port, path: "/api/state", timeout: 1500, headers: { Host: `127.0.0.1:${CFG.port}` } }, (res) => {
      let b = ""; res.setEncoding("utf8"); res.on("data", (c) => (b += c)); res.on("end", () => { try { ok(JSON.parse(b)); } catch { ok(null); } });
    });
    req.on("error", () => ok(null)); req.on("timeout", () => { req.destroy(); ok(null); });
  });
}

const TOOLS = [
  { name: "orbit_inbox", description: "Read orders/messages that Orbit Station (the commander or a crewmate) sent to this session. Call it when starting or finishing a task.",
    inputSchema: { type: "object", properties: { session: { type: "string", description: "Session id (first 8 characters); only needed if the station picks the wrong session" } } } },
  { name: "orbit_done", description: "Report an order from the station as done, with a one-line result.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Order id, like m-xxxx" }, note: { type: "string", description: "One-line result" } }, required: ["id", "note"] } },
  { name: "orbit_send", description: "Message or hand a task to another astronaut on the station (by call sign, e.g. ORION, or the first 8 characters of its session id).",
    inputSchema: { type: "object", properties: { to: { type: "string" }, text: { type: "string" }, session: { type: "string" } }, required: ["to", "text"] } },
  { name: "orbit_report", description: "Send a short report to the bridge (progress, blocked, decision needed).",
    inputSchema: { type: "object", properties: { text: { type: "string" }, session: { type: "string" } }, required: ["text"] } },
  { name: "orbit_crew", description: "List the crew on the station and each one's status.", inputSchema: { type: "object", properties: {} } },
];

async function call(name, a) {
  a = a || {};
  if (name === "orbit_inbox") {
    const me = selfSession(a.session);
    if (!me) return t("mcp.noSession");
    const open = inbox.openFor(me);
    const fresh = open.filter((m) => m.status === "pending");
    if (fresh.length) inbox.markDelivered(fresh.map((m) => m.id), "mcp");
    if (!open.length) return t("mcp.empty", { s: me.slice(0, 8) });
    return formatOrders(open, CFG.commander);
  }
  if (name === "orbit_done") {
    const m = inbox.read().msgs.get(String(a.id || ""));
    if (!m) return t("mcp.noOrder", { id: a.id });
    inbox.markDone(m.id, a.note || t("note.done"), "mcp");
    return t("mcp.marked", { id: m.id });
  }
  if (name === "orbit_send") {
    const me = selfSession(a.session);
    const st = await station();
    if (!st) return t("mcp.offline");
    const key = String(a.to || "").trim().toLowerCase();
    const to = st.agents.find((x) => x.name.toLowerCase() === key || x.id.toLowerCase().startsWith(key.slice(0, 8)));
    if (!to) return t("mcp.noRecipient", { n: a.to, list: st.agents.map((x) => x.name).join(", ") });
    const meA = st.agents.find((x) => me && x.id === me);
    const id = inbox.send({ from: { kind: "agent", id: me || "?", name: meA ? meA.name : "?" }, to: { id: to.id, name: to.name }, text: String(a.text || "") });
    return t("mcp.sent", { id, n: to.name });
  }
  if (name === "orbit_report") {
    const me = selfSession(a.session);
    inbox.report({ kind: "agent", id: me || "?" }, a.text || "");
    return t("mcp.reported");
  }
  if (name === "orbit_crew") {
    const st = await station();
    if (!st) return t("mcp.offline");
    return st.agents.map((x) => `${x.name} (${x.short}) · ${x.project}${x.branch ? "@" + x.branch : ""} · ${t("st." + x.status)}${x.tool ? " · " + x.tool.name : ""}`).join("\n") || t("mcp.emptyStation");
  }
  throw new Error(t("mcp.noTool", { n: name }));
}

function reply(id, result, error) {
  const m = error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
  process.stdout.write(JSON.stringify(m) + "\n");
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (line) { inflight++; handle(line).finally(() => { inflight--; if (ended && !inflight) process.exit(0); }); }
  }
});
let inflight = 0, ended = false;
process.stdin.on("end", () => { ended = true; if (!inflight) process.exit(0); });

async function handle(line) {
  let m; try { m = JSON.parse(line); } catch { return reply(null, null, { code: -32700, message: "Parse error" }); }
  const { id, method, params } = m;
  if (id === undefined || id === null) return; // thông báo, không cần trả lời
  try {
    if (method === "initialize") {
      const v = params && SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0];
      return reply(id, { protocolVersion: v, capabilities: { tools: {} }, serverInfo: { name: "claude-agents-orbit-station-view", version: "1.0.0" },
        instructions: "Orbit Station: call orbit_inbox to read orders from the commander, orbit_done when finished, orbit_send to message a crewmate." });
    }
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method === "tools/call") {
      const text = await call(params.name, params.arguments);
      return reply(id, { content: [{ type: "text", text }] });
    }
    if (method === "resources/list") return reply(id, { resources: [] });
    if (method === "prompts/list") return reply(id, { prompts: [] });
    reply(id, null, { code: -32601, message: "Method not found: " + method });
  } catch (e) {
    if (method === "tools/call") return reply(id, { content: [{ type: "text", text: t("mcp.error", { e: e.message }) }], isError: true });
    reply(id, null, { code: -32603, message: e.message });
  }
}
