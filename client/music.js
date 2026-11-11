// Фоновая музыка «В Точку»: меню, рейтинговое лобби и победа.
// Громкость — через Web Audio (на iPhone свойство audio.volume не работает), смена треков — плавным переходом.
// Браузеры не дают играть звук до первого касания — музыка стартует после него.
'use strict';
(function (root) {
  const TRACKS = {
    menu: { src: '/music/menu.mp3', loop: true },
    ranked: { src: '/music/ranked.mp3', loop: true },
    victory: { src: '/music/victory.mp3', loop: false },
  };
  const FADE_IN = 1.6, FADE_OUT = 1.2;
  let ac = null, master = null, unlocked = false;
  let vol = 0.2, on = true, want = null, hidden = !!document.hidden;
  const ch = {}; // имя трека → { el, g, stopT }

  function ensureCtx() {
    if (ac) return ac;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = vol;
      master.connect(ac.destination);
    } catch { ac = null; }
    return ac;
  }
  function channel(name) {
    if (ch[name]) return ch[name];
    const t = TRACKS[name];
    const el = new Audio();
    el.preload = 'auto'; el.loop = t.loop; el.src = t.src;
    el.setAttribute('playsinline', '');
    const c = { el, g: null, level: 0, stopT: 0 };
    if (ac) {
      try {
        const src = ac.createMediaElementSource(el);
        c.g = ac.createGain(); c.g.gain.value = 0;
        src.connect(c.g); c.g.connect(master);
      } catch { c.g = null; }
    }
    if (!c.g) el.volume = 0;
    ch[name] = c;
    return c;
  }
  // Плавно довести громкость канала до level (0…1) за sec секунд.
  function fade(c, level, sec) {
    c.level = level;
    if (c.g) {
      const t = ac.currentTime, g = c.g.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level, t + sec);
      return;
    }
    // Без Web Audio — шагами через audio.volume.
    clearInterval(c.iv);
    const from = c.el.volume, to = level * vol, steps = Math.max(1, Math.round(sec * 20));
    let i = 0;
    c.iv = setInterval(() => { i++; c.el.volume = Math.min(1, Math.max(0, from + (to - from) * i / steps)); if (i >= steps) clearInterval(c.iv); }, 50);
  }
  function apply() {
    if (!unlocked) return;
    const target = on && vol > 0 && !hidden ? want : null;
    for (const [name, c] of Object.entries(ch)) {
      if (name === target) continue;
      if (c.level > 0 || !c.el.paused) {
        fade(c, 0, FADE_OUT);
        clearTimeout(c.stopT);
        c.stopT = setTimeout(() => { if (c.level === 0) { c.el.pause(); if (!TRACKS[name].loop && want !== name) c.el.currentTime = 0; } }, FADE_OUT * 1000 + 100);
      }
    }
    if (!target) return;
    const c = channel(target);
    clearTimeout(c.stopT);
    if (c.el.paused && !(c.el.ended && !TRACKS[target].loop)) c.el.play().catch(() => {});
    fade(c, 1, FADE_IN);
  }
  function unlock() {
    if (!unlocked) { unlocked = true; ensureCtx(); apply(); }
    if (ac && ac.state !== 'running') ac.resume().catch(() => {});
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; apply(); });

  const Music = {
    // Какой трек должен играть: 'menu' | 'ranked' | 'victory' | null. restart — начать заново (победа в новой партии).
    play(name, restart = false) {
      if (name === want && !restart) return;
      want = name;
      if (restart && name && ch[name]) { ch[name].el.currentTime = 0; }
      apply();
    },
    setVolume(v) {
      vol = Math.max(0, Math.min(1, v));
      if (master) { const t = ac.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(vol, t, 0.05); }
      else for (const c of Object.values(ch)) if (!c.g) c.el.volume = c.level * vol;
      apply();
    },
    setOn(b) { on = !!b; apply(); },
    get current() { return want; },
  };
  root.Music = Music;
})(window);
