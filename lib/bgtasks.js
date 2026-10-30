"use strict";
// Lệnh chạy nền của một phiên Claude Code: Bash với run_in_background, lệnh quá giờ bị chuyển sang nền, hoặc bạn bấm Ctrl+B.
// Nguồn: tool_use (lệnh), tool_result (mã tác vụ + file đầu ra), <task-notification> (xong / lỗi / bị dừng).
// Đầu ra được Claude Code ghi vào file …/tasks/<mã>.output trên máy — trạm đọc vài dòng cuối để hiển thị.
const fs = require("fs");
const { mask, clip, oneLine } = require("./util");

const KILL_TOOLS = new Set(["KillShell", "KillBash", "TaskStop"]);
const OUTPUT_TOOLS = new Set(["BashOutput", "TaskOutput"]);
const NOTIF = /<task-notification>([\s\S]*?)<\/task-notification>/g;
const tag = (s, k) => { const m = s.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`)); return m ? m[1].trim() : ""; };
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

function resultText(x) {
  if (typeof x.content === "string") return x.content;
  if (Array.isArray(x.content)) return x.content.filter((c) => c && c.type === "text").map((c) => c.text).join("\n");
  return "";
}

class BgTracker {
  constructor() { this.tasks = new Map(); this.byToolUse = new Map(); this.tailCache = new Map(); }

  // từ tool_use của trợ lý
  onToolUse(c, t) {
    const inp = c.input || {};
    if (c.name === "Bash") this.byToolUse.set(c.id, { command: String(inp.command || ""), description: String(inp.description || ""), bg: inp.run_in_background === true, t });
    if (KILL_TOOLS.has(c.name)) this.byToolUse.set(c.id, { kill: String(inp.shell_id || inp.task_id || inp.bash_id || ""), t });
    if (OUTPUT_TOOLS.has(c.name)) this.byToolUse.set(c.id, { output: String(inp.bash_id || inp.task_id || inp.shell_id || ""), t });
    if (this.byToolUse.size > 500) this.byToolUse.delete(this.byToolUse.keys().next().value);
  }

  // từ tool_result; j = cả bản ghi (có toolUseResult)
  onToolResult(x, j, t, events) {
    const u = this.byToolUse.get(x.tool_use_id);
    const r = j.toolUseResult && typeof j.toolUseResult === "object" ? j.toolUseResult : {};
    const text = resultText(x);
    if (u && u.kill !== undefined) {
      const task = this.tasks.get(u.kill);
      if (task && !x.is_error && task.status === "running") { task.status = "killed"; task.endedAt = t; events.push({ kind: "bgdone", task }); }
      return;
    }
    if (u && u.output !== undefined) {
      const task = this.tasks.get(u.output);
      const st = String(r.status || (text.match(/<status>(\w+)<\/status>/) || [])[1] || "");
      const code = r.exitCode != null ? Number(r.exitCode) : (text.match(/<exit_code>(-?\d+)<\/exit_code>/) || [])[1];
      if (task && /completed|failed|killed/.test(st)) this.finish(task, st, code != null ? Number(code) : null, t, events);
      return;
    }
    let id = r.backgroundTaskId ? String(r.backgroundTaskId) : "";
    if (!id) { const m = text.match(/(?:running in background with ID:|moved to the background \(ID:|backgrounded by user with ID:)\s*([A-Za-z0-9_-]+)/); if (m) id = m[1]; }
    if (!id || !u) return;
    const pm = text.match(/Output is being written to:\s*(\S+?)\.?(?:\s|$)/);
    const how = /timeout and was moved/.test(text) ? "timeout" : /backgrounded by user/.test(text) ? "user" : "tool";
    if (!this.tasks.has(id)) {
      const task = { id, command: clip(mask(u.command), 300), description: clip(mask(u.description), 120), how, status: "running", exitCode: null,
        startedAt: u.t || t, endedAt: 0, outputPath: pm ? pm[1] : (r.backgroundOutputPath || ""), summary: "" };
      this.tasks.set(id, task);
      events.push({ kind: "bgstart", task });
    }
  }

  // <task-notification> có thể nằm trong tin người dùng, queue-operation hoặc attachment
  scanText(s, t, events) {
    if (!s || s.indexOf("<task-notification>") < 0) return;
    for (const m of s.matchAll(NOTIF)) {
      const body = m[1], id = tag(body, "task-id"), status = tag(body, "status"), summary = tag(body, "summary");
      if (!id || !/^Background (shell )?command/i.test(summary) && !this.tasks.has(id)) continue;
      let task = this.tasks.get(id);
      if (!task) {
        const d = (summary.match(/Background (?:shell )?command "([\s\S]*?)"/) || [])[1] || id;
        task = { id, command: "", description: clip(mask(d), 120), how: "tool", status: "running", exitCode: null, startedAt: t, endedAt: 0, outputPath: tag(body, "output-file"), summary: "" };
        this.tasks.set(id, task);
      }
      if (!task.outputPath) task.outputPath = tag(body, "output-file");
      const code = (summary.match(/exit code (-?\d+)/) || [])[1];
      task.summary = clip(oneLine(mask(summary)), 200);
      this.finish(task, status, code != null ? Number(code) : null, t, events);
    }
  }

  finish(task, status, code, t, events) {
    if (task.status !== "running") return;
    const st = String(status || "").toLowerCase();
    task.status = /stop/.test(st) ? "stopped" : /kill/.test(st) ? "killed" : /fail|error/.test(st) || (code != null && code !== 0) ? "failed" : "done";
    task.exitCode = code != null && !isNaN(code) ? code : null;
    task.endedAt = t || Date.now();
    events.push({ kind: "bgdone", task });
  }

  // phiên đã kết thúc: lệnh nền của nó cũng dừng
  endAll(t) { for (const task of this.tasks.values()) if (task.status === "running") { task.status = "stopped"; task.endedAt = t; } }

  // đọc vài dòng cuối của file đầu ra (chỉ file .output trong thư mục tasks do Claude Code tạo)
  tail(task) {
    const p = task.outputPath;
    if (!p || !/[\\/]tasks[\\/][^\\/]+\.output$/.test(p)) return null;
    let st; try { st = fs.statSync(p); } catch { return null; }
    const c = this.tailCache.get(p);
    if (c && c.m === st.mtimeMs && c.s === st.size) return c.v;
    let text = "";
    try {
      const n = Math.min(st.size, 6000), fd = fs.openSync(p, "r");
      try { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); text = b.toString("utf8"); } finally { fs.closeSync(fd); }
    } catch { return null; }
    const lines = text.replace(ANSI, "").replace(/\r(?!\n)/g, "\n").split("\n").map((l) => l.trimEnd()).filter(Boolean);
    const v = { lines: lines.slice(-14).map((l) => clip(mask(l), 220)), size: st.size, at: st.mtimeMs };
    this.tailCache.set(p, { m: st.mtimeMs, s: st.size, v });
    return v;
  }

  list(now) {
    return [...this.tasks.values()]
      .filter((x) => x.status === "running" || now - x.endedAt < 30 * 60e3)
      .sort((a, b) => (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1) || b.startedAt - a.startedAt)
      .slice(0, 12)
      .map((x) => { const tl = this.tail(x); return { ...x, tail: tl ? tl.lines : [], outputSize: tl ? tl.size : 0, outputAt: tl ? tl.at : 0 }; });
  }

  prune(now, keepMs) { for (const [id, x] of this.tasks) if (x.status !== "running" && now - x.endedAt > keepMs) this.tasks.delete(id); }
}

module.exports = { BgTracker };
