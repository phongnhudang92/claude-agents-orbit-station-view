import { renderMarkdown } from "./md.js";
import { t, msg, locale } from "./i18n.js";
const tt = t;
// Lớp giao diện phủ trên cảnh 3D: thống kê, phi hành đoàn, liên lạc, chi tiết + gửi lệnh.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STATUSES = ["standby", "working", "ask", "done", "idle", "blocked", "offline"];
const SL = (k) => t("status." + k);
const OL = (k) => t("order." + k);
const ICONS = {
  prompt: '<svg viewBox="0 0 24 24"><path d="M4 12h12M12 6l6 6-6 6"/></svg>',
  order: '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  ask: '<svg viewBox="0 0 24 24"><path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V15"/><path d="M12 19h.01"/></svg>',
  msg: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>',
  report: '<svg viewBox="0 0 24 24"><path d="M5 20V9M12 20V4M19 20v-7"/></svg>',
  spawn: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  bgstart: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01"/></svg>',
  bgdone: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="1"/><path d="M7 17l3 3 7-7"/></svg>',
  subdone: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M7 12l3 3 7-7"/></svg>',
};

export function fmtTok(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K";
  return String(n);
}
const fmtUsd = (v) => "$" + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
export function ago(t, now = Date.now()) {
  if (!t) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return tt("time.now");
  if (s < 60) return tt("time.s", { n: s });
  if (s < 3600) return tt("time.m", { n: Math.floor(s / 60) });
  if (s < 86400) return tt("time.h", { n: Math.floor(s / 3600) });
  return tt("time.d", { n: Math.floor(s / 86400) });
}
// "5 phút trước" / "5 min ago" (riêng "vừa xong" không thêm hậu tố)
const agoSfx = (ts) => { const v = ago(ts); return v === tt("time.now") || v === "—" ? v : tt("time.ago", { t: v }); };
const dur = (a, b) => { const s = Math.max(0, Math.round((b - a) / 1000)); return s < 60 ? tt("dur.s", { s }) : s < 3600 ? tt("dur.m", { m: Math.floor(s / 60), s: s % 60 }) : tt("dur.h", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) }); };
const agoEl = (ts, sfx = false) => `<span data-ago="${ts || 0}"${sfx ? " data-sfx" : ""}></span>`;
function fillAgo(root) { for (const el of root.querySelectorAll("[data-ago]")) { const n = Number(el.dataset.ago), v = el.hasAttribute("data-sfx") ? agoSfx(n) : ago(n); if (el.textContent !== v) el.textContent = v; } }
// đồng hồ lượt đang chạy: "17 phút 36s" tính từ lúc nhận lệnh
function fillSince(root) { const now = Date.now(); for (const el of root.querySelectorAll("[data-since]")) { const v = dur(Number(el.dataset.since), now); if (el.textContent !== v) el.textContent = v; } }
const hhmm = (ts) => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
const initials = (n) => String(n || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 2).toUpperCase() || "?";
const shortModel = (m) => String(m || "—").replace(/^claude-/, "").replace(/-\d{8}$/, "");

function spark(values, w = 64, h = 18, color = "currentColor") {
  const mx = Math.max(3, ...values), n = values.length, bw = w / n;
  let r = "";
  values.forEach((v, i) => { if (!v) return; const bh = Math.max(1.5, (v / mx) * h); r += `<rect x="${(i * bw).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${Math.max(0.8, bw - 0.6).toFixed(2)}" height="${bh.toFixed(2)}" rx="0.6"/>`; });
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="${color}" opacity="0.85">${r}</svg>`;
}

export class Hud {
  constructor({ onSelect, onClose, onSend, onCancel, onHover, onFilter, onWake, onStandby }) {
    Object.assign(this, { onSelect, onClose, onSend, onCancel, onHover, onFilter, onWake, onStandby });
    this.filter = new Set();
    try { for (const k of JSON.parse(localStorage.getItem("orbit.filter") || "[]")) if (STATUSES.includes(k) || k === "bg") this.filter.add(k); } catch {}
    $("#bgStat").addEventListener("click", () => this.toggleFilter("bg", true));
    $("#filters").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) this.toggleFilter(b.dataset.f, !(e.altKey)); });
    this.state = null; this.selected = null; this.lastEv = 0; this.firstRender = true; this.draft = new Map(); this.older = new Map();
    $("#crewList").addEventListener("click", (e) => { const r = e.target.closest(".crow"); if (r) this.onSelect(r.dataset.id); });
    $("#crewList").addEventListener("mouseover", (e) => { const r = e.target.closest(".crow"); this.onHover(r ? r.dataset.id : null); });
    $("#crewList").addEventListener("mouseleave", () => this.onHover(null));
    $("#comms").addEventListener("click", (e) => { const r = e.target.closest(".ev"); if (r && r.dataset.id) this.onSelect(r.dataset.id); });
    $("#stats").addEventListener("click", (e) => { const b = e.target.closest(".stat"); if (b) this.toggleFilter(b.dataset.k, !(e.altKey)); });
    $("#alert").addEventListener("click", () => { if (this.alertId) this.onSelect(this.alertId); });
    // thu nhỏ / mở lại các bảng (nhớ cho lần sau)
    this.min = { crew: false, side: false };
    try { Object.assign(this.min, JSON.parse(localStorage.getItem("orbit.min") || "{}")); } catch {}
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-min]"); if (b) { e.stopPropagation(); this.setMin(b.dataset.min, true); } });
    $("#crewTab").onclick = () => this.setMin("crew", false);
    $("#sideTab").onclick = () => this.setMin("side", false);
    $("#btnPanels").onclick = () => { const hide = !(this.min.crew && this.min.side); this.setMin("crew", hide); this.setMin("side", hide); };
    window.addEventListener("keydown", (e) => {
      if (e.target.closest("textarea, input") || !$("#reader").hidden || !$("#launcher").hidden || !$("#monthBox").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") this.setMin("crew", !this.min.crew);
      else if (e.key === "]") this.setMin("side", !this.min.side);
      else if (e.key === "h" || e.key === "H") $("#btnPanels").click();
    });
    this.applyMin();
    setInterval(() => { this.tickClock(); fillAgo($("#detailView")); fillSince($("#detailView")); }, 1000); this.tickClock();
    // hộp đọc toàn văn
    const close = () => { $("#reader").hidden = true; };
    $("#readerClose").onclick = close;
    $("#reader").addEventListener("click", (e) => { if (e.target.id === "reader") close(); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#reader").hidden) { e.stopImmediatePropagation(); close(); } }, true);
    $("#readerCopy").onclick = async () => { try { await navigator.clipboard.writeText(this.readerText || ""); $("#readerCopy").textContent = t("reader.copied"); setTimeout(() => ($("#readerCopy").textContent = t("reader.copy")), 1500); } catch {} };
    $("#readerRaw").onclick = () => { this.readerRaw = !this.readerRaw; this.paintReader(); };
  }

  async openReader(ref, a) {
    const [kind, id, sub] = ref.split(":");

    const q = new URLSearchParams({ kind, id: kind === "sub" ? a.id : id }); if (sub) q.set("sub", sub);
    $("#readerTitle").textContent = `${t("reader." + kind) || t("reader.content")} · ${a.name}`;
    $("#readerMeta").textContent = t("reader.loading"); $("#readerBody").innerHTML = ""; $("#reader").hidden = false;
    try {
      const r = await fetch("/api/text?" + q);
      if (!/json/.test(r.headers.get("content-type") || "")) throw new Error(t("reader.stale"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.code ? t("err." + j.code) : j.error || t("reader.failed"));
      this.readerText = j.text || "";
      $("#readerMeta").textContent = `${j.at ? new Date(j.at).toLocaleString(locale()) + " · " : ""}${t("reader.chars", { n: this.readerText.length.toLocaleString(locale()) })}`;
      this.paintReader();
    } catch (e) { $("#readerMeta").textContent = e.message; }
  }
  paintReader() {
    const body = $("#readerBody");
    body.classList.toggle("raw", !!this.readerRaw); $("#readerRaw").textContent = this.readerRaw ? t("reader.fmt") : t("reader.raw");
    if (this.readerRaw) body.textContent = this.readerText; else body.innerHTML = renderMarkdown(this.readerText) || `<p class="muted">${t("reader.empty")}</p>`;
    body.scrollTop = 0;
  }

  tickClock() {
    const d = new Date();
    $("#clock").textContent = d.toLocaleTimeString(locale(), { hour12: false });
    $("#dateLine").textContent = d.toLocaleDateString(locale(), { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  // bấm để bật/tắt từng trạng thái (chọn được nhiều cái cùng lúc); Alt+bấm = chỉ chọn mỗi trạng thái đó; "Tất cả" = bỏ lọc.
  toggleFilter(k, multi) {
    if (k === "all") this.filter.clear();
    else if (!multi) { this.filter.clear(); this.filter.add(k); }
    else if (this.filter.has(k)) this.filter.delete(k);
    else this.filter.add(k);
    try { localStorage.setItem("orbit.filter", JSON.stringify([...this.filter])); } catch {}
    this.onFilter(new Set(this.filter));
    if (this.state) { this.renderedTop = null; this.render(this.state); }
  }
  // lọc theo trạng thái (hoặc), kết hợp "có lệnh nền" (và)
  setMin(which, v) {
    this.min[which] = !!v;
    try { localStorage.setItem("orbit.min", JSON.stringify(this.min)); } catch {}
    this.applyMin();
  }
  applyMin() {
    $("#crewPanel").classList.toggle("min", this.min.crew); $("#crewTab").hidden = !this.min.crew;
    $("#sidePanel").classList.toggle("min", this.min.side); $("#sideTab").hidden = !this.min.side;
    $("#btnPanels").classList.toggle("on", !(this.min.crew && this.min.side));
    document.body.classList.toggle("crew-min", this.min.crew); document.body.classList.toggle("side-min", this.min.side);
  }
  updateTabs(s) {
    const shown = s.agents.filter((a) => this.matches(a));
    $("#crewTabN").textContent = shown.length;
    const ask = shown.filter((a) => a.status === "ask").length;
    for (const id of ["#crewTabAsk", "#sideTabAsk"]) { $(id).hidden = !ask; $(id).textContent = ask ? t("tabs.needYou", { n: ask }) : ""; }
    const sel = this.selected && s.agents.find((a) => a.id === this.selected);
    $("#sideTabLabel").textContent = sel ? sel.name : t("comms.title");
    $("#sideTabN").textContent = sel ? "" : String(Math.min(99, s.events.length));
    $("#sideTabN").hidden = !!sel;
  }
  matches(a) {
    const st = [...this.filter].filter((k) => k !== "bg");
    if (st.length && !st.includes(a.status)) return false;
    if (this.filter.has("bg") && !(a.bg || []).some((x) => x.status === "running")) return false;
    return true;
  }
  subOwner(id) {
    const sid = String(id).slice(4);
    for (const a of (this.state ? this.state.agents : [])) { const x = (a.subs || []).find((y) => y.id === sid); if (x) return { a, x }; }
    return null;
  }

  commanderName(s) { return !s.commander || s.commander === "Chỉ huy" ? t("commander") : s.commander; }
  // đổi ngôn ngữ: vẽ lại mọi thứ
  relang() {
    this.lang = (this.lang || 0) + 1; this.detailFor = null; this.renderedTop = null;
    const f = $("#filters"); if (f) f._html = null; const hb = $("#hooksBox"); if (hb) hb._html = null;
    if (this.state) this.render(this.state);
  }

  name(id) {
    if (id === "commander") return this.state ? this.commanderName(this.state) : t("commander");
    if (String(id).startsWith("sub:")) { const o = this.subOwner(id); return o ? `${o.a.name} · ${o.x.type}` : "drone"; }
    const a = this.state && this.state.agents.find((x) => x.id === id);
    return a ? a.name : String(id || "?").slice(0, 8);
  }

  render(s) {
    this.state = s;
    const title = !s.title || s.title === "Trạm Orbit" ? t("brand.title") : s.title;
    document.title = (s.counts.ask ? `(${s.counts.ask}) ` : "") + title;
    $("#title").textContent = title.toUpperCase();
    $("#subtitle").textContent = !s.subtitle || s.subtitle === "Đội Claude Code · quỹ đạo trực tiếp" ? t("brand.sub") : s.subtitle;
    $("#demoChip").hidden = !s.demo;
    for (const b of document.querySelectorAll(".stat")) {
      const n = s.counts[b.dataset.k] || 0; b.querySelector("b").textContent = n;
      b.classList.toggle("hot", b.dataset.k === "ask" && n > 0);
      b.classList.toggle("active", this.filter.has(b.dataset.k));
    }
    $("#tokToday").textContent = fmtTok(s.totals.tokens);
    const bgRun = s.agents.reduce((n, a) => n + (a.bg || []).filter((x) => x.status === "running").length, 0);
    $("#bgCount").textContent = bgRun; $("#bgStat").classList.toggle("active", this.filter.has("bg")); $("#bgStat").classList.toggle("live", bgRun > 0);
    $("#costToday").textContent = fmtUsd(s.totals.cost);
    $("#budget").textContent = ` / $${s.budget}`;
    const pct = Math.min(100, (s.totals.cost / Math.max(1, s.budget)) * 100);
    const bar = $("#budgetBar"); bar.style.width = pct + "%"; bar.classList.toggle("warn", pct >= 80);
    const shown = s.agents.filter((a) => this.matches(a)).length;
    $("#crewMeta").textContent = this.filter.size ? t("crew.countOf", { a: shown, b: s.agents.length }) : t("crew.count", { n: s.agents.length });
    this.renderFilters(s);
    $("#empty").hidden = s.agents.length > 0;
    $("#emptyScope").textContent = s.projects && s.projects.length ? t("empty.scope", { p: s.projects.join(", ") }) : t("empty.all");
    this.renderCrew(s);
    this.renderHooks(s);
    this.renderComms(s);
    this.renderAlert(s);
    this.updateTabs(s);
    if (this.selected) this.renderDetail(s);
    this.firstRender = false;
  }

  renderCrew(s) {
    const list = $("#crewList");
    const order = { ask: 0, blocked: 1, working: 2, standby: 3, done: 4, idle: 5, offline: 6 };
    const agents = [...s.agents].filter((a) => this.matches(a)).sort((a, b) => order[a.status] - order[b.status] || b.lastActivity - a.lastActivity);
    let none = list.querySelector(".none");
    if (!agents.length && s.agents.length) { if (!none) { none = document.createElement("div"); none.className = "none"; list.appendChild(none); } none.textContent = t("crew.none"); }
    else if (none) none.remove();
    const keep = new Set();
    agents.forEach((a, i) => {
      keep.add(a.id);
      let row = list.querySelector(`.crow[data-id="${a.id}"]`);
      if (!row) {
        row = document.createElement("div"); row.className = "crow"; row.dataset.id = a.id;
        row.innerHTML = `<div class="avatar"></div><div class="c-main"><div class="c-name"></div><div class="c-sub"></div><div class="c-now"></div></div><div class="c-right"><span class="sp"></span><span class="c-time"></span></div>`;
      }
      if (list.children[i] !== row) list.insertBefore(row, list.children[i] || null);
      row.dataset.s = a.status;
      row.classList.toggle("sel", this.selected === a.id);
      const av = row.querySelector(".avatar"); av.style.setProperty("--h", a.hue); av.textContent = initials(a.name);
      const nd = (a.subs || []).filter((x) => x.status === "running").length || a.subagents || 0;
      const nb = (a.bg || []).filter((x) => x.status === "running").length;
      row.querySelector(".c-name").innerHTML = esc(a.name) + (a.openOrders ? ` <span class="badge">${t("crew.orders", { n: a.openOrders })}</span>` : "") + (nd ? ` <span class="badge drone">◈ ${nd}</span>` : "") + (nb ? ` <span class="badge bgb">⌁ ${nb}</span>` : "") + (a.standby && a.status !== "standby" ? ` <span class="badge sbb" title="${t("crew.standbyOn")}">◉</span>` : "");
      row.querySelector(".c-sub").textContent = [a.project, a.branch].filter(Boolean).join(" @ ") + (a.title ? ` · ${a.title}` : "");
      const now = a.status === "working" ? (a.tool ? `${a.tool.name}${a.tool.summary ? " · " + a.tool.summary : ""}` : t("now.thinking"))
        : a.status === "ask" ? `◆ ${msg(a.ask) || t("now.confirm")}` : a.status === "standby" ? t("now.standby") : SL(a.status);
      row.querySelector(".c-now").textContent = now;
      row.querySelector(".sp").innerHTML = spark(a.activity.slice(-40), 58, 16, "var(--sc)");
      row.querySelector(".c-time").textContent = ago(a.lastActivity, s.now);
    });
    for (const r of [...list.querySelectorAll(".crow")]) if (!keep.has(r.dataset.id)) r.remove();
  }

  renderFilters(s) {
    const box = $("#filters");
    const keys = ["working", "ask", "standby", "done", "idle", "blocked", "offline"].filter((k) => ["working", "ask", "done", "idle"].includes(k) || s.counts[k] || this.filter.has(k));
    const html = `<button data-f="all" class="${this.filter.size ? "" : "on"}">${t("filter.all")} <b>${s.agents.length}</b></button>` +
      keys.map((k) => `<button data-f="${k}" data-s="${k}" class="${this.filter.has(k) ? "on" : ""}" aria-pressed="${this.filter.has(k)}" title="${t("filter.tip")}"><i></i>${SL(k)} <b>${s.counts[k] || 0}</b></button>`).join("") +
      `<button data-f="bg" class="bgf ${this.filter.has("bg") ? "on" : ""}">${t("filter.bg")} <b>${s.agents.filter((a) => (a.bg || []).some((x) => x.status === "running")).length}</b></button>`;
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
  }

  renderHooks(s) {
    const box = $("#hooksBox");
    if (s.demo) { box.innerHTML = t("hooks.demo"); return; }
    const w = s.wake || {};
    const wakeLine = w.disabled ? "" : w.available ? `<br><span class="on">●</span> ${t("wake.on", { v: esc(w.version || "claude"), m: t(w.mode === "bg" ? "wake.bg" : "wake.print") })}`
      : `<br><span class="off">●</span> ${t("wake.off", { e: esc(w.error || "") })}`;
    const html = (s.hooks.active ? `<span class="on">●</span> ${t("hooks.active")}`
      : s.hooks.installed ? `<span class="on">●</span> ${t("hooks.installed")}`
      : `<span class="off">●</span> ${t("hooks.missing")}`) + wakeLine;
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
  }

  renderComms(s) {
    const box = $("#comms");
    const ownerOf = (id) => (String(id).startsWith("sub:") ? (this.subOwner(id) || {}).a : s.agents.find((a) => a.id === id));
    const evs = s.events.filter((e) => {
      if (!this.filter.size) return true;
      return [e.from, e.to].some((id) => { const a = id && id !== "commander" ? ownerOf(id) : null; return a && this.matches(a); });
    }).slice(-80);
    if (!evs.length) { box.innerHTML = `<div class="none">${this.filter.size ? t("comms.noneFiltered") : t("comms.none")}</div>`; this.renderedTop = null; return; }
    const html = evs.slice().reverse().map((e) => {
      const who = e.from === "commander" ? this.name("commander") : this.name(e.from);
      const to = e.to === "commander" ? s.commanderTitle || t("bridge") : this.name(e.to);
      const verb = e.kind === "bgdone" ? t("verb.bgdone." + ((e.params && e.params.status) || "done")) + (e.params && e.params.exitCode != null ? ` (exit ${e.params.exitCode})` : "") : (e.kind === "bgstart" && e.params && e.params.how === "timeout" ? t("bg.timeout") : t("verb." + e.kind) || "→");
      const showTo = e.kind === "prompt" || e.kind === "order" || e.kind === "msg";
      const target = e.from === "commander" || String(e.from).startsWith("sub:") ? e.to : e.from;
      return `<div class="ev ${e.id > this.lastEv && !this.firstRender ? "new" : ""}" data-k="${e.kind}" data-id="${esc(target)}">
        <div class="ev-ico">${ICONS[e.kind] || ICONS.msg}</div>
        <div><div class="ev-head"><b>${esc(who)}</b><span class="arrow">${verb}</span>${showTo ? `<b>${esc(to)}</b>` : ""}<time>${hhmm(e.t)}</time></div>
        <div class="ev-text">${esc(msg(e.text))}</div></div></div>`;
    }).join("");
    const top = Math.max(...evs.map((e) => e.id));
    if (top !== this.renderedTop || this.namesSig !== s.agents.map((a) => a.name).join() + this.lang) { box.innerHTML = html; this.renderedTop = top; this.namesSig = s.agents.map((a) => a.name).join() + this.lang; }
    this.lastEv = Math.max(this.lastEv, top);
  }

  renderAlert(s) {
    const a = s.agents.find((x) => x.status === "ask") || s.agents.find((x) => x.status === "blocked");
    const el = $("#alert");
    if (!a) { el.hidden = true; this.alertId = null; return; }
    this.alertId = a.id; el.hidden = false;
    el.innerHTML = `<span class="a-ico">${a.status === "ask" ? "?" : "!"}</span><b>${esc(a.name)}</b><span class="t">${esc(a.status === "ask" ? msg(a.ask) || t("alert.waiting") : t("alert.blocked"))}</span>`;
  }

  select(id) {
    this.selected = id;
    if (id && this.min.side) this.setMin("side", false);
    $("#commsView").hidden = !!id; $("#detailView").hidden = !id;
    if (id && this.state) { this.detailFor = null; this.renderDetail(this.state); }
    if (this.state) this.renderCrew(this.state);
  }

  // các reply trước của một phiên: nạp từng trang, giữ trạng thái theo phiên để không mất khi giao diện vẽ lại
  setOlder(id, patch) {
    this.older.set(id, { items: [], more: true, loading: false, latest: 0, ...(this.older.get(id) || {}), ...patch });
    if (this.selected === id && this.state) this.renderDetail(this.state);
  }
  async fetchOlder(a, before, limit) {
    const r = await fetch(`/api/replies?id=${encodeURIComponent(a.id)}&before=${before}&limit=${limit}`);
    if (!/json/.test(r.headers.get("content-type") || "")) throw new Error(t("reader.stale"));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  async loadOlder(id) {
    const a = this.state && this.state.agents.find((x) => x.id === id), od = this.older.get(id);
    if (!a || (od && od.loading)) return;
    const items = od ? od.items : [], before = items.length ? items[items.length - 1].seq : a.replySeq;
    this.setOlder(id, { loading: true, latest: od ? od.latest : a.replySeq });
    try { const j = await this.fetchOlder(a, before, 8); this.setOlder(id, { items: [...items, ...j.items], more: j.more, loading: false }); }
    catch { this.setOlder(id, { loading: false }); }
  }
  // có reply mới: nạp lại khối đã mở để không hở giữa reply mới nhất và các reply cũ
  async reloadOlder(a) {
    const od = this.older.get(a.id);
    this.setOlder(a.id, { loading: true, latest: a.replySeq });
    try { const j = await this.fetchOlder(a, a.replySeq, Math.min(60, Math.max(8, od.items.length + (a.replySeq - od.latest)))); this.setOlder(a.id, { items: j.items, more: j.more, loading: false }); }
    catch { this.setOlder(a.id, { loading: false }); }
  }

  renderDetail(s) {
    const a = s.agents.find((x) => x.id === this.selected);
    const v = $("#detailView");
    if (!a) { this.onClose(); return; }
    const cur = this.older.get(a.id);
    if (cur && !cur.loading && cur.latest !== a.replySeq) this.reloadOlder(a);
    if (this.detailFor !== a.id) {
      this.detailFor = a.id;
      v.innerHTML = `
        <div class="dt-head"><div class="avatar"></div><div><div class="dt-name"></div><div class="dt-title"></div></div><button class="minbtn" data-min="side" title="${t("panel.minSide")}" aria-label="${t("panel.min")}"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button><button class="x" title="${t("close")}">✕</button></div>
        <div class="dt-body"></div>
        <form class="compose">
          <textarea placeholder="${t("dt.placeholder")}"></textarea>
          <div class="compose-hint"></div>
          <div class="compose-row">
            <button class="send ghost" type="submit" data-mode="queue" title="${t("dt.queueTip")}">${t("dt.queue")}</button>
            <button class="send" type="submit" data-mode="wake"><svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8z"/></svg><span>${t("dt.send")}</span></button></div>
          <div class="err" hidden></div><div class="ok" hidden></div>
        </form>`;
      v.querySelector(".x").onclick = () => this.onClose();
      const ta = v.querySelector("textarea"), form = v.querySelector("form");
      ta.value = this.draft.get(a.id) || "";
      ta.oninput = () => this.draft.set(a.id, ta.value);
      ta.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(form.querySelector('[data-mode="wake"]')); } };
      const err = form.querySelector(".err"), ok = form.querySelector(".ok");
      const show = (el, msg) => { err.hidden = ok.hidden = true; if (msg) { el.textContent = msg; el.hidden = false; } };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const text = ta.value.trim(); if (!text) return;
        if (/^\/[a-z-]+/i.test(text)) { show(err, t("dt.slash", { c: text.split(/\s/)[0] })); return; }
        const cur = this.state.agents.find((x) => x.id === a.id) || a;
        const wake = (e.submitter ? e.submitter.dataset.mode : "wake") === "wake" && cur.status !== "working" && this.state.wake && this.state.wake.available;
        const btns = form.querySelectorAll(".send"); btns.forEach((b) => (b.disabled = true)); show();
        try {
          const r = await this.onSend(a.id, text, wake);
          ta.value = ""; this.draft.delete(a.id);
          if (r.wakeError) show(err, t("dt.wakeErr", { e: r.wakeCode ? t("err." + r.wakeCode) : r.wakeError }));
          else if (r.copy) show(ok, t("dt.copy", { c: r.copy }));
          else if (r.via && r.via.startsWith("wake")) show(ok, r.via === "wake:bg" ? t("dt.wokeBg", { n: a.name, s: a.short }) : t("dt.woke", { n: a.name }));
          else show(ok, t("dt.saved"));
        } catch (x) { show(err, x.message); }
        btns.forEach((b) => (b.disabled = false));
      };
      v.querySelector(".dt-body").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-cancel]"); if (b) this.onCancel(b.dataset.cancel);
        const ol = e.target.closest("[data-older]"); if (ol) this.loadOlder(ol.dataset.older);
        const rd = e.target.closest("[data-read]"); if (rd) this.openReader(rd.dataset.read, a);
        const w = e.target.closest("[data-wake]");
        if (w) { w.disabled = true; try { await this.onWake(a.id); show(ok, t("dt.woke", { n: a.name })); } catch (x) { show(err, x.message); } w.disabled = false; }
      });
      v.querySelector(".dt-body").addEventListener("change", async (e) => {
        const box = e.target.closest(".standby"); if (!box) return;
        const on = box.querySelector("[data-standby]").checked, min = Number(box.querySelector("[data-standby-min]").value);
        try { await this.onStandby(a.id, on, min); show(ok, on ? t("dt.sbOn", { n: a.name, m: min }) : t("dt.sbOff", { n: a.name })); } catch (x) { show(err, x.message); }
      });
    }
    v.dataset.s = a.status;
    const av = v.querySelector(".avatar"); av.style.setProperty("--h", a.hue); av.textContent = initials(a.name);
    v.querySelector(".dt-name").textContent = a.name;
    v.querySelector(".dt-title").textContent = a.title || a.role || t("dt.astronaut");
    const now = a.status === "working" ? { k: t("now.k.working"), v: a.tool ? a.tool.name : t("now.thinking"), s: a.tool ? a.tool.summary : "" }
      : a.status === "ask" ? { k: t("now.k.ask"), v: msg(a.ask) || t("now.v.ask"), s: "" }
      : a.status === "blocked" ? { k: t("now.k.blocked"), v: t("now.v.blocked"), s: "" }
      : a.status === "standby" ? { k: t("now.k.standby"), v: t("now.v.standby"), s: t("now.s.standby", { m: Math.max(0, Math.round((a.standbyUntil - Date.now()) / 60e3)) }) }
      : a.status === "done" ? { k: t("now.k.done"), v: t("now.v.done"), s: "", at: a.lastActivity }
      : { k: SL(a.status), v: t("now.v.idle"), s: "", at: a.lastActivity };
    const orders = s.orders.filter((o) => o.to === a.id).slice(0, 8);
    const td = a.today;
    const actBars = (() => { const w = 320, h = 34, mx = Math.max(3, ...a.activity), bw = w / a.activity.length; return `<svg class="acts" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="var(--sc)">${a.activity.map((x, i) => x ? `<rect x="${i * bw}" y="${h - Math.max(2, (x / mx) * h)}" width="${bw - 1.2}" height="${Math.max(2, (x / mx) * h)}" rx="1" opacity="${i > a.activity.length - 6 ? 1 : 0.55}"/>` : `<rect x="${i * bw}" y="${h - 1}" width="${bw - 1.2}" height="1" opacity="0.2"/>`).join("")}</svg>`; })();
    const od = this.older.get(a.id), olderItems = od ? od.items.filter((x) => x.seq < a.replySeq) : [];
    const remaining = Math.max(0, (a.replyCount || 0) - 1 - olderItems.length), canMore = od ? od.more : remaining > 0;
    const olderHtml = olderItems.map((x) => `<div class="quote reply older"><div class="older-h"><time>${hhmm(x.t)}</time>${x.long ? `<button type="button" class="more inline" data-read="reply:${esc(a.id)}:${x.seq}">${t("sec.expand")}</button>` : ""}</div>${esc(x.text)}</div>`).join("")
      + (canMore ? `<button type="button" class="more" data-older="${esc(a.id)}"${od && od.loading ? " disabled" : ""}>${od && od.loading ? t("older.loading") : t("older.more") + (remaining ? ` (${remaining})` : "")}</button>` : "");
    const plan = a.plan || [], w = a.work;
    const planHtml = plan.length ? `<div class="plan" data-live="${a.status === "working" ? 1 : 0}"><div class="sec-t">${t("plan.title")} <small>${plan.filter((x) => x.status === "completed").length}/${plan.length}</small></div><ul>${plan.map((x) => `<li data-st="${x.status}"><i></i><span>${esc(x.status === "in_progress" && x.active ? x.active : x.text)}</span></li>`).join("")}</ul></div>` : "";
    const plural = (n, one, many) => t(n === 1 ? one : many, { n });
    const clock = a.turnStart ? (a.turnEnd ? (a.turnEnd > a.turnStart ? `<span>⏱ ${dur(a.turnStart, a.turnEnd)}</span>` : "") : `<span>⏱ <span data-since="${a.turnStart}"></span></span>`) : "";
    const workHtml = w && (w.tools || clock) ? `<div class="turnsum">${w.commands ? `<span>⌘ ${plural(w.commands, "work.cmd1", "work.cmdN")}</span>` : ""}${w.files ? `<span title="${esc(w.fileNames.join(", "))}">✎ ${plural(w.files, "work.file1", "work.fileN")} <b class="add">+${w.add}</b> <b class="del">−${w.del}</b></span>` : ""}${clock}</div>` : "";
    const body = `
<!--§--><div><span class="pill">${SL(a.status)}</span></div>
<!--§--><div class="now-card"><div class="now-k">${esc(now.k)}</div><div class="now-v">${esc(now.v)}</div>${now.s ? `<div class="now-s">${esc(now.s)}</div>` : ""}${now.at ? `<div class="now-s">${agoEl(now.at, true)}</div>` : ""}</div>
<!--§-->${workHtml}
<!--§-->${planHtml}
<!--§--><div class="standby ${a.standby ? "on" : ""}"><label class="sw"><input type="checkbox" data-standby ${a.standby ? "checked" : ""}><span></span></label><div class="sb-t"><b>${t("sb.title")}</b><small>${a.standby ? t("sb.on", { m: a.standby.minutes }) : t("sb.off")}${!s.demo && !s.hooks.standbyReady ? ` · <span class="warn">${t("sb.reinstall")}</span>` : ""}</small></div><select data-standby-min>${[15, 30, 55].map((m) => `<option value="${m}" ${(a.standby ? a.standby.minutes : 30) === m ? "selected" : ""}>${t("min", { n: m })}</option>`).join("")}</select></div>
<!--§--><dl class="meta">
        <div><dt>${t("meta.project")}</dt><dd title="${esc(a.cwd)}">${esc(a.project)}</dd></div>
        <div><dt>${t("meta.branch")}</dt><dd>${esc(a.branch || "—")}</dd></div>
        <div><dt>${t("meta.model")}</dt><dd>${esc(shortModel(a.model))}</dd></div>
        <div><dt>${t("meta.session")}</dt><dd class="mono">${esc(a.short)}</dd></div>
        <div><dt>${t("meta.joined")}</dt><dd>${agoEl(a.startedAt, true)}</dd></div>
        <div><dt>${t("meta.drones")}</dt><dd>${a.subagents ? t("meta.flying", { n: a.subagents }) : "—"}</dd></div>
      </dl>
<!--§--><div class="kpis">
        <div class="kpi"><b>${fmtTok(td.tokens)}</b><span>${t("kpi.tokens")}</span></div>
        <div class="kpi"><b>${fmtUsd(td.cost)}</b><span>${t("kpi.cost")}</span></div>
        <div class="kpi"><b>${td.tools}</b><span>${t("kpi.tools")}</span></div>
        <div class="kpi ${td.errors ? "err" : ""}"><b>${td.errors}</b><span>${t("kpi.errors")}</span></div>
      </div>
<!--§--><div><div class="sec-t">${t("sec.activity")} <small>${t("sec.60")}</small></div>${actBars}</div>
<!--§-->${orders.length ? `<div><div class="sec-t">${t("sec.orders")}</div><div class="orders">${orders.map((o) => `
        <div class="order"><div class="order-h"><span class="st ${o.status}">${OL(o.status)}</span><span>${hhmm(o.t)}${o.fromAgent ? " · " + t("ord.from", { x: esc(o.from) }) : ""}</span>${o.status === "pending" ? `${a.status !== "working" && s.wake && s.wake.available ? `<button data-wake="1" type="button" class="wake">${t("ord.wake")}</button>` : ""}<button data-cancel="${esc(o.id)}" type="button">${t("ord.cancel")}</button>` : ""}</div>
        ${o.copy ? `<div class="order-copy">${t("ord.copy", { c: esc(o.copy) })}</div>` : o.via === "wake:start" && o.status === "delivered" ? `<div class="order-copy">${t("ord.waking")}</div>` : ""}
        <div class="order-t clamp">${esc(o.text)}</div>${o.text.length > 220 || o.text.split("\n").length > 4 ? `<button type="button" class="more" data-read="order-text:${esc(o.id)}">${t("ord.readText")}</button>` : ""}
        ${o.note ? `<div class="order-n clamp">↳ ${esc(o.note)}</div>${o.noteLong || o.note.length > 220 || o.note.split("\n").length > 5 ? `<button type="button" class="more" data-read="order:${esc(o.id)}">${t("ord.readNote")}</button>` : ""}` : ""}</div>`).join("")}</div></div>` : ""}
<!--§-->${(a.bg && a.bg.length) ? `<div><div class="sec-t">${t("sec.bg")} <small>${t("bg.running", { n: a.bg.filter((x) => x.status === "running").length })}</small></div><div class="bgs">${a.bg.map((x) => `
        <div class="bgc" data-st="${x.status}">
          <div class="sub-h"><span class="bg-led"></span><b>${esc(x.description || t("bg.default"))}</b><span class="sub-st">${t("bg.st." + x.status)}${x.exitCode != null ? ` · exit ${x.exitCode}` : ""}</span></div>
          ${x.command ? `<code class="bg-cmd">$ ${esc(x.command)}</code>` : ""}
          <div class="sub-m"><span>${esc(x.id)}</span><span>${x.status === "running" ? t("bg.for", { t: agoEl(x.startedAt) }) : dur(x.startedAt, x.endedAt)}</span>${x.how !== "tool" ? `<span>${x.how === "timeout" ? t("bg.timeout") : "Ctrl+B"}</span>` : ""}${x.outputAt ? `<span>${t("bg.output", { t: agoEl(x.outputAt) })} · ${fmtTok(x.outputSize)}B</span>` : ""}</div>
          ${x.tail && x.tail.length ? `<pre class="bg-out">${esc(x.tail.join("\n"))}</pre>` : x.outputPath ? `<div class="sub-r">${t("bg.noOutput")}</div>` : ""}
          ${x.outputPath ? `<div class="bg-path" title="${esc(x.outputPath)}">${esc(x.outputPath)}</div>` : ""}
        </div>`).join("")}</div></div>` : ""}
<!--§-->${(a.subs && a.subs.length) ? `<div><div class="sec-t">${t("sec.subs")} <small>${t("meta.flying", { n: a.subs.filter((x) => x.status === "running").length })}</small></div><div class="subs">${a.subs.map((x) => `
        <div class="sub" data-st="${x.status}" style="--dc: hsl(${x.hue} 80% 66%)">
          <div class="sub-h"><span class="sub-ico">◈</span><b>${esc(x.type)}</b>${x.background ? `<span class="sub-bg">${t("sub.bg")}</span>` : ""}<span class="sub-st">${t("sub.st." + x.status)}</span></div>
          <div class="sub-d">${esc(x.description)}</div>
          ${x.status === "running" ? `<div class="sub-now">${x.tool ? `› ${esc(x.tool.name)}${x.tool.summary ? " · " + esc(x.tool.summary) : ""}` : t("sub.thinking")}</div>` : x.lastText ? `<div class="sub-r">↳ ${esc(x.lastText)}</div><button type="button" class="more" data-read="sub:${esc(a.id)}:${esc(x.id)}">${t("sub.read")}</button>` : ""}
          <div class="sub-m"><span>${esc(shortModel(x.model))}</span><span>${t("sub.tools", { n: x.tools })}${x.errors ? ` · ${t("sub.errors", { n: x.errors })}` : ""}</span><span>${fmtTok(x.tokens)} tok · ${fmtUsd(x.cost)}</span><span>${x.status === "running" ? agoEl(x.startedAt) : dur(x.startedAt, x.endedAt || x.lastActivity)}</span></div>
        </div>`).join("")}</div></div>` : ""}
<!--§-->${a.lastPrompt ? `<div><div class="sec-t">${t("sec.prompt")} <small>${agoEl(a.promptAt)} · <button type="button" class="more inline" data-read="prompt:${esc(a.id)}">${t("sec.expand")}</button></small></div><div class="quote">${esc(a.lastPrompt)}</div></div>` : ""}
<!--§-->${a.lastText ? `<div><div class="sec-t">${t("sec.reply")} <small>${agoEl(a.lastTextAt)} · <button type="button" class="more inline" data-read="reply:${esc(a.id)}">${t("sec.expand")}</button></small></div><div class="quote reply">${esc(a.lastText)}</div>${olderHtml}</div>` : ""}
<!--§-->${a.toolFeed.length ? `<div><div class="sec-t">${t("sec.tools")}</div><div class="tools">${a.toolFeed.slice().reverse().map((x) => `<div class="tool ${x.err ? "err" : ""}"><time>${hhmm(x.t)}</time><b>${esc(x.name)}</b><span>${esc(x.summary)}</span></div>`).join("")}</div></div>` : ""}`;
    const bodyEl = v.querySelector(".dt-body");
    // chỉ thay phần nào thực sự đổi, để nút bấm không bị vẽ lại giữa chừng
    const parts = body.split("<!--§-->").map((x) => x.trim()).filter(Boolean);
    const st = bodyEl.scrollTop;
    parts.forEach((html, k) => {
      let el = bodyEl.children[k];
      if (!el) { el = document.createElement("section"); bodyEl.appendChild(el); }
      if (el._html !== html) { el.innerHTML = html; el._html = html; fillAgo(el); fillSince(el); }
    });
    while (bodyEl.children.length > parts.length) bodyEl.lastElementChild.remove();
    bodyEl.scrollTop = st;
    const canWake = s.wake && s.wake.available && a.status !== "working";
    const wakeBtn = v.querySelector('[data-mode="wake"] span'), queueBtn = v.querySelector('[data-mode="queue"]');
    wakeBtn.textContent = canWake ? t("dt.wakeSend") : t("dt.send");
    queueBtn.hidden = !canWake;
    const n = esc(a.name);
    const hint = s.demo ? t("hint.demo")
      : a.status === "standby" ? t("hint.standby", { n })
      : a.status === "working" ? t(s.hooks.installed ? "hint.working" : "hint.workingNoHooks", { n })
      : canWake ? t("hint.wake", { n, f: s.wake.mode === "bg" ? "--bg " : "-p " })
      : t(s.hooks.installed ? "hint.idle" : "hint.idleNoHooks", { n });
    const hEl = v.querySelector(".compose-hint"); if (hEl._html !== hint) { hEl.innerHTML = hint; hEl._html = hint; }
  }
}
