// Cảnh 3D: hành tinh, bầu trời sao, trạm vành khuyên với module cho từng phi hành gia, đài chỉ huy ở giữa.
import * as THREE from "../vendor/three.bundle.js";
import { t as tr } from "./i18n.js";
import { OrbitControls, CSS2DRenderer, CSS2DObject, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment, RoundedBoxGeometry } from "../vendor/three.bundle.js";
import { Robot, STATUS_COLOR } from "./robot.js";
import { HoloScreen, StatusSign, Packets, Drones, BgRack, GLOW, SHADOW } from "./fx.js";

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*snoise(p); p*=2.03; a*=0.5; } return s; }
`;

const SUN_DIR = new THREE.Vector3(0.75, 0.42, -0.5).normalize();

export class StationScene {
  constructor(container, { onSelect, onHover } = {}) {
    this.container = container;
    this.onSelect = onSelect || (() => {}); this.onHover = onHover || (() => {});
    this.pods = new Map(); // id -> pod
    this.slotCount = 0;
    this.quality = "high";
    this.clock = new THREE.Clock();
    this.focusAnim = null;
    this.selected = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.setSize(container.clientWidth, container.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(container.clientWidth, container.clientHeight);
    Object.assign(this.labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020309);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;

    this.camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 3000);
    this.camera.position.set(0, 19, 33);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.06, minDistance: 6, maxDistance: 90, maxPolarAngle: Math.PI * 0.49, autoRotate: true, autoRotateSpeed: 0.22, rotateSpeed: 0.6 });
    this.controls.target.set(0, 0.8, 0);
    this.controls.addEventListener("start", () => { this.focusAnim = null; this.userTouchedAt = performance.now(); });

    // ánh sáng
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.9); sun.position.copy(SUN_DIR).multiplyScalar(60); this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a2a55, 0.35));
    const earthshine = new THREE.DirectionalLight(0x3b7bff, 0.55); earthshine.position.set(-10, -30, 10); this.scene.add(earthshine);

    this.buildSky();
    this.buildPlanet();
    this.station = new THREE.Group(); this.scene.add(this.station);
    this.buildHub();
    this.layout(8);
    this.packets = new Packets(this.scene);

    // hậu kỳ: phát sáng
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth / 2, container.clientHeight / 2), 0.62, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // chọn bằng chuột
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2(); this.hoverId = null;
    r.domElement.addEventListener("pointermove", (e) => this.pointer(e, false));
    r.domElement.addEventListener("pointerdown", (e) => { this.downAt = [e.clientX, e.clientY]; this.downMoved = false; });
    r.domElement.addEventListener("click", (e) => this.pointer(e, true));
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.overview(true);
    r.setAnimationLoop(() => this.frame());
  }

  // ---------- bầu trời ----------
  buildSky() {
    // tinh vân: tính nhiễu một lần vào texture (không tốn GPU mỗi khung hình)
    const nebTex = this.bake(2048, 1024, `
        float n = fbm(d*2.2 + vec3(3.0,1.0,0.0));
        float m = fbm(d*4.5 - vec3(1.0,7.0,2.0));
        float band = exp(-pow((d.y*0.8 + d.x*0.45 - 0.15)*2.4, 2.0));
        vec3 col = vec3(0.006,0.008,0.02);
        col += vec3(0.16,0.06,0.30) * smoothstep(0.0,0.9,n) * band * 0.55;
        col += vec3(0.02,0.14,0.30) * smoothstep(0.1,0.8,m) * band * 0.45;
        col += vec3(0.30,0.12,0.18) * smoothstep(0.45,0.9,n*m*2.0) * band * 0.25;
        gl_FragColor = vec4(col,1.0);`);
    const neb = new THREE.Mesh(new THREE.SphereGeometry(1400, 64, 32), new THREE.MeshBasicMaterial({ map: nebTex, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(neb);

    const N = 4200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    const tint = [new THREE.Color(0xffffff), new THREE.Color(0xbcd4ff), new THREE.Color(0xffe2bd), new THREE.Color(0xd8c8ff)];
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(700 + Math.random() * 500);
      v.toArray(pos, i * 3);
      const c = tint[Math.floor(Math.random() * tint.length)]; c.toArray(col, i * 3);
      size[i] = Math.pow(Math.random(), 6) * 3.4 + 0.7; ph[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1)); g.setAttribute("phase", new THREE.BufferAttribute(ph, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPR: { value: this.renderer.getPixelRatio() } },
      vertexShader: `attribute float size; attribute float phase; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uTime; uniform float uPR;
        void main(){ vC=color; vA=0.65+0.35*sin(uTime*(0.6+fract(phase)*2.0)+phase); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uPR*1.6; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float a=smoothstep(0.5,0.0,r); a=a*a; gl_FragColor=vec4(vC*vA*1.4, a*vA); }`,
    });
    this.scene.add(new THREE.Points(g, this.starMat));

    // mặt trời
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(1.0, 0.92, 0.78).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sun.position.copy(SUN_DIR).multiplyScalar(1100); sun.scale.setScalar(150); this.scene.add(sun);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(1.0, 0.75, 0.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.copy(sun.position); halo.scale.setScalar(520); this.scene.add(halo);

    // bụi không gian quanh trạm
    const D = 500, dp = new Float32Array(D * 3);
    for (let i = 0; i < D; i++) { dp[i * 3] = (Math.random() - 0.5) * 120; dp[i * 3 + 1] = (Math.random() - 0.5) * 50; dp[i * 3 + 2] = (Math.random() - 0.5) * 120; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x8fb4ff, size: 0.09, transparent: true, opacity: 0.45, depthWrite: false }));
    this.scene.add(this.dust);
  }

  // Vẽ trước một texture hình chữ nhật (kinh độ × vĩ độ) bằng shader, dùng cho hành tinh, mây, tinh vân.
  bake(w, h, body) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
    const mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: NOISE + `varying vec2 vUv;
        void main(){ float th=(1.0-vUv.y)*3.14159265; float ph=vUv.x*6.28318531;
          vec3 d=vec3(-cos(ph)*sin(th), cos(th), sin(ph)*sin(th)); ${body} }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), sc = new THREE.Scene(); sc.add(quad);
    const prevTM = this.renderer.toneMapping; this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(rt); this.renderer.render(sc, new THREE.Camera()); this.renderer.setRenderTarget(null);
    this.renderer.toneMapping = prevTM;
    mat.dispose(); quad.geometry.dispose();
    return rt.texture;
  }

  buildPlanet() {
    const R = 150;
    this.planet = new THREE.Group();
    this.planet.position.set(-40, -190, -150);
    this.scene.add(this.planet);
    const sunU = { value: SUN_DIR.clone() };
    const surface = `vec3 p=d*1.7; float n=fbm(p)+0.25*fbm(p*3.1); float land=smoothstep(0.04,0.1,n);`;
    const albedo = this.bake(2048, 1024, surface + `
      vec3 deep=vec3(0.01,0.05,0.16), shallow=vec3(0.04,0.22,0.42);
      vec3 ocean=mix(deep,shallow,smoothstep(-0.35,0.06,n));
      vec3 green=vec3(0.12,0.24,0.10), sand=vec3(0.42,0.35,0.22), rock=vec3(0.30,0.28,0.26);
      vec3 lc=mix(green,sand,smoothstep(0.12,0.38,n+0.1*snoise(p*6.0))); lc=mix(lc,rock,smoothstep(0.42,0.6,n));
      vec3 col=mix(ocean,lc,land);
      col=mix(col,vec3(0.86,0.9,0.95),smoothstep(0.80,0.9,abs(d.y)+n*0.12));
      gl_FragColor=vec4(col,1.0);`);
    const misc = this.bake(2048, 1024, surface + `
      float city=smoothstep(0.55,0.75,snoise(p*38.0))*land*(1.0-smoothstep(0.75,0.85,abs(d.y)));
      gl_FragColor=vec4(land,city,0.0,1.0);`);
    const cloudTex = this.bake(2048, 1024, `vec3 p=d*2.6; float c=fbm(p)+0.4*fbm(p*2.7); gl_FragColor=vec4(smoothstep(0.08,0.55,c),0.0,0.0,1.0);`);
    this.planetMat = new THREE.ShaderMaterial({
      uniforms: { uSun: sunU, uAlbedo: { value: albedo }, uMisc: { value: misc } },
      vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vW;
        void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; uniform sampler2D uAlbedo; uniform sampler2D uMisc; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
        void main(){
          vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW);
          vec3 col=texture2D(uAlbedo,vUv).rgb; vec2 m=texture2D(uMisc,vUv).rg; float land=m.r;
          float d=dot(N,uSun); float day=smoothstep(-0.12,0.3,d);
          vec3 lit=col*(0.03+max(d,0.0)*1.25);
          vec3 R=reflect(-uSun,N); float spec=pow(max(dot(R,V),0.0),28.0)*(1.0-land)*day;
          vec3 night=vec3(1.0,0.62,0.28)*m.g*(1.0-day)*0.9;
          float fr=pow(1.0-max(dot(N,V),0.0),2.5);
          vec3 atm=vec3(0.25,0.55,1.0)*fr*(0.15+day*0.9);
          gl_FragColor=vec4(lit+spec*vec3(0.9,0.85,0.7)*0.7+night+atm,1.0);
        }`,
    });
    this.planetMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), this.planetMat);
    this.planet.add(this.planetMesh);
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSun: sunU, uTex: { value: cloudTex }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec2 vUv; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uSun; uniform sampler2D uTex; uniform float uTime; varying vec3 vN; varying vec2 vUv;
        void main(){ float a=texture2D(uTex,vUv+vec2(uTime*0.0006,0.0)).r; float d=max(dot(normalize(vN),uSun),0.0);
          gl_FragColor=vec4(vec3(0.95)*(0.05+d*1.1),a*0.85*(0.25+0.75*smoothstep(-0.1,0.3,d))); }`,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 96, 64), this.cloudMat);
    this.planet.add(this.clouds);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uSun: sunU },
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 V=normalize(cameraPosition-vW); float i=pow(clamp(0.72+dot(vN,V),0.0,1.0),3.2)*1.6; float d=smoothstep(-0.4,0.6,dot(-vN,uSun)*-1.0+0.2);
          gl_FragColor=vec4(vec3(0.3,0.6,1.0)*i*(0.25+d),i); }`,
    }));
    this.planet.add(atmo);
    this.planet.rotation.z = 0.35;
  }

  // ---------- trạm: đài chỉ huy ----------
  hull() { return new THREE.MeshStandardMaterial({ color: 0xa9b3c2, roughness: 0.42, metalness: 0.55 }); }
  dark() { return new THREE.MeshStandardMaterial({ color: 0x232b3b, roughness: 0.42, metalness: 0.75 }); }
  glow(color, k = 2.4) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }); }

  buildHub() {
    const hub = (this.hub = new THREE.Group());
    this.station.add(hub);
    const hull = this.hull(), dark = this.dark();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.95, 0.5, 64), hull); deck.position.y = -0.25; hub.add(deck);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.45, 0.03, 64), new THREE.MeshStandardMaterial({ color: 0x151b28, roughness: 0.5, metalness: 0.6 })); floor.position.y = 0.01; hub.add(floor);
    for (const [r, c] of [[3.05, 0x46e3ff], [2.2, 0x3a7bff]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 96), this.glow(c, 1.6)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.035; hub.add(ring); }
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 2.1, 3.4, 64), hull); body.position.y = -2.2; hub.add(body);
    for (const [y, r] of [[-1.15, 2.95], [-2.6, 2.5]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 96), this.glow(0x46e3ff, 1.8)); b.rotation.x = Math.PI / 2; b.position.y = y; hub.add(b); }
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 1.4, 40), dark); port.position.y = -4.55; hub.add(port);
    const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 48), this.glow(0xffb340, 2)); portRing.rotation.x = Math.PI / 2; portRing.position.y = -5.25; hub.add(portRing);
    // cửa sổ quanh thân
    const win = new THREE.InstancedMesh(new RoundedBoxGeometry(0.34, 0.18, 0.06, 2, 0.04), this.glow(0xffe2b0, 1.6), 28);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; m.makeRotationY(-a + Math.PI / 2).setPosition(Math.cos(a) * 2.78, -1.75, Math.sin(a) * 2.78); win.setMatrixAt(i, m); }
    hub.add(win);

    // bàn hologram + quả địa cầu
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.8, 48), dark); table.position.set(0, 0.4, 0.55); hub.add(table);
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 8, 64), this.glow(0x46e3ff, 2.2)); top.rotation.x = Math.PI / 2; top.position.set(0, 0.81, 0.55); hub.add(top);
    this.globe = new THREE.Group(); this.globe.position.set(0, 1.75, 0.55); hub.add(this.globe);
    this.globe.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46e3ff).multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1d6dff).multiplyScalar(0.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })));
    const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.012, 6, 96), this.glow(0xffd36e, 2)); orbitRing.rotation.x = 1.2; this.globe.add(orbitRing);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 0.9, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x46e3ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0, 1.25, 0.55); hub.add(beam);

    // chỉ huy
    this.commander = new Robot({ commander: true, scale: 1.6 });
    this.commander.root.position.set(0, 0, -1.25);
    this.commander.setStatus("commander");
    hub.add(this.commander.root);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.04, -1.25); hub.add(shadow);
    const tag = document.createElement("div"); tag.className = "nametag commander"; tag.innerHTML = `<span class="nt-name">${escapeHtml(tr("commander"))}</span>`;
    this.commanderTag = tag;
    const lab = new CSS2DObject(tag); lab.position.set(0, 4.5, -1.25); hub.add(lab);
    this.commanderPos = new THREE.Vector3(0, 3.0, -1.25);

    // vòm kính
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.75, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vW; void main(){ vec3 V=normalize(cameraPosition-vW); float f=pow(1.0-abs(dot(vN,V)),3.5); gl_FragColor=vec4(vec3(0.3,0.6,1.0)*f*0.45, f*0.35); }`,
    }));
    hub.add(dome);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(3.75, 0.07, 8, 96), hull); frame.rotation.x = Math.PI / 2; frame.position.y = 0.02; hub.add(frame);
    for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(3.75, 0.035, 6, 64, Math.PI), this.dark()); rib.rotation.y = (i / 4) * Math.PI; hub.add(rib); }

    // cột ăng-ten
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 4.6, 12), hull); mast.position.y = 5.9; hub.add(mast);
    this.dish = new THREE.Group(); this.dish.position.y = 6.6; hub.add(this.dish);
    const dishM = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 12, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xe6ebf2, roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide }));
    dishM.rotation.x = -Math.PI / 2 - 0.5; dishM.position.z = 0.35; this.dish.add(dishM);
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(1, 0.2, 0.2).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.beacon.position.y = 8.3; this.beacon.scale.setScalar(0.9); hub.add(this.beacon);

    // tấm pin mặt trời (hai bên, phía sau)
    this.wings = new THREE.Group(); this.station.add(this.wings);
  }

  solarTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 512; const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 256, 512); gr.addColorStop(0, "#14306a"); gr.addColorStop(0.5, "#0d2350"); gr.addColorStop(1, "#1b3f86");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = "rgba(170,200,255,0.35)"; g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    for (let y = 0; y <= 512; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.strokeStyle = "rgba(220,230,255,0.7)"; g.lineWidth = 6; g.strokeRect(0, 0, 256, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }

  buildWings(R) {
    this.station.remove(this.wings);
    this.wings = new THREE.Group(); this.station.add(this.wings);
    this.navLights = [];
    const tex = this.solarTexture();
    const panelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22, metalness: 0.75, emissive: 0x0a1a3a, emissiveIntensity: 0.4 });
    const hull = this.hull(), dark = this.dark();
    const z = -(R + 5.5), y = -2.8, half = R + 16;
    // xà dọc từ thân đài chỉ huy ra phía sau, xà ngang mang pin
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, -z - 2, 16), hull); spine.rotation.x = Math.PI / 2; spine.position.set(0, y, (z - 2) / 2); this.wings.add(spine);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.3, 0.3), hull); cross.position.set(0, y, z); this.wings.add(cross);
    const node = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24), dark); node.rotation.x = Math.PI / 2; node.position.set(0, y, z); this.wings.add(node);
    const nodeRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.04, 6, 40), this.glow(0x46e3ff, 1.6)); nodeRing.position.set(0, y, z + 0.8); this.wings.add(nodeRing);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = s * (5 + i * 5.2 + (half - 26) * 0.5);
        for (const dz of [-2.3, 2.3]) {
          const pnl = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.06, 4.1), panelMat); pnl.position.set(x, y, z + dz); pnl.rotation.x = dz > 0 ? -0.18 : 0.18; this.wings.add(pnl);
        }
      }
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(s > 0 ? 0x3cff8a : 0xff4040).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      tip.position.set(s * half, y + 0.3, z); tip.scale.setScalar(0.9); this.wings.add(tip); this.navLights.push(tip);
    }
  }

  // ---------- vành trạm và các module ----------
  layout(n) {
    const S = n <= 8 ? 8 : n <= 12 ? 12 : Math.ceil(n / 4) * 4;
    if (S === this.slotCount) return;
    this.slotCount = S;
    this.R = S <= 8 ? 12.5 : S <= 12 ? 16.5 : 4 + S * 1.05;
    const R = this.R;
    if (this.ringGroup) this.station.remove(this.ringGroup);
    const g = (this.ringGroup = new THREE.Group()); this.station.add(g);
    const hull = this.hull(), dark = this.dark();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.48, 24, 200), hull); ring.rotation.x = Math.PI / 2; ring.position.y = -0.55; g.add(ring);
    for (const [r, y, c] of [[R + 0.47, -0.5, 0x46e3ff], [R - 0.47, -0.5, 0x3a7bff]]) { const l = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 200), this.glow(c, 1.4)); l.rotation.x = Math.PI / 2; l.position.y = y; g.add(l); }
    // cửa sổ trên vành
    const W = Math.floor(R * 6), win = new THREE.InstancedMesh(new RoundedBoxGeometry(0.28, 0.13, 0.06, 2, 0.03), this.glow(0xffe2b0, 1.3), W);
    const m = new THREE.Matrix4();
    for (let i = 0; i < W; i++) { const a = (i / W) * Math.PI * 2; m.makeRotationY(-a + Math.PI / 2).setPosition(Math.cos(a) * (R + 0.46), -0.55, Math.sin(a) * (R + 0.46)); win.setMatrixAt(i, m); }
    g.add(win);
    // nan hoa
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const len = R - 4.2;
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, len, 16), hull);
      sp.rotation.z = Math.PI / 2; sp.position.set((3.9 + len / 2), -0.5, 0);
      const holder = new THREE.Group(); holder.rotation.y = -a; holder.add(sp);
      const lights = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, len * 0.8, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46e3ff).multiplyScalar(1.2), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      lights.rotation.z = Math.PI / 2; lights.position.copy(sp.position); holder.add(lights);
      g.add(holder);
    }
    // module trống cho mọi chỗ
    this.slotPods = [];
    for (let i = 0; i < S; i++) this.slotPods.push(this.buildPod(i, S, R, g, hull, dark));
    this.buildWings(R);
    // gắn lại robot đang có vào chỗ mới
    for (const p of this.pods.values()) this.attach(p, p.slot);
    if (this.camera) this.overview(false);
  }

  // chỗ ngồi xếp từ phía trước (gần camera) ra sau, xen kẽ phải/trái
  slotAngle(i, S) {
    if (!this._angles || this._angles.S !== S) {
      const list = Array.from({ length: S }, (_, k) => Math.PI / 2 - Math.PI / S - (k * Math.PI * 2) / S);
      list.sort((a, b) => Math.sin(b) - Math.sin(a) || Math.cos(b) - Math.cos(a));
      this._angles = { S, list };
    }
    return this._angles.list[i % S];
  }

  buildPod(i, S, R, parent, hull, dark) {
    const a = this.slotAngle(i, S);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const g = new THREE.Group();
    g.position.set(out.x * R, 0, out.z * R);
    g.rotation.y = Math.atan2(out.x, out.z);
    parent.add(g);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.5, 0.3, 6), hull); floor.position.y = -0.15; floor.rotation.y = Math.PI / 6; g.add(floor);
    const inset = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.55, metalness: 0.6 })); inset.position.y = 0.01; inset.rotation.y = Math.PI / 6; g.add(inset);
    const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(STATUS_COLOR.offline).multiplyScalar(1.2), toneMapped: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.04, 6, 6), rimMat); rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.y = 0.04; g.add(rim);
    // bàn điều khiển (phía ngoài)
    const ped = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.92, 0.4, 3, 0.08), dark); ped.position.set(0, 0.46, 1.3); g.add(ped);
    const desk = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.1, 0.66, 3, 0.04), dark); desk.position.set(0, 0.96, 1.22);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.025, 0.025), this.glow(0x46e3ff, 1.4)); lip.position.set(0, 0.96, 0.89); g.add(lip); g.add(desk);
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46e3ff).multiplyScalar(0.9), transparent: true, opacity: 0.5, toneMapped: false })); keys.rotation.x = -Math.PI / 2; keys.position.set(0, 1.015, 1.1); g.add(keys);
    // vòm khung phía trong
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.055, 8, 40, Math.PI), dark); arch.position.set(0, 0.0, -1.55); g.add(arch);
    const archLight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), this.glow(0x46e3ff, 2)); archLight.position.set(0, 2.05, -1.55); g.add(archLight);
    // lan can phía ngoài
    const rail = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.03, 6, 32, Math.PI * 0.62), hull); rail.rotation.set(Math.PI / 2, 0, Math.PI * 0.19); rail.position.y = 0.55; g.add(rail);
    // vùng bấm
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.5; g.add(hit);
    // khi bến trống: màn hình tắt + vòng cập bến xoay chậm
    const empty = new THREE.Group(); g.add(empty);
    const off = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.84), new THREE.MeshBasicMaterial({ color: 0x0a1428, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    off.position.set(0, 1.62, 1.5); off.rotation.x = 0.16; empty.add(off);
    const offEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.56, 0.84)), new THREE.LineBasicMaterial({ color: 0x2c4a72 }));
    offEdge.position.copy(off.position); offEdge.rotation.copy(off.rotation); empty.add(offEdge);
    const dock = new THREE.Group(); dock.position.y = 0.05; empty.add(dock);
    const arcGeo = this._arcGeo || (this._arcGeo = new THREE.TorusGeometry(1.25, 0.03, 4, 6, Math.PI / 14));
    const arcMat = this._arcMat || (this._arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46e3ff).multiplyScalar(0.55), transparent: true, opacity: 0.8 }));
    for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(arcGeo, arcMat); m.rotation.set(Math.PI / 2, 0, (k / 14) * Math.PI * 2); dock.add(m); }
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), arcMat); dot.rotation.x = -Math.PI / 2; dot.position.y = 0.01; dock.add(dot);
    return { group: g, rimMat, archLight, out, hit, index: i, empty, dock };
  }

  attach(p, slot) {
    const sp = this.slotPods[slot % this.slotPods.length];
    sp.group.add(p.group);
    p.slotPod = sp; p.slot = slot;
    sp.hit.userData.agentId = p.id;
  }

  createAgentPod(a) {
    const robot = new Robot({ hue: a.hue });
    const group = new THREE.Group();
    robot.root.position.set(0, 0, -0.35); robot.root.scale.setScalar(1.32);
    group.add(robot.root);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.045, -0.35); shadow.scale.setScalar(1.3); group.add(shadow);
    const screen = new HoloScreen(1.56, 0.84, robot.identColor);
    screen.group.position.set(0, 1.62, 1.5); screen.group.rotation.x = 0.16; group.add(screen.group);
    const sign = new StatusSign(); sign.sprite.position.set(0, 3.3, -0.35); group.add(sign.sprite);
    const drones = new Drones(group);
    const rack = new BgRack(group);
    const tag = document.createElement("div"); tag.className = "nametag";
    tag.innerHTML = `<span class="nt-dot"></span><span class="nt-name"></span><span class="nt-tool"></span>`;
    tag.addEventListener("click", () => this.onSelect(a.id));
    const label = new CSS2DObject(tag); label.position.set(0, 3.95, -0.35); group.add(label);
    const p = { id: a.id, group, robot, screen, sign, drones, rack, tag, label, shadow, status: null, data: a };
    this.pods.set(a.id, p);
    this.attach(p, a.slot);
    // xuất hiện: dịch chuyển tức thời
    group.scale.setScalar(0.01); p.spawn = 0;
    this.packets.pulse(this.headPos(p), "spawn", 1.6);
    return p;
  }

  removePod(p) {
    p.slotPod.group.remove(p.group);
    p.slotPod.hit.userData.agentId = null;
    p.robot.dispose();
    p.label.element.remove();
    this.pods.delete(p.id);
  }

  headPos(p) { const v = new THREE.Vector3(0, 2.4, -0.35); return p.group.localToWorld(v); }
  posOf(id) {
    if (id === "commander") return this.commanderPos.clone();
    if (String(id).startsWith("sub:")) { for (const p of this.pods.values()) { const v = p.drones.posOf(String(id).slice(4)); if (v) return v; } return null; }
    const p = this.pods.get(id); return p ? this.headPos(p) : null;
  }

  // ---------- dữ liệu ----------
  update(state) {
    const agents = state.agents || [];
    const maxSlot = agents.reduce((m, a) => Math.max(m, a.slot + 1), 0);
    this.layout(Math.max(agents.length, maxSlot));
    const ids = new Set(agents.map((a) => a.id));
    for (const p of [...this.pods.values()]) if (!ids.has(p.id)) this.removePod(p);
    for (const a of agents) {
      const p = this.pods.get(a.id) || this.createAgentPod(a);
      if (p.slot !== a.slot) this.attach(p, a.slot);
      p.data = a;
      p.robot.setStatus(a.status);
      p.screen.set(a);
      const running = (a.subs || []).filter((x) => x.status === "running");
      // bản Claude Code cũ không có chi tiết subagent: tạo drone ẩn danh theo số lượng
      for (let i = running.length; i < (a.subagents || 0); i++) running.push({ id: "legacy-" + i, type: "subagent", hue: 270 });
      p.drones.set(running);
      p.drones.showLabels = this.selected === a.id;
      const match = !this.filter || this.filter(a);
      p.rack.set(a.bg || [], state.now);
      p.group.visible = match; p.label.visible = match; p.hidden = !match;
      p.sign.set(a.status === "ask" ? "ask" : a.status === "blocked" ? "blocked" : a.status === "standby" ? "standby" : a.status === "idle" ? "idle" : a.openOrders ? "order" : null);
      p.slotPod.rimMat.color.copy(new THREE.Color(STATUS_COLOR[a.status] || STATUS_COLOR.idle)).multiplyScalar(a.status === "idle" || a.status === "offline" ? 0.6 : 1.8);
      p.slotPod.archLight.material.color.copy(p.robot.identColor).multiplyScalar(2.2);
      if (p.status !== a.status) { p.tag.dataset.status = a.status; p.status = a.status; }
      p.tag.querySelector(".nt-name").textContent = a.name;
      const tool = a.status === "working" && a.tool ? a.tool.name : a.status === "ask" ? tr("tag.ask") : "";
      p.tag.querySelector(".nt-tool").textContent = tool;
      p.tag.classList.toggle("sel", this.selected === a.id);
    }
    for (const sp of this.slotPods) {
      const occ = sp.hit.userData.agentId && this.pods.get(sp.hit.userData.agentId);
      const free = !occ || occ.hidden;
      sp.empty.visible = free;
      if (free) { sp.rimMat.color.set(STATUS_COLOR.offline).multiplyScalar(0.9); sp.archLight.material.color.set(0x334055); }
    }
    const cmd = !state.commander || state.commander === "Chỉ huy" ? tr("commander") : state.commander;
    const ch = `<span class="nt-name">${escapeHtml(cmd)}</span><span class="nt-tool">${escapeHtml(state.commanderTitle || tr("bridge"))}</span>`;
    if (this.commanderTag._html !== ch) { this.commanderTag.innerHTML = ch; this.commanderTag._html = ch; }
  }

  event(e) {
    const from = this.posOf(e.from), to = this.posOf(e.to);
    if (e.kind === "spawn" && from) { this.packets.pulse(from, "spawn", 0.8); return; }
    if (e.kind === "subdone" && to) { this.packets.pulse(to, "done", 0.8); return; }
    if (!from || !to) return;
    if (from.distanceTo(to) < 0.5) { this.packets.pulse(to, e.kind); return; }
    this.packets.send(from, to, e.kind);
  }

  // ---------- camera ----------
  overview(instant) {
    const R = this.R || 12.5;
    const pos = new THREE.Vector3(0, R * 1.12, R * 3.2), tgt = new THREE.Vector3(0, -1.6, 0);
    this.selected = null;
    this.flyTo(pos, tgt, instant);
    this.controls.autoRotate = this.autoRotateWanted !== false;
  }
  focus(id) {
    const p = this.pods.get(id); if (!p) return;
    this.selected = id;
    const out = p.slotPod.out, tan = new THREE.Vector3(-out.z, 0, out.x);
    const base = p.slotPod.group.position.clone();
    const tgt = base.clone().add(out.clone().multiplyScalar(0.4)).add(new THREE.Vector3(0, 1.6, 0));
    const pos = base.clone().add(out.clone().multiplyScalar(8.4)).add(tan.multiplyScalar(4.6)).add(new THREE.Vector3(0, 4.4, 0));
    this.controls.autoRotate = false;
    this.flyTo(pos, tgt, false);
  }
  flyTo(pos, tgt, instant) {
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); return; }
    const lift = Math.min(8, this.camera.position.distanceTo(pos) * 0.25);
    this.focusAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, start: performance.now(), dur: 1500, lift };
  }
  setFilter(fn) { this.filter = fn || null; }
  setAutoRotate(on) { this.autoRotateWanted = on; this.controls.autoRotate = on && !this.selected; }
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q === "high" ? Math.min(window.devicePixelRatio, 1.75) : 1);
    this.clouds.visible = q === "high";
    this.resize();
  }

  pointer(e, click) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray.intersectObjects(this.slotPods.map((s) => s.hit), false);
    let id = hits.length ? hits[0].object.userData.agentId : null;
    if (id && this.pods.get(id) && this.pods.get(id).hidden) id = null;
    if (click) { if (this.downMoved) return; if (id) this.onSelect(id); return; }
    if (this.downAt && Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 6) this.downMoved = true;
    if (id !== this.hoverId) { this.hoverId = id; this.renderer.domElement.style.cursor = id ? "pointer" : ""; this.onHover(id); }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.labels.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h);
    this.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.focusAnim) {
      const f = this.focusAnim; f.k = Math.min(1, (performance.now() - f.start) / f.dur);
      const e = f.k < 0.5 ? 4 * f.k ** 3 : 1 - Math.pow(-2 * f.k + 2, 3) / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.camera.position.y += Math.sin(Math.PI * e) * f.lift; this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) this.focusAnim = null;
    }
    this.controls.update();
    this.starMat.uniforms.uTime.value = t;
    this.cloudMat.uniforms.uTime.value = t;
    this.planetMesh.rotation.y = t * 0.004; this.clouds.rotation.y = t * 0.004;
    this.dust.rotation.y = t * 0.003;
    this.globe.rotation.y = t * 0.5;
    this.dish.rotation.y = Math.sin(t * 0.2) * 1.2;
    this.beacon.material.opacity = Math.sin(t * 3) > 0.6 ? 1 : 0.15;
    for (const l of this.navLights || []) l.material.opacity = Math.sin(t * 2.2 + l.position.x) > 0.7 ? 1 : 0.1;
    this.commander.update(dt, t);
    for (const p of this.pods.values()) {
      if (p.spawn < 1) { p.spawn = Math.min(1, p.spawn + dt * 1.6); const e = 1 - Math.pow(1 - p.spawn, 3); p.group.scale.setScalar(Math.max(0.01, e)); }
      p.robot.update(dt, t);
      p.screen.draw(t);
      p.sign.update(t, 3.3);
      p.drones.update(dt, t);
      p.rack.update(dt, t);
      p.shadow.material.opacity = 0.7 - Math.sin(t * 2) * 0.08;
      const pulse = p.status === "ask" || p.status === "blocked" ? 0.6 + Math.sin(t * 5) * 0.4 : 1;
      p.slotPod.rimMat.opacity = pulse; p.slotPod.rimMat.transparent = pulse < 1;
    }
    for (const sp of this.slotPods) if (sp.empty.visible) sp.dock.rotation.y = t * 0.25;
    this.packets.update(dt);
    if (this.quality === "high") this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
