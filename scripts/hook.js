#!/usr/bin/env node
"use strict";
// Hook của Claude Code cho Trạm Orbit (cài bằng: npm run hooks:install).
// - Gửi tín hiệu tức thời (đang chạy công cụ gì, xong lượt, cần xác nhận…) tới máy chủ trạm ở 127.0.0.1.
// - Giao lệnh từ trạm: Stop → bắt agent làm tiếp lệnh mới; UserPromptSubmit/SessionStart → kèm lệnh vào ngữ cảnh.
// - "Trực lệnh": nếu phiên được bật trên trạm, khi xong lượt hook Stop chờ lệnh (tối đa N phút) thay vì dừng ngay.
//   Bạn gõ vào phiên trong lúc chờ → hook nhường ngay (thấy tin xếp hàng trong nhật ký phiên).
// Luôn thoát mã 0 và không bao giờ làm hỏng phiên Claude Code, kể cả khi trạm không chạy.
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const done = () => process.exit(0);
let guard = setTimeout(done, 4000); guard.unref();

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { raw += c; if (raw.length > 5e6) done(); });
process.stdin.on("end", () => main().catch(done));

let port = 7799, commander = "Chỉ huy", secret = "";
try { const { loadConfig } = require("../lib/config"); const c = loadConfig(); port = c.port; commander = c.commander; } catch {}
try { secret = fs.readFileSync(path.join(DATA, ".hook-secret"), "utf8").trim(); } catch {}

function signal(body) {
  if (!secret) return Promise.resolve();
  const s = JSON.stringify(body);
  return new Promise((ok) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/hook", method: "POST", timeout: 600,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s), "X-Orbit-Hook": secret, Host: `127.0.0.1:${port}` } }, (res) => { res.resume(); res.on("end", ok); });
    req.on("error", ok); req.on("timeout", () => { req.destroy(); ok(); });
    req.end(s);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// bạn vừa gõ vào phiên? (Claude Code ghi tin xếp hàng / tin người dùng vào nhật ký phiên)
function userTyped(file, from) {
  let st; try { st = fs.statSync(file); } catch { return { typed: false, size: from }; }
  if (st.size <= from) return { typed: false, size: from };
  const n = Math.min(st.size - from, 2e6), fd = fs.openSync(file, "r");
  let text = "";
  try { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); text = b.toString("utf8"); } finally { fs.closeSync(fd); }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.type === "queue-operation" && j.operation === "enqueue") return { typed: true, size: st.size };
    if (j.type === "user" && !j.isMeta && !j.isSidechain) {
      const c = j.message && j.message.content;
      const isResult = Array.isArray(c) && c.some((x) => x && x.type === "tool_result");
      if (!isResult) return { typed: true, size: st.size };
    }
  }
  return { typed: false, size: st.size };
}

async function main() {
  let p; try { p = JSON.parse(raw); } catch { return done(); }
  const ev = p.hook_event_name || "";
  const base = { session_id: p.session_id, transcript_path: p.transcript_path, cwd: p.cwd };
  let out = null;
  const { Inbox, formatOrders } = require("../lib/inbox");
  const ib = new Inbox(DATA);

  // 1) Giao lệnh đang chờ cho đúng phiên này
  try {
    if ((ev === "Stop" || ev === "UserPromptSubmit" || ev === "SessionStart") && p.session_id) {
      const msgs = ib.pendingFor(p.session_id);
      if (msgs.length) {
        ib.markDelivered(msgs.map((m) => m.id), "hook:" + ev);
        const text = formatOrders(msgs, commander);
        out = ev === "Stop" ? { decision: "block", reason: text } : { hookSpecificOutput: { hookEventName: ev, additionalContext: text } };
      }
    }
  } catch {}

  // 2) Báo tín hiệu cho trạm (rút gọn, không gửi nội dung công cụ)
  try {
    const { toolSummary } = require("../lib/util");
    await signal({ ...base, event: ev, tool: p.tool_name || "", summary: p.tool_name ? toolSummary(p.tool_name, p.tool_input) : "",
      message: p.message || "", notification_type: p.notification_type || "", agent_id: p.agent_id || "", agent_type: p.agent_type || "" });
  } catch {}

  // 3) Trực lệnh: xong lượt mà chưa có lệnh → chờ lệnh từ trạm
  if (ev === "Stop" && !out && p.session_id) {
    let sb = null;
    try { const { Standby } = require("../lib/standby"); const S = new Standby(DATA); sb = S.get(p.session_id); var standby = S; } catch {}
    if (sb) {
      clearTimeout(guard);
      const until = Date.now() + sb.minutes * 60e3;
      let end = "timeout";
      const finish = async (why) => { await signal({ ...base, event: "StandbyEnd", message: why }); };
      process.on("SIGTERM", () => { signal({ ...base, event: "StandbyEnd", message: "interrupted" }).finally(done); setTimeout(done, 500); });
      process.on("SIGINT", () => { signal({ ...base, event: "StandbyEnd", message: "interrupted" }).finally(done); setTimeout(done, 500); });
      await signal({ ...base, event: "StandbyStart", message: String(sb.minutes) });
      let size = 0; try { size = fs.statSync(p.transcript_path).size; } catch {}
      let tick = 0;
      while (Date.now() < until) {
        await sleep(1500);
        try {
          const msgs = ib.pendingFor(p.session_id);
          if (msgs.length) {
            ib.markDelivered(msgs.map((m) => m.id), "hook:standby");
            out = { decision: "block", reason: formatOrders(msgs, commander) };
            end = "order"; break;
          }
        } catch {}
        const u = userTyped(p.transcript_path, size); size = u.size;
        if (u.typed) { end = "user"; break; }
        if (++tick % 4 === 0) { try { if (!standby.get(p.session_id)) { end = "off"; break; } } catch {} }
      }
      await finish(end);
    }
  }

  if (out) process.stdout.write(JSON.stringify(out));
  done();
}
