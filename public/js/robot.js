// Robot phi hành gia: thân lơ lửng, đầu kính, mắt phát sáng theo trạng thái, tay gõ phím / vẫy / buông.
import * as THREE from "../vendor/three.bundle.js";
import { RoundedBoxGeometry } from "../vendor/three.bundle.js";

export const STATUS_COLOR = {
  standby: 0x2ee6c5,
  working: 0x46e3ff, ask: 0xffb340, done: 0x3ee08f, idle: 0x7d8cab, blocked: 0xff5470, offline: 0x3c475c, commander: 0xffd36e,
};

const geo = {
  torso: new RoundedBoxGeometry(0.8, 0.74, 0.58, 4, 0.2),
  belly: new THREE.TorusGeometry(0.31, 0.055, 10, 32),
  chest: new RoundedBoxGeometry(0.3, 0.13, 0.04, 2, 0.02),
  head: new THREE.SphereGeometry(0.4, 40, 28),
  visor: new THREE.SphereGeometry(0.405, 40, 24, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.24, Math.PI * 0.46),
  eye: new RoundedBoxGeometry(0.1, 0.15, 0.04, 2, 0.03),
  ear: new THREE.CylinderGeometry(0.1, 0.1, 0.09, 24),
  earRing: new THREE.TorusGeometry(0.1, 0.018, 8, 24),
  stalk: new THREE.CylinderGeometry(0.013, 0.013, 0.3, 8),
  tip: new THREE.SphereGeometry(0.048, 16, 12),
  shoulder: new THREE.SphereGeometry(0.12, 20, 14),
  upper: new THREE.CapsuleGeometry(0.075, 0.24, 6, 12),
  fore: new THREE.CapsuleGeometry(0.068, 0.22, 6, 12),
  hand: new THREE.SphereGeometry(0.085, 16, 12),
  base: new THREE.CylinderGeometry(0.2, 0.3, 0.16, 28),
  glow: new THREE.CircleGeometry(0.22, 28),
  flame: new THREE.ConeGeometry(0.17, 0.5, 20, 1, true),
  neck: new THREE.CylinderGeometry(0.1, 0.13, 0.14, 20),
};

const mats = {
  shell: new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.32, metalness: 0.12 }),
  joint: new THREE.MeshStandardMaterial({ color: 0x2a3244, roughness: 0.45, metalness: 0.7 }),
  visor: new THREE.MeshPhysicalMaterial({ color: 0x05070c, roughness: 0.08, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 }),
};

const lerp = (a, b, k) => a + (b - a) * k;

export class Robot {
  constructor({ hue = 200, scale = 1, commander = false } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(scale);
    this.status = "idle";
    this.seed = Math.random() * 100;
    this.blinkAt = 2 + Math.random() * 3;
    this.commander = commander;

    const ident = new THREE.Color().setHSL(hue / 360, 0.75, 0.58);
    if (commander) ident.set(0xffc94d);
    this.identColor = ident;
    this.statusColor = new THREE.Color(STATUS_COLOR.idle);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: this.statusColor.clone(), emissiveIntensity: 3.2 });
    this.tipMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: ident.clone(), emissiveIntensity: 3 });
    this.identMat = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: ident.clone(), emissiveIntensity: 2.2 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: this.statusColor.clone().multiplyScalar(2), transparent: true, opacity: 0.9, depthWrite: false });
    this.flameMat = new THREE.MeshBasicMaterial({ color: this.statusColor.clone().multiplyScalar(1.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shell = commander ? new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.3, metalness: 0.2 }) : mats.shell;

    // đế phản lực
    const base = new THREE.Mesh(geo.base, mats.joint); base.position.y = 0.42; this.body.add(base);
    const glow = new THREE.Mesh(geo.glow, this.glowMat); glow.rotation.x = Math.PI / 2; glow.position.y = 0.338; this.body.add(glow);
    this.flame = new THREE.Mesh(geo.flame, this.flameMat); this.flame.rotation.x = Math.PI; this.flame.position.y = 0.08; this.body.add(this.flame);

    // thân
    const torso = new THREE.Mesh(geo.torso, shell); torso.position.y = 0.88; this.body.add(torso);
    const belly = new THREE.Mesh(geo.belly, mats.joint); belly.rotation.x = Math.PI / 2; belly.position.y = 0.53; this.body.add(belly);
    const chest = new THREE.Mesh(geo.chest, this.identMat); chest.position.set(0, 0.98, 0.295); this.body.add(chest);
    for (const x of [-0.24, 0.24]) { const dot = new THREE.Mesh(geo.tip, this.eyeMat); dot.scale.setScalar(0.45); dot.position.set(x, 0.78, 0.295); this.body.add(dot); }
    const neck = new THREE.Mesh(geo.neck, mats.joint); neck.position.y = 1.29; this.body.add(neck);

    // đầu
    this.head = new THREE.Group(); this.head.position.y = 1.62; this.body.add(this.head);
    const skull = new THREE.Group(); skull.scale.set(1.14, 0.96, 1); this.head.add(skull);
    skull.add(new THREE.Mesh(geo.head, shell));
    const visor = new THREE.Mesh(geo.visor, mats.visor); skull.add(visor);
    this.eyes = [];
    for (const x of [-0.125, 0.125]) {
      const e = new THREE.Mesh(geo.eye, this.eyeMat); e.position.set(x, 0.03, 0.385); e.rotation.y = x * 0.9; skull.add(e); this.eyes.push(e);
    }
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(geo.ear, mats.joint); ear.rotation.z = Math.PI / 2; ear.position.set(s * 0.46, 0, 0); this.head.add(ear);
      const ring = new THREE.Mesh(geo.earRing, this.identMat); ring.rotation.y = Math.PI / 2; ring.position.set(s * 0.51, 0, 0); this.head.add(ring);
    }
    const stalk = new THREE.Mesh(geo.stalk, mats.joint); stalk.position.set(0.12, 0.5, 0); stalk.rotation.z = -0.25; this.head.add(stalk);
    this.tip = new THREE.Mesh(geo.tip, this.tipMat); this.tip.position.set(0.16, 0.66, 0); this.head.add(this.tip);
    if (commander) {
      const crest = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.03, 8, 40, Math.PI), this.identMat);
      crest.rotation.y = Math.PI / 2; crest.position.y = 0.02; this.head.add(crest);
    }

    // tay
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.47, 1.1, 0); this.body.add(sh);
      sh.add(new THREE.Mesh(geo.shoulder, mats.joint));
      const up = new THREE.Mesh(geo.upper, shell); up.position.y = -0.2; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.38; sh.add(el);
      const fo = new THREE.Mesh(geo.fore, shell); fo.position.y = -0.16; el.add(fo);
      const hand = new THREE.Mesh(geo.hand, mats.joint); hand.position.y = -0.33; el.add(hand);
      return { s, sh, el, rx: 0, rz: s * 0.08, ex: -0.15 };
    });
    this.root.traverse((o) => { if (o.isMesh) o.userData.robot = this; });
  }

  setStatus(s) {
    if (s === this.status) return;
    this.status = s;
    const c = new THREE.Color(STATUS_COLOR[s] ?? STATUS_COLOR.idle);
    this.statusColor.copy(c);
  }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 7);
    const s = this.status, T = t + this.seed;
    // màu chuyển mượt
    this.eyeMat.emissive.lerp(this.statusColor, k);
    this.glowMat.color.lerp(this.statusColor.clone().multiplyScalar(2), k);
    this.flameMat.color.lerp(this.statusColor.clone().multiplyScalar(1.6), k);
    const sleepy = s === "idle" || s === "offline";
    this.eyeMat.emissiveIntensity = lerp(this.eyeMat.emissiveIntensity, sleepy ? 0.9 : s === "ask" ? 3.4 + Math.sin(T * 6) * 1.2 : 3.2, k);

    // lơ lửng
    const amp = sleepy ? 0.035 : 0.06, spd = sleepy ? 1.1 : 2.1;
    this.body.position.y = 0.18 + Math.sin(T * spd) * amp;
    this.flame.scale.set(1, (sleepy ? 0.45 : 0.85) + Math.sin(T * 31) * 0.08 + Math.sin(T * 17) * 0.06, 1);

    // chớp mắt / ngủ
    this.blinkAt -= dt;
    let eyeY = 1;
    if (sleepy) eyeY = 0.22;
    else if (this.blinkAt < 0) { eyeY = 0.12; if (this.blinkAt < -0.12) this.blinkAt = 2.5 + Math.random() * 3.5; }
    if (s === "blocked") eyeY = 0.55;
    for (const e of this.eyes) e.scale.y = lerp(e.scale.y, eyeY, 1 - Math.exp(-dt * 22));

    // đèn ăng-ten
    const blink = s === "working" ? (Math.sin(T * 9) > 0 ? 3.6 : 0.6) : s === "ask" ? 2 + Math.sin(T * 5) * 1.6 : sleepy ? 0.5 : 2.4;
    this.tipMat.emissiveIntensity = blink;

    // đầu
    let hx = 0, hy = 0, hz = 0;
    if (s === "working") { hx = 0.22 + Math.sin(T * 1.7) * 0.04; hy = Math.sin(T * 0.6) * 0.12; }
    else if (s === "ask") { hx = -0.18; hz = Math.sin(T * 1.3) * 0.15; }
    else if (s === "done" || s === "standby") { hy = Math.sin(T * (s === "standby" ? 0.9 : 0.45)) * 0.55; hx = -0.05; }
    else if (s === "blocked") { hy = Math.sin(T * 3.5) * 0.35; hx = 0.25; }
    else if (sleepy) { hx = 0.42; hz = 0.15; }
    if (this.commander) { hx = 0.15 + Math.sin(T * 0.5) * 0.06; hy = Math.sin(T * 0.3) * 0.35; }
    this.head.rotation.x = lerp(this.head.rotation.x, hx, k);
    this.head.rotation.y = lerp(this.head.rotation.y, hy, k);
    this.head.rotation.z = lerp(this.head.rotation.z, hz, k);

    // tay
    for (const a of this.arms) {
      let rx = 0.05, rz = a.s * 0.1, ex = -0.15;
      if (s === "working" || this.commander) {
        const tap = Math.sin(T * (this.commander ? 3 : 14) + (a.s > 0 ? 0 : Math.PI));
        rx = -0.95 + tap * 0.07; rz = a.s * 0.2; ex = -0.75 + tap * 0.12;
        if (this.commander) { rx = -0.7 + tap * 0.05; ex = -0.5; }
      } else if (s === "ask" && a.s > 0) {
        rx = -0.2; rz = 2.55 + Math.sin(T * 7) * 0.22; ex = -0.4 + Math.sin(T * 7 + 1) * 0.25;
      } else if (s === "blocked") {
        rx = -0.3; rz = a.s * 2.2; ex = -2.2; // ôm đầu
      } else if (s === "done" || s === "standby") {
        rx = -0.15; rz = a.s * 0.18; ex = -0.35;
      } else if (sleepy) {
        rx = 0.25; rz = a.s * 0.05; ex = -0.05;
      }
      a.rx = lerp(a.rx, rx, k); a.rz = lerp(a.rz, rz, k); a.ex = lerp(a.ex, ex, k);
      a.sh.rotation.set(a.rx, 0, a.rz); a.el.rotation.x = a.ex;
    }
  }

  dispose() {
    for (const m of [this.eyeMat, this.tipMat, this.identMat, this.glowMat, this.flameMat]) m.dispose();
  }
}
