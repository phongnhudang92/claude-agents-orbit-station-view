"use strict";
// Đọc config.json (tạo từ mặc định nếu chưa có).
const fs = require("fs");
const path = require("path");
const os = require("os");
const i18n = require("./i18n");

const ROOT = path.resolve(__dirname, "..");

const DEFAULTS = {
  title: "Trạm Orbit",
  subtitle: "Đội Claude Code · quỹ đạo trực tiếp",
  commander: "Chỉ huy",
  commanderTitle: "",
  lang: "auto",
  port: 7799,
  host: "127.0.0.1",
  claudeDir: "~/.claude",
  projects: [],
  keepHours: 12,
  hide: [],
  crew: [],
  dailyBudgetUsd: 50,
  wake: false,
  prices: {
    opus: { in: 5, out: 25 },
    sonnet: { in: 3, out: 15 },
    haiku: { in: 1, out: 5 },
    default: { in: 3, out: 15 },
  },
};

const expand = (p) => (typeof p === "string" && p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);

function loadConfig({ create = false } = {}) {
  const file = path.join(ROOT, "config.json");
  let user = {};
  if (fs.existsSync(file)) {
    try { user = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
    catch (e) { throw new Error(i18n.t("cfg.syntax", { e: e.message })); }
  } else if (create) {
    fs.writeFileSync(file, JSON.stringify({ lang: "auto", title: DEFAULTS.title, commander: DEFAULTS.commander, projects: [], dailyBudgetUsd: DEFAULTS.dailyBudgetUsd, crew: [] }, null, 2) + "\n");
  }
  const cfg = { ...DEFAULTS, ...user, prices: { ...DEFAULTS.prices, ...(user.prices || {}) } };
  if (process.env.ORBIT_LANG) cfg.lang = process.env.ORBIT_LANG;
  cfg.lang = i18n.setLang(cfg.lang);
  cfg.commanderTitle = String(cfg.commanderTitle || "").trim().slice(0, 40);
  cfg.claudeDir = path.resolve(expand(cfg.claudeDir));
  cfg.projects = (cfg.projects || []).filter(Boolean).map((p) => path.resolve(expand(p)));
  cfg.port = Number(process.env.ORBIT_PORT || cfg.port);
  cfg.root = ROOT;
  cfg.dataDir = path.join(ROOT, "data");
  return cfg;
}

module.exports = { loadConfig, ROOT };
