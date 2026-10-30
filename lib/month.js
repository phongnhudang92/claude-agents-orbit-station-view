"use strict";
// Thống kê token và chi phí ước tính theo ngày/mô hình/dự án từ nhật ký ~/.claude/projects/**/*.jsonl.
// Nhật ký rất lớn (hàng GB) nên đọc theo khối, chỉ giải mã đoạn quanh `"usage":{`, và nhớ kết quả từng file trong data/month-cache.json.
const fs = require("fs");
const path = require("path");
const { dayKey, base } = require("./util");

const CHUNK = 8 << 20, NL = 10, USAGE = Buffer.from('"usage":{');
const WINDOW_DAYS = 31;      // file không đổi quá số ngày này thì bỏ khỏi cache
const REFRESH_MS = 60e3;
const TAIL_IDS = 60;         // id cuối của file còn đang ghi, để đọc tiếp không đếm trùng
const num = (s, key) => { const m = new RegExp(`"${key}":(\\d+)`).exec(s); return m ? Number(m[1]) : 0; };

// Đọc một dòng có usage: id/model ở đầu dòng, usage ngay tại chỗ, timestamp/cwd ở cuối dòng.
function parseLine(data, ls, p, le, onRecord) {
  const head = data.latin1Slice(ls, Math.min(le, ls + 1500));
  const m = /"message":\{"model":"([^"]*)","id":"([^"]*)"/.exec(head);
  const id = m ? m[2] : (/"id":"(msg_[^"]+)"/.exec(head) || [])[1];
  if (!id) return;
  const win = data.latin1Slice(p, Math.min(le, p + 1500));
  const tail = data.utf8Slice(Math.max(ls, le - 1200), le);
  const ts = /"timestamp":"([^"]+)"/.exec(tail), cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(tail);
  let dir = ""; try { dir = cwd ? JSON.parse(`"${cwd[1]}"`) : ""; } catch {}
  onRecord({
    id, model: m ? m[1] : (/"model":"([^"]+)"/.exec(head) || [])[1] || "unknown", t: ts ? Date.parse(ts[1]) : 0, cwd: dir,
    in: num(win, "input_tokens"), out: num(win, "output_tokens"), cr: num(win, "cache_read_input_tokens"),
    cw: num(win, "cache_creation_input_tokens"), cw1h: num(win, "ephemeral_1h_input_tokens"),
  });
}

function scanLines(data, onRecord) {
  let from = 0;
  for (;;) {
    const p = data.indexOf(USAGE, from);
    if (p < 0) return;
    const ls = data.lastIndexOf(NL, p) + 1;
    let le = data.indexOf(NL, p); if (le < 0) le = data.length;
    from = le + 1;
    parseLine(data, ls, p, le, onRecord);
  }
}

// Quét file từ byte `start`; chỉ tính các dòng đã đủ (có \n). Trả về offset đã đọc tới.
async function scanFile(file, start, onRecord) {
  const fh = await fs.promises.open(file, "r");
  try {
    const size = (await fh.stat()).size, buf = Buffer.allocUnsafe(CHUNK);
    let pos = start, consumed = start, carry = Buffer.alloc(0);
    while (pos < size) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      const lastNl = data.lastIndexOf(NL);
      if (lastNl < 0) { carry = Buffer.from(data); continue; }
      scanLines(data.subarray(0, lastNl + 1), onRecord);
      consumed += lastNl + 1;
      carry = Buffer.from(data.subarray(lastNl + 1));
    }
    return consumed;
  } finally { await fh.close(); }
}

function listTranscripts(root, cutoff) {
  const out = [];
  const walk = (d) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) { try { const st = fs.statSync(p); if (st.mtimeMs >= cutoff) out.push({ p, size: st.size, mtime: st.mtimeMs }); } catch {} }
    }
  };
  walk(root);
  return out;
}

class MonthStats {
  constructor(cfg) {
    this.cfg = cfg;
    this.root = path.join(cfg.claudeDir, "projects");
    this.cacheFile = path.join(cfg.dataDir, "month-cache.json");
    this.files = {};
    try { this.files = JSON.parse(fs.readFileSync(this.cacheFile, "utf8")).files || {}; } catch {}
    this.scan = { running: false, done: 0, total: 0, at: 0 };
  }

  start() {
    const go = () => this.refresh().catch((e) => console.error("month:", e.message));
    go();
    setInterval(go, REFRESH_MS).unref();
  }

  save() {
    try { fs.writeFileSync(this.cacheFile + ".tmp", JSON.stringify({ v: 1, files: this.files })); fs.renameSync(this.cacheFile + ".tmp", this.cacheFile); } catch {}
  }

  async refresh() {
    if (this.scan.running) return;
    const now = Date.now(), list = listTranscripts(this.root, now - WINDOW_DAYS * 864e5);
    const live = new Set(list.map((f) => f.p));
    const kept = Object.fromEntries(Object.entries(this.files).filter(([p]) => live.has(p)));
    this.files = kept;
    const todo = list.filter((f) => !kept[f.p] || kept[f.p].size !== f.size || kept[f.p].mtime !== f.mtime);
    this.scan = { running: true, done: 0, total: todo.length, at: now };
    try {
      for (const f of todo) {
        this.files = { ...this.files, [f.p]: await this.scanOne(f, this.files[f.p], now) };
        this.scan.done++;
        if (this.scan.done % 20 === 0) this.save();
      }
    } finally { this.scan = { ...this.scan, running: false, at: Date.now() }; this.save(); }
  }

  // Đọc tiếp phần mới thêm nếu file chỉ lớn lên, ngược lại đọc lại từ đầu.
  async scanOne(f, prev, now) {
    const grown = prev && f.size > prev.size && prev.offset <= f.size;
    const seen = new Set(grown ? prev.tail : []);
    const days = grown ? structuredClone(prev.days) : {};
    let cwd = grown ? prev.cwd : "";
    const offset = await scanFile(f.p, grown ? prev.offset : 0, (r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      if (!cwd) cwd = r.cwd;
      const byModel = (days[dayKey(r.t || f.mtime)] ||= {});
      const row = (byModel[r.model] ||= [0, 0, 0, 0, 0, 0]);
      row[0] += r.in; row[1] += r.out; row[2] += r.cr; row[3] += r.cw; row[4] += r.cw1h; row[5] += 1;
    });
    const recent = now - f.mtime < 2 * 864e5;
    return { size: f.size, mtime: f.mtime, offset, cwd, days, tail: recent ? [...seen].slice(-TAIL_IDS) : [], sub: f.p.includes(`${path.sep}subagents${path.sep}`) };
  }

  price(model) {
    const P = this.cfg.prices, m = String(model).toLowerCase();
    for (const k of Object.keys(P)) if (k !== "default" && m.includes(k)) return P[k];
    return P.default;
  }

  // range: "30" = 30 ngày gần nhất (gồm hôm nay), "month" = từ mùng 1 tới nay.
  summary(range = "30", now = Date.now()) {
    const d0 = new Date(now), keys = [];
    const n = range === "month" ? d0.getDate() : 30;
    for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i, 12).getTime()));
    const inRange = new Set(keys);
    const tot = { in: 0, out: 0, cr: 0, cw: 0, tokens: 0, cost: 0, replies: 0 };
    const byDay = new Map(keys.map((k) => [k, { d: k, tokens: 0, cost: 0 }]));
    const byModel = new Map(), byProject = new Map();
    let sessions = 0, agents = 0;
    for (const [file, rec] of Object.entries(this.files)) {
      let used = false;
      const proj = base(rec.cwd) || path.basename(path.dirname(rec.sub ? path.dirname(path.dirname(file)) : file)) || "?";
      for (const [day, models] of Object.entries(rec.days)) {
        if (!inRange.has(day)) continue;
        for (const [model, [i, o, cr, cw, cw1h, c]] of Object.entries(models)) {
          if (model === "<synthetic>") continue;
          const p = this.price(model);
          const cost = (i * p.in + o * p.out + cr * p.in * 0.1 + (cw - cw1h) * p.in * 1.25 + cw1h * p.in * 2) / 1e6, tokens = i + o + cr + cw;
          used = true;
          tot.in += i; tot.out += o; tot.cr += cr; tot.cw += cw; tot.tokens += tokens; tot.cost += cost; tot.replies += c;
          const dd = byDay.get(day); dd.tokens += tokens; dd.cost += cost;
          const name = model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
          const m = byModel.get(name) || { name, tokens: 0, cost: 0 }; m.tokens += tokens; m.cost += cost; byModel.set(name, m);
          const pr = byProject.get(proj) || { name: proj, tokens: 0, cost: 0 }; pr.tokens += tokens; pr.cost += cost; byProject.set(proj, pr);
        }
      }
      if (used) { if (rec.sub) agents++; else sessions++; }
    }
    const rank = (m, k) => [...m.values()].sort((a, b) => b.cost - a.cost).slice(0, k);
    const days = [...byDay.values()];
    const active = days.filter((x) => x.tokens > 0).length;
    const top = days.reduce((a, b) => (b.cost > a.cost ? b : a), days[0]);
    return {
      range, days, total: { ...tot, cost: +tot.cost.toFixed(2) }, sessions, agents,
      avgCost: active ? +(tot.cost / active).toFixed(2) : 0, activeDays: active, topDay: top && top.cost > 0 ? top : null,
      models: rank(byModel, 6), projects: rank(byProject, 8), scan: { ...this.scan }, at: now,
    };
  }
}

module.exports = { MonthStats, scanFile };
