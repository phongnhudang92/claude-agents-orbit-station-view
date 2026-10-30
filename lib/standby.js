"use strict";
// Chế độ "Trực lệnh": phiên nào được bật thì khi xong lượt, hook Stop sẽ chờ lệnh từ trạm thay vì dừng ngay.
// Lưu ở data/standby.json: { "<mã phiên>": { "on": true, "minutes": 30, "setAt": 0 } }
const fs = require("fs");
const path = require("path");

const MAX_MIN = 55; // hook Stop được cài với timeout 3600 giây

class Standby {
  constructor(dir) { this.file = path.join(dir, "standby.json"); this.dir = dir; }
  all() { try { return JSON.parse(fs.readFileSync(this.file, "utf8")) || {}; } catch { return {}; } }
  get(sessionId) {
    const s = String(sessionId || ""), all = this.all();
    const k = Object.keys(all).find((x) => x.slice(0, 8) === s.slice(0, 8));
    return k && all[k].on ? { on: true, minutes: Math.min(MAX_MIN, Math.max(1, Number(all[k].minutes) || 30)) } : null;
  }
  set(sessionId, on, minutes) {
    const all = this.all();
    if (on) all[sessionId] = { on: true, minutes: Math.min(MAX_MIN, Math.max(1, Number(minutes) || 30)), setAt: Date.now() };
    else delete all[sessionId];
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Standby, MAX_MIN };
