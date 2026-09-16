import './style.css';
import * as THREE from 'three';
import { projects } from './projects.js';
import { ArtCanvas } from './art.js';
import { initWallet } from './wallet.js';

document.body.classList.add('loading');
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Sky (Three.js) ---------------- */
const canvas = document.getElementById('sky');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x07080d, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.position.set(0, 0, 60);

// Nebula backdrop
const nebula = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { uTime: { value: 0 }, uScroll: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform float uTime; uniform float uScroll; uniform vec2 uRes;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }
      void main(){
        vec2 uv = vUv; uv.x *= uRes.x/uRes.y;
        vec2 q = uv*1.6 + vec2(uTime*.01, uScroll*.4);
        float n = fbm(q + fbm(q*1.3 + uTime*.02));
        vec3 ink = vec3(.027,.031,.051);
        vec3 blue = vec3(.16,.22,.38);
        vec3 amber = vec3(1.,.54,.24);
        vec3 col = ink + blue * smoothstep(.45,.9,n) * .35;
        col += amber * smoothstep(.62,1.,n) * .12 * (1. - uScroll*.6);
        float v = distance(vUv, vec2(.5)); col *= 1. - v*.9;
        gl_FragColor = vec4(col, 1.);
      }`
  })
);
nebula.renderOrder = -1;
scene.add(nebula);

// Background stars
const STAR_COUNT = innerWidth < 800 ? 2200 : 4500;
{
  const pos = new Float32Array(STAR_COUNT * 3);
  const size = new Float32Array(STAR_COUNT);
  const tint = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 120 + Math.random() * 600;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) - 20;
    size[i] = Math.pow(Math.random(), 6) * 6 + 0.8;
    tint[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  var starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float aSize; attribute float aTint; uniform float uTime; uniform float uPR;
      varying float vTint; varying float vTw;
      void main(){ vTint = aTint; vTw = .6 + .4*sin(uTime*(1.+aTint*3.) + aTint*50.);
        vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPR * (300. / -mv.z); }`,
    fragmentShader: `
      varying float vTint; varying float vTw;
      void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,0.,d); a*=a;
        vec3 c = mix(vec3(.75,.82,1.), vec3(1.,.85,.7), vTint);
        gl_FragColor = vec4(c, a*vTw); }`
  });
  scene.add(new THREE.Points(g, starMat));
}

// Hydra constellation — a stylised serpent with Alphard at its heart
const hydraGroup = new THREE.Group();
scene.add(hydraGroup);
const hydraPts = [
  [-38, 14, 0], [-33, 17, -2], [-29, 13, 1], [-31, 9, 0], [-24, 6, -1], [-16, 3, 2],
  [-8, -1, 0], [0, 0, 0], [9, -4, 1], [17, -3, -2], [24, -8, 0], [31, -7, 1], [37, -12, -1], [44, -14, 0], [52, -19, 1]
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const ALPHARD_INDEX = 7;

const lineGeo = new THREE.BufferGeometry().setFromPoints(
  new THREE.CatmullRomCurve3(hydraPts, false, 'centripetal').getPoints(400)
);
const lineMat = new THREE.LineBasicMaterial({ color: 0x6f8fc7, transparent: true, opacity: 0.35 });
const hydraLine = new THREE.Line(lineGeo, lineMat);
lineGeo.setDrawRange(0, 0);
hydraGroup.add(hydraLine);

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,.6)');
  g.addColorStop(0.4, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

const nodeSprites = hydraPts.map((p, i) => {
  if (i === ALPHARD_INDEX) return null;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc8d6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.copy(p); s.scale.setScalar(2.4);
  hydraGroup.add(s);
  return s;
});

// Alphard itself — a pulsing orange giant with a corona shader
const alphard = new THREE.Mesh(
  new THREE.PlaneGeometry(26, 26),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uBoost;
      void main(){
        vec2 p = vUv - .5; float d = length(p); float a = atan(p.y, p.x);
        float core = smoothstep(.06, .0, d);
        float halo = .018 / (d + .01);
        float rays = pow(abs(cos(a*2.)), 60.) * smoothstep(.5, .0, d) * .9 + pow(abs(cos(a*2.+.785)), 120.) * smoothstep(.35,.0,d)*.4;
        float flick = .85 + .15*sin(uTime*1.7) + .05*sin(uTime*7.3);
        vec3 col = vec3(1., .93, .82) * core + vec3(1., .54, .24) * (halo * flick + rays) * (1. + uBoost);
        float alpha = clamp(core + halo*.9 + rays, 0., 1.) * smoothstep(.5, .35, d);
        gl_FragColor = vec4(col, alpha);
      }`
  })
);
alphard.position.copy(hydraPts[ALPHARD_INDEX]);
hydraGroup.add(alphard);

// Dust drifting toward Alphard
const DUST = 900;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
const dustSeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) { dustSeed[i] = Math.random(); }
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.18, color: 0xffb070, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
hydraGroup.add(dust);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  nebula.material.uniforms.uRes.value.set(w, h);
  hydraGroup.scale.setScalar(w < 800 ? 0.6 : 1);
}
addEventListener('resize', resize);
resize();

const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / innerWidth - 0.5;
  mouse.y = e.clientY / innerHeight - 0.5;
});

let scrollP = 0, drawP = 0, boost = 0, targetBoost = 0;
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  const max = document.documentElement.scrollHeight - innerHeight;
  const sp = max > 0 ? scrollY / max : 0;
  scrollP += (sp - scrollP) * 0.06;
  mouse.sx += (mouse.x - mouse.sx) * 0.05;
  mouse.sy += (mouse.y - mouse.sy) * 0.05;

  // Draw the serpent in as the loader completes, then keep it
  drawP += ((loaded ? 1 : 0) - drawP) * 0.02;
  lineGeo.setDrawRange(0, Math.floor(401 * drawP));
  nodeSprites.forEach((s, i) => { if (s) s.material.opacity = THREE.MathUtils.clamp(drawP * hydraPts.length - i, 0, 1) * (0.7 + 0.3 * Math.sin(t * 2 + i)); });

  boost += (targetBoost - boost) * 0.08;
  alphard.material.uniforms.uTime.value = t;
  alphard.material.uniforms.uBoost.value = boost;
  alphard.scale.setScalar(0.4 + drawP * 0.6 + boost * 0.25);
  starMat.uniforms.uTime.value = t;
  nebula.material.uniforms.uTime.value = t;
  nebula.material.uniforms.uScroll.value = scrollP;

  // Dust spirals into the star
  const c = hydraPts[ALPHARD_INDEX];
  for (let i = 0; i < DUST; i++) {
    const s = dustSeed[i];
    const life = (t * 0.05 * (0.5 + s) + s) % 1;
    const r = (1 - life) * (10 + s * 26);
    const a = s * 60 + life * 6;
    dustPos[i * 3] = c.x + Math.cos(a) * r;
    dustPos[i * 3 + 1] = c.y + Math.sin(a) * r * 0.45;
    dustPos[i * 3 + 2] = c.z + Math.sin(a * 0.5) * r * 0.3;
  }
  dustGeo.attributes.position.needsUpdate = true;

  // Camera choreography across the page
  const ease = scrollP * scrollP * (3 - 2 * scrollP);
  camera.position.x = THREE.MathUtils.lerp(8, -14, ease) + mouse.sx * 6;
  camera.position.y = THREE.MathUtils.lerp(-2, 6, ease) - mouse.sy * 4;
  camera.position.z = THREE.MathUtils.lerp(58, 34, Math.sin(ease * Math.PI)) + (ease > 0.85 ? (ease - 0.85) * 120 : 0);
  camera.lookAt(THREE.MathUtils.lerp(4, 0, ease), 0, 0);
  hydraGroup.rotation.y = mouse.sx * 0.15 + Math.sin(t * 0.05) * 0.05;
  hydraGroup.rotation.z = -0.08 + ease * 0.2;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ---------------- Loader ---------------- */
let loaded = false;
const loaderEl = document.getElementById('loader');
const num = document.getElementById('loader-num');
const fill = document.getElementById('loader-fill');
const status = document.getElementById('loader-status');
const phases = ['calibrating', 'mapping hydra', 'resolving α', 'locked'];
let pct = 0;
const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
let fontsDone = false;
fontsReady.then(() => (fontsDone = true));
function loadStep() {
  const cap = fontsDone ? 100 : 86;
  pct = Math.min(cap, pct + Math.random() * (prefersReduced ? 20 : 4.5));
  num.textContent = String(Math.floor(pct)).padStart(3, '0');
  fill.style.width = pct + '%';
  status.textContent = phases[Math.min(3, Math.floor(pct / 26))];
  if (pct >= 100) {
    setTimeout(() => {
      loaderEl.classList.add('done');
      document.body.classList.remove('loading');
      loaded = true;
      document.querySelectorAll('.hero .reveal').forEach((el, i) => setTimeout(() => el.classList.add('in'), 250 + i * 140));
    }, 350);
  } else setTimeout(loadStep, 40);
}
loadStep();
tick();

/* ---------------- Clock (approximate local sidereal time) ---------------- */
const clockEl = document.getElementById('clock');
function updateClock() {
  const now = new Date();
  const jd = now.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  let gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lon = -now.getTimezoneOffset() / 60; // rough longitude from timezone
  let lst = (gmst + lon + 24) % 24;
  const h = Math.floor(lst), m = Math.floor((lst - h) * 60), s = Math.floor(((lst - h) * 60 - m) * 60);
  clockEl.textContent = `LST ${[h, m, s].map((v) => String(v).padStart(2, '0')).join(':')}`;
}
setInterval(updateClock, 1000); updateClock();

/* ---------------- Reveal on scroll ---------------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting && !e.target.closest('.hero')) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ---------------- Catalogue ---------------- */
const list = document.getElementById('cat-list');
list.innerHTML = projects.map((p, i) => `
  <li class="cat-item${i === 0 ? ' current' : ''}" data-index="${i}" data-type="${p.type}" tabindex="0" role="button" aria-label="Open ${p.name}">
    <span class="mono id">${p.id}</span>
    <span class="name">${p.name}</span>
    <span class="mono type">${p.type}</span>
    <span class="mono year">${p.year}</span>
  </li>`).join('');

const preview = new ArtCanvas(document.getElementById('preview-canvas'));
const previewId = document.getElementById('preview-id');
const previewMag = document.getElementById('preview-mag');
function setPreview(i) {
  const p = projects[i];
  preview.set(p);
  previewId.textContent = `${p.id} · ${p.client}`;
  previewMag.textContent = `mag ${p.mag}`;
  list.querySelectorAll('.cat-item').forEach((el) => el.classList.toggle('current', +el.dataset.index === i));
}
setPreview(0);
new IntersectionObserver(([e]) => (e.isIntersecting ? preview.start() : preview.stop())).observe(document.querySelector('.cat-preview'));

list.addEventListener('pointerover', (e) => {
  const item = e.target.closest('.cat-item');
  if (item) { setPreview(+item.dataset.index); targetBoost = 1; }
});
list.addEventListener('pointerleave', () => (targetBoost = 0));
list.addEventListener('click', (e) => {
  const item = e.target.closest('.cat-item');
  if (item) openDetail(+item.dataset.index);
});
list.addEventListener('keydown', (e) => {
  const item = e.target.closest('.cat-item');
  if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(+item.dataset.index); }
});

document.querySelectorAll('.filters button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach((b) => b.classList.toggle('active', b === btn));
    const f = btn.dataset.filter;
    let first = -1;
    list.querySelectorAll('.cat-item').forEach((el) => {
      const show = f === 'all' || el.dataset.type === f;
      el.classList.toggle('hidden', !show);
      if (show && first < 0) first = +el.dataset.index;
    });
    if (first >= 0) setPreview(first);
  });
});

/* ---------------- Detail ---------------- */
const detail = document.getElementById('detail');
const detailArt = new ArtCanvas(document.getElementById('detail-canvas'));
let current = 0;
const $ = (id) => document.getElementById(id);
function fillDetail(i) {
  current = (i + projects.length) % projects.length;
  const p = projects[current];
  detailArt.set(p);
  $('d-id').textContent = p.id;
  $('d-title').textContent = p.name;
  $('d-client').textContent = p.client;
  $('d-year').textContent = p.year;
  $('d-type').textContent = p.type;
  $('d-mag').textContent = p.mag;
  $('d-desc').textContent = p.desc;
  $('d-count').textContent = `${String(current + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`;
}
function openDetail(i) {
  fillDetail(i);
  detail.classList.add('open');
  detail.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  detailArt.resize();
  detailArt.start();
  $('d-close').focus({ preventScroll: true });
}
function closeDetail() {
  detail.classList.remove('open');
  detail.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  setTimeout(() => detailArt.stop(), 800);
}
$('d-close').addEventListener('click', closeDetail);
$('d-prev').addEventListener('click', () => fillDetail(current - 1));
$('d-next').addEventListener('click', () => fillDetail(current + 1));
addEventListener('keydown', (e) => {
  if (!detail.classList.contains('open')) return;
  if (e.key === 'Escape') closeDetail();
  if (e.key === 'ArrowRight') fillDetail(current + 1);
  if (e.key === 'ArrowLeft') fillDetail(current - 1);
});

/* ---------------- Cursor ---------------- */
const cursor = document.getElementById('cursor');
let cx = 0, cy = 0, tx = 0, ty = 0;
addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
(function moveCursor() {
  cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
  cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  requestAnimationFrame(moveCursor);
})();
document.addEventListener('pointerover', (e) => {
  cursor.classList.toggle('big', !!e.target.closest('a, button, .cat-item'));
});

/* ---------------- Wallet ---------------- */
initWallet();
