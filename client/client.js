// Веб-клиент «В Точку»: меню, лобби и стол 2.5D с анимациями.
// Правила и состояние — на сервере; клиент показывает стол, анимирует изменения и отправляет действия.
'use strict';
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const STORE_KEY = 'vtochku-session', PREF_KEY = 'vtochku-prefs';
  const MAX_CARDS = n => Math.min(9, Math.floor(36 / n));

  const S = {
    view: null, es: null, room: null, token: null, err: '', connecting: false, prefillCode: '', screen: null, busy: false,
    tab: 'create', players: 4, rounds: 17, roundsTouched: false, turnTime: 30, bluff: false,
  };

  // ---------- настройки и сессия ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function save(key, patch) { try { localStorage.setItem(key, JSON.stringify({ ...load(key), ...patch })); } catch {} }
  const prefs = { sound: true, fx: 'high', log: true, ...load(PREF_KEY) };
  function applyPrefs() { SFX.setMuted(!prefs.sound); FX.setQuality(prefs.fx === 'high' ? 1 : 0.4); }

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
    es.onmessage = e => { S.connecting = false; const v = JSON.parse(e.data); v._at = Date.now(); enqueue(v); };
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
    if (!Game.el) showGameScreen();
    await Game.update(v, fast);
  }

  // ---------- экраны ----------
  const screenEl = () => $('#screen');
  function setScreen(name, html) {
    const host = screenEl();
    const old = host.querySelector('.screen:not(.leave)');
    if (old && S.screen === name) return old;
    if (old) { old.classList.add('leave'); setTimeout(() => old.remove(), 380); }
    const el = document.createElement('div');
    el.className = 'screen enter';
    el.innerHTML = html;
    host.appendChild(el);
    S.screen = name;
    return el;
  }
  const logoHtml = (size = '') => `<h1 class="logo gold-text" ${size}>В Точку<svg class="logo-mark" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="#e8c46a" stroke-width="2.5"/><circle cx="20" cy="20" r="10" fill="none" stroke="#e8c46a" stroke-width="2"/><circle cx="20" cy="20" r="4.5" fill="#ff4d5e"/></svg></h1>`;

  function showConnecting() {
    setScreen('connecting', `<div class="connecting"><div style="text-align:center"><div class="loader"></div>${logoHtml('style="font-size:34px"')}
      <div class="hint">Подключаюсь к столу ${esc(S.room || '')}… Если сервер спал, это может занять до минуты.</div></div></div>`);
  }

  function miniCard(id, i, n) {
    const c = Cards.parse(id);
    const a = (i - (n - 1) / 2) * 13;
    return `<div class="card hc" style="--cw:min(27vh,16vw);--ch:calc(var(--cw) * 1.4);transform-origin:50% 115%;transform:translate(-50%,-55%) rotate(${a}deg) translateZ(${i * 8}px);animation:fanIn .9s ${0.15 + i * 0.1}s cubic-bezier(.2,.9,.3,1.2) both">
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
          <div>${logoHtml()}<div class="logo-sub">заяви и попади</div></div>
          <label class="field">Ваше имя<input id="name" maxlength="20" autocomplete="nickname" value="${esc(sess.name || '')}" placeholder="Как вас зовут?"></label>
          <div class="tabs"><button data-act="tab" data-tab="create">Создать стол</button><button data-act="tab" data-tab="join">Войти по коду</button></div>
          <div class="pane" data-pane="create">
            <div class="row"><span class="opt-label">Игроков</span><div class="seg" id="seg-players">${[2, 3, 4, 5, 6].map(n => `<button data-act="players" data-n="${n}">${n}</button>`).join('')}</div></div>
            <div class="row"><span class="opt-label">Раундов</span><div class="stepper"><button data-act="rounds" data-d="-1">−</button><b id="rounds-val"></b><button data-act="rounds" data-d="1">+</button></div>
              <span class="opt-label" style="min-width:0;margin-left:6px">Таймер</span>
              <div class="stepper"><button data-act="timer" data-d="-5">−</button><input class="num-input" id="timer-val" inputmode="numeric" maxlength="3"><button data-act="timer" data-d="5">+</button></div><span class="hint">сек</span></div>
            <div class="row"><label class="switch" data-act="bluff" id="bluff-sw"><i></i><span>Режим обмана</span></label><span class="hint" id="timer-hint"></span></div>
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
    const tv = $('#timer-val', el);
    if (tv) tv.addEventListener('change', () => { S.turnTime = clampTimer(parseInt(tv.value, 10)); syncHome(); });
    syncHome(el);
  }
  function clampTimer(t) { return Number.isFinite(t) ? Math.max(0, Math.min(600, t)) : 30; }
  function syncHome(el = screenEl()) {
    if (!S.roundsTouched) S.rounds = 2 * MAX_CARDS(S.players) - 1;
    el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    el.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === S.tab));
    el.querySelectorAll('#seg-players button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.players));
    const rv = $('#rounds-val', el); if (rv) rv.textContent = S.rounds;
    const tv = $('#timer-val', el); if (tv && document.activeElement !== tv) tv.value = S.turnTime;
    const th = $('#timer-hint', el); if (th) th.textContent = S.turnTime ? `до ${MAX_CARDS(S.players)} карт · ${S.turnTime} с на ход` : `до ${MAX_CARDS(S.players)} карт · без таймера`;
    const sw = $('#bluff-sw', el); if (sw) sw.classList.toggle('on', S.bluff);
  }

  function joinLink(code) { return `${location.origin}/?room=${code}`; }
  function settingsLine(v) {
    return `<div class="settings-line"><span>${v.size} игроков</span><span>${v.rounds} раундов</span><span>${v.turnTime ? `таймер ${v.turnTime} с` : 'без таймера'}</span>${v.bluff ? '<span class="bluff">режим обмана</span>' : ''}</div>`;
  }
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
            <div class="lobby-title">Стол <span class="gold-text">${esc(v.code)}</span></div>
            ${settingsLine(v)}
            <div class="lobby-seats" id="lobby-seats"></div>
            <div class="row" id="lobby-actions"></div>
          </div>
        </div>`);
    }
    $('#lobby-seats', el).innerHTML = Array.from({ length: v.size }, (_, i) => {
      const s = v.seats[i];
      if (!s) return `<div class="lseat empty"><div class="ava bot">?</div><div><div class="nm">Свободно</div><div class="sub">займёт бот</div></div></div>`;
      return `<div class="lseat ${i === v.you ? 'me' : ''}">
        <div class="ava ${s.online ? '' : 'off'}">${esc(initial(s.name))}${s.host ? crownSvg() : ''}</div>
        <div style="min-width:0"><div class="nm">${esc(s.name)}${i === v.you ? ' <span class="hint">(вы)</span>' : ''}</div><div class="sub">${s.host ? 'хост' : s.online ? 'в сети' : 'не в сети'}</div></div>
        ${v.isHost && !s.host ? `<button class="btn-ghost kick" data-act="kick" data-seat="${i}">Убрать</button>` : ''}
      </div>`;
    }).join('');
    $('#lobby-actions', el).innerHTML = (v.isHost
      ? `<button class="btn-gold" data-act="start">Начать игру</button><span class="hint">Пустые места займут боты</span>`
      : `<div class="loader" style="width:22px;height:22px;margin:0;border-width:2px"></div><span class="hint">Ждём, когда хост начнёт игру…</span>`) +
      `<span style="flex:1"></span><button class="btn-ghost" data-act="rules">Правила</button><button class="btn-ghost" data-act="leave">Выйти</button>`;
  }

  function showGameScreen() {
    const el = setScreen('game', `
      <div class="game">
        <div class="scene"><div class="table-wrap">${tableSvg()}<div class="table-light"></div></div></div>
        <div class="seats" id="seats"></div>
        <div class="cards" id="cards"></div>
        <div class="checks" id="checks"></div>
        <div class="log-panel ${prefs.log ? '' : 'closed'}" id="log"><div class="log-head" data-act="log"><span>Журнал</span><span class="tg">${prefs.log ? '−' : '+'}</span></div><div class="log-body" id="log-body"></div></div>
        <div class="hud-right">
          <div class="hud-icons">
            <button class="icon-btn" data-act="scores" title="Счёт">${iconSvg('scores')}</button>
            <button class="icon-btn" data-act="menu" title="Меню">${iconSvg('menu')}</button>
          </div>
          <div class="round-box"><b id="hud-round">—</b><span class="s" id="hud-sub"></span><div class="tags"><span class="trump-box"><span>♥</span> козырь</span><span id="hud-mode"></span></div></div>
        </div>
        <div class="me-panel" id="me-panel"></div>
        <div class="status" id="status"></div>
        <div class="action" id="action"></div>
        <div id="vote"></div>
      </div>`);
    Game.mount(el);
  }

  // ---------- стол по образцу: кожаный борт с заклёпками, лакированная дорожка, подстаканники, сукно ----------
  function tableSvg() {
    const cx = 500, cy = 300;
    const ell = (rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    let studs = '';
    for (let i = 0; i < 132; i++) { const [x, y] = ell(487, 289, (i / 132) * Math.PI * 2); studs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="url(#chrome)"/>`; }
    let cups = '';
    for (let i = 0; i < 8; i++) {
      const [x, y] = ell(408, 226, (i / 8) * Math.PI * 2 + Math.PI / 8);
      cups += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><ellipse rx="27" ry="19" fill="url(#chrome)" stroke="#0a0a0c" stroke-width="1.5"/><ellipse rx="20" ry="13" fill="url(#cupIn)"/><ellipse rx="20" ry="13" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/></g>`;
    }
    return `<svg class="tbl" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <radialGradient id="leather" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3a3a40"/><stop offset=".6" stop-color="#1c1c20"/><stop offset="1" stop-color="#0a0a0c"/></radialGradient>
        <linearGradient id="track" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2f"/><stop offset=".25" stop-color="#050507"/><stop offset=".75" stop-color="#0d0d10"/><stop offset="1" stop-color="#202025"/></linearGradient>
        <radialGradient id="felt" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#26304f"/><stop offset=".55" stop-color="#161d33"/><stop offset="1" stop-color="#0a0e1c"/></radialGradient>
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".45" stop-color="#8d939b"/><stop offset=".7" stop-color="#e8ebef"/><stop offset="1" stop-color="#5a5f66"/></linearGradient>
        <radialGradient id="cupIn" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3b3f45"/><stop offset="1" stop-color="#08090b"/></radialGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a6f22"/><stop offset=".4" stop-color="#f4dc94"/><stop offset="1" stop-color="#a87d2a"/></linearGradient>
        <filter id="noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.55  0 0 0 0 0.7  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
        <clipPath id="feltClip"><ellipse cx="${cx}" cy="${cy}" rx="372" ry="198"/></clipPath>
      </defs>
      <ellipse cx="${cx}" cy="${cy + 26}" rx="478" ry="282" fill="#000" opacity=".55"/>
      <ellipse cx="${cx}" cy="${cy}" rx="496" ry="296" fill="url(#leather)"/>
      <ellipse cx="${cx}" cy="${cy - 6}" rx="478" ry="276" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="10"/>
      <path d="M ${cx - 440} ${cy - 120} Q ${cx} ${cy - 330} ${cx + 440} ${cy - 120}" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="16" stroke-linecap="round"/>
      <ellipse cx="${cx}" cy="${cy}" rx="466" ry="268" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5 4"/>
      ${studs}
      <ellipse cx="${cx}" cy="${cy}" rx="444" ry="252" fill="url(#track)" stroke="#000" stroke-width="3"/>
      <ellipse cx="${cx}" cy="${cy - 4}" rx="428" ry="240" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3"/>
      ${cups}
      <ellipse cx="${cx}" cy="${cy}" rx="376" ry="202" fill="#000"/>
      <ellipse cx="${cx}" cy="${cy}" rx="372" ry="198" fill="url(#felt)"/>
      <rect x="128" y="102" width="744" height="396" fill="#fff" filter="url(#noise)" clip-path="url(#feltClip)" opacity=".7"/>
      <ellipse cx="${cx}" cy="${cy}" rx="372" ry="198" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="18"/>
      <ellipse cx="${cx}" cy="${cy}" rx="330" ry="170" fill="none" stroke="url(#gold)" stroke-opacity=".35" stroke-width="1.5"/>
      <g opacity=".22" transform="translate(${cx} ${cy}) scale(1 .62)">
        <circle r="92" fill="none" stroke="#e8c46a" stroke-width="5"/><circle r="64" fill="none" stroke="#e8c46a" stroke-width="4"/><circle r="36" fill="none" stroke="#e8c46a" stroke-width="3"/>
        <circle r="14" fill="#ff4d5e"/><path d="M0 -125 V-100 M0 100 V125 M-125 0 H-100 M100 0 H125" stroke="#e8c46a" stroke-width="5"/>
      </g>
      <text x="${cx}" y="${cy + 112}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="30" letter-spacing="12" fill="#e8c46a" opacity=".22">В ТОЧКУ</text>
    </svg>`;
  }

  // Кресло: высокая кожаная спинка с каретной стяжкой и золотыми заклёпками.
  function chairSvg() {
    let tufts = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - (r % 2); c++) tufts += `<circle cx="${34 + c * 24 + (r % 2) * 12}" cy="${30 + r * 22}" r="2.6" fill="#050506"/>`;
    let studs = '';
    for (let i = 0; i <= 20; i++) { const a = Math.PI + (i / 20) * Math.PI; studs += `<circle cx="${(80 + Math.cos(a) * 66).toFixed(1)}" cy="${(80 + Math.sin(a) * 66).toFixed(1)}" r="2" fill="#d9b45a"/>`; }
    return `<svg viewBox="0 0 160 140">
      <defs><radialGradient id="chl" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#3a3a42"/><stop offset=".7" stop-color="#141418"/><stop offset="1" stop-color="#060608"/></radialGradient></defs>
      <path d="M8 80 A72 72 0 0 1 152 80 L152 130 Q80 142 8 130 Z" fill="url(#chl)" stroke="#000" stroke-width="2"/>
      <path d="M14 80 A66 66 0 0 1 146 80" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="5"/>
      ${studs}${tufts}
      <path d="M20 102 Q80 112 140 102" stroke="#000" stroke-opacity=".5" stroke-width="2" fill="none"/>
    </svg>`;
  }

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
    ov.dataset.kind = '';
  }
  function closeModal() { const ov = $('#overlay'); ov.classList.remove('on'); ov.innerHTML = ''; ov.dataset.kind = ''; }
  function closeModalIf(kind) { if ($('#overlay').dataset.kind === kind) closeModal(); }
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function rulesHtml() {
    return `<h2 class="gold-text">Правила «В Точку»</h2><ul class="rules">
      <li>Колода 36 карт, 2–6 игроков. Козыри — черви <b style="color:var(--crimson)">♥</b>.</li>
      <li>Раунды идут «горкой»: по 1, 2, 3… карт до максимума и обратно. Максимум — 36 ÷ число игроков, но не больше 9 (5 игроков — 7 карт, 6 — 6). Лишние раунды добавляются на пике.</li>
      <li><b>Первый ход</b> в первом раунде у случайного игрока, дальше переходит по часовой стрелке (корона ♛).</li>
      <li><b>Заявка:</b> начинает следующий после ходящего. Можно заявить от 0 до числа карт; сумма заявок может быть любой.</li>
      <li><b>Ходы:</b> есть масть первой карты — кладёте только её (козырь в этом случае нельзя). Масти нет — любую карту, в том числе козырь. <b>7♠</b> можно положить всегда. Взятку забирает сильнейшая карта, её владелец ходит следующим.</li>
      <li><b>Очки:</b> взял ровно заявленное — +20 за карту; заявил 0 и взял 0 — +5; недобор — −20 за каждую; перебор — +2.</li>
      <li><b>7♠:</b> как обычная карта; первым ходом — «Старшие на стол!» (все кладут самую сильную карту, взятка ваша); в ответ — как самая старшая (забирает взятку).</li>
      <li><b>Таймер:</b> если время на ход вышло, за игрока кладётся случайная честная карта (на заявку — автоматическая оценка руки).</li>
      <li><b>Режим обмана:</b> можно класть любую карту, нарушая правила масти и «Старшие на стол!». Пока взятка на столе, любой может нажать «Проверить» под чужой картой. Поймал — обманщик отдаёт проверившему ${50} очков, карта возвращается, и он обязан положить честную. Ошибся — проверивший теряет 20 очков.</li>
    </ul><div class="actions"><button class="btn-gold" data-act="close">Понятно</button></div>`;
  }
  function showMenu() {
    showModal(`<h2 class="gold-text">Меню</h2><div class="menu-list">
      <button class="btn-ghost" data-act="sound">Звук: ${prefs.sound ? 'включён' : 'выключен'}</button>
      <button class="btn-ghost" data-act="quality">Эффекты: ${prefs.fx === 'high' ? 'максимум' : 'экономно'}</button>
      <button class="btn-ghost" data-act="log">Журнал: ${prefs.log ? 'показан' : 'скрыт'}</button>
      <button class="btn-ghost" data-act="fullscreen">Во весь экран</button>
      <button class="btn-ghost" data-act="rules">Правила</button>
      <button class="btn-ghost btn-crimson" data-act="leave-ask">Выйти из-за стола</button>
    </div><div class="actions"><button class="btn-gold" data-act="close">Назад</button></div>`);
  }
  function showScores() {
    const v = S.view;
    if (!v || v.stage !== 'game') return;
    const head = `<tr><th>#</th><th>Карт</th>${v.names.map(n => `<th>${esc(n)}</th>`).join('')}</tr>`;
    const rows = v.history.map((h, i) => `<tr><td>${i + 1}</td><td>${h.cards}</td>${h.delta.map((d, p) => {
      const b = (h.bonus && h.bonus[p]) || 0, t = d + b;
      return `<td class="${t >= 0 ? 'pos' : 'neg'}">${h.bids[p]}/${h.took[p]} <b>${t >= 0 ? '+' : ''}${t}</b>${b ? ` <span class="hint">(${b > 0 ? '+' : ''}${b})</span>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    const total = `<tr><th></th><th>Итого</th>${v.scores.map(s => `<th class="gold-text">${s}</th>`).join('')}</tr>`;
    showModal(`<h2 class="gold-text">Счёт</h2><table class="hist">${head}${rows}${total}</table>
      <h3 class="hint" style="margin:14px 0 4px">Журнал</h3><div class="log-list">${v.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="actions"><button class="btn-gold" data-act="close">Закрыть</button></div>`);
  }

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
      base.gx += (gx - base.gx) * 0.01; base.gy += (gy - base.gy) * 0.01;
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

  // ---------- геометрия ----------
  function dims() {
    const W = innerWidth, H = innerHeight;
    const ch = Math.round(Math.max(76, Math.min(H * 0.3, W * 0.145, 210)));
    const cw = Math.round(ch * 0.714);
    return { W, H, ch, cw, cx: W / 2, cy: H * 0.51 };
  }
  const rel = (v, p) => (p - v.you + v.n) % v.n;
  const SPOTS = { 2: ['me', 'top'], 3: ['me', 'tl', 'tr'], 4: ['me', 'left', 'top', 'right'], 5: ['me', 'left', 'tl', 'tr', 'right'], 6: ['me', 'left', 'tl', 'top', 'tr', 'right'] };
  const spotOf = (v, p) => SPOTS[v.n][rel(v, p)];
  const SPOT_ANGLE = { me: 90, left: 180, right: 0, top: -90, tl: -128, tr: -52 };
  const CHAIR_ROT = { left: -90, right: 90, top: 0, tl: -28, tr: 28 };
  function slotXY(spot, d, n) {
    const a = SPOT_ANGLE[spot] * Math.PI / 180;
    const rx = d.cw * (n >= 5 ? 1.6 : 1.15), ry = d.ch * (n >= 5 ? 0.3 : 0.33);
    return [d.cx + Math.cos(a) * rx, d.cy + Math.sin(a) * ry];
  }
  function handXY(i, m, d, sel) {
    const c = (m - 1) / 2, off = i - c;
    const avail = Math.min(d.W * 0.5, d.cw * 0.8 * m + d.cw);
    const step = m > 1 ? Math.min(d.cw * 0.74, (avail - d.cw) / (m - 1)) : 0;
    const rot = off * Math.min(5, 34 / Math.max(m, 1));
    let y = d.H - d.ch * 0.36 + off * off * Math.min(3.2, 20 / Math.max(m, 1));
    if (sel) y -= d.ch * 0.3;
    return { x: d.W * 0.58 + off * step, y, rot, s: sel ? 1.08 : 1 };
  }
  let TABLE_SCALE = 0.78;

  // Тема и уровень эффекта по масти и старшинству.
  const SUIT_KIND = { '♠': 'spade', '♣': 'club', '♦': 'diamond', '♥': 'heart' };
  function tierOf(card, mode) {
    const r = card.rank;
    if (card.id === '7♠' && mode && mode !== 'normal') return { kind: 'legend', level: 9, big: true, hold: 0 };
    if (card.id === '7♠') return { kind: 'mystic', level: 3, big: false };
    const kind = SUIT_KIND[card.suit];
    const trump = kind === 'heart';
    return { kind, level: r, big: trump ? r >= 5 : r >= 6, hold: 140 + r * (trump ? 55 : 40) };
  }
  const auraCls = info => `aura-${info.kind}` + (info.level < (info.kind === 'heart' ? 2 : 4) && info.kind !== 'legend' && info.kind !== 'mystic' ? ' weak' : '');

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
    resultsShownFor: -1, overShown: false, dealing: false, checkSeq: 0, timerTick: 0, lastTickSec: -1,

    mount(el) {
      TABLE_SCALE = 0.78;
      Object.assign(this, { el, prev: null, hand: new Map(), table: new Map(), seatEls: [], sel: null, special: false, resultsShownFor: -1, overShown: false, checkSeq: 0 });
      this.cardsLayer = $('#cards', el); this.seatsLayer = $('#seats', el); this.checksLayer = $('#checks', el);
      this.applyDims();
      this.onResize = () => { this.applyDims(); if (S.view && S.view.stage === 'game') this.relayout(S.view); };
      addEventListener('resize', this.onResize);
      this.cardsLayer.addEventListener('click', e => { const c = e.target.closest('.inhand'); if (c) this.tapHand(c.dataset.id, c); });
      clearInterval(this.timerTick);
      this.timerTick = setInterval(() => this.tickTimer(), 200);
    },
    destroy() {
      removeEventListener('resize', this.onResize);
      clearInterval(this.timerTick);
      this.el = null; this.prev = null; this.hand.clear(); this.table.clear();
    },
    applyDims() {
      const d = dims();
      document.documentElement.style.setProperty('--cw', d.cw + 'px');
      document.documentElement.style.setProperty('--ch', d.ch + 'px');
      return d;
    },
    seatCenter(p) {
      const v = S.view;
      if (v && p === v.you) { const a = $('#me-panel .ava', this.el); if (a) { const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; } }
      const s = this.seatEls[p];
      if (!s) return [innerWidth / 2, innerHeight / 2];
      const r = s.querySelector('.ava').getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    },

    async update(v, fast) {
      const prev = this.prev;
      const newGame = !prev || (prev.phase === 'gameOver' && v.phase !== 'gameOver');
      const newRound = newGame || prev.roundIdx !== v.roundIdx;
      if (!prev) this.checkSeq = v.lastCheck ? v.lastCheck.seq : 0;
      this.updateHud(v);
      if (!prev || this.seatEls.length !== v.n) { TABLE_SCALE = v.n >= 5 ? 0.72 : 0.78; this.buildSeats(v); }
      this.updateLog(v);
      if (newRound) {
        closeModalIf('results'); closeModalIf('over');
        this.overShown = false;
        await this.collectStale(v, true);
        this.updateSeats(v, prev, true);
        this.updateMe(v, null);
        await this.deal(v, fast);
      }
      await this.applyCheck(v, fast);
      await this.syncTable(v, fast);
      this.updateSeats(v, newRound ? null : prev);
      this.updateMe(v, newRound ? null : prev);
      this.syncHand(v, fast);
      this.updateChecks(v);
      this.updateStatus(v);
      this.updateAction(v);
      this.updateVote(v);
      this.maybeBoom(v, prev, fast);
      if (v.phase === 'roundDone' && this.resultsShownFor !== v.roundIdx) { this.resultsShownFor = v.roundIdx; await this.showResults(v, fast); }
      if (v.phase === 'gameOver' && !this.overShown) { this.overShown = true; await this.showGameOver(v, fast); }
      this.prev = v;
    },

    updateHud(v) {
      $('#hud-round', this.el).textContent = `Раунд ${v.roundIdx + 1}/${v.plan.length}`;
      $('#hud-sub', this.el).textContent = poCards(v.plan[v.roundIdx]);
      $('#hud-mode', this.el).innerHTML = v.bluff ? '<span class="mode-box">обман</span>' : '';
    },

    updateLog(v) {
      const body = $('#log-body', this.el);
      if (!body) return;
      const lines = v.log.slice(-14);
      const key = lines.join('\n');
      if (body.dataset.key === key) return;
      body.dataset.key = key;
      const myName = v.names[v.you];
      body.innerHTML = lines.slice().reverse().map(l => `<div class="${/ОБМАН|проверяет|время вышло/.test(l) ? 'hot' : l.startsWith(myName) ? 'mine' : ''}">${esc(l)}</div>`).join('');
    },

    buildSeats(v) {
      this.seatsLayer.innerHTML = '';
      this.seatsLayer.className = `seats n${v.n}`;
      this.seatEls = [];
      for (let p = 0; p < v.n; p++) {
        if (p === v.you) { this.seatEls.push(null); continue; }
        const spot = spotOf(v, p);
        const el = document.createElement('div');
        el.className = `seat spot-${spot}`;
        const fanSide = spot === 'right' || spot === 'tr' ? 'l' : 'r';
        el.innerHTML = `<div class="chair" style="--chair-rot:${CHAIR_ROT[spot] || 0}deg">${chairSvg()}</div>
          <div class="ava"><div class="ring"></div><span class="ini"></span></div>
          <div class="plate"><div class="line1"><span class="nm"></span><span class="sc">0</span></div><div class="pips"></div></div>
          <div class="fan ${fanSide}"></div><div class="xtra"></div>`;
        this.seatsLayer.appendChild(el);
        this.seatEls.push(el);
      }
    },

    pipsHtml(v, p, prev, fresh) {
      const bid = v.bids[p], took = v.took[p];
      const same = prev && prev.roundIdx === v.roundIdx;
      const pt = same ? prev.took[p] : 0;
      const n = Math.max(bid || 0, took);
      return Array.from({ length: Math.min(n, 9) }, (_, j) => `<span class="pip ${j < took ? (bid !== null && j < bid ? 'got' : 'over') : ''} ${!fresh && j < took && j >= pt ? 'pop' : ''}"></span>`).join('');
    },

    updateSeats(v, prev, fresh) {
      for (let p = 0; p < v.n; p++) {
        const el = this.seatEls[p];
        if (!el) continue;
        const s = v.seats[p];
        const playing = (v.phase === 'bid' || v.phase === 'play') && !v.paused;
        el.classList.toggle('turn', playing && v.turn === p);
        el.classList.toggle('offline', !s.online);
        const ava = el.querySelector('.ava');
        ava.classList.toggle('bot', s.bot); ava.classList.toggle('off', !s.online);
        el.querySelector('.ini').textContent = initial(s.name);
        const oldCrown = ava.querySelector('.crown');
        if (p === v.leader && !oldCrown) ava.insertAdjacentHTML('beforeend', crownSvg());
        if (p !== v.leader && oldCrown) oldCrown.remove();
        el.querySelector('.nm').textContent = s.name;
        setScore(el.querySelector('.sc'), v.scores[p], !!prev);
        const bid = v.bids[p];
        const pb = prev && prev.roundIdx === v.roundIdx ? prev.bids[p] : null;
        const tag = bid === null ? `<span class="bidtag wait">${v.phase === 'bid' && v.turn === p ? 'думает…' : 'заявка —'}</span>`
          : `<span class="bidtag ${pb === null && !fresh ? 'pop' : ''}">${v.took[p]} из ${bid}</span>`;
        el.querySelector('.pips').innerHTML = tag + this.pipsHtml(v, p, prev, fresh);
        if (pb === null && bid !== null && !fresh && prev) SFX.chip();
        if (!this.dealing) this.renderFan(p, v.handCounts[p]);
        let x = '';
        if (!s.bot && !s.online) x += `<span class="tag off">вылетел</span>`;
        if (!s.bot && !s.online && !v.vote && v.phase !== 'gameOver') x += `<button class="btn-ghost vote-btn" data-act="voteKick" data-seat="${p}">Заменить ботом</button>`;
        el.querySelector('.xtra').innerHTML = x;
      }
    },

    updateMe(v, prev) {
      const box = $('#me-panel', this.el);
      const me = v.you, bid = v.bids[me], took = v.took[me];
      const playing = (v.phase === 'bid' || v.phase === 'play') && !v.paused;
      box.classList.toggle('turn', playing && v.turn === me);
      if (!box.firstChild) {
        box.innerHTML = `<div class="ava"><div class="ring"></div><span class="ini"></span></div>
          <div><div class="nm"></div><div class="sc">0</div>
          <div class="me-counters"><div><b class="b1">—</b><span>заявка</span></div><div><b class="b2">0</b><span>взял</span></div></div>
          <div class="pips"></div></div>`;
      }
      box.querySelector('.ini').textContent = initial(v.names[me]);
      box.querySelector('.nm').textContent = v.names[me];
      const ava = box.querySelector('.ava');
      const oldCrown = ava.querySelector('.crown');
      if (me === v.leader && !oldCrown) ava.insertAdjacentHTML('beforeend', crownSvg());
      if (me !== v.leader && oldCrown) oldCrown.remove();
      setScore(box.querySelector('.sc'), v.scores[me], !!prev);
      const b1 = box.querySelector('.b1'), b2 = box.querySelector('.b2');
      const nb = bid === null ? '—' : String(bid);
      if (b1.textContent !== nb) { b1.textContent = nb; if (prev) popEl(b1); }
      if (b2.textContent !== String(took)) { b2.textContent = took; if (prev) popEl(b2); }
      b2.className = 'b2' + (bid !== null && took === bid ? ' ok' : bid !== null && took > bid ? ' over' : '');
      box.querySelector('.pips').innerHTML = this.pipsHtml(v, me, prev, !prev);
    },

    renderFan(p, count) {
      const fan = this.seatEls[p] && this.seatEls[p].querySelector('.fan');
      if (!fan || +fan.dataset.n === count) return;
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
      const els = v.hand.map(c => {
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
      const deck = [];
      for (let i = 0; i < 4; i++) { const el = makeCard(this.cardsLayer, null, false); place(el, { x: d.cx + i * 1.5, y: d.cy - i * 1.5, rot: -6 + i, s: 0.75 }); deck.push(el); }
      await wait(250);
      const total = k * v.n, stagger = Math.max(35, Math.min(110, 1600 / total));
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
            const to = handXY(i, els.length, d);
            await fly(el, to, { dur: 420, via: { x: (d.cx + to.x) / 2, y: d.cy + d.ch * 0.2, rot: 90, s: 0.9, offset: 0.5 } });
          } else {
            const fl = makeCard(this.cardsLayer, null, false);
            place(fl, { x: d.cx, y: d.cy, rot: 0, s: 0.75 });
            const [sx, sy] = this.seatCenter(p);
            await fly(fl, { x: sx, y: sy, rot: rnd(-180, 180), s: 0.4 }, { dur: 380 });
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

    // Проверка на обман: баннер, очки, пойманная карта возвращается владельцу.
    async applyCheck(v, fast) {
      const lc = v.lastCheck;
      if (!lc || lc.seq <= this.checkSeq) return;
      this.checkSeq = lc.seq;
      const [bx, by] = this.seatCenter(lc.by), [tx, ty] = this.seatCenter(lc.target);
      const o = this.table.get(lc.cardId);
      if (fast) { if (lc.caught && o) { o.el.remove(); this.table.delete(lc.cardId); } return; }
      if (o) {
        const p = o.el._p;
        o.el.animate([{ transform: tf(p) }, { transform: tf({ ...p, s: p.s * 1.25 }) }, { transform: tf(p) }], { duration: 380, easing: 'ease-out' });
        FX.stamp(p.x, p.y, lc.caught);
      }
      if (lc.caught) {
        SFX.caught(); banner('ВРЁШЬ!', 'crimson'); vibrate([50, 40, 80]);
        floater(tx, ty - 30, -lc.delta); floater(bx, by - 30, lc.delta);
        if (o) {
          this.table.delete(lc.cardId);
          await wait(450);
          o.el.classList.remove('winner');
          o.el.classList.add('down');
          if (lc.target === v.you) { await fly(o.el, { x: tx + 60, y: innerHeight + 40, rot: 0, s: 1 }, { dur: 520 }); }
          else await fly(o.el, { x: tx, y: ty, rot: rnd(-30, 30), s: 0.35 }, { dur: 520 });
          o.el.remove();
        }
      } else {
        SFX.honest(); banner('ЧЕСТНО!', 'gold'); vibrate(30);
        floater(bx, by - 30, -lc.delta);
        if (o && !o.el.querySelector('.seal')) o.el.insertAdjacentHTML('beforeend', '<span class="seal">✓</span>');
        await wait(350);
      }
    },

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
        await wait(i * 60);
        o.el.classList.remove('winner');
        o.el.classList.add('down');
        await fly(o.el, { x: wx, y: wy, rot: rnd(-40, 40), s: 0.3 }, { dur: 520, ease: 'cubic-bezier(.55,0,.75,.2)' });
        o.el.remove();
      })()));
      FX.sparkleAt(wx, wy);
    },

    async syncTable(v, fast) {
      await this.collectStale(v, fast);
      if (!v.trick) return;
      for (const pl of v.trick.plays) {
        const o = this.table.get(pl.card.id);
        if (o) { if (pl.checked && !o.el.querySelector('.seal') && v.bluff) o.el.insertAdjacentHTML('beforeend', '<span class="seal">✓</span>'); continue; }
        await this.playIn(pl, v, fast);
      }
      if (v.phase === 'trickDone' && v.trick) {
        const w = v.trick.plays.find(pl => pl.p === v.trickWinner);
        const o = w && this.table.get(w.card.id);
        if (o && !o.el.classList.contains('winner')) {
          o.el.classList.add('winner');
          if (!fast) { FX.sparkleAt(o.el._p.x, o.el._p.y); SFX.chime(2, 'club'); }
        }
      }
    },

    async playIn(pl, v, fast) {
      const d = dims();
      const spot = spotOf(v, pl.p);
      const [sx, sy] = slotXY(spot, d, v.n);
      const rot = rnd(-10, 10);
      const info = tierOf(pl.card, pl.mode);
      let el = this.hand.get(pl.card.id);
      if (pl.p === v.you && el) {
        this.hand.delete(pl.card.id);
        el.classList.remove('inhand', 'legal', 'illegal', 'sel', 'nope', 'bluffy', 'boom');
      } else {
        const [ox, oy] = this.seatCenter(pl.p);
        el = makeCard(this.cardsLayer, pl.card, false);
        place(el, { x: ox, y: oy, rot: rnd(-30, 30), s: 0.4 });
        const fan = this.seatEls[pl.p] && this.seatEls[pl.p].querySelector('.fan');
        if (fan && fan.lastElementChild) { fan.lastElementChild.remove(); fan.dataset.n = fan.children.length; }
      }
      const order = this.table.size;
      this.table.set(pl.card.id, { el, p: pl.p, spot });
      el.style.zIndex = 40 + order;
      el.dataset.spot = spot;
      const target = { x: sx, y: sy, rot, s: TABLE_SCALE };
      if (fast) {
        el.classList.remove('down'); el.className += ' ' + auraCls(info);
        place(el, target); el.style.zIndex = 10 + order;
        return;
      }
      SFX.flick();
      if (info.big) {
        const hx = d.cx + (sx - d.cx) * 0.3, hy = d.cy + (sy - d.cy) * 0.3 - d.ch * 0.12;
        el.classList.add('lifted');
        await fly(el, { x: hx, y: hy, rot: 0, s: info.kind === 'legend' ? 1.7 : 1.3 + info.level * 0.025 }, { dur: 380, ease: 'cubic-bezier(.2,.9,.3,1.1)' });
        el.classList.remove('down');
        el.classList.add('shine');
        el.className += ' ' + auraCls(info);
        FX.aura(hx, hy, info.kind);
        SFX.rise(info);
        if (info.kind === 'legend') {
          FX.charge(hx, hy, 1.0);
          el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 1000, easing: 'ease-in-out' });
          await wait(1050);
        } else await wait(info.hold);
        await fly(el, target, { dur: 160, ease: 'cubic-bezier(.7,0,.95,.5)' });
        el.classList.remove('lifted', 'shine');
      } else {
        el.classList.remove('down');
        const from = el._p;
        await fly(el, target, { dur: 440, via: { x: (from.x + sx) / 2, y: Math.min(from.y, sy) - d.ch * 0.22, rot: rot / 2, s: TABLE_SCALE * 1.18, offset: 0.55 } });
        el.className += ' ' + auraCls(info);
      }
      el.style.zIndex = 10 + order;
      this.impact(el, sx, sy, info, pl.mode);
    },

    impact(el, x, y, info, mode) {
      FX.cardImpact(x, y, info);
      SFX.impact(info);
      if (info.kind === 'legend') { banner(mode === 'command' ? 'СТАРШИЕ НА СТОЛ!' : 'САМАЯ СТАРШАЯ!', 'violet'); vibrate([40, 30, 120]); }
      else if (info.kind === 'heart' && info.level >= 8) { banner('ТУЗ КОЗЫРЕЙ!', 'crimson'); vibrate(70); }
      else if (info.level >= 8) vibrate(30);
      const p = el._p;
      const squash = info.big ? 1.18 : 1.08;
      el.animate([{ transform: tf({ ...p, s: p.s * squash }) }, { transform: tf({ ...p, s: p.s * 0.96 }) }, { transform: tf(p) }], { duration: 260, easing: 'ease-out' });
    },

    syncHand(v) {
      const d = dims();
      const ids = v.hand.map(c => c.id);
      for (const [id, el] of this.hand) if (!ids.includes(id)) { el.remove(); this.hand.delete(id); }
      const myPlay = v.phase === 'play' && v.turn === v.you && !v.paused;
      if (!myPlay || !v.legal.includes(this.sel)) this.sel = null;
      if (!myPlay) this.closeSpecial();
      const honest = new Set(v.honest || v.legal);
      v.hand.forEach((c, i) => {
        let el = this.hand.get(c.id);
        if (!el) {
          el = makeCard(this.cardsLayer, c, true);
          el.classList.add('inhand');
          place(el, { ...handXY(i, ids.length, d), y: d.H + d.ch });
          this.hand.set(c.id, el);
        }
        const legal = myPlay && v.legal.includes(c.id);
        el.classList.toggle('legal', legal && honest.has(c.id));
        el.classList.toggle('bluffy', legal && !honest.has(c.id));
        el.classList.toggle('illegal', myPlay && !legal);
        el.classList.toggle('sel', this.sel === c.id);
        el.style.zIndex = 100 + i;
        const to = handXY(i, ids.length, d, this.sel === c.id);
        const cur = el._p || {};
        if (cur.x !== to.x || cur.y !== to.y || cur.rot !== to.rot || cur.s !== to.s) place(el, to);
      });
    },

    relayout(v) {
      const d = dims();
      for (const o of this.table.values()) { const [x, y] = slotXY(o.spot, d, v.n); place(o.el, { ...o.el._p, x, y }); }
      this.syncHand(v);
      this.updateChecks(v);
    },

    // «БУМ — твой ход»: баннер, карты подпрыгивают, звук.
    maybeBoom(v, prev, fast) {
      if (fast || v.paused) return;
      const mine = (v.phase === 'bid' || v.phase === 'play') && v.turn === v.you;
      const was = prev && (prev.phase === 'bid' || prev.phase === 'play') && prev.turn === prev.you && prev.phase === v.phase && !prev.paused;
      if (!mine || was) return;
      banner(v.fix ? 'ЗАМЕНИ КАРТУ!' : v.phase === 'bid' ? 'ТВОЯ ЗАЯВКА' : 'ТВОЙ ХОД', v.fix ? 'crimson' : 'gold', true);
      SFX.yourTurn(); vibrate(40);
      [...this.hand.values()].forEach((el, i) => setTimeout(() => { el.classList.remove('boom'); void el.offsetWidth; el.classList.add('boom'); }, i * 45));
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
        toast(v.fix ? 'Положите честную карту' : v.trick && v.trick.command ? 'Команда «Старшие на стол!» — нужна самая сильная карта' : `Нужно ходить в масть ${lead} (или 7♠)`);
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
      $('#action', this.el).dataset.kind = 'special';
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
    closeSpecial() { if (this.special) { this.special = false; if (this.el) { const a = $('#action', this.el); a.innerHTML = ''; a.dataset.kind = ''; } } },

    // Кнопки «Проверить» под чужими картами (режим обмана).
    updateChecks(v) {
      const layer = this.checksLayer;
      if (!layer) return;
      const can = v.bluff && !v.fix && !v.paused && (v.phase === 'play' || v.phase === 'trickDone') && v.trick;
      const want = new Map();
      if (can) for (const pl of v.trick.plays) {
        if (pl.p === v.you || pl.checked) continue;
        const o = this.table.get(pl.card.id);
        if (o) want.set(pl.card.id, o);
      }
      layer.querySelectorAll('.check-btn').forEach(b => { if (!want.has(b.dataset.card)) b.remove(); });
      const d = dims();
      for (const [id, o] of want) {
        let b = layer.querySelector(`.check-btn[data-card="${CSS.escape(id)}"]`);
        if (!b) {
          b = document.createElement('button');
          b.className = 'check-btn'; b.dataset.card = id; b.dataset.act = 'check';
          b.textContent = '?';
          b.title = 'Проверить на обман';
          layer.appendChild(b);
        }
        b.style.left = (o.el._p.x + d.cw * TABLE_SCALE * 0.42) + 'px';
        b.style.top = (o.el._p.y - d.ch * TABLE_SCALE * 0.42) + 'px';
      }
    },

    tickTimer() {
      const v = S.view;
      if (!v || v.stage !== 'game' || !this.el) return;
      const t = v.timer;
      const active = t && !v.paused && (v.phase === 'bid' || v.phase === 'play');
      const left = active ? Math.max(0, t.left - (Date.now() - v._at)) : 0;
      const frac = active ? left / t.total : 1;
      const rings = [];
      for (let p = 0; p < v.n; p++) {
        const host = p === v.you ? $('#me-panel', this.el) : this.seatEls[p];
        const ring = host && host.querySelector('.ring');
        if (!ring) continue;
        const isTurn = active && v.turn === p;
        ring.classList.toggle('spin', !t && v.turn === p);
        ring.classList.toggle('low', isTurn && left < 6000);
        ring.style.setProperty('--tp', isTurn ? frac.toFixed(3) : 1);
        rings.push(ring);
      }
      const tm = $('#status .tm', this.el);
      if (tm) {
        const sec = Math.ceil(left / 1000);
        tm.textContent = sec;
        tm.classList.toggle('low', sec <= 5);
        if (active && v.turn === v.you && sec <= 5 && sec !== this.lastTickSec && sec > 0) { this.lastTickSec = sec; SFX.tick(sec); }
      }
    },

    updateStatus(v) {
      const st = $('#status', this.el);
      const nm = p => esc(v.names[p]);
      let t = '', mine = false, warn = false;
      if (v.paused) t = 'Пауза — голосование';
      else if (v.fix) {
        mine = v.fix.p === v.you; warn = true;
        t = mine ? 'Вас поймали! Положите честную карту' : `${nm(v.fix.p)} пойман на обмане — меняет карту`;
      } else if (v.phase === 'bid') { mine = v.turn === v.you; t = mine ? 'Ваша заявка' : `Заявляет ${nm(v.turn)}…`; }
      else if (v.phase === 'play') {
        mine = v.turn === v.you;
        if (mine) {
          const tr = v.trick, lead = tr && tr.plays.length ? tr.plays[0].card.suit : null;
          const need = v.bids[v.you] - v.took[v.you];
          t = tr && tr.command && tr.plays.length ? 'Старшие на стол — самую сильную' : !lead ? 'Ваш ход — вы ведёте' :
            v.hand.some(c => c.suit === lead) ? `Ваш ход — в масть ${lead}` : `Ваш ход — масти ${lead} нет`;
          t += need > 0 ? ` · добрать ${need}` : need === 0 ? ' · заявка выполнена' : ' · перебор';
          if (this.sel) t = (v.honest && v.honest.length && !v.honest.includes(this.sel)) ? 'Это обман! Нажмите ещё раз, чтобы рискнуть' : 'Нажмите карту ещё раз, чтобы сыграть';
        } else t = `Ходит ${nm(v.turn)}…`;
      } else if (v.phase === 'trickDone') t = v.bluff ? `Взятку берёт ${nm(v.trickWinner)} · жми «?», чтобы проверить` : `Взятку берёт ${nm(v.trickWinner)}`;
      else if (v.phase === 'roundDone') t = 'Раунд окончен';
      const showTimer = v.timer && mine && (v.phase === 'bid' || v.phase === 'play') && !v.paused;
      st.innerHTML = t + (showTimer ? '<span class="tm"></span>' : '');
      st.classList.toggle('mine', mine && !warn); st.classList.toggle('warn', warn);
      st.classList.toggle('up', !!this.sel);
      this.tickTimer();
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
      box.innerHTML = `<div class="vote-panel glass"><h3 class="gold-text" style="margin:0 0 6px;font-family:var(--font-title);font-size:24px">Пауза — голосование</h3>
        <div>Заменить ботом игрока <b>${esc(v.names[vt.target])}</b>? <span class="hint">За: ${vt.yes.length} · Против: ${vt.no.length}</span></div>
        ${canVote ? `<div class="row" style="justify-content:center;margin-top:8px"><button class="btn-gold" data-act="vote" data-yes="1">Да, заменить</button><button class="btn-ghost" data-act="vote" data-yes="0">Нет, подождём</button></div>` : ''}
        <div class="hint" style="margin-top:6px">${waiting.length ? 'Ждём голоса: ' + waiting.join(', ') + '. ' : ''}Если игрок вернётся, голосование отменится.</div></div>`;
    },

    async showResults(v, fast) {
      const h = v.history[v.history.length - 1];
      if (!h) return;
      const bonus = h.bonus || h.delta.map(() => 0);
      if (!fast) {
        await wait(600);
        h.delta.forEach((dl, p) => { const [x, y] = this.seatCenter(p); floater(x, y - 24, dl); });
        const my = h.delta[v.you];
        if (my > 0) SFX.win(); else if (my < 0) SFX.lose();
        await wait(900);
      }
      const order = v.names.map((_, p) => p).sort((a, b) => v.scores[b] - v.scores[a]);
      const anyBonus = v.bluff || bonus.some(b => b);
      showModal(`<h2 class="gold-text">Итоги раунда ${v.roundIdx + 1}</h2>
        <table class="res-table"><tr><th>Игрок</th><th>Заявка / взял</th><th>За раунд</th>${anyBonus ? '<th>Проверки</th>' : ''}<th>Всего</th></tr>
        ${order.map((p, i) => `<tr class="res-row ${p === v.you ? 'me-row' : ''}" style="animation-delay:${i * 90}ms"><td>${esc(v.names[p])}${p === v.you ? ' <span class="hint">(вы)</span>' : ''}</td>
          <td>${h.bids[p]} / ${h.took[p]}</td><td class="d ${h.delta[p] >= 0 ? 'pos' : 'neg'}" data-count="${h.delta[p]}" data-signed="1">0</td>
          ${anyBonus ? `<td class="d ${bonus[p] > 0 ? 'pos' : bonus[p] < 0 ? 'neg' : 'hint'}">${bonus[p] ? (bonus[p] > 0 ? '+' : '') + bonus[p] : '—'}</td>` : ''}
          <td class="d"><span class="gold-text" data-count="${v.scores[p]}" data-from="${v.scores[p] - h.delta[p] - bonus[p]}">${v.scores[p] - h.delta[p] - bonus[p]}</span></td></tr>`).join('')}
        </table><div class="actions"><span class="hint" style="margin-right:auto">Следующий раунд: ${poCards(v.plan[v.roundIdx + 1])}</span>
        <button class="btn-gold" data-act="nextRound">Следующий раунд</button></div>`);
      const ov = $('#overlay');
      ov.dataset.kind = 'results';
      ov.querySelectorAll('[data-count]').forEach(td => countUp(td, +(td.dataset.from || 0), +td.dataset.count, 900, !!td.dataset.signed));
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

  // ---------- мелочи ----------
  function initial(name) { return (String(name || '?').replace(/^Бот\s+/, '').trim()[0] || '?').toUpperCase(); }
  function poCards(n) {
    if (n == null) return '';
    const m10 = n % 10, m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? 'карте' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'карты' : 'карт';
    return `по ${n} ${w}`;
  }
  function setScore(el, val, animate) {
    if (el.dataset.v === String(val)) return;
    const from = +(el.dataset.v || 0);
    el.dataset.v = val;
    if (!animate) { el.textContent = val; return; }
    countUp(el, from, val, 700);
    popEl(el, 'bump');
  }
  function popEl(el, cls = 'bump') { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function nope(el) { if (!el) return; el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); vibrate(15); }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
  function banner(text, cls, quick) {
    const b = $('#banner');
    b.innerHTML = `<div class="t ${cls}">${esc(text)}</div>`;
    b.className = 'banner';
    void b.offsetWidth;
    b.classList.add('show'); if (quick) b.classList.add('quick');
  }
  function floater(x, y, val) {
    const f = document.createElement('div');
    f.className = `floater ${val >= 0 ? 'pos' : 'neg'}`;
    f.textContent = (val >= 0 ? '+' : '') + val;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    document.getElementById('app').appendChild(f);
    setTimeout(() => f.remove(), 1800);
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
  let armedCheck = null, armedT = 0;
  const actions = {
    tab: b => { S.tab = b.dataset.tab; syncHome(); },
    players: b => { S.players = +b.dataset.n; syncHome(); },
    rounds: b => { S.roundsTouched = true; S.rounds = Math.max(1, Math.min(60, S.rounds + +b.dataset.d)); syncHome(); },
    timer: b => { const t = S.turnTime + +b.dataset.d; S.turnTime = clampTimer(t < 5 && +b.dataset.d < 0 ? 0 : t === 5 && +b.dataset.d > 0 && S.turnTime === 0 ? 5 : t); syncHome(); },
    bluff: () => { S.bluff = !S.bluff; syncHome(); },
    create: async () => {
      const name = $('#name').value.trim();
      if (!name) { $('#err').textContent = 'Введите имя'; $('#name').focus(); return; }
      const tv = $('#timer-val'); if (tv) S.turnTime = clampTimer(parseInt(tv.value, 10));
      save(STORE_KEY, { name });
      try { const j = await api('/api/create', { name, players: S.players, rounds: S.rounds, turnTime: S.turnTime, bluff: S.bluff }); connect(j.room, j.token); }
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
    bid: b => { SFX.chip(); const a = $('#action'); a.innerHTML = ''; a.dataset.kind = ''; act({ type: 'bid', value: +b.dataset.b }); },
    special: b => { Game.closeSpecial(); Game.sel = null; act({ type: 'play', cardId: '7♠', mode: b.dataset.mode }); },
    'special-cancel': () => { Game.closeSpecial(); Game.sel = null; if (S.view) { Game.syncHand(S.view); Game.updateStatus(S.view); Game.updateAction(S.view); } },
    check: b => {
      if (armedCheck !== b) {
        if (armedCheck) { armedCheck.classList.remove('armed'); armedCheck.textContent = '?'; }
        armedCheck = b; b.classList.add('armed'); b.textContent = 'Проверить? (−20, если честно)';
        clearTimeout(armedT); armedT = setTimeout(() => { if (armedCheck) { armedCheck.classList.remove('armed'); armedCheck.textContent = '?'; armedCheck = null; } }, 2800);
        return;
      }
      armedCheck = null; clearTimeout(armedT);
      act({ type: 'check', cardId: b.dataset.card });
    },
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
    log: b => {
      prefs.log = !prefs.log; save(PREF_KEY, prefs);
      const lp = $('#log'); if (lp) { lp.classList.toggle('closed', !prefs.log); lp.querySelector('.tg').textContent = prefs.log ? '−' : '+'; }
      if (b.closest('.modal')) showMenu();
    },
    'leave-ask': () => showModal(`<h2 class="gold-text">Выйти из-за стола?</h2><p class="hint">Ваше место останется, вернуться можно по коду и тому же имени.</p>
      <div class="actions"><button class="btn-ghost" data-act="close">Остаться</button><button class="btn-gold btn-crimson" data-act="leave">Выйти</button></div>`),
    leave: () => leave(),
  };
  document.addEventListener('click', e => {
    SFX.unlock(); Parallax.enableGyro();
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target.id === 'overlay' && !['results', 'over'].includes($('#overlay').dataset.kind)) closeModal(); return; }
    const fn = actions[b.dataset.act];
    if (fn) { if (!['bid', 'tab', 'check'].includes(b.dataset.act)) SFX.click(); fn(b); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && S.screen === 'home' && e.target.id !== 'timer-val') (S.tab === 'join' ? actions.join : actions.create)();
    if (e.key === 'Escape') closeModal();
  });

  function motes() {
    const m = $('.motes');
    m.innerHTML = Array.from({ length: 22 }, () =>
      `<i class="mote" style="left:${rnd(0, 100)}%;top:${rnd(30, 100)}%;animation-duration:${rnd(7, 15)}s;animation-delay:${rnd(-15, 0)}s;transform:scale(${rnd(0.5, 1.2)})"></i>`).join('');
  }

  function init() {
    applyPrefs();
    FX.init($('#fx'), $('#shake'));
    motes();
    const sess = load(STORE_KEY);
    const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    if (sess.room && sess.token && (!roomParam || roomParam === sess.room)) connect(sess.room, sess.token);
    else showHome();
  }
  window.VT = { S, Game, tierOf, enqueue };
  init();
})();
