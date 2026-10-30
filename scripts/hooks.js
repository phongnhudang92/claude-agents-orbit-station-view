#!/usr/bin/env node
"use strict";
// Cài / gỡ / xem hooks của Trạm Orbit trong ~/.claude/settings.json (có sao lưu trước khi sửa).
//   node scripts/hooks.js install | uninstall | status
const fs = require("fs");
const path = require("path");
const os = require("os");
const { t } = require("../lib/i18n");
try { require("../lib/config").loadConfig(); } catch {} // chỉ để lấy "lang"

const HOOK = path.resolve(__dirname, "hook.js");
const MARK = "claude-agents-orbit-station-view-hook";
const LEGACY = ["tram-orbit-hook"]; // tên cũ: vẫn nhận ra để cài lại / gỡ được
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop", "SessionEnd"];
const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse"]);
const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const FILE = path.join(claudeDir, "settings.json");
const cmd = `"${process.execPath}" "${HOOK}" --${MARK}`;

function load() {
  if (!fs.existsSync(FILE)) return {};
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch (e) { console.error(t("hk.readFail", { f: FILE, e: e.message })); process.exit(1); }
}
function save(s) {
  if (fs.existsSync(FILE)) {
    const bak = `${FILE}.orbit-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(FILE, bak);
    console.log("  " + t("hk.backup", { f: bak }));
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + "\n");
}
const isOurs = (h) => h && typeof h.command === "string" && [MARK, ...LEGACY].some((m) => h.command.includes(m));
function strip(s) {
  let n = 0;
  for (const ev of Object.keys(s.hooks || {})) {
    const groups = Array.isArray(s.hooks[ev]) ? s.hooks[ev] : [];
    const kept = [];
    for (const g of groups) {
      const hs = (g.hooks || []).filter((h) => { if (isOurs(h)) { n++; return false; } return true; });
      if (hs.length) kept.push({ ...g, hooks: hs });
    }
    if (kept.length) s.hooks[ev] = kept; else delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  return n;
}

const action = process.argv[2] || "status";
const s = load();
if (action === "install") {
  strip(s);
  s.hooks = s.hooks || {};
  for (const ev of EVENTS) {
    // Stop được chờ lâu cho chế độ "Trực lệnh" (tối đa 55 phút); các sự kiện khác chỉ cần vài giây
    const entry = { hooks: [{ type: "command", command: cmd, timeout: ev === "Stop" ? 3600 : 10 }] };
    if (TOOL_EVENTS.has(ev)) entry.matcher = "*";
    (s.hooks[ev] = s.hooks[ev] || []).push(entry);
  }
  save(s);
  console.log("\n  " + t("hk.installed", { n: EVENTS.length, f: FILE }));
  console.log("  " + t("hk.node", { p: process.execPath }));
  console.log("  " + t("hk.newSessions"));
  console.log("  " + t("hk.openSessions") + "\n");
} else if (action === "uninstall") {
  const n = strip(s);
  if (n) { save(s); console.log("\n  " + t("hk.removed", { n, f: FILE }) + "\n"); }
  else console.log("\n  " + t("hk.none") + "\n");
} else {
  const found = EVENTS.filter((ev) => ((s.hooks || {})[ev] || []).some((g) => (g.hooks || []).some(isOurs)));
  console.log("\n  " + t("hk.file", { f: FILE }));
  console.log("  " + (found.length ? t("hk.for", { e: found.join(", ") }) : t("hk.missing")));
  const stale = ((s.hooks || {}).Stop || []).flatMap((g) => g.hooks || []).filter(isOurs).find((h) => !h.command.includes(process.execPath));
  if (stale) console.log("  " + t("hk.stale"));
  console.log("");
}
