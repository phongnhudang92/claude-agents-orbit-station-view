"use strict";
// Hòm thư của trạm: data/inbox.jsonl, chỉ ghi nối thêm.
// Bản ghi: msg (tin/lệnh) · delivered (đã tới tay agent) · done (xong, kèm ghi chú) · report (agent tự báo cáo).
// Dùng chung cho máy chủ, hook của Claude Code và MCP server.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { tr, getLang, commanderName } = require("./i18n");

const same = (a, b) => !!a && !!b && String(a).slice(0, 8).toLowerCase() === String(b).slice(0, 8).toLowerCase();

class Inbox {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, "inbox.jsonl");
    this.sig = null;
    this.cache = { msgs: new Map(), reports: [], records: [] };
  }

  append(rec) {
    fs.mkdirSync(this.dir, { recursive: true });
    const line = JSON.stringify({ t: Date.now(), ...rec }) + "\n";
    fs.appendFileSync(this.file, line);
    this.sig = null;
  }

  read() {
    let st = null;
    try { st = fs.statSync(this.file); } catch {}
    const sig = st ? `${st.mtimeMs}:${st.size}` : "-";
    if (sig === this.sig) return this.cache;
    const msgs = new Map(), reports = [], records = [];
    if (st) {
      for (const l of fs.readFileSync(this.file, "utf8").split("\n")) {
        if (!l.trim()) continue;
        let r; try { r = JSON.parse(l); } catch { continue; }
        records.push(r);
        if (r.type === "msg") msgs.set(r.id, { ...r, status: "pending" });
        else if (r.type === "delivered") { const m = msgs.get(r.id); if (m && m.status === "pending") { m.status = "delivered"; m.deliveredAt = r.t; m.via = r.via; } }
        else if (r.type === "done") { const m = msgs.get(r.id); if (m && m.status !== "done" && m.status !== "cancelled") { m.status = r.cancelled ? "cancelled" : "done"; m.doneAt = r.t; m.note = r.note || ""; m.doneBy = r.by || ""; } }
        else if (r.type === "wakeinfo") { const m = msgs.get(r.id); if (m) { m.copy = r.copy || null; m.bgId = r.bgId || null; if (r.via) m.via = r.via; } }
        else if (r.type === "report") reports.push(r);
      }
    }
    this.sig = sig;
    this.cache = { msgs, reports, records };
    return this.cache;
  }

  send({ from, to, text, lang }) {
    const id = "m-" + Date.now().toString(36).slice(-5) + crypto.randomBytes(2).toString("hex");
    this.append({ type: "msg", id, from, to, text: String(text).slice(0, 4000), ...(lang ? { lang } : {}) });
    return id;
  }

  pendingFor(sessionId) {
    return [...this.read().msgs.values()].filter((m) => m.status === "pending" && m.to && same(m.to.id, sessionId));
  }
  openFor(sessionId) {
    return [...this.read().msgs.values()].filter((m) => (m.status === "pending" || m.status === "delivered") && m.to && same(m.to.id, sessionId));
  }
  markDelivered(ids, via) { for (const id of ids) this.append({ type: "delivered", id, via }); }
  markDone(id, note, by, cancelled = false) { this.append({ type: "done", id, note: String(note || "").slice(0, 30000), by, ...(cancelled ? { cancelled: true } : {}) }); }
  report(from, text) { this.append({ type: "report", id: "r-" + crypto.randomBytes(4).toString("hex"), from, text: String(text).slice(0, 1000) }); }
}

// Lời nhắn đưa vào ngữ cảnh của agent (qua hook Stop / UserPromptSubmit hoặc MCP).
// Ngôn ngữ: theo ngôn ngữ giao diện lúc gửi lệnh (m.lang), nếu không có thì theo máy chủ.
function formatOrders(msgs, commander) {
  const lang = (msgs.find((m) => m.lang) || {}).lang || getLang();
  const lines = msgs.map((m) => {
    const fromCmd = !m.from || m.from.kind !== "agent";
    const from = fromCmd ? commanderName((m.from && m.from.name) || commander, lang) : m.from.name;
    return `${tr(lang, "order.from", { id: m.id, from })}\n${m.text}`;
  });
  return `${tr(lang, "order.header", { n: msgs.length })}\n\n${lines.join("\n\n")}\n\n${tr(lang, "order.footer")}`;
}
// nhận ra lời nhắn của trạm trong nhật ký (cả hai ngôn ngữ)
const ORDER_PREFIX = /^📡 (TRẠM ORBIT|ORBIT STATION)\b/;

module.exports = { Inbox, formatOrders, same, ORDER_PREFIX };
