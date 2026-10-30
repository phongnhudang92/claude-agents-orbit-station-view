#!/usr/bin/env node
"use strict";
// Đăng ký MCP server "orbit" cho Claude Code (phạm vi user) bằng lệnh `claude mcp add`.
const path = require("path");
const { spawnSync } = require("child_process");
const { t } = require("../lib/i18n");
try { require("../lib/config").loadConfig(); } catch {}

const server = path.resolve(__dirname, "..", "mcp", "server.js");
const args = ["mcp", "add", "--scope", "user", "orbit", "--", process.execPath, server];
console.log("\n  " + t("mi.run", { c: "claude " + args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ") }) + "\n");
const r = spawnSync("claude", args, { stdio: "inherit" });
if (r.error) {
  console.log("  " + t("mi.noClaude") + "\n");
  process.exit(1);
}
process.exit(r.status || 0);
