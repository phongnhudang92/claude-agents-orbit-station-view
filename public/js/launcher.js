import { t } from "./i18n.js";
// Hộp "Phiên mới": chọn thư mục + cách mở (Terminal hoặc chạy nền) + lệnh đầu tiên, rồi nhờ máy chủ mở phiên Claude Code.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LAST_DIR = "orbit.launchDir";

export class Launcher {
  constructor({ launch }) {
    this.launch = launch;
    this.caps = null;
    $("#lcClose").onclick = $("#lcCancel").onclick = () => this.close();
    $("#launcher").addEventListener("click", (e) => { if (e.target.id === "launcher") this.close(); });
    $("#lcRecent").addEventListener("click", (e) => { const b = e.target.closest("[data-dir]"); if (b) { $("#lcDir").value = b.dataset.dir; $("#lcPrompt").focus(); } });
    for (const r of document.querySelectorAll('input[name="lcMode"]')) r.onchange = () => this.syncMode();
    $("#lcPrompt").onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#lcForm").requestSubmit(); } };
    $("#lcForm").onsubmit = (e) => { e.preventDefault(); this.submit(); };
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.isOpen()) { e.stopImmediatePropagation(); this.close(); } }, true);
  }

  isOpen() { return !$("#launcher").hidden; }
  mode() { return document.querySelector('input[name="lcMode"]:checked').value; }

  async open(caps) {
    this.caps = caps || {};
    this.show();
    const radios = Object.fromEntries([...document.querySelectorAll('input[name="lcMode"]')].map((r) => [r.value, r]));
    radios.terminal.disabled = !this.caps.terminal || !this.caps.claude;
    radios.desktop.disabled = !this.caps.desktop;
    radios.bg.disabled = !this.caps.bg || !this.caps.claude;
    (Object.values(radios).find((r) => !r.disabled) || radios.terminal).checked = true;
    if (!this.caps.claude) this.show("err", t("lc.noClaude"));
    this.syncMode();
    $("#launcher").hidden = false;
    let last = ""; try { last = localStorage.getItem(LAST_DIR) || ""; } catch {}
    if (!$("#lcDir").value) $("#lcDir").value = last;
    $("#lcDir").focus();
    try {
      const r = await fetch("/api/folders");
      const j = await r.json();
      this.paintFolders(j.folders || []);
      if (!$("#lcDir").value) $("#lcDir").value = (j.folders && j.folders[0] ? j.folders[0].path : j.home) || "";
    } catch { this.paintFolders([]); }
  }

  close() { $("#launcher").hidden = true; }

  paintFolders(list) {
    $("#lcRecent").innerHTML = list.length
      ? `<span>${t("lc.recent")}</span>` + list.map((f) => `<button type="button" data-dir="${esc(f.path)}" title="${esc(f.path)}">${esc(f.name || f.path)}</button>`).join("")
      : `<span class="muted">${t("lc.noRecent")}</span>`;
  }

  syncMode() {
    const mode = this.mode();
    $("#lcPromptNote").textContent = `(${t(mode === "bg" ? "lc.promptReq" : mode === "desktop" ? "lc.promptDesk" : "lc.promptOpt")})`;
    $("#lcSubmit").disabled = document.querySelector('input[name="lcMode"]:checked').disabled;
  }

  show(kind, text) {
    const err = $("#lcErr"), ok = $("#lcOk");
    err.hidden = ok.hidden = true;
    if (!kind) return;
    const el = kind === "err" ? err : ok;
    el.textContent = text; el.hidden = false;
  }

  async submit() {
    const mode = this.mode(), cwd = $("#lcDir").value.trim(), prompt = $("#lcPrompt").value.trim();
    if (mode === "bg" && !prompt) return this.show("err", t("err.needPrompt"));
    const btn = $("#lcSubmit"), label = btn.querySelector("span");
    btn.disabled = true; label.textContent = t("lc.opening"); this.show();
    try {
      const r = await this.launch({ mode, cwd, prompt });
      try { localStorage.setItem(LAST_DIR, cwd); } catch {}
      $("#lcPrompt").value = "";
      this.show("ok", t({ bg: "lc.okBg", desktop: "lc.okDesktop", terminal: "lc.okTerminal" }[r.via], { d: r.dir, id: r.bgId ? ` · ${r.bgId}` : "" }));
    } catch (e) { this.show("err", e.message); }
    label.textContent = t("lc.open"); this.syncMode();
  }
}
