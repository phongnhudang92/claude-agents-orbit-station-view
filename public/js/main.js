// Khởi động: nối dữ liệu trạm (SSE) với cảnh 3D và lớp giao diện.
import { StationScene } from "./scene.js";
import { Hud } from "./hud.js";
import { Launcher } from "./launcher.js";
import { Stats } from "./stats.js";
import { initLang, getLang, setLang, applyStatic, t } from "./i18n.js";

const BUILD = "2026.10.30-7"; // phải khớp với server.js
const TOKEN = document.querySelector('meta[name="orbit-token"]').content;
const bootAt = Date.now();
let state = null, lastEventId = 0, selected = null;

initLang();
applyStatic();
const langLabel = () => (document.getElementById("langLabel").textContent = getLang().toUpperCase());
langLabel();

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Orbit-Token": TOKEN }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.code ? t("err." + j.code) : j.error || `HTTP ${r.status}`);
  return j;
}

function select(id) {
  selected = id;
  hud.select(id);
  if (id) scene.focus(id); else scene.overview(false);
  if (state) scene.update(state);
}

const hud = new Hud({
  onSelect: (id) => select(id),
  onClose: () => select(null),
  onSend: (to, text, wake) => post("/api/send", { to, text, wake, lang: getLang() }),
  onWake: (to) => post("/api/wake", { to }),
  onStandby: (to, on, minutes) => post("/api/standby", { to, on, minutes }),
  onCancel: (id) => post("/api/cancel", { id }).catch((e) => alert(e.message)),
  onHover: () => {},
  onFilter: () => { if (scene) { scene.setFilter(hud.filter.size ? (a) => hud.matches(a) : null); if (state) scene.update(state); } },
});

const launcher = new Launcher({ launch: (body) => post("/api/launch", body) });
const stats = new Stats();
const modalOpen = () => launcher.isOpen() || stats.isOpen() || !document.getElementById("reader").hidden;

let scene;
try {
  scene = new StationScene(document.getElementById("stage"), { onSelect: (id) => select(id) });
  scene.setFilter(hud.filter.size ? (a) => hud.matches(a) : null);
} catch (e) {
  document.getElementById("stage").innerHTML = `<div class="empty panel" style="display:block"><h2>${t("gl.title")}</h2><p>${e.message}</p><p class="muted">${t("gl.body")}</p></div>`;
  throw e;
}

function apply(s) {
  state = s;
  const stale = s.build !== BUILD, warn = document.getElementById("stale");
  if (warn.hidden !== !stale) warn.hidden = !stale;
  const btnNew = document.getElementById("btnNew");
  if (btnNew.hidden !== !s.launch) btnNew.hidden = !s.launch;
  const btnStats = document.getElementById("btnStats");
  if (btnStats.hidden !== !s.hasMonth) btnStats.hidden = !s.hasMonth;
  scene.update(s);
  hud.render(s);
  // gói tin bay cho tín hiệu mới
  for (const e of s.events) {
    if (e.id <= lastEventId) continue;
    if (e.t > bootAt - 4000) scene.event(e);
  }
  for (const e of s.events) if (e.id > lastEventId) lastEventId = e.id;
  if (selected && !s.agents.some((a) => a.id === selected)) select(null);
}

function connect() {
  const es = new EventSource("/api/events");
  const conn = document.getElementById("conn");
  es.onmessage = (m) => { conn.hidden = true; try { apply(JSON.parse(m.data)); } catch (e) { console.error(e); } };
  es.onerror = () => { conn.hidden = false; };
}
connect();

// điều khiển
const btnRotate = document.getElementById("btnRotate"), btnQuality = document.getElementById("btnQuality");
const openLauncher = () => { if (state && state.launch) launcher.open(state.launch); };
document.getElementById("btnNew").onclick = openLauncher;
document.getElementById("btnStats").onclick = () => stats.open();
document.getElementById("btnOverview").onclick = () => select(null);
btnRotate.onclick = () => { const on = !btnRotate.classList.contains("on"); btnRotate.classList.toggle("on", on); scene.setAutoRotate(on); };
btnQuality.onclick = () => { const on = !btnQuality.classList.contains("on"); btnQuality.classList.toggle("on", on); scene.setQuality(on ? "high" : "low"); };
document.getElementById("btnLang").onclick = () => {
  setLang(getLang() === "vi" ? "en" : "vi");
  langLabel(); applyStatic(); hud.relang(); stats.relang();
  if (state) scene.update(state);
};
window.addEventListener("keydown", (e) => {
  if (e.target.closest("textarea, input") || modalOpen()) return;
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
  if ((e.key === "n" || e.key === "N") && plain) { e.preventDefault(); openLauncher(); return; }
  if ((e.key === "s" || e.key === "S") && plain && state && state.hasMonth) { e.preventDefault(); stats.open(); return; }
  if (e.key === "Escape" || e.key === "0") select(null);
  if (state && /^[1-9]$/.test(e.key)) { const a = state.agents[Number(e.key) - 1]; if (a) select(a.id); }
});
