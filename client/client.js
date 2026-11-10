// Веб-клиент «По ушам»: меню, лобби и стол 2.5D с анимациями.
// Правила и состояние — на сервере; клиент только показывает стол, анимирует изменения и отправляет действия.
'use strict';
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const STORE_KEY = 'pousham-session', PREF_KEY = 'pousham-prefs';

  const S = { view: null, es: null, room: null, token: null, err: '', connecting: false, prefillCode: '', screen: null, tab: 'create', players: 4, rounds: 17, busy: false };

  // ---------- настройки и сессия ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function save(key, patch) { try { localStorage.setItem(key, JSON.stringify({ ...load(key), ...patch })); } catch {} }
  const prefs = { sound: true, fx: 'high', ...load(PREF_KEY) };
  function applyPrefs() {
    SFX.setMuted(!prefs.sound);
    FX.setQuality(prefs.fx === 'high' ? 1 : 0.4);
  }

  // ---------- сеть ----------
  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j.error || 'Ошибка соединения');
    return j;
  }
  function connect(room, token) {
    S.room = room; S.token = token; S.err = ''; S.connecting = true;
    save(STORE_KEY, { room, token });
    if (S.es) S.es.close();
    const es = new EventSource(`/api/events?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);
    es.onmessage = e => { S.connecting = false; enqueue(JSON.parse(e.data)); };
    es.addEventListener('kicked', e => {
      let reason = 'Вас убрали со стола.';
      try { reason = JSON.parse(e.data).reason || reason; } catch {}
      es.close(); leave(reason);
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        const code = S.room;
        leave('Не удалось вернуться за стол автоматически. Введите код комнаты и то же имя, под которым играли. Если сервер перезапускался, комната могла пропасть — тогда создайте новую.');
        S.prefillCode = code || '';
        showHome();
      }
    };
    S.es = es;
    history.replaceState(null, '', '?room=' + room);
    if (!S.view) showConnecting();
  }
  function leave(msg) {
    if (S.es) S.es.close();
    S.es = null; S.view = null; S.room = null; S.token = null; S.connecting = false;
    Q.length = 0;
    save(STORE_KEY, { room: null, token: null });
    history.replaceState(null, '', '/');
    closeModal();
    if (Game.el) Game.destroy();
    S.err = msg || '';
    showHome();
  }
  async function act(body) {
    if (S.busy) return;
    S.busy = true;
    try { await api('/api/action', { room: S.room, token: S.token, ...body }); }
    catch (e) { toast(e.message); }
    finally { S.busy = false; }
  }

  // Обновления от сервера проигрываются по очереди, чтобы анимации не налезали друг на друга.
  const Q = [];
  let pumping = false;
  function enqueue(v) { Q.push(v); if (!pumping) pump(); }
  async function pump() {
    pumping = true;
    while (Q.length) {
      const v = Q.shift();
      const fast = Q.length > 3;
      try { await apply(v, fast); } catch (e) { console.error(e); }
    }
    pumping = false;
  }
  async function apply(v, fast) {
    S.view = v;
    if (v.stage === 'lobby') { if (Game.el) Game.destroy(); showLobby(v); return; }
    if (!Game.el) { showGameScreen(); }
    await Game.update(v, fast);
  }

  // ---------- экраны ----------
  const screenEl = () => $('#screen');
  function setScreen(name, html, cls = '') {
    const host = screenEl();
    const old = host.querySelector('.screen:not(.leave)');
    if (old && S.screen === name) { return old; }
    if (old) { old.classList.add('leave'); setTimeout(() => old.remove(), 380); }
    const el = document.createElement('div');
    el.className = `screen enter ${cls}`;
    el.innerHTML = html;
    host.appendChild(el);
    S.screen = name;
    return el;
  }

  function showConnecting() {
    setScreen('connecting', `<div class="connecting"><div style="text-align:center"><div class="loader"></div>
      <div class="gold-text logo" style="font-size:34px">По ушам</div>
      <div class="hint">Подключаюсь к столу ${esc(S.room || '')}… Если сервер спал, это может занять до минуты.</div></div></div>`);
  }

  function miniCard(id, i, n) {
    const c = Cards.parse(id);
    const a = (i - (n - 1) / 2) * 13;
    return `<div class="card hc" data-i="${i}" style="--cw:min(27vh,16vw);--ch:calc(var(--cw) * 1.4);transform-origin:50% 115%;transform:translate(-50%,-55%) rotate(${a}deg) translateZ(${i * 8}px);animation:fanIn .9s ${0.15 + i * 0.1}s cubic-bezier(.2,.9,.3,1.2) both">
      <div class="aura" style="opacity:.5;background:radial-gradient(closest-side,rgba(232,196,106,.35),transparent)"></div>
      <div class="ci"><div class="face front" style="background-image:${Cards.url(c)}"></div></div></div>`;
  }

  function showHome() {
    const sess = load(STORE_KEY);
    const roomParam = (new URLSearchParams(location.search).get('room') || S.prefillCode || '').toUpperCase();
    if (roomParam) S.tab = 'join';
    const fan = ['Т♠', 'К♥', '7♠', 'Д♦', 'Т♥'];
    const el = setScreen('home', `
      <div class="home">
        <div class="home-fan"><div class="home-fan-inner">${fan.map((id, i) => miniCard(id, i, fan.length)).join('')}</div></div>
        <div class="home-panel glass">
          <div><h1 class="logo gold-text">По ушам</h1><div class="logo-sub">карточная игра</div></div>
          <label class="field">Ваше имя<input id="name" maxlength="20" autocomplete="nickname" value="${esc(sess.name || '')}" placeholder="Как вас зовут?"></label>
          <div class="tabs"><button data-act="tab" data-tab="create">Создать стол</button><button data-act="tab" data-tab="join">Войти по коду</button></div>
          <div class="pane" data-pane="create">
            <div class="row"><span class="hint">Игроков</span><div class="seg" id="seg-players">${[2, 3, 4].map(n => `<button data-act="players" data-n="${n}">${n}</button>`).join('')}</div>
              <span class="hint" style="margin-left:8px">Раундов</span><div class="stepper"><button data-act="rounds" data-d="-1">−</button><b id="rounds-val">${S.rounds}</b><button data-act="rounds" data-d="1">+</button></div></div>
            <button class="btn-gold" data-act="create">Создать стол</button>
          </div>
          <div class="pane" data-pane="join">
            <label class="field code-input">Код комнаты<input id="code" maxlength="4" value="${esc(roomParam)}" placeholder="····" autocapitalize="characters"></label>
            <button class="btn-gold" data-act="join">Войти</button>
            <span class="hint">Вылетели из игры? Введите код и то же имя — вернётесь на своё место.</span>
          </div>
          <div class="err" id="err">${esc(S.err)}</div>
          <div class="home-foot"><button class="btn-ghost" data-act="rules">Правила</button><button class="btn-ghost" data-act="fullscreen">Во весь экран</button></div>
        </div>
      </div>`);
    if (!document.getElementById('fanKF')) {
      const st = document.createElement('style'); st.id = 'fanKF';
      st.textContent = '@keyframes fanIn{from{opacity:0;transform:translate(-50%,40%) rotate(0deg) scale(.6)}}';
      document.head.appendChild(st);
    }
    syncHome(el);
  }
  function syncHome(el = screenEl()) {
    el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    el.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === S.tab));
    el.querySelectorAll('#seg-players button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.players));
    const rv = $('#rounds-val', el); if (rv) rv.textContent = S.rounds;
  }

  function joinLink(code) { return `${location.origin}/?room=${code}`; }
  function showLobby(v) {
    let el = screenEl().querySelector('.screen:not(.leave)');
    if (S.screen !== 'lobby') {
      el = setScreen('lobby', `
        <div class="lobby">
          <div class="lobby-qr glass">
            <div class="qr-frame">${(() => { try { return window.qrSvg(joinLink(v.code), {}); } catch { return ''; } })()}</div>
            <div class="room-code gold-text">${esc(v.code)}</div>
            <button class="btn-ghost" data-act="copy">Скопировать ссылку</button>
          </div>
          <div class="lobby-main">
            <div class="lobby-title">Стол <span class="gold-text">${esc(v.code)}</span> <span class="hint">· ${v.rounds} раундов</span></div>
            <div class="hint">Друзья наводят камеру на QR-код или вводят код на главной странице.</div>
            <div class="lobby-seats" id="lobby-seats"></div>
            <div class="row" id="lobby-actions"></div>
          </div>
        </div>`);
    }
    const seats = Array.from({ length: v.size }, (_, i) => {
      const s = v.seats[i];
      if (!s) return `<div class="lseat empty"><div class="ava bot">?</div><div><div class="nm">Свободно</div><div class="sub">займёт бот</div></div></div>`;
      return `<div class="lseat ${i === v.you ? 'me' : ''}">
        <div class="ava ${s.online ? '' : 'off'}">${esc(initial(s.name))}${s.host ? crownSvg() : ''}</div>
        <div style="min-width:0"><div class="nm">${esc(s.name)}${i === v.you ? ' <span class="hint">(вы)</span>' : ''}</div><div class="sub">${s.host ? 'хост' : s.online ? 'в сети' : 'не в сети'}</div></div>
        ${v.isHost && !s.host ? `<button class="btn-ghost kick" data-act="kick" data-seat="${i}">Убрать</button>` : ''}
      </div>`;
    }).join('');
    $('#lobby-seats', el).innerHTML = seats;
    $('#lobby-actions', el).innerHTML = (v.isHost
      ? `<button class="btn-gold" data-act="start">Начать игру</button><span class="hint">Пустые места займут боты</span>`
      : `<div class="loader" style="width:22px;height:22px;margin:0;border-width:2px"></div><span class="hint">Ждём, когда хост начнёт игру…</span>`) +
      `<span style="flex:1"></span><button class="btn-ghost" data-act="rules">Правила</button><button class="btn-ghost" data-act="leave">Выйти</button>`;
  }

  function showGameScreen() {
    const el = setScreen('game', `
      <div class="game">
        <div class="scene"><div class="table-wrap"><div class="table"><div class="rim"></div><div class="felt"><div class="emblem">♥</div></div><div class="light"></div></div></div></div>
        <div class="seats" id="seats"></div>
        <div class="cards" id="cards"></div>
        <div class="hud">
          <div><div class="round-box"><b id="hud-round">—</b> <span class="s" id="hud-sub"></span></div>
            <div class="trump-box"><span>♥</span> козырь</div></div>
          <div class="hud-right">
            <button class="icon-btn" data-act="scores" title="Счёт">${iconSvg('scores')}</button>
            <button class="icon-btn" data-act="menu" title="Меню">${iconSvg('menu')}</button>
          </div>
        </div>
        <div class="status" id="status"></div>
        <div class="action" id="action"></div>
        <div id="vote"></div>
      </div>`);
    Game.mount(el);
  }

  // ---------- иконки ----------
  function iconSvg(name) {
    const p = {
      scores: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
      menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    }[name];
    return `<svg viewBox="0 0 24 24">${p}</svg>`;
  }
  const crownSvg = () => `<svg class="crown" viewBox="0 0 20 14"><path d="M1 13 L2 3 L6.5 8 L10 1 L13.5 8 L18 3 L19 13 Z" fill="#f4dc94" stroke="#8a6420" stroke-width="1"/></svg>`;

  // ---------- модальные окна, тосты ----------
  function showModal(html, cls = '') {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="modal glass ${cls}">${html}</div>`;
    ov.classList.add('on');
  }
  function closeModal() { const ov = $('#overlay'); ov.classList.remove('on'); ov.innerHTML = ''; ov.dataset.kind = ''; }
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function rulesHtml() {
    return `<h2 class="gold-text">Правила</h2><ul class="rules">
      <li>Колода 36 карт, 2–4 игрока. Козыри — черви <b style="color:var(--crimson)">♥</b>.</li>
      <li>Раунды: по 1, 2 … 9 карт, затем по убыванию до 1. Если раундов больше 17 — добавляются раунды по 9 карт.</li>
      <li><b>Первый ход</b> в первом раунде у случайного игрока, дальше переходит по часовой стрелке (корона ♛).</li>
      <li><b>Заявка:</b> начинает следующий после ходящего. Можно заявить от 0 до числа карт; сумма заявок может быть любой.</li>
      <li><b>Ходы:</b> отвечать <b>в масть</b> первой карты; козырь ♥ и 7♠ можно положить всегда. Если ходят козырем — отвечать козырем, если он есть. Нет масти — любую карту. Взятку забирает сильнейшая карта, её владелец ходит следующим.</li>
      <li><b>Очки:</b> взял ровно заявленное — +20 за карту; заявил 0 и взял 0 — +5; недобор — −20 за каждую; перебор — +2.</li>
      <li><b>7♠:</b> всегда можно сыграть как обычную. Первым ходом — «Старшие на стол!»: все кладут самую сильную карту, взятку забирает ходивший. В ответ — как самую старшую карту, забирает взятку.</li>
    </ul><div class="actions"><button class="btn-gold" data-act="close">Понятно</button></div>`;
  }
  function showMenu() {
    showModal(`<h2 class="gold-text">Меню</h2><div class="menu-list">
      <button class="btn-ghost" data-act="sound">Звук: ${prefs.sound ? 'включён' : 'выключен'}</button>
      <button class="btn-ghost" data-act="quality">Эффекты: ${prefs.fx === 'high' ? 'максимум' : 'экономно'}</button>
      <button class="btn-ghost" data-act="fullscreen">Во весь экран</button>
      <button class="btn-ghost" data-act="rules">Правила</button>
      <button class="btn-ghost btn-crimson" data-act="leave-ask">Выйти из-за стола</button>
    </div><div class="actions"><button class="btn-gold" data-act="close">Назад</button></div>`);
  }
  function showScores() {
    const v = S.view;
    if (!v || v.stage !== 'game') return;
    const head = `<tr><th>#</th><th>Карт</th>${v.names.map(n => `<th>${esc(n)}</th>`).join('')}</tr>`;
    const rows = v.history.map((h, i) => `<tr><td>${i + 1}</td><td>${h.cards}</td>${h.delta.map((d, p) =>
      `<td class="${d >= 0 ? 'pos' : 'neg'}">${h.bids[p]}/${h.took[p]} <b>${d >= 0 ? '+' : ''}${d}</b></td>`).join('')}</tr>`).join('');
    const total = `<tr><th></th><th>Итого</th>${v.scores.map(s => `<th class="gold-text">${s}</th>`).join('')}</tr>`;
    showModal(`<h2 class="gold-text">Счёт</h2><table class="hist">${head}${rows}${total}</table>
      <h3 class="hint" style="margin:14px 0 4px">Журнал</h3><div class="log-list">${v.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="actions"><button class="btn-gold" data-act="close">Закрыть</button></div>`);
  }

  // ---------- полный экран ----------
  async function goFullscreen() {
    try {
      const d = document.documentElement;
      if (!document.fullscreenElement) await (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch { toast('Браузер не разрешает полный экран — добавьте сайт на главный экран телефона.'); }
  }

  // ---------- параллакс: мышь и наклон телефона ----------
  const Parallax = (() => {
    let tx = 0, ty = 0, x = 0, y = 0, base = null, raf = 0, gyroAsked = false;
    function frame() {
      x += (tx - x) * 0.08; y += (ty - y) * 0.08;
      document.documentElement.style.setProperty('--px', x.toFixed(4));
      document.documentElement.style.setProperty('--py', y.toFixed(4));
      raf = Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001 ? requestAnimationFrame(frame) : 0;
    }
    const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; go();
    });
    function onOrient(e) {
      if (e.beta == null) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let gx, gy;
      if (ang === 90) { gx = e.beta; gy = -e.gamma; } else if (ang === -90 || ang === 270) { gx = -e.beta; gy = e.gamma; } else { gx = e.gamma; gy = e.beta; }
      if (!base) base = { gx, gy };
      base.gx += (gx - base.gx) * 0.01; base.gy += (gy - base.gy) * 0.01; // медленно подстраиваемся под позу
      tx = Math.max(-1, Math.min(1, (gx - base.gx) / 14)); ty = Math.max(-1, Math.min(1, (gy - base.gy) / 14)); go();
    }
    function enableGyro() {
      if (gyroAsked || typeof DeviceOrientationEvent === 'undefined') return;
      gyroAsked = true;
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onOrient); }).catch(() => {});
      } else addEventListener('deviceorientation', onOrient);
    }
    return { enableGyro };
  })();

  // ---------- геометрия стола ----------
  function dims() {
    const W = innerWidth, H = innerHeight;
    const ch = Math.round(Math.max(66, Math.min(H * 0.27, W * 0.13, 190)));
    const cw = Math.round(ch * 0.714);
    return { W, H, ch, cw, cx: W / 2, cy: H * 0.45 };
  }
  const rel = (v, p) => (p - v.you + v.n) % v.n;
  function spotOf(v, p) {
    const r = rel(v, p);
    if (r === 0) return 'me';
    if (v.n === 2) return 'top';
    if (v.n === 3) return r === 1 ? 'tl' : 'tr';
    return ['me', 'left', 'top', 'right'][r];
  }
  function slotXY(spot, d) {
    const { cx, cy, cw, ch } = d;
    switch (spot) {
      case 'me': return [cx, cy + ch * 0.34];
      case 'top': return [cx, cy - ch * 0.34];
      case 'left': return [cx - cw * 1.05, cy];
      case 'right': return [cx + cw * 1.05, cy];
      case 'tl': return [cx - cw * 0.62, cy - ch * 0.2];
      case 'tr': return [cx + cw * 0.62, cy - ch * 0.2];
    }
    return [cx, cy];
  }
  function handXY(i, m, d, sel) {
    const c = (m - 1) / 2, off = i - c;
    const avail = Math.min(d.W * 0.56, d.cw * 0.8 * m + d.cw);
    const step = m > 1 ? Math.min(d.cw * 0.74, (avail - d.cw) / (m - 1)) : 0;
    const rot = off * Math.min(5, 34 / Math.max(m, 1));
    let y = d.H - d.ch * 0.38 + off * off * Math.min(3.2, 20 / Math.max(m, 1));
    if (sel) y -= d.ch * 0.3;
    return { x: d.W * 0.545 + off * step, y, rot, s: sel ? 1.08 : 1 };
  }
  const TABLE_SCALE = 0.8;

  // Уровень эффектов по редкости карты.
  function tierOf(card, mode) {
    const r = card.rank;
    if (card.id === '7♠' && mode && mode !== 'normal') return { kind: 'legend', level: 9, big: true, hold: 0, cls: 'glow-legend' };
    if (card.id === '7♠') return { kind: 'mystic', level: 3, big: false, cls: 'glow-mystic' };
    if (card.suit === '♥') return { kind: 'trump', level: r, big: r >= 5, hold: 140 + r * 50, cls: r >= 6 ? 'glow-trump2' : 'glow-trump' };
    return { kind: 'suit', level: r, big: r >= 7, hold: 140 + r * 35, cls: r >= 7 ? 'glow-gold2' : r >= 4 ? 'glow-gold' : '' };
  }

  // ---------- карты в DOM ----------
  const tf = p => `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%) rotate(${p.rot || 0}deg) scale(${p.s == null ? 1 : p.s})`;
  function makeCard(layer, card, faceUp) {
    const el = document.createElement('div');
    el.className = 'card' + (faceUp ? '' : ' down');
    if (card) el.dataset.id = card.id;
    el.innerHTML = '<div class="aura"></div><div class="ci"><div class="face front"></div><div class="face back"></div></div>';
    if (card) el.querySelector('.front').style.backgroundImage = Cards.url(card);
    el.querySelector('.back').style.backgroundImage = Cards.backUrl();
    layer.appendChild(el);
    return el;
  }
  function setCardFace(el, card) {
    el.dataset.id = card.id;
    el.querySelector('.front').style.backgroundImage = Cards.url(card);
  }
  function place(el, p) { el._p = { ...p }; el.style.transform = tf(p); }
  function fly(el, to, o = {}) {
    const from = el._p || to;
    el._p = { ...to };
    if (o.fast) { el.style.transform = tf(to); return Promise.resolve(); }
    const kf = [{ transform: tf(from) }];
    if (o.via) kf.push({ transform: tf(o.via), offset: o.via.offset == null ? 0.5 : o.via.offset });
    kf.push({ transform: tf(to) });
    const a = el.animate(kf, { duration: o.dur || 400, easing: o.ease || 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    return a.finished.then(() => { el.style.transform = tf(to); a.cancel(); }).catch(() => {});
  }

  // ---------- игровой экран ----------
  const Game = {
    el: null, prev: null, hand: new Map(), table: new Map(), seatEls: [], sel: null, special: false,
    resultsShownFor: -1, overShown: false, dealing: false,

    mount(el) {
      this.el = el; this.prev = null; this.hand = new Map(); this.table = new Map(); this.seatEls = []; this.sel = null;
      this.resultsShownFor = -1; this.overShown = false;
      this.cardsLayer = $('#cards', el); this.seatsLayer = $('#seats', el);
      this.applyDims();
      this.onResize = () => { this.applyDims(); if (S.view && S.view.stage === 'game') this.relayout(S.view); };
      addEventListener('resize', this.onResize);
      this.cardsLayer.addEventListener('click', e => {
        const c = e.target.closest('.inhand');
        if (c) this.tapHand(c.dataset.id, c);
      });
    },
    destroy() {
      removeEventListener('resize', this.onResize);
      this.el = null; this.prev = null; this.hand.clear(); this.table.clear();
    },
    applyDims() {
      const d = dims();
      document.documentElement.style.setProperty('--cw', d.cw + 'px');
      document.documentElement.style.setProperty('--ch', d.ch + 'px');
      return d;
    },

    seatCenter(p) {
      const s = this.seatEls[p];
      if (!s) return [innerWidth / 2, innerHeight / 2];
      const r = s.querySelector('.ava').getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    },

    async update(v, fast) {
      const prev = this.prev;
      const newGame = !prev || prev.phase === 'gameOver' && v.phase !== 'gameOver';
      const newRound = newGame || prev.roundIdx !== v.roundIdx;
      this.updateHud(v);
      if (!prev || this.seatEls.length !== v.n) this.buildSeats(v);
      if (newRound) {
        closeModalIf('results'); closeModalIf('over');
        this.overShown = false;
        await this.collectStale(v, true);
        this.updateSeats(v, prev, true);
        await this.deal(v, fast);
      }
      await this.syncTable(v, fast);
      this.updateSeats(v, newRound ? null : prev);
      this.syncHand(v, fast);
      this.updateStatus(v);
      this.updateAction(v);
      this.updateVote(v);
      if (v.phase === 'roundDone' && this.resultsShownFor !== v.roundIdx) { this.resultsShownFor = v.roundIdx; await this.showResults(v, fast); }
      if (v.phase === 'gameOver' && !this.overShown) { this.overShown = true; await this.showGameOver(v, fast); }
      this.prev = v;
    },

    updateHud(v) {
      $('#hud-round', this.el).textContent = `Раунд ${v.roundIdx + 1}/${v.plan.length}`;
      $('#hud-sub', this.el).textContent = `· ${poCards(v.plan[v.roundIdx])}`;
    },

    buildSeats(v) {
      this.seatsLayer.innerHTML = '';
      this.seatEls = [];
      for (let p = 0; p < v.n; p++) {
        const el = document.createElement('div');
        el.className = `seat spot-${spotOf(v, p)}`;
        el.innerHTML = `<div class="ava"><div class="ring"></div><span class="ini"></span></div>
          <div class="info"><div class="nm"></div><div class="sc">0</div><div class="pips"></div></div><div class="fan"></div><div class="xtra"></div>`;
        this.seatsLayer.appendChild(el);
        this.seatEls.push(el);
      }
    },

    updateSeats(v, prev, fresh) {
      for (let p = 0; p < v.n; p++) {
        const el = this.seatEls[p], s = v.seats[p];
        const playing = (v.phase === 'bid' || v.phase === 'play') && !v.paused;
        el.classList.toggle('turn', playing && v.turn === p);
        el.classList.toggle('offline', !s.online);
        const ava = el.querySelector('.ava');
        ava.classList.toggle('bot', s.bot); ava.classList.toggle('off', !s.online);
        el.querySelector('.ini').textContent = initial(s.name);
        const oldCrown = ava.querySelector('.crown');
        if (p === v.leader && !oldCrown) ava.insertAdjacentHTML('beforeend', crownSvg());
        if (p !== v.leader && oldCrown) oldCrown.remove();
        el.querySelector('.nm').textContent = s.name + (p === v.you ? ' (вы)' : '');
        const sc = el.querySelector('.sc');
        if (sc.textContent !== String(v.scores[p])) {
          const from = +sc.textContent || 0;
          countUp(sc, from, v.scores[p], 700);
          if (prev) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
        }
        // заявка и взятки
        const bid = v.bids[p], took = v.took[p];
        const pb = prev && prev.roundIdx === v.roundIdx ? prev.bids[p] : null;
        const pt = prev && prev.roundIdx === v.roundIdx ? prev.took[p] : 0;
        let html;
        if (bid === null) html = `<span class="bidtag wait">${v.phase === 'bid' && v.turn === p ? 'думает…' : 'заявка —'}</span>`;
        else {
          const n = Math.max(bid, took);
          html = `<span class="bidtag ${pb === null && !fresh ? 'pop' : ''}">${took}/${bid}</span>` +
            Array.from({ length: Math.min(n, 9) }, (_, j) => `<span class="pip ${j < took ? (j < bid ? 'got' : 'over') : ''} ${j < took && j >= pt ? 'pop' : ''}"></span>`).join('');
        }
        el.querySelector('.pips').innerHTML = html;
        if (pb === null && bid !== null && !fresh && prev) SFX.chip();
        // веер карт соперника
        if (p !== v.you && !this.dealing) this.renderFan(p, v.handCounts[p]);
        // вылетел / голосование
        let x = '';
        if (!s.bot && !s.online) x += `<span class="tag off">вылетел</span>`;
        if (!s.bot && !s.online && !v.vote && p !== v.you && v.phase !== 'gameOver') x += `<button class="btn-ghost vote-btn" data-act="voteKick" data-seat="${p}">Заменить ботом</button>`;
        el.querySelector('.xtra').innerHTML = x;
      }
    },
    renderFan(p, count) {
      const fan = this.seatEls[p] && this.seatEls[p].querySelector('.fan');
      if (!fan) return;
      if (+fan.dataset.n === count) return;
      fan.dataset.n = count;
      const back = Cards.backUrl();
      fan.innerHTML = Array.from({ length: count }, (_, i) => {
        const a = (i - (count - 1) / 2) * Math.min(12, 70 / Math.max(count, 1));
        return `<i style="background-image:${back};transform:rotate(${a}deg)"></i>`;
      }).join('');
    },

    // Раздача: карты вылетают из колоды к каждому игроку по очереди.
    async deal(v, fast) {
      for (const el of this.hand.values()) el.remove();
      this.hand.clear();
      this.sel = null;
      const k = v.plan[v.roundIdx], d = dims();
      const order = Array.from({ length: v.n }, (_, j) => (v.leader + 1 + j) % v.n);
      const mine = v.hand.slice();
      const els = mine.map(c => {
        const el = makeCard(this.cardsLayer, c, false);
        el.classList.add('inhand');
        place(el, { x: d.cx, y: d.cy, rot: rnd(-4, 4), s: 0.7 });
        el.style.opacity = '0';
        this.hand.set(c.id, el);
        return el;
      });
      if (fast) {
        els.forEach((el, i) => { el.style.opacity = ''; el.classList.remove('down'); place(el, handXY(i, els.length, d)); });
        for (let p = 0; p < v.n; p++) if (p !== v.you) this.renderFan(p, v.handCounts[p]);
        return;
      }
      this.dealing = true;
      for (let p = 0; p < v.n; p++) if (p !== v.you) this.renderFan(p, 0);
      // колода в центре
      const deck = [];
      for (let i = 0; i < 4; i++) { const el = makeCard(this.cardsLayer, null, false); place(el, { x: d.cx + i * 1.5, y: d.cy - i * 1.5, rot: -6 + i, s: 0.75 }); deck.push(el); }
      await wait(250);
      const total = k * v.n, stagger = Math.max(40, Math.min(115, 1500 / total));
      const counts = Array(v.n).fill(0);
      let mi = 0, idx = 0;
      const jobs = [];
      for (let r = 0; r < k; r++) for (const p of order) {
        const delay = idx++ * stagger;
        jobs.push(wait(delay).then(async () => {
          SFX.deal();
          if (p === v.you) {
            const el = els[mi], i = mi++;
            if (!el) return;
            el.style.opacity = '';
            await fly(el, handXY(i, els.length, d), { dur: 420, via: { x: (d.cx + handXY(i, els.length, d).x) / 2, y: d.cy + d.ch * 0.2, rot: 90, s: 0.9, offset: 0.5 } });
          } else {
            const fl = makeCard(this.cardsLayer, null, false);
            place(fl, { x: d.cx, y: d.cy, rot: 0, s: 0.75 });
            const [sx, sy] = this.seatCenter(p);
            await fly(fl, { x: sx, y: sy + 30, rot: rnd(-180, 180), s: 0.34 }, { dur: 380 });
            fl.remove();
            this.renderFan(p, ++counts[p]);
          }
        }));
      }
      await Promise.all(jobs);
      deck.forEach(el => { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }); setTimeout(() => el.remove(), 260); });
      await wait(120);
      els.forEach((el, i) => setTimeout(() => { el.classList.remove('down'); el.classList.add('shine'); SFX.flick(); }, i * 55));
      await wait(els.length * 55 + 420);
      els.forEach(el => el.classList.remove('shine'));
      this.dealing = false;
      for (let p = 0; p < v.n; p++) if (p !== v.you) this.renderFan(p, v.handCounts[p]);
    },

    // Убрать со стола карты прошлой взятки (улетают к тому, кто её взял).
    async collectStale(v, instant) {
      const cur = new Set(v.trick ? v.trick.plays.map(pl => pl.card.id) : []);
      const stale = [...this.table].filter(([id]) => !cur.has(id));
      if (!stale.length) return;
      stale.forEach(([id]) => this.table.delete(id));
      const winner = v.lastTrick ? v.lastTrick.winner : null;
      if (instant || winner == null) { stale.forEach(([, o]) => o.el.remove()); return; }
      const [wx, wy] = this.seatCenter(winner);
      const d = dims();
      FX.trail(d.cx, d.cy, wx, wy);
      SFX.coins();
      await Promise.all(stale.map(([, o], i) => (async () => {
        await wait(i * 70);
        o.el.classList.remove('winner');
        o.el.classList.add('down');
        await fly(o.el, { x: wx, y: wy, rot: rnd(-40, 40), s: 0.28 }, { dur: 520, ease: 'cubic-bezier(.55,0,.75,.2)' });
        o.el.remove();
      })()));
      FX.sparkleAt(wx, wy);
      const seat = this.seatEls[winner];
      if (seat) seat.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.12)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 420, easing: 'ease-out' });
    },

    async syncTable(v, fast) {
      await this.collectStale(v, fast);
      if (!v.trick) return;
      for (const pl of v.trick.plays) {
        if (this.table.has(pl.card.id)) continue;
        await this.playIn(pl, v, fast);
      }
      if (v.phase === 'trickDone' && v.trick) {
        const w = v.trick.plays.find(pl => pl.p === v.trickWinner);
        const o = w && this.table.get(w.card.id);
        if (o && !o.el.classList.contains('winner')) {
          o.el.classList.add('winner');
          const [x, y] = [o.el._p.x, o.el._p.y];
          if (!fast) { FX.sparkleAt(x, y); SFX.chime(2, 'suit'); }
        }
      }
    },

    // Карта ложится на стол: полёт, а для старших карт — подъём, пауза и удар.
    async playIn(pl, v, fast) {
      const d = dims();
      const spot = spotOf(v, pl.p);
      const [sx, sy] = slotXY(spot, d);
      const rot = rnd(-10, 10);
      const info = tierOf(pl.card, pl.mode);
      let el = this.hand.get(pl.card.id);
      if (pl.p === v.you && el) {
        this.hand.delete(pl.card.id);
        el.classList.remove('inhand', 'legal', 'illegal', 'sel', 'nope');
      } else {
        const [ox, oy] = this.seatCenter(pl.p);
        el = makeCard(this.cardsLayer, pl.card, false);
        place(el, { x: ox, y: oy + 20, rot: rnd(-30, 30), s: 0.34 });
        const fan = this.seatEls[pl.p] && this.seatEls[pl.p].querySelector('.fan');
        if (fan && fan.lastElementChild) { fan.lastElementChild.remove(); fan.dataset.n = fan.children.length; }
      }
      const order = this.table.size;
      this.table.set(pl.card.id, { el, p: pl.p, spot });
      el.style.zIndex = 40 + order;
      const target = { x: sx, y: sy, rot, s: TABLE_SCALE };
      if (fast) {
        el.classList.remove('down'); if (info.cls) el.classList.add(info.cls);
        place(el, target); el.style.zIndex = 10 + order;
        return;
      }
      SFX.flick();
      if (info.big) {
        const hx = d.cx + (sx - d.cx) * 0.3, hy = d.cy + (sy - d.cy) * 0.3 - d.ch * 0.12;
        el.classList.add('lifted');
        await fly(el, { x: hx, y: hy, rot: 0, s: info.kind === 'legend' ? 1.7 : 1.35 + info.level * 0.02 }, { dur: 380, ease: 'cubic-bezier(.2,.9,.3,1.1)' });
        el.classList.remove('down');
        el.classList.add('shine');
        if (info.cls) el.classList.add(info.cls);
        FX.aura(hx, hy, info.kind);
        if (info.kind === 'legend') {
          FX.charge(hx, hy, 1.0);
          SFX.whoosh(1.0);
          el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 1000, easing: 'ease-in-out' });
          await wait(1050);
        } else {
          if (info.level >= 8) SFX.whoosh(0.4);
          await wait(info.hold);
        }
        await fly(el, target, { dur: 160, ease: 'cubic-bezier(.7,0,.95,.5)' });
        el.classList.remove('lifted', 'shine');
      } else {
        el.classList.remove('down');
        const from = el._p;
        await fly(el, target, { dur: 440, via: { x: (from.x + sx) / 2, y: Math.min(from.y, sy) - d.ch * 0.22, rot: rot / 2, s: TABLE_SCALE * 1.18, offset: 0.55 } });
        if (info.cls) el.classList.add(info.cls);
      }
      el.style.zIndex = 10 + order;
      this.impact(el, sx, sy, info, pl.mode);
    },

    impact(el, x, y, info, mode) {
      FX.cardImpact(x, y, info);
      SFX.thump(info.level);
      if (info.kind === 'legend') {
        SFX.boom();
        banner(mode === 'command' ? 'СТАРШИЕ НА СТОЛ!' : 'САМАЯ СТАРШАЯ!', 'violet');
        vibrate([40, 30, 90]);
      } else if (info.kind === 'trump' && info.level >= 8) {
        SFX.chime(info.level, 'trump'); banner('ТУЗ КОЗЫРЕЙ!', 'crimson'); vibrate(60);
      } else if (info.level >= 4 || info.kind === 'trump' || info.kind === 'mystic') {
        SFX.chime(info.level, info.kind === 'mystic' ? 'legend' : info.kind);
        if (info.level >= 8) vibrate(30);
      }
      const p = el._p;
      const squash = info.big ? 1.18 : 1.08;
      el.animate([{ transform: tf({ ...p, s: p.s * squash }) }, { transform: tf({ ...p, s: p.s * 0.96 }) }, { transform: tf(p) }], { duration: 260, easing: 'ease-out' });
    },

    // Рука игрока: веер, подсветка разрешённых карт, выбранная карта приподнята.
    syncHand(v, fast) {
      const d = dims();
      const ids = v.hand.map(c => c.id);
      for (const [id, el] of this.hand) if (!ids.includes(id)) { el.remove(); this.hand.delete(id); }
      const myPlay = v.phase === 'play' && v.turn === v.you && !v.paused;
      if (!myPlay || !v.legal.includes(this.sel)) this.sel = myPlay && v.legal.includes(this.sel) ? this.sel : null;
      if (!myPlay) this.closeSpecial();
      v.hand.forEach((c, i) => {
        let el = this.hand.get(c.id);
        if (!el) {
          el = makeCard(this.cardsLayer, c, true);
          el.classList.add('inhand');
          place(el, { ...handXY(i, ids.length, d), y: d.H + d.ch });
          this.hand.set(c.id, el);
        }
        el.classList.toggle('legal', myPlay && v.legal.includes(c.id));
        el.classList.toggle('illegal', myPlay && !v.legal.includes(c.id));
        el.classList.toggle('sel', this.sel === c.id);
        el.style.zIndex = 100 + i;
        const to = handXY(i, ids.length, d, this.sel === c.id);
        const cur = el._p || {};
        if (cur.x !== to.x || cur.y !== to.y || cur.rot !== to.rot || cur.s !== to.s) place(el, to);
      });
    },

    relayout(v) {
      const d = dims();
      for (const o of this.table.values()) { const [x, y] = slotXY(o.spot, d); place(o.el, { ...o.el._p, x, y }); }
      this.syncHand(v, true);
    },

    tapHand(id, el) {
      const v = S.view;
      SFX.unlock(); Parallax.enableGyro();
      if (!v || v.stage !== 'game') return;
      const myPlay = v.phase === 'play' && v.turn === v.you && !v.paused;
      if (!myPlay) { nope(el); toast(v.phase === 'bid' ? 'Сейчас идут заявки' : 'Сейчас не ваш ход'); return; }
      if (!v.legal.includes(id)) {
        nope(el);
        const lead = v.trick && v.trick.plays.length ? v.trick.plays[0].card.suit : null;
        toast(v.trick && v.trick.command ? 'Команда «Старшие на стол!» — нужна самая сильная карта' : `Нужно ходить в масть ${lead} (или козырем ♥ / 7♠)`);
        return;
      }
      if (this.sel !== id) { this.sel = id; SFX.click(); this.syncHand(v); this.updateStatus(v); return; }
      if (id === '7♠' && v.specialModes.length > 1) { this.openSpecial(v); return; }
      this.sel = null;
      act({ type: 'play', cardId: id, mode: 'normal' });
    },
    openSpecial(v) {
      const m = v.specialModes;
      this.special = true;
      $('#action', this.el).innerHTML = `<div class="special-panel glass">
        <h3 class="gold-text">Как сыграть 7♠?</h3>
        <div class="row">
          <button class="btn-ghost" data-act="special" data-mode="normal">Как обычную 7♠</button>
          ${m.includes('command') ? `<button class="btn-violet" data-act="special" data-mode="command">«Старшие на стол!»</button>` : ''}
          ${m.includes('top') ? `<button class="btn-violet" data-act="special" data-mode="top">Как самую старшую</button>` : ''}
        </div>
        <span class="hint">${m.includes('command') ? 'Все кладут самую сильную карту, взятка ваша' : 'Карта бьёт всё, взятка ваша'}</span>
        <button class="btn-ghost" data-act="special-cancel" style="padding:5px 12px">Отмена</button></div>`;
    },
    closeSpecial() { if (this.special) { this.special = false; if (this.el) $('#action', this.el).innerHTML = ''; } },

    updateStatus(v) {
      const st = $('#status', this.el);
      const nm = p => esc(v.names[p]);
      let t = '', mine = false;
      if (v.paused) t = 'Пауза — голосование';
      else if (v.phase === 'bid') { mine = v.turn === v.you; t = mine ? '' : `Заявляет ${nm(v.turn)}…`; }
      else if (v.phase === 'play') {
        mine = v.turn === v.you;
        if (mine) {
          const tr = v.trick, lead = tr && tr.plays.length ? tr.plays[0].card.suit : null;
          const need = v.bids[v.you] - v.took[v.you];
          t = tr && tr.command && tr.plays.length ? 'Старшие на стол — кладите самую сильную' : !lead ? 'Ваш ход — вы ведёте' :
            v.hand.some(c => c.suit === lead) ? `Ваш ход — в масть ${lead}` : `Ваш ход — масти ${lead} нет, любую`;
          t += need > 0 ? ` · добрать ${need}` : need === 0 ? ' · заявка выполнена' : ' · перебор';
          if (this.sel) t = 'Нажмите карту ещё раз, чтобы сыграть';
        } else t = `Ходит ${nm(v.turn)}…`;
      } else if (v.phase === 'trickDone') t = `Взятку берёт ${nm(v.trickWinner)}`;
      else if (v.phase === 'roundDone') t = 'Раунд окончен';
      st.innerHTML = t; st.classList.toggle('mine', mine); st.classList.toggle('up', !!this.sel);
    },

    updateAction(v) {
      const box = $('#action', this.el);
      if (this.special) return;
      const myBid = v.phase === 'bid' && v.turn === v.you && !v.paused;
      if (myBid) {
        const k = v.plan[v.roundIdx];
        const sum = v.bids.reduce((a, b) => a + (b || 0), 0);
        if (box.dataset.kind === 'bid' + v.roundIdx) return;
        box.dataset.kind = 'bid' + v.roundIdx;
        box.innerHTML = `<div class="bid-panel glass"><h3 class="gold-text">Ваша заявка</h3>
          <div class="chips">${Array.from({ length: k + 1 }, (_, b) => `<button class="chip" style="animation-delay:${b * 35}ms" data-act="bid" data-b="${b}">${b}</button>`).join('')}</div>
          <span class="hint">Заявлено другими: ${sum} из ${k}</span></div>`;
      } else if (box.dataset.kind) { box.dataset.kind = ''; box.innerHTML = ''; }
    },

    updateVote(v) {
      const box = $('#vote', this.el);
      if (!v.vote) { box.innerHTML = ''; return; }
      const vt = v.vote;
      const voted = vt.yes.includes(v.you) || vt.no.includes(v.you);
      const canVote = vt.voters.includes(v.you) && !voted;
      const waiting = vt.voters.filter(i => !vt.yes.includes(i) && !vt.no.includes(i)).map(i => esc(v.names[i]));
      box.innerHTML = `<div class="vote-panel glass"><h3 class="gold-text" style="margin:0 0 6px;font-family:var(--font-title);font-size:22px">Пауза — голосование</h3>
        <div>Заменить ботом игрока <b>${esc(v.names[vt.target])}</b>? <span class="hint">За: ${vt.yes.length} · Против: ${vt.no.length}</span></div>
        ${canVote ? `<div class="row" style="justify-content:center;margin-top:8px"><button class="btn-gold" data-act="vote" data-yes="1">Да, заменить</button><button class="btn-ghost" data-act="vote" data-yes="0">Нет, подождём</button></div>` : ''}
        <div class="hint" style="margin-top:6px">${waiting.length ? 'Ждём голоса: ' + waiting.join(', ') + '. ' : ''}Если игрок вернётся, голосование отменится.</div></div>`;
    },

    async showResults(v, fast) {
      const h = v.history[v.history.length - 1];
      if (!h) return;
      if (!fast) {
        await wait(600);
        h.delta.forEach((dl, p) => { const [x, y] = this.seatCenter(p); floater(x, y - 20, dl); });
        const my = h.delta[v.you];
        if (my > 0) { SFX.win(); } else if (my < 0) SFX.lose();
        await wait(900);
      }
      const order = v.names.map((_, p) => p).sort((a, b) => v.scores[b] - v.scores[a]);
      const ov = $('#overlay');
      showModal(`<h2 class="gold-text">Итоги раунда ${v.roundIdx + 1}</h2>
        <table class="res-table"><tr><th>Игрок</th><th>Заявка / взял</th><th>За раунд</th><th>Всего</th></tr>
        ${order.map((p, i) => `<tr class="res-row" style="animation-delay:${i * 90}ms"><td>${esc(v.names[p])}${p === v.you ? ' <span class="hint">(вы)</span>' : ''}</td>
          <td>${h.bids[p]} / ${h.took[p]}</td><td class="d ${h.delta[p] >= 0 ? 'pos' : 'neg'}" data-count="${h.delta[p]}">0</td><td class="d gold-text" data-count="${v.scores[p]}" data-from="${v.scores[p] - h.delta[p]}">${v.scores[p] - h.delta[p]}</td></tr>`).join('')}
        </table><div class="actions"><span class="hint" style="margin-right:auto;align-self:center">Следующий раунд: ${poCards(v.plan[v.roundIdx + 1])}</span>
        <button class="btn-gold" data-act="nextRound">Следующий раунд</button></div>`);
      ov.dataset.kind = 'results';
      ov.querySelectorAll('[data-count]').forEach(td => countUp(td, +(td.dataset.from || 0), +td.dataset.count, 900, td.dataset.from == null));
    },

    async showGameOver(v, fast) {
      if (!fast) await wait(700);
      const order = v.names.map((_, p) => p).sort((a, b) => v.scores[b] - v.scores[a]);
      const iWon = v.scores[v.you] === v.scores[order[0]];
      const podium = order.map((p, i) => `<div class="pl p${i + 1}" style="animation-delay:${(order.length - i) * 150}ms"><div>${esc(v.names[p])}</div><div class="bar">${v.scores[p]}</div></div>`);
      const arranged = order.length >= 3 ? [podium[1], podium[0], podium[2], ...podium.slice(3)] : podium;
      showModal(`<h2 class="gold-text" style="text-align:center">${iWon ? 'Победа!' : 'Игра окончена'}</h2>
        <div class="podium">${arranged.join('')}</div>
        <div class="actions" style="justify-content:center">${v.isHost ? '<button class="btn-gold" data-act="restart">Ещё партию</button>' : '<span class="hint">Новую партию запускает хост</span>'}
        <button class="btn-ghost" data-act="scores">Таблица</button><button class="btn-ghost" data-act="leave">В меню</button></div>`);
      $('#overlay').dataset.kind = 'over';
      FX.confetti(); SFX.win();
      if (iWon) setTimeout(() => FX.confetti(), 900);
    },
  };

  function initial(name) { return (String(name || '?').replace(/^Бот\s+/, '').trim()[0] || '?').toUpperCase(); }
  // «по 1 карте», «по 2 карты», «по 5 карт»
  function poCards(n) {
    const m10 = n % 10, m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? 'карте' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'карты' : 'карт';
    return `по ${n} ${w}`;
  }
  function closeModalIf(kind) { if ($('#overlay').dataset.kind === kind) closeModal(); }
  function nope(el) { if (!el) return; el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); vibrate(15); }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
  function banner(text, cls) {
    const b = $('#banner');
    if (!b) return;
    b.innerHTML = `<div class="t ${cls}">${esc(text)}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function floater(x, y, val) {
    const f = document.createElement('div');
    f.className = `floater ${val >= 0 ? 'pos' : 'neg'}`;
    f.textContent = (val >= 0 ? '+' : '') + val;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    document.getElementById('app').appendChild(f);
    setTimeout(() => f.remove(), 1700);
  }
  function countUp(el, from, to, dur, signed) {
    const t0 = performance.now();
    const fmt = n => (signed && n > 0 ? '+' : '') + n;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- действия по кнопкам ----------
  const actions = {
    tab: b => { S.tab = b.dataset.tab; syncHome(); },
    players: b => { S.players = +b.dataset.n; syncHome(); },
    rounds: b => { S.rounds = Math.max(1, Math.min(40, S.rounds + +b.dataset.d)); syncHome(); },
    create: async () => {
      const name = $('#name').value.trim();
      if (!name) { $('#err').textContent = 'Введите имя'; $('#name').focus(); return; }
      save(STORE_KEY, { name });
      try { const j = await api('/api/create', { name, players: S.players, rounds: S.rounds }); connect(j.room, j.token); }
      catch (e) { $('#err').textContent = e.message; }
    },
    join: async () => {
      const name = $('#name').value.trim();
      const room = $('#code').value.trim().toUpperCase();
      if (!name) { $('#err').textContent = 'Введите имя'; $('#name').focus(); return; }
      if (room.length !== 4) { $('#err').textContent = 'Код комнаты — 4 символа'; return; }
      save(STORE_KEY, { name });
      try { const j = await api('/api/join', { name, room }); connect(j.room, j.token); }
      catch (e) { $('#err').textContent = e.message; }
    },
    copy: async () => {
      const link = joinLink(S.view.code);
      try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch { toast(link); }
    },
    kick: b => act({ type: 'kick', seat: +b.dataset.seat }),
    start: () => act({ type: 'start' }),
    restart: () => { closeModal(); act({ type: 'restart' }); },
    bid: b => { SFX.chip(); $('#action').innerHTML = ''; $('#action').dataset.kind = ''; act({ type: 'bid', value: +b.dataset.b }); },
    special: b => { Game.closeSpecial(); Game.sel = null; act({ type: 'play', cardId: '7♠', mode: b.dataset.mode }); },
    'special-cancel': () => { Game.closeSpecial(); Game.sel = null; if (S.view) { Game.syncHand(S.view); Game.updateStatus(S.view); Game.updateAction(S.view); } },
    nextRound: () => { closeModal(); act({ type: 'nextRound' }); },
    voteKick: b => act({ type: 'voteKick', seat: +b.dataset.seat }),
    vote: b => act({ type: 'vote', value: b.dataset.yes === '1' }),
    scores: () => showScores(),
    menu: () => showMenu(),
    rules: () => showModal(rulesHtml()),
    close: () => closeModal(),
    fullscreen: () => goFullscreen(),
    sound: () => { prefs.sound = !prefs.sound; save(PREF_KEY, prefs); applyPrefs(); showMenu(); if (prefs.sound) SFX.chip(); },
    quality: () => { prefs.fx = prefs.fx === 'high' ? 'low' : 'high'; save(PREF_KEY, prefs); applyPrefs(); showMenu(); },
    'leave-ask': () => showModal(`<h2 class="gold-text">Выйти из-за стола?</h2><p class="hint">Ваше место останется, вернуться можно по коду и тому же имени.</p>
      <div class="actions"><button class="btn-ghost" data-act="close">Остаться</button><button class="btn-gold btn-crimson" data-act="leave">Выйти</button></div>`),
    leave: () => leave(),
  };
  document.addEventListener('click', e => {
    SFX.unlock(); Parallax.enableGyro();
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target.id === 'overlay' && !['results', 'over'].includes($('#overlay').dataset.kind)) closeModal(); return; }
    const fn = actions[b.dataset.act];
    if (fn) { if (!['bid', 'tab'].includes(b.dataset.act)) SFX.click(); fn(b); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && S.screen === 'home') (S.tab === 'join' ? actions.join : actions.create)();
    if (e.key === 'Escape') closeModal();
  });

  // ---------- фон: золотые пылинки ----------
  function motes() {
    const m = $('.motes');
    m.innerHTML = Array.from({ length: 22 }, () =>
      `<i class="mote" style="left:${rnd(0, 100)}%;top:${rnd(30, 100)}%;animation-duration:${rnd(7, 15)}s;animation-delay:${rnd(-15, 0)}s;transform:scale(${rnd(0.5, 1.2)})"></i>`).join('');
  }

  // ---------- старт ----------
  function init() {
    applyPrefs();
    FX.init($('#fx'), $('#shake'));
    motes();
    const sess = load(STORE_KEY);
    const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    if (sess.room && sess.token && (!roomParam || roomParam === sess.room)) connect(sess.room, sess.token);
    else showHome();
  }
  window.PoUsham = { S, Game, tierOf, enqueue }; // для отладки
  init();
})();
