// Эффекты «В Точку»: частицы на canvas, ударные волны, лучи, молнии, клинки, осколки, вспышки, тряска экрана и синтез звука.
// У каждой масти свой образ (♠ сталь, ♣ изумруд, ♦ лёд, ♥ пламя, 7♠ гроза); чем старше карта — тем богаче эффект.
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  const GOLD = ['#fff3c4', '#f6d27a', '#e0a93a', '#ffe9a8'];
  const CRIMSON = ['#ff4d5e', '#ff7a4d', '#ffc08a', '#e0112f', '#ff2d55'];
  const VIOLET = ['#c9a2ff', '#8c5bff', '#f6d27a', '#efe3ff', '#6a2cff'];
  const STEEL = ['#ffffff', '#dbe7ff', '#a9c4ff', '#6f8fd8'];
  const EMERALD = ['#b8ffcf', '#46e08a', '#1fa860', '#eaffb0'];
  const ICE = ['#ffffff', '#e6fbff', '#9ae8ff', '#4cc3ff'];

  let cv, ctx, W = 0, H = 0, dpr = 1, running = false, last = 0;
  let quality = 1;
  let shakeEl = null, shakeT = 0, shakeDur = 0, shakeAmp = 0, shakeRunning = false;
  const parts = [], rings = [], rays = [], bolts = [], flashes = [];
  const sprites = {};

  function sprite(color) {
    if (sprites[color]) return sprites[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (sprites[color] = c);
  }

  function init(canvas, shakeTarget) {
    cv = canvas; ctx = cv.getContext('2d'); shakeEl = shakeTarget;
    resize();
    addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function kick() {
    if (running || !ctx) return;
    running = true; last = performance.now();
    requestAnimationFrame(loop);
  }

  function jag(x1, y1, x2, y2, disp, depth, out) {
    if (depth === 0) { out.push(x2, y2); return; }
    const mx = (x1 + x2) / 2 + rnd(-disp, disp), my = (y1 + y2) / 2 + rnd(-disp, disp);
    jag(x1, y1, mx, my, disp / 2, depth - 1, out);
    jag(mx, my, x2, y2, disp / 2, depth - 1, out);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      if (f.t >= f.life) { flashes.splice(i, 1); continue; }
      const k = f.t < f.hold ? 0 : (f.t - f.hold) / (f.life - f.hold);
      const fadeIn = f.t < f.in ? f.t / f.in : 1;
      ctx.globalCompositeOperation = f.mode;
      ctx.globalAlpha = Math.max(0, f.a * (1 - k) * fadeIn);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = rays.length - 1; i >= 0; i--) {
      const r = rays[i];
      r.t += dt;
      if (r.t >= r.life) { rays.splice(i, 1); continue; }
      const k = r.t / r.life;
      ctx.globalAlpha = Math.sin(Math.PI * k) * r.a;
      const grad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.len);
      grad.addColorStop(0, r.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      const rot = r.rot + r.spin * r.t;
      ctx.beginPath();
      for (let j = 0; j < r.count; j++) {
        const a = rot + (j * TAU) / r.count;
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(a - r.w) * r.len, r.y + Math.sin(a - r.w) * r.len);
        ctx.lineTo(r.x + Math.cos(a + r.w) * r.len, r.y + Math.sin(a + r.w) * r.len);
        ctx.closePath();
      }
      ctx.fill();
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t < 0) continue;
      if (r.t >= r.life) { rings.splice(i, 1); continue; }
      const k = r.t / r.life, e = 1 - Math.pow(1 - k, 3);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * r.a * 0.35;
      ctx.lineWidth = r.w * 3 * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - k) * r.a;
      ctx.lineWidth = r.w * (1 - k * 0.7);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += dt;
      if (b.t < 0) continue;
      if (b.t >= b.life) { bolts.splice(i, 1); continue; }
      b.re -= dt;
      if (b.re <= 0 || !b.pts) {
        b.re = 0.05; b.pts = [b.x1, b.y1];
        jag(b.x1, b.y1, b.x2, b.y2, Math.hypot(b.x2 - b.x1, b.y2 - b.y1) * 0.22, 5, b.pts);
      }
      const flick = 0.55 + 0.45 * Math.random();
      const fade = 1 - b.t / b.life;
      ctx.beginPath(); ctx.moveTo(b.pts[0], b.pts[1]);
      for (let j = 2; j < b.pts.length; j += 2) ctx.lineTo(b.pts[j], b.pts[j + 1]);
      ctx.strokeStyle = b.color; ctx.lineWidth = 7; ctx.globalAlpha = 0.25 * fade * flick; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.9 * fade * flick; ctx.stroke();
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      const dragK = Math.pow(p.drag, dt * 60);
      p.vx *= dragK; p.vy *= dragK; p.vy += p.g * dt;
      if (p.swirl) { const a = Math.atan2(p.vy, p.vx) + p.swirl * dt; const sp = Math.hypot(p.vx, p.vy); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = p.t / p.life;
      const alpha = p.fadeIn && k < 0.15 ? k / 0.15 : 1 - Math.pow(k, 1.6);
      const s = p.size + (p.size2 - p.size) * k;
      if (p.type === 'glow' || p.type === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * (p.type === 'ember' ? 0.55 + 0.45 * Math.sin(p.t * 26 + p.seed) : 1);
        ctx.drawImage(sprite(p.color), p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color; ctx.lineWidth = s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
      } else if (p.type === 'dust') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.22;
        ctx.drawImage(sprite(p.color), p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 'glyph') {
        ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
        ctx.globalAlpha = alpha;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.font = `${s}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.glyph, 0, 0); ctx.restore();
      } else if (p.type === 'slash') {
        const e = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3), l = p.len * e, ca = Math.cos(p.ang), sa = Math.sin(p.ang);
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha * 0.3; ctx.lineWidth = s * 5;
        ctx.beginPath(); ctx.moveTo(p.x - ca * l, p.y - sa * l); ctx.lineTo(p.x + ca * l, p.y + sa * l); ctx.stroke();
        ctx.globalAlpha = alpha; ctx.lineWidth = s;
        ctx.beginPath(); ctx.moveTo(p.x - ca * l, p.y - sa * l); ctx.lineTo(p.x + ca * l, p.y + sa * l); ctx.stroke();
      } else if (p.type === 'shard') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(0, -s * 1.4); ctx.lineTo(s * 0.55, 0); ctx.lineTo(0, s * 1.4); ctx.lineTo(-s * 0.55, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.type === 'conf') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.t * 9 + p.seed));
        ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 4, s, s / 2); ctx.restore();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    if (parts.length || rings.length || rays.length || bolts.length || flashes.length) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  // ---------- примитивы ----------
  function emit(n, make) {
    n = Math.max(1, Math.round(n * quality));
    for (let i = 0; i < n; i++) {
      parts.push(Object.assign({ t: 0, g: 0, drag: 0.92, vr: 0, rot: 0, seed: Math.random() * 10, swirl: 0 }, make(i, n)));
    }
    kick();
  }
  function burst(x, y, o = {}) {
    const { n = 20, speed = [120, 420], life = [0.4, 0.9], size = [2, 4], size2 = null, colors = GOLD, type = 'spark',
      g = 260, drag = 0.9, spread = TAU, angle = -Math.PI / 2, delay = 0, glyphs = null, add = true, swirl = 0, fadeIn = false } = o;
    emit(n, () => {
      const a = angle + rnd(-spread / 2, spread / 2), sp = rnd(speed[0], speed[1]), sz = rnd(size[0], size[1]);
      return {
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g, drag, type, color: pick(colors), life: rnd(life[0], life[1]),
        size: sz, size2: size2 == null ? sz : sz * size2, t: -delay, glyph: glyphs && pick(glyphs), rot: rnd(-0.6, 0.6), vr: rnd(-4, 4), add,
        swirl: swirl ? rnd(-swirl, swirl) : 0, fadeIn,
      };
    });
  }
  function ring(x, y, o = {}) {
    rings.push({ x, y, r0: o.r0 || 8, r1: o.r1 || 120, life: o.life || 0.6, t: -(o.delay || 0), color: o.color || '#f6d27a', w: o.width || 4, a: o.a == null ? 1 : o.a });
    kick();
  }
  function raysAt(x, y, o = {}) {
    if (quality < 0.6 && !o.force) return;
    rays.push({ x, y, count: o.count || 12, len: o.len || 260, life: o.life || 0.9, t: 0, color: o.color || '#f6d27a', w: o.width || 0.06, rot: Math.random() * TAU, spin: o.spin || 0.5, a: o.a || 0.5 });
    kick();
  }
  function bolt(x1, y1, x2, y2, o = {}) {
    bolts.push({ x1, y1, x2, y2, life: o.life || 0.5, t: -(o.delay || 0), color: o.color || '#b98cff', re: 0, pts: null });
    kick();
  }
  function flash(color, a, life, o = {}) {
    flashes.push({ color, a, life, t: 0, hold: o.hold || 0, in: o.in || 0, mode: o.mode || 'source-over' });
    kick();
  }
  function shake(amp, dur) {
    if (!shakeEl) return;
    amp *= quality < 0.6 ? 0.5 : 1;
    if (amp < shakeAmp * (1 - shakeT / Math.max(shakeDur, 0.001))) return;
    shakeAmp = amp; shakeDur = dur; shakeT = 0;
    if (shakeRunning) return;
    shakeRunning = true;
    let prev = performance.now();
    const step = now => {
      shakeT += (now - prev) / 1000; prev = now;
      const k = 1 - shakeT / shakeDur;
      if (k <= 0) { shakeEl.style.transform = ''; shakeRunning = false; shakeAmp = 0; return; }
      const a = shakeAmp * k * k;
      shakeEl.style.transform = `translate3d(${rnd(-a, a)}px, ${rnd(-a, a)}px, 0) rotate(${rnd(-a, a) * 0.05}deg)`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- пресеты ----------
  function dust(x, y, n) {
    burst(x, y, { n, type: 'dust', colors: ['#b8a47a'], speed: [40, 130], life: [0.5, 0.9], size: [18, 30], size2: 1.8, g: 0, drag: 0.88, add: false });
  }

  // Эффект приземления карты. info: { kind: 'spade'|'club'|'diamond'|'heart'|'mystic'|'legend', level: 0..8 }
  // У каждой масти свой образ, и он нарастает со старшинством.
  function cardImpact(x, y, info) {
    const L = info.level, M = Math.max(W, H);
    const k = info.kind;
    if (k === 'spade') { // ♠ сталь: росчерки клинков, металлические искры
      dust(x, y, 4 + L);
      burst(x, y, { n: 6 + L * 5, colors: STEEL, speed: [180, 320 + L * 45], size: [1.2, 2.4], g: 120, life: [0.3, 0.7] });
      slash(x, y, { n: L >= 6 ? 3 : L >= 3 ? 2 : 1, len: 70 + L * 18, colors: STEEL });
      if (L >= 3) ring(x, y, { r1: 50 + L * 14, color: '#a9c4ff', width: 2.5 + L * 0.3 });
      if (L >= 5) burst(x, y, { n: 4 + L, type: 'shard', colors: STEEL, speed: [140, 300], size: [5, 9], g: 380, life: [0.6, 1] });
      if (L >= 6) { slash(x, y, { n: 2, len: 160 + L * 14, colors: ['#ffffff'], delay: 0.08 }); raysAt(x, y, { count: 8, len: 170 + L * 22, color: 'rgba(169,196,255,1)', life: 0.6, a: 0.32, width: 0.03 }); }
      if (L >= 8) {
        flash('#bcd3ff', 0.16, 0.35, { mode: 'lighter' });
        slash(x, y, { n: 6, len: M * 0.5, colors: ['#ffffff', '#cfe0ff'], delay: 0.12, width: 4 });
        ring(x, y, { r1: 300, color: '#e8f1ff', width: 5, delay: 0.1 });
        burst(x, y, { n: 12, type: 'glyph', glyphs: ['♠'], colors: ['#dbe7ff', '#8fb0ff'], speed: [180, 360], size: [16, 28], g: 220, life: [0.9, 1.3] });
        shake(8, 0.4);
      }
    } else if (k === 'club') { // ♣ изумруд: листья, споры, лозы
      dust(x, y, 3 + L);
      burst(x, y, { n: 8 + L * 5, type: 'glow', colors: EMERALD, speed: [30, 110 + L * 12], g: -40, life: [0.6, 1.3], size: [6, 12 + L], size2: 0.2, swirl: 2 });
      burst(x, y, { n: 2 + L, type: 'glyph', glyphs: ['❦', '♣'], colors: EMERALD, speed: [60, 150], g: -60, life: [0.9, 1.5], size: [10, 16 + L], add: true, swirl: 3 });
      if (L >= 3) ring(x, y, { r1: 45 + L * 14, color: '#46e08a', width: 2.5 + L * 0.3 });
      if (L >= 5) { vortex(x, y, { n: 20 + L * 4, colors: EMERALD, r: 60 + L * 10 }); ring(x, y, { r1: 30 + L * 10, color: '#eaffb0', width: 1.5, delay: 0.12 }); }
      if (L >= 6) raysAt(x, y, { count: 9, len: 160 + L * 22, color: 'rgba(70,224,138,1)', life: 0.9, a: 0.3, spin: 1.4 });
      if (L >= 8) {
        flash('#46e08a', 0.12, 0.45, { mode: 'lighter' });
        vortex(x, y, { n: 80, colors: EMERALD, r: 220 });
        burst(x, y, { n: 26, type: 'glyph', glyphs: ['❦', '♣', '✿'], colors: EMERALD, speed: [160, 420], g: 40, life: [1.1, 1.8], size: [16, 30], swirl: 3 });
        ring(x, y, { r1: 280, color: '#b8ffcf', width: 4, delay: 0.1 });
        shake(6, 0.4);
      }
    } else if (k === 'diamond') { // ♦ лёд: осколки кристаллов, иней
      burst(x, y, { n: 4 + L * 3, type: 'shard', colors: ICE, speed: [120, 260 + L * 40], size: [4, 7 + L * 0.6], g: 420, life: [0.6, 1.1] });
      burst(x, y, { n: 6 + L * 3, type: 'glyph', glyphs: ['✦', '✧'], colors: ICE, speed: [20, 90], g: 0, life: [0.5, 1], size: [8, 14], add: true });
      if (L >= 2) ring(x, y, { r1: 50 + L * 13, color: '#9ae8ff', width: 2 + L * 0.3 });
      if (L >= 4) burst(x, y, { n: 6 + L * 3, colors: ICE, speed: [200, 380 + L * 30], size: [1, 2], g: 0, life: [0.25, 0.5] });
      if (L >= 6) { raysAt(x, y, { count: 6, len: 200 + L * 24, color: 'rgba(154,232,255,1)', life: 0.7, a: 0.38, width: 0.025, spin: 0.2 }); ring(x, y, { r1: 30 + L * 9, color: '#ffffff', width: 1.5, delay: 0.1 }); }
      if (L >= 8) {
        flash('#c8f4ff', 0.18, 0.4, { mode: 'lighter' });
        burst(x, y, { n: 60, type: 'shard', colors: ICE, speed: [260, 620], size: [5, 12], g: 300, life: [0.9, 1.5] });
        raysAt(x, y, { count: 12, len: M * 0.55, color: 'rgba(200,244,255,1)', life: 1.1, a: 0.42, width: 0.02, force: true });
        ring(x, y, { r1: 320, color: '#e6fbff', width: 5, delay: 0.1 });
        shake(8, 0.4);
      }
    } else if (k === 'heart') { // ♥ козырь: багровое пламя
      ring(x, y, { r1: 55 + L * 16, color: '#ff4d5e', width: 3 + L * 0.4 });
      flame(x, y, 10 + L * 7, L);
      if (L >= 2) burst(x, y, { n: 6 + L * 4, colors: CRIMSON, speed: [160, 300 + L * 40], size: [1.5, 3] });
      if (L >= 4) {
        ring(x, y, { r1: 40 + L * 12, color: '#ffc08a', width: 2, delay: 0.1 });
        burst(x, y, { n: 3 + L, type: 'glyph', glyphs: ['♥'], colors: CRIMSON, speed: [60, 160], g: -120, life: [0.9, 1.5], size: [12, 22], add: true });
      }
      if (L >= 6) {
        raysAt(x, y, { count: 14, len: 200 + L * 26, color: 'rgba(255,77,94,1)', life: 0.9, a: 0.38, spin: 0.9 });
        flash('#ff2d55', 0.1, 0.35, { mode: 'lighter' });
        shake(3 + L * 0.6, 0.3);
      }
      if (L >= 8) {
        flash('#ff2d55', 0.16, 0.55, { mode: 'lighter' });
        raysAt(x, y, { count: 22, len: M * 0.6, color: 'rgba(255,60,80,1)', life: 1.4, a: 0.38, spin: 1.2, force: true });
        ring(x, y, { r1: 220, color: '#ff4d5e', width: 6, delay: 0.1 });
        ring(x, y, { r1: 360, color: '#ffc08a', width: 3, delay: 0.22 });
        burst(x, y, { n: 26, type: 'glyph', glyphs: ['♥'], colors: CRIMSON, speed: [220, 520], g: 120, life: [1, 1.6], size: [16, 30] });
        flame(x, y, 90, 8);
        shake(12, 0.55);
      }
    } else if (k === 'mystic') {
      ring(x, y, { r1: 90, color: '#b98cff', width: 3 });
      burst(x, y, { n: 18, type: 'ember', colors: VIOLET, speed: [30, 110], g: -70, life: [0.8, 1.5], size: [8, 16], size2: 0.2 });
      burst(x, y, { n: 4, type: 'glyph', glyphs: ['♠'], colors: ['#c9a2ff'], speed: [40, 90], g: -80, life: [1, 1.4], size: [14, 20] });
      bolt(x - 40, y - 60, x, y, { life: 0.25, color: '#b98cff' });
    } else if (k === 'legend') { // 7♠: громовой разряд
      thunder(x, y);
      flash('#ffffff', 0.45, 0.3, { mode: 'lighter' });
      flash('#5a1fd6', 0.2, 1.1, { mode: 'lighter', hold: 0.15 });
      ring(x, y, { r1: M * 0.75, color: '#c9a2ff', width: 8, life: 0.9 });
      ring(x, y, { r1: M * 0.5, color: '#f6d27a', width: 5, life: 0.8, delay: 0.1 });
      ring(x, y, { r1: 180, color: '#ffffff', width: 3, life: 0.5, delay: 0.2 });
      raysAt(x, y, { count: 24, len: M, color: 'rgba(185,140,255,1)', life: 1.6, a: 0.36, spin: 1.5, force: true });
      for (let i = 0; i < Math.round(8 * Math.max(quality, 0.5)); i++) {
        const a = rnd(0, TAU);
        bolt(x, y, x + Math.cos(a) * M, y + Math.sin(a) * M, { life: rnd(0.35, 0.7), delay: rnd(0, 0.35), color: pick(['#b98cff', '#f6d27a']) });
      }
      burst(x, y, { n: 140, colors: VIOLET, speed: [300, 950], size: [1.5, 3.5], g: 160, life: [0.6, 1.3] });
      burst(x, y, { n: 60, type: 'ember', colors: VIOLET, speed: [80, 380], g: -30, life: [1, 2], size: [10, 22], size2: 0.1 });
      burst(x, y, { n: 22, type: 'glyph', glyphs: ['♠', '★', 'ϟ'], colors: ['#c9a2ff', '#f6d27a', '#ffffff'], speed: [200, 520], g: 120, life: [1.1, 1.8], size: [16, 32] });
      shake(18, 0.8);
    }
  }

  // Клинки: короткие яркие росчерки, которые вспыхивают и гаснут.
  function slash(x, y, o = {}) {
    const n = o.n || 1;
    const base = rnd(0, Math.PI);
    emit(n, i => ({ x, y, vx: 0, vy: 0, drag: 1, type: 'slash', color: pick(o.colors || STEEL), life: 0.32, size: o.width || 3, size2: 0.2,
      ang: base + (i * Math.PI) / n + rnd(-0.2, 0.2), len: o.len || 120, t: -(o.delay || 0) - i * 0.04 }));
  }
  // Пламя: угли, поднимающиеся с завихрением.
  function flame(x, y, n, L) {
    burst(x, y, { n, type: 'ember', colors: CRIMSON, speed: [30, 120 + L * 15], angle: -Math.PI / 2, spread: Math.PI * 0.9, g: -160, life: [0.6, 1.3], size: [10, 18 + L], size2: 0.15, drag: 0.95, swirl: 1.5 });
  }
  // Вихрь: частицы кружат вокруг точки.
  function vortex(x, y, o = {}) {
    emit(o.n || 30, () => {
      const a = rnd(0, TAU), r = rnd(10, o.r || 80), sp = rnd(120, 260);
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a + Math.PI / 2) * sp, vy: Math.sin(a + Math.PI / 2) * sp, drag: 0.97, swirl: 5, type: 'glow', color: pick(o.colors || EMERALD), life: rnd(0.6, 1.2), size: rnd(5, 11), size2: 0.2 };
    });
  }
  // Гроза: молнии бьют сверху в карту.
  function thunder(x, y) {
    for (let i = 0; i < 4; i++) bolt(x + rnd(-W * 0.3, W * 0.3), -20, x + rnd(-10, 10), y, { life: rnd(0.3, 0.5), delay: i * 0.07, color: i % 2 ? '#f6d27a' : '#c9a2ff' });
  }
  // Печать проверки: поймал — багровый крест, честно — золотая галочка.
  function stamp(x, y, caught) {
    if (caught) {
      flash('#ff2d55', 0.14, 0.35, { mode: 'lighter' });
      ring(x, y, { r1: 140, color: '#ff4d5e', width: 6 });
      burst(x, y, { n: 30, colors: CRIMSON, speed: [160, 420], size: [1.5, 3] });
      burst(x, y, { n: 1, type: 'glyph', glyphs: ['✖'], colors: ['#ff4d5e'], speed: [0, 1], g: -20, life: [0.9, 0.9], size: [70, 70], size2: 1.4 });
      shake(10, 0.4);
    } else {
      ring(x, y, { r1: 110, color: '#f6d27a', width: 4 });
      burst(x, y, { n: 18, colors: GOLD, speed: [80, 220], size: [1.5, 2.5], g: 0 });
      burst(x, y, { n: 1, type: 'glyph', glyphs: ['✓'], colors: ['#f6d27a'], speed: [0, 1], g: -20, life: [0.9, 0.9], size: [64, 64], size2: 1.3 });
    }
  }

  // Набор силы перед легендарным ударом: частицы стягиваются к карте, экран темнеет.
  function charge(x, y, dur) {
    flash('#000000', 0.6, dur + 0.7, { hold: dur, in: 0.25 });
    emit(Math.round(70), () => {
      const a = rnd(0, TAU), d = rnd(160, Math.max(W, H) * 0.45), life = rnd(dur * 0.6, dur);
      return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d / life, vy: -Math.sin(a) * d / life, drag: 1, type: 'glow', color: pick(VIOLET), life, size: rnd(6, 14), size2: 1.6, fadeIn: true, t: -rnd(0, dur * 0.3) };
    });
    for (let i = 0; i < 3; i++) bolt(x + rnd(-200, 200), y + rnd(-160, 160), x, y, { life: 0.25, delay: dur * (0.3 + i * 0.22), color: '#b98cff' });
    raysAt(x, y, { count: 8, len: 160, color: 'rgba(185,140,255,1)', life: dur, a: 0.35, spin: 3, force: true });
  }

  // Мягкое свечение вокруг поднятой карты.
  function aura(x, y, kind) {
    const c = { heart: CRIMSON, spade: STEEL, club: EMERALD, diamond: ICE, legend: VIOLET, mystic: VIOLET }[kind] || GOLD;
    burst(x, y, { n: 10, type: 'glow', colors: c, speed: [20, 70], g: -30, life: [0.4, 0.8], size: [10, 20], size2: 0.2 });
  }

  // След из искр от стола к игроку, забравшему взятку.
  function trail(x1, y1, x2, y2, colors = GOLD) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    emit(26, () => {
      const life = rnd(0.45, 0.75), jitter = rnd(-40, 40);
      return { x: x1 + rnd(-20, 20), y: y1 + rnd(-20, 20), vx: (x2 - x1) / life + jitter, vy: (y2 - y1) / life + jitter, drag: 1, type: 'glow', color: pick(colors), life, size: rnd(6, 12), size2: 0.4, t: -rnd(0, 0.25) };
    });
    return d;
  }
  function sparkleAt(x, y, colors = GOLD) {
    burst(x, y, { n: 14, speed: [60, 180], size: [1.5, 2.5], colors, g: 0, life: [0.3, 0.6] });
    ring(x, y, { r1: 46, color: colors[1], width: 2, life: 0.45 });
  }
  function confetti() {
    emit(160, () => ({
      x: rnd(0, W), y: rnd(-H * 0.4, -10), vx: rnd(-60, 60), vy: rnd(40, 160), g: 140, drag: 0.995, type: Math.random() < 0.25 ? 'glyph' : 'conf',
      glyph: pick(['♠', '♥', '♦', '♣']), color: pick(['#f6d27a', '#e0a93a', '#fff3c4', '#ff4d5e', '#c9a2ff']), life: rnd(2.5, 4.2), size: rnd(8, 16), size2: 1, vr: rnd(-6, 6), add: false,
    }));
  }
  function floatText() { /* текст — в DOM, тут не нужен */ }

  // ---------- звук (синтез Web Audio, без файлов) ----------
  // У каждой масти свой тембр; чем старше карта, тем больше слоёв, громче удар и длиннее хвост реверберации.
  const SFX = (() => {
    let ac = null, master = null, verb = null, muted = false, noiseBuf = null;
    function ensure() {
      if (muted) return null;
      if (!ac) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.6;
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // Реверберация: импульс из затухающего шума (2.6 с).
        const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
        for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
        verb = ac.createConvolver(); verb.buffer = ir;
        const vg = ac.createGain(); vg.gain.value = 0.5;
        verb.connect(vg); vg.connect(master);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    const now = () => ac.currentTime + 0.01;
    function out(wet) {
      const g = ac.createGain(); g.connect(master);
      if (wet) { const s = ac.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); }
      return g;
    }
    function env(g, t, a, d, peak) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function noise(t, dur, type, freq, q, peak, o = {}) {
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const g = ac.createGain(); env(g, t, o.attack || 0.005, dur, peak);
      src.connect(f); f.connect(g); g.connect(out(o.wet || 0));
      src.start(t, Math.random()); src.stop(t + dur + 0.1);
    }
    function tone(t, freq, dur, peak, type = 'sine', o = {}) {
      const osc = ac.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
      if (o.detune) osc.detune.value = o.detune;
      const g = ac.createGain(); env(g, t, o.attack || 0.005, dur, peak);
      let node = osc;
      if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
      node.connect(g); g.connect(out(o.wet || 0));
      osc.start(t); osc.stop(t + (o.attack || 0.005) + dur + 0.1);
    }
    // Металлический звон: негармонические обертоны.
    function metal(t, base, dur, peak, wet) { [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(t, base * m, dur / (1 + i * 0.6), peak / (1 + i), 'sine', { wet })); }
    // Удар-«бум» по нарастающей.
    function thump(t, level, wet = 0) {
      tone(t, 140 + level * 4, 0.18 + level * 0.03, 0.45 + level * 0.03, 'sine', { to: 45, wet });
      noise(t, 0.08 + level * 0.01, 'lowpass', 900, 0.7, 0.28, { wet });
    }
    function boom(t, size, wet = 0.4) {
      tone(t, 90, 0.8 * size, 0.85, 'sine', { to: 26, wet });
      tone(t, 180, 0.4 * size, 0.2, 'triangle', { to: 50, wet });
      noise(t, 0.7 * size, 'lowpass', 500, 0.8, 0.6, { to: 70, wet });
    }

    const impactBy = {
      spade(L, t) { // сталь: «вжух» и звон клинка
        thump(t, L * 0.6);
        noise(t, 0.12 + L * 0.02, 'highpass', 2500, 0.7, 0.18 + L * 0.03, { to: 7000, wet: 0.2 });
        metal(t + 0.01, 900 + L * 120, 0.35 + L * 0.12, 0.08 + L * 0.015, 0.25 + L * 0.03);
        if (L >= 6) metal(t + 0.09, 1300 + L * 90, 0.6 + L * 0.1, 0.07, 0.4);
        if (L >= 8) { boom(t, 1, 0.5); metal(t + 0.18, 620, 1.8, 0.12, 0.6); noise(t + 0.05, 0.5, 'highpass', 3000, 0.5, 0.25, { to: 9000, wet: 0.5 }); }
      },
      club(L, t) { // изумруд: шелест и волшебный перезвон
        thump(t, L * 0.5);
        noise(t, 0.2 + L * 0.03, 'bandpass', 1800, 1.2, 0.12 + L * 0.02, { to: 900, wet: 0.2 });
        const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
        const n = 1 + Math.floor(L / 2);
        for (let i = 0; i < n; i++) tone(t + 0.03 + i * 0.055, scale[i % scale.length], 0.5 + L * 0.05, 0.07, 'triangle', { wet: 0.35 });
        if (L >= 6) for (const f of [261.63, 329.63, 392]) tone(t, f, 1.2 + L * 0.1, 0.05, 'sawtooth', { attack: 0.25, lp: 1400, detune: rnd(-8, 8), wet: 0.6 });
        if (L >= 8) { boom(t, 0.8, 0.5); noise(t, 0.9, 'bandpass', 400, 1.5, 0.25, { to: 3000, wet: 0.5 }); }
      },
      diamond(L, t) { // лёд: хрустальный звон и треск
        thump(t, L * 0.5);
        const n = 2 + L;
        for (let i = 0; i < n; i++) tone(t + rnd(0, 0.05 + L * 0.02), rnd(2400, 5200), 0.12 + rnd(0, 0.2), 0.05, 'sine', { wet: 0.4 });
        noise(t, 0.05 + L * 0.01, 'highpass', 5000, 0.6, 0.15 + L * 0.02, { wet: 0.2 });
        if (L >= 5) tone(t, 1568 + L * 40, 0.8 + L * 0.1, 0.06, 'sine', { wet: 0.6 });
        if (L >= 8) { boom(t, 0.8, 0.4); noise(t + 0.02, 0.6, 'highpass', 2500, 0.5, 0.35, { to: 8000, wet: 0.6 }); for (let i = 0; i < 14; i++) tone(t + 0.05 + i * 0.03, rnd(3000, 7000), 0.25, 0.04, 'sine', { wet: 0.6 }); }
      },
      heart(L, t) { // пламя: гул огня и тяжёлый удар
        thump(t, L);
        noise(t, 0.3 + L * 0.06, 'bandpass', 500, 0.8, 0.18 + L * 0.03, { to: 2400, wet: 0.3, attack: 0.03 });
        const n = Math.min(3, 1 + Math.floor(L / 3));
        for (let i = 0; i < n; i++) tone(t + i * 0.06, 392 * [1, 1.189, 1.498][i] * (1 + L * 0.015), 0.7 + L * 0.08, 0.1, 'sine', { wet: 0.4 });
        if (L >= 6) boom(t, 0.6 + L * 0.05, 0.4);
        if (L >= 8) { boom(t, 1.3, 0.6); noise(t, 1.4, 'lowpass', 700, 0.7, 0.4, { to: 120, wet: 0.6, attack: 0.05 }); [196, 233.08, 293.66].forEach((f, i) => tone(t + 0.1 + i * 0.08, f, 1.6, 0.08, 'sawtooth', { lp: 1200, wet: 0.6 })); }
      },
      mystic(L, t) {
        thump(t, 2);
        [392, 493.88].forEach((f, i) => tone(t + i * 0.08, f, 1.1, 0.06, 'sine', { wet: 0.6 }));
        noise(t, 0.4, 'bandpass', 900, 3, 0.08, { to: 2200, wet: 0.5 });
      },
      legend(L, t) { // гром: треск разряда, раскат и гул
        noise(t, 0.09, 'highpass', 1500, 0.5, 0.9, { wet: 0.4 });
        noise(t + 0.02, 0.25, 'bandpass', 3000, 0.6, 0.5, { to: 600, wet: 0.5 });
        boom(t + 0.03, 1.6, 0.7);
        noise(t + 0.08, 2.6, 'lowpass', 260, 0.9, 0.7, { to: 60, wet: 0.8, attack: 0.12 });
        noise(t + 0.6, 1.8, 'lowpass', 180, 1, 0.45, { to: 50, wet: 0.8, attack: 0.3 });
        [392, 493.88, 587.33, 783.99].forEach((f, i) => tone(t + 0.15 + i * 0.07, f, 1.6, 0.06, 'sine', { wet: 0.7 }));
      },
    };

    return {
      unlock() { ensure(); },
      setMuted(m) { muted = m; if (m && ac) ac.suspend(); else if (!m && ac) ac.resume(); },
      isMuted: () => muted,
      flick() { if (!ensure()) return; noise(now(), 0.07, 'bandpass', 2600, 1.4, 0.32); },
      deal() { if (!ensure()) return; noise(now(), 0.05, 'highpass', 3000, 0.8, 0.16); },
      impact(info) { if (!ensure()) return; (impactBy[info.kind] || impactBy.club)(info.level, now()); },
      // Подъём старшей карты перед ударом: нарастающий гул.
      rise(info) {
        if (!ensure()) return; const t = now();
        if (info.kind === 'legend') {
          noise(t, 1.0, 'bandpass', 200, 2, 0.4, { to: 4000, wet: 0.5, attack: 0.6 });
          tone(t, 55, 1.0, 0.3, 'sawtooth', { to: 220, lp: 600, attack: 0.7, wet: 0.4 });
          for (let i = 0; i < 4; i++) noise(t + 0.25 + i * 0.2, 0.05, 'highpass', 4000, 0.5, 0.15, { wet: 0.5 });
          return;
        }
        const f = { spade: 700, club: 500, diamond: 1200, heart: 300 }[info.kind] || 500;
        noise(t, 0.25 + info.level * 0.03, 'bandpass', f * 0.4, 2, 0.12 + info.level * 0.02, { to: f * 3, attack: 0.15, wet: 0.3 });
      },
      chime(level, kind) {
        if (!ensure()) return; const t = now();
        [659.25, 830.61, 987.77].slice(0, 1 + Math.floor(level / 3)).forEach((f, i) => tone(t + i * 0.06, f, 0.5, 0.08, 'sine', { wet: 0.4 }));
      },
      coins() { if (!ensure()) return; const t = now(); for (let i = 0; i < 6; i++) tone(t + i * 0.05, rnd(1900, 3200), 0.12, 0.06, 'sine', { wet: 0.2 }); },
      click() { if (!ensure()) return; tone(now(), 1400, 0.03, 0.07, 'square'); },
      chip() { if (!ensure()) return; const t = now(); tone(t, 1800, 0.05, 0.1, 'triangle'); tone(t + 0.03, 2400, 0.06, 0.06, 'sine'); },
      tick(sec) { if (!ensure()) return; tone(now(), sec <= 2 ? 1500 : 1100, 0.05, 0.12, 'square', { lp: 3000 }); },
      yourTurn() {
        if (!ensure()) return; const t = now();
        tone(t, 110, 0.5, 0.35, 'sine', { to: 70 });
        [523.25, 783.99, 1046.5].forEach((f, i) => tone(t + 0.04 + i * 0.07, f, 0.6, 0.08, 'triangle', { wet: 0.4 }));
      },
      caught() {
        if (!ensure()) return; const t = now();
        tone(t, 220, 0.35, 0.25, 'sawtooth', { lp: 900, to: 110 });
        tone(t + 0.12, 180, 0.5, 0.25, 'sawtooth', { lp: 800, to: 80 });
        boom(t, 0.7, 0.3);
      },
      honest() { if (!ensure()) return; const t = now(); [783.99, 1046.5].forEach((f, i) => tone(t + i * 0.1, f, 0.5, 0.1, 'triangle', { wet: 0.4 })); },
      msg() { if (!ensure()) return; const t = now(); tone(t, 880, 0.08, 0.06, 'sine'); tone(t + 0.07, 1320, 0.12, 0.05, 'sine', { wet: 0.2 }); },
      like() { if (!ensure()) return; const t = now(); for (let i = 0; i < 6; i++) tone(t + i * 0.06, 700 + i * 160, 0.12, 0.06, 'triangle', { wet: 0.3 }); },
      emote(id) {
        if (!ensure()) return; const t = now();
        const kinds = {
          '😂': () => { for (let i = 0; i < 5; i++) tone(t + i * 0.09, 520 + (i % 2) * 140, 0.08, 0.08, 'triangle'); },
          '😱': () => { tone(t, 900, 0.5, 0.08, 'sine', { to: 1500 }); noise(t, 0.4, 'bandpass', 1500, 3, 0.08, { to: 3000 }); },
          '🖕': () => { tone(t, 160, 0.3, 0.25, 'sawtooth', { lp: 700, to: 90 }); noise(t, 0.15, 'lowpass', 600, 0.7, 0.3); },
          '😎': () => { [659.25, 830.61, 987.77].forEach((f, i) => tone(t + i * 0.07, f, 0.4, 0.07, 'triangle', { wet: 0.4 })); },
          '😡': () => { noise(t, 0.6, 'bandpass', 900, 1.2, 0.18, { to: 3000, attack: 0.1 }); tone(t, 110, 0.4, 0.15, 'sawtooth', { lp: 500 }); },
          '🤔': () => { [440, 494, 440].forEach((f, i) => tone(t + i * 0.18, f, 0.12, 0.06, 'sine')); },
          '👏': () => { for (let i = 0; i < 6; i++) noise(t + i * 0.07 + rnd(0, 0.02), 0.04, 'bandpass', 2000, 1.5, 0.3); },
          '💀': () => { tone(t, 300, 0.6, 0.1, 'triangle', { to: 80 }); noise(t + 0.05, 0.3, 'highpass', 2500, 0.6, 0.12); },
        };
        (kinds[id] || kinds['😎'])();
      },
      win() { if (!ensure()) return; const t = now(); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.12, f, 0.7, 0.14, 'triangle', { wet: 0.4 })); },
      lose() { if (!ensure()) return; const t = now(); [392, 349.23].forEach((f, i) => tone(t + i * 0.15, f, 0.5, 0.1, 'triangle', { wet: 0.3 })); },
    };
  })();

  root.FX = {
    init, resize, burst, ring, raysAt, bolt, flash, shake, dust, cardImpact, charge, aura, trail, sparkleAt, confetti, floatText, stamp, slash, vortex, thunder,
    setQuality(q) { quality = q; },
    getQuality: () => quality,
    GOLD, CRIMSON, VIOLET, STEEL, EMERALD, ICE,
  };
  root.SFX = SFX;
})(typeof self !== 'undefined' ? self : this);
