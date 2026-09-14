// Small generative 2D renderers used for project previews and detail views.
const TAU = Math.PI * 2;

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const styles = {
  waves(ctx, w, h, t, [bg, a, b]) {
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      const y0 = h * 0.2 + (i / 26) * h * 0.7;
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * 0.008 + t * 0.6 + i * 0.35) * 22 * Math.sin(t * 0.2 + i) + Math.sin(x * 0.02 - t) * 6;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexA(i % 5 === 0 ? b : a, 0.15 + (i / 26) * 0.6);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  },
  orbit(ctx, w, h, t, [bg, a, b], r) {
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 160; i++) {
      const rad = 30 + r[i] * Math.min(w, h) * 0.42;
      const ang = r[i + 200] * TAU + t * (0.6 - rad / 600);
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(ang + 1.57) * 18, y - Math.sin(ang + 1.57) * 10);
      ctx.strokeStyle = hexA(i % 7 === 0 ? b : a, 0.7);
      ctx.lineWidth = i % 7 === 0 ? 2 : 1;
      ctx.stroke();
    }
    glow(ctx, cx, cy, 60, b);
  },
  bloom(ctx, w, h, t, [bg, a, b], r) {
    const cx = w / 2, cy = h * 0.55;
    for (let p = 0; p < 7; p++) {
      const n = 5 + p;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const th = (i / 200) * TAU;
        const rr = (40 + p * 26) * (1 + 0.25 * Math.sin(n * th + t * (0.5 + p * 0.1)));
        const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = hexA(p % 3 === 0 ? b : a, 0.25 + p * 0.08);
      ctx.stroke();
    }
    glow(ctx, cx, cy, 40, b);
  },
  lines(ctx, w, h, t, [bg, a, b]) {
    const rows = 38;
    for (let j = 0; j < rows; j++) {
      const y0 = (j / rows) * h;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const d = Math.abs(x - w / 2) / (w / 2);
        const amp = Math.max(0, 1 - d * 1.4) * 40 * (0.5 + 0.5 * Math.sin(t * 2 + j * 0.7));
        const y = y0 - Math.abs(Math.sin(x * 0.05 + t * 3 + j)) * amp;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = hexA(j % 6 === 0 ? b : a, 0.55);
      ctx.stroke();
    }
  },
  rings(ctx, w, h, t, [bg, a, b]) {
    const cx = w / 2, cy = h / 2;
    ctx.save(); ctx.translate(cx, cy);
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.rotate(t * 0.05 * (i % 2 ? 1 : -1) + i * 0.3);
      ctx.scale(1, 0.32 + i * 0.03);
      ctx.beginPath(); ctx.arc(0, 0, 50 + i * 24, 0, TAU);
      ctx.strokeStyle = hexA(a, 0.18 + i * 0.05); ctx.lineWidth = 1; ctx.stroke();
      const ang = t * (0.8 - i * 0.07) + i;
      ctx.beginPath(); ctx.arc(Math.cos(ang) * (50 + i * 24), Math.sin(ang) * (50 + i * 24), 3, 0, TAU);
      ctx.fillStyle = b; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    glow(ctx, cx, cy, 34, a);
  },
  glass(ctx, w, h, t, [bg, a, b]) {
    for (let i = 0; i < 12; i++) {
      const x = w / 2 + Math.sin(t * 0.4 + i) * w * 0.25;
      const y = h / 2 + Math.cos(t * 0.3 + i * 1.7) * h * 0.25;
      const g = ctx.createLinearGradient(x - 80, y - 120, x + 80, y + 120);
      g.addColorStop(0, hexA(a, 0)); g.addColorStop(0.5, hexA(i % 2 ? a : b, 0.22)); g.addColorStop(1, hexA(b, 0));
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.1 + i);
      ctx.fillStyle = g; ctx.fillRect(-60, -140, 120, 280);
      ctx.strokeStyle = hexA(b, 0.2); ctx.strokeRect(-60, -140, 120, 280);
      ctx.restore();
    }
  },
  grid(ctx, w, h, t, [bg, a, b]) {
    const n = 18, s = Math.min(w, h) / n;
    const ox = (w - s * n) / 2, oy = (h - s * n) / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px = Math.sin(t * 0.7) * n / 3 + n / 2, py = Math.cos(t * 0.5) * n / 3 + n / 2;
      const d = Math.hypot(i - px, j - py);
      const v = Math.max(0, Math.sin(d * 0.9 - t * 3)) * Math.max(0, 1 - d / 12);
      ctx.fillStyle = v > 0.6 ? hexA(b, v) : hexA(a, 0.08 + v * 0.8);
      ctx.fillRect(ox + i * s + 2, oy + j * s + 2, s - 4, s - 4);
    }
  },
  serpent(ctx, w, h, t, [bg, a, b], r) {
    const pts = [];
    for (let i = 0; i < 14; i++) {
      pts.push([w * 0.1 + (i / 13) * w * 0.8, h * 0.5 + Math.sin(i * 0.9 + t * 0.4) * h * 0.18 + (r[i] - 0.5) * 40]);
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = hexA(b, 0.6); ctx.lineWidth = 1; ctx.stroke();
    pts.forEach(([x, y], i) => {
      ctx.beginPath(); ctx.arc(x, y, i === 4 ? 4 : 2, 0, TAU);
      ctx.fillStyle = i === 4 ? a : hexA('#ffffff', 0.8); ctx.fill();
    });
    glow(ctx, pts[4][0], pts[4][1], 50 + Math.sin(t * 2) * 8, a);
  }
};

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, 0.9)); g.addColorStop(0.2, hexA(color, 0.35)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

export class ArtCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = null;
    this.running = false;
    this.r = [];
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.max(1, w * dpr);
    this.canvas.height = Math.max(1, h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }
  set(project) {
    this.project = project;
    const rnd = rand(parseInt(project.id.slice(-3), 10) * 977);
    this.r = Array.from({ length: 400 }, rnd);
    this.fade = 0;
  }
  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      this.draw(now / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }
  draw(t) {
    const { ctx, w, h, project } = this;
    if (!project) return;
    const [bg] = project.palette;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    styles[project.style](ctx, w, h, t, project.palette, this.r);
    ctx.globalCompositeOperation = 'source-over';
    // title watermark
    ctx.fillStyle = 'rgba(239,230,216,0.9)';
    ctx.font = `italic ${Math.round(Math.min(w, h) * 0.11)}px "Instrument Serif", Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText(project.name, 20, 20 + Math.min(w, h) * 0.1);
  }
}
