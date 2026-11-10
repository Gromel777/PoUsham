// Эффекты «По ушам»: частицы на canvas, ударные волны, лучи, молнии, вспышки, тряска экрана и синтез звука.
// Чем старше карта — тем богаче эффект: обычные масти (золото), козыри ♥ (багрянец), 7♠ (легендарный, фиолетово-золотой).
'use strict';
(function (root) {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  const GOLD = ['#fff3c4', '#f6d27a', '#e0a93a', '#ffe9a8'];
  const CRIMSON = ['#ff4d5e', '#ff7a4d', '#ffc08a', '#e0112f', '#ff2d55'];
  const VIOLET = ['#c9a2ff', '#8c5bff', '#f6d27a', '#efe3ff', '#6a2cff'];

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

  // Эффект приземления карты. info: { kind: 'suit'|'trump'|'mystic'|'legend', level: 0..8 }
  function cardImpact(x, y, info) {
    const L = info.level;
    if (info.kind === 'suit') {
      dust(x, y, 6 + L);
      if (L >= 2) burst(x, y, { n: 4 + L * 4, speed: [140, 260 + L * 40], size: [1.5, 2.5 + L * 0.2] });
      if (L >= 4) ring(x, y, { r1: 60 + L * 14, color: '#f6d27a', width: 3 + L * 0.3 });
      if (L >= 5) burst(x, y, { n: L * 2, type: 'glow', speed: [30, 90], g: -50, life: [0.6, 1.2], size: [8, 16], size2: 0.3 });
      if (L >= 6) ring(x, y, { r1: 40 + L * 10, color: '#fff3c4', width: 2, delay: 0.08 });
      if (L >= 7) raysAt(x, y, { count: 10, len: 150 + L * 24, color: 'rgba(246,210,122,1)', life: 0.8, a: 0.35 });
      if (L >= 8) {
        flash('#ffe7a3', 0.16, 0.4, { mode: 'lighter' });
        raysAt(x, y, { count: 16, len: 340, color: 'rgba(255,233,168,1)', life: 1.1, a: 0.45, spin: 0.8 });
        burst(x, y, { n: 14, type: 'glyph', glyphs: ['♠', '♣', '♦'], colors: GOLD, speed: [160, 320], size: [14, 24], g: 200, life: [0.8, 1.2] });
        ring(x, y, { r1: 260, color: '#f6d27a', width: 5, delay: 0.12 });
        shake(7, 0.35);
      }
    } else if (info.kind === 'trump') {
      ring(x, y, { r1: 55 + L * 16, color: '#ff4d5e', width: 3 + L * 0.4 });
      burst(x, y, { n: 8 + L * 5, type: 'ember', colors: CRIMSON, speed: [40, 120 + L * 15], g: -90, life: [0.7, 1.4], size: [8, 16 + L], size2: 0.2, drag: 0.94 });
      if (L >= 2) burst(x, y, { n: 6 + L * 4, colors: CRIMSON, speed: [160, 300 + L * 40], size: [1.5, 3] });
      if (L >= 4) {
        ring(x, y, { r1: 40 + L * 12, color: '#ffc08a', width: 2, delay: 0.1 });
        burst(x, y, { n: 3 + L, type: 'glyph', glyphs: ['♥'], colors: CRIMSON, speed: [60, 160], g: -120, life: [0.9, 1.5], size: [12, 22], add: true });
      }
      if (L >= 6) {
        raysAt(x, y, { count: 14, len: 200 + L * 26, color: 'rgba(255,77,94,1)', life: 0.9, a: 0.4, spin: 0.9 });
        flash('#ff2d55', 0.1, 0.35, { mode: 'lighter' });
        shake(3 + L * 0.6, 0.3);
      }
      if (L >= 8) {
        flash('#ff2d55', 0.16, 0.55, { mode: 'lighter' });
        raysAt(x, y, { count: 22, len: Math.max(W, H) * 0.6, color: 'rgba(255,60,80,1)', life: 1.4, a: 0.38, spin: 1.2, force: true });
        ring(x, y, { r1: 220, color: '#ff4d5e', width: 6, delay: 0.1 });
        ring(x, y, { r1: 360, color: '#ffc08a', width: 3, delay: 0.22 });
        burst(x, y, { n: 26, type: 'glyph', glyphs: ['♥'], colors: CRIMSON, speed: [220, 520], g: 120, life: [1, 1.6], size: [16, 30] });
        burst(x, y, { n: 80, type: 'ember', colors: CRIMSON, speed: [100, 420], g: -40, life: [0.9, 1.8], size: [8, 18], size2: 0.1 });
        shake(12, 0.55);
      }
    } else if (info.kind === 'mystic') {
      ring(x, y, { r1: 90, color: '#b98cff', width: 3 });
      burst(x, y, { n: 18, type: 'ember', colors: VIOLET, speed: [30, 110], g: -70, life: [0.8, 1.5], size: [8, 16], size2: 0.2 });
      burst(x, y, { n: 4, type: 'glyph', glyphs: ['♠'], colors: ['#c9a2ff'], speed: [40, 90], g: -80, life: [1, 1.4], size: [14, 20] });
    } else if (info.kind === 'legend') {
      flash('#ffffff', 0.4, 0.35, { mode: 'lighter' });
      flash('#5a1fd6', 0.2, 1.1, { mode: 'lighter', hold: 0.15 });
      ring(x, y, { r1: Math.max(W, H) * 0.75, color: '#c9a2ff', width: 8, life: 0.9 });
      ring(x, y, { r1: Math.max(W, H) * 0.5, color: '#f6d27a', width: 5, life: 0.8, delay: 0.1 });
      ring(x, y, { r1: 180, color: '#ffffff', width: 3, life: 0.5, delay: 0.2 });
      raysAt(x, y, { count: 24, len: Math.max(W, H), color: 'rgba(185,140,255,1)', life: 1.6, a: 0.38, spin: 1.5, force: true });
      raysAt(x, y, { count: 12, len: Math.max(W, H) * 0.7, color: 'rgba(246,210,122,1)', life: 1.3, a: 0.4, spin: -1 });
      for (let i = 0; i < Math.round(8 * Math.max(quality, 0.5)); i++) {
        const a = rnd(0, TAU), d = Math.max(W, H);
        bolt(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d, { life: rnd(0.35, 0.7), delay: rnd(0, 0.35), color: pick(['#b98cff', '#f6d27a']) });
      }
      burst(x, y, { n: 140, colors: VIOLET, speed: [300, 950], size: [1.5, 3.5], g: 160, life: [0.6, 1.3] });
      burst(x, y, { n: 60, type: 'ember', colors: VIOLET, speed: [80, 380], g: -30, life: [1, 2], size: [10, 22], size2: 0.1 });
      burst(x, y, { n: 22, type: 'glyph', glyphs: ['♠', '★'], colors: ['#c9a2ff', '#f6d27a', '#ffffff'], speed: [200, 520], g: 120, life: [1.1, 1.8], size: [16, 32] });
      shake(18, 0.8);
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
    const c = kind === 'trump' ? CRIMSON : kind === 'legend' || kind === 'mystic' ? VIOLET : GOLD;
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
  const SFX = (() => {
    let ac = null, master = null, muted = false, noiseBuf = null;
    function ensure() {
      if (muted) return null;
      if (!ac) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.55;
        const comp = ac.createDynamicsCompressor();
        master.connect(comp); comp.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function env(g, t, a, d, peak) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function noise(t, dur, type, freq, q, peak, sweepTo) {
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      const g = ac.createGain(); env(g, t, 0.005, dur, peak);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    }
    function tone(t, freq, dur, peak, type = 'sine', to = null, attack = 0.005) {
      const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = ac.createGain(); env(g, t, attack, dur, peak);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + attack + dur + 0.05);
    }
    const now = () => ac.currentTime + 0.01;
    return {
      unlock() { ensure(); },
      setMuted(m) { muted = m; if (m && ac) ac.suspend(); else if (!m && ac) ac.resume(); },
      isMuted: () => muted,
      flick() { if (!ensure()) return; noise(now(), 0.07, 'bandpass', 2600, 1.4, 0.35); },
      deal() { if (!ensure()) return; noise(now(), 0.05, 'highpass', 3000, 0.8, 0.18); },
      thump(level = 0) {
        if (!ensure()) return; const t = now();
        tone(t, 150 + level * 6, 0.16, 0.45, 'sine', 55);
        noise(t, 0.08, 'lowpass', 900, 0.7, 0.3);
      },
      chime(level, kind) {
        if (!ensure()) return; const t = now();
        const base = kind === 'trump' ? 523.25 : kind === 'legend' ? 392 : 659.25;
        const chord = kind === 'trump' ? [1, 1.189, 1.498] : [1, 1.26, 1.498];
        const n = Math.min(3, 1 + Math.floor(level / 3));
        for (let i = 0; i < n; i++) {
          tone(t + i * 0.06, base * chord[i] * (1 + level * 0.02), 0.6 + level * 0.08, 0.12, 'sine');
          tone(t + i * 0.06, base * chord[i] * 2.01, 0.4, 0.04, 'triangle');
        }
      },
      whoosh(dur = 0.8) { if (!ensure()) return; noise(now(), dur, 'bandpass', 300, 2, 0.35, 3200); },
      boom() {
        if (!ensure()) return; const t = now();
        tone(t, 90, 0.9, 0.8, 'sine', 28);
        tone(t, 180, 0.5, 0.2, 'triangle', 60);
        noise(t, 0.7, 'lowpass', 400, 0.8, 0.6, 80);
        [392, 493.88, 587.33, 783.99].forEach((f, i) => tone(t + 0.05 + i * 0.07, f, 1.4, 0.07, 'sine'));
      },
      coins() {
        if (!ensure()) return; const t = now();
        for (let i = 0; i < 5; i++) tone(t + i * 0.05, rnd(1900, 3000), 0.12, 0.06, 'sine');
      },
      click() { if (!ensure()) return; tone(now(), 1400, 0.03, 0.08, 'square'); },
      chip() { if (!ensure()) return; const t = now(); tone(t, 1800, 0.05, 0.1, 'triangle'); tone(t + 0.03, 2400, 0.06, 0.06, 'sine'); },
      win() {
        if (!ensure()) return; const t = now();
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.12, f, 0.7, 0.14, 'triangle'));
      },
      lose() { if (!ensure()) return; const t = now(); [392, 349.23].forEach((f, i) => tone(t + i * 0.15, f, 0.5, 0.1, 'triangle')); },
    };
  })();

  root.FX = {
    init, resize, burst, ring, raysAt, bolt, flash, shake, dust, cardImpact, charge, aura, trail, sparkleAt, confetti, floatText,
    setQuality(q) { quality = q; },
    getQuality: () => quality,
    GOLD, CRIMSON, VIOLET,
  };
  root.SFX = SFX;
})(typeof self !== 'undefined' ? self : this);
