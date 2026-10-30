// Hiệu ứng: màn hình hologram, gói tin bay giữa các module, drone (subagent), biển trạng thái, vòng sóng.
import * as THREE from "../vendor/three.bundle.js";
import { t as tr, msg } from "./i18n.js";
import { CSS2DObject, RoundedBoxGeometry } from "../vendor/three.bundle.js";

const FONT = '"Chakra Petch", "Be Vietnam Pro", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const hex = (c) => "#" + new THREE.Color(c).getHexString();

export function radialTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)", size = 128) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const GLOW = radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
export const SHADOW = radialTexture("rgba(0,0,0,0.75)", "rgba(0,0,0,0)");

function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = String(text || "").split(/\s+/); let line = "", n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (g.measureText(test).width > maxW && line) {
      if (++n >= maxLines) { g.fillText(line.replace(/.{0,2}$/, "…"), x, y); return; }
      g.fillText(line, x, y); y += lh; line = words[i];
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}

// ---------- màn hình hologram trên bàn điều khiển ----------
export class HoloScreen {
  constructor(w = 1.56, h = 0.84, identColor = 0x46e3ff) {
    this.canvas = document.createElement("canvas"); this.canvas.width = 512; this.canvas.height = 276;
    this.g = this.canvas.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.group = new THREE.Group();
    // hai mặt đều đọc được: một tấm hướng về robot, một tấm hướng ra ngoài (không bị ngược chữ)
    const textMat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, toneMapped: false });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), textMat);
    front.rotation.y = Math.PI; front.position.z = -0.006;
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(w, h), textMat); rear.position.z = 0.006;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x07122a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), new THREE.LineBasicMaterial({ color: new THREE.Color(identColor).multiplyScalar(1.6), transparent: true, opacity: 0.9, toneMapped: false }));
    this.edges = edges;
    this.group.add(back, front, rear, edges);
    this.ident = hex(identColor);
    this.lines = Array.from({ length: 40 }, () => ({ w: 0.15 + Math.random() * 0.7, ind: Math.floor(Math.random() * 4), c: Math.random() }));
    this.scroll = 0; this.last = 0; this.state = {};
  }

  set(state) { this.state = state; }

  draw(t) {
    if (t - this.last < 0.11) return;
    const dt = t - this.last; this.last = t;
    const g = this.g, W = 512, H = 276, s = this.state || {};
    const status = s.status || "idle";
    const col = { standby: "#2ee6c5", working: "#46e3ff", ask: "#ffb340", done: "#3ee08f", idle: "#6f7f9c", blocked: "#ff5470", offline: "#3c475c" }[status] || "#46e3ff";
    g.clearRect(0, 0, W, H);
    // nền mờ
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "rgba(20,60,110,0.55)"); bg.addColorStop(1, "rgba(8,24,52,0.35)");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) { g.fillStyle = "rgba(120,200,255,0.035)"; g.fillRect(0, y, W, 1); }
    // tiêu đề
    g.fillStyle = col; g.fillRect(0, 0, W, 4);
    g.font = `600 22px ${FONT}`; g.fillStyle = "#e9f6ff"; g.textBaseline = "top";
    g.fillText(String(s.name || "").toUpperCase(), 18, 16);
    g.font = `500 15px ${MONO}`; g.fillStyle = col; g.textAlign = "right";
    g.fillText(tr("holo." + status), W - 18, 20);
    g.textAlign = "left";

    if (status === "working") {
      this.scroll += dt * 26;
      g.font = `500 17px ${MONO}`; g.fillStyle = "#bfe9ff";
      const tool = s.tool ? `${s.tool.name}` : tr("holo.thinking");
      g.fillText("› " + tool, 18, 52);
      g.font = `400 14px ${MONO}`; g.fillStyle = "rgba(191,233,255,0.7)";
      if (s.tool && s.tool.summary) wrap(g, s.tool.summary, 18, 76, W - 36, 18, 1);
      // dòng mã chạy
      g.save(); g.beginPath(); g.rect(14, 104, W - 28, H - 120); g.clip();
      const off = this.scroll % 16, first = Math.floor(this.scroll / 16);
      for (let i = 0; i < 11; i++) {
        const L = this.lines[(first + i) % this.lines.length], y = 108 + i * 16 - off;
        const x = 22 + L.ind * 22, w = (W - 60 - L.ind * 22) * L.w;
        g.fillStyle = L.c < 0.25 ? this.ident : L.c < 0.5 ? "rgba(160,220,255,0.75)" : "rgba(160,220,255,0.35)";
        g.fillRect(x, y, w, 7);
        if (L.c > 0.8) { g.fillStyle = col; g.fillRect(x + w + 8, y, 30, 7); }
      }
      g.restore();
      // con trỏ nhấp nháy
      if (Math.sin(t * 8) > 0) { g.fillStyle = col; g.fillRect(22, H - 22, 12, 4); }
    } else if (status === "ask" || status === "blocked") {
      g.font = `700 74px ${FONT}`; g.fillStyle = col; g.fillText(status === "ask" ? "?" : "!", 22, 60);
      g.font = `500 18px ${FONT}`; g.fillStyle = "#fff4e0";
      wrap(g, msg(s.ask) || tr(status === "ask" ? "holo.askDefault" : "holo.blockedDefault"), 90, 72, W - 110, 24, 6);
    } else if (status === "standby") {
      const left = Math.max(0, Math.round(((s.standbyUntil || 0) - Date.now()) / 60e3));
      g.font = `700 54px ${FONT}`; g.fillStyle = col; g.fillText("◉", 22, 56);
      g.font = `600 20px ${FONT}`; g.fillStyle = "#dffcf5"; g.fillText(tr("holo.sbTitle"), 90, 70);
      g.font = `400 15px ${MONO}`; g.fillStyle = "rgba(200,255,240,0.7)"; g.fillText(tr("holo.sbLeft", { m: left }), 90, 100);
      const r = 30 + (Math.sin(t * 3) + 1) * 10; g.strokeStyle = col; g.globalAlpha = 0.35; g.beginPath(); g.arc(46, 84, r, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    } else if (status === "done") {
      g.font = `700 54px ${FONT}`; g.fillStyle = col; g.fillText("✓", 22, 56);
      g.font = `400 16px ${FONT}`; g.fillStyle = "rgba(220,255,236,0.9)";
      wrap(g, s.lastText || tr("holo.doneDefault"), 84, 64, W - 104, 22, 7);
    } else {
      g.font = `600 44px ${FONT}`; g.fillStyle = "rgba(140,160,200,0.5)";
      const z = ["Z", "z", "z"]; z.forEach((c, i) => g.fillText(c, 30 + i * 34, 80 - i * 12 + Math.sin(t * 2 + i) * 4));
      g.font = `400 15px ${MONO}`; g.fillStyle = "rgba(140,160,200,0.6)";
      g.fillText(s.project ? `${s.project}${s.branch ? " @ " + s.branch : ""}` : "", 22, 150);
    }
    const nb = (s.bg || []).filter((x) => x.status === "running").length;
    if (nb) { g.font = `600 15px ${MONO}`; g.fillStyle = "#7ff5dd"; g.textAlign = "right"; g.fillText(tr("holo.bg", { n: nb }), W - 18, H - 72); g.textAlign = "left"; }
    const nd = (s.subs || []).filter((x) => x.status === "running").length;
    if (nd) { g.font = `600 15px ${MONO}`; g.fillStyle = "#d4b8ff"; g.textAlign = "right"; g.fillText(tr("holo.drones", { n: nd }), W - 18, H - 52); g.textAlign = "left"; }
    // thanh hoạt động 60 phút
    const act = s.activity || [];
    if (act.length) {
      const mx = Math.max(4, ...act), bw = (W - 36) / act.length;
      for (let i = 0; i < act.length; i++) {
        const h = (act[i] / mx) * 22; if (!h) continue;
        g.fillStyle = i > act.length - 4 ? col : "rgba(120,190,255,0.45)";
        g.fillRect(18 + i * bw, H - 8 - h, Math.max(1, bw - 2), h);
      }
    }
    this.tex.needsUpdate = true;
  }
}

// ---------- biển trạng thái lơ lửng trên đầu ----------
const signCache = new Map();
function signTexture(kind) {
  if (signCache.has(kind)) return signCache.get(kind);
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const col = { ask: "#ffb340", blocked: "#ff5470", idle: "#9fb0d0", done: "#3ee08f", order: "#ffd36e", standby: "#2ee6c5" }[kind];
  g.shadowColor = col; g.shadowBlur = 18; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 6;
  g.textAlign = "center"; g.textBaseline = "middle";
  if (kind === "idle") { g.font = `700 46px ${FONT}`; g.fillText("z", 44, 84); g.font = `700 34px ${FONT}`; g.fillText("z", 78, 50); }
  else {
    g.beginPath();
    if (kind === "ask" || kind === "order") { g.moveTo(64, 10); g.lineTo(118, 64); g.lineTo(64, 118); g.lineTo(10, 64); g.closePath(); }
    else if (kind === "blocked") { g.moveTo(64, 12); g.lineTo(120, 112); g.lineTo(8, 112); g.closePath(); }
    else { g.arc(64, 64, 50, 0, Math.PI * 2); }
    g.globalAlpha = 0.18; g.fill(); g.globalAlpha = 1; g.stroke();
    g.font = `700 60px ${FONT}`; g.fillStyle = "#fff";
    g.fillText(kind === "ask" ? "?" : kind === "blocked" ? "!" : kind === "order" ? "✉" : kind === "standby" ? "◉" : "✓", 64, kind === "blocked" ? 76 : 68);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  signCache.set(kind, t); return t;
}
export class StatusSign {
  constructor() {
    this.mat = new THREE.SpriteMaterial({ map: signTexture("ask"), transparent: true, depthWrite: false, toneMapped: false });
    this.sprite = new THREE.Sprite(this.mat); this.sprite.scale.setScalar(0.62); this.kind = null; this.sprite.visible = false;
  }
  set(kind) {
    if (kind === this.kind) return; this.kind = kind;
    this.sprite.visible = !!kind;
    if (kind) { this.mat.map = signTexture(kind); this.mat.needsUpdate = true; }
  }
  update(t, base) {
    if (!this.kind) return;
    this.sprite.position.y = base + Math.sin(t * 2.4) * 0.08 + (this.kind === "idle" ? Math.sin(t * 0.9) * 0.1 : 0);
    const p = this.kind === "ask" || this.kind === "blocked" ? 1 + Math.sin(t * 6) * 0.08 : 1;
    this.sprite.scale.setScalar(0.62 * p);
    this.mat.opacity = this.kind === "idle" ? 0.55 + Math.sin(t * 1.6) * 0.25 : 1;
  }
}

// ---------- gói tin bay ----------
const KIND_COLOR = { prompt: 0xffd36e, order: 0xffd36e, msg: 0x46e3ff, reply: 0x3ee08f, done: 0x3ee08f, report: 0x9b8cff, ask: 0xffb340, spawn: 0xc28bff };
export class Packets {
  constructor(scene) {
    this.scene = scene; this.list = []; this.pulses = [];
    this.coreGeo = new THREE.SphereGeometry(0.16, 16, 12);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  }
  send(from, to, kind) {
    const color = new THREE.Color(KIND_COLOR[kind] || 0x46e3ff);
    const a = from.clone(), b = to.clone();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const lift = 2.5 + a.distanceTo(b) * 0.28;
    const c1 = a.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, lift, 0));
    const c2 = b.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, lift, 0));
    const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
    const core = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: color.clone().multiplyScalar(1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.setScalar(1.1); core.add(halo);
    const N = 28, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    for (let i = 0; i < N; i++) a.toArray(pos, i * 3);
    this.scene.add(core, trail);
    const dur = 1.4 + a.distanceTo(b) * 0.04;
    this.list.push({ curve, core, trail, pos, col, N, color, t: 0, dur, to: b });
  }
  pulse(at, kind, scale = 1) {
    const color = new THREE.Color(KIND_COLOR[kind] || 0x46e3ff);
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: color.multiplyScalar(2.2), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at); m.position.y = Math.max(0.05, at.y - 1.6);
    this.scene.add(m); this.pulses.push({ m, t: 0, scale });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      const k = Math.min(1, p.t / p.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const P = p.curve.getPoint(e); p.core.position.copy(P);
      p.pos.copyWithin(3, 0, (p.N - 1) * 3); P.toArray(p.pos, 0);
      for (let j = 0; j < p.N; j++) { const f = Math.pow(1 - j / p.N, 1.6) * 1.8; p.col[j * 3] = p.color.r * f; p.col[j * 3 + 1] = p.color.g * f; p.col[j * 3 + 2] = p.color.b * f; }
      p.trail.geometry.attributes.position.needsUpdate = true; p.trail.geometry.attributes.color.needsUpdate = true;
      if (k >= 1) {
        this.pulse(p.to, Object.keys(KIND_COLOR).find((x) => KIND_COLOR[x] === p.color.getHex()) || "msg");
        this.scene.remove(p.core, p.trail); p.trail.geometry.dispose(); p.core.material.dispose(); p.trail.material.dispose(); p.core.children[0].material.dispose();
        this.list.splice(i, 1);
      }
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const q = this.pulses[i]; q.t += dt;
      const k = q.t / 1.0; q.m.scale.setScalar((0.3 + k * 1.9) * q.scale); q.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(q.m); q.m.material.dispose(); this.pulses.splice(i, 1); }
    }
  }
}

// ---------- drone = subagent đang chạy ----------
// Mỗi subagent là một drone riêng: bay ra từ ngực robot khi được phóng, quay vòng khi làm việc, bay về và thu nhỏ khi xong.
const droneGeo = {
  body: new THREE.SphereGeometry(0.13, 20, 14),
  ring: new THREE.TorusGeometry(0.2, 0.026, 8, 28),
  eye: new THREE.SphereGeometry(0.045, 10, 8),
  rotor: new THREE.BoxGeometry(0.26, 0.012, 0.05),
};
const droneShell = new THREE.MeshStandardMaterial({ color: 0xe8edf6, roughness: 0.3, metalness: 0.3 });
const CENTER = new THREE.Vector3(0, 0, -0.35);
const HOME = new THREE.Vector3(0, 1.25, -0.2);
export class Drones {
  constructor(parent) { this.parent = parent; this.items = new Map(); this.showLabels = false; this.n = 0; }

  set(subs) {
    const ids = new Set();
    for (const s of subs) {
      ids.add(s.id);
      let d = this.items.get(s.id);
      if (!d) d = this.spawn(s);
      d.data = s;
      if (d.leaving) { d.leaving = false; d.life = Math.max(d.life, 0.3); }
      d.name.textContent = s.type || "subagent";
      d.desc.textContent = s.description || "";
      d.tool.textContent = s.tool ? `${s.tool.name}${s.tool.summary ? " · " + s.tool.summary : ""}` : tr("sub.thinking").replace(/^›\s*/, "");
    }
    for (const [id, d] of this.items) if (!ids.has(id) && !d.leaving) { d.leaving = true; d.leaveT = 0; d.from = d.g.position.clone(); }
  }

  spawn(s) {
    const g = new THREE.Group();
    const color = new THREE.Color().setHSL((s.hue || 270) / 360, 0.8, 0.62);
    const glow = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.6), toneMapped: false });
    g.add(new THREE.Mesh(droneGeo.body, droneShell));
    const ring = new THREE.Mesh(droneGeo.ring, glow); ring.rotation.x = Math.PI / 2; g.add(ring);
    const eye = new THREE.Mesh(droneGeo.eye, glow); eye.position.set(0, 0.02, 0.12); g.add(eye);
    const rotor = new THREE.Mesh(droneGeo.rotor, new THREE.MeshStandardMaterial({ color: 0x2a3244, metalness: 0.7, roughness: 0.4 })); rotor.position.y = 0.17; g.add(rotor);
    const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    trail.scale.setScalar(0.6); g.add(trail);
    const el = document.createElement("div"); el.className = "dronetag";
    el.style.setProperty("--dc", `hsl(${s.hue || 270} 80% 68%)`);
    el.innerHTML = `<b></b><span class="dd"></span><span class="dt"></span>`;
    const label = new CSS2DObject(el); label.position.set(0, 0.36, 0); g.add(label);
    g.position.copy(HOME); g.scale.setScalar(0.01);
    this.parent.add(g);
    const k = this.n++;
    const d = { g, rotor, label, el, name: el.querySelector("b"), desc: el.querySelector(".dd"), tool: el.querySelector(".dt"), glow, trail, data: s,
      ph: k * 2.1 + Math.random(), rad: 1.35 + (k % 3) * 0.32, h: 2.35 + (k % 4) * 0.28, sp: 0.7 + Math.random() * 0.35, life: 0, leaving: false };
    this.items.set(s.id, d);
    return d;
  }

  posOf(id) { const d = this.items.get(id); return d ? d.g.getWorldPosition(new THREE.Vector3()) : null; }

  update(dt, t) {
    for (const [id, d] of this.items) {
      d.rotor.rotation.y += dt * 30;
      d.label.visible = this.showLabels && !d.leaving && d.life > 0.9;
      const a = d.ph + t * d.sp;
      const orbit = new THREE.Vector3(CENTER.x + Math.cos(a) * d.rad, d.h + Math.sin(t * 2.1 + d.ph) * 0.12, CENTER.z + Math.sin(a) * d.rad);
      if (d.leaving) {
        d.leaveT += dt / 0.9;
        const e = Math.min(1, d.leaveT);
        d.g.position.lerpVectors(d.from, HOME, e * e);
        d.g.scale.setScalar(Math.max(0.01, (1 - e) * 1.45));
        if (e >= 1) { this.parent.remove(d.g); d.label.element.remove(); d.glow.dispose(); this.items.delete(id); }
        continue;
      }
      d.life = Math.min(1, d.life + dt * 1.4);
      const e = 1 - Math.pow(1 - d.life, 3);
      d.g.position.lerpVectors(HOME, orbit, e);
      d.g.scale.setScalar(Math.max(0.01, e * 1.45));
      d.g.rotation.y = -a + Math.PI / 2;
      const busy = d.data && d.data.tool;
      d.trail.material.opacity = busy ? 0.45 + Math.sin(t * 10) * 0.25 : 0.35;
    }
  }
}

// ---------- giá máy chủ cạnh bàn = lệnh chạy nền ----------
// Mỗi lệnh nền là một lưỡi máy chủ: đèn nháy khi có đầu ra mới, xanh khi xong, đỏ khi lỗi, rồi rút ra sau một phút.
const bladeGeo = new RoundedBoxGeometry(0.36, 0.11, 0.26, 2, 0.02);
const ledGeo = new THREE.SphereGeometry(0.022, 8, 6);
const stripGeo = new THREE.BoxGeometry(0.2, 0.018, 0.01);
const BG_COLOR = { running: 0x2ee6c5, done: 0x3ee08f, failed: 0xff5470, killed: 0x8a96b0, stopped: 0x8a96b0 };
export class BgRack {
  constructor(parent) {
    this.g = new THREE.Group(); this.g.position.set(-1.42, 0, 0.95); this.g.rotation.y = 0.5; parent.add(this.g);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x232b3b, roughness: 0.45, metalness: 0.75 });
    this.frame = new THREE.Group(); this.g.add(this.frame);
    for (const x of [-0.21, 0.21]) for (const z of [-0.15, 0.15]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.05, 0.035), frameMat); post.position.set(x, 0.525, z); this.frame.add(post); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.34), frameMat); top.position.y = 1.06; this.frame.add(top);
    const foot = top.clone(); foot.position.y = 0.02; this.frame.add(foot);
    this.frame.visible = false;
    this.blades = new Map(); this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.4, metalness: 0.7 });
  }
  set(list, now) {
    const show = list.filter((x) => x.status === "running" || now - x.endedAt < 60e3).slice(0, 7);
    const ids = new Set(show.map((x) => x.id));
    show.forEach((x, i) => {
      let b = this.blades.get(x.id);
      if (!b) {
        const m = new THREE.Group();
        m.add(new THREE.Mesh(bladeGeo, this.bodyMat));
        const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(BG_COLOR.running).multiplyScalar(2.5), toneMapped: false });
        const led = new THREE.Mesh(ledGeo, ledMat); led.position.set(0.13, 0, 0.135); m.add(led);
        const strip = new THREE.Mesh(stripGeo, ledMat); strip.position.set(-0.05, 0, 0.133); m.add(strip);
        m.position.set(0, 0.12 + i * 0.14, 0.5); this.g.add(m);
        b = { m, ledMat, led, strip, slide: 0, out: false };
        this.blades.set(x.id, b);
      }
      b.data = x; b.y = 0.12 + i * 0.14; b.out = false;
      b.fresh = x.status === "running" && x.outputAt && now - x.outputAt < 4000;
      b.color = new THREE.Color(BG_COLOR[x.status] || BG_COLOR.running);
    });
    for (const [id, b] of this.blades) if (!ids.has(id)) b.out = true;
    this.frame.visible = this.blades.size > 0;
  }
  update(dt, t) {
    for (const [id, b] of this.blades) {
      b.slide = Math.max(0, Math.min(1, b.slide + (b.out ? -dt * 1.5 : dt * 2)));
      b.m.position.z = (1 - b.slide) * 0.5; b.m.position.y += ((b.y ?? b.m.position.y) - b.m.position.y) * Math.min(1, dt * 6);
      b.m.scale.setScalar(Math.max(0.01, b.slide));
      const running = b.data && b.data.status === "running";
      const blink = running ? (b.fresh ? (Math.sin(t * 22) > 0 ? 3 : 0.4) : 1.6 + Math.sin(t * 2 + b.y * 9) * 0.6) : 2.6;
      b.ledMat.color.copy(b.color || new THREE.Color(BG_COLOR.running)).multiplyScalar(blink);
      b.strip.scale.x = running ? 0.4 + 0.6 * Math.abs(Math.sin(t * (b.fresh ? 7 : 1.3) + b.y * 5)) : 1;
      if (b.out && b.slide <= 0) { this.g.remove(b.m); b.ledMat.dispose(); this.blades.delete(id); }
    }
    if (!this.blades.size) this.frame.visible = false;
  }
}
