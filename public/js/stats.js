import { t, locale } from "./i18n.js";
import { fmtTok } from "./hud.js";
// Hộp "Thống kê": token + chi phí ước tính theo ngày / loại token / mô hình / dự án, trong 30 ngày qua hoặc tháng này.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtUsd = (v) => "$" + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const dm = (key) => key.slice(8) + "/" + key.slice(5, 7);
const RANGE_KEY = "orbit.monthRange", POLL_MS = 5000;

export class Stats {
  constructor() {
    this.range = "30"; this.data = null; this.timer = null;
    try { if (localStorage.getItem(RANGE_KEY) === "month") this.range = "month"; } catch {}
    $("#moClose").onclick = () => this.close();
    $("#monthBox").addEventListener("click", (e) => { if (e.target.id === "monthBox") this.close(); });
    $("#moTabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-range]"); if (!b) return;
      this.range = b.dataset.range; this.data = null;
      try { localStorage.setItem(RANGE_KEY, this.range); } catch {}
      this.load();
    });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.isOpen()) { e.stopImmediatePropagation(); this.close(); } }, true);
  }

  isOpen() { return !$("#monthBox").hidden; }

  open() { $("#monthBox").hidden = false; this.load(); this.timer = setInterval(() => this.load(), POLL_MS); }
  close() { $("#monthBox").hidden = true; clearInterval(this.timer); this.timer = null; }
  relang() { if (this.data) this.paint(); }

  async load() {
    const range = this.range;
    try {
      const r = await fetch("/api/month?range=" + range);
      if (!/json/.test(r.headers.get("content-type") || "")) throw new Error(t("reader.stale"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.code ? t("err." + j.code) : j.error || `HTTP ${r.status}`);
      if (range !== this.range) return;
      this.data = j; this.paint();
    } catch (e) { $("#moMeta").textContent = e.message; }
  }

  paint() {
    const d = this.data;
    for (const b of $("#moTabs").children) b.classList.toggle("on", b.dataset.range === this.range);
    $("#moMeta").textContent = t("mo.updated", { t: new Date(d.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false }) });
    const tot = d.total;
    if (!tot.tokens && !d.scan.running) { $("#moBody").innerHTML = `<p class="muted mo-empty">${t("mo.empty")}</p>`; return; }
    const kpi = (v, k, sub) => `<div class="kpi mo-kpi"><b>${v}</b><span>${k}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const html = [
      d.scan.running ? `<div class="mo-scan">${t("mo.scanning", { done: d.scan.done, total: d.scan.total })}</div>` : "",
      `<div class="mo-kpis">
        ${kpi(fmtTok(tot.tokens), t("mo.tokens"), "")}
        ${kpi(fmtUsd(tot.cost), t("mo.cost"), d.topDay ? t("mo.peak", { d: dm(d.topDay.d), c: fmtUsd(d.topDay.cost) }) : "")}
        ${kpi(fmtUsd(d.avgCost), t("mo.avg"), t("mo.avgSub", { n: d.activeDays }))}
        ${kpi(d.sessions, t("mo.sessions"), d.agents ? t("mo.sessionsSub", { n: d.agents }) : "")}
        ${kpi(tot.replies.toLocaleString(locale()), t("mo.replies"), "")}
      </div>`,
      `<section><div class="sec-t">${t("mo.daily")}</div>${this.chart(d.days)}</section>`,
      `<section><div class="sec-t">${t("mo.types")}</div>${this.types(tot)}</section>`,
      `<div class="mo-cols"><section><div class="sec-t">${t("mo.models")}</div>${this.rows(d.models)}</section>
        <section><div class="sec-t">${t("mo.projects")}</div>${this.rows(d.projects)}</section></div>`,
      `<p class="mo-note">${t("mo.note")}</p>`,
    ].join("");
    if (this.html !== html) { $("#moBody").innerHTML = html; this.html = html; }
  }

  chart(days) {
    const w = 600, h = 120, mx = Math.max(0.01, ...days.map((x) => x.cost)), bw = w / days.length, today = days[days.length - 1].d;
    const bars = days.map((x, i) => {
      const bh = x.cost > 0 ? Math.max(2, (x.cost / mx) * (h - 4)) : 1;
      return `<rect class="${x.d === today ? "today" : ""}" x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" opacity="${x.cost > 0 ? 1 : 0.25}"><title>${dm(x.d)} · ${fmtUsd(x.cost)} · ${fmtTok(x.tokens)} tok</title></rect>`;
    }).join("");
    return `<svg class="mo-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${bars}</svg>
      <div class="mo-axis"><span>${dm(days[0].d)}</span><span>${t("mo.peakAxis", { c: fmtUsd(mx) })}</span><span>${dm(today)}</span></div>`;
  }

  types(tot) {
    const parts = [["in", tot.in], ["out", tot.out], ["cr", tot.cr], ["cw", tot.cw]];
    const sum = Math.max(1, tot.tokens);
    return `<div class="mo-stack">${parts.map(([k, v]) => `<i data-k="${k}" style="width:${((v / sum) * 100).toFixed(2)}%"></i>`).join("")}</div>
      <div class="mo-legend">${parts.map(([k, v]) => `<span data-k="${k}"><i></i>${t("mo." + k)} <b>${fmtTok(v)}</b> <em>${((v / sum) * 100).toFixed(1)}%</em></span>`).join("")}</div>`;
  }

  rows(list) {
    if (!list.length) return `<p class="muted">${t("mo.empty")}</p>`;
    const mx = Math.max(0.0001, list[0].cost);
    return `<div class="mo-rows">${list.map((x) => `<div class="mo-row"><span class="mo-n" title="${esc(x.name)}">${esc(x.name)}</span><span class="mo-v">${fmtUsd(x.cost)}</span><span class="mo-t">${fmtTok(x.tokens)}</span><span class="mo-bar"><span style="width:${((x.cost / mx) * 100).toFixed(1)}%"></span></span></div>`).join("")}</div>`;
  }
}
