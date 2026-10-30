"use strict";
const { t } = require("./i18n");
// Tiện ích dùng chung: che khóa bí mật, cắt chữ, tóm tắt công cụ, khóa ngày.

function mask(s) {
  if (s == null) return "";
  return String(s)
    .replace(/((?:api[_-]?)?key|token|secret|password|passwd|pwd|bearer|authorization)(["'\s]*[:=]\s*["']?)[^\s"',;]+/gi, (_, a, b) => a + b + t("mask.secret"))
    .replace(/\b(sk-ant-|sk-|pk_|rk_|ghp_|gho_|github_pat_|xox[abp]-|AKIA|ASIA|AIza)[-_A-Za-z0-9]{10,}/g, () => t("mask.key"))
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, () => t("mask.private"))
    .replace(/\b(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{40,}\b/g, "‹…›");
}

const clip = (s, n = 160) => {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
};

// Bỏ các thẻ hệ thống mà Claude Code chèn vào tin của người dùng.
function stripTags(s) {
  return String(s || "")
    .replace(/<(system-reminder|local-command-stdout|local-command-stderr|command-message|command-args|ide_opened_file|ide_selection|user-memory-input)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<command-name>([\s\S]*?)<\/command-name>/g, "$1")
    .replace(/<[^>]{1,40}>/g, "")
    .trim();
}

const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

const base = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "";

// Tóm tắt một lần gọi công cụ thành một dòng ngắn để hiện trên màn hình hologram.
function toolSummary(name, input) {
  const i = input || {};
  let s = "";
  switch (name) {
    case "Bash": s = i.description || i.command; break;
    case "Read": case "Write": case "Edit": case "MultiEdit": case "NotebookEdit": s = base(i.file_path || i.notebook_path); break;
    case "Grep": s = i.pattern; break;
    case "Glob": s = i.pattern; break;
    case "WebFetch": try { s = new URL(i.url).host; } catch { s = i.url; } break;
    case "WebSearch": s = i.query; break;
    case "Task": case "Agent": s = i.description || i.subagent_type; break;
    case "TodoWrite": s = t("todo", { n: (i.todos || []).length }); break;
    case "AskUserQuestion": s = ((i.questions || [])[0] || {}).question; break;
    default: {
      const v = i.description || i.query || i.path || i.url || i.name || "";
      s = typeof v === "string" ? v : "";
    }
  }
  return clip(oneLine(mask(s || "")), 90);
}

function prettyTool(name) {
  const n = String(name || "");
  const m = n.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (m) return `${m[2]} · ${m[1].replace(/_/g, " ")}`;
  return n;
}

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

module.exports = { mask, clip, stripTags, oneLine, base, toolSummary, prettyTool, dayKey, hash };
