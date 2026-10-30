"use strict";
const { t, codedError } = require("./i18n");
// Đánh thức một phiên Claude Code đang rảnh để nó làm lệnh từ trạm ngay, không cần bạn gõ vào terminal.
//   Claude Code mới:  claude --bg --resume <phiên> "<lệnh>"   → chạy nền đúng phiên đó (xem bằng `claude attach`)
//   Claude Code cũ:   claude -p --resume <phiên> "<lệnh>"     → chạy không tương tác, ghi tiếp vào nhật ký phiên
// Không dùng shell: lệnh được truyền thẳng làm tham số, không thể chèn câu lệnh.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");

function candidates(cfg) {
  const home = os.homedir(), list = [];
  if (cfg.claudePath) list.push(cfg.claudePath);
  for (const d of String(process.env.PATH || "").split(path.delimiter)) if (d) list.push(path.join(d, "claude"));
  list.push(path.join(home, ".claude", "local", "claude"), path.join(home, ".local", "bin", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude", path.join(home, ".npm-global", "bin", "claude"));
  try { for (const v of fs.readdirSync(path.join(home, ".nvm", "versions", "node"))) list.push(path.join(home, ".nvm", "versions", "node", v, "bin", "claude")); } catch {}
  return [...new Set(list)];
}

class Waker {
  constructor(cfg) {
    this.cfg = cfg;
    this.info = { available: false, path: null, version: null, mode: null, error: t("err.findingClaude") };
    this.detect();
  }

  detect() {
    const found = candidates(this.cfg).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; } });
    if (!found) { this.info = { available: false, error: t("err.noClaude"), code: "noClaude" }; return; }
    execFile(found, ["--version"], { timeout: 8000 }, (e1, out1) => {
      execFile(found, ["--help"], { timeout: 8000, maxBuffer: 4e6 }, (e2, out2) => {
        if (e1 && e2) { this.info = { available: false, path: found, error: t("err.claudeBroken", { e: String((e1 || e2).message).slice(0, 120) }) }; return; }
        const help = String(out2 || "");
        this.info = { available: true, path: found, version: String(out1 || "").trim().split("\n")[0], mode: /--bg\b|--background\b/.test(help) ? "bg" : "print", error: null };
      });
    });
  }

  // chạy lệnh trong đúng thư mục và đúng phiên.
  // Nếu phiên gốc đang mở ở nơi khác (app/terminal), `claude --bg --resume` sẽ chạy một BẢN SAO cùng ngữ cảnh
  // và in "started a copy as <mã>" — trả mã đó về để trạm theo dõi bản sao và lấy kết quả.
  wake(agent, prompt, logFile) {
    if (!this.info.available) return Promise.reject(Object.assign(new Error(this.info.error || t("err.noClaude")), { code: this.info.code || "noClaude" }));
    if (!agent.cwd || !fs.existsSync(agent.cwd)) return Promise.reject(codedError("noCwd"));
    const bg = this.info.mode === "bg";
    const args = bg ? ["--bg", "--resume", agent.id, prompt] : ["-p", "--resume", agent.id, "--permission-mode", this.cfg.wakePermissionMode || "acceptEdits", prompt];
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `\n=== ${new Date().toISOString()} ${this.info.path} ${args.slice(0, -1).join(" ")} <order>\n`);
    if (!bg) {
      const out = fs.openSync(logFile, "a");
      const child = spawn(this.info.path, args, { cwd: agent.cwd, detached: true, stdio: ["ignore", out, out], env: process.env });
      child.on("error", (e) => { try { fs.appendFileSync(logFile, "ERROR: " + e.message + "\n"); } catch {} });
      child.unref(); fs.closeSync(out);
      return Promise.resolve({ via: "wake:print", copy: null });
    }
    return new Promise((resolve, reject) => {
      let out = "", done = false;
      const child = spawn(this.info.path, args, { cwd: agent.cwd, detached: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
      const onData = (d) => { const t = d.toString(); out += t; try { fs.appendFileSync(logFile, t); } catch {} };
      child.stdout.on("data", onData); child.stderr.on("data", onData);
      const finish = (err) => {
        if (done) return; done = true;
        if (err) return reject(err);
        const copy = (out.match(/copy as ([0-9a-f]{6,})/i) || [])[1] || null;
        const bgId = (out.match(/backgrounded\s*·\s*([0-9a-z-]+)/i) || [])[1] || null;
        if (!copy && !bgId && /error|không|failed/i.test(out)) return reject(new Error(out.trim().split("\n").pop().slice(0, 200)));
        resolve({ via: copy ? "wake:copy" : "wake:bg", copy, bgId });
      };
      child.on("error", (e) => { try { fs.appendFileSync(logFile, "ERROR: " + e.message + "\n"); } catch {} finish(e); });
      child.on("exit", () => finish());
      setTimeout(() => { child.unref(); finish(); }, 15000);
    });
  }
}

module.exports = { Waker };
