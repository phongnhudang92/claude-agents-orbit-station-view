"use strict";
// Mở một phiên Claude Code mới từ giao diện: cửa sổ Terminal (tương tác), app Claude desktop (deep link) hoặc chạy nền bằng `claude --bg`.
// Thư mục và lệnh đầu tiên chỉ đi qua argv, không qua shell; riêng dòng lệnh đưa cho Terminal thì được trích dẫn từng phần.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");
const { codedError } = require("./i18n");

const BG_WAIT_MS = 15000;
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function resolveDir(raw) {
  const s = String(raw || "").trim();
  if (!s || !(s.startsWith("~") || path.isAbsolute(s))) throw codedError("badDir");
  const dir = path.resolve(s.startsWith("~") ? path.join(os.homedir(), s.slice(1)) : s);
  let isDir = false;
  try { isDir = fs.statSync(dir).isDirectory(); } catch {}
  if (!isDir) throw codedError("badDir");
  return dir;
}

// AppleScript nhận dòng lệnh qua argv nên không có chuỗi nào được nối vào mã AppleScript.
function inTerminal(claude, dir, prompt) {
  if (process.platform !== "darwin") return Promise.reject(codedError("noTerminal"));
  const cmd = `cd ${shq(dir)} && exec ${shq(claude)}${prompt ? ` -- ${shq(prompt)}` : ""}`;
  const script = ["on run argv", 'tell application "Terminal"', "activate", "do script (item 1 of argv)", "end tell", "end run"];
  return new Promise((resolve, reject) => {
    execFile("osascript", [...script.flatMap((l) => ["-e", l]), cmd], { timeout: 15000 }, (e, _out, stderr) => {
      if (!e) return resolve({ via: "terminal" });
      // báo lỗi của osascript (vd. chưa cấp quyền Automation cho Terminal), không in lại cả dòng lệnh
      reject(new Error(String(stderr || "").trim().split("\n").pop() || (e.killed ? "osascript timeout" : e.message.split("\n")[0])));
    });
  });
}

// Mở màn hình "phiên mới" của app Claude desktop qua deep link; thư mục và lệnh được điền sẵn, bạn bấm gửi trong app.
function inDesktop(dir, prompt) {
  if (process.platform !== "darwin") return Promise.reject(codedError("noDesktop"));
  const q = new URLSearchParams({ folder: dir });
  if (prompt) q.set("q", prompt);
  return new Promise((resolve, reject) => {
    execFile("open", [`claude://code/new?${q}`], { timeout: 10000 }, (e, _out, stderr) => {
      if (e) return reject(new Error(String(stderr || "").trim().split("\n").pop() || e.message.split("\n")[0]));
      resolve({ via: "desktop" });
    });
  });
}

function inBackground(claude, dir, prompt, logFile) {
  return new Promise((resolve, reject) => {
    let out = "", done = false;
    const log = (s) => { try { fs.appendFileSync(logFile, s); } catch {} };
    log(`\n=== ${new Date().toISOString()} ${claude} --bg (${dir}) <prompt>\n`);
    const child = spawn(claude, ["--bg", "--", prompt], { cwd: dir, detached: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const finish = (err) => {
      if (done) return; done = true;
      if (err) return reject(err);
      resolve({ via: "bg", bgId: (out.match(/backgrounded\s*·\s*([0-9a-z-]+)/i) || [])[1] || null });
    };
    const onData = (d) => { out += d; log(d.toString()); };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    child.on("error", finish);
    child.on("exit", (code) => finish(code ? new Error(out.trim().split("\n").pop().slice(0, 200) || `exit ${code}`) : null));
    setTimeout(() => { child.unref(); child.stdout.destroy(); child.stderr.destroy(); finish(); }, BG_WAIT_MS);
  });
}

// info: Waker.info (đường dẫn + chế độ của lệnh claude). Trả về { dir, via, bgId? }.
async function launchSession(info, { mode, cwd, prompt, logFile }) {
  if (!["terminal", "desktop", "bg"].includes(mode)) throw codedError("badMode");
  const dir = resolveDir(cwd);
  if (mode === "desktop") return { dir, ...(await inDesktop(dir, prompt)) };
  if (!info.available) throw codedError("noClaude");
  if (mode === "terminal") return { dir, ...(await inTerminal(info.path, dir, prompt)) };
  if (info.mode !== "bg") throw codedError("noBg");
  if (!prompt) throw codedError("needPrompt");
  return { dir, ...(await inBackground(info.path, dir, prompt, logFile)) };
}

module.exports = { launchSession, resolveDir, shq };
