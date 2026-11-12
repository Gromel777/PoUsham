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
  const T = I18N.t;

  const S = {
    view: null, es: null, room: null, token: null, err: '', connecting: false, prefillCode: '', screen: null, busy: false,
    tab: 'ranked', players: 4, rounds: 17, roundsTouched: false, turnTime: 30, bluff: false, skills: true, test: false, listed: true,
    rankedSize: 0, casualSize: 0, // 0 — «любой стол»
  };

  // ---------- настройки и сессия ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function save(key, patch) { try { localStorage.setItem(key, JSON.stringify({ ...load(key), ...patch })); } catch {} }
  const prefs = { sound: true, music: true, musicVol: 0.1, fx: 'high', log: true, cards: 'sil', mutes: {}, lang: I18N.lang, ...load(PREF_KEY) };
  // Оформление комнаты (стол, окружение): classic — премиальный стол (в client.js), остальные — модули room-*.js
  // с одинаковым набором tableBase/chair/deco. Выбирается в «Персонализация → Комнаты»; ?skin=… — для быстрого просмотра (?room= занят кодом стола).
  const ROOMS = [['classic', 'Классика'], ['cozy', 'Пижамная вечеринка'], ['office', 'Переговорка']];
  const ROOM_SKINS = { cozy: () => window.RoomCozy, office: () => window.RoomOffice };
  let ROOM = 'classic';
  const roomSkin = () => (ROOM_SKINS[ROOM] ? ROOM_SKINS[ROOM]() : null);
  function applyRoom(k) {
    ROOM = ROOM_SKINS[k] && ROOM_SKINS[k]() ? k : 'classic';
    for (const [r] of ROOMS) document.body.classList.toggle('room-' + r, r === ROOM && r !== 'classic');
    const bg = document.querySelector('.bg'), old = bg && bg.querySelector('.room-deco'), skin = roomSkin();
    if (old && old.dataset.room !== ROOM) old.remove();
    if (skin && bg && !bg.querySelector('.room-deco')) bg.insertAdjacentHTML('beforeend', `<div class="room-deco" data-room="${ROOM}">${skin.deco()}</div>`);
  }
  applyRoom(new URLSearchParams(location.search).get('skin') || prefs.room);
  // Новая колода «Силуэты» становится основной и для тех, у кого была сохранена старая.
  if (!prefs.deckV) { prefs.cards = 'sil'; prefs.deckV = 2; }
  // Базовая громкость музыки снижена до 10% — и для тех, у кого уже сохранились прежние 20%.
  if (!prefs.musicV) { if (prefs.musicVol === 0.2) prefs.musicVol = 0.1; prefs.musicV = 1; }
  I18N.set(prefs.lang);
  const savePrefs = () => save(PREF_KEY, prefs);
  // Качество графики (Настройки → «Графика»): high — все эффекты; low — для телефонов: без размытия фона,
  // без наклона от гироскопа и постоянных анимаций стола, частиц меньше и в меньшем разрешении.
  // Пока игрок сам не выбрал — на телефонах low, на компьютере high. Старая настройка «Эффекты: экономно» переходит в low.
  if (prefs.fx === 'low' && !prefs.gfx) prefs.gfx = 'low';
  delete prefs.fx;
  const isPhone = () => (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const gfx = () => (prefs.gfx === 'low' || prefs.gfx === 'high' ? prefs.gfx : isPhone() ? 'low' : 'high');
  function applyGfx() {
    const low = gfx() === 'low';
    document.body.classList.toggle('gfx-low', low);
    FX.setQuality(low ? 0.4 : 1);
    if (FX.setDprCap) FX.setDprCap(low ? 1.25 : 2);
  }
  function gfxSeg(extra = '') {
    return `<div class="seg seg-sm gfx-seg ${extra}">${[['high', 'Высокая'], ['low', 'Низкая']].map(([k, n]) => `<button data-act="gfx" data-g="${k}" class="${gfx() === k ? 'on' : ''}">${T(n)}</button>`).join('')}</div>`;
  }
  function applyPrefs() { SFX.setMuted(!prefs.sound); applyGfx(); Music.setVolume(prefs.musicVol); Music.setOn(prefs.music); }

  // ---------- музыка: какой трек нужен на текущем экране ----------
  // Меню — «menu»; поиск рейтинговой игры и рейтинговое лобби — «ranked»; за столом тихо; своя победа — «victory».
  function musicWanted() {
    const v = S.view;
    if (S.screen === 'game') return S.victory && v && v.phase === 'gameOver' ? 'victory' : null;
    if (MMS.ticket && MMS.mode === 'ranked') return 'ranked';
    if (S.screen === 'lobby' && v) return v.kind === 'ranked' || v.calib ? 'ranked' : 'menu';
    if (S.screen === 'home') return 'menu';
    return Music.current; // «подключаюсь…» — не прерываем то, что играет
  }
  setInterval(() => {
    if (S.victory && !(S.screen === 'game' && S.view && S.view.phase === 'gameOver')) S.victory = false;
    Music.play(musicWanted());
  }, 400);
  // Регулятор музыки: выключатель и громкость (в меню за столом и в окне «Звук» на главном экране и в лобби).
  function musicCtlHtml() {
    const pct = Math.round(prefs.musicVol * 100);
    return `<div class="music-ctl">
      <label class="switch ${prefs.music ? 'on' : ''}" data-act="music"><i></i><span>${T('Музыка')}</span></label>
      <input type="range" class="vol-range" id="music-vol" min="0" max="100" step="5" value="${pct}" ${prefs.music ? '' : 'disabled'} aria-label="${T('Громкость музыки')}" style="--p:${pct}%">
      <b class="vol-val" id="music-vol-val">${prefs.music ? pct + '%' : T('выкл.')}</b>
    </div>`;
  }
  function syncMusicCtl() {
    const box = $('#overlay .music-ctl');
    if (box) box.outerHTML = musicCtlHtml();
  }
  function showSoundSettings() {
    showModal(`<h2 class="gold-text">${T('Звук')}</h2><div class="menu-list">
      ${musicCtlHtml()}
      <button class="btn-ghost" data-act="sound">${T('Звуки игры: {v}', { v: T(prefs.sound ? 'включены' : 'выключены') })}</button>
    </div><div class="actions"><button class="btn-gold" data-act="close">${T('Готово')}</button></div>`, 'sound-modal');
  }

  // ---------- сеть ----------
  // Адрес сервера: если клиент открыт с самого сервера (или локально) — тот же адрес;
  // если со статического хостинга (он не засыпает) — запросы идут на сервер Render.
  const API_HOST = 'https://pousham.onrender.com';
  const API = (() => {
    try { const o = new URLSearchParams(location.search).get('api') || localStorage.getItem('vtochku-api'); if (o) return o.replace(/\/$/, ''); } catch {}
    const h = location.hostname;
    if (h === 'pousham.onrender.com' || h === 'localhost' || h === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.local') || location.protocol === 'file:') return '';
    return API_HOST;
  })();
  // Сервер на бесплатном Render засыпает: пока он просыпается, показываем свой экран загрузки (и можно пройти обучение).
  // t0/tries/last — для диагностики на экране загрузки: когда начали ждать, сколько было попыток и чем кончилась последняя.
  const Server = { ok: false, listeners: [], t0: Date.now(), tries: 0, last: '' };
  Server.ready = new Promise(res => { Server.resolve = res; });
  Server.wake = async function () {
    Server.t0 = Date.now();
    for (;;) {
      Server.tries++;
      let t = 0;
      try {
        const ctl = new AbortController(); t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(API + '/health?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
        const j = r.ok ? await r.json().catch(() => null) : null;
        clearTimeout(t);
        if (j && j.ok) break;
        Server.last = r.ok ? 'not-json' : 'http ' + r.status;
      } catch (e) { clearTimeout(t); Server.last = e && e.name === 'AbortError' ? 'timeout' : 'network'; }
      await wait(1500);
    }
    Server.ok = true; Server.last = 'ok'; Server.resolve();
  };
  async function api(path, body) {
    await Server.ready; // сервер просыпается — запрос подождёт
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(I18N.trServer(j.error) || T('Ошибка соединения'));
    return j;
  }
  // ---------- аккаунт Google и рейтинг ----------
  const AUTH_KEY = 'vtochku-auth';
  // Client ID входа через Google (тот же, что на сервере) — чтобы кнопка входа была видна, даже пока сервер просыпается.
  const GOOGLE_CLIENT_ID = '626516411258-ii9eiq7dni57082mmiil8mhbdma9p8qr.apps.googleusercontent.com';
  const Auth = {
    session: load(AUTH_KEY).session || null,
    me: null, cfg: null, gisInit: false,
    async init() {
      await Server.ready;
      try { this.cfg = await fetch(API + '/api/config').then(r => r.json()); } catch {}
      if (this.session) {
        try {
          const r = await fetch(API + '/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: this.session }) });
          if (r.ok) { const j = await r.json(); if (j.me) { this.me = j.me; save(AUTH_KEY, { tutorial: !!j.me.tutorial }); } else this.forget(); }
        } catch {}
      }
      renderAcct();
      if (tutorialDone()) closeWelcome();
    },
    forget() { this.session = null; this.me = null; save(AUTH_KEY, { session: null, tutorial: false }); },
    // Скрипт Google грузится асинхронно — ждём, пока появится.
    whenGis(cb, tries = 0) {
      if (window.google && google.accounts && google.accounts.id) return cb();
      if (tries < 60) setTimeout(() => this.whenGis(cb, tries + 1), 250);
    },
    renderButton(el) {
      if (!el) return;
      const clientId = (this.cfg && this.cfg.googleClientId) || GOOGLE_CLIENT_ID;
      if (!clientId) return;
      this.whenGis(() => {
        if (!this.gisInit) {
          google.accounts.id.initialize({ client_id: clientId, callback: resp => this.onCredential(resp), auto_select: false, ux_mode: 'popup' });
          this.gisInit = true;
        }
        if (!el.isConnected) return;
        el.innerHTML = '';
        google.accounts.id.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'medium', shape: 'pill', text: 'signin_with', locale: I18N.lang });
      });
    },
    async onCredential(resp) {
      const nameEl = $('#pf-name');
      try {
        const j = await api('/api/auth/google', { credential: resp.credential, nick: nameEl ? nameEl.value.trim() : '' });
        this.session = j.session; this.me = j.me;
        save(AUTH_KEY, { session: j.session, tutorial: !!j.me.tutorial });
        if (nameEl && !nameEl.value.trim()) nameEl.value = j.me.nick;
        if (S.tutPending) markTutorialDone();
        renderAcct();
        if (tutorialDone() && $('#welcome.on') && !S.local) { closeWelcome(); toast(T('Обучение уже пройдено на этом аккаунте')); }
        toast(T('Вы вошли: {n} · рейтинг {r}', { n: j.me.nick, r: j.me.rating }));
      } catch (e) { toast(e.message); }
    },
    logout() {
      const s = this.session;
      this.forget();
      if (s) api('/api/logout', { session: s }).catch(() => {});
      try { google.accounts.id.disableAutoSelect(); } catch {}
      renderAcct();
    },
  };
  // Элемент текущего экрана (во время смены экрана старый ещё в DOM — не путаем их).
  const cur = sel => (screenEl().querySelector('.screen:not(.leave)') || document).querySelector(sel);
  // Аватар: фото из Google (если есть) поверх буквы, золотой ободок остаётся.
  const avaPicHtml = pic => (pic ? `<img class="ava-pic" src="${esc(pic)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '');
  function setAvaPic(ava, pic) {
    let img = ava.querySelector('.ava-pic');
    if (!pic) { if (img) img.remove(); return; }
    if (img && img.getAttribute('src') === pic) return;
    if (img) img.remove();
    ava.insertAdjacentHTML('beforeend', avaPicHtml(pic));
  }
  // Номер игрока в игре: #00042.
  const pidTag = id => (id ? `<span class="pid">#${String(id).padStart(5, '0')}</span>` : '');
  const starSvg = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor"/></svg>';
  const rtTag = r => `<span class="rt">${starSvg}${r}</span>`;
  // Плашка аккаунта на главном экране: кнопка Google или «аватар · имя · рейтинг».
  function renderAcct() {
    renderWelcomeAcct();
    renderPlayerPlate();
    renderRankedPane();
    if ($('#overlay').dataset.kind === 'profile' && Auth.me) closeModal();
  }
  function gamesWord(n) {
    return I18N.lang === 'en' ? `${n} game${n === 1 ? '' : 's'}` : `${n} ${plural(n, 'партия', 'партии', 'партий')}`;
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  }
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

  // Таблица лидеров.
  async function showBoard() {
    showModal(`<h2 class="gold-text">${T('Таблица лидеров')}</h2><div id="board" class="board"><div class="loader" style="width:26px;height:26px;margin:18px auto;border-width:2px"></div></div>
      <div class="actions"><button class="btn-gold" data-act="close">${T('Закрыть')}</button></div>`, 'board-modal');
    let j;
    try { j = await api('/api/leaderboard', { session: Auth.session }); }
    catch (e) { const b = $('#board'); if (b) b.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const b = $('#board');
    if (!b) return;
    const me = j.me;
    if (me && Auth.me) Object.assign(Auth.me, me);
    const row = (p, isMe) => `<tr class="${isMe ? 'me' : ''} ${p.rank <= 3 ? 'top' + p.rank : ''}"><td class="rk">${p.rank}</td><td class="pn"><div class="pn-in"><div class="ava bd-ava"><span class="ini">${esc(initial(p.nick))}</span>${avaPicHtml(p.picture)}</div>
        <div class="pn-txt"><b>${esc(p.nick)}${isMe ? ` <span class="hint">${T('(вы)')}</span>` : ''}</b>${pidTag(p.id)}</div></div></td>
      <td class="rv">${rtTag(p.rating)}</td><td>${p.games}</td><td>${p.wins}</td></tr>`;
    const inTop = me && j.top.some(p => p.id === me.id);
    let html = j.top.length
      ? `<table class="board-t"><tr><th>#</th><th>${T('Игрок')}</th><th>${T('Рейтинг')}</th><th>${T('Партий')}</th><th>${T('Побед')}</th></tr>${j.top.map(p => row(p, me && p.id === me.id)).join('')}
         ${me && me.rank && !inTop ? `<tr class="gap"><td colspan="5">…</td></tr>${row(me, true)}` : ''}</table>`
      : `<p class="hint" style="text-align:center">${T('Пока никто не сыграл {n} рейтинговых партий — станьте первым!', { n: j.minGames })}</p>`;
    if (!me) html += `<p class="hint board-note">${T('Войдите через Google на главном экране, чтобы играть на рейтинг.')}</p>`;
    else if (!me.rank) html += `<p class="hint board-note">${T('Ваш рейтинг {r}. В таблицу вы попадёте после {n} партий — сыграно {g}.', { r: me.rating, n: j.minGames, g: me.games })}</p>`;
    html += `<p class="hint board-note">${T('Рейтинг меняется в партиях, где за столом минимум двое вошедших через Google. Старт — 1000.')}</p>`;
    b.innerHTML = html;
  }

  // Изменение рейтинга в окне конца партии (приходит с сервера чуть позже самого конца).
  function renderOverRating(v) {
    const box = $('#over-rating');
    if (!box) return;
    const r = v.rating;
    const key = r ? r.status : 'none';
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    if (!r) { box.innerHTML = ''; return; }
    if (r.status === 'pending') { box.innerHTML = `<div class="hint">${T('Считаем рейтинг…')}</div>`; return; }
    if (r.status !== 'done') { box.innerHTML = `<div class="hint">${esc(I18N.trServer(r.reason || ''))}</div>`; return; }
    const mine = r.changes[v.you];
    const others = Object.keys(r.changes).map(Number).filter(p => p !== v.you)
      .map(p => { const c = r.changes[p]; return `<span class="ro"><b style="color:${nameColor(p)}">${esc(v.names[p])}</b>${pidTag(v.seats[p] && v.seats[p].uid)} ${c.after} <i class="${c.delta >= 0 ? 'pos' : 'neg'}">${signed(c.delta)}</i></span>`; }).join('');
    box.innerHTML = (mine
      ? `<div class="rt-me ${mine.delta > 0 ? 'up' : mine.delta < 0 ? 'down' : ''}"><span class="lbl">${T('Ваш рейтинг')}</span>${starSvg}<span class="rt-val" id="rt-val">${mine.before}</span><span class="rt-delta" id="rt-delta">${signed(mine.delta)}</span></div>`
      : `<div class="hint">${T('Вы играли без аккаунта — рейтинг не меняется.')}</div>`) + (others ? `<div class="rt-others">${others}</div>` : '');
    if (mine) {
      const val = $('#rt-val'), d = $('#rt-delta');
      setTimeout(() => { countUp(val, mine.before, mine.after, 1300); d.classList.add('on'); SFX.chip(); }, 350);
      if (Auth.me) { Auth.me.rating = mine.after; Auth.me.games++; }
    }
  }

  // Язык браузера и часовой пояс — сервер подбирает по ним набор имён ботов (RU/EN/ZH/KZ/IN).
  const geo = () => { let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {} return { blang: navigator.language || '', tz }; };
  // Последняя партия — отдельно от текущей сессии: по ней на главном экране кнопка «Вернуться в игру».
  const LAST_KEY = 'vtochku-last';
  function connect(room, token) {
    S.room = room; S.token = token; S.err = ''; S.connecting = true;
    save(STORE_KEY, { room, token });
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ room, token, at: Date.now() })); } catch {}
    if (S.es) S.es.close();
    const es = new EventSource(`${API}/api/events?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);
    es.onmessage = e => { S.connecting = false; const v = JSON.parse(e.data); v._at = Date.now();
      if (v.phase === 'gameOver') { try { localStorage.removeItem(LAST_KEY); } catch {} } if (v.stage === 'game' && Game.el) Game.updatePause(v); enqueue(v); };
    es.addEventListener('rtc', e => { try { const m = JSON.parse(e.data); Voice.onSignal(m.from, m.data); } catch {} });
    es.addEventListener('kicked', e => {
      let reason = T('Вас убрали со стола.');
      try { reason = I18N.trServer(JSON.parse(e.data).reason) || reason; } catch {}
      try { localStorage.removeItem(LAST_KEY); } catch {}
      es.close(); leave(reason);
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        const code = S.room;
        leave(T('Не удалось вернуться за стол автоматически. Введите код комнаты и то же имя, под которым играли. Если сервер перезапускался, комната могла пропасть — тогда создайте новую.'));
        S.prefillCode = code || '';
        showHome();
      }
    };
    S.es = es;
    history.replaceState(null, '', '?room=' + room);
    if (!S.view) showConnecting();
  }
  function leave(msg) {
    if (S.local) { S.local.destroy(); S.local = null; }
    if (S.es) S.es.close();
    S.es = null; S.view = null; S.room = null; S.token = null; S.connecting = false;
    Q.length = 0;
    save(STORE_KEY, { room: null, token: null });
    history.replaceState(null, '', '/');
    closeModal();
    if (Game.el) Game.destroy();
    Voice.stopAll();
    Social.lastSeq = null; Social.toggleChat(false); Social.closeAvatarMenu(); Social.setDm(null); bannerClear();
    $('#emo-pick').classList.remove('on');
    $('#dock').classList.remove('on');
    S.err = msg || '';
    if (Server.ok) showHome(); else showWaking();
  }
  async function act(body) {
    if (S.local) { try { S.local.action(body); } catch (e) { toast(e.message); } return; }
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
    if (v.remount) {
      if (!S.view || S.view.stage !== 'game' || !Game.el) return;
      Game.destroy(); S.screen = null; showGameScreen();
      await Game.update(S.view, true);
      return;
    }
    S.view = v;
    try { Social.update(v); } catch (e) { console.error(e); }
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
  const logoHtml = (size = '') => `<div class="logo-row"><span class="logo-hood"><img src="/img/logo.webp?v=1" alt="" draggable="false"><i class="eye l"></i><i class="eye r"></i></span><h1 class="logo gold-text" ${size}>${T('В Точку')}</h1></div>`;

  function showConnecting() {
    setScreen('connecting', `<div class="connecting"><div style="text-align:center"><div class="loader"></div>${logoHtml('style="font-size:34px"')}
      <div class="hint">${T('Подключаюсь к столу {c}… Если сервер спал, это может занять до минуты.', { c: esc(S.room || '') })}</div></div></div>`);
  }

  function miniCard(id, i, n) {
    const c = Cards.parse(id);
    const a = (i - (n - 1) / 2) * 13;
    return `<div class="card hc" style="--cw:min(calc(var(--VH) * 27), calc(var(--VW) * 12.5));--ch:calc(var(--cw) * 1.4);transform-origin:50% 115%;transform:translate(-50%,-55%) rotate(${a}deg) translateZ(${i * 8}px);animation:fanIn .9s ${0.15 + i * 0.1}s cubic-bezier(.2,.9,.3,1.2) both">
      <div class="aura" style="opacity:.5;background:radial-gradient(closest-side,rgba(232,196,106,.35),transparent)"></div>
      <div class="ci"><div class="face front" style="background-image:${Cards.url(c)}"></div></div></div>`;
  }

  // Главный экран (по макету): слева логотип, «Spot On» и веер карт; справа — плашка игрока сверху,
  // три раздела (Рейтинговая / Обычная / Создание лобби) и ряд «Настройки · Правила · Полный экран».
  // Раздел раскрывается: его кнопка уезжает наверх, ниже открывается содержимое; повторный клик или клик по пустому месту — закрыть.
  const brandHtml = () => `<div class="h-brand"><span class="logo-hood big"><img src="/img/logo.webp?v=1" alt="" draggable="false"><i class="eye l"></i><i class="eye r"></i></span><h1 class="brand-name gold-text">Spot On</h1></div>`;
  const SECS = [['ranked', 'Рейтинговая игра'], ['casual', 'Обычная игра'], ['create', 'Создание лобби'], ['settings', 'Настройки']];
  function showHome() {
    const roomParam = (new URLSearchParams(location.search).get('room') || S.prefillCode || '').toUpperCase();
    if (roomParam) { S.prefillCode = roomParam; S.homeSec = 'casual'; }
    const fan = ['Т♠', 'К♥', '7♠', 'Д♦', 'Т♥'];
    const head = (k, n) => `<button class="h-btn" data-act="sec" data-sec="${k}"><span>${k === 'settings' ? '⚙ ' : ''}${T(n)}</span><i class="h-chev">›</i></button>`;
    const el = setScreen('home', `
      <div class="home2">
        <div class="h-left">
          ${brandHtml()}
          <div class="home-fan"><div class="home-fan-inner">${fan.map((id, i) => miniCard(id, i, fan.length)).join('')}</div></div>
          <button class="w-btn glass" data-act="world" title="${T('Мировой чат')}">🌍<span>${T('Мировой чат')}</span><i class="w-badge" id="w-badge"></i></button>
          <div class="w-panel glass" id="w-panel"></div>
        </div>
        <div class="h-right" id="h-right" data-open="">
          <button class="h-player glass" id="h-player" data-act="profile"></button>
          <div class="h-searchbar" id="h-searchbar"></div>
          <div class="h-searchbar h-rejoin" id="h-rejoin"></div>
          <div class="h-stack">
            <section class="h-sec" data-sec="ranked">${head('ranked', 'Рейтинговая игра')}<div class="h-body glass" id="sec-ranked"></div></section>
            <section class="h-sec" data-sec="casual">${head('casual', 'Обычная игра')}<div class="h-body glass">
              <div class="row"><span class="opt-label">${T('Количество игроков')}</span></div>
              <div class="seg seg-full" id="seg-casual">${[2, 3, 4, 5, 6, 0].map(n => `<button data-act="casualSize" data-n="${n}">${n || T('Любое')}</button>`).join('')}</div>
              <div class="h-row2"><button class="btn-ghost" data-act="roomsList">☰ ${T('Список лобби')}</button>
                <div class="code-row"><input id="code" maxlength="4" value="${esc(roomParam)}" placeholder="${T('Код')}" autocapitalize="characters" title="${T('Код комнаты')}"><button class="btn-ghost" data-act="join">${T('Войти')}</button></div></div>
              <div class="h-desc">${T('Без рейтинга. Подберём живых игроков на стол выбранного размера; если за 45 с не набрались — свободные места займут боты. Правила стола — классические.')}</div>
              <div class="h-go" data-go="casual"></div>
              <button class="btn-ghost h-bots" data-act="botsNow">🤖 ${T('Играть с ботами')}</button>
            </div></section>
            <section class="h-sec" data-sec="create">${head('create', 'Создание лобби')}<div class="h-body glass">
              <div class="row"><span class="opt-label">${T('Игроков')}</span><div class="seg" id="seg-players">${[2, 3, 4, 5, 6].map(n => `<button data-act="players" data-n="${n}">${n}</button>`).join('')}</div></div>
              <div class="row"><span class="opt-label">${T('Раундов')}</span><div class="stepper"><button data-act="rounds" data-d="-1">−</button><b id="rounds-val"></b><button data-act="rounds" data-d="1">+</button></div></div>
              <div class="row"><span class="opt-label">${T('Таймер')}</span><div class="stepper"><button data-act="timer" data-d="-5">−</button><input class="num-input" id="timer-val" inputmode="numeric" maxlength="3"><button data-act="timer" data-d="5">+</button></div><span class="hint" id="timer-hint"></span></div>
              <label class="switch" data-act="bluff" id="bluff-sw"><i></i><span>${T('Режим обмана')}</span></label>
              <label class="switch" data-act="skills" id="skills-sw" title="${T('«Пересдача» — раз за партию')}"><i></i><span>${T('Умения')}</span></label>
              <label class="switch" data-act="test" id="test-sw" title="${T('17 раундов: 10-й — «Бескозырка», 15-й — «Тёмная»')}"><i></i><span>${T('Тестовый режим')}</span></label>
              <label class="switch" data-act="listed" id="listed-sw" title="${T('только по коду, в лобби не видна')}"><i></i><span>${T('Приватная')}</span></label>
              <button class="btn-gold h-big" data-act="create">${T('Создать')}</button>
            </div></section>
            <section class="h-sec" data-sec="settings">${head('settings', 'Настройки')}<div class="h-body glass" id="sec-settings"></div></section>
          </div>
          <div class="err" id="err">${esc(S.err)}</div>
          <div class="h-foot">
            <button class="btn-ghost" data-act="sec" data-sec="settings" data-from-foot="1">⚙ ${T('Настройки')}</button>
            <button class="btn-ghost" data-act="rules">${T('Правила')}</button>
            <button class="btn-ghost" data-act="fullscreen" id="fs-btn"></button>
          </div>
        </div>
      </div>`);
    if (!document.getElementById('fanKF')) {
      const st = document.createElement('style'); st.id = 'fanKF';
      st.textContent = '@keyframes fanIn{from{opacity:0;transform:translate(-50%,40%) rotate(0deg) scale(.6)}}';
      document.head.appendChild(st);
    }
    const tv = $('#timer-val', el);
    if (tv) tv.addEventListener('change', () => { S.turnTime = clampTimer(parseInt(tv.value, 10)); syncHome(); });
    const R = $('#h-right', el);
    if (S.homeSec) { R.dataset.open = S.homeSec; R.querySelector(`.h-sec[data-sec="${S.homeSec}"]`).classList.add('open'); }
    syncHome(el);
    renderAcct();
    renderSettingsSec();
    renderGo();
    syncFsBtn();
    checkRejoin();
    World.mount();
    if (roomParam) setTimeout(() => toast(T('Код стола подставлен — нажмите «Войти»')), 400);
  }

  // Раскрыть/свернуть раздел с анимацией: заголовок плавно переезжает (FLIP), остальное гаснет/появляется.
  function openSec(name) {
    const R = cur('#h-right');
    if (!R || R.dataset.busy) return;
    const prev = R.dataset.open || '';
    const next = prev === name ? '' : name;
    if (prev === next) return;
    R.dataset.busy = '1';
    const fromFoot = R.querySelector(`.h-foot [data-sec="settings"]`);
    const heads = [...R.querySelectorAll('.h-sec')];
    const before = new Map(heads.map(sec => [sec, VIEW.rect(sec.querySelector('.h-btn'))]));
    // «Настройки» в списке скрыты — стартуем от кнопки в нижнем ряду.
    if (fromFoot) before.set(R.querySelector('.h-sec[data-sec="settings"]'), VIEW.rect(fromFoot));
    const vis = sec => sec.offsetParent !== null;
    const wasVisible = new Set(heads.filter(vis));
    const outs = [...R.querySelectorAll('.h-sec, .h-foot')].filter(x => vis(x) && !(x.classList.contains('h-sec') && x.dataset.sec === next));
    const fadeOut = outs.map(x => x.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(18px)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' }));
    const openBody = prev && R.querySelector(`.h-sec[data-sec="${prev}"] .h-body`);
    if (openBody) fadeOut.push(openBody.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 150, fill: 'forwards' }));
    Promise.all(fadeOut.map(a => a.finished.catch(() => {}))).then(() => {
      fadeOut.forEach(a => a.cancel());
      R.dataset.open = next; S.homeSec = next;
      heads.forEach(sec => sec.classList.toggle('open', sec.dataset.sec === next));
      if (next === 'settings') renderSettingsSec();
      renderGo();
      // FLIP: заголовок открытого/закрываемого раздела едет из старого места в новое.
      const mover = R.querySelector(`.h-sec[data-sec="${next || prev}"]`);
      const ease = 'cubic-bezier(.25,.9,.3,1.05)';
      heads.filter(vis).forEach((sec, i) => {
        const btn = sec.querySelector('.h-btn'), b0 = before.get(sec), b1 = VIEW.rect(btn);
        if (sec === mover && b0 && b0.width) {
          btn.animate([{ transform: `translate(${b0.left - b1.left}px, ${b0.top - b1.top}px)` }, { transform: 'none' }], { duration: 380, easing: ease });
        } else if (!wasVisible.has(sec) || !next) {
          sec.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 60 + i * 50, easing: 'ease-out', fill: 'backwards' });
        }
      });
      if (next) {
        const body = mover.querySelector('.h-body');
        body.animate([{ opacity: 0, transform: 'translateY(-14px) scaleY(.92)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 140, easing: ease, fill: 'backwards' });
      } else {
        const foot = R.querySelector('.h-foot');
        foot.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 200, easing: 'ease-out', fill: 'backwards' });
      }
      setTimeout(() => { delete R.dataset.busy; }, 400);
    });
  }

  // Раздел «Рейтинговая игра»: лидеры, текущий рейтинг, описание и большая кнопка.
  function renderRankedPane() {
    const box = cur('#sec-ranked');
    if (!box) return;
    const me = Auth.me;
    const left = me ? Math.max(0, 5 - me.games) : 0;
    box.innerHTML = `<button class="btn-ghost" data-act="board">🏆 ${T('Таблица лидеров')}</button>
      <div class="h-rating"><span class="h-rl">${T('Текущий рейтинг')}</span>${me ? `<b class="h-rv">#${me.rating}</b><span class="hint">${left ? T('калибровка {a}/5', { a: me.games }) : gamesWord(me.games)}</span>` : `<b class="h-rv dim">—</b><span class="hint">${T('нужен вход через Google')}</span>`}</div>
      <div class="h-desc">${T('Стол на 4 игрока, 17 раундов, режим обмана. Подбираем соперников близкого рейтинга; если за минуту четверо не набрались — садимся втроём, четвёртое место займёт бот. Рейтинг меняется только между людьми.')}${left ? ' ' + T('Первые 5 партий — калибровка: после них вы попадёте в таблицу лидеров.') : ''}</div>
      <div class="h-go" data-go="ranked"></div>`;
    renderGo();
  }

  // Большая кнопка раздела: «Поиск игры» / «Калибровка N/5» / «Войдите в аккаунт», а во время поиска — статус и «Отменить».
  function renderGo() {
    const R = cur('#h-right');
    if (R) R.classList.toggle('search-on', !!MMS.ticket);
    renderSearchBar();
    document.querySelectorAll('.h-go').forEach(box => {
      const mode = box.dataset.go;
      if (MMS.ticket && MMS.mode === mode) {
        if (box.querySelector('.h-search')) return;
        box.innerHTML = `<div class="h-search"><div class="search-ring"><div class="loader"></div><b id="mm-time">0:00</b></div>
          <div class="h-search-info"><b>${T(mode === 'ranked' ? 'Ищем соперников…' : 'Ищем игроков…')}</b><div id="mm-line1" class="hint"></div><div id="mm-line2" class="hint"></div></div>
          <button class="btn-ghost" data-act="cancelSearch">${T('Отменить')}</button></div>`;
        return;
      }
      const me = Auth.me;
      if (mode === 'ranked' && !me) box.innerHTML = `<button class="btn-gold h-big" data-act="profile">${T('Войдите в аккаунт')}</button>`;
      else if (mode === 'ranked' && me.games < 5) box.innerHTML = `<button class="btn-gold h-big" data-act="search" data-mode="ranked">${T('Калибровка {a}/5', { a: me.games })}</button>`;
      else box.innerHTML = `<button class="btn-gold h-big" data-act="search" data-mode="${mode}">${T('Поиск игры')}</button>`;
    });
  }

  // Поиск идёт, а его раздел свёрнут (или открыт другой) — полоска со статусом под плашкой игрока.
  function renderSearchBar() {
    const bar = cur('#h-searchbar'), R = cur('#h-right');
    if (!bar || !R) return;
    const show = !!MMS.ticket && R.dataset.open !== MMS.mode;
    bar.classList.toggle('on', show);
    if (!show) { bar.innerHTML = ''; return; }
    if (bar.dataset.mode === MMS.mode && bar.innerHTML) return;
    bar.dataset.mode = MMS.mode;
    bar.innerHTML = `<button class="hsb-main" data-act="sec" data-sec="${MMS.mode}"><span class="hsb-dot"></span><span class="hsb-t">${T(MMS.mode === 'ranked' ? 'Поиск рейтинговой игры' : 'Поиск обычной игры')}</span><b id="mm-time2">${mmClock()}</b></button>
      <button class="btn-ghost hsb-x" data-act="cancelSearch" title="${T('Отменить')}">✕</button>`;
  }
  const mmClock = () => { const s = Math.floor((Date.now() - MMS.started) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // «Вернуться в игру»: если последняя партия ещё идёт и место за нами — полоска под плашкой игрока.
  async function checkRejoin() {
    let last = null;
    try { last = JSON.parse(localStorage.getItem(LAST_KEY)); } catch {}
    const bar = cur('#h-rejoin');
    if (!bar) return;
    if (!last || !last.room || !last.token || Date.now() - (last.at || 0) > 6 * 3600e3) { bar.classList.remove('on'); return; }
    let j;
    try { j = await fetch(`${API}/api/alive?room=${encodeURIComponent(last.room)}&token=${encodeURIComponent(last.token)}`).then(r => r.json()); } catch { return; }
    if (!bar.isConnected) return;
    if (!j.ok) { try { localStorage.removeItem(LAST_KEY); } catch {} bar.classList.remove('on'); return; }
    bar.innerHTML = `<button class="hsb-main" data-act="rejoin"><span class="hsb-dot go">▶</span><span class="hsb-t">${T('Вернуться в игру')} · ${esc(j.room)}</span><b>${T('раунд {a}/{b}', { a: j.round, b: j.rounds })}</b></button>
      <button class="btn-ghost hsb-x" data-act="rejoinForget" title="${T('Скрыть')}">✕</button>`;
    bar.classList.add('on');
  }

  // Пока идёт поиск — ни второго поиска, ни входа в лобби вручную.
  function searchLock() {
    if (!MMS.ticket) return false;
    toast(T('Идёт поиск игры — сначала отмените его'));
    const bar = cur('#h-searchbar.on') || cur('.h-search');
    if (bar) nope(bar);
    return true;
  }

  // Раздел «Настройки»: звук, музыка, язык, установка, персонализация (новые настройки — сюда же).
  function renderSettingsSec() {
    const box = cur('#sec-settings');
    if (!box) return;
    box.innerHTML = `<label class="switch ${prefs.sound ? 'on' : ''}" data-act="sound"><i></i><span>${T('Звуки игры')}</span></label>
      ${musicCtlHtml()}
      <div class="row"><span class="opt-label">${T('Язык')}</span>${langSeg()}</div>
      <div class="row"><span class="opt-label">${T('Графика')}</span>${gfxSeg()}</div>
      <button class="btn-ghost" data-act="install">⤓ ${T('Установить приложение')}</button>
      <button class="btn-ghost cust-btn" data-act="customize">✦ ${T('Персонализация')}</button>`;
  }
  function syncFsBtn() {
    const b = cur('#fs-btn');
    if (b) b.innerHTML = document.fullscreenElement ? `⤡ ${T('Окно')}` : `⛶ ${T('Полный экран')}`;
  }
  document.addEventListener('fullscreenchange', () => syncFsBtn());

  // Плашка игрока: аватар, имя, #рейтинг; гость — «Гость · войти».
  function renderPlayerPlate() {
    const box = cur('#h-player');
    if (!box) return;
    const me = Auth.me, nm = load(STORE_KEY).name;
    box.innerHTML = me
      ? `<div class="ava acct-ava"><span class="ini">${esc(initial(me.nick))}</span>${avaPicHtml(me.picture)}</div><div class="hp-who"><b>${esc(me.nick)}</b><span class="hp-rt">#${me.rating}</span></div>`
      : `<div class="ava acct-ava guest"><span class="ini">${esc(nm ? initial(nm) : '?')}</span></div><div class="hp-who">${nm ? `<b>${esc(nm)}</b><span class="hp-in">${T('Гость · войти')}</span>` : `<b class="hp-in big">${T('Гость · войти')}</b>`}</div>`;
  }

  // Окно игрока: гость вводит имя и может войти через Google; вошедший видит профиль и выход из аккаунта.
  function showProfile(msg) {
    const me = Auth.me, nm = load(STORE_KEY).name || '';
    if (me) {
      showModal(`<h2 class="gold-text">${T('Игрок')}</h2>
        <div class="pf-me"><div class="ava acct-ava pf-ava"><span class="ini">${esc(initial(me.nick))}</span>${avaPicHtml(me.picture)}</div>
          <div class="pf-who"><b>${esc(me.nick)}</b>${pidTag(me.id)}<span>${T('Рейтинг')}: <b class="gold-text">${me.rating}</b> · ${gamesWord(me.games)}</span></div></div>
        <div class="actions"><button class="btn-ghost" data-act="logout">${T('Выйти из аккаунта')}</button><button class="btn-ghost" data-act="board">${T('Таблица лидеров')}</button><button class="btn-gold" data-act="close">${T('Готово')}</button></div>`, 'profile-modal');
      return;
    }
    showModal(`<h2 class="gold-text">${T('Вход')}</h2>
      <label class="field">${T('Ваше имя')}<input id="pf-name" maxlength="20" autocomplete="nickname" value="${esc(nm)}" placeholder="${T('Как вас зовут?')}"></label>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
      <div class="pf-or"><span>${T('или')}</span></div>
      <div class="gbtn" id="gbtn-pf"></div>
      <span class="hint">${T('С аккаунтом Google сохраняются рейтинг и прохождение обучения, и можно играть в рейтинговой игре.')}</span>
      <div class="actions"><button class="btn-gold" data-act="profileSave">${T('Готово')}</button></div>`, 'profile-modal');
    $('#overlay').dataset.kind = 'profile';
    Auth.renderButton($('#gbtn-pf'));
    const inp = $('#pf-name');
    if (inp) { setTimeout(() => { if (!nm) inp.focus(); }, 120); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); actions.profileSave(); } }); }
  }
  // Имя для игры: аккаунт → сохранённое имя; нет — попросить в окне игрока.
  function myName() { return (Auth.me && Auth.me.nick) || load(STORE_KEY).name || ''; }
  function needName() {
    const n = myName();
    if (!n) showProfile(T('Введите имя, чтобы играть'));
    return n;
  }

  // Список открытых столов — отдельное окно (обновляется, пока открыто).
  let roomsTimer = 0;
  function showRoomsList() {
    showModal(`<h2 class="gold-text">${T('Открытые столы')}</h2>
      <div class="room-list" id="room-list"><div class="hint">${T('Загружаем…')}</div></div>
      <div class="actions"><span class="hint" id="rooms-count" style="margin-right:auto"></span><button class="btn-gold" data-act="close">${T('Закрыть')}</button></div>`, 'rooms-modal');
    $('#overlay').dataset.kind = 'rooms';
    loadRooms();
  }
  async function loadRooms() {
    clearTimeout(roomsTimer);
    const box = $('#overlay.on #room-list');
    if (!box || $('#overlay').dataset.kind !== 'rooms') return;
    roomsTimer = setTimeout(loadRooms, 4000);
    let list;
    try { list = (await fetch(API + '/api/rooms').then(r => r.json())).rooms || []; } catch { return; }
    if (!box.isConnected) return;
    const cnt = $('#rooms-count'); if (cnt) cnt.textContent = list.length ? T('столов: {n}', { n: list.length }) : '';
    box.innerHTML = list.length ? list.map(r => `<div class="room-row">
        <div class="rr-main"><b>${esc(r.host)}</b><span class="hint">${T('{n} раундов', { n: r.rounds })} · ${r.turnTime ? T('таймер {s} с', { s: r.turnTime }) : T('без таймера')}${r.bluff ? ' · ' + T('обман') : ''}${r.skills ? ' · ' + T('умения') : ''}${r.test ? ' · ' + T('тестовый') : ''}</span></div>
        <span class="rr-seats">${r.players}/${r.size}</span>
        <button class="btn-gold" data-act="joinRoom" data-code="${esc(r.code)}">${T('Сесть')}</button></div>`).join('')
      : `<div class="hint room-empty">${T('Открытых столов пока нет — создайте свой в «Создание лобби» или нажмите «Поиск игры».')}</div>`;
  }

  // ---------- поиск игроков ----------
  const MMS = { ticket: null, mode: null, timer: 0, started: 0, sizes: [] };
  async function startSearch(mode) {
    const name = needName();
    if (!name) return;
    if (mode === 'ranked' && !Auth.me) { showProfile(); return; }
    save(STORE_KEY, { name });
    const size = mode === 'ranked' ? 4 : S.casualSize;
    MMS.sizes = size ? [size] : [];
    try {
      const j = await api('/api/mm/join', { mode, sizes: MMS.sizes, name, session: Auth.session, lang: I18N.lang, ...geo(), prev: MMS.ticket });
      MMS.ticket = j.ticket; MMS.mode = mode; MMS.started = Date.now();
    } catch (e) { toast(e.message); return; }
    renderGo();
    pollSearch();
  }
  async function pollSearch() {
    clearTimeout(MMS.timer);
    if (!MMS.ticket) return;
    const t = $('#mm-time'), t2 = $('#mm-time2');
    if (t) t.textContent = mmClock();
    if (t2) t2.textContent = mmClock();
    let st;
    try { st = await api('/api/mm/status', { ticket: MMS.ticket }); } catch { MMS.timer = setTimeout(pollSearch, 2000); return; }
    if (!MMS.ticket) return; // отменили, пока ждали ответ
    if (st.state === 'matched') {
      MMS.ticket = null;
      renderGo(); SFX.win && SFX.chip();
      toast(T(st.kind === 'ranked' ? 'Соперники найдены!' : 'Игроки найдены!'));
      connect(st.room, st.token);
      return;
    }
    if (st.state === 'gone') { MMS.ticket = null; renderGo(); toast(T('Поиск прервался — попробуйте ещё раз')); return; }
    const l1 = $('#mm-line1'), l2 = $('#mm-line2');
    if (l1) l1.textContent = T('Ищут игру: {n}', { n: st.inQueue });
    if (l2) l2.textContent = MMS.mode === 'ranked'
      ? T('Разброс ±{w}', { w: st.window }) + (st.botsIn > 0 ? ' · ' + T('через {s} с — втроём + бот', { s: Math.ceil(st.botsIn / 1000) }) : ' · ' + T('втроём + бот, как только найдётся третий'))
      : st.botsIn > 0 ? T('Через {s} с сядем с теми, кто есть, + боты', { s: Math.ceil(st.botsIn / 1000) }) : T('Свободные места займут боты');
    MMS.timer = setTimeout(pollSearch, 1500);
  }
  function cancelSearch() {
    clearTimeout(MMS.timer);
    if (MMS.ticket) api('/api/mm/cancel', { ticket: MMS.ticket }).catch(() => {});
    MMS.ticket = null;
    renderGo();
  }
  function clampTimer(t) { return Number.isFinite(t) ? Math.max(0, Math.min(600, t)) : 30; }
  function syncHome(el = screenEl().querySelector('.screen:not(.leave)') || screenEl()) {
    if (!S.roundsTouched) S.rounds = 2 * MAX_CARDS(S.players) - 1;
    if (S.test) S.rounds = 17;
    el.querySelectorAll('#seg-casual button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.casualSize));
    const ls = $('#listed-sw', el); if (ls) ls.classList.toggle('on', !S.listed); // переключатель — «приватная»
    el.querySelectorAll('#seg-players button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.players));
    const rv = $('#rounds-val', el); if (rv) rv.textContent = S.rounds;
    const tv = $('#timer-val', el); if (tv && document.activeElement !== tv) tv.value = S.turnTime;
    const th = $('#timer-hint', el); if (th) th.textContent = S.turnTime ? T('до {m} карт · {s} с на ход', { m: MAX_CARDS(S.players), s: S.turnTime }) : T('до {m} карт · без таймера', { m: MAX_CARDS(S.players) });
    const tv2 = $('#timer-val', el); if (tv2) tv2.title = T('секунд на ход (0 — без таймера)');
    const sw = $('#bluff-sw', el); if (sw) sw.classList.toggle('on', S.bluff);
    const ks = $('#skills-sw', el); if (ks) ks.classList.toggle('on', S.skills);
    const ts = $('#test-sw', el); if (ts) ts.classList.toggle('on', S.test);
    el.querySelectorAll('[data-act="rounds"]').forEach(b => { b.disabled = S.test; });
    el.querySelectorAll('#seg-theme button').forEach(b => b.classList.toggle('on', b.dataset.t === prefs.cards));
  }

  function joinLink(code) { return `${location.origin}/?room=${code}`; }
  function settingsLine(v) {
    return `<div class="settings-line"><span>${T('{n} игроков', { n: v.size })}</span><span>${T('{n} раундов', { n: v.rounds })}</span><span>${v.turnTime ? T('таймер {s} с', { s: v.turnTime }) : T('без таймера')}</span>${v.bluff ? `<span class="bluff">${T('режим обмана')}</span>` : ''}${v.skillsOn ? `<span class="skills">${T('умения')}</span>` : ''}${v.test ? `<span class="skills">${T('тестовый режим')}</span>` : ''}</div>`;
  }
  const matchedKind = v => v.kind === 'ranked' || v.kind === 'casual';
  function lobbyTitle(v) {
    if (v.calib) return T('Калибровка с ботами');
    return T({ ranked: 'Рейтинговый стол', casual: 'Стол подбора', public: 'Открытый стол' }[v.kind] || 'Стол');
  }
  setInterval(() => {
    const el = S.screen === 'lobby' && cur('#auto-left');
    if (el) el.textContent = S.autoAt ? T('через {s} с', { s: Math.max(0, Math.ceil((S.autoAt - Date.now()) / 1000)) }) : '';
  }, 500);
  function showLobby(v) {
    let el = screenEl().querySelector('.screen:not(.leave)');
    if (S.screen !== 'lobby') {
      el = setScreen('lobby', `
        <div class="lobby ${matchedKind(v) ? 'solo' : ''}">
          ${matchedKind(v) ? '' : `<div class="lobby-qr glass">
            <div class="qr-frame">${(() => { try { return window.qrSvg(joinLink(v.code), {}); } catch { return ''; } })()}</div>
            <div class="room-code gold-text">${esc(v.code)}</div>
            <button class="btn-ghost" data-act="copy">${T('Скопировать ссылку')}</button>
            <button class="btn-ghost w-invite" data-act="worldInvite">🌍 ${T('Пригласить в мировой чат')}</button>
          </div>`}
          <div class="lobby-main">
            <div class="lobby-title">${lobbyTitle(v)} <span class="gold-text">${esc(v.code)}</span></div>
            ${settingsLine(v)}
            <div class="lobby-seats" id="lobby-seats"></div>
            <div class="row" id="lobby-actions"></div>
          </div>
        </div>`);
    }
    $('#lobby-seats', el).innerHTML = Array.from({ length: v.size }, (_, i) => {
      const s = v.seats[i];
      if (!s) return `<div class="lseat empty"><div class="ava bot">?</div><div><div class="nm">${T('Свободно')}</div><div class="sub">${T('займёт бот')}</div></div></div>`;
      return `<div class="lseat ${i === v.you ? 'me' : ''}" data-i="${i}">
        <div class="ava ${s.online ? '' : 'off'}"><span class="ini">${esc(initial(s.name))}</span>${avaPicHtml(s.pic)}</div>
        <div style="min-width:0"><div class="nm">${esc(s.name)}${i === v.you ? ` <span class="hint">${T('(вы)')}</span>` : ''}</div><div class="sub">${T(s.host && !matchedKind(v) ? 'хост' : s.online ? 'в сети' : 'не в сети')}</div>${s.rating != null ? `<div class="sub">${rtTag(s.rating)}</div>` : ''}</div>
        ${v.isHost && !s.host && !matchedKind(v) ? `<button class="btn-ghost kick" data-act="kick" data-seat="${i}">${T('Убрать')}</button>` : ''}
      </div>`;
    }).join('');
    S.autoAt = v.autoStartIn ? Date.now() + v.autoStartIn : 0;
    $('#lobby-actions', el).innerHTML = (matchedKind(v)
      ? `<div class="loader" style="width:22px;height:22px;margin:0;border-width:2px"></div><span class="hint">${T('Ждём игроков — игра начнётся сама')} <b id="auto-left"></b></span>`
      : v.isHost
      ? `<button class="btn-gold" data-act="start">${T('Начать игру')}</button><span class="hint">${T('Пустые места займут боты')}</span>`
      : `<div class="loader" style="width:22px;height:22px;margin:0;border-width:2px"></div><span class="hint">${T('Ждём, когда хост начнёт игру…')}</span>`) +
      `<span style="flex:1"></span><button class="btn-ghost fs-btn" data-act="soundcfg" title="${T('Звук')}">♪</button><button class="btn-ghost" data-act="rules">${T('Правила')}</button><button class="btn-ghost" data-act="leave">${T('Выйти')}</button>`;
  }

  function showGameScreen() {
    const el = setScreen('game', `
      <div class="game">
        <div class="scene"><div class="table-wrap" id="table-wrap"></div></div>
        <div class="seats" id="seats"></div>
        <div class="cards" id="cards"></div>
        <div class="checks" id="checks"></div>
        <div class="log-panel ${prefs.log ? '' : 'closed'}" id="log"><div class="log-head" data-act="log"><span>${T('Журнал')}</span><span class="tg">${prefs.log ? '−' : '+'}</span></div><div class="log-body" id="log-body"></div><button class="log-jump" id="log-jump" data-act="log-jump" title="${T('К новым')}">↓</button></div>
        <div class="hud-right">
          <div class="hud-icons">
            <button class="icon-btn pause-btn" data-act="pause" title="${T('Пауза')}">${iconSvg('pause')}<i class="pz-left"></i></button>
            <button class="icon-btn" data-act="fullscreen" title="${T('Во весь экран')}">${iconSvg('full')}</button>
            <button class="icon-btn" data-act="scores" title="${T('Счёт')}">${iconSvg('scores')}</button>
            <button class="icon-btn" data-act="menu" title="${T('Меню')}">${iconSvg('menu')}</button>
          </div>
        </div>
        <div class="round-dock"><div class="status" id="status"></div><div class="round-row"><div class="skills-bar" id="skills-bar"></div><div class="round-box"><b id="hud-round">—</b><span class="s" id="hud-sub"></span><div class="bids-meter" id="bids-meter"></div><div class="tags"><span class="trump-box" id="trump-box"><span>♥</span> ${T('козырь')}</span><span id="hud-mode"></span></div></div></div></div>
        <div class="me-panel" id="me-panel"></div>
        <div class="action" id="action"></div>
        <div id="vote"></div>
        <div id="pause"></div>
      </div>`);
    Game.mount(el);
  }

  // ---------- стол по образцу: кожаный борт с заклёпками, лакированная дорожка, подстаканники, сукно ----------
  function tableSvg(angles) {
    const svg = classicTableSvg(angles);
    const skin = roomSkin();
    if (!skin) return svg;
    // Общий шар хода берём из классического стола, всё остальное — из комнаты.
    return skin.tableBase(angles, SIDE_SPOTS) + svg.slice(svg.indexOf('<defs>\n        <radialGradient id="ballG"'));
  }
  // Стол разбивается на стопку SVG-слоёв с одинаковой разметкой координат (viewBox 1000×600).
  // Неподвижные части с тяжёлыми фильтрами (шум сукна/дерева, размытые тени) браузер рисует один раз и держит готовой картинкой;
  // всё, что мигает или двигается (неон, дуга хода, шар, глаза логотипа), живёт в отдельных лёгких слоях.
  // Раньше любая такая анимация заставляла перерисовывать весь стол со всеми фильтрами в каждом кадре — на телефонах это главные фризы.
  const TABLE_LIVE = ['.neon-glow', '.neon-line', '.neon-arc', '.neon-arc-core', '.ball-trail', '.puck', '.tbl-eyes'];
  function renderTable(tw, angles) {
    tw.innerHTML = tableSvg(angles);
    const src = tw.querySelector('svg.tbl');
    if (!src) return;
    const NS = 'http://www.w3.org/2000/svg';
    const isLive = el => TABLE_LIVE.some(q => el.matches(q));
    const defs = [...src.children].filter(c => c.tagName.toLowerCase() === 'defs').map(d => d.outerHTML).join('');
    const items = []; // { kind: 'static' | 'live' | 'glow', html }
    const push = (kind, html) => {
      const last = items[items.length - 1];
      if (last && last.kind === kind && kind !== 'glow') last.html += html; else items.push({ kind, html });
    };
    for (const ch of [...src.children]) {
      if (ch.tagName.toLowerCase() === 'defs') continue;
      if (isLive(ch)) { push(ch.matches('.neon-glow') ? 'glow' : 'live', ch.outerHTML); continue; }
      const inner = [...ch.querySelectorAll(TABLE_LIVE.join(','))].filter(el => !el.parentElement.closest(TABLE_LIVE.join(',')));
      if (!inner.length) { push('static', ch.outerHTML); continue; }
      // Живой элемент внутри неподвижной группы: выносим его в свой слой, сохранив трансформации родителей.
      const moved = inner.map(el => {
        let html = el.outerHTML;
        for (let a = el.parentElement; a && a !== src; a = a.parentElement) { const t = a.getAttribute('transform'); if (t) html = `<g transform="${t}">${html}</g>`; }
        el.remove();
        return { kind: el.matches('.neon-glow') ? 'glow' : 'live', html };
      });
      push('static', ch.outerHTML);
      for (const m of moved) push(m.kind, m.html);
    }
    // Тень под столом запекаем в нижний слой SVG-фильтром (рисуется один раз). CSS drop-shadow на слое
    // пересчитывался бы в каждом кадре, пока на экране хоть что-то анимируется. Цвет тени — CSS-переменная комнаты.
    const W = tw.offsetWidth || 760, H = tw.offsetHeight || 380;
    const shadow = (getComputedStyle(tw).getPropertyValue('--tbl-shadow') || '').trim() || 'rgba(0, 0, 0, .85)';
    const drop = `<defs><filter id="tblDrop" x="-15%" y="-15%" width="130%" height="150%"><feDropShadow dx="0" dy="${(30 * 600 / H).toFixed(1)}" stdDeviation="${(20 * 1000 / W).toFixed(1)} ${(20 * 600 / H).toFixed(1)}" flood-color="${shadow}"/></filter></defs>`;
    if (items[0] && items[0].kind === 'static') items[0].html = `${drop}<g filter="url(#tblDrop)">${items[0].html}</g>`;
    const layers = items.map((it, i) => {
      const heavy = it.kind === 'static' && /filter="url\(/.test(it.html);
      const cls = ['tbl', 'tbl-' + it.kind, i === 0 ? 'tbl-first' : '', heavy ? 'tbl-heavy' : ''].filter(Boolean).join(' ');
      return `<svg class="${cls}" xmlns="${NS}" viewBox="0 0 1000 600" preserveAspectRatio="none">${defs}${it.html}</svg>`;
    }).join('');
    src.outerHTML = layers;
  }
  function classicTableSvg(angles) {
    const cx = 500, cy = 300;
    const ell = (rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    let studs = '';
    for (let i = 0; i < 132; i++) { const [x, y] = ell(487, 289, (i / 132) * Math.PI * 2); studs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="url(#chrome)"/>`; }
    // Подстаканники — по одному перед каждым игроком.
    let cups = '';
    for (const deg of angles) {
      const [x, y] = ell(408, 226, deg * Math.PI / 180);
      cups += `<g class="cup" data-a="${deg}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><ellipse rx="27" ry="19" fill="url(#chrome)" stroke="#0a0a0c" stroke-width="1.5"/><ellipse rx="20" ry="13" fill="url(#cupIn)"/><ellipse rx="20" ry="13" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/></g>`;
    }
    // Боковина стола: нижняя половина эллипса столешницы, вытянутая вниз на толщину.
    const lowerArc = dy => `M ${cx - 496} ${cy + dy} A 496 296 0 0 0 ${cx + 496} ${cy + dy}`;
    const sideBand = (y0, y1) => `M ${cx - 496} ${cy + y0} A 496 296 0 0 0 ${cx + 496} ${cy + y0} L ${cx + 496} ${cy + y1} A 496 296 0 0 1 ${cx - 496} ${cy + y1} Z`;
    return `<svg class="tbl" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sideG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#030304"/><stop offset=".12" stop-color="#141418"/><stop offset=".38" stop-color="#2c2c33"/><stop offset=".5" stop-color="#3a3a42"/><stop offset=".62" stop-color="#2c2c33"/><stop offset=".88" stop-color="#141418"/><stop offset="1" stop-color="#030304"/></linearGradient>
        <linearGradient id="sideV" x1="0" y1="0" x2="0" y2="1"><stop offset=".78" stop-color="#000" stop-opacity=".75"/><stop offset=".86" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
        <linearGradient id="rimBevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity=".04"/><stop offset=".7" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
        <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".9"/><stop offset=".12" stop-color="#000" stop-opacity=".55"/><stop offset=".3" stop-color="#000" stop-opacity="0"/></linearGradient>
        <filter id="floorBlur" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="softBlur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6"/></filter>
        <radialGradient id="leather" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3a3a40"/><stop offset=".6" stop-color="#1c1c20"/><stop offset="1" stop-color="#0a0a0c"/></radialGradient>
        <linearGradient id="track" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2f"/><stop offset=".25" stop-color="#050507"/><stop offset=".75" stop-color="#0d0d10"/><stop offset="1" stop-color="#202025"/></linearGradient>
        <radialGradient id="felt" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#26304f"/><stop offset=".55" stop-color="#161d33"/><stop offset="1" stop-color="#0a0e1c"/></radialGradient>
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".45" stop-color="#8d939b"/><stop offset=".7" stop-color="#e8ebef"/><stop offset="1" stop-color="#5a5f66"/></linearGradient>
        <radialGradient id="cupIn" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3b3f45"/><stop offset="1" stop-color="#08090b"/></radialGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a6f22"/><stop offset=".4" stop-color="#f4dc94"/><stop offset="1" stop-color="#a87d2a"/></linearGradient>
        <filter id="noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.55  0 0 0 0 0.7  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
        <filter id="neonBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
        <clipPath id="feltClip"><ellipse cx="${cx}" cy="${cy}" rx="372" ry="198"/></clipPath>
      </defs>
      <ellipse cx="${cx}" cy="${cy + 48 + 22}" rx="520" ry="306" fill="#000" opacity=".7" filter="url(#floorBlur)"/>
      <path d="${sideBand(0, 48)}" fill="url(#sideG)"/>
      <path d="${sideBand(0, 48)}" fill="url(#sideV)"/>
      <path d="${lowerArc(25)}" fill="none" stroke="url(#gold)" stroke-width="2.2" stroke-opacity=".75"/>
      <path d="${lowerArc(29)}" fill="none" stroke="#000" stroke-width="1.2" stroke-opacity=".5"/>
      <path d="${lowerArc(48)}" fill="none" stroke="url(#gold)" stroke-width="3" stroke-opacity=".55"/>
      <path d="${lowerArc(2)}" fill="none" stroke="#000" stroke-width="6" stroke-opacity=".6"/>
      <g class="neon">
        <ellipse class="neon-glow" cx="${cx}" cy="${cy}" rx="500" ry="300" fill="none" stroke-width="22" filter="url(#neonBlur)"/>
        <ellipse class="neon-line" cx="${cx}" cy="${cy}" rx="500" ry="300" fill="none" stroke-width="3"/>
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="496" ry="296" fill="url(#leather)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="484" ry="284" fill="none" stroke="url(#rimBevel)" stroke-width="24"/>
      <ellipse cx="${cx}" cy="${cy}" rx="495" ry="295" fill="none" stroke="url(#rimBevel)" stroke-width="3"/>
      <ellipse cx="${cx}" cy="${cy - 6}" rx="478" ry="276" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="10"/>
      <path d="M ${cx - 440} ${cy - 120} Q ${cx} ${cy - 330} ${cx + 440} ${cy - 120}" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="16" stroke-linecap="round"/>
      <ellipse cx="${cx}" cy="${cy}" rx="466" ry="268" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5 4"/>
      ${studs}
      <path class="neon-arc" d="" fill="none" stroke-width="7" stroke-linecap="round" filter="url(#neonBlur)"/>
      <path class="neon-arc-core" d="" fill="none" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="${cx}" cy="${cy}" rx="444" ry="252" fill="url(#track)" stroke="#000" stroke-width="3"/>
      <ellipse cx="${cx}" cy="${cy - 4}" rx="428" ry="240" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3"/>
      ${cups}
      ${SIDE_SPOTS.map(([x, y], i) => `<circle class="side-spot" data-i="${i}" cx="${x}" cy="${y}" r="14" fill="none"/>`).join('')}
      <ellipse cx="${cx}" cy="${cy}" rx="376" ry="202" fill="#000"/>
      <ellipse cx="${cx}" cy="${cy}" rx="372" ry="198" fill="url(#felt)"/>
      <rect x="128" y="102" width="744" height="396" fill="#fff" filter="url(#noise)" clip-path="url(#feltClip)" opacity=".7"/>
      <ellipse cx="${cx}" cy="${cy}" rx="372" ry="198" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="18"/>
      <g clip-path="url(#feltClip)">
        <path d="M ${cx - 372} ${cy} A 372 198 0 1 1 ${cx + 372} ${cy} A 372 198 0 1 1 ${cx - 372} ${cy} Z M ${cx - 372} ${cy + 26} A 372 198 0 1 0 ${cx + 372} ${cy + 26} A 372 198 0 1 0 ${cx - 372} ${cy + 26} Z" fill="#000" fill-opacity=".55" fill-rule="evenodd" filter="url(#softBlur)"/>
        <rect x="128" y="102" width="744" height="396" fill="url(#wallG)"/>
        <ellipse cx="${cx}" cy="${cy + 180}" rx="300" ry="40" fill="#fff" opacity=".035" filter="url(#softBlur)"/>
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="330" ry="170" fill="none" stroke="url(#gold)" stroke-opacity=".35" stroke-width="1.5"/>
      <g class="tbl-logo" transform="translate(${cx - 95} ${cy - 128}) scale(1.9 1.36)">
        <image href="/img/logo.webp?v=1" width="100" height="100" opacity=".34"/>
        <g class="tbl-eyes" style="mix-blend-mode:screen"><ellipse cx="44.1" cy="37.2" rx="7.5" ry="2.2" transform="rotate(23 44.1 37.2)" fill="url(#tblEye)"/><ellipse cx="56.1" cy="37.2" rx="7.5" ry="2.2" transform="rotate(-23 56.1 37.2)" fill="url(#tblEye)"/></g>
        <radialGradient id="tblEye"><stop offset="0" stop-color="#fffbe6"/><stop offset=".45" stop-color="#ffd678" stop-opacity=".9"/><stop offset="1" stop-color="#f5a028" stop-opacity="0"/></radialGradient>
      </g>
      <text x="${cx}" y="${cy + 128}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="30" letter-spacing="12" fill="#e8c46a" opacity=".22">${T('В ТОЧКУ')}</text>
      <defs>
        <radialGradient id="ballG" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="#fffbe8"/><stop offset=".16" stop-color="#ffe9a8"/><stop offset=".42" stop-color="#e6b552"/><stop offset=".74" stop-color="#9c6b1d"/><stop offset="1" stop-color="#3e2808"/></radialGradient>
        <radialGradient id="ballLimb" cx=".5" cy=".5" r=".5"><stop offset=".62" stop-color="#2a1700" stop-opacity="0"/><stop offset="1" stop-color="#2a1700" stop-opacity=".55"/></radialGradient>
        <radialGradient id="ballSpec" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <radialGradient id="ballTrailG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3c4" stop-opacity=".9"/><stop offset=".5" stop-color="#f6d27a" stop-opacity=".45"/><stop offset="1" stop-color="#f6d27a" stop-opacity="0"/></radialGradient>
        <filter id="puckGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="puckHalo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="16"/></filter>
        <filter id="ballShadow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
        <clipPath id="ballClip"><circle r="25"/></clipPath>
        <radialGradient id="sunHalo" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#ffe08a" stop-opacity=".75"/><stop offset=".55" stop-color="#ffb43c" stop-opacity=".28"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>
        <linearGradient id="sunRay" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff4c4" stop-opacity=".95"/><stop offset="1" stop-color="#ffb43c" stop-opacity="0"/></linearGradient>
        <filter id="ballGrain" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="3" seed="7" result="n"/><feColorMatrix in="n" values="0 0 0 0 .5  0 0 0 0 .38  0 0 0 0 .15  0 0 0 1.4 -.55"/><feComposite in2="SourceGraphic" operator="in"/></filter>
        <filter id="ballHammer" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="turbulence" baseFrequency=".32" numOctaves="1" seed="3" result="t"/><feColorMatrix in="t" values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .8  0 0 0 .9 -.35"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      </defs>
      <g class="ball-trail"></g>
      <g class="puck" style="display:none">
        <ellipse class="ball-shadow" cx="7" cy="6" rx="27" ry="17" fill="#000" opacity=".6" filter="url(#ballShadow)"/>
        <ellipse class="ball-contact" cx="2" cy="2" rx="14" ry="7" fill="#000" opacity=".55"/>
        <g class="ball-up">
          <circle class="puck-halo" r="64" fill="url(#sunHalo)"/>
          <g class="ball-corona">${Array.from({ length: 16 }, (_, i) => `<path d="M -2.2 -${i % 2 ? 31 : 29} L 0 -${i % 2 ? 44 : 54} L 2.2 -${i % 2 ? 31 : 29} Z" fill="url(#sunRay)" transform="rotate(${i * 22.5})"/>`).join('')}</g>
          <circle class="puck-glow" r="36" fill="#ffcf5a" opacity=".7" filter="url(#puckGlow)"/>
          <circle r="28.5" fill="none" stroke="#fff1b8" stroke-width="2" opacity=".55" filter="url(#ballShadow)"/>
          <circle class="ball-body" r="25" fill="url(#ballG)"/>
          <g clip-path="url(#ballClip)">
            <circle r="25" fill="#fff" filter="url(#ballHammer)" opacity=".42" class="ball-tex"/>
            <circle r="25" fill="#000" filter="url(#ballGrain)" opacity=".32" class="ball-tex"/>
            <g class="ball-spin">
            <g class="ball-lat" fill="#5a3a0c" fill-opacity=".55"><circle cx="-21.60" cy="-12.5" r=".75"/><circle cx="-17.28" cy="-12.5" r=".75"/><circle cx="-12.96" cy="-12.5" r=".75"/><circle cx="-8.64" cy="-12.5" r=".75"/><circle cx="-4.32" cy="-12.5" r=".75"/><circle cx="0.00" cy="-12.5" r=".75"/><circle cx="4.32" cy="-12.5" r=".75"/><circle cx="8.64" cy="-12.5" r=".75"/><circle cx="12.96" cy="-12.5" r=".75"/><circle cx="17.28" cy="-12.5" r=".75"/><circle cx="21.60" cy="-12.5" r=".75"/><circle cx="-21.60" cy="12.5" r=".75"/><circle cx="-17.28" cy="12.5" r=".75"/><circle cx="-12.96" cy="12.5" r=".75"/><circle cx="-8.64" cy="12.5" r=".75"/><circle cx="-4.32" cy="12.5" r=".75"/><circle cx="0.00" cy="12.5" r=".75"/><circle cx="4.32" cy="12.5" r=".75"/><circle cx="8.64" cy="12.5" r=".75"/><circle cx="12.96" cy="12.5" r=".75"/><circle cx="17.28" cy="12.5" r=".75"/><circle cx="21.60" cy="12.5" r=".75"/></g>
            <path d="M -25 0 L 25 0" stroke="#fff3c4" stroke-width=".7" stroke-opacity=".5" transform="translate(0 .8)"/>
            <path class="ball-eq" d="M -25 0 L 25 0" stroke="#5a3a0c" stroke-width="1.1" stroke-opacity=".7"/>
            <path class="ball-m" d="" fill="none" stroke="#5a3a0c" stroke-width="1.1" stroke-opacity=".65"/>
            <path class="ball-m" d="" fill="none" stroke="#5a3a0c" stroke-width="1.1" stroke-opacity=".65"/>
            <path class="ball-m" d="" fill="none" stroke="#5a3a0c" stroke-width="1.1" stroke-opacity=".65"/>
            <g class="ball-star"><circle r="9.5" fill="none" stroke="#6b4510" stroke-width=".9" stroke-opacity=".8"/><circle r="9.5" fill="none" stroke="#fff3c4" stroke-width=".5" stroke-opacity=".5" stroke-dasharray="1 1.4"/><path d="M0 -7 L1.9 -1.9 L7 0 L1.9 1.9 L0 7 L-1.9 1.9 L-7 0 L-1.9 -1.9 Z" fill="#fff4cc" stroke="#6b4510" stroke-width=".8"/><circle r="1.3" fill="#8a5a14"/></g>
          </g></g>
          <circle r="25" fill="url(#ballLimb)"/>
          <path d="M 19 12 A 23 23 0 0 1 6 22.5" fill="none" stroke="#ffe7a8" stroke-width="1.6" stroke-linecap="round" opacity=".32"/>
          <ellipse cx="-9" cy="-11" rx="10" ry="6.5" fill="url(#ballSpec)" transform="rotate(-35 -9 -11)"/>
          <circle cx="-11" cy="-13" r="2.4" fill="#fff"/>
          <g class="ball-twinkle" transform="translate(-11 -13)"><path d="M0 -11 L1.3 -1.3 L11 0 L1.3 1.3 L0 11 L-1.3 1.3 L-11 0 L-1.3 -1.3 Z" fill="#fff"/></g>
        </g>
      </g>
    </svg><div class="table-light"></div>`;
  }
  // Запасные места для шара у себя, когда подстаканник закрыт картами руки: сначала справа, потом слева.
  const SIDE_SPOTS = [[690, 420], [770, 394], [830, 350], [310, 420], [230, 394]];
  // Дуга неона по краю стола: центр — угол игрока (в градусах), ширина — 50°.
  function neonArcPath(deg, span = 50) {
    const cx = 500, cy = 300, rx = 492, ry = 292;
    const a0 = (deg - span / 2) * Math.PI / 180, a1 = (deg + span / 2) * Math.PI / 180;
    const p = a => `${(cx + Math.cos(a) * rx).toFixed(1)} ${(cy + Math.sin(a) * ry).toFixed(1)}`;
    return `M ${p(a0)} A ${rx} ${ry} 0 0 1 ${p(a1)}`;
  }

  // Кресло: высокая кожаная спинка с каретной стяжкой и золотыми заклёпками.
  // Кресло: круглая кожаная спинка с каретной стяжкой и золотыми заклёпками по кругу.
  function chairSvg() {
    let tufts = '';
    for (let r = 1; r <= 3; r++) {
      const n = r * 6;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r; tufts += `<circle cx="${(80 + Math.cos(a) * r * 18).toFixed(1)}" cy="${(80 + Math.sin(a) * r * 18).toFixed(1)}" r="2.4" fill="#040405"/>`; }
    }
    let studs = '';
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; studs += `<circle cx="${(80 + Math.cos(a) * 70).toFixed(1)}" cy="${(80 + Math.sin(a) * 70).toFixed(1)}" r="2.1" fill="#d9b45a"/>`; }
    return `<svg viewBox="0 0 160 160">
      <defs><radialGradient id="chl" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#3e3e46"/><stop offset=".65" stop-color="#16161a"/><stop offset="1" stop-color="#060608"/></radialGradient></defs>
      <circle cx="80" cy="80" r="77" fill="url(#chl)" stroke="#000" stroke-width="3"/>
      <circle cx="80" cy="80" r="64" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2"/>
      <path d="M28 52 A60 60 0 0 1 120 30" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="7" stroke-linecap="round"/>
      ${studs}${tufts}
    </svg>`;
  }

  // Иконка «Пересдачи»: две перекрещённые стрелки.
  function shuffleSvg() {
    return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.5c2.2 0 3.6 1.1 5 3.2l1 1.6c1.4 2.1 2.8 3.2 5 3.2H21"/><path d="M3 17h3.5c1.6 0 2.8-.6 3.8-1.8"/><path d="M13.7 8.8C14.7 7.6 15.9 7 17.5 7H21"/><path d="M18 4l3 3-3 3"/><path d="M18 14l3 3-3 3"/></svg>`;
  }
  function iconSvg(name) {
    const p = {
      scores: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
      menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      pause: '<path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
      play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
      full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    }[name];
    return `<svg viewBox="0 0 24 24">${p}</svg>`;
  }
  // Корона лидера: бархатная шапка, золотые зубцы с жемчугом, рубин, сапфиры, изумруды и блики.
  let crownN = 0;
  const crownSvg = () => {
    const u = 'cr' + (++crownN);
    const gem = (x, y, rx, ry, g) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${u}${g})" stroke="#3a2306" stroke-width=".5"/><ellipse cx="${x - rx * 0.35}" cy="${y - ry * 0.4}" rx="${rx * 0.35}" ry="${ry * 0.28}" fill="#fff" opacity=".85"/>`;
    const pearl = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}pe)" stroke="#8a6420" stroke-width=".35"/>`;
    return `<svg class="crown" viewBox="0 0 40 30"><defs>
      <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6cf"/><stop offset=".3" stop-color="#f6d27a"/><stop offset=".62" stop-color="#d19a2e"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
      <linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a6"/><stop offset=".45" stop-color="#e2b04c"/><stop offset="1" stop-color="#7a4c0e"/></linearGradient>
      <radialGradient id="${u}v" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="#e2324f"/><stop offset=".6" stop-color="#8e0f2a"/><stop offset="1" stop-color="#4a0614"/></radialGradient>
      <radialGradient id="${u}r" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb3c0"/><stop offset=".4" stop-color="#ff2a4a"/><stop offset="1" stop-color="#6e0018"/></radialGradient>
      <radialGradient id="${u}s" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#c9e4ff"/><stop offset=".45" stop-color="#2f7bff"/><stop offset="1" stop-color="#0b2370"/></radialGradient>
      <radialGradient id="${u}e" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#c8ffd9"/><stop offset=".45" stop-color="#19c26a"/><stop offset="1" stop-color="#05502a"/></radialGradient>
      <radialGradient id="${u}pe" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1e9dc"/><stop offset="1" stop-color="#b8a98f"/></radialGradient>
    </defs>
      <ellipse cx="20" cy="15.5" rx="15.5" ry="9.5" fill="url(#${u}v)"/>
      <path d="M8 13 Q20 7 32 13" fill="none" stroke="#ff6f86" stroke-width=".6" opacity=".5"/>
      <path d="M3.5 22 L2.4 9 L9.2 15 L12.2 5.6 L16.6 13.6 L20 1.8 L23.4 13.6 L27.8 5.6 L30.8 15 L37.6 9 L36.5 22 Z" fill="url(#${u}g)" stroke="#6b4210" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M3.9 20.5 L3.1 10.6 M12.4 7.4 L10.6 13.4 M20 3.6 L18 12 M27.6 7.4 L25.8 12.6 M36.9 10.6 L36.2 20.5" stroke="#fff8dc" stroke-width=".7" stroke-linecap="round" opacity=".7"/>
      ${gem(20, 12.4, 2.2, 3, 'r')}${gem(12.2, 15.6, 1.5, 1.9, 's')}${gem(27.8, 15.6, 1.5, 1.9, 's')}
      ${pearl(2.4, 8.4, 1.9)}${pearl(12.2, 5, 1.9)}${pearl(20, 1.9, 2.1)}${pearl(27.8, 5, 1.9)}${pearl(37.6, 8.4, 1.9)}
      <rect x="2.6" y="20.2" width="34.8" height="7.6" rx="2" fill="url(#${u}b)" stroke="#5a360b" stroke-width=".7"/>
      <path d="M3.6 21.4 H36.4" stroke="#fff3c4" stroke-width=".6" opacity=".75"/>
      <path d="M3.6 26.8 H36.4" stroke="#3a2306" stroke-width=".6" opacity=".6"/>
      ${gem(20, 24, 3.2, 2.4, 'r')}${gem(12.5, 24, 2.1, 1.9, 'e')}${gem(27.5, 24, 2.1, 1.9, 'e')}${gem(6.4, 24, 1.4, 1.5, 's')}${gem(33.6, 24, 1.4, 1.5, 's')}
      ${[9.4, 16, 24, 30.6].map(x => pearl(x, 24, 0.9)).join('')}
      <g class="crown-glint" transform="translate(20 1.9)"><path d="M0 -4.5 L.7 -.7 L4.5 0 L.7 .7 L0 4.5 L-.7 .7 L-4.5 0 L-.7 -.7 Z" fill="#fff"/></g>
    </svg>`;
  };

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
    if (I18N.lang === 'en') return `<h2 class="gold-text">Rules of “Spot On”</h2><ul class="rules">
      <li>36-card deck, 2–6 players. Hearts <b style="color:var(--crimson)">♥</b> are trumps.</li>
      <li>Rounds go up and down: 1, 2, 3… cards up to the maximum and back. The maximum is 36 ÷ players, but no more than 9 (5 players — 7 cards, 6 — 6). Extra rounds are added at the peak.</li>
      <li><b>First lead</b> in round one goes to a random player, then passes clockwise (the gold ball on the table).</li>
      <li><b>Bidding</b> starts with the player after the leader. Bid from 0 up to the number of cards; the total may be anything.</li>
      <li><b>Play:</b> if you have the suit of the first card, you must play it (no trump then). No such suit — any card, trumps included. <b>7♠</b> is a joker: it can always be played and never has to follow spades. The strongest card takes the trick and its owner leads next.</li>
      <li><b>Scoring:</b> exactly your bid — +20 per trick; bid 0 and took 0 — +5 plus 1 per card in hand; short — −20 per missing trick; over — +1 per extra trick.</li>
      <li><b>Double points:</b> in the first and last round of the game all points — gains and losses — are doubled (with “Dark” ×4).</li>
      <li><b>7♠:</b> a normal card; when leading — “Highest on the table!” (everyone plays their strongest card, the trick is yours); when following — the top card (takes the trick).</li>
      <li><b>Timer:</b> when time runs out, a random honest card is played for you (for bids — an automatic estimate of your hand).</li>
      <li><b>Pre-select:</b> while others play, double-tap a card — it will be played automatically on your turn (if it’s still an honest move). Tap it again to cancel.</li>
      <li><b>Pause:</b> each player has 3 pauses per game (the ⏸ button at the top). Anyone can unpause — the game resumes after a 5…1 countdown; you can pause again during the countdown. After 5 minutes the pause ends by itself.</li>
      <li><b>Bluff mode:</b> any card may be played, breaking the suit rule and “Highest on the table!”. While the trick is on the table anyone can tap “?” on someone else’s card (except the first card of the trick, 7♠ and a move with only one card in hand). Caught — the cheater gives the checker 50 points, the card goes back and an honest card must be played. Wrong — the checker loses 20 points and the checked player gets +5.</li>
      <li><b>Skills</b> (table option): <b>Reshuffle</b> — once per game, in the 5-second window after the deal and before bidding, all players’ cards are collected, shuffled and dealt again. At most one reshuffle per round.</li>
      <li><b>Test mode</b> (table option): 17 rounds; round 10 is <b>No trumps</b> (hearts are an ordinary suit), round 15 is <b>Dark</b> (bid blind, cards are revealed after bidding, round points ×2).</li>
    </ul><div class="actions"><button class="btn-gold" data-act="close">Got it</button></div>`;
    return `<h2 class="gold-text">Правила «В Точку»</h2><ul class="rules">
      <li>Колода 36 карт, 2–6 игроков. Козыри — черви <b style="color:var(--crimson)">♥</b>.</li>
      <li>Раунды идут «горкой»: по 1, 2, 3… карт до максимума и обратно. Максимум — 36 ÷ число игроков, но не больше 9 (5 игроков — 7 карт, 6 — 6). Лишние раунды добавляются на пике.</li>
      <li><b>Первый ход</b> в первом раунде у случайного игрока, дальше переходит по часовой стрелке (золотой шар на столе).</li>
      <li><b>Заявка:</b> начинает следующий после ходящего. Можно заявить от 0 до числа карт; сумма заявок может быть любой.</li>
      <li><b>Ходы:</b> есть масть первой карты — кладёте только её (козырь в этом случае нельзя). Масти нет — любую карту, в том числе козырь. <b>7♠</b> — джокер: её можно положить всегда, и под пики класть её не обязательно. Взятку забирает сильнейшая карта, её владелец ходит следующим.</li>
      <li><b>Очки:</b> взял ровно заявленное — +20 за взятку; заявил 0 и взял 0 — +5 и ещё +1 за каждую карту на руке; недобор — −20 за каждую; перебор — +1 за каждую лишнюю взятку.</li>
      <li><b>Двойные очки:</b> в первом и последнем раунде партии все очки — и плюсы, и минусы — удваиваются (вместе с «Тёмной» — ×4).</li>
      <li><b>7♠:</b> как обычная карта; первым ходом — «Старшие на стол!» (все кладут самую сильную карту, взятка ваша); в ответ — как самая старшая (забирает взятку).</li>
      <li><b>Таймер:</b> если время на ход вышло, за игрока кладётся случайная честная карта (на заявку — автоматическая оценка руки).</li>
      <li><b>Предвыбор:</b> пока ходят другие, дважды нажмите карту — она сыграется сама, когда дойдёт ваш ход (если ход ею будет честным). Ещё одно нажатие — отменить.</li>
      <li><b>Пауза:</b> у каждого игрока 3 паузы на партию (кнопка ⏸ вверху). Снять паузу может любой — игра продолжится после отсчёта 5…1; во время отсчёта можно снова поставить паузу. Через 5 минут пауза снимается сама.</li>
      <li><b>Режим обмана:</b> можно класть любую карту, нарушая правила масти и «Старшие на стол!». Пока взятка на столе, любой может нажать «?» на чужой карте (кроме первой карты взятки, 7♠ и хода, когда у игрока была одна карта). Поймал — обманщик отдаёт проверившему ${50} очков, карта возвращается, и он обязан положить честную. Ошибся — проверивший теряет 20 очков, а проверенный получает +5.</li>
      <li><b>Умения</b> (настройка стола): <b>«Пересдача»</b> — один раз за партию, в окне 5 секунды после раздачи (до заявок), карты всех игроков собираются, тасуются и раздаются заново. Не больше одной пересдачи за раунд.</li>
      <li><b>Тестовый режим</b> (настройка стола): 17 раундов; 10-й — <b>«Бескозырка»</b> (червы — обычная масть), 15-й — <b>«Тёмная»</b> (заявка вслепую, карты открываются после заявок, очки раунда ×2).</li>
    </ul><div class="actions"><button class="btn-gold" data-act="close">Понятно</button></div>`;
  }
  function langSeg(extra = '') {
    return `<div class="seg seg-sm lang-seg ${extra}" id="seg-lang">${[['ru', 'RU'], ['en', 'EN']].map(([k, n]) => `<button data-act="lang" data-l="${k}" class="${I18N.lang === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  }
  // Тексты вне экранов (поворот телефона, заголовок вкладки).
  function applyLangStatic() {
    document.title = T('В Точку');
    const rot = document.querySelector('#rotate .gold-text'); if (rot) rot.textContent = T('Поверните телефон');
    const rh = document.querySelector('#rotate .hint'); if (rh) rh.textContent = T('«В Точку» рассчитана на горизонтальный экран');
  }
  applyLangStatic();
  function showMenu() {
    // Две колонки: слева — настройки, справа — партия. Всё помещается без прокрутки на горизонтальном экране.
    showModal(`<div class="menu-head"><h2 class="gold-text">${T('Меню')}</h2><button class="btn-gold menu-back" data-act="close">${T('Назад')}</button></div>
      <div class="menu-cols">
        <div class="menu-col">
          <div class="menu-cap">${T('Настройки')}</div>
          ${musicCtlHtml()}
          <button class="btn-ghost" data-act="sound">${T('Звук: {v}', { v: T(prefs.sound ? 'включён' : 'выключен') })}</button>
          <div class="menu-row"><span class="opt-label">${T('Графика')}</span>${gfxSeg()}</div>
          <button class="btn-ghost" data-act="log">${T('Журнал: {v}', { v: T(prefs.log ? 'показан' : 'скрыт') })}</button>
          <div class="menu-row"><button class="btn-ghost cust-btn" data-act="customize">✦ ${T('Персонализация')}</button>${langSeg()}</div>
        </div>
        <div class="menu-col">
          <div class="menu-cap">${T('Партия')}</div>
          <button class="btn-ghost" data-act="rules">${T('Правила')}</button>
          <button class="btn-ghost" data-act="board">${T('Таблица лидеров')}</button>
          <button class="btn-ghost" data-act="fullscreen">${T(document.fullscreenElement ? 'Выйти из полного экрана' : 'Во весь экран')}</button>
          <button class="btn-ghost" data-act="install">${T('Установить как приложение')}</button>
          <span class="menu-fill"></span>
          <button class="btn-ghost btn-crimson" data-act="leave-ask">${T('Выйти из-за стола')}</button>
        </div>
      </div>`, 'menu-modal');
  }
  // ---------- персонализация: колоды, комнаты, эффекты ----------
  // Колоды — личная настройка игрока (prefs.cards). Комнаты и эффекты — заготовки под будущие скины.
  const DECKS = [['sil', 'Силуэты'], ['dark', 'Чёрные'], ['light', 'Классика'], ['royal', 'Королевская'], ['star', 'Звёздная']];
  const deckImpl = k => (k === 'light' ? window.CardsLight : k === 'sil' ? window.CardsSil : k === 'royal' ? window.CardsRoyal : k === 'star' ? window.CardsStar : window.CardsDark) || Cards;
  // Мини-превью комнаты: стол сверху и места игроков.
  function roomPreview(k) {
    const seats = [[50, 88], [8, 50], [30, 14], [70, 14], [92, 50]];
    if (k === 'office') {
      return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect width="100" height="100" fill="#3b4250"/>${[0, 20, 40, 60, 80].map(x => [0, 20, 40, 60, 80].map(y => `<rect x="${x}" y="${y}" width="20" height="20" fill="${(x + y) % 40 ? '#363c49' : '#3f4656'}"/>`).join('')).join('')}
        <rect x="18" y="0" width="22" height="6" rx="1" fill="#eef5ff" opacity=".7"/><rect x="60" y="0" width="22" height="6" rx="1" fill="#eef5ff" opacity=".7"/>
        <ellipse cx="50" cy="56" rx="38" ry="27" fill="#1e140c"/><ellipse cx="50" cy="53" rx="38" ry="27" fill="#b8bec7"/><ellipse cx="50" cy="53" rx="37" ry="26" fill="#5e3e25"/>
        <path d="M 50 47 L 55 56 L 45 56 Z" fill="#23262c"/><circle cx="50" cy="53" r="1" fill="#45e09a"/>
        <rect x="22" y="62" width="10" height="7" rx="1" fill="#c9ced6" transform="rotate(-14 27 65)"/><rect x="70" y="61" width="6" height="8" fill="#fbfaf4"/>
        ${seats.map(([x, y]) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="4" fill="#2b2f36" stroke="#4a505b" stroke-width=".8"/>`).join('')}
      </svg>`;
    }
    if (k === 'cozy') {
      const pil = ['#f3e0c8', '#f2b3c2', '#b8d2f0', '#f6dc8e', '#d8c4ef'];
      return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect width="100" height="100" fill="#3b2214"/>${[20, 40, 60, 80].map(x => `<rect x="${x}" width="1" height="100" fill="#1e0e05" opacity=".6"/>`).join('')}
        <path d="M 0 9 Q 25 22 50 9 Q 75 22 100 9" fill="none" stroke="#2a1a10" stroke-width=".8"/>${[8, 20, 32, 44, 56, 68, 80, 92].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 14 : 12}" r="1.6" fill="#ffd27a"/><circle cx="${x}" cy="${i % 2 ? 14 : 12}" r="4" fill="#ffc46b" opacity=".25"/>`).join('')}
        ${['#d98e7e', '#e9c9a8', '#9bb8a6', '#c9a2b8'].map((c, i) => `<ellipse cx="50" cy="55" rx="${48 - i * 3}" ry="${36 - i * 2.4}" fill="none" stroke="${c}" stroke-width="3"/>`).join('')}
        <ellipse cx="50" cy="56" rx="36" ry="25" fill="#7a4523"/><ellipse cx="50" cy="53" rx="36" ry="25" fill="#c08850"/>
        ${[37, 45, 53, 61, 69].map(y => `<rect x="10" y="${y}" width="80" height=".5" fill="#4a2a14" opacity=".35"/>`).join('')}
        <ellipse cx="50" cy="53" rx="12" ry="8" fill="#fff8ea" opacity=".25"/>
        ${seats.map(([x, y], i) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="4" fill="${pil[i]}"/>`).join('')}
      </svg>`;
    }
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect width="100" height="100" fill="#0e0b14"/><ellipse cx="50" cy="50" rx="45" ry="35" fill="rgba(120,80,190,.18)"/>
      <ellipse cx="50" cy="56" rx="38" ry="27" fill="#141418"/><ellipse cx="50" cy="53" rx="38" ry="27" fill="#2a2a30"/>
      <ellipse cx="50" cy="53" rx="38" ry="27" fill="none" stroke="#8c5bff" stroke-width=".8" opacity=".8"/>
      <ellipse cx="50" cy="53" rx="28" ry="18" fill="#1b2340"/><ellipse cx="50" cy="53" rx="24" ry="15" fill="none" stroke="#e8c46a" stroke-width=".4" opacity=".5"/>
      ${seats.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#1c1c20" stroke="#d9b45a" stroke-width=".8" stroke-dasharray="1 1"/>`).join('')}
    </svg>`;
  }
  function showCustomize(tab = S.custTab || 'decks', from) {
    if (from !== undefined) S.custFrom = from;
    S.custTab = tab;
    const tabs = [['decks', 'Колоды'], ['rooms', 'Комнаты'], ['fx', 'Эффекты'], ['wheel', 'Эмоции']];
    let body;
    if (tab === 'wheel') {
      const w = myWheel(), sel = S.wheelSlot || 0;
      const slots = w.emotes.map((e, i) => {
        const a = (i / w.emotes.length) * Math.PI * 2 - Math.PI / 2;
        return `<button class="wheel-item ${i === sel ? 'sel' : ''}" style="--x:${(Math.cos(a) * 64).toFixed(1)}px;--y:${(Math.sin(a) * 64).toFixed(1)}px;animation:none" data-act="wheelSlot" data-i="${i}">${e}</button>`;
      }).join('');
      body = `<div class="wheel-cfg">
        <div class="wc-col wc-wheel"><div class="menu-cap">${T('Колесо')}</div><div class="wheel wheel-edit">${slots}<div class="wheel-hub">😀</div></div></div>
        <div class="wc-col"><div class="menu-cap">${T('Выберите место на колесе, затем смайлик')}</div>
          <div class="emo-pool">${EMOTE_POOL.map(e => `<button class="${w.emotes.includes(e) ? 'used' : ''}" data-act="wheelPick" data-e="${e}">${e}</button>`).join('')}</div></div>
        <div class="wc-col"><div class="menu-cap">${T('Фразы')}</div>
          <div class="wc-phrases">${w.phrases.map((p, i) => `<input class="wheel-phrase" data-i="${i}" maxlength="${PHRASE_MAX}" value="${esc(T(p))}" placeholder="${T('Пусто')}">`).join('')}</div>
          <button class="btn-ghost wc-reset" data-act="wheelReset">${T('Сбросить по умолчанию')}</button></div>
      </div>`;
    } else if (tab === 'decks') {
      body = `<div class="deck-grid">${DECKS.map(([k, n]) => {
        const D = deckImpl(k), on = prefs.cards === k;
        const faces = ['Т♥', '7♠', 'Д♦'].map(id => `<span class="dk-card" style="background-image:${D.url(Cards.parse(id))}"></span>`).join('');
        return `<button class="deck-item ${on ? 'on' : ''}" data-act="theme" data-t="${k}">
          <div class="dk-fan"><span class="dk-card dk-back" style="background-image:${D.backUrl()}"></span>${faces}</div>
          <div class="dk-name">${T(n)}</div><div class="dk-state">${T(on ? 'Выбрана' : 'Выбрать')}</div></button>`;
      }).join('')}</div>`;
    } else if (tab === 'rooms') {
      body = `<div class="deck-grid room-grid">${ROOMS.map(([k, n]) => {
        const on = ROOM === k;
        return `<button class="deck-item ${on ? 'on' : ''}" data-act="room" data-r="${k}">
          <div class="room-prev room-prev-${k}">${roomPreview(k)}</div>
          <div class="dk-name">${T(n)}</div><div class="dk-state">${T(on ? 'Выбрана' : 'Выбрать')}</div></button>`;
      }).join('')}</div>`;
    } else if (tab === 'fx') {
      const cur = prefs.mudStyle || 'mud';
      body = `<div class="menu-cap">${T('Бросок лидера — чем лидер по очкам может бросить в соперника')}</div>
        <div class="deck-grid throw-grid">${THROWS.map(([k, n]) => {
        const on = cur === k;
        return `<button class="deck-item ${on ? 'on' : ''}" data-act="mudStyle" data-s="${k}">
          <div class="throw-prev"><div class="tp-splat">${splatSvg(k)}</div><div class="tp-ball ${k === 'mud' ? 'mud-ball' : 't-' + k}">${throwSvg(k)}</div></div>
          <div class="dk-name">${T(n)}</div><div class="dk-state">${T(on ? 'Выбрана' : 'Выбрать')}</div></button>`;
      }).join('')}</div>`;
    } else {
      const txt = 'Скоро здесь появятся оформления столов и комнат.';
      body = `<div class="cust-empty"><div class="cust-empty-ic">✦</div><div>${T(txt)}</div></div>`;
    }
    showModal(`<div class="menu-head"><h2 class="gold-text">${T('Персонализация')}</h2><button class="btn-gold menu-back" data-act="custBack">${T('Назад')}</button></div>
      <div class="tabs cust-tabs">${tabs.map(([k, n]) => `<button data-act="custTab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${T(n)}</button>`).join('')}</div>
      <div class="cust-body">${body}</div>`, 'cust-modal');
  }
  function showScores() {
    const v = S.view;
    if (!v || v.stage !== 'game') return;
    const head = `<tr><th>#</th><th>${T('Карт')}</th>${v.names.map((n, p) => `<th style="color:${nameColor(p)}">${esc(n)}</th>`).join('')}</tr>`;
    const rows = v.history.map((h, i) => `<tr><td>${i + 1}</td><td>${h.cards}</td>${h.delta.map((d, p) => {
      const b = (h.bonus && h.bonus[p]) || 0, t = d + b;
      return `<td class="${t >= 0 ? 'pos' : 'neg'}">${h.bids[p]}/${h.took[p]} <b>${t >= 0 ? '+' : ''}${t}</b>${b ? ` <span class="hint">(${b > 0 ? '+' : ''}${b})</span>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    const total = `<tr><th></th><th>${T('Итого')}</th>${v.scores.map(s => `<th><span class="gold-text">${s}</span></th>`).join('')}</tr>`;
    showModal(`<h2 class="gold-text">${T('Счёт')}</h2><div class="hist-wrap"><table class="hist">${head}${rows}${total}</table></div>
      <h3 class="hint" style="margin:14px 0 4px">${T('Журнал')}</h3><div class="log-list">${v.log.slice().reverse().map(l => `<div>${colorNames(I18N.trLog(l), v.names)}</div>`).join('')}</div>
      <div class="actions"><button class="btn-gold" data-act="close">${T('Закрыть')}</button></div>`, 'scores-modal');
  }

  // Полный экран: включить/выключить. На iPhone браузеры его не дают — подсказываем установку на главный экран.
  async function goFullscreen() {
    const d = document.documentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    try {
      if (fsEl) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (!req) throw new Error('no fullscreen');
      await req.call(d, { navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch {
      const ios = /iphone|ipod/i.test(navigator.userAgent);
      toast(T(ios ? 'На iPhone полный экран доступен только для игры, добавленной на экран «Домой» (Поделиться → На экран «Домой»).' : 'Браузер не разрешил полный экран — попробуйте ещё раз или через меню браузера.'));
    }
  }
  document.addEventListener('fullscreenchange', () => { setTimeout(() => { VIEW.update(); dispatchEvent(new Event('resize')); }, 120); });

  // ---------- параллакс: мышь и наклон телефона ----------
  const Parallax = (() => {
    // --px/--py объявлены в style.css через @property как НЕнаследуемые и пишутся только в слои, которые двигаются.
    // Раньше они писались в корень документа: на телефоне гироскоп дёргает их постоянно, и браузер
    // пересчитывал стили всей страницы (включая сотни элементов SVG-стола) — FPS падал в разы.
    const TARGETS = '.bg, .motes, .home-fan-inner, .table-wrap, .table-light, .cards, .checks, .seats';
    let tx = 0, ty = 0, x = 0, y = 0, base = null, raf = 0, gyroAsked = false;
    function write() {
      const px = x.toFixed(4), py = y.toFixed(4);
      for (const el of document.querySelectorAll(TARGETS)) { el.style.setProperty('--px', px); el.style.setProperty('--py', py); }
    }
    function frame() {
      x += (tx - x) * 0.08; y += (ty - y) * 0.08;
      write();
      raf = Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001 ? requestAnimationFrame(frame) : 0;
    }
    const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
    // Новые экраны появляются со сдвигом 0 — дописываем текущий сдвиг, чтобы слои не «прыгали».
    { const scr = document.getElementById('screen'); if (scr) new MutationObserver(() => { if (x || y) write(); }).observe(scr, { childList: true }); }
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; go();
    });
    function onOrient(e) {
      if (e.beta == null || gfx() === 'low') return; // на низкой графике наклон телефона не двигает сцену
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let gx, gy;
      if (ang === 90) { gx = e.beta; gy = -e.gamma; } else if (ang === -90 || ang === 270) { gx = -e.beta; gy = e.gamma; } else { gx = e.gamma; gy = e.beta; }
      if (!base) base = { gx, gy };
      base.gx += (gx - base.gx) * 0.01; base.gy += (gy - base.gy) * 0.01;
      const nx = Math.max(-1, Math.min(1, (gx - base.gx) / 14)), ny = Math.max(-1, Math.min(1, (gy - base.gy) / 14));
      // Дрожание руки меньше 0.4% не двигаем — иначе сцена перерисовывается без видимой разницы.
      if (Math.abs(nx - tx) < 0.004 && Math.abs(ny - ty) < 0.004) return;
      tx = nx; ty = ny; go();
    }
    function enableGyro() {
      if (gyroAsked || typeof DeviceOrientationEvent === 'undefined') return;
      gyroAsked = true;
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onOrient); }).catch(() => {});
      } else addEventListener('deviceorientation', onOrient);
    }
    // Смена качества графики: на low возвращаем сцену в центр.
    function reset() { if (gfx() === 'low') { tx = 0; ty = 0; base = null; go(); } }
    return { enableGyro, reset };
  })();

  // #app никогда не должен прокручиваться (фокус/скролл к элементу сдвигал весь стол).
  { const app = document.getElementById('app'); if (app) app.addEventListener('scroll', () => { app.scrollLeft = 0; app.scrollTop = 0; }); }
  // ---------- геометрия ----------
  function dims() {
    const W = VIEW.w, H = VIEW.h;
    const ch = Math.round(Math.max(76, Math.min(H * 0.3, W * 0.145, 210)));
    const cw = Math.round(ch * 0.714);
    return { W, H, ch, cw, cx: W / 2, cy: H * 0.45 };
  }
  const rel = (v, p) => (p - v.you + v.n) % v.n;
  const SPOTS = { 2: ['me', 'top'], 3: ['me', 'tl', 'tr'], 4: ['me', 'left', 'top', 'right'], 5: ['me', 'left', 'tl', 'tr', 'right'], 6: ['me', 'left', 'tl', 'top', 'tr', 'right'] };
  const spotOf = (v, p) => SPOTS[v.n][rel(v, p)];
  // Цвет игрока по месту за столом — одинаковый у всех клиентов (чат, журнал, таблички).
  const NAME_COLORS = ['#6fd3ff', '#ff8fb1', '#9be37a', '#c9a2ff', '#ffb35c', '#5fe0c4'];
  const nameColor = p => NAME_COLORS[((p % 6) + 6) % 6];
  // Экранировать строку и раскрасить в ней имена игроков.
  function colorNames(text, names) {
    const safe = esc(text);
    const list = names.map((n, p) => ({ n: esc(n), p })).filter(o => o.n).sort((a, b) => b.n.length - a.n.length);
    if (!list.length) return safe;
    const re = new RegExp(list.map(o => o.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    const byName = new Map(list.map(o => [o.n, o.p]));
    return safe.replace(re, m => `<span class="pn" style="color:${nameColor(byName.get(m))}">${m}</span>`);
  }
  const SPOT_ANGLE = { me: 90, left: 180, right: 0, top: -90, tl: -128, tr: -52 };
  const CHAIR_ROT = { left: -90, right: 90, top: 0, tl: -28, tr: 28 };
  function slotXY(spot, d, n, lead) {
    const a = SPOT_ANGLE[spot] * Math.PI / 180;
    // Карта первого хода — на своём месте, но отодвинута от центра (зазор от остальных) и крупнее.
    const k = lead ? 1.32 : 1;
    const rx = d.cw * (n >= 5 ? 1.6 : 1.15) * k, ry = d.ch * (n >= 5 ? 0.28 : 0.3) * k;
    return [d.cx + Math.cos(a) * rx, d.cy + Math.sin(a) * ry];
  }
  const LEAD_SCALE = 1.16;
  function handXY(i, m, d, sel, focus = -1, hover = false) {
    const c = (m - 1) / 2, off = i - c;
    const avail = Math.min(d.W * 0.6, d.cw * 0.8 * m + d.cw);
    const step = m > 1 ? Math.min(d.cw * 0.74, (avail - d.cw) / (m - 1)) : 0;
    const rot = off * Math.min(5, 34 / Math.max(m, 1));
    // Рука по центру, над плашкой игрока (плашка внизу по центру).
    let y = d.H - ME_PANEL_H - d.ch * 0.3 + off * off * Math.min(3.2, 20 / Math.max(m, 1));
    let x = d.cx + off * step, s = 1, r = rot;
    // Соседи выбранной/наведённой карты раздвигаются.
    if (focus >= 0 && focus !== i && m > 1) {
      const dist = i - focus;
      x += Math.sign(dist) * d.cw * 0.34 * Math.max(0, 1 - (Math.abs(dist) - 1) * 0.35);
    }
    if (focus === i) {
      if (sel) { y -= d.ch * 0.3; s = 1.1; }
      else if (hover) { y -= d.ch * 0.2; s = 1.2; }
      r = rot * 0.4;
    }
    return { x, y, rot: r, s };
  }
  let TABLE_SCALE = 0.66;
  const ME_PANEL_H = 68;

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
    el.className = 'card' + (faceUp ? '' : ' down') + (card && !card.hidden && card.id === '7♠' ? ' seven' : '');
    if (card) el.dataset.id = card.id;
    el.innerHTML = '<div class="aura"></div><div class="ci"><div class="face front"></div><div class="face back"></div></div>';
    if (card && !card.hidden) el.querySelector('.front').style.backgroundImage = Cards.url(card);
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
      TABLE_SCALE = 0.66;
      Object.assign(this, { pv: null, pzKind: '', el, prev: null, hand: new Map(), table: new Map(), seatEls: [], sel: null, special: false, resultsShownFor: -1, overShown: false, checkSeq: 0 });
      this.cardsLayer = $('#cards', el); this.seatsLayer = $('#seats', el); this.checksLayer = $('#checks', el);
      this.applyDims();
      this.onResize = () => { this.applyDims(); if (S.view && S.view.stage === 'game') this.relayout(S.view); };
      clearInterval(this.awayT); this.awayT = setInterval(() => this.tickAway(), 500);
      addEventListener('resize', this.onResize);
      this.cardsLayer.addEventListener('click', e => { const c = e.target.closest('.inhand'); if (c) this.tapHand(c.dataset.id, c); });
      // Наведение мышью: карта увеличивается, соседние раздвигаются.
      this.cardsLayer.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const c = e.target.closest('.inhand');
        if (c && this.hover !== c.dataset.id) { this.hover = c.dataset.id; if (S.view) this.syncHand(S.view); }
      });
      this.cardsLayer.addEventListener('pointerout', e => {
        if (e.pointerType !== 'mouse') return;
        const c = e.target.closest('.inhand');
        if (c && (!e.relatedTarget || !c.contains(e.relatedTarget)) && this.hover === c.dataset.id) {
          this.hover = null;
          clearTimeout(this.hoverT);
          this.hoverT = setTimeout(() => { if (!this.hover && S.view) this.syncHand(S.view); }, 60);
        }
      });
      clearInterval(this.timerTick);
      this.timerTick = setInterval(() => this.tickTimer(), 200);
    },
    destroy() {
      clearInterval(this.awayT);
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
      if (v && p === v.you) { const a = $('#me-panel .ava', this.el); if (a) { return VIEW.center(a); } }
      const s = this.seatEls[p];
      if (!s) return [VIEW.w / 2, VIEW.h / 2];
      return VIEW.center(s.querySelector('.ava'));
    },

    async update(v, fast) {
      const prev = this.prev;
      const newGame = !prev || (prev.phase === 'gameOver' && v.phase !== 'gameOver');
      const newRound = newGame || prev.roundIdx !== v.roundIdx;
      if (!prev) { this.checkSeq = v.lastCheck ? v.lastCheck.seq : 0; }
      // Показанный счёт и корона меняются только вместе с анимациями (монеты, полёт короны).
      if (!prev || newGame || fast || !this.shown || this.shown.length !== v.n) {
        this.shown = v.scores.slice(); this.scoreAnims = 0;
        this.crownSet = leadersOf(v); this.leadKey = this.crownSet.join(',');
      }
      const rsSeq = v.reshuffle ? v.reshuffle.seq : 0;
      if (!prev || newRound) this.reshuffleSeq = rsSeq; // раздача и так покажет новые карты
      this.updateSkills(v);
      this.updateHud(v);
      if (!prev || this.seatEls.length !== v.n) { TABLE_SCALE = v.n >= 5 ? 0.61 : 0.66; this.buildSeats(v); }
      this.updateLog(v);
      if (v.phase === 'roundDone' && $('#overlay').dataset.kind === 'results') this.updateNext(v);
      if (newRound) {
        closeModalIf('results'); closeModalIf('over');
        this.overShown = false;
        this.intro = true; this.updateSkills(v); // пока объявление и раздача — окно пересдачи не показываем
        try {
          await this.collectStale(v, true);
          this.updateSeats(v, prev, true);
          this.updateMe(v, null);
          if (!fast) await this.announceRound(v);
          await this.deal(v, fast);
        } finally { this.intro = false; }
      }
      if (rsSeq > this.reshuffleSeq) {
        this.reshuffleSeq = rsSeq;
        if (fast) await this.deal(v, true);
        else await this.reshuffleFx(v);
      }
      if (this.darkHand && !v.handHidden && !newRound) await this.revealDark(v, fast);
      this.openPreWindow(v, fast);
      // Новые заявки — крупное объявление, которое стекает в аватар игрока.
      if (!fast && prev && prev.roundIdx === v.roundIdx && !newRound) v.bids.forEach((b, p) => { if (b !== null && prev.bids[p] === null) this.announceBid(v, p, b); });
      await this.applyCheck(v, fast);
      await this.syncTable(v, fast);
      this.updateSeats(v, newRound ? null : prev);
      this.updateMe(v, newRound ? null : prev);
      this.syncHand(v, fast);
      if (!fast) this.playQueued(v); else this.queued = null;
      this.updateChecks(v);
      this.updateStatus(v);
      this.updateAction(v);
      this.updateSkills(v);
      this.updateVote(v);
      this.updatePause(this.pv && this.pv._at >= v._at ? this.pv : v);
      this.maybeBoom(v, prev, fast);
      this.updateNeon(v);
      this.updatePuck(v, fast);
      if (v.phase === 'roundDone' && this.resultsShownFor !== v.roundIdx) { this.resultsShownFor = v.roundIdx; await this.showResults(v, fast); }
      if (v.phase === 'gameOver' && !this.overShown) { this.overShown = true; await this.showGameOver(v, fast); }
      else if (v.phase === 'gameOver') renderOverRating(v);
      this.prev = v;
      await this.settleScores(v, fast);
    },

    // ---------- показанный счёт ----------
    scoreEl(p) {
      if (S.view && p === S.view.you) return $('#me-panel .sc', this.el);
      return this.seatEls[p] && this.seatEls[p].querySelector('.sc');
    },
    avaEl(p) {
      if (S.view && p === S.view.you) return $('#me-panel .ava', this.el);
      return this.seatEls[p] && this.seatEls[p].querySelector('.ava');
    },
    setShown(p, val) {
      if (!this.shown) return;
      this.shown[p] = val;
      const el = this.scoreEl(p);
      if (el) setScore(el, val, true);
    },
    paintCrowns(v) { for (let p = 0; p < v.n; p++) { const a = this.avaEl(p); if (a) markAvatar(a, v, p); } },
    // Если никакая анимация не объясняет расхождение (переподключение, пропущенные обновления) — подтягиваем счёт.
    async settleScores(v, fast) {
      if (!this.shown || this.scoreAnims > 0) return;
      if (v.phase === 'roundDone' && this.resultsShownFor !== v.roundIdx) return;
      let changed = false;
      v.scores.forEach((sc, p) => { if (this.shown[p] !== sc) { this.setShown(p, sc); changed = true; } });
      if (changed || leadersOf({ scores: this.shown }).join(',') !== this.leadKey) await this.refreshLeaders(v, fast);
    },
    // Корона следует за показанным счётом: смена лидера — только после того, как долетели монеты.
    async refreshLeaders(v, fast) {
      if (this.leaderBusy) { this.leaderAgain = true; return; }
      this.leaderBusy = true;
      try {
        do {
          this.leaderAgain = false;
          const now = leadersOf({ scores: this.shown });
          const key = now.join(',');
          if (key === this.leadKey) break;
          const old = this.leadKey;
          this.leadKey = key;
          await this.leaderChange(S.view || v, old, now, fast);
        } while (this.leaderAgain);
      } finally { this.leaderBusy = false; }
    },

    updateHud(v) {
      $('#hud-round', this.el).textContent = T('Раунд {a}/{b}', { a: v.roundIdx + 1, b: v.plan.length });
      $('#hud-sub', this.el).textContent = poCards(v.plan[v.roundIdx]);
      const special = v.mode === 'dark' ? `<span class="mode-box dark">${T('тёмная ×2')}</span>` : '';
      $('#hud-mode', this.el).innerHTML = special + (v.bluff ? `<span class="mode-box">${T('обман')}</span>` : '') + (v.double ? `<span class="mode-box dbl">×${v.mult || 2} ${T('очки')}</span>` : '');
      const tb = $('#trump-box', this.el);
      if (tb) {
        const html = v.trump === null ? `<span class="nt">⊘</span> ${T('без козыря')}` : `<span>♥</span> ${T('козырь')}`;
        if (tb.dataset.html !== html) { tb.dataset.html = html; tb.innerHTML = html; tb.classList.toggle('notrump', v.trump === null); }
      }
      // Заказы против карт: сколько заявлено всего при k картах в руке. Перебор — кто-то точно не доберёт.
      const bm = $('#bids-meter', this.el);
      if (bm) {
        const k = v.plan[v.roundIdx];
        const made = v.bids.filter(b => b !== null);
        const sum = made.reduce((a, b) => a + b, 0);
        const all = made.length === v.n;
        const cls = sum > k ? 'over' : sum === k ? 'exact' : 'under';
        const note = !made.length ? T('ждём заявки') : sum > k ? T('перебор +{d}', { d: sum - k }) : sum === k ? T('ровно') : T('недобор −{d}', { d: k - sum });
        const key = `${sum}/${k}/${made.length}/${cls}`;
        if (bm.dataset.key !== key) {
          const grew = bm.dataset.sum != null && +bm.dataset.sum !== sum && bm.dataset.round === String(v.roundIdx);
          bm.dataset.key = key; bm.dataset.sum = sum; bm.dataset.round = v.roundIdx;
          bm.className = `bids-meter ${cls}${all ? ' all' : ''}`;
          const fill = Math.min(1, k ? sum / k : 0), over = k ? Math.min(1, Math.max(0, sum - k) / k) : 0;
          bm.innerHTML = `<div class="bm-top"><span class="bm-l">${T('Заказы / карты')}</span><span class="bm-v"><b>${sum}</b><i>/</i>${k}</span></div>
            <div class="bm-bar"><span class="bm-fill" style="width:${(fill * 100).toFixed(1)}%"></span><span class="bm-over" style="width:${(over * 100).toFixed(1)}%"></span></div>
            <div class="bm-note">${note}${!all && made.length ? ` · ${T('заявили {a} из {b}', { a: made.length, b: v.n })}` : ''}</div>`;
          if (grew) popEl(bm.querySelector('.bm-v b'));
          if (grew && cls === 'over') { bm.classList.remove('flash'); void bm.offsetWidth; bm.classList.add('flash'); }
        }
      }
    },

    updateLog(v) {
      const body = $('#log-body', this.el);
      if (!body) return;
      const lines = v.log.slice(-100);
      const key = lines.join('\n');
      if (body.dataset.key === key) return;
      body.dataset.key = key;
      if (!body.dataset.wired) {
        body.dataset.wired = '1';
        const sync = () => {
          const away = body.scrollTop < -6; // column-reverse: 0 — самый низ (новые записи)
          body.classList.toggle('away', away);
          const j = $('#log-jump', this.el); if (j) j.classList.toggle('on', away);
          if (!away && j) j.classList.remove('fresh');
        };
        body.addEventListener('scroll', sync, { passive: true });
        this.logSync = sync;
      }
      // Сколько записей новых: ищем прошлую последнюю строку с конца.
      const prevLast = this.logLast, prevLen = this.logLen || 0;
      let fresh = lines.length;
      if (prevLast != null) { const i = lines.lastIndexOf(prevLast); fresh = i >= 0 ? lines.length - 1 - i : Math.min(lines.length, Math.max(1, lines.length - prevLen)); }
      this.logLast = lines[lines.length - 1]; this.logLen = lines.length;
      const away = body.scrollTop < -6, oldTop = body.scrollTop, oldH = body.scrollHeight;
      const myName = v.names[v.you];
      body.innerHTML = lines.slice().reverse().map((l, i) => `<div class="${/ОБМАН|проверяет|время вышло|Пересдач/.test(l) ? 'hot' : l.startsWith(myName) ? 'mine' : ''}${i < fresh ? ' new' : ''}">${colorNames(I18N.trLog(l), v.names)}</div>`).join('');
      // Если игрок листает историю — не сбиваем ему место, а только подсвечиваем кнопку «к новым».
      if (away) { body.scrollTop = oldTop - (body.scrollHeight - oldH); const j = $('#log-jump', this.el); if (j && fresh) j.classList.add('fresh'); }
      else body.scrollTop = 0;
      if (this.logSync) this.logSync();
    },

    buildSeats(v) {
      const tw = $('#table-wrap', this.el);
      renderTable(tw, Array.from({ length: v.n }, (_, p) => SPOT_ANGLE[spotOf(v, p)]));
      this.neonDeg = null; this.puckDeg = null; this.puckK = null; this.puckIn = null; this.puckAnim = false; this.ballLast = null; this.ballTrail = []; this.sideCur = null; this.puckGoal = null; cancelAnimationFrame(this.puckRaf);
      this.seatsLayer.innerHTML = '';
      this.seatsLayer.className = `seats n${v.n}`;
      this.seatEls = [];
      for (let p = 0; p < v.n; p++) {
        if (p === v.you) { this.seatEls.push(null); continue; }
        const spot = spotOf(v, p);
        const el = document.createElement('div');
        el.className = `seat spot-${spot}`;
        const fanSide = spot === 'right' || spot === 'tr' ? 'l' : 'r';
        el.innerHTML = `<div class="chair" style="--chair-rot:${CHAIR_ROT[spot] || 0}deg">${roomSkin() ? roomSkin().chair(spot) : chairSvg()}</div>
          <div class="ava"><div class="ring"></div><span class="ini"></span></div>
          <div class="plate"><div class="line1"><span class="nm"></span><span class="sc">0</span></div><div class="pips"></div></div>
          <div class="fan ${fanSide}"></div><div class="xtra"></div>`;
        this.seatsLayer.appendChild(el);
        this.seatEls.push(el);
      }
    },

    // Взятка засчитывается на табло, только когда карты долетели до аватара победителя.
    tookShown(v, p) {
      return v.took[p] - (v.phase === 'trickDone' && v.trickWinner === p && v.trick && v.trick.plays.length ? 1 : 0);
    },
    pipsHtml(v, p, prev, fresh) {
      const bid = v.bids[p], took = this.tookShown(v, p);
      const same = prev && prev.roundIdx === v.roundIdx;
      const pt = same ? this.tookShown(prev, p) : 0;
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
        setAvaPic(ava, s.pic);
        markAvatar(ava, v, p);
        el.querySelector('.nm').textContent = s.name; el.style.setProperty('--pc', nameColor(p));
        setScore(el.querySelector('.sc'), this.shown ? this.shown[p] : v.scores[p], !!prev);
        const bid = v.bids[p];
        const pb = prev && prev.roundIdx === v.roundIdx ? prev.bids[p] : null;
        const tag = bid === null ? `<span class="bidtag wait">${T(v.phase === 'bid' && v.turn === p ? 'думает…' : 'заявка —')}</span>`
          : `<span class="bidtag ${pb === null && !fresh ? 'pop' : ''}">${T('{a} из {b}', { a: this.tookShown(v, p), b: bid })}</span>`;
        el.querySelector('.pips').innerHTML = tag + this.pipsHtml(v, p, prev, fresh);
        if (pb === null && bid !== null && !fresh && prev) SFX.chip();
        if (!this.dealing) this.renderFan(p, v.handCounts[p]);
        let x = '';
        // Вылетел: за него ходит бот, отсчёт до потери места; голосовать за замену — через 20 с.
        const at = v._at || Date.now();
        if (!s.bot && !s.online) x += `<span class="tag off" data-until="${s.keepLeft ? at + s.keepLeft : 0}">${T('вылетел')}${s.keepLeft ? ` · <b class="cd"></b>` : ''}</span>`;
        if (!s.bot && !s.online && !v.vote && v.phase !== 'gameOver') x += `<button class="btn-ghost vote-btn" data-act="voteKick" data-seat="${p}" data-open="${s.voteIn ? at + s.voteIn : 0}">${T('Заменить ботом')}</button>`;
        el.querySelector('.xtra').innerHTML = x;
      }
      this.tickAway();
    },

    updateMe(v, prev) {
      const box = $('#me-panel', this.el);
      const me = v.you, bid = v.bids[me], took = this.tookShown(v, me);
      const playing = (v.phase === 'bid' || v.phase === 'play') && !v.paused;
      box.classList.toggle('turn', playing && v.turn === me);
      if (!box.firstChild) {
        box.innerHTML = `<div class="ava"><div class="ring"></div><span class="ini"></span></div>
          <div class="me-id"><div class="nm"></div><div class="sc">0</div></div>
          <div class="me-counters"><div><b class="b1">—</b><span>${T('заявка')}</span></div><div><b class="b2">0</b><span>${T('взял')}</span></div></div>
          <div class="me-right"><div class="pips"></div></div>`;
      }
      box.querySelector('.ini').textContent = initial(v.names[me]);
      box.querySelector('.nm').textContent = v.names[me]; box.style.setProperty('--pc', nameColor(me));
      const ava = box.querySelector('.ava');
      setAvaPic(ava, v.seats[me] && v.seats[me].pic);
      markAvatar(ava, v, me);
      setScore(box.querySelector('.sc'), this.shown ? this.shown[me] : v.scores[me], !!prev);
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
      this.darkHand = !!v.handHidden; // «Тёмная»: свои карты лежат рубашкой вверх до конца заявок
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
        els.forEach((el, i) => { el.style.opacity = ''; if (!v.handHidden) el.classList.remove('down'); place(el, handXY(i, els.length, d)); });
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
      if (!v.handHidden) {
        els.forEach((el, i) => setTimeout(() => { el.classList.remove('down'); el.classList.add('shine'); SFX.flick(); }, i * 55));
        await wait(els.length * 55 + 420);
      }
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
        SFX.caught(); banner(T('ВРЁШЬ!'), 'crimson'); vibrate([50, 40, 80]); this.neonFlash('neon-red', 1400);
        this.transferPoints(lc.target, lc.by, lc.delta);
        if (o) {
          this.table.delete(lc.cardId);
          await wait(450);
          o.el.classList.remove('winner');
          o.el.classList.add('down');
          if (lc.target === v.you) { await fly(o.el, { x: tx + 60, y: VIEW.h + 40, rot: 0, s: 1 }, { dur: 520 }); }
          else await fly(o.el, { x: tx, y: ty, rot: rnd(-30, 30), s: 0.35 }, { dur: 520 });
          o.el.remove();
        }
      } else {
        SFX.honest(); banner(T('ЧЕСТНО!'), 'gold'); vibrate(30);
        if (lc.reward) { this.transferPoints(lc.by, lc.target, lc.reward); if (lc.delta > lc.reward) this.transferPoints(lc.by, null, lc.delta - lc.reward); }
        else this.transferPoints(lc.by, null, lc.delta);
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
      if (!v.trick) { this.markLead(v); return; }
      for (const pl of v.trick.plays) {
        const o = this.table.get(pl.card.id);
        if (o) { if (pl.checked && !o.el.querySelector('.seal') && v.bluff) o.el.insertAdjacentHTML('beforeend', '<span class="seal">✓</span>'); continue; }
        await this.playIn(pl, v, fast);
      }
      this.markLead(v);
      if (v.phase === 'trickDone' && v.trick) {
        const w = v.trick.plays.find(pl => pl.p === v.trickWinner);
        const o = w && this.table.get(w.card.id);
        if (o && !o.el.classList.contains('winner')) {
          o.el.classList.add('winner');
          if (!fast) { FX.sparkleAt(o.el._p.x, o.el._p.y); SFX.chime(2, 'club'); }
        }
      }
    },

    // Первая карта взятки — белая подсветка; на столе — масть хода («Ход: ♠ пики»).
    markLead(v) {
      const first = v.trick && v.trick.plays[0];
      for (const [id, o] of this.table) o.el.classList.toggle('lead-card', !!first && id === first.card.id);
      let box = $('#lead-suit', this.el);
      if (!box) { box = document.createElement('div'); box.id = 'lead-suit'; box.className = 'lead-suit'; $('.table-wrap', this.el).insertAdjacentElement('afterend', box); }
      const suit = first ? first.card.suit : null;
      const key = suit ? `${suit}|${v.trick.command ? 'c' : ''}|${v.trump || ''}` : '';
      if (box.dataset.key === key) { this.placeLeadBox(); return; }
      box.dataset.key = key;
      if (!suit) { box.classList.remove('on'); return; }
      const name = { '♠': 'пики', '♣': 'трефы', '♦': 'бубны', '♥': 'червы' }[suit];
      const cmd = v.trick.command;
      box.className = `lead-suit on s-${{ '♠': 's', '♣': 'c', '♦': 'd', '♥': 'h' }[suit]}`;
      box.innerHTML = cmd ? `<span class="ls-l">${T('Ход')}</span><b>${T('Старшие на стол!')}</b>`
        : `<span class="ls-l">${T('Ход')}</span><i>${suit}</i><b>${T(name)}</b>${suit === v.trump ? `<span class="ls-t">${T('козырь')}</span>` : ''}`;
      this.placeLeadBox();
      const ty = box.dataset.ty;
      box.animate([{ transform: `translate(-50%,${ty}) scale(.7)`, opacity: 0 }, { transform: `translate(-50%,${ty}) scale(1)`, opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    },
    // Плашка «Ход: ♠ пики» висит над картой первого хода (под ней — если карта в верхней половине стола, чтобы не залезать на соперника).
    placeLeadBox() {
      const box = $('#lead-suit', this.el);
      if (!box) return;
      let o = null;
      for (const t of this.table.values()) if (t.lead) { o = t; break; }
      if (!o || !o.el._p) return;
      const d = dims(), p = o.el._p, h = d.ch * p.s / 2 + 8;
      const below = p.y < d.cy - d.ch * 0.05;
      box.dataset.ty = below ? '0%' : '-100%';
      box.style.left = p.x + 'px';
      box.style.top = (below ? p.y + h : p.y - h) + 'px';
      box.style.transform = `translate(-50%,${box.dataset.ty})`;
    },

    async playIn(pl, v, fast) {
      const d = dims();
      const spot = spotOf(v, pl.p);
      const lead = !!(v.trick && v.trick.plays[0] && v.trick.plays[0].card.id === pl.card.id);
      const [sx, sy] = slotXY(spot, d, v.n, lead);
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
      this.table.set(pl.card.id, { el, p: pl.p, spot, lead });
      el.style.zIndex = 40 + order;
      el.dataset.spot = spot;
      const target = { x: sx, y: sy, rot: lead ? rot * 0.4 : rot, s: TABLE_SCALE * (lead ? LEAD_SCALE : 1) };
      if (fast) {
        el.classList.remove('down'); el.className += ' ' + auraCls(info);
        place(el, target); el.style.zIndex = lead ? 30 : 10 + order;
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
      el.style.zIndex = lead ? 30 : 10 + order;
      this.impact(el, sx, sy, info, pl.mode);
    },

    impact(el, x, y, info, mode) {
      FX.cardImpact(x, y, info);
      SFX.impact(info);
      if (info.kind === 'legend') { banner(T(mode === 'command' ? 'СТАРШИЕ НА СТОЛ!' : 'САМАЯ СТАРШАЯ!'), 'violet'); vibrate([40, 30, 120]); this.neonFlash('neon-legend', 2200); }
      else if (info.kind === 'heart' && info.level >= 6) this.neonFlash('neon-red', 900);
      else if (info.kind === 'heart' && info.level >= 8) { banner(T('ТУЗ КОЗЫРЕЙ!'), 'crimson'); vibrate(70); }
      else if (info.level >= 8) vibrate(30);
      const p = el._p;
      const squash = info.big ? 1.18 : 1.08;
      el.animate([{ transform: tf({ ...p, s: p.s * squash }) }, { transform: tf({ ...p, s: p.s * 0.96 }) }, { transform: tf(p) }], { duration: 260, easing: 'ease-out' });
    },

    syncHand(v) {
      const d = dims();
      const ids = v.hand.map(c => c.id);
      for (const [id, el] of this.hand) if (!ids.includes(id)) { el.remove(); this.hand.delete(id); }
      if (this.queued && !ids.includes(this.queued)) this.queued = null;
      const myPlay = v.phase === 'play' && v.turn === v.you && !v.paused;
      if (!myPlay || !v.legal.includes(this.sel)) this.sel = null;
      if (!myPlay) this.closeSpecial();
      const honest = new Set(v.honest || v.legal);
      if (this.hover && !ids.includes(this.hover)) this.hover = null;
      const focusId = this.sel || this.hover;
      const focusIdx = focusId ? ids.indexOf(focusId) : -1;
      v.hand.forEach((c, i) => {
        let el = this.hand.get(c.id);
        if (!el) {
          el = makeCard(this.cardsLayer, c, !c.hidden);
          el.classList.add('inhand');
          place(el, { ...handXY(i, ids.length, d), y: d.H + d.ch });
          this.hand.set(c.id, el);
        }
        const legal = myPlay && v.legal.includes(c.id);
        el.classList.toggle('legal', legal && honest.has(c.id));
        el.classList.toggle('bluffy', legal && !honest.has(c.id));
        el.classList.toggle('illegal', myPlay && !legal);
        el.classList.toggle('sel', this.sel === c.id);
        el.classList.toggle('queued', this.queued === c.id);
        el.style.zIndex = (c.id === focusId ? 200 : 100) + i;
        const to = handXY(i, ids.length, d, this.sel === c.id, focusIdx, focusId === this.hover && !this.sel);
        const cur = el._p || {};
        if (cur.x !== to.x || cur.y !== to.y || cur.rot !== to.rot || cur.s !== to.s) place(el, to);
      });
    },

    relayout(v) {
      const d = dims();
      for (const o of this.table.values()) { const [x, y] = slotXY(o.spot, d, v.n, o.lead); place(o.el, { ...o.el._p, x, y }); }
      this.placeLeadBox();
      this.syncHand(v);
      this.updateChecks(v);
    },

    // Кнопки умений (пока одно — «Пересдача»): готово / сейчас нельзя / использовано.
    updateSkills(v) {
      const bar = $('#skills-bar', this.el);
      if (!bar) return;
      if (!v.skills) { if (bar.innerHTML) bar.innerHTML = ''; return; }
      const sk = v.skills.reshuffle;
      let b = bar.querySelector('.skill-btn');
      if (!b) {
        bar.innerHTML = `<button class="skill-btn" data-act="skill" data-skill="reshuffle" title="${T('Пересдача: все карты всех игроков перетасовать и раздать заново. Только перед заявками, один раз за партию.')}">
          <span class="sk-ring"></span><span class="sk-ico">${shuffleSvg()}</span><span class="sk-lock">🔒</span>
          <span class="sk-name">${T('Пересдача')}</span><span class="sk-arm">${T('Нажмите ещё раз')}</span></button>`;
        b = bar.querySelector('.skill-btn');
      }
      const state = !sk.left ? 'used' : sk.can ? 'ready' : 'idle';
      // Во время розыгрыша пересдача невозможна — кнопка прячется и не закрывает край руки.
      // Кнопка видна только в окне перед заявками и не во время раздачи.
      const busy = !!this.dealing || !!this.intro;
      bar.classList.toggle('off', v.phase !== 'pre' || busy || !!v.paused);
      bar.classList.toggle('window', v.phase === 'pre' && state === 'ready' && !busy);
      if (!b.querySelector('.sk-count')) b.insertAdjacentHTML('beforeend', '<span class="sk-count"></span>');
      if (b.dataset.state !== state) {
        const wasReady = b.dataset.state === 'idle' && state === 'ready';
        b.dataset.state = state;
        if (state !== 'ready') b.classList.remove('armed');
        if (wasReady) popEl(b, 'sk-pop');
      }
    },

    // Окно пересдачи открылось (раздача закончилась): привлекаем внимание — у кого умение есть, тем крупно.
    openPreWindow(v, fast) {
      const key = v.phase === 'pre' && v.pre && !v.pre.after ? `${v.roundIdx}:${v.reshuffle ? v.reshuffle.seq : 0}` : null;
      if (!key || this.preShown === key || this.dealing || this.intro) { this.updateSkills(v); return; }
      this.preShown = key;
      this.updateSkills(v);
      if (fast || v.paused) return;
      const mine = v.skills && v.skills.reshuffle.can;
      if (mine) {
        banner(T('ПЕРЕСДАЧА?'), 'violet', true, T('Не нравятся карты? Есть {s} секунд', { s: Math.round(((v.pre && v.pre.window) || 5000) / 1000) }), { hold: 1500 });
        this.neonFlash('neon-legend', 1600);
        SFX.chip(); vibrate([20, 30, 20]);
        const b = $('#skills-bar .skill-btn', this.el);
        if (b) { const [x, y] = VIEW.center(b); FX.ring(x, y, { r1: 90, color: '#c9a2ff', width: 3, life: 0.6 }); FX.ring(x, y, { r1: 140, color: '#f6d27a', width: 2, life: 0.8, delay: 0.15 }); }
      }
      this.updateStatus(v);
    },
    preLeft(v) { return v.phase === 'pre' && v.pre ? Math.max(0, v.pre.left - (Date.now() - v._at)) : 0; },

    // «Тёмная»: заявки сделаны — рубашки переворачиваются, под ними настоящие карты.
    async revealDark(v, fast) {
      this.darkHand = false;
      const old = [...this.hand.values()];
      this.hand.clear();
      const d = dims();
      v.hand.forEach((c, i) => {
        let el = old[i];
        if (!el) { el = makeCard(this.cardsLayer, c, false); el.classList.add('inhand'); place(el, handXY(i, v.hand.length, d)); }
        el.dataset.id = c.id;
        el.querySelector('.front').style.backgroundImage = Cards.url(c);
        this.hand.set(c.id, el);
      });
      old.slice(v.hand.length).forEach(el => el.remove());
      const els = [...this.hand.values()];
      if (fast) { els.forEach(el => el.classList.remove('down')); return; }
      banner(T('КАРТЫ ОТКРЫТЫ'), 'violet', false);
      const [cx, cy] = [d.cx, d.H - d.ch * 0.6];
      FX.ring(cx, cy, { r1: 220, color: '#9b6bff', width: 3, life: 0.6 });
      els.forEach((el, i) => setTimeout(() => { el.classList.remove('down'); el.classList.add('shine'); SFX.flick(); }, 120 + i * 70));
      await wait(120 + els.length * 70 + 420);
      els.forEach(el => el.classList.remove('shine'));
    },

    // Пересдача: все карты слетаются в центр, колода тасуется вихрем и раздаётся заново.
    async reshuffleFx(v) {
      const rs = v.reshuffle;
      const d = dims();
      const cx = d.cx, cy = d.cy;
      this.closeSpecial();
      const box = $('#action', this.el); if (box.dataset.kind) { box.dataset.kind = ''; box.innerHTML = ''; }
      const who = rs.by === v.you ? T('Вы') : v.names[rs.by];
      banner(T('ПЕРЕСДАЧА!'), 'violet', false, who, { hold: 1500 });
      SFX.reshuffle(); vibrate([30, 40, 30, 40, 60]);
      this.neonFlash('neon-legend', 2200);
      // Вспышка у того, кто применил.
      const [bx, by] = this.seatCenter(rs.by);
      FX.ring(bx, by, { r1: 120, color: '#c9a2ff', width: 4, life: 0.7 });
      FX.burst(bx, by, { n: 30, colors: FX.GOLD, speed: [120, 320], size: [1.5, 3], g: 0, life: [0.4, 0.8] });
      FX.trail(bx, by, cx, cy);
      const pile = [];
      // Свои карты — рубашкой вверх в центр.
      for (const el of this.hand.values()) { el.classList.remove('inhand', 'legal', 'illegal', 'sel', 'bluffy', 'boom'); el.classList.add('down'); pile.push(el); }
      this.hand.clear(); this.sel = null; this.queued = null;
      const jobs = pile.map((el, i) => wait(i * 40).then(() => fly(el, { x: cx + rnd(-8, 8), y: cy + rnd(-8, 8), rot: rnd(-20, 20), s: 0.75 }, { dur: 480, ease: 'cubic-bezier(.55,0,.4,1)' })));
      // Карты соперников — из их вееров.
      this.dealing = true;
      for (let p = 0; p < v.n; p++) {
        if (p === v.you || !this.seatEls[p]) continue;
        const fan = this.seatEls[p].querySelector('.fan');
        const cnt = Math.max(0, +fan.dataset.n || 0);
        const [sx, sy] = this.seatCenter(p);
        for (let i = 0; i < cnt; i++) {
          const el = makeCard(this.cardsLayer, null, false);
          place(el, { x: sx, y: sy, rot: rnd(-30, 30), s: 0.4 });
          pile.push(el);
          jobs.push(wait(i * 45 + 60).then(() => { if (fan.lastElementChild) fan.lastElementChild.remove(); fan.dataset.n = fan.children.length; return fly(el, { x: cx + rnd(-8, 8), y: cy + rnd(-8, 8), rot: rnd(-20, 20), s: 0.75 }, { dur: 480, ease: 'cubic-bezier(.55,0,.4,1)' }); }));
        }
      }
      await Promise.all(jobs);
      FX.vortex(cx, cy, { n: 46, r: 110, colors: FX.GOLD });
      FX.ring(cx, cy, { r1: 160, color: '#f6d27a', width: 3, life: 0.6 });
      // Тасовка: колода дважды делится на две половины и сходится «врезкой».
      const deck = pile.slice(-Math.min(pile.length, 14));
      pile.filter(el => !deck.includes(el)).forEach(el => el.remove());
      deck.forEach((el, i) => { el.style.zIndex = 60 + i; place(el, { x: cx, y: cy - i * 0.8, rot: 0, s: 0.75 }); });
      const off = d.cw * 0.62;
      for (let k = 0; k < 2; k++) {
        await Promise.all(deck.map((el, i) => fly(el, { x: cx + (i % 2 ? off : -off), y: cy - 6 - i * 0.6, rot: i % 2 ? 9 : -9, s: 0.75 }, { dur: 230, ease: 'cubic-bezier(.3,.8,.3,1)' })));
        await Promise.all(deck.map((el, i) => wait(i * 22).then(() => { if (i % 3 === 0) SFX.deal(); el.style.zIndex = 60 + ((i * 7) % deck.length); return fly(el, { x: cx, y: cy - i * 0.8, rot: rnd(-3, 3), s: 0.75 }, { dur: 200, via: { x: cx + (i % 2 ? off : -off) * 0.4, y: cy - d.ch * 0.25, rot: i % 2 ? 25 : -25, s: 0.8, offset: 0.5 } }); })));
        FX.sparkleAt(cx, cy);
      }
      FX.burst(cx, cy, { n: 40, colors: FX.GOLD, speed: [150, 450], size: [1.5, 3], g: 80, life: [0.5, 1] });
      FX.shake(4, 0.25);
      await wait(150);
      deck.forEach(el => el.remove());
      this.dealing = false;
      await this.deal(v, false);
    },

    // Объявление раунда: на весь экран, с ударом, лучами и гонгом.
    // «Боря · ЗАКАЗ: 2 ВЗЯТКИ!» по центру → уменьшается и летит в аватар. Очередь, чтобы не наслаивались; игру не задерживает.
    announceBid(v, p, b) {
      const name = v.names[p] || '';
      const tricks = I18N.lang === 'en' ? (b === 1 ? 'TRICK' : 'TRICKS') : plural(b, 'ВЗЯТКУ', 'ВЗЯТКИ', 'ВЗЯТОК');
      this.bidPending = (this.bidPending || 0) + 1;
      const run = async () => {
        const rush = this.bidPending > 1; // очередь копится — показываем быстрее, чтобы не отставать от игры
        try {
        if (!this.el || !this.el.isConnected) return;
        const box = document.createElement('div');
        box.className = 'bid-ann' + (p === v.you ? ' me' : '') + (b === 0 ? ' zero' : '');
        box.style.setProperty('--pc', nameColor(p));
        box.innerHTML = `<div class="ba-name">${esc(name)}</div><div class="ba-line">${T('заказ')}: <b>${b}</b> ${b === 0 ? T('— ни одной!') : tricks + '!'}</div>`;
        $('#app').appendChild(box);
        const cx = VIEW.w / 2, cy = VIEW.h * 0.4;
        box.style.left = cx + 'px'; box.style.top = cy + 'px';
        SFX.chip && SFX.chip();
        const pop = box.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
        await pop.finished.catch(() => {});
        await wait(rush ? 120 : 1420); // держим на секунду дольше; если копится очередь — быстрее
        const [ax, ay] = this.seatCenter(p);
        const go = box.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1, left: cx + 'px', top: cy + 'px' },
          { transform: 'translate(-50%,-50%) scale(.18)', opacity: 0.2, left: ax + 'px', top: ay + 'px' }], { duration: rush ? 300 : 420, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
        await go.finished.catch(() => {});
        box.remove();
        FX.ring(ax, ay, { r1: 46, color: nameColor(p), width: 3, life: 0.45 });
        const tag = p === v.you ? $('#me-panel .bidtag', this.el) : this.seatEls[p] && this.seatEls[p].querySelector('.bidtag');
        if (tag) popEl(tag);
        } finally { this.bidPending--; }
      };
      this.bidQ = (this.bidQ || Promise.resolve()).then(run, run);
    },

    async announceRound(v) {
      const n = v.roundIdx + 1, total = v.plan.length, k = v.plan[v.roundIdx];
      const peak = Math.max(...v.plan);
      const special = v.mode === 'notrump' ? 'notrump' : v.mode === 'dark' ? 'dark' : '';
      const tag = T(special === 'notrump' ? 'БЕСКОЗЫРКА' : special === 'dark' ? 'ТЁМНАЯ' : n === total ? 'ФИНАЛЬНЫЙ РАУНД' : n === 1 ? 'ИГРА НАЧИНАЕТСЯ' : k === peak && v.plan[v.roundIdx - 1] !== peak ? 'ПИК ПАРТИИ' : '');
      const note = special === 'notrump' ? T('Червы — не козырь. Берёт старшая карта масти') : special === 'dark' ? T('Заявка вслепую — карты откроются после заявок. Очки ×2') : '';
      const dbl = v.double ? `<div class="an-double">${T('ДВОЙНЫЕ ОЧКИ')} <b>×${v.mult || 2}</b></div><div class="an-note">${T('Все очки раунда — и плюсы, и минусы — удваиваются')}</div>` : '';
      const a = $('#announce');
      a.innerHTML = `<div class="an-back"></div><div class="an-box">
        ${tag ? `<div class="an-tag">${tag}</div>` : ''}
        <div class="an-title"><span>${T('РАУНД')}</span> <b>${n}</b></div>
        <div class="an-sub">${T('{c} · {n} из {t}', { c: poCards(k), n, t: total })}</div>
        ${note ? `<div class="an-note">${note}</div>` : ''}
        ${dbl}
        <div class="an-line"></div></div>`;
      a.className = 'on' + (n === total ? ' final' : '') + (special ? ' ' + special : '') + (v.double ? ' double' : '');
      const cx = VIEW.w / 2, cy = VIEW.h * 0.45;
      SFX.roundGong(n === total);
      setTimeout(() => {
        FX.ring(cx, cy, { r1: Math.max(VIEW.w, VIEW.h) * 0.6, color: '#f6d27a', width: 5, life: 0.8 });
        FX.raysAt(cx, cy, { count: 16, len: Math.max(VIEW.w, VIEW.h) * 0.7, color: 'rgba(246,210,122,1)', life: 1.3, a: 0.3, spin: 0.6, force: true });
        FX.burst(cx, cy, { n: 50, colors: FX.GOLD, speed: [200, 600], size: [1.5, 3], g: 120, life: [0.6, 1.2] });
        if (special) { FX.ring(cx, cy, { r1: 300, color: special === 'dark' ? '#9b6bff' : '#7fd7ff', width: 4, delay: 0.1 }); FX.shake(6, 0.35); }
        else if (n === total) { FX.ring(cx, cy, { r1: 260, color: '#ff4d5e', width: 4, delay: 0.1 }); FX.shake(8, 0.4); }
        else FX.shake(4, 0.25);
      }, 260);
      if (v.double) setTimeout(() => { FX.ring(cx, cy + 60, { r1: 220, color: '#ffd25e', width: 4 }); SFX.chip && SFX.chip(); }, 700);
      await wait((special || v.double ? 2400 : 1500) + 1500); // объявление держится дольше; особый/двойной раунд — ещё дольше
      a.classList.add('out');
      await wait(380);
      a.className = '';
      a.innerHTML = '';
    },

    // Смена лидера: корона летит от прежнего лидера к новому, взрыв золота; прежний — «теряет корону».
    async leaderChange(v, oldKey, now, fast) {
      const old = oldKey ? oldKey.split(',').map(Number) : [];
      if (fast || now.length !== 1 || old.includes(now[0])) { this.crownSet = now; this.paintCrowns(v); return; }
      const winner = now[0];
      const lost = old.filter(p => !now.includes(p));
      const [wx, wy] = this.seatCenter(winner);
      // Корона снимается с прежнего лидера в момент вылета и садится на нового только по прилёте.
      this.crownSet = now.filter(p => p !== winner); this.paintCrowns(v);
      const fly = document.createElement('div');
      fly.className = 'crown-fly';
      fly.innerHTML = crownSvg();
      $('#app').appendChild(fly);
      let from = [VIEW.w / 2, -60];
      if (lost.length) {
        const [lx, ly] = this.seatCenter(lost[0]);
        from = [lx, ly - 30];
        lost.forEach(p => {
          const av = p === v.you ? $('#me-panel .ava', this.el) : this.seatEls[p] && this.seatEls[p].querySelector('.ava');
          if (av) { av.classList.remove('lost'); void av.offsetWidth; av.classList.add('lost'); }
          const [x, y] = this.seatCenter(p);
          FX.burst(x, y - 26, { n: 18, type: 'dust', colors: ['#8a8a92'], speed: [30, 100], g: 60, life: [0.8, 1.3], size: [14, 24], size2: 1.6 });
          FX.burst(x, y - 26, { n: 10, type: 'shard', colors: ['#d4a541', '#8a6420'], speed: [80, 200], g: 420, life: [0.7, 1.1], size: [4, 7] });
        });
        SFX.leaderLose();
      }
      const a = fly.animate([
        { transform: `translate(${from[0]}px, ${from[1]}px) translate(-50%,-50%) scale(1.4) rotate(0deg)`, opacity: lost.length ? 1 : 0 },
        { transform: `translate(${(from[0] + wx) / 2}px, ${Math.min(from[1], wy) - 120}px) translate(-50%,-50%) scale(3.2) rotate(360deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${wx}px, ${wy - 34}px) translate(-50%,-50%) scale(1.1) rotate(720deg)`, opacity: 1 },
      ], { duration: 1100, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      await a.finished.catch(() => {});
      fly.remove();
      this.crownSet = now; this.paintCrowns(v);
      FX.ring(wx, wy, { r1: 160, color: '#f6d27a', width: 6 });
      FX.ring(wx, wy, { r1: 90, color: '#fff3c4', width: 3, delay: 0.1 });
      FX.raysAt(wx, wy, { count: 14, len: 260, color: 'rgba(246,210,122,1)', life: 1.2, a: 0.45, spin: 1, force: true });
      FX.burst(wx, wy, { n: 60, colors: FX.GOLD, speed: [160, 520], size: [1.5, 3], g: 160, life: [0.7, 1.3] });
      FX.burst(wx, wy, { n: 12, type: 'glyph', glyphs: ['♛', '★'], colors: FX.GOLD, speed: [120, 300], g: 120, life: [1, 1.5], size: [16, 26] });
      FX.shake(6, 0.35);
      SFX.leaderWin();
      vibrate(winner === v.you ? [40, 30, 80] : 20);
      banner(T(winner === v.you ? 'ТЫ ЛИДЕР!' : 'НОВЫЙ ЛИДЕР'), 'gold', false, v.names[winner]);
      await wait(1300);
    },

    // Переход очков: золотые монеты летят по дуге от проигравшего к победителю.
    // to = null — очки сгорают (ошибочная проверка): монеты улетают в центр стола и рассыпаются.
    transferPoints(from, to, amount) {
      const [x1, y1] = this.seatCenter(from);
      const d = dims();
      const [x2, y2] = to == null ? [d.cx, d.cy] : this.seatCenter(to);
      floater(x1, y1 - 30, -amount);
      // Показанный счёт: у отдающего тает сразу, у получающего растёт по прилёте монет; корона — после.
      if (this.shown) { this.scoreAnims++; this.setShown(from, this.shown[from] - amount); }
      const avFrom = from === S.view.you ? $('#me-panel .ava', this.el) : this.seatEls[from] && this.seatEls[from].querySelector('.ava');
      if (avFrom) { avFrom.classList.remove('drain'); void avFrom.offsetWidth; avFrom.classList.add('drain'); setTimeout(() => avFrom.classList.remove('drain'), 1200); }
      FX.burst(x1, y1, { n: 14, colors: ['#ff4d5e', '#ffc08a'], speed: [60, 160], size: [1.5, 2.5], g: 0, life: [0.3, 0.6] });
      const n = Math.min(14, 4 + Math.round(amount / 5));
      const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 90 - Math.abs(x2 - x1) * 0.08;
      const tag = document.createElement('div');
      tag.className = 'coin-tag';
      tag.textContent = (to == null ? '−' : '+') + amount;
      $('#app').appendChild(tag);
      tag.animate([
        { transform: `translate(${x1}px, ${y1 - 20}px) translate(-50%,-50%) scale(.6)`, opacity: 0 },
        { transform: `translate(${mx}px, ${my - 20}px) translate(-50%,-50%) scale(1.4)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${x2}px, ${y2 - 34}px) translate(-50%,-50%) scale(1)`, opacity: to == null ? 0 : 1 },
      ], { duration: 1000, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(() => setTimeout(() => tag.remove(), 400)).catch(() => tag.remove());
      SFX.coinsFly(n);
      for (let i = 0; i < n; i++) {
        const c = document.createElement('div');
        c.className = 'coin-fly';
        $('#app').appendChild(c);
        const jx = rnd(-40, 40), jy = rnd(-30, 30);
        const a = c.animate([
          { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.5) rotateY(0deg)`, opacity: 0 },
          { transform: `translate(${mx + jx}px, ${my + jy}px) translate(-50%,-50%) scale(1.2) rotateY(540deg)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x2 + rnd(-8, 8)}px, ${y2 + rnd(-8, 8)}px) translate(-50%,-50%) scale(${to == null ? 0.2 : 0.8}) rotateY(1080deg)`, opacity: to == null ? 0 : 1 },
        ], { duration: 820 + i * 22, delay: 120 + i * 55, easing: 'cubic-bezier(.45,.05,.55,1)', fill: 'forwards' });
        a.finished.then(() => {
          c.remove();
          if (to == null) FX.burst(x2 + rnd(-10, 10), y2 + rnd(-10, 10), { n: 4, type: 'dust', colors: ['#8a6a3a'], speed: [20, 60], g: -30, life: [0.5, 0.8], size: [10, 16], size2: 1.4 });
          else { FX.burst(x2, y2, { n: 5, colors: FX.GOLD, speed: [60, 160], size: [1.5, 2.5], g: 0, life: [0.25, 0.5] }); if (i % 2 === 0) SFX.coinHit(i); }
        }).catch(() => c.remove());
      }
      setTimeout(() => {
        if (this.shown) {
          if (to != null) this.setShown(to, this.shown[to] + amount);
          this.scoreAnims = Math.max(0, this.scoreAnims - 1);
          if (S.view) this.settleScores(S.view, false);
        }
        if (to == null) { FX.ring(x2, y2, { r1: 70, color: '#8a6a3a', width: 2 }); return; }
        FX.ring(x2, y2, { r1: 90, color: '#f6d27a', width: 4 });
        FX.raysAt(x2, y2, { count: 10, len: 140, color: 'rgba(246,210,122,1)', life: 0.7, a: 0.4, force: true });
        const av = to === S.view.you ? $('#me-panel .ava', this.el) : this.seatEls[to] && this.seatEls[to].querySelector('.ava');
        if (av) av.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        SFX.win();
      }, 120 + n * 55 + 820);
    },

    // Фишка первого хода: лежит на подстаканнике перед тем, кто ходит первым в раунде,
    // и при смене раунда катится по кругу стола по часовой стрелке к следующему игроку.
    updatePuck(v, fast) {
      const tw = $('#table-wrap', this.el);
      const puck = tw && tw.querySelector('.puck');
      if (!puck) return;
      // Солнышко — у того, кто ходит первым в текущей взятке (до первой взятки — первый ход раунда).
      const lead = v.trick && v.trick.leader != null && (v.phase === 'play' || v.phase === 'trickDone') ? v.trick.leader : v.leader;
      const target = SPOT_ANGLE[spotOf(v, lead)];
      if (target == null) return;
      const mine = lead === v.you;
      // У себя шар лежит в подстаканнике, пока его не закрывают карты руки; закрыли — отпрыгивает на свободное место рядом (сначала вправо).
      const cs = mine ? this.cupState(tw, target) : null;
      const kTo = mine ? 1.2 : 1, inTo = cs && cs.covered ? 1 : 0;
      const sideTo = cs && cs.side ? cs.side : (this.sideCur || { x: SIDE_SPOTS[0][0], y: SIDE_SPOTS[0][1] });
      if (!this.sideCur) this.sideCur = { ...sideTo };
      puck.style.display = '';
      puck.classList.toggle('mine', mine);
      if (this.puckK == null) this.puckK = kTo;
      if (this.puckIn == null) this.puckIn = inTo;
      // Шар рисуется в плоскости стола (она сжата по вертикали): компенсируем, чтобы он оставался круглым.
      const svgEl = tw.querySelector('svg.tbl');
      const br = svgEl && svgEl.getBoundingClientRect();
      const kAsp = br && br.width && br.height ? Math.min(2, Math.max(0.5, (br.width / 1000) / (br.height / 600))) : 1;
      const up = puck.querySelector('.ball-up'), spin = puck.querySelector('.ball-spin');
      const mers = puck.querySelectorAll('.ball-m'), star = puck.querySelector('.ball-star');
      const trail = tw.querySelector('.ball-trail');
      const R = 25, DS = 0.68; // DS — общий размер шара: маленький, «солнышко»
      const place = deg => {
        if (!isFinite(this.puckIn)) this.puckIn = inTo;
        if (!isFinite(this.puckK)) this.puckK = kTo;
        if (!isFinite(deg)) deg = target;
        const a = deg * Math.PI / 180, inn = Math.min(1, Math.max(0, this.puckIn));
        const sd = this.sideCur;
        const cx0 = 500 + Math.cos(a) * 408, cy0 = 300 + Math.sin(a) * 226;
        const x = cx0 + (sd.x - cx0) * inn, y = cy0 + (sd.y - cy0) * inn;
        const K = this.puckK;
        puck.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(K * DS).toFixed(3)})`);
        up.setAttribute('transform', `scale(1 ${kAsp.toFixed(3)}) translate(0 -${(R * 0.72 + (this.ballHop || 0)).toFixed(1)})`);
        // Качение: поворот рисунка шара на пройденный путь, ось — поперёк движения.
        const last = this.ballLast;
        if (last) {
          const dx = x - last.x, dy = (y - last.y) / kAsp, dist = Math.hypot(dx, dy);
          if (dist > 0.01) { this.ballDir = Math.atan2(dy, dx); this.ballRoll = (this.ballRoll || 0) + dist / (K * DS * R); }
        }
        this.ballLast = { x, y }; this.ballPlace = place;
        const ph = this.ballRoll || 0;
        spin.setAttribute('transform', `rotate(${((this.ballDir || 0) * 180 / Math.PI).toFixed(1)})`);
        mers.forEach((m, i) => {
          let psi = ph + i * Math.PI / 3; psi = ((psi + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2; // в [-90°, 90°)
          const rx = Math.abs(Math.sin(psi)) * R;
          m.setAttribute('d', rx < 0.4 ? `M 0 -${R} L 0 ${R}` : `M 0 -${R} A ${rx.toFixed(2)} ${R} 0 0 ${Math.sin(psi) > 0 ? 1 : 0} 0 ${R}`);
        });
        const sp = ((ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI / 2; // звезда на «экваторе»
        const vis = Math.cos(sp);
        star.setAttribute('transform', `translate(${(Math.sin(sp) * R * 0.92).toFixed(2)} 0) scale(${Math.max(0.01, vis).toFixed(3)} 1)`);
        star.style.opacity = vis > 0.05 ? Math.min(1, vis * 1.6).toFixed(2) : '0';
        // Светящийся след за катящимся шаром.
        if (trail) {
          const tr = this.ballTrail || (this.ballTrail = []);
          if (this.puckAnim) { tr.push({ x, y }); if (tr.length > 9) tr.shift(); } else tr.length = 0;
          trail.innerHTML = tr.slice(0, -1).map((p, i, arr) => {
            const t = (i + 1) / (arr.length + 1), r = R * K * DS * (0.45 + t * 0.5);
            return `<ellipse cx="${p.x.toFixed(1)}" cy="${(p.y - R * 0.72 * K * DS * kAsp).toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * kAsp).toFixed(1)}" fill="url(#ballTrailG)" opacity="${(t * 0.55).toFixed(2)}"/>`;
          }).join('');
        }
      };
      const goal = `${target}|${inTo}|${sideTo.x},${sideTo.y}`;
      if (this.puckAnim && this.puckGoal === goal && !fast) return; // уже едет туда
      const sameSpot = !this.puckAnim && this.puckGoal === goal;
      cancelAnimationFrame(this.puckRaf); this.puckAnim = false; this.puckTarget = target; this.puckGoal = goal;
      if (this.puckDeg == null || fast) { this.puckK = kTo; this.puckIn = inTo; this.sideCur = { ...sideTo }; this.puckDeg = target; place(target); return; }
      if (sameSpot && this.puckDeg === target) { place(target); return; }
      if (!isFinite(this.puckDeg)) this.puckDeg = target;
      if (!isFinite(this.puckIn)) this.puckIn = inTo;
      if (!isFinite(this.puckK)) this.puckK = kTo;
      let from = this.puckDeg, to = target;
      while (to <= from) to += 360; // только по часовой стрелке
      if (to - from >= 360) to -= 360;
      const kFrom = this.puckK, inFrom = this.puckIn, sideFrom = { ...this.sideCur };
      const roll = to - from >= 0.5;
      const sideMoved = Math.hypot(sideTo.x - sideFrom.x, sideTo.y - sideFrom.y) > 1 && (inFrom > 0.01 || inTo > 0.01);
      // Одно непрерывное движение: шар катится по кругу и сразу плавно сворачивает к месту остановки
      // (съезд с сукна и выезд на сукно идут одновременно с качением, без отдельных рывков).
      const tOut = 0;
      const tRoll = roll ? 800 + (to - from) * 3 : 0;
      // Без переката (у себя): прыжок из подстаканника в сторону и обратно — дугой, с подскоком.
      const hopMove = !roll && (Math.abs(inTo - inFrom) > 0.01 || sideMoved);
      const tIn = hopMove ? 520 : 0;
      const total = tRoll + tIn;
      if (!total) { this.puckK = kTo; this.puckIn = inTo; this.sideCur = { ...sideTo }; place(target); return; }
      if (roll) SFX.puck(); else if (hopMove) SFX.flick();
      const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const t0 = performance.now();
      this.puckAnim = true;
      const step = now => {
        const el = Math.max(0, now - t0); // метка кадра бывает чуть раньше старта
        let deg = from;
        if (tRoll && el < tRoll) {
          const e = ease(el / tRoll);
          deg = from + (to - from) * e;
          this.puckK = kFrom + (kTo - kFrom) * e;
          this.puckIn = inFrom + (inTo - inFrom) * e;
          this.sideCur = { x: sideFrom.x + (sideTo.x - sideFrom.x) * e, y: sideFrom.y + (sideTo.y - sideFrom.y) * e };
        } else {
          deg = to;
          this.puckK = kTo;
          const k2 = tIn ? Math.min(1, (el - tRoll) / tIn) : 1, e2 = ease(k2);
          this.puckIn = inFrom + (inTo - inFrom) * e2;
          this.sideCur = { x: sideFrom.x + (sideTo.x - sideFrom.x) * e2, y: sideFrom.y + (sideTo.y - sideFrom.y) * e2 };
          this.ballHop = hopMove ? Math.sin(k2 * Math.PI) * 22 : 0;
        }
        place(deg);
        this.puckDeg = deg % 360;
        puck.classList.toggle('moving', el < total);
        if (el < total && el > tOut && el < tOut + tRoll && now - (this.ballSparkT || 0) > 70 && FX.getQuality() > 0.6) {
          this.ballSparkT = now;
          const body = puck.querySelector(".ball-body");
          if (body) { const [bx, by] = VIEW.center(body); FX.burst(bx, by, { n: 2, speed: [20, 70], size: [1, 2.2], g: 60, life: [0.3, 0.6] }); }
        }
        if (el < total) this.puckRaf = requestAnimationFrame(step);
        else {
          this.puckAnim = false; this.puckDeg = target; this.puckK = kTo; this.puckIn = inTo; this.sideCur = { ...sideTo }; this.ballHop = 0; place(target);
          puck.classList.add('landed'); setTimeout(() => puck.classList.remove('landed'), 600);
          if (roll || hopMove) {
            // Мягкий подскок на месте — в той же системе координат, без смещения.
            const h0 = performance.now();
            const hop = t => {
              const k = Math.min(1, (t - h0) / 520);
              this.ballHop = Math.abs(Math.sin(k * Math.PI * 2)) * 9 * (1 - k);
              if (this.puckAnim || this.puckGoal !== goal) { this.ballHop = 0; return; }
              place(target);
              if (k < 1) requestAnimationFrame(hop); else this.ballHop = 0;
            };
            requestAnimationFrame(hop);
          }
          const body = puck.querySelector(".ball-body");
          if (body && (roll || hopMove)) {
            const [bx, by] = VIEW.center(body);
            FX.ring(bx, by, { r1: (roll ? 46 : 32) * kTo, color: '#f6d27a', width: 2.5, life: 0.5 });
            FX.burst(bx, by, { n: 10, speed: [60, 180], size: [1.2, 2.6], g: 160, life: [0.4, 0.8] });
          }
        }
      };
      this.puckRaf = requestAnimationFrame(step);
    },

    // Закрыт ли мой подстаканник картами руки и какое свободное место рядом (по целевым позициям карт, без ожидания анимаций).
    cupState(tw, deg) {
      const cup = tw.querySelector(`.cup[data-a="${deg}"]`);
      if (!cup) return { covered: true, side: null };
      const d = dims();
      const cards = [...this.hand.values()].map(el => el._p).filter(Boolean);
      const hit = (x, y, pad) => cards.some(p => {
        const a = -(p.rot || 0) * Math.PI / 180, s = p.s == null ? 1 : p.s;
        const dx = x - p.x, dy = y - p.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        return Math.abs(lx) < d.cw * s / 2 + pad && Math.abs(ly) < d.ch * s / 2 + pad;
      });
      const cr = VIEW.rect(cup);
      const covered = hit(cr.left + cr.width / 2, cr.top + cr.height / 2, Math.min(cr.width, cr.height) * 0.45);
      let side = null;
      for (const sp of tw.querySelectorAll('.side-spot')) {
        const r = VIEW.rect(sp);
        if (!hit(r.left + r.width / 2, r.top + r.height / 2, r.width * 0.5)) { const [x, y] = SIDE_SPOTS[+sp.dataset.i]; side = { x, y }; break; }
      }
      if (!side) side = { x: SIDE_SPOTS[0][0], y: SIDE_SPOTS[0][1] };
      return { covered, side };
    },

    // Живой неон: спокойный фиолетовый, золотая дуга бежит к тому, чей ход.
    updateNeon(v) {
      const tw = $('#table-wrap', this.el);
      if (!tw) return;
      const arc = tw.querySelector('.neon-arc'), core = tw.querySelector('.neon-arc-core');
      const active = (v.phase === 'bid' || v.phase === 'play') && !v.paused;
      const target = active ? SPOT_ANGLE[spotOf(v, v.turn)] : v.phase === 'trickDone' && v.trickWinner != null ? SPOT_ANGLE[spotOf(v, v.trickWinner)] : null;
      tw.classList.toggle('neon-mine', active && v.turn === v.you);
      tw.classList.toggle('neon-bluff', !!v.fix);
      if (target == null) { arc.setAttribute('d', ''); core.setAttribute('d', ''); this.neonDeg = null; return; }
      let from = this.neonDeg == null ? target : this.neonDeg;
      let to = target;
      while (to - from > 180) to -= 360;
      while (from - to > 180) to += 360;
      cancelAnimationFrame(this.neonRaf);
      const t0 = performance.now(), dur = 520;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        const deg = from + (to - from) * e;
        const d = neonArcPath(deg, 46 + Math.sin(k * Math.PI) * 30);
        arc.setAttribute('d', d); core.setAttribute('d', d);
        this.neonDeg = deg;
        if (k < 1) this.neonRaf = requestAnimationFrame(step);
      };
      this.neonRaf = requestAnimationFrame(step);
    },
    neonFlash(cls, ms) {
      const tw = $('#table-wrap', this.el);
      if (!tw) return;
      tw.classList.remove(cls); void tw.offsetWidth; tw.classList.add(cls);
      clearTimeout(this['nf' + cls]); this['nf' + cls] = setTimeout(() => tw.classList.remove(cls), ms);
    },
    // Перерисовать карты после смены темы колоды.
    // Смена комнаты прямо за столом: перерисовываем стол и места, состояние шара и подсветки — заново.
    refreshRoom() {
      const v = S.view, tw = this.el && $('#table-wrap', this.el);
      if (!v || !tw || !this.seatEls || this.seatEls.length !== v.n) return;
      renderTable(tw, Array.from({ length: v.n }, (_, p) => SPOT_ANGLE[spotOf(v, p)]));
      this.neonDeg = null; this.puckDeg = null; this.puckK = null; this.puckIn = null; this.puckAnim = false; this.ballLast = null; this.ballTrail = []; this.sideCur = null; this.puckGoal = null; cancelAnimationFrame(this.puckRaf);
      this.seatEls.forEach((el, p) => { const ch = el && el.querySelector('.chair'); if (ch) ch.innerHTML = roomSkin() ? roomSkin().chair(spotOf(v, p)) : chairSvg(); });
      try { this.updateNeon(v); this.updatePuck(v, true); } catch (e) { console.error(e); }
    },
    refreshFaces() {
      if (!this.el) return;
      this.el.querySelectorAll('.card').forEach(el => {
        if (el.dataset.id && !/^X\d/.test(el.dataset.id)) el.querySelector('.front').style.backgroundImage = Cards.url(Cards.parse(el.dataset.id));
        const b = el.querySelector('.back'); if (b) b.style.backgroundImage = Cards.backUrl();
      });
      this.seatEls.forEach((s, p) => { if (s) { const f = s.querySelector('.fan'); const n = +f.dataset.n; f.dataset.n = -1; this.renderFan(p, n); } });
    },

    // «БУМ — твой ход»: баннер, карты подпрыгивают, звук.
    maybeBoom(v, prev, fast) {
      if (fast || v.paused) return;
      const mine = (v.phase === 'bid' || v.phase === 'play') && v.turn === v.you;
      const was = prev && (prev.phase === 'bid' || prev.phase === 'play') && prev.turn === prev.you && prev.phase === v.phase && !prev.paused;
      if (!mine || was) return;
      banner(T(v.fix ? 'ЗАМЕНИ КАРТУ!' : v.phase === 'bid' ? 'ТВОЯ ЗАЯВКА' : 'ТВОЙ ХОД'), v.fix ? 'crimson' : 'gold', true, '', { now: true });
      SFX.yourTurn(); vibrate(40);
      [...this.hand.values()].forEach((el, i) => setTimeout(() => { el.classList.remove('boom'); void el.offsetWidth; el.classList.add('boom'); }, i * 45));
    },

    // Отсчёты у вылетевших игроков (без лишних запросов к серверу).
    tickAway() {
      if (!this.el) return;
      const now = Date.now();
      this.el.querySelectorAll('.tag.off[data-until]').forEach(t => {
        const u = +t.dataset.until, cd = t.querySelector('.cd');
        if (cd && u) { const s = Math.max(0, Math.ceil((u - now) / 1000)); cd.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
      });
      this.el.querySelectorAll('.vote-btn[data-open]').forEach(b => {
        const o = +b.dataset.open, left = o ? Math.ceil((o - now) / 1000) : 0;
        b.disabled = left > 0;
        b.textContent = left > 0 ? T('Замена через {n} с', { n: left }) : T('Заменить ботом');
      });
    },

    // Дошёл ход, а карта выбрана заранее — играем её; если сейчас она нечестная/недопустимая — снимаем выбор.
    playQueued(v) {
      const id = this.queued;
      if (!id || v.phase !== 'play' || v.turn !== v.you || v.paused || this.queueSent === id) return;
      const honest = v.honest && v.honest.length ? v.honest : v.legal;
      this.queued = null;
      if (!v.legal.includes(id) || !honest.includes(id) || v.fix) {
        const el = this.hand.get(id); if (el) nope(el);
        this.syncHand(v);
        toast(T('Выбранную заранее карту сейчас положить нельзя — выберите другую'));
        return;
      }
      if (id === '7♠' && v.specialModes.length > 1) { this.sel = id; this.syncHand(v); this.openSpecial(v); return; }
      this.queueSent = id;
      setTimeout(() => { if (this.queueSent === id) this.queueSent = null; }, 1500);
      act({ type: 'play', cardId: id, mode: 'normal' });
    },

    tapHand(id, el) {
      const v = S.view;
      SFX.unlock(); Parallax.enableGyro();
      if (!v || v.stage !== 'game') return;
      const myPlay = v.phase === 'play' && v.turn === v.you && !v.paused;
      clearTimeout(this.tapHintT);
      // Предвыбор: пока ходят другие, двойной тап ставит карту в очередь — она сыграется сама, когда дойдёт ход.
      if (!myPlay && (v.phase === 'play' || v.phase === 'trickDone') && !v.handHidden) {
        const now = Date.now();
        clearTimeout(this.tapHintT);
        if (this.queued === id) { this.queued = null; SFX.click(); this.syncHand(v); toast(T('Предвыбор снят')); return; }
        if (this.lastTap && this.lastTap.id === id && now - this.lastTap.t < 420) {
          this.lastTap = null; this.queued = id; SFX.chip(); vibrate(20);
          this.syncHand(v);
          toast(T('Карта выбрана заранее — сыграется, когда дойдёт ваш ход'));
          return;
        }
        this.lastTap = { id, t: now };
        this.tapHintT = setTimeout(() => { nope(el); toast(T('Сейчас не ваш ход · двойной тап — выбрать карту заранее')); }, 430);
        return;
      }
      if (!myPlay) { nope(el); toast(T(v.phase === 'bid' ? 'Сейчас идут заявки' : 'Сейчас не ваш ход')); return; }
      if (!v.legal.includes(id)) {
        nope(el);
        const lead = v.trick && v.trick.plays.length ? v.trick.plays[0].card.suit : null;
        toast(v.fix ? T('Положите честную карту') : v.trick && v.trick.command ? T('Команда «Старшие на стол!» — нужна самая сильная карта') : T('Нужно ходить в масть {s} (или 7♠)', { s: lead }));
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
        <h3 class="gold-text">${T('Как сыграть 7♠?')}</h3>
        <div class="row">
          <button class="btn-ghost" data-act="special" data-mode="normal">${T('Как обычную 7♠')}</button>
          ${m.includes('command') ? `<button class="btn-violet" data-act="special" data-mode="command">${T('«Старшие на стол!»')}</button>` : ''}
          ${m.includes('top') ? `<button class="btn-violet" data-act="special" data-mode="top">${T('Как самую старшую')}</button>` : ''}
        </div>
        <span class="hint">${T(m.includes('command') ? 'Все кладут самую сильную карту, взятка ваша' : 'Карта бьёт всё, взятка ваша')}</span>
        <button class="btn-ghost" data-act="special-cancel" style="padding:5px 12px">${T('Отмена')}</button></div>`;
    },
    closeSpecial() { if (this.special) { this.special = false; if (this.el) { const a = $('#action', this.el); a.innerHTML = ''; a.dataset.kind = ''; } } },

    // Кнопки «Проверить» под чужими картами (режим обмана).
    updateChecks(v) {
      const layer = this.checksLayer;
      if (!layer) return;
      const can = v.bluff && !v.fix && !v.paused && (v.phase === 'play' || v.phase === 'trickDone') && v.trick;
      const want = new Map();
      if (can) for (const [idx, pl] of v.trick.plays.entries()) {
        // Не проверяются: свои карты, уже проверенные, первая карта взятки, 7♠ и вынужденный ход (одна карта на руке).
        if (pl.p === v.you || pl.checked || idx === 0 || pl.card.id === '7♠' || pl.forced) continue;
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
          b.title = T('Проверить на обман');
          layer.appendChild(b);
        }
        b.style.left = (o.el._p.x + d.cw * TABLE_SCALE * 0.42) + 'px';
        b.style.top = (o.el._p.y - d.ch * TABLE_SCALE * 0.42) + 'px';
      }
    },

    tickTimer() {
      const v = S.view;
      if (!v || v.stage !== 'game' || !this.el) return;
      if (v.phase === 'pre') {
        const sec = String(Math.max(1, Math.min(3, Math.ceil(this.preLeft(v) / 1000))));
        const c = $('#skills-bar .sk-count', this.el); if (c && c.textContent !== sec) { c.textContent = sec; popEl(c, 'sk-pop'); }
        const ps = $('#status .pre-s', this.el); if (ps && ps.textContent !== sec) ps.textContent = sec;
      }
      this.tickPause();
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
      if (!st) return;
      const nm = p => esc(v.names[p]);
      let t = '', mine = false, warn = false;
      if (v.vote) t = T('Пауза — голосование');
      else if (v.pause) t = v.pause.resumeIn ? T('Пауза снимается…') : T('Пауза');
      else if (v.fix) {
        mine = v.fix.p === v.you; warn = true;
        t = mine ? T('Вас поймали! Положите честную карту') : T('{n} пойман на обмане — меняет карту', { n: nm(v.fix.p) });
      } else if (v.phase === 'pre') {
        t = v.pre && v.pre.after ? T('Пересдача — карты раздаются заново')
          : this.dealing || this.intro ? T('Раздача…') : T('Окно пересдачи · заявки через {s} с', { s: '<span class="pre-s">3</span>' });
      } else if (v.phase === 'bid') { mine = v.turn === v.you; t = mine ? T('Ваша заявка') : T('Заявляет {n}…', { n: nm(v.turn) }); }
      else if (v.phase === 'play') {
        mine = v.turn === v.you;
        if (mine) {
          const tr = v.trick, lead = tr && tr.plays.length ? tr.plays[0].card.suit : null;
          const need = v.bids[v.you] - v.took[v.you];
          t = tr && tr.command && tr.plays.length ? T('Старшие на стол — самую сильную') : !lead ? T('Ваш ход — вы ведёте') :
            v.hand.some(c => c.suit === lead && c.id !== '7♠') ? T('Ваш ход — в масть {s}', { s: lead }) : T('Ваш ход — масти {s} нет', { s: lead });
          t += need > 0 ? T(' · добрать {n}', { n: need }) : T(need === 0 ? ' · заявка выполнена' : ' · перебор');
          if (this.sel) t = (v.honest && v.honest.length && !v.honest.includes(this.sel)) ? T('Это обман! Нажмите ещё раз, чтобы рискнуть') : T('Нажмите карту ещё раз, чтобы сыграть');
        } else t = T('Ходит {n}…', { n: nm(v.turn) });
      } else if (v.phase === 'trickDone') t = T(v.bluff ? 'Берёт {n} · «?» — проверить' : 'Взятку берёт {n}', { n: nm(v.trickWinner) });
      else if (v.phase === 'roundDone') t = T('Раунд окончен');
      const showTimer = v.timer && mine && (v.phase === 'bid' || v.phase === 'play') && !v.paused;
      st.innerHTML = t + (showTimer ? '<span class="tm"></span>' : '');
      st.classList.toggle('mine', mine && !warn); st.classList.toggle('warn', warn);
      if (!st.innerHTML) st.innerHTML = `<span class="hint">${T('Ждём…')}</span>`;
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
        box.innerHTML = `<div class="bid-panel glass"><h3 class="gold-text">${T('Ваша заявка')}</h3>
          <div class="chips" style="--n:${k + 1}">${Array.from({ length: k + 1 }, (_, b) => `<button class="chip" style="animation-delay:${b * 35}ms" data-act="bid" data-b="${b}">${b}</button>`).join('')}</div>
          <span class="hint">${T('Заявлено другими: {a} из {b}', { a: sum, b: k })}</span></div>`;
      } else if (box.dataset.kind) { box.dataset.kind = ''; box.innerHTML = ''; }
    },

    // Пауза: тёмная вуаль поверх стола, панель с кнопками; при снятии — большой отсчёт 5…1.
    // Состояние берётся из последнего пришедшего с сервера (pv), а не из очереди анимаций, чтобы отклик был сразу.
    updatePause(v) {
      if (!this.el) return;
      this.pv = v;
      const btn = $('.pause-btn', this.el);
      const pz = v.pause, over = v.phase === 'gameOver';
      if (btn) {
        btn.innerHTML = iconSvg(pz && !pz.resumeIn ? 'play' : 'pause') + `<i class="pz-left">${pz && !pz.resumeIn ? '' : v.pausesLeft}</i>`;
        btn.title = T(pz && !pz.resumeIn ? 'Снять паузу' : 'Пауза');
        btn.classList.toggle('on', !!pz);
        btn.classList.toggle('dim', over || (!(pz && !pz.resumeIn) && !v.pausesLeft));
      }
      const box = $('#pause', this.el);
      if (!box) return;
      this.el.classList.toggle('is-paused', !!pz);
      if (!pz) { if (box.innerHTML) { box.innerHTML = ''; this.pzKind = ''; } return; }
      const nm = p => (p === null || p === undefined) ? '' : esc(v.names[p]);
      const counting = pz.resumeIn > 0;
      const kind = (counting ? 'c' : 'p') + pz.by + ':' + pz.resumeBy + ':' + v.pausesLeft + ':' + !!v.vote;
      if (this.pzKind === kind) return;
      const fresh = !this.pzKind || this.pzKind[0] !== kind[0];
      this.pzKind = kind;
      const again = v.pausesLeft > 0 ? `<button class="btn-ghost" data-act="pause">${T('Пауза ({n})', { n: v.pausesLeft })}</button>` : '';
      box.innerHTML = `<div class="pause-veil"></div><div class="pause-panel glass ${fresh ? 'in' : ''}">
        ${counting ? `<div class="pz-cap">${T('Игра продолжится через')}</div>
          <div class="pz-count gold-text"><svg class="pz-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/></svg><b></b></div>
          <div class="hint">${pz.resumeBy === null ? T('Пауза снимается автоматически') : T('Паузу снимает {n}', { n: `<b>${nm(pz.resumeBy)}</b>` })}</div>
          ${again ? `<div class="row pz-row">${again}</div>` : ''}`
        : `<h3 class="pz-title gold-text">${T('ПАУЗА')}</h3>
          <div>${pz.by === v.you ? T('Вы поставили паузу') : T('Паузу поставил {n}', { n: `<b>${nm(pz.by)}</b>` })}</div>
          <div class="row pz-row"><button class="btn-gold" data-act="unpause">${T('Снять паузу')}</button></div>
          <div class="hint">${T('Игра продолжится через 5 секунд после снятия. Осталось ваших пауз: {n}', { n: v.pausesLeft })}</div>`}
        ${v.vote ? `<div class="hint">${T('Идёт голосование — игра стоит до его окончания')}</div>` : ''}</div>`;
      this.pzSec = -1;
      this.tickPause();
    },
    tickPause() {
      const v = this.pv;
      if (!v || !v.pause || !v.pause.resumeIn || !this.el) return;
      const left = Math.max(0, v.pause.resumeIn - (Date.now() - v._at));
      const sec = Math.max(1, Math.ceil(left / 1000));
      const b = $('#pause .pz-count b', this.el);
      if (!b) return;
      const ring = $('#pause .pz-ring circle', this.el);
      if (ring) ring.style.strokeDashoffset = (283 * (1 - left / 5000)).toFixed(1);
      if (sec !== this.pzSec) {
        this.pzSec = sec;
        b.textContent = sec;
        popEl(b, 'pz-pop');
        SFX.tick(sec);
        vibrate(20);
      }
    },

    updateVote(v) {
      const box = $('#vote', this.el);
      if (!v.vote) { box.innerHTML = ''; return; }
      const vt = v.vote;
      const voted = vt.yes.includes(v.you) || vt.no.includes(v.you);
      const canVote = vt.voters.includes(v.you) && !voted;
      const waiting = vt.voters.filter(i => !vt.yes.includes(i) && !vt.no.includes(i)).map(i => esc(v.names[i]));
      box.innerHTML = `<div class="vote-panel glass"><h3 class="gold-text" style="margin:0 0 6px;font-family:var(--font-title);font-size:24px">${T('Пауза — голосование')}</h3>
        <div>${T('Заменить ботом игрока {n}?', { n: `<b>${esc(v.names[vt.target])}</b>` })} <span class="hint">${T('За: {a} · Против: {b}', { a: vt.yes.length, b: vt.no.length })}</span></div>
        ${canVote ? `<div class="row" style="justify-content:center;margin-top:8px"><button class="btn-gold" data-act="vote" data-yes="1">${T('Да, заменить')}</button><button class="btn-ghost" data-act="vote" data-yes="0">${T('Нет, подождём')}</button></div>` : ''}
        <div class="hint" style="margin-top:6px">${waiting.length ? T('Ждём голоса: {l}. ', { l: waiting.join(', ') }) : ''}${T('Если игрок вернётся, голосование отменится.')}</div></div>`;
    },

    // Итог раунда: плюс — монеты сыплются сверху в аватар, минус — высыпаются из него. Счёт растёт/тает по монете.
    async roundCoins(v, h, fast) {
      if (fast) { v.scores.forEach((sc, p) => this.setShown(p, sc)); await this.refreshLeaders(v, true); return; }
      await wait(500);
      const my = h.delta[v.you];
      if (my > 0) SFX.win(); else if (my < 0) SFX.lose();
      await Promise.all(h.delta.map((dl, p) => dl > 0 ? this.coinRain(p, dl) : dl < 0 ? this.coinSpill(p, -dl) : null));
      v.scores.forEach((sc, p) => { if (this.shown[p] !== sc) this.setShown(p, sc); });
      await wait(250);
      await this.refreshLeaders(v, false);
    },

    coinCount(amount) { return Math.max(4, Math.min(18, 3 + Math.round(amount / 4))); },

    coinRain(p, amount) {
      const [x, y] = this.seatCenter(p);
      const ava = this.avaEl(p);
      const n = this.coinCount(amount), start = this.shown[p];
      this.scoreAnims++;
      floater(x, y - 46, amount);
      return Promise.all(Array.from({ length: n }, (_, i) => new Promise(res => {
        const c = document.createElement('div');
        c.className = 'coin-fly coin-drop';
        $('#app').appendChild(c);
        const sx = x + rnd(-55, 55), sy = y - rnd(150, 230), wob = rnd(-14, 14);
        const a = c.animate([
          { transform: `translate(${sx}px, ${sy}px) translate(-50%,-50%) scale(.9) rotateY(0deg) rotateZ(${wob}deg)`, opacity: 0 },
          { transform: `translate(${sx + (x - sx) * 0.25}px, ${sy + (y - sy) * 0.18}px) translate(-50%,-50%) scale(1) rotateY(300deg) rotateZ(${wob}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${x + rnd(-6, 6)}px, ${y + rnd(-4, 4)}px) translate(-50%,-50%) scale(.55) rotateY(1080deg) rotateZ(0deg)`, opacity: 1 },
        ], { duration: 620 + rnd(0, 120), delay: i * 70, easing: 'cubic-bezier(.5,0,.85,.55)', fill: 'forwards' });
        const land = () => {
          c.remove();
          this.setShown(p, start + Math.round(amount * (i + 1) / n));
          FX.burst(x, y - 6, { n: 4, colors: FX.GOLD, speed: [60, 170], size: [1.3, 2.4], g: 240, life: [0.25, 0.5], spread: Math.PI, angle: -Math.PI / 2 });
          if (i % 2 === 0) SFX.coinHit(i);
          if (ava) ava.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08) translateY(2px)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
          if (i === n - 1) {
            FX.ring(x, y, { r1: 80, color: '#f6d27a', width: 3.5 });
            FX.raysAt(x, y, { count: 8, len: 110, color: 'rgba(246,210,122,1)', life: 0.6, a: 0.35 });
            if (ava) ava.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.5) drop-shadow(0 0 14px #f6d27a)' }, { filter: 'brightness(1)' }], { duration: 600 });
          }
          res();
        };
        a.finished.then(land).catch(land);
      }))).then(() => { this.scoreAnims--; });
    },

    coinSpill(p, amount) {
      const [x, y] = this.seatCenter(p);
      const ava = this.avaEl(p);
      const n = this.coinCount(amount), start = this.shown[p];
      this.scoreAnims++;
      floater(x, y - 46, -amount);
      if (ava) { ava.classList.remove('drain'); void ava.offsetWidth; ava.classList.add('drain'); setTimeout(() => ava.classList.remove('drain'), 1200); }
      const floor = y + 150;
      return Promise.all(Array.from({ length: n }, (_, i) => new Promise(res => {
        setTimeout(() => {
          this.setShown(p, start - Math.round(amount * (i + 1) / n));
          if (i % 3 === 0) SFX.coinHit(i + 3);
          FX.burst(x, y - 10, { n: 3, colors: ['#ff4d5e', '#ffc08a'], speed: [40, 110], size: [1.2, 2.2], g: 0, life: [0.2, 0.4] });
          if (ava && i % 2 === 0) ava.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${i % 4 ? 3 : -3}px)` }, { transform: 'translateX(0)' }], { duration: 120 });
          const c = document.createElement('div');
          c.className = 'coin-fly coin-lost';
          $('#app').appendChild(c);
          const dx = rnd(-100, 100), up = rnd(70, 140), ex = x + dx * 1.15, ey = Math.min(floor - rnd(0, 40), VIEW.h - 14);
          const a = c.animate([
            { transform: `translate(${x}px, ${y - 8}px) translate(-50%,-50%) scale(.5) rotateY(0deg)`, opacity: 0 },
            { transform: `translate(${x + dx * 0.45}px, ${y - up}px) translate(-50%,-50%) scale(1) rotateY(360deg) rotateZ(${dx / 3}deg)`, opacity: 1, offset: 0.38, easing: 'cubic-bezier(.3,.6,.5,1)' },
            { transform: `translate(${ex}px, ${ey}px) translate(-50%,-50%) scale(.8) rotateY(900deg) rotateZ(${dx}deg)`, opacity: 0, easing: 'cubic-bezier(.5,0,.9,.6)' },
          ], { duration: 820 + rnd(0, 160), easing: 'linear', fill: 'forwards' });
          const done = () => { c.remove(); res(); };
          a.finished.then(done).catch(done);
        }, i * 65);
      }))).then(() => { this.scoreAnims--; });
    },

    async showResults(v, fast) {
      const h = v.history[v.history.length - 1];
      if (!h) return;
      const bonus = h.bonus || h.delta.map(() => 0);
      await this.roundCoins(v, h, fast);
      const order = v.names.map((_, p) => p).sort((a, b) => v.scores[b] - v.scores[a]);
      const anyBonus = v.bluff || bonus.some(b => b);
      const nextMode = v.modes && v.modes[v.roundIdx + 1];
      const nextTag = nextMode === 'notrump' ? ` · ${T('БЕСКОЗЫРКА')}` : nextMode === 'dark' ? ` · ${T('ТЁМНАЯ')}` : '';
      showModal(`<h2 class="gold-text">${T('Итоги раунда {n}', { n: v.roundIdx + 1 })}${h.mode === 'dark' ? ` <span class="mode-box dark">${T('тёмная ×2')}</span>` : h.mode === 'notrump' ? ` <span class="trump-box notrump">${T('без козыря')}</span>` : ''}</h2>
        <table class="res-table"><tr><th>${T('Игрок')}</th><th>${T('Заявка / взял')}</th><th>${T('За раунд')}</th>${anyBonus ? `<th>${T('Проверки')}</th>` : ''}<th>${T('Всего')}</th></tr>
        ${order.map((p, i) => `<tr class="res-row ${p === v.you ? 'me-row' : ''}" style="animation-delay:${i * 90}ms"><td>${esc(v.names[p])}${p === v.you ? ` <span class="hint">${T('(вы)')}</span>` : ''}</td>
          <td>${h.bids[p]} / ${h.took[p]}</td><td class="d ${h.delta[p] >= 0 ? 'pos' : 'neg'}" data-count="${h.delta[p]}" data-signed="1">0</td>
          ${anyBonus ? `<td class="d ${bonus[p] > 0 ? 'pos' : bonus[p] < 0 ? 'neg' : 'hint'}">${bonus[p] ? (bonus[p] > 0 ? '+' : '') + bonus[p] : '—'}</td>` : ''}
          <td class="d"><span class="gold-text" data-count="${v.scores[p]}" data-from="${v.scores[p] - h.delta[p] - bonus[p]}">${v.scores[p] - h.delta[p] - bonus[p]}</span></td></tr>`).join('')}
        </table><div class="next-ready" id="next-ready"></div>
        <div class="actions"><span class="hint" style="margin-right:auto">${T('Следующий раунд: {c}', { c: poCards(v.plan[v.roundIdx + 1]) })}${nextTag}</span>
        <div class="next-timer" id="next-timer" title="${T('Авто через')}"><svg viewBox="0 0 36 36"><circle class="nt-bg" cx="18" cy="18" r="15.5"/><circle class="nt-fg" cx="18" cy="18" r="15.5" pathLength="100"/></svg><b>15</b></div>
        <button class="btn-gold" data-act="nextRound" id="next-btn">${T('Следующий раунд')}</button></div>`);
      const ov = $('#overlay');
      ov.dataset.kind = 'results';
      this.updateNext(v);
      ov.querySelectorAll('[data-count]').forEach(td => countUp(td, +(td.dataset.from || 0), +td.dataset.count, 900, !!td.dataset.signed));
    },

    // Кто уже нажал «Следующий раунд» и сколько осталось до автоматического перехода.
    updateNext(v) {
      const box = $('#next-ready');
      if (!box || !v.next) return;
      const nx = v.next;
      this.nextDeadline = performance.now() + nx.left;
      this.nextHeld = nx.held ? nx.left : null; // пауза — отсчёт замер
      this.nextWait = nx.wait;
      const meReady = nx.ready.includes(v.you) || this.nextClicked === v.roundIdx;
      const key = JSON.stringify([nx.ready, nx.need, meReady]);
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = nx.need.length > 1 ? nx.need.map(p => {
          const ok = nx.ready.includes(p) || (p === v.you && meReady);
          return `<span class="nr-chip ${ok ? 'ok' : ''} ${p === v.you ? 'me' : ''}" style="--pc:${nameColor(p)}"><i>${ok ? '✓' : ''}</i>${esc(v.names[p])}</span>`;
        }).join('') + `<span class="nr-count">${T('Готовы {a} из {b}', { a: nx.need.filter(p => nx.ready.includes(p) || (p === v.you && meReady)).length, b: nx.need.length })}</span>` : '';
        const btn = $('#next-btn');
        if (btn) { btn.disabled = meReady; btn.textContent = meReady ? T('Ждём других…') : T('Следующий раунд'); btn.classList.toggle('waiting', meReady); }
      }
      if (!this.nextTick) {
        const tick = () => {
          const el = $('#next-timer');
          if (!el) { this.nextTick = null; return; }
          const left = this.nextHeld != null ? this.nextHeld : Math.max(0, this.nextDeadline - performance.now());
          el.classList.toggle('held', this.nextHeld != null);
          const wait = this.nextWait || 15000;
          const shown = Math.min(wait, left);
          const sec = Math.ceil(shown / 1000);
          const b = el.querySelector('b');
          if (b.textContent !== String(sec)) { b.textContent = sec; if (sec <= 5 && left <= wait) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); } }
          el.querySelector('.nt-fg').style.strokeDashoffset = (100 - shown / wait * 100).toFixed(2);
          el.classList.toggle('low', left <= 5000);
          this.nextTick = requestAnimationFrame(tick);
        };
        this.nextTick = requestAnimationFrame(tick);
      }
    },

    async showGameOver(v, fast) {
      const h = v.history[v.history.length - 1];
      if (h && this.shown && v.scores.some((sc, p) => sc !== this.shown[p])) await this.roundCoins(v, h, fast);
      if (!fast) await wait(700);
      const order = v.names.map((_, p) => p).sort((a, b) => v.scores[b] - v.scores[a]);
      const iWon = v.scores[v.you] === v.scores[order[0]];
      const podium = order.map((p, i) => { const st = v.seats[p] || {};
        return `<div class="pl p${i + 1}" style="animation-delay:${(order.length - i) * 150}ms"><div class="ava pod-ava"><span class="ini">${esc(initial(v.names[p]))}</span>${avaPicHtml(st.pic)}</div>
          <div class="pod-name">${esc(v.names[p])}${pidTag(st.uid)}</div><div class="bar">${v.scores[p]}</div></div>`; });
      const arranged = order.length >= 3 ? [podium[1], podium[0], podium[2], ...podium.slice(3)] : podium;
      showModal(`<h2 class="gold-text" style="text-align:center">${T(iWon ? 'Победа!' : 'Игра окончена')}</h2>
        <div class="podium">${arranged.join('')}</div>
        <div class="over-rating" id="over-rating"></div>
        <div class="actions" style="justify-content:center">${v.kind === 'tutorial' ? `<button class="btn-gold" data-act="tutDone">${T('Завершить обучение')}</button>` : v.kind === 'ranked' ? `<button class="btn-gold" data-act="research">${T(v.calib ? 'Дальше' : 'Новый поиск')}</button>`
          : v.isHost ? `<button class="btn-gold" data-act="restart">${T('Ещё партию')}</button>` : `<span class="hint">${T('Новую партию запускает хост')}</span>`}
        <button class="btn-ghost" data-act="scores">${T('Таблица')}</button><button class="btn-ghost" data-act="leave">${T('В меню')}</button></div>`);
      $('#overlay').dataset.kind = 'over';
      renderOverRating(v);
      FX.confetti(); SFX.win();
      if (iWon) { setTimeout(() => FX.confetti(), 900); S.victory = true; Music.play('victory', true); }
    },
  };

  // ---------- лидер по очкам ----------
  // Лидеры — те, у кого больше всех очков (если не у всех поровну).
  function leadersOf(v) {
    const max = Math.max(...v.scores), min = Math.min(...v.scores);
    if (max === min) return [];
    return v.scores.map((s, p) => (s === max ? p : -1)).filter(p => p >= 0);
  }
  // Значки на аватаре: корона и золотая рамка у лидера, фишка «▶» у того, кто ходит первым в раунде.
  function markAvatar(ava, v, p) {
    const lead = (Game.crownSet || []).includes(p);
    ava.classList.toggle('lead', lead);
    const crown = ava.querySelector('.crown');
    if (lead && !crown) ava.insertAdjacentHTML('beforeend', crownSvg());
    if (!lead && crown) crown.remove();
    const chip = ava.querySelector('.first-chip');
    if (chip) chip.remove();
  }

  // ---------- мелочи ----------
  function initial(name) { return (String(name || '?').replace(/^(Бот|Bot)\s+/, '').trim()[0] || '?').toUpperCase(); }
  function poCards(n) { return n == null ? '' : I18N.poCards(n); }
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
  // Большие надписи по центру идут очередью: новая не обрывает старую. Если накопилось несколько — следующие
  // показываются короче, чтобы не отставать от игры. opt.now (ТВОЙ ХОД / ЗАМЕНИ КАРТУ) сбрасывает очередь и выходит сразу.
  // opt.hold — сколько мс держать дольше обычного.
  const BQ = { list: [], t: 0, cur: null };
  function banner(text, cls, quick, sub, opt = {}) {
    if (opt.now) { BQ.list.length = 0; clearTimeout(BQ.t); BQ.cur = null; }
    else if ((BQ.cur && BQ.cur.text === text && BQ.cur.sub === sub) || BQ.list.some(x => x.text === text && x.sub === sub)) return;
    BQ.list.push({ text, cls, sub, dur: (quick ? 1100 : 1800) + (opt.hold || 0) });
    if (!BQ.cur) bannerNext();
  }
  function bannerNext() {
    const it = BQ.list.shift();
    BQ.cur = it || null;
    if (!it) return;
    const b = $('#banner');
    if (!b) { BQ.list.length = 0; BQ.cur = null; return; }
    const dur = BQ.list.length ? Math.min(it.dur, 1000) : it.dur;
    b.innerHTML = `<div class="t ${it.cls}">${esc(it.text)}</div>${it.sub ? `<div class="bsub">${esc(it.sub)}</div>` : ''}`;
    b.className = 'banner on';
    // Вход и уход фиксированной длины, всё добавочное время — удержание.
    const inn = Math.min(330, dur * 0.2), out = Math.min(420, dur * 0.25);
    const kf = [
      { opacity: 0, transform: 'scale(2.2)', letterSpacing: '.5em', easing: 'cubic-bezier(.2,.9,.3,1)' },
      { opacity: 1, transform: 'scale(1)', letterSpacing: '.04em', offset: inn / dur, easing: 'linear' },
      { opacity: 1, transform: 'scale(1.04)', letterSpacing: '.04em', offset: 1 - out / dur, easing: 'ease-in' },
      { opacity: 0, transform: 'scale(.9) translateY(-20px)', letterSpacing: '.04em' },
    ];
    b.querySelectorAll('.t, .bsub').forEach((el, i) => el.animate(kf, { duration: dur, delay: i * 80, fill: 'both' }));
    clearTimeout(BQ.t);
    BQ.t = setTimeout(() => { BQ.cur = null; bannerNext(); }, dur);
  }
  function bannerClear() { BQ.list.length = 0; clearTimeout(BQ.t); BQ.cur = null; const b = $('#banner'); if (b) { b.className = 'banner'; b.innerHTML = ''; } }
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
    // Новый отсчёт на том же элементе продолжает с текущего показанного числа и гасит прежний.
    const tok = el._cu = (el._cu || 0) + 1;
    if (el._cuRun) { const cur = parseInt(String(el.textContent).replace(/[^0-9-]/g, ''), 10); if (isFinite(cur)) from = cur; }
    el._cuRun = true;
    const step = now => {
      if (el._cu !== tok) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else el._cuRun = false;
    };
    requestAnimationFrame(step);
  }

  // ---------- общение: чат, эмоции, лайки, голос ----------
  const EMO_FX = {
    '😂': { cls: 'emo-laugh', fx: (x, y) => FX.burst(x, y + 10, { n: 14, type: 'glow', colors: ['#8fd3ff', '#cdeeff'], speed: [60, 160], angle: Math.PI / 2, spread: 2.2, g: 300, life: [0.6, 1], size: [6, 10] }) },
    '😱': { cls: 'emo-shock', fx: (x, y) => { FX.ring(x, y, { r1: 90, color: '#8fb0ff', width: 3 }); FX.ring(x, y, { r1: 60, color: '#cfe0ff', width: 2, delay: 0.12 }); } },
    '🖕': { cls: 'emo-rude', fx: (x, y) => { FX.burst(x, y, { n: 24, colors: ['#ff4d5e', '#ff9a4d', '#ffd0a0'], speed: [140, 320], size: [1.5, 3] }); FX.shake(4, 0.25); } },
    '😎': { cls: 'emo-cool', fx: (x, y) => { FX.raysAt(x, y, { count: 8, len: 110, color: 'rgba(246,210,122,1)', life: 0.8, a: 0.4, force: true }); FX.burst(x, y, { n: 12, type: 'glyph', glyphs: ['✦'], colors: FX.GOLD, speed: [40, 120], g: 0, life: [0.6, 1], size: [10, 16] }); } },
    '😡': { cls: 'emo-angry', fx: (x, y) => FX.burst(x, y - 20, { n: 16, type: 'dust', colors: ['#ff6a5a'], speed: [30, 90], angle: -Math.PI / 2, spread: 1.4, g: -80, life: [0.7, 1.2], size: [16, 28], size2: 1.8 }) },
    '🤔': { cls: 'emo-think', fx: (x, y) => FX.burst(x + 24, y - 24, { n: 3, type: 'glyph', glyphs: ['•'], colors: ['#f3ecdc'], speed: [20, 40], angle: -Math.PI / 4, spread: 0.6, g: -30, life: [1, 1.4], size: [14, 20] }) },
    '👏': { cls: 'emo-clap', fx: (x, y) => FX.burst(x, y, { n: 30, type: 'conf', colors: ['#f6d27a', '#ff4d5e', '#9ae8ff', '#46e08a', '#c9a2ff'], speed: [120, 300], g: 260, life: [0.9, 1.4], size: [6, 10] }) },
    '💀': { cls: 'emo-dead', fx: (x, y) => FX.burst(x, y, { n: 18, type: 'dust', colors: ['#9a9aa2'], speed: [30, 110], g: 40, life: [0.8, 1.3], size: [14, 24], size2: 1.6 }) },
  };
  // Колесо эмоций игрока: 8 смайликов из пула и 8 своих фраз. Хранится в личных настройках.
  // Пул совпадает с EMOTE_POOL на сервере.
  const EMOTE_POOL = ['😂', '😱', '🖕', '😎', '😡', '🤔', '👏', '💀', '🤣', '😭', '😏', '🙄', '😴', '🤯', '🥳', '😇', '🤡', '🤬', '🥶', '😈', '👍', '👎', '🙏', '🤝', '👀', '🔥', '💩', '❤️', '💔', '🍀', '🎯', '🏆'];
  const WHEEL_DEF = { emotes: ['😂', '😱', '🖕', '😎', '😡', '🤔', '👏', '💀'], phrases: ['Блефуешь!', 'Проверю!', 'Ну ты даёшь', 'Везёт же', 'Давай быстрее', 'Красиво!', 'Не верю', 'GG'] };
  const PHRASE_MAX = 24;
  function myWheel() {
    const w = prefs.wheel || {};
    const emotes = WHEEL_DEF.emotes.map((d, i) => (Array.isArray(w.emotes) && EMOTE_POOL.includes(w.emotes[i]) ? w.emotes[i] : d));
    const phrases = WHEEL_DEF.phrases.map((d, i) => (Array.isArray(w.phrases) && typeof w.phrases[i] === 'string' ? w.phrases[i].slice(0, PHRASE_MAX) : d)); // стандартные — русским ключом, переводятся при показе
    return { emotes, phrases };
  }
  function saveWheel(w) { prefs.wheel = { emotes: w.emotes.slice(), phrases: w.phrases.slice() }; savePrefs(); }
  const mutesOf = name => prefs.mutes[name] || {};
  const isMuted = (name, what) => !!mutesOf(name)[what];

  const Social = {
    lastSeq: null, unread: 0, open: false, readyAt: { like: 0, dislike: 0, mud: 0 }, canMud: false,

    avatarCenter(seat) {
      if (Game.el) return Game.seatCenter(seat);
      const a = document.querySelector(`.lseat[data-i="${seat}"] .ava`);
      if (a) { return VIEW.center(a); }
      return [VIEW.w / 2, VIEW.h / 2];
    },
    avatarEl(seat) {
      const v = S.view;
      if (Game.el) return seat === v.you ? $('#me-panel .ava', Game.el) : Game.seatEls[seat] && Game.seatEls[seat].querySelector('.ava');
      return document.querySelector(`.lseat[data-i="${seat}"] .ava`);
    },

    pulse(seat) {
      const av = this.avatarEl(seat);
      if (!av) return;
      av.classList.remove('pinged'); void av.offsetWidth; av.classList.add('pinged');
      setTimeout(() => av.classList.remove('pinged'), 900);
    },

    update(v) {
      $('#dock').classList.add('on');
      const t = Date.now();
      this.readyAt = { like: t + (v.likeReadyIn || 0), dislike: t + (v.dislikeReadyIn || 0), mud: t + (v.mudReadyIn || 0) };
      this.canMud = !!v.canMud;
      const maxSeq = Math.max(0, ...v.social.map(e => e.seq), ...v.chat.map(m => m.seq));
      const first = this.lastSeq == null;
      if (!first) {
        for (const e of v.social) if (e.seq > this.lastSeq) this.play(v, e);
      }
      this.lastSeq = maxSeq;
      this.renderChat(v);
      this.syncVoice(v);
      this.decorateAvatars(v);
    },

    play(v, e) {
      const name = v.seats[e.from] && v.seats[e.from].name;
      if (e.kind === 'chat') {
        if (isMuted(name, 'chat')) return;
        if (e.to != null) this.bubble(e.from, `🔒 ${e.from === v.you ? '→ ' + e.toName + ': ' : ''}${e.text}`, 'chat dm');
        else this.bubble(e.from, e.text, 'chat');
        if (!this.open && e.from !== v.you) { this.unread++; this.badge(); }
        if (e.from !== v.you) SFX.msg();
      } else if (e.kind === 'phrase') {
        if (isMuted(name, 'emote')) return;
        const toN = e.to != null && v.seats[e.to] ? v.seats[e.to].name : null;
        this.bubble(e.from, toN ? `→ ${toN}: ${T(e.id)}` : T(e.id), 'phrase');
        if (toN) this.pulse(e.to);
        SFX.msg();
      } else if (e.kind === 'emote') {
        if (isMuted(name, 'emote')) return;
        if (e.to != null && v.seats[e.to]) this.emoteTo(e.from, e.to, e.id);
        else this.emote(e.from, e.id);
      } else if (e.kind === 'like') {
        if (isMuted(name, 'emote')) return;
        this.like(e.from, e.to);
      } else if (e.kind === 'dislike') {
        if (isMuted(name, 'emote')) return;
        this.dislike(e.from, e.to);
      } else if (e.kind === 'mud') {
        if (isMuted(name, 'emote')) return;
        this.mud(e.from, e.to, e.style);
      }
    },

    bubble(seat, text, kind) {
      const [x, y] = this.avatarCenter(seat);
      const b = document.createElement('div');
      b.className = `bubble ${kind}`;
      b.textContent = text;
      const up = y > VIEW.h * 0.5;
      b.style.left = Math.min(VIEW.w - 120, Math.max(120, x)) + 'px';
      b.style.top = (up ? y - 44 : y + 44) + 'px';
      b.classList.add(up ? 'up' : 'down');
      $('#app').appendChild(b);
      setTimeout(() => b.classList.add('out'), kind.startsWith('chat') ? 4200 : 2600);
      setTimeout(() => b.remove(), kind.startsWith('chat') ? 4700 : 3100);
    },

    emote(seat, id) {
      const [x, y] = this.avatarCenter(seat);
      const conf = EMO_FX[id] || {};
      const el = document.createElement('div');
      el.className = `emo ${conf.cls || ''}`;
      el.textContent = id;
      el.style.left = x + 'px'; el.style.top = (y - 10) + 'px';
      $('#app').appendChild(el);
      const fx = conf.fx || ((fx_x, fx_y) => FX.burst(fx_x, fx_y, { n: 12, type: 'glyph', glyphs: ['✦'], colors: FX.GOLD, speed: [40, 120], g: 0, life: [0.6, 1], size: [10, 16] }));
      setTimeout(() => fx(x, y - 30), 180);
      SFX.emote(id);
      setTimeout(() => el.remove(), 2400);
    },

    like(from, to) {
      const [x1, y1] = this.avatarCenter(from), [x2, y2] = this.avatarCenter(to);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'like-fly';
        el.textContent = i % 3 === 2 ? '❤️' : '👍';
        $('#app').appendChild(el);
        const mx = (x1 + x2) / 2 + rnd(-90, 90), my = Math.min(y1, y2) - rnd(40, 120);
        const a = el.animate([
          { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.4)`, opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) translate(-50%,-50%) scale(1.3) rotate(${rnd(-30, 30)}deg)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(.8)`, opacity: 1 },
        ], { duration: 750 + i * 45, delay: i * 55, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
        a.finished.then(() => el.remove()).catch(() => el.remove());
      }
      SFX.like();
      setTimeout(() => {
        FX.burst(x2, y2, { n: 22, type: 'glyph', glyphs: ['❤', '✦'], colors: ['#ff4d5e', '#f6d27a', '#ffb3bd'], speed: [80, 220], g: 60, life: [0.7, 1.1], size: [10, 18] });
        FX.ring(x2, y2, { r1: 70, color: '#ff8a96', width: 3 });
        const av = this.avatarEl(to);
        if (av) av.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        SFX.chip();
      }, 800 + n * 55);
    },

    // Дизлайк: 👎 летят в аватар, над ним хмурая тучка с дождём, аватар вздрагивает.
    dislike(from, to) {
      const [x1, y1] = this.avatarCenter(from), [x2, y2] = this.avatarCenter(to);
      for (let i = 0; i < 7; i++) {
        const el = document.createElement('div');
        el.className = 'like-fly';
        el.textContent = i % 3 === 2 ? '💨' : '👎';
        $('#app').appendChild(el);
        const mx = (x1 + x2) / 2 + rnd(-80, 80), my = Math.min(y1, y2) - rnd(30, 100);
        el.animate([
          { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.4)`, opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) translate(-50%,-50%) scale(1.2) rotate(${rnd(-40, 40)}deg)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(.9)`, opacity: 1 },
        ], { duration: 700 + i * 40, delay: i * 60, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' }).finished.then(() => el.remove()).catch(() => el.remove());
      }
      SFX.dislikeFly();
      setTimeout(() => {
        const cloud = document.createElement('div');
        cloud.className = 'boo-cloud';
        cloud.textContent = '🌧️';
        cloud.style.left = x2 + 'px'; cloud.style.top = (y2 - 46) + 'px';
        $('#app').appendChild(cloud);
        setTimeout(() => cloud.remove(), 2200);
        FX.burst(x2, y2 - 30, { n: 26, type: 'glow', colors: ['#8fb0ff', '#c9d6ff'], speed: [10, 40], angle: Math.PI / 2, spread: 0.6, g: 520, life: [0.6, 1.1], size: [4, 7] });
        FX.burst(x2, y2, { n: 12, type: 'dust', colors: ['#7a7a86'], speed: [20, 80], g: -20, life: [0.8, 1.3], size: [14, 26], size2: 1.6 });
        const av = this.avatarEl(to);
        if (av) { av.classList.remove('booed'); void av.offsetWidth; av.classList.add('booed'); setTimeout(() => av.classList.remove('booed'), 1300); }
        SFX.boo();
      }, 720 + 7 * 60);
    },

    // Бросок лидера (вид — из персонализации): грязь, помидор, яйцо или плевок. Летит по дуге, взрывается брызгами,
    // оставляет на аватаре след с подтёками; у каждого вида своя траектория, вращение, удар и звук.
    mud(from, to, style = 'mud') {
      const [x1, y1] = this.avatarCenter(from), [x2, y2] = this.avatarCenter(to);
      const S2 = {
        mud: { dur: 820, arc: 150, spin: 520, size: [30, 26], trail: ['#5a3a1c'], snd: 'mudThrow' },
        tomato: { dur: 760, arc: 170, spin: 640, size: [36, 36], trail: ['#e8261a', '#ff6a4a'], snd: 'mudThrow' },
        egg: { dur: 860, arc: 190, spin: 900, size: [28, 34], trail: [], snd: 'mudThrow' },
        spit: { dur: 430, arc: 40, spin: 0, size: [26, 20], trail: ['#e3f3ff', '#bfe0f5'], snd: 'spitFly' },
      }[style] || null;
      if (!S2) return this.mud(from, to, 'mud');
      const ball = document.createElement('div');
      ball.className = style === 'mud' ? 'mud-ball' : `throw-ball t-${style}`;
      if (style !== 'mud') { ball.innerHTML = throwSvg(style); ball.style.width = S2.size[0] + 'px'; ball.style.height = S2.size[1] + 'px'; }
      $('#app').appendChild(ball);
      SFX[S2.snd] && SFX[S2.snd]();
      // плевок: «пфу» у бросающего
      if (style === 'spit') FX.burst(x1, y1 - 6, { n: 8, type: 'glow', colors: ['#ffffff', '#cfe9fb'], speed: [40, 120], angle: Math.atan2(y2 - y1, x2 - x1), spread: 0.5, g: 200, life: [0.25, 0.45], size: [2, 4] });
      const peak = Math.min(y1, y2) - S2.arc;
      const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const rot = k => style === 'spit' ? `rotate(${ang}deg) scaleX(${1 + k * 0.6})` : `rotate(${S2.spin * k}deg)`;
      const a = ball.animate([
        { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.55) ${rot(0)}` },
        { transform: `translate(${(x1 + x2) / 2}px, ${peak}px) translate(-50%,-50%) scale(1.35) ${rot(0.5)}`, offset: 0.5 },
        { transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(1) ${rot(1)}` },
      ], { duration: S2.dur, easing: style === 'spit' ? 'cubic-bezier(.2,.6,.4,1)' : 'cubic-bezier(.35,.1,.6,1)', fill: 'forwards' });
      // Тень снаряда на столе — объём полёта.
      const shadow = document.createElement('div');
      shadow.className = 'throw-shadow';
      $('#app').appendChild(shadow);
      shadow.animate([{ transform: `translate(${x1}px, ${y1 + 26}px) translate(-50%,-50%) scale(.6)`, opacity: 0.4 },
        { transform: `translate(${(x1 + x2) / 2}px, ${Math.max(y1, y2) + 30}px) translate(-50%,-50%) scale(.35)`, opacity: 0.15, offset: 0.5 },
        { transform: `translate(${x2}px, ${y2 + 26}px) translate(-50%,-50%) scale(.9)`, opacity: 0.45 }], { duration: S2.dur, easing: 'cubic-bezier(.35,.1,.6,1)', fill: 'forwards' });
      const trail = S2.trail.length ? setInterval(() => {
        const r = VIEW.rect(ball);
        FX.burst(r.left + r.width / 2, r.top + r.height / 2, { n: style === 'spit' ? 3 : 2, type: style === 'mud' ? 'dust' : 'glow', colors: S2.trail, speed: [5, 25], g: 160, life: [0.3, 0.6], size: style === 'mud' ? [6, 10] : [2, 4], size2: 0.6, add: style === 'spit' });
      }, 40) : 0;
      const done = () => { clearInterval(trail); shadow.remove(); };
      a.finished.then(() => {
        done();
        // удар: снаряд сплющивается о цель
        ball.animate([{ transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(1) ${rot(1)}` }, { transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(1.7, .35) ${rot(1)}`, opacity: 0 }], { duration: 110, fill: 'forwards' })
          .finished.then(() => ball.remove(), () => ball.remove());
        this.impact(to, style, x2, y2);
      }).catch(() => { done(); ball.remove(); });
    },

    impact(to, style, x2, y2) {
      const av = this.avatarEl(to);
      if (style === 'mud') {
        SFX.splat();
        FX.burst(x2, y2, { n: 34, type: 'dust', colors: ['#6b4423', '#4a2e14', '#8a5a2b'], speed: [120, 380], g: 520, life: [0.6, 1.1], size: [6, 14], size2: 0.7, add: false });
        FX.burst(x2, y2, { n: 16, type: 'glyph', glyphs: ['●'], colors: ['#5a3a1c', '#7a4e26'], speed: [160, 340], g: 600, life: [0.6, 1], size: [8, 16], add: false });
        FX.shake(5, 0.25);
      } else if (style === 'tomato') {
        SFX.squish();
        FX.burst(x2, y2, { n: 40, type: 'glow', colors: ['#ff3a26', '#d81e10', '#ff8a5c'], speed: [140, 420], g: 620, life: [0.5, 1], size: [3, 7], add: false });
        FX.burst(x2, y2, { n: 18, type: 'glyph', glyphs: ['●'], colors: ['#c41a0e', '#e8261a'], speed: [180, 380], g: 700, life: [0.6, 1], size: [7, 15], add: false });
        FX.burst(x2, y2, { n: 14, type: 'glyph', glyphs: ['•'], colors: ['#ffe7a0'], speed: [120, 300], g: 650, life: [0.5, 0.9], size: [8, 12], add: false });
        FX.burst(x2 - 6, y2 - 14, { n: 4, type: 'glyph', glyphs: ['❦'], colors: ['#3fa34d'], speed: [120, 220], angle: -Math.PI / 2, spread: 1, g: 500, life: [0.8, 1.2], size: [12, 16], add: false });
        FX.ring(x2, y2, { r1: 60, color: '#ff5a3c', width: 3, life: 0.4 });
        FX.shake(6, 0.28);
      } else if (style === 'egg') {
        SFX.crack();
        // скорлупа разлетается крупными осколками
        for (let i = 0; i < 9; i++) {
          const sh = document.createElement('div');
          sh.className = 'egg-shell';
          sh.style.setProperty('--w', rnd(7, 13) + 'px');
          $('#app').appendChild(sh);
          const ang = rnd(-Math.PI, 0) + rnd(-0.3, 0.3), sp = rnd(50, 120), dx = Math.cos(ang) * sp, dy = Math.sin(ang) * sp;
          sh.animate([{ transform: `translate(${x2}px, ${y2}px) rotate(0deg)`, opacity: 1 },
            { transform: `translate(${x2 + dx * 0.6}px, ${y2 + dy * 0.6}px) rotate(${rnd(-200, 200)}deg)`, opacity: 1, offset: 0.4 },
            { transform: `translate(${x2 + dx}px, ${y2 + dy + 140}px) rotate(${rnd(-500, 500)}deg)`, opacity: 0 }], { duration: rnd(800, 1200), easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' })
            .finished.then(() => sh.remove(), () => sh.remove());
        }
        FX.burst(x2, y2, { n: 22, type: 'glow', colors: ['#fffbe8', '#ffe28a'], speed: [80, 260], g: 520, life: [0.5, 0.9], size: [3, 6], add: false });
        FX.burst(x2, y2, { n: 8, type: 'glyph', glyphs: ['●'], colors: ['#ffc21a', '#ffb000'], speed: [100, 240], g: 600, life: [0.6, 1], size: [8, 13], add: false });
        FX.shake(4, 0.22);
      } else if (style === 'spit') {
        SFX.spitHit();
        FX.burst(x2, y2, { n: 26, type: 'glow', colors: ['#ffffff', '#d5ecfb', '#a9cfe8'], speed: [80, 260], g: 400, life: [0.4, 0.8], size: [2, 5], add: true });
        FX.burst(x2, y2, { n: 10, type: 'glyph', glyphs: ['○'], colors: ['#e8f6ff'], speed: [30, 90], g: -30, life: [0.8, 1.3], size: [6, 10] });
      }
      vibrate(style === 'spit' ? 25 : 40);
      if (!av) return;
      av.classList.remove('booed', 'disgust'); void av.offsetWidth; av.classList.add(style === 'spit' ? 'disgust' : 'booed');
      const splat = document.createElement('div');
      splat.className = `mud-splat sp-${style}`;
      splat.innerHTML = splatSvg(style);
      av.appendChild(splat);
      const keep = style === 'spit' ? 4500 : 6500;
      setTimeout(() => { splat.classList.add('out'); av.classList.remove('booed', 'disgust'); }, keep);
      setTimeout(() => splat.remove(), keep + 800);
    },

    renderChat(v) {
      const list = $('#chat-list');
      if (!list) return;
      const msgs = v.chat.filter(m => !isMuted(m.name, 'chat'));
      const key = msgs.map(m => m.seq).join(',');
      if (list.dataset.key === key) return;
      list.dataset.key = key;
      list.innerHTML = msgs.map(m => {
        const dm = m.to != null;
        const who = dm ? `🔒 <b style="color:${nameColor(m.from)}">${esc(m.name)}</b> → <b style="color:${nameColor(m.to)}">${esc(m.toName)}</b>:` : `<b style="color:${nameColor(m.from)}">${esc(m.name)}:</b>`;
        const reply = dm && m.from !== v.you ? ` data-act="dmTo" data-seat="${m.from}"` : '';
        return `<div class="${m.from === v.you ? 'mine' : ''} ${dm ? 'dm' : ''}"${reply}>${who} ${esc(m.text)}</div>`;
      }).join('') || `<div class="hint">${T('Сообщений пока нет')}</div>`;
      list.scrollTop = list.scrollHeight;
    },
    badge() { const b = $('#chat-badge'); b.textContent = this.unread; b.classList.toggle('on', this.unread > 0); },
    toggleChat(force) {
      this.open = force == null ? !this.open : force;
      $('#chat-panel').classList.toggle('on', this.open);
      if (this.open) { this.unread = 0; this.badge(); const l = $('#chat-list'); l.scrollTop = l.scrollHeight; }
    },

    syncVoice(v) {
      if (!Voice.supported) return;
      const others = v.seats.filter(s => s && !s.bot && s.online && s.pid !== v.youPid);
      for (const s of v.seats) if (s && !s.bot) Voice.setMuted(s.pid, isMuted(s.name, 'voice'));
      Voice.sync(v.youPid, others.map(s => s.pid));
    },
    // Индикатор речи: зелёное свечение аватара, держится 600 мс после последнего звука.
    talkAt: {},
    onLevel(pid, level) {
      const v = S.view;
      if (!v) return;
      const now = performance.now();
      if (level > 0.035) this.talkAt[pid] = now;
      const on = now - (this.talkAt[pid] || 0) < 600;
      const seat = v.seats.findIndex(s => s && s.pid === pid);
      const av = seat >= 0 && this.avatarEl(seat);
      if (av && av.classList.contains('talking') !== on) av.classList.toggle('talking', on);
    },

    // Значки блокировок на аватарах.
    decorateAvatars(v) {
      v.seats.forEach((s, i) => {
        if (!s || i === v.you) return;
        const av = this.avatarEl(i);
        if (!av) return;
        const m = mutesOf(s.name);
        const icons = (m.voice ? '🔇' : '') + (m.chat ? '💬' : '') + (m.emote ? '🚫' : '');
        let tag = av.querySelector('.mute-tag');
        if (!icons) { if (tag) tag.remove(); return; }
        if (!tag) { tag = document.createElement('span'); tag.className = 'mute-tag'; av.appendChild(tag); }
        tag.textContent = icons;
      });
    },

    // Меню аватара соперника — три группы: «Реакции» (лайк/дизлайк/бросок лидера), «Лично ему» (смайлик или фраза
    // летят к его аватару — видят все; «Написать лично» — личное сообщение в чате, видят только двое), «Заглушить».
    openAvatarMenu(seat) {
      const v = S.view;
      if (!v || seat === v.you || !v.seats[seat]) return;
      const s = v.seats[seat];
      const m = mutesOf(s.name);
      const [x, y] = this.avatarCenter(seat);
      const now = Date.now();
      const left = k => Math.ceil(Math.max(0, this.readyAt[k] - now) / 1000);
      const L = left('like'), D = left('dislike'), M = left('mud');
      const st = prefs.mudStyle || 'mud';
      const th = { mud: ['🟤', 'Грязью!'], tomato: ['🍅', 'Помидором!'], egg: ['🥚', 'Яйцом!'], spit: ['💦', 'Плюнуть!'] }[st] || ['🟤', 'Грязью!'];
      const { emotes, phrases } = myWheel();
      const pop = $('#ava-menu');
      pop.innerHTML = `<div class="am-title">${esc(s.name)}${s.bot ? ` <span class="hint">${T('бот')}</span>` : ''}</div>
        <div class="am-cap">${T('Реакции')}</div>
        <div class="am-acts">
          <button class="am-act like" data-act="like" data-seat="${seat}" ${L ? 'disabled' : ''}><span>👍</span>${L ? T('{n} с', { n: L }) : T('Лайк')}</button>
          <button class="am-act dislike" data-act="dislike" data-seat="${seat}" ${D ? 'disabled' : ''}><span>👎</span>${D ? T('{n} с', { n: D }) : T('Дизлайк')}</button>
          <button class="am-act mud t-${st}" data-act="mud" data-seat="${seat}" ${M || !this.canMud ? 'disabled' : ''} title="${T(this.canMud ? 'Бросок лидера' : 'Только для лидера по очкам')}"><span>${th[0]}</span>${!this.canMud ? T('Только лидер') : M ? T('{n} с', { n: M }) : T(th[1])}</button>
        </div>
        <div class="am-cap">${T('Лично ему')}</div>
        <div class="am-emos">${emotes.map(e => `<button data-act="emoteTo" data-id="${e}" data-seat="${seat}">${e}</button>`).join('')}</div>
        <div class="am-phr">${phrases.filter(p => p.trim()).map(p => `<button data-act="phraseTo" data-text="${esc(p)}" data-seat="${seat}">${esc(T(p))}</button>`).join('')}</div>
        <button class="am-dm" data-act="dmTo" data-seat="${seat}" ${s.bot ? 'disabled' : ''}>✉ ${T(s.bot ? 'Боты не читают личные' : 'Написать лично')}</button>
        <div class="am-cap">${T('Заглушить')}</div>
        <div class="am-row">
          <button class="am-tg ${m.voice ? 'on' : ''}" data-act="mute" data-what="voice" data-seat="${seat}" ${s.bot ? 'disabled' : ''}><span>🎙</span>${T(m.voice ? 'Голос выкл' : 'Голос')}</button>
          <button class="am-tg ${m.chat ? 'on' : ''}" data-act="mute" data-what="chat" data-seat="${seat}"><span>💬</span>${T(m.chat ? 'Чат выкл' : 'Чат')}</button>
          <button class="am-tg ${m.emote ? 'on' : ''}" data-act="mute" data-what="emote" data-seat="${seat}"><span>😀</span>${T(m.emote ? 'Эмоции выкл' : 'Эмоции')}</button>
        </div>`;
      pop.style.left = Math.min(VIEW.w - 160, Math.max(160, x)) + 'px';
      pop.classList.add('on');
      // меню высокое: прижимаем к экрану по вертикали
      const h = pop.offsetHeight || 300;
      const top = y > VIEW.h / 2 ? Math.max(6, y - 50 - h) : Math.min(VIEW.h - h - 6, y + 50);
      pop.style.top = top + 'px';
      pop.classList.remove('above');
      pop.dataset.seat = seat;
      clearInterval(this.amT);
      if (L || D || M) this.amT = setInterval(() => { if (!pop.classList.contains('on')) return clearInterval(this.amT); this.openAvatarMenu(seat); }, 1000);
    },
    // Личное сообщение: чат открывается с адресатом; ✕ на плашке — снова общий чат.
    dmTo: null,
    setDm(seat) {
      const v = S.view;
      this.dmTo = seat != null && v && v.seats[seat] && !v.seats[seat].bot ? seat : null;
      const tag = $('#chat-to');
      if (!tag) return;
      tag.classList.toggle('on', this.dmTo != null);
      tag.innerHTML = this.dmTo != null ? `🔒 ${T('Лично')}: <b>${esc(v.seats[this.dmTo].name)}</b> <button type="button" data-act="dmClear">✕</button>` : '';
      $('#chat-input').placeholder = T(this.dmTo != null ? 'Личное сообщение…' : 'Сообщение…');
    },
    // Смайлик, адресованный игроку: летит от отправителя к его аватару и «взрывается» там.
    emoteTo(from, to, id) {
      const [x1, y1] = this.avatarCenter(from), [x2, y2] = this.avatarCenter(to);
      const el = document.createElement('div');
      el.className = 'emo-fly';
      el.textContent = id;
      $('#app').appendChild(el);
      const peak = Math.min(y1, y2) - 60;
      el.animate([
        { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.6)` },
        { transform: `translate(${(x1 + x2) / 2}px, ${peak}px) translate(-50%,-50%) scale(1.3) rotate(-12deg)`, offset: 0.5 },
        { transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(1)` },
      ], { duration: 650, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'forwards' }).finished
        .then(() => { el.remove(); this.emote(to, id); }, () => el.remove());
    },
    closeAvatarMenu() { $('#ava-menu').classList.remove('on'); clearInterval(this.amT); },

    openEmotes() {
      const v = S.view;
      const pick = $('#emo-pick');
      if (pick.classList.contains('on')) { pick.classList.remove('on'); return; }
      const { emotes, phrases } = myWheel();
      pick.innerHTML = `<div class="wheel">${emotes.map((e, i) => {
        const a = (i / emotes.length) * Math.PI * 2 - Math.PI / 2;
        return `<button class="wheel-item" style="--x:${(Math.cos(a) * 74).toFixed(1)}px;--y:${(Math.sin(a) * 74).toFixed(1)}px;animation-delay:${i * 25}ms" data-act="emote" data-id="${e}">${e}</button>`;
      }).join('')}<div class="wheel-hub">😀</div></div>
        <div class="phrases">${phrases.filter(p => p.trim()).map(p => `<button class="phrase" data-act="phrase" data-text="${esc(p)}">${esc(T(p))}</button>`).join('')}</div>`;
      pick.classList.add('on');
    },
  };

  // Пятна грязи на аватаре: кляксы с подтёками.
  function mudSvg() {
    let blobs = '';
    for (let i = 0; i < 5; i++) {
      const cx = rnd(20, 80), cy = rnd(20, 70), r = rnd(8, 18);
      let d = '';
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2, rr = r * rnd(0.7, 1.25); d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `; }
      blobs += `<path d="${d}Z" fill="${['#5a3a1c', '#4a2e14', '#6b4423'][i % 3]}"/>`;
      blobs += `<rect class="drip" x="${(cx - 2).toFixed(1)}" y="${cy.toFixed(1)}" width="4" height="${rnd(14, 30).toFixed(1)}" rx="2" fill="#4a2e14" style="animation-delay:${(i * 0.3).toFixed(1)}s"/>`;
    }
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${blobs}<circle cx="40" cy="38" r="3" fill="#a07040" opacity=".6"/></svg>`;
  }

  // ---------- броски лидера: грязь, помидор, яйцо, плевок ----------
  const THROWS = [['mud', 'Грязь'], ['tomato', 'Помидор'], ['egg', 'Яйцо'], ['spit', 'Плевок']];
  const blobPath = (cx, cy, r, n = 14, j = [0.75, 1.25]) => {
    let d = '';
    for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, rr = r * rnd(j[0], j[1]); d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `; }
    return d + 'Z';
  };
  // Снаряд в полёте (SVG).
  function throwSvg(style) {
    if (style === 'tomato') return `<svg viewBox="0 0 44 44"><defs><radialGradient id="tmG" cx=".36" cy=".34" r=".72"><stop offset="0" stop-color="#ff9a86"/><stop offset=".35" stop-color="#ef3a26"/><stop offset=".8" stop-color="#b3150b"/><stop offset="1" stop-color="#6e0904"/></radialGradient></defs>
      <ellipse cx="22" cy="24" rx="17" ry="15" fill="url(#tmG)"/><path d="M14 16 Q22 10 30 16" fill="none" stroke="#8a0c06" stroke-width="1" opacity=".5"/>
      <path d="M22 10 L18 6 L21 9 L16 9 L21 11 L19 15 L22 12 L25 15 L23 11 L28 9 L23 9 L26 6 Z" fill="#3fa34d" stroke="#1d5e27" stroke-width=".6"/><rect x="21" y="3" width="2" height="6" rx="1" fill="#2e7d3a"/>
      <ellipse cx="15" cy="19" rx="4.5" ry="3" fill="#fff" opacity=".55" transform="rotate(-30 15 19)"/></svg>`;
    if (style === 'egg') return `<svg viewBox="0 0 40 48"><defs><radialGradient id="egG" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f6efe2"/><stop offset="1" stop-color="#c9b89a"/></radialGradient></defs>
      <path d="M20 3 C31 3 37 20 37 30 C37 40 29 46 20 46 C11 46 3 40 3 30 C3 20 9 3 20 3 Z" fill="url(#egG)" stroke="#b9a684" stroke-width=".8"/>
      <circle cx="12" cy="30" r="1" fill="#c8b48e" opacity=".6"/><circle cx="26" cy="36" r=".8" fill="#c8b48e" opacity=".6"/><ellipse cx="13" cy="15" rx="4" ry="6" fill="#fff" opacity=".8" transform="rotate(-20 13 15)"/></svg>`;
    if (style === 'spit') return `<svg viewBox="0 0 30 24"><defs><radialGradient id="spG" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".5" stop-color="#dff2ff" stop-opacity=".75"/><stop offset="1" stop-color="#9fc8e6" stop-opacity=".55"/></radialGradient></defs>
      <path d="M2 12 C8 6 18 5 26 9 C30 12 28 18 22 19 C14 20 7 17 2 12 Z" fill="url(#spG)" stroke="#b9dcf2" stroke-width=".6"/><circle cx="19" cy="10" r="2.2" fill="#fff" opacity=".9"/><circle cx="12" cy="14" r="1.2" fill="none" stroke="#fff" stroke-width=".5" opacity=".8"/></svg>`;
    return '';
  }
  // След на аватаре после попадания.
  function splatSvg(style) {
    if (style === 'tomato') {
      let x = `<defs><radialGradient id="tsG" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ff6a4a"/><stop offset=".6" stop-color="#d81e10"/><stop offset="1" stop-color="#8a0c06"/></radialGradient></defs>`;
      x += `<path d="${blobPath(50, 42, 30, 18, [0.65, 1.3])}" fill="url(#tsG)"/>`;
      x += `<path d="${blobPath(48, 40, 16, 12, [0.7, 1.2])}" fill="#ff8a5c" opacity=".75"/>`;
      for (let i = 0; i < 11; i++) { const a = rnd(0, 6.28), r = rnd(4, 20); x += `<ellipse cx="${(48 + Math.cos(a) * r).toFixed(1)}" cy="${(40 + Math.sin(a) * r).toFixed(1)}" rx="1.6" ry="2.4" fill="#ffe7a0" transform="rotate(${rnd(0, 180).toFixed(0)} ${(48 + Math.cos(a) * r).toFixed(1)} ${(40 + Math.sin(a) * r).toFixed(1)})"/>`; }
      for (let i = 0; i < 7; i++) { const a = rnd(0, 6.28), r = rnd(34, 46); x += `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(42 + Math.sin(a) * r * 0.9).toFixed(1)}" r="${rnd(1.5, 4).toFixed(1)}" fill="#d81e10"/>`; }
      for (let i = 0; i < 4; i++) x += `<rect class="drip" x="${rnd(30, 66).toFixed(1)}" y="${rnd(52, 62).toFixed(1)}" width="${rnd(3, 5).toFixed(1)}" height="${rnd(18, 34).toFixed(1)}" rx="2.5" fill="#c41a0e" style="animation-delay:${(i * 0.35).toFixed(2)}s"/>`;
      x += `<path d="M38 28 Q46 22 56 26" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`;
      return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${x}</svg>`;
    }
    if (style === 'egg') {
      let x = `<defs><radialGradient id="ysG" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#ffc21a"/><stop offset="1" stop-color="#e08a00"/></radialGradient></defs>`;
      x += `<path d="${blobPath(50, 46, 34, 20, [0.7, 1.25])}" fill="#fffbe8" opacity=".5" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>`;
      x += `<rect class="drip slow" x="38" y="60" width="9" height="34" rx="4.5" fill="#fffbe8" opacity=".45"/><rect class="drip slow" x="58" y="58" width="6" height="26" rx="3" fill="#fffbe8" opacity=".4" style="animation-delay:.6s"/>`;
      x += `<g class="yolk"><circle cx="50" cy="44" r="14" fill="url(#ysG)"/><ellipse cx="45" cy="38" rx="5" ry="3" fill="#fff" opacity=".8" transform="rotate(-25 45 38)"/></g>`;
      for (let i = 0; i < 5; i++) { const a = rnd(0, 6.28), r = rnd(24, 40); const cx = 50 + Math.cos(a) * r, cy = 46 + Math.sin(a) * r * 0.8; x += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} l${rnd(4, 8).toFixed(1)} ${rnd(-3, 3).toFixed(1)} l${rnd(-2, 2).toFixed(1)} ${rnd(4, 7).toFixed(1)} Z" fill="#f6efe2" stroke="#c9b89a" stroke-width=".6"/>`; }
      return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${x}</svg>`;
    }
    if (style === 'spit') {
      let x = `<defs><radialGradient id="ssG" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".6" stop-color="#d5ecfb" stop-opacity=".8"/><stop offset="1" stop-color="#a9cfe8" stop-opacity=".7"/></radialGradient></defs>`;
      x += `<path d="${blobPath(54, 40, 22, 16, [0.6, 1.3])}" fill="url(#ssG)" stroke="#e8f6ff" stroke-opacity=".8" stroke-width="1"/>`;
      for (let i = 0; i < 9; i++) x += `<circle cx="${rnd(38, 70).toFixed(1)}" cy="${rnd(26, 54).toFixed(1)}" r="${rnd(1, 3).toFixed(1)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".85"/>`;
      for (let i = 0; i < 6; i++) { const a = rnd(0, 6.28), r = rnd(26, 38); x += `<circle cx="${(54 + Math.cos(a) * r).toFixed(1)}" cy="${(40 + Math.sin(a) * r * 0.8).toFixed(1)}" r="${rnd(1.2, 3).toFixed(1)}" fill="#e3f3ff" opacity=".7"/>`; }
      x += `<rect class="drip slow" x="50" y="56" width="3.5" height="30" rx="1.8" fill="#dff0fb" opacity=".6"/><path d="M44 32 Q52 26 62 30" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
      return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${x}</svg>`;
    }
    return mudSvg();
  }

  function rtcSend(to, data) {
    if (!S.room || S.local) return;
    fetch(API + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: S.room, token: S.token, type: 'rtc', to, data }) }).catch(() => {});
  }
  async function social(body) {
    if (S.local) { toast(T('В обучении это недоступно')); return; }
    try { await api('/api/action', { room: S.room, token: S.token, ...body }); }
    catch (e) { toast(e.message); }
  }

  function relabelDock() {
    const set = (sel, fn) => { const e = $(sel); if (e) fn(e); };
    set('#chat-panel .chat-head span', e => { e.textContent = T('Чат стола'); });
    set('#chat-input', e => { e.placeholder = T('Сообщение…'); });
    set('#dock [data-act="chat"]', e => { e.title = T('Чат'); });
    set('#dock [data-act="emotes"]', e => { e.title = T('Эмоции'); });
    set('#ptt', e => { e.title = T('Нажми и говори'); const sp = e.querySelector('span'); if (sp) sp.textContent = T('говорить'); });
    const l = $('#chat-list'); if (l) l.dataset.key = '';
    if (S.view) { try { Social.renderChat(S.view); } catch {} }
  }
  // ---------- мировой чат (главный экран) ----------
  // Сервер хранит последние 100 сообщений в памяти (после перезапуска история пропадает). Читать могут все,
  // писать — только с аккаунтом Google. Приглашения за стол из лобби приходят карточками с кнопкой «Сесть за стол».
  const World = {
    msgs: [], seq: 0, online: 0, open: false, unread: 0, timer: 0, busy: false, seen: 0,
    rid: (() => { try { let r = sessionStorage.getItem('vtochku-rid'); if (!r) { r = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('vtochku-rid', r); } return r; } catch { return 'x' + Math.random().toString(36).slice(2, 8); } })(),
    mount() {
      this.render(); this.badge();
      this.poll();
    },
    schedule() {
      clearTimeout(this.timer);
      if (S.screen !== 'home') return;
      this.timer = setTimeout(() => this.poll(), this.open ? 4000 : 15000);
    },
    async poll() {
      clearTimeout(this.timer);
      if (S.screen !== 'home' || this.busy) return this.schedule();
      if (document.hidden) return this.schedule();
      this.busy = true;
      try {
        await Server.ready;
        const j = await fetch(`${API}/api/world?since=${this.seq}&rid=${this.rid}`).then(r => r.json());
        this.online = j.online || 0;
        if (j.seq < this.seq) this.msgs = []; // сервер перезапустился — история новая
        const known = new Map(this.msgs.map(m => [m.seq, m]));
        for (const m of j.invites || []) if (known.has(m.seq)) Object.assign(known.get(m.seq), m);
        const fresh = (j.msgs || []).filter(m => !known.has(m.seq));
        this.msgs = this.msgs.concat(fresh).slice(-100);
        const first = !this.seen;
        this.seq = j.seq;
        if (!first && !this.open) this.unread += fresh.filter(m => !Auth.me || m.uid !== Auth.me.id).length;
        this.seen = 1;
        if (fresh.length || (j.invites || []).length || first) this.render();
        else this.renderHead();
        this.badge();
      } catch {}
      this.busy = false;
      this.schedule();
    },
    badge() {
      const b = $('#w-badge');
      if (!b) return;
      b.textContent = this.unread > 99 ? '99+' : this.unread;
      b.classList.toggle('on', this.unread > 0);
    },
    toggle(force) {
      this.open = force == null ? !this.open : force;
      const p = $('#w-panel');
      if (!p) return;
      p.classList.toggle('on', this.open);
      $('.w-btn') && $('.w-btn').classList.toggle('on', this.open);
      if (this.open) { this.unread = 0; this.badge(); this.render(); this.poll(); }
    },
    renderHead() {
      const h = $('#w-online');
      if (h) h.textContent = T('{n} в сети', { n: this.online });
    },
    item(m) {
      const mine = Auth.me && m.uid === Auth.me.id;
      const ava = `<div class="ava w-ava"><span class="ini">${esc(initial(m.name))}</span>${avaPicHtml(m.pic)}</div>`;
      const time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const who = `<div class="w-who"><b>${esc(m.name)}</b>${m.rating != null ? ` <span class="w-rt">${rtTag(m.rating)}</span>` : ''}<span class="w-time">${time}</span></div>`;
      if (m.kind === 'invite') {
        const r = m.rules || {};
        const tags = [T('{n} раундов', { n: r.rounds || '—' }), r.bluff ? T('обман') : '', r.skills ? T('умения') : '', r.test ? T('тест') : ''].filter(Boolean).join(' · ');
        return `<div class="w-msg w-inv ${mine ? 'mine' : ''}">${ava}<div class="w-body">${who}
          <div class="w-card"><div>🃏 ${T('Зовёт за стол')} <b class="gold-text">${esc(m.room)}</b> · ${m.players}/${m.size}</div><div class="hint">${esc(tags)}</div>
          ${m.open ? `<button class="btn-gold" data-act="worldJoin" data-room="${esc(m.room)}">${T('Сесть за стол')}</button>` : `<span class="hint">${T('Стол уже собран')}</span>`}</div></div></div>`;
      }
      return `<div class="w-msg ${mine ? 'mine' : ''}">${ava}<div class="w-body">${who}<div class="w-text">${esc(m.text)}</div></div></div>`;
    },
    render() {
      const p = $('#w-panel');
      if (!p) return;
      const list = this.msgs.map(m => this.item(m)).join('') || `<div class="hint w-empty">${T('Пока тихо. Напишите первым!')}</div>`;
      const foot = Auth.me
        ? `<form class="chat-form" id="w-form"><input id="w-input" maxlength="240" placeholder="${T('Сообщение всем…')}" autocomplete="off"><button class="btn-gold" type="submit">➤</button></form>`
        : `<button class="btn-ghost w-signin" data-act="profile">🔑 ${T('Войдите через Google, чтобы писать')}</button>`;
      const keep = $('#w-input') ? $('#w-input').value : '';
      const focused = document.activeElement && document.activeElement.id === 'w-input';
      p.innerHTML = `<div class="chat-head"><span>🌍 ${T('Мировой чат')} <i class="hint" id="w-online"></i></span><button data-act="worldClose">✕</button></div>
        <div class="chat-list w-list" id="w-list">${list}</div>${foot}`;
      this.renderHead();
      const l = $('#w-list'); l.scrollTop = l.scrollHeight;
      const f = $('#w-form');
      if (f) {
        const inp = $('#w-input'); inp.value = keep; if (focused) inp.focus();
        f.addEventListener('submit', async e => {
          e.preventDefault();
          const text = inp.value.trim();
          if (!text || !Auth.session) return;
          inp.value = '';
          try { await api('/api/world/send', { session: Auth.session, text }); this.poll(); }
          catch (er) { toast(er.message); inp.value = text; }
        });
      }
    },
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.screen === 'home') World.poll(); });

  function buildDock() {
    const dock = document.createElement('div');
    dock.id = 'dock';
    dock.innerHTML = `
      <div class="chat-panel glass" id="chat-panel">
        <div class="chat-head"><span>${T('Чат стола')}</span><button data-act="chat-close">✕</button></div>
        <div class="chat-list" id="chat-list"></div>
        <div class="chat-to" id="chat-to"></div>
        <form class="chat-form" id="chat-form"><input id="chat-input" maxlength="200" placeholder="${T('Сообщение…')}" autocomplete="off"><button class="btn-gold" type="submit">➤</button></form>
      </div>
      <div class="dock-btns">
        <button class="dock-btn" data-act="chat" title="${T('Чат')}">💬<i id="chat-badge"></i></button>
        <button class="dock-btn" data-act="emotes" title="${T('Эмоции')}">😀</button>
        <button class="dock-btn ptt" id="ptt" title="${T('Нажми и говори')}">🎙<span>${T('говорить')}</span></button>
      </div>
      <div class="emo-pick glass" id="emo-pick"></div>`;
    $('#app').appendChild(dock);
    const menu = document.createElement('div');
    menu.id = 'ava-menu'; menu.className = 'ava-menu glass';
    $('#app').appendChild(menu);
    $('#chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#chat-input');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      social({ type: 'chat', text, ...(Social.dmTo != null ? { to: Social.dmTo } : {}) });
    });
    // «Нажми и говори»: держите кнопку — вас слышат; отпустили — микрофон выключен.
    const ptt = $('#ptt');
    const down = async e => {
      e.preventDefault();
      ptt.setPointerCapture && ptt.setPointerCapture(e.pointerId);
      if (!Voice.supported) { toast(T('Этот браузер не поддерживает голосовой чат')); return; }
      ptt.classList.add('active');
      const r = await Voice.startTalk();
      if (r === 'denied') { ptt.classList.remove('active'); toast(T('Нет доступа к микрофону — разрешите его в настройках браузера')); }
      else if (!ptt.classList.contains('active')) Voice.stopTalk();
      else SFX.click();
    };
    const up = () => { if (!ptt.classList.contains('active')) return; ptt.classList.remove('active'); Voice.stopTalk(); };
    ptt.addEventListener('pointerdown', down);
    ptt.addEventListener('pointerup', up);
    ptt.addEventListener('pointercancel', up);
    ptt.addEventListener('lostpointercapture', up);
    ptt.addEventListener('contextmenu', e => e.preventDefault());
    Voice.init({ send: rtcSend, onLevel: (pid, l) => Social.onLevel(pid, l) });
  }

  // ---------- действия по кнопкам ----------
  let armedCheck = null, armedT = 0;
  const actions = {
    sec: b => { SFX.unlock && SFX.unlock(); openSec(b.dataset.sec); },
    profile: () => showProfile(),
    profileSave: () => {
      const inp = $('#pf-name'), n = inp ? inp.value.trim() : '';
      if (!n) { if (inp) { inp.focus(); nope(inp); } return; }
      save(STORE_KEY, { name: n }); closeModal(); renderPlayerPlate();
    },
    roomsList: () => showRoomsList(),
    rejoin: () => {
      if (searchLock()) return;
      let last = null; try { last = JSON.parse(localStorage.getItem(LAST_KEY)); } catch {}
      if (last && last.room && last.token) connect(last.room, last.token);
    },
    rejoinForget: () => { try { localStorage.removeItem(LAST_KEY); } catch {} const b = cur('#h-rejoin'); if (b) b.classList.remove('on'); },
    casualSize: b => { S.casualSize = +b.dataset.n; syncHome(); },
    listed: () => { S.listed = !S.listed; syncHome(); },
    search: b => { if (searchLock()) return; startSearch(b.dataset.mode); },
    cancelSearch: () => cancelSearch(),
    botsNow: async () => {
      if (searchLock()) return;
      // Не ждать: свой стол с ботами, старт сразу.
      const name = needName();
      if (!name) return;
      cancelSearch();
      const players = S.casualSize || 4;
      try {
        const j = await api('/api/create', { name, players, rounds: 2 * MAX_CARDS(players) - 1, turnTime: 30, lang: I18N.lang, ...geo(), session: Auth.session });
        await api('/api/action', { room: j.room, token: j.token, type: 'start' });
        connect(j.room, j.token);
      } catch (e) { toast(e.message); }
    },
    joinRoom: async b => {
      if (searchLock()) return;
      const name = needName();
      if (!name) return;
      save(STORE_KEY, { name });
      try { const j = await api('/api/join', { name, room: b.dataset.code, session: Auth.session }); closeModal(); connect(j.room, j.token); }
      catch (e) { toast(e.message); loadRooms(); }
    },
    research: () => {
      leave();
      S.homeSec = 'ranked';
      if (S.screen === 'home') { S.screen = null; showHome(); }
      startSearch('ranked');
    },
    players: b => { S.players = +b.dataset.n; syncHome(); },
    rounds: b => { if (S.test) return; S.roundsTouched = true; S.rounds = Math.max(1, Math.min(60, S.rounds + +b.dataset.d)); syncHome(); },
    timer: b => { const t = S.turnTime + +b.dataset.d; S.turnTime = clampTimer(t < 5 && +b.dataset.d < 0 ? 0 : t === 5 && +b.dataset.d > 0 && S.turnTime === 0 ? 5 : t); syncHome(); },
    bluff: () => { S.bluff = !S.bluff; syncHome(); },
    skills: () => { S.skills = !S.skills; syncHome(); },
    test: () => { S.test = !S.test; if (!S.test && !S.roundsTouched) S.rounds = 2 * MAX_CARDS(S.players) - 1; syncHome(); },
    skill: b => {
      SFX.unlock();
      const v = S.view;
      if (!v || !v.skills || !v.skills.reshuffle.can) { nope(b); toast(T(!v || !v.skills || !v.skills.reshuffle.left ? 'Пересдача уже использована' : 'Пересдача — только до заявок')); return; }
      // Первое нажатие — «взвести», второе — применить (чтобы не нажать случайно).
      if (!b.classList.contains('armed')) {
        b.classList.add('armed'); SFX.click();
        clearTimeout(Game.skillArmT); Game.skillArmT = setTimeout(() => b.classList.remove('armed'), 2800);
        return;
      }
      clearTimeout(Game.skillArmT); b.classList.remove('armed');
      act({ type: 'skill', skill: 'reshuffle' });
    },
    create: async () => {
      if (searchLock()) return;
      const name = needName();
      if (!name) return;
      const tv = $('#timer-val'); if (tv) S.turnTime = clampTimer(parseInt(tv.value, 10));
      save(STORE_KEY, { name });
      try { const j = await api('/api/create', { name, players: S.players, rounds: S.rounds, turnTime: S.turnTime, bluff: S.bluff, skills: S.skills, test: S.test, listed: S.listed, lang: I18N.lang, ...geo(), session: Auth.session }); connect(j.room, j.token); }
      catch (e) { toast(e.message); }
    },
    world: () => World.toggle(),
    worldClose: () => World.toggle(false),
    worldJoin: async b => {
      if (searchLock()) return;
      const name = needName();
      if (!name) return;
      save(STORE_KEY, { name });
      try { const j = await api('/api/join', { name, room: b.dataset.room, session: Auth.session }); World.toggle(false); connect(j.room, j.token); }
      catch (e) { toast(e.message); }
    },
    worldInvite: async b => {
      if (!Auth.session) { toast(T('Писать в мировой чат можно только с аккаунтом Google')); return; }
      try { await api('/api/world/invite', { session: Auth.session, room: S.room, token: S.token }); toast(T('Приглашение отправлено в мировой чат')); b.disabled = true; setTimeout(() => { b.disabled = false; }, 30000); }
      catch (e) { toast(e.message); }
    },
    join: async () => {
      if (searchLock()) return;
      const room = ($('#code') ? $('#code').value : '').trim().toUpperCase();
      if (room.length !== 4) { toast(T('Код комнаты — 4 символа')); const c = $('#code'); if (c) { c.focus(); nope(c); } return; }
      const name = needName();
      if (!name) return;
      save(STORE_KEY, { name });
      try { const j = await api('/api/join', { name, room, session: Auth.session }); connect(j.room, j.token); }
      catch (e) { toast(e.message); }
    },
    copy: async () => {
      const link = joinLink(S.view.code);
      try { await navigator.clipboard.writeText(link); toast(T('Ссылка скопирована')); } catch { toast(link); }
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
        armedCheck = b; b.classList.add('armed'); b.textContent = T('Проверить? (−20, если честно)');
        clearTimeout(armedT); armedT = setTimeout(() => { if (armedCheck) { armedCheck.classList.remove('armed'); armedCheck.textContent = '?'; armedCheck = null; } }, 2800);
        return;
      }
      armedCheck = null; clearTimeout(armedT);
      act({ type: 'check', cardId: b.dataset.card });
    },
    nextRound: b => {
      if (b.disabled) return;
      // Окно не закрываем: ждём остальных (или таймер). Одиночная игра с ботами перейдёт сразу.
      Game.nextClicked = S.view ? S.view.roundIdx : null;
      b.disabled = true; b.textContent = T('Ждём других…'); b.classList.add('waiting');
      act({ type: 'nextRound' });
    },
    chat: () => { $('#emo-pick').classList.remove('on'); Social.toggleChat(); if (Social.open) setTimeout(() => $('#chat-input').focus(), 50); },
    'chat-close': () => Social.toggleChat(false),
    emotes: () => { Social.toggleChat(false); Social.openEmotes(); },
    emote: b => { $('#emo-pick').classList.remove('on'); social({ type: 'emote', id: b.dataset.id }); },
    phrase: b => { $('#emo-pick').classList.remove('on'); social({ type: 'phrase', text: b.dataset.text }); },
    emoteTo: b => { Social.closeAvatarMenu(); social({ type: 'emote', id: b.dataset.id, to: +b.dataset.seat }); },
    phraseTo: b => { Social.closeAvatarMenu(); social({ type: 'phrase', text: b.dataset.text, to: +b.dataset.seat }); },
    dmTo: b => { Social.closeAvatarMenu(); Social.setDm(+b.dataset.seat); Social.toggleChat(true); setTimeout(() => $('#chat-input') && $('#chat-input').focus(), 50); },
    dmClear: () => Social.setDm(null),
    wheelSlot: b => { S.wheelSlot = +b.dataset.i; showCustomize('wheel'); },
    wheelPick: b => {
      const w = myWheel(), i = S.wheelSlot || 0, e = b.dataset.e, j = w.emotes.indexOf(e);
      if (j >= 0 && j !== i) w.emotes[j] = w.emotes[i]; // уже на колесе — меняем местами
      w.emotes[i] = e; saveWheel(w);
      S.wheelSlot = (i + 1) % w.emotes.length; // сразу к следующему месту
      showCustomize('wheel');
    },
    wheelReset: () => { delete prefs.wheel; savePrefs(); S.wheelSlot = 0; showCustomize('wheel'); toast(T('Колесо эмоций сброшено')); },
    like: b => { Social.closeAvatarMenu(); social({ type: 'like', to: +b.dataset.seat }); },
    dislike: b => { Social.closeAvatarMenu(); social({ type: 'dislike', to: +b.dataset.seat }); },
    mud: b => { Social.closeAvatarMenu(); social({ type: 'mud', to: +b.dataset.seat, style: prefs.mudStyle || 'mud' }); },
    mute: b => {
      const v = S.view, s = v && v.seats[+b.dataset.seat];
      if (!s) return;
      const m = { ...mutesOf(s.name) };
      m[b.dataset.what] = !m[b.dataset.what];
      prefs.mutes[s.name] = m; savePrefs();
      toast(`${s.name}: ${T({ voice: 'голос', chat: 'чат', emote: 'эмоции и лайки' }[b.dataset.what])} ${T(m[b.dataset.what] ? 'заблокированы' : 'снова видны')}`);
      Social.syncVoice(v); Social.renderChat(v); Social.decorateAvatars(v);
      Social.openAvatarMenu(+b.dataset.seat);
    },
    theme: b => { prefs.cards = b.dataset.t; savePrefs(); Cards.setTheme(prefs.cards); syncHome(); if (S.screen === 'home') { showHomeFanRefresh(); } Game.refreshFaces(); if ($('#overlay .cust-modal')) showCustomize(); else if ($('#overlay').classList.contains('on') && $('#overlay .menu-list, #overlay .menu-modal')) showMenu(); },
    customize: b => showCustomize('decks', b.closest('.menu-modal') ? 'menu' : 'home'),
    custTab: b => showCustomize(b.dataset.tab),
    mudStyle: b => {
      prefs.mudStyle = b.dataset.s; savePrefs(); showCustomize('fx');
      ({ tomato: SFX.squish, egg: SFX.crack, spit: SFX.spitHit, mud: SFX.splat }[prefs.mudStyle] || (() => {}))();
    },
    room: b => {
      prefs.room = b.dataset.r; savePrefs(); applyRoom(prefs.room);
      Game.refreshRoom && Game.refreshRoom();
      showCustomize('rooms');
    },
    custBack: () => { if (S.custFrom === 'menu') showMenu(); else closeModal(); },
    lang: b => {
      const l = b.dataset.l;
      if (l === I18N.lang) return;
      prefs.lang = l; savePrefs(); I18N.set(l); applyLangStatic(); relabelDock();
      const menuOpen = $('#overlay').classList.contains('on') && $('#overlay .menu-list, #overlay .menu-modal');
      if (S.screen === 'home') { S.screen = null; showHome(); }
      else if (S.screen === 'lobby' && S.view) { S.screen = null; showLobby(S.view); }
      else if (S.screen === 'game' && S.view) enqueue({ remount: true }); // пересобрать стол в очереди, после текущей анимации
      if (menuOpen) showMenu();
    },
    install: () => installApp(),
    voteKick: b => act({ type: 'voteKick', seat: +b.dataset.seat }),
    pause: () => { const v = Game.pv || S.view; if (!v || v.stage !== 'game') return; act({ type: v.pause && !v.pause.resumeIn ? 'unpause' : 'pause' }); },
    unpause: () => act({ type: 'unpause' }),
    vote: b => act({ type: 'vote', value: b.dataset.yes === '1' }),
    scores: () => showScores(),
    menu: () => showMenu(),
    tutorial: () => { if (searchLock()) return; startTutorial(); },
    netcheck: () => NetCheck.open(),
    netcheckRun: () => NetCheck.run(),
    netcheckCopy: () => NetCheck.copy(),
    welcomeSkip: () => closeWelcome(),
    tutDone: () => finishTutorial(),
    tutGo: b => { closeModal(); if (b.dataset.tab && S.screen === 'home' && cur('#h-right').dataset.open !== b.dataset.tab) openSec(b.dataset.tab); },
    rules: () => {
      showModal(rulesHtml());
      // Вне стола — рядом с «Понятно» кнопка обучения: пройти его заново можно в любой момент.
      const acts = $('#overlay .actions');
      if (acts && !S.room && !S.local) acts.insertAdjacentHTML('afterbegin', `<button class="btn-ghost" data-act="tutorial">${T('Пройти обучение')}</button>`);
    },
    close: () => closeModal(),
    fullscreen: () => goFullscreen(),
    sound: b => { prefs.sound = !prefs.sound; save(PREF_KEY, prefs); applyPrefs(); if (b.closest('.sound-modal')) showSoundSettings(); else if (b.closest('#sec-settings')) renderSettingsSec(); else showMenu(); if (prefs.sound) SFX.chip(); },
    soundcfg: () => showSoundSettings(),
    music: () => {
      prefs.music = !prefs.music;
      if (prefs.music && prefs.musicVol === 0) prefs.musicVol = 0.1;
      save(PREF_KEY, prefs); applyPrefs(); syncMusicCtl();
    },
    gfx: b => {
      prefs.gfx = b.dataset.g === 'low' ? 'low' : 'high'; savePrefs(); applyGfx(); Parallax.reset();
      for (const seg of document.querySelectorAll('.gfx-seg')) for (const x of seg.querySelectorAll('button')) x.classList.toggle('on', x.dataset.g === gfx());
    },
    log: b => {
      prefs.log = !prefs.log; save(PREF_KEY, prefs);
      const lp = $('#log'); if (lp) { lp.classList.toggle('closed', !prefs.log); lp.querySelector('.tg').textContent = prefs.log ? '−' : '+'; }
      if (b.closest('.modal')) showMenu();
    },
    'leave-ask': () => showModal(`<h2 class="gold-text">${T('Выйти из-за стола?')}</h2><p class="hint">${T('Ваше место останется, вернуться можно по коду и тому же имени.')}</p>
      <div class="actions"><button class="btn-ghost" data-act="close">${T('Остаться')}</button><button class="btn-gold btn-crimson" data-act="leave">${T('Выйти')}</button></div>`),
    leave: () => leave(),
    'log-jump': () => { const b = $('#log-body'); if (b) b.scrollTo({ top: 0, behavior: 'smooth' }); },
    board: () => showBoard(),
    logout: () => Auth.logout(),
  };
  document.addEventListener('input', e => {
    if (e.target.classList.contains('wheel-phrase')) {
      const w = myWheel(); w.phrases[+e.target.dataset.i] = e.target.value.replace(/\s+/g, ' ').slice(0, PHRASE_MAX); saveWheel(w);
      return;
    }
    if (e.target.id !== 'music-vol') return;
    const pct = +e.target.value;
    prefs.musicVol = pct / 100; Music.setVolume(prefs.musicVol);
    e.target.style.setProperty('--p', pct + '%');
    const val = $('#music-vol-val'); if (val) val.textContent = pct + '%';
  });
  document.addEventListener('change', e => { if (e.target.id === 'music-vol') save(PREF_KEY, prefs); });
  document.addEventListener('click', e => {
    SFX.unlock(); Parallax.enableGyro(); Voice.unlock();
    if (!e.target.closest('#ava-menu') && !e.target.closest('.seat .ava, .lseat .ava')) Social.closeAvatarMenu();
    if (!e.target.closest('#emo-pick') && !e.target.closest('[data-act="emotes"]')) $('#emo-pick').classList.remove('on');
    const av = e.target.closest('.seat .ava, .lseat .ava');
    if (av && S.view) {
      let seat = -1;
      if (av.closest('.lseat')) seat = +av.closest('.lseat').dataset.i;
      else seat = Game.seatEls.indexOf(av.closest('.seat'));
      if (seat >= 0) { Social.openAvatarMenu(seat); return; }
    }
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target.id === 'overlay' && !['results', 'over', 'search'].includes($('#overlay').dataset.kind)) closeModal(); return; }
    const fn = actions[b.dataset.act];
    if (fn) { if (!['bid', 'tab', 'check'].includes(b.dataset.act)) SFX.click(); fn(b); }
  });
  // Клик по пустому месту главного экрана сворачивает открытый раздел.
  document.addEventListener('pointerdown', e => {
    if (S.screen !== 'home') return;
    const R = cur('#h-right');
    if (!R || !R.dataset.open || R.dataset.busy) return;
    if (e.target.closest('.h-sec.open, .h-player, #overlay, .modal, #welcome, #coach, .toast, .h-foot')) return;
    openSec(R.dataset.open);
  });

  // ---------- отклик на нажатие: волна от пальца, вспышка рамки, искры у золотых кнопок ----------
  const TAP_SEL = 'button, [data-act], .switch, .chip, .wheel-item';
  document.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const b = e.target.closest(TAP_SEL);
    if (!b || b.disabled || b.closest('.inhand') || b.classList.contains('ptt')) return;
    const app = $('#app');
    if (!app) return;
    const r = VIEW.rect(b), ar = VIEW.rect(app), raw = b.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // Точка нажатия внутри кнопки — в долях, чтобы не зависеть от масштаба экрана.
    const fx = raw.width ? (e.clientX - raw.left) / raw.width : 0.5, fy = raw.height ? (e.clientY - raw.top) / raw.height : 0.5;
    const px = Math.min(1, Math.max(0, fx)) * r.width, py = Math.min(1, Math.max(0, fy)) * r.height;
    const cs = getComputedStyle(b);
    const gold = b.matches('.btn-gold, .chip, .btn-violet, .am-act.like');
    const box = document.createElement('div');
    box.className = 'tap-fx' + (gold ? ' gold' : '');
    box.style.cssText = `left:${(r.left - ar.left).toFixed(1)}px;top:${(r.top - ar.top).toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${r.height.toFixed(1)}px;border-radius:${cs.borderRadius}`;
    const d = Math.hypot(Math.max(px, r.width - px), Math.max(py, r.height - py)) * 2;
    box.innerHTML = `<i style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px;width:${d.toFixed(1)}px;height:${d.toFixed(1)}px"></i>`;
    app.appendChild(box);
    // Вспышка едет вместе с кнопкой, если раскладка сдвинулась (смена вкладки и т. п.).
    const t0 = performance.now();
    const follow = () => {
      if (!box.isConnected) return;
      if (!b.isConnected || performance.now() - t0 > 650) { box.remove(); return; }
      const nr = VIEW.rect(b), na = VIEW.rect(app);
      box.style.left = (nr.left - na.left).toFixed(1) + 'px'; box.style.top = (nr.top - na.top).toFixed(1) + 'px';
      box.style.width = nr.width.toFixed(1) + 'px'; box.style.height = nr.height.toFixed(1) + 'px';
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
    if (gold && FX.getQuality() > 0.3) FX.burst(r.left + px, r.top + py, { n: 9, speed: [80, 220], size: [1.2, 2.6], g: 200, life: [0.35, 0.7] });
    else if (FX.getQuality() > 0.6) FX.burst(r.left + px, r.top + py, { n: 4, speed: [50, 140], size: [1, 2], g: 120, life: [0.25, 0.5] });
  }, { capture: true, passive: true });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && S.screen === 'home' && e.target.id !== 'timer-val') {
      if (e.target.id === 'code') actions.join();
    }
    if (e.key === 'Escape') closeModal();
  });

  function motes() {
    const m = $('.motes');
    m.innerHTML = Array.from({ length: 22 }, () =>
      `<i class="mote" style="left:${rnd(0, 100)}%;top:${rnd(30, 100)}%;animation-duration:${rnd(7, 15)}s;animation-delay:${rnd(-15, 0)}s;transform:scale(${rnd(0.5, 1.2)})"></i>`).join('');
  }

  // ---------- установка как приложение (PWA) ----------
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  async function installApp() {
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
    const en = I18N.lang === 'en';
    showModal(`<h2 class="gold-text">${T('Установить «В Точку»')}</h2>
      ${standalone ? `<p>${T('Игра уже установлена и открыта как приложение.')}</p>` : ios
        ? (en ? T('IOS_INSTALL') : '<p>На iPhone: нажмите <b>«Поделиться»</b> (квадрат со стрелкой) внизу Safari → <b>«На экран „Домой“»</b> → «Добавить».</p><p class="hint">После этого игра запускается во весь экран, как приложение.</p>')
        : (en ? T('ANDROID_INSTALL') : '<p>Откройте меню браузера (⋮) → <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</p><p class="hint">После этого игра запускается во весь экран, как приложение.</p>')}
      <div class="actions"><button class="btn-gold" data-act="close">${T('Понятно')}</button></div>`);
  }
  function showHomeFanRefresh() {
    document.querySelectorAll('.home-fan .card').forEach((el, i) => {
      const id = ['Т♠', 'К♥', '7♠', 'Д♦', 'Т♥'][i];
      el.querySelector('.front').style.backgroundImage = Cards.url(Cards.parse(id));
    });
  }


  // ---------- экран загрузки: сервер просыпается ----------
  function bootDone() { const b = document.getElementById('boot'); if (b && !b.classList.contains('out')) { b.classList.add('out'); setTimeout(() => b.remove(), 600); } }
  const NETCHECK_AFTER = 60000; // через сколько ожидания предлагаем проверить подключение
  let wakeSlowT = 0;
  function showWaking() {
    setScreen('waking', `<div class="connecting waking"><div style="text-align:center">${logoHtml('style="font-size:38px"')}
      <div class="wake-bar"><i></i></div>
      <div class="hint" id="wake-hint">${T('Сервер просыпается — обычно это до минуты.')}</div>
      <div class="wake-actions"><button class="btn-gold" data-act="tutorial">${T('Пройти обучение, пока ждём')}</button><button class="btn-ghost" data-act="rules">${T('Правила')}</button></div>
      <div id="wake-slow"></div></div></div>`);
    clearTimeout(wakeSlowT);
    const showSlow = () => {
      const box = $('#wake-slow');
      if (!box || Server.ok) return;
      const h = $('#wake-hint'); if (h) h.textContent = T('Сервер отвечает дольше обычного.');
      box.innerHTML = `<button class="nc-open" data-act="netcheck"><span class="nc-suits">♠♥</span>${T('Проблемы с подключением?')}<span class="nc-suits">♦♣</span></button>`;
    };
    wakeSlowT = setTimeout(showSlow, Math.max(0, NETCHECK_AFTER - (Date.now() - Server.t0)));
  }

  // ---------- диагностика подключения ----------
  // Набор проверок, чтобы понять, почему сервер «не просыпается»: нет интернета, сеть/антивирус режет адрес сервера,
  // браузер блокирует запросы или сервер правда долго встаёт. Итог — причина простыми словами + отчёт для разработчика.
  const NetCheck = (() => {
    const host = (API || location.origin).replace(/^https?:\/\//, '');
    const timed = (p, ms) => Promise.race([p, wait(ms).then(() => { throw Object.assign(new Error('timeout'), { name: 'Timeout' }); })]);
    const errName = e => (e && (e.name === 'Timeout' || e.name === 'AbortError')) ? 'timeout' : 'network';
    const ms = t0 => T('{n} мс', { n: Math.round(performance.now() - t0) });
    // Каждая проверка: id, подпись, масть-иконка, run() → { st: 'ok'|'bad'|'warn'|'info', note, raw }
    const CHECKS = [
      { id: 'online', suit: '♠', title: 'Интернет на устройстве', run: async () =>
        navigator.onLine === false ? { st: 'bad', note: T('Устройство не в сети'), raw: 'navigator.onLine=false' } : { st: 'ok', note: T('Подключено'), raw: 'navigator.onLine=true' } },
      { id: 'page', suit: '♣', title: 'Сайт игры', run: async () => {
        const t0 = performance.now();
        try { const r = await timed(fetch('/manifest.webmanifest?nc=' + Date.now(), { cache: 'no-store' }), 8000); return r.ok ? { st: 'ok', note: ms(t0), raw: location.host + ' → ' + r.status } : { st: 'warn', note: 'HTTP ' + r.status, raw: location.host + ' → ' + r.status }; }
        catch (e) { return { st: 'bad', note: T('Не открывается'), raw: location.host + ' → ' + errName(e) }; }
      } },
      { id: 'web', suit: '♦', title: 'Другие сайты (Google)', run: async () => {
        const t0 = performance.now();
        try { await timed(fetch('https://www.gstatic.com/generate_204?nc=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }), 8000); return { st: 'ok', note: ms(t0), raw: 'gstatic → ok' }; }
        catch (e) { return { st: 'warn', note: T('Недоступны'), raw: 'gstatic → ' + errName(e) }; }
      } },
      { id: 'reach', suit: '♥', title: 'Связь с сервером игры', run: async () => {
        const t0 = performance.now();
        try { await timed(fetch(API + '/health?nc=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }), 10000); return { st: 'ok', note: ms(t0), raw: host + ' no-cors → ok' }; }
        catch (e) { const n = errName(e); return { st: n === 'timeout' ? 'warn' : 'bad', note: T(n === 'timeout' ? 'Нет ответа' : 'Соединение обрывается'), raw: host + ' no-cors → ' + n }; }
      } },
      { id: 'health', suit: '7♠', title: 'Ответ сервера игры', run: async () => {
        const t0 = performance.now();
        try {
          const r = await timed(fetch(API + '/health?nc=' + Date.now(), { cache: 'no-store' }), 10000);
          const ct = r.headers.get('content-type') || '';
          const j = r.ok && ct.includes('json') ? await r.json().catch(() => null) : null;
          if (j && j.ok) return { st: 'ok', note: ms(t0), raw: '/health → ' + r.status + ' ok' };
          if (!r.ok) return { st: 'bad', note: 'HTTP ' + r.status, raw: '/health → ' + r.status + ' ' + ct };
          return { st: 'warn', note: T('Пришла заставка вместо ответа'), raw: '/health → ' + r.status + ' ' + ct };
        } catch (e) { const n = errName(e); return { st: n === 'timeout' ? 'warn' : 'bad', note: T(n === 'timeout' ? 'Нет ответа' : 'Запрос заблокирован'), raw: '/health cors → ' + n }; }
      } },
    ];
    // Итог по результатам: заголовок, пояснение и советы.
    function verdict(R, waited) {
      const ok = id => R[id] && R[id].st === 'ok';
      if (ok('health')) return { k: 'good', title: T('Сервер на связи'), text: T('Сейчас всё работает — игра откроется через пару секунд.'), tips: [] };
      if (!ok('online') || (R.page && R.page.st === 'bad' && !ok('web'))) return { k: 'bad', title: T('Нет интернета'), text: T('Устройство сейчас не выходит в интернет.'),
        tips: [T('Проверьте Wi-Fi или мобильный интернет'), T('Выключите режим «В самолёте»')] };
      const blockTips = [T('Попробуйте мобильный интернет вместо Wi-Fi (или наоборот)'), T('Добавьте {h} в исключения антивируса и блокировщика рекламы', { h: host }), T('Отключите VPN или, наоборот, попробуйте через VPN'), T('Откройте игру в другом браузере')];
      if (R.reach && R.reach.st === 'bad') return ok('web')
        ? { k: 'bad', title: T('Сервер игры заблокирован в вашей сети'), text: T('Интернет работает, но соединение именно с сервером игры обрывается. Чаще всего так делает антивирус (веб-защита), блокировщик рекламы, фильтр провайдера или рабочей/школьной сети.'), tips: blockTips }
        : { k: 'bad', title: T('Сеть сильно ограничена'), text: T('Открывается только сайт игры, а сервер и другие сайты — нет. Похоже на строгий фильтр сети, файрвол или неработающий VPN.'), tips: blockTips };
      if (ok('reach') && R.health && R.health.st === 'bad' && /network/.test(R.health.raw)) return waited > 180000
        ? { k: 'bad', title: T('Браузер блокирует запросы игры'), text: T('Сервер доступен, но браузер или его расширение не пропускает запросы игры к нему (защита от слежки, блокировщик, строгий режим приватности).'),
          tips: [T('Отключите блокировщик/защиту от слежения для этого сайта'), T('Откройте игру в другом браузере'), T('Добавьте {h} в исключения антивируса и блокировщика рекламы', { h: host })] }
        : { k: 'wait', title: T('Сервер ещё просыпается'), text: T('Сервер отвечает, но пока не готов. Подождите ещё минуту-две.'), tips: [T('Если ждёте дольше 3 минут — нажмите «Проверить снова»')] };
      if (R.health && /HTTP 5/.test(R.health.note)) return { k: 'wait', title: T('Сервер перезапускается'), text: T('Сервер отвечает ошибкой — обычно это обновление или перезапуск. Подождите пару минут.'), tips: [T('Если не проходит дольше 5 минут — отправьте отчёт разработчику')] };
      return { k: 'wait', title: T('Сервер ещё просыпается'), text: T('Сервер медленно отвечает — бесплатный хостинг иногда встаёт дольше обычного.'), tips: [T('Если ждёте дольше 3 минут — нажмите «Проверить снова»'), T('Если не помогает — отправьте отчёт разработчику')] };
    }
    function env() {
      const c = navigator.connection || {};
      let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
      return [
        ['Время', new Date().toISOString()], ['Сайт', location.host], ['Сервер', host],
        ['Ждём сервер', Math.round((Date.now() - Server.t0) / 1000) + ' с, попыток ' + Server.tries + ', последняя: ' + (Server.last || '—')],
        ['Браузер', navigator.userAgent], ['Язык / пояс', (navigator.language || '') + ' / ' + tz],
        ['Сеть', [c.effectiveType, c.type, c.rtt != null ? 'rtt ' + c.rtt : '', c.saveData ? 'saveData' : ''].filter(Boolean).join(', ') || '—'],
        ['Service worker', navigator.serviceWorker && navigator.serviceWorker.controller ? 'да' : 'нет'],
      ];
    }
    let last = null, running = false;
    const ICON = { ok: '✓', bad: '✕', warn: '!', info: 'i' };
    function rowHtml(c) {
      return `<li class="nc-row run" data-id="${c.id}"><span class="nc-suit">${c.suit}</span><span class="nc-name">${T(c.title)}</span>
        <span class="nc-note">${T('проверяем…')}</span><span class="nc-st"><i class="nc-spin"></i></span></li>`;
    }
    const envHtml = () => env().map(([k, x]) => `<tr><td>${esc(T(k))}</td><td>${esc(x)}</td></tr>`).join('');
    // Каркас окна строится один раз за проверку, дальше обновляются только изменившиеся части — анимации не перезапускаются.
    function skeleton() {
      const body = $('#overlay .nc-body'); if (!body) return;
      body.innerHTML = `<div class="nc-verdict run"><div class="nc-vt">${T('Проверяем подключение…')}</div><div class="nc-deal">${['♠', '♥', '♦', '♣'].map((x, i) => `<i style="--i:${i}">${x}</i>`).join('')}</div></div>
        <details class="nc-more" open><summary>${T('Подробности проверки')}</summary>
          <ul class="nc-list">${CHECKS.map(rowHtml).join('')}</ul><table class="nc-env">${envHtml()}</table></details>`;
      $('#overlay .actions').querySelectorAll('[data-act="netcheckRun"],[data-act="netcheckCopy"]').forEach(x => { x.disabled = true; });
    }
    function setRow(c, r) {
      const li = $(`#overlay .nc-row[data-id="${c.id}"]`); if (!li) return;
      li.className = 'nc-row ' + r.st + ' flip';
      li.querySelector('.nc-note').textContent = r.note;
      li.querySelector('.nc-st').textContent = ICON[r.st];
    }
    function finish() {
      const ov = $('#overlay'); if (ov.dataset.kind !== 'netcheck') return;
      const v = verdict(last.R, last.waited);
      const box = ov.querySelector('.nc-verdict');
      box.className = 'nc-verdict ' + v.k;
      box.innerHTML = `<div class="nc-vt">${esc(v.title)}</div><div class="nc-vx">${esc(v.text)}</div>
        ${v.tips.length ? `<ul class="nc-tips">${v.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
      ov.querySelector('.nc-env').innerHTML = envHtml();
      ov.querySelector('.nc-more').open = false; // по умолчанию — только причина, подробности по нажатию
      ov.querySelectorAll('.actions [disabled]').forEach(x => { x.disabled = false; });
    }
    async function run() {
      if (running) return; running = true;
      last = { R: {}, done: false, waited: Date.now() - Server.t0 };
      skeleton();
      // По очереди — как раздача карт: строки «переворачиваются» одна за другой.
      for (const c of CHECKS) {
        let r; try { r = await c.run(); } catch (e) { r = { st: 'bad', note: String(e && e.message || e), raw: 'error' }; }
        last.R[c.id] = r; await wait(250); setRow(c, r);
      }
      last.done = true; running = false; finish();
    }
    function report() {
      if (!last) return '';
      const v = verdict(last.R, last.waited);
      return ['«В Точку» — отчёт о подключении', 'Итог: ' + v.title, '',
        ...CHECKS.map(c => { const r = last.R[c.id] || {}; return `${ICON[r.st] || '?'} ${c.title}: ${r.note || '—'} [${r.raw || ''}]`; }), '',
        ...env().map(([k, x]) => k + ': ' + x)].join('\n');
    }
    async function copy() {
      const txt = report();
      try { await navigator.clipboard.writeText(txt); toast(T('Отчёт скопирован — отправьте его разработчику')); return; } catch {}
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(T('Отчёт скопирован — отправьте его разработчику')); } catch { toast(T('Не удалось скопировать')); }
      ta.remove();
    }
    function open() {
      showModal(`<h2 class="gold-text nc-h">${T('Проверка подключения')}</h2><div class="nc-body"></div>
        <div class="actions"><button class="btn-ghost" data-act="netcheckCopy">${T('Скопировать отчёт')}</button><button class="btn-ghost" data-act="netcheckRun">${T('Проверить снова')}</button><button class="btn-gold" data-act="close">${T('Закрыть')}</button></div>`, 'nc-modal');
      $('#overlay').dataset.kind = 'netcheck';
      run();
    }
    return { open, run, copy, report };
  })();

  // ---------- обучение ----------
  // Флаг «обучение пройдено» хранится в аккаунте Google. Без входа флага нет — окно приветствия появится снова (обучение можно пропустить).
  function tutorialDone() { return !!(Auth.session && (Auth.me ? Auth.me.tutorial : load(AUTH_KEY).tutorial)); }
  function maybeWelcome() {
    if (S.welcomed || S.local || S.room || tutorialDone()) return;
    S.welcomed = true;
    showWelcome();
  }
  function showWelcome() {
    let w = $('#welcome');
    if (!w) { w = document.createElement('div'); w.id = 'welcome'; $('#app').appendChild(w); }
    w.innerHTML = `<div class="wel-card glass">${logoHtml('style="font-size:30px"')}
      <h2 class="gold-text">${esc(T('Добро пожаловать в игру «В Точку»')).replace('«В Точку»', '«В&nbsp;Точку»')}</h2>
      <p class="wel-sub">${T('Короткое обучение — минут на пять — покажет правила на настоящей партии с ботами.')}</p>
      <div class="wel-acct" id="wel-acct"></div>
      <div class="wel-actions"><button class="btn-gold" data-act="tutorial">${T('Пройти обучение')}</button><button class="btn-ghost" data-act="welcomeSkip">${T('Пропустить')}</button></div></div>`;
    void w.offsetWidth;
    w.classList.add('on');
    renderWelcomeAcct();
  }
  function renderWelcomeAcct() {
    const box = $('#wel-acct');
    if (!box) return;
    if (Auth.me) { box.innerHTML = `<span class="hint">${T('Вы вошли: {n}', { n: esc(Auth.me.nick) })}</span>`; return; }
    if (box.dataset.g) return; // кнопка Google уже нарисована
    box.dataset.g = '1';
    box.innerHTML = `<div class="gbtn" id="gbtn-wel"></div><span class="hint">${T('Войдите через Google — тогда прохождение обучения и рейтинг сохранятся. Можно и позже.')}</span>`;
    Auth.renderButton($('#gbtn-wel', box));
  }
  function closeWelcome() { const w = $('#welcome'); if (w) { w.classList.remove('on'); setTimeout(() => w.remove(), 400); } }

  function startTutorial() {
    if (S.local) return;
    if (S.room) { toast(T('Сначала выйдите из-за стола')); return; }
    closeWelcome(); closeModal();
    if (MMS.ticket) cancelSearch();
    const name = myName() || T('Вы');
    Q.length = 0; S.view = null; S.err = '';
    S.local = Tutorial.create({
      name, pic: Auth.me && Auth.me.picture, lang: I18N.lang,
      onView: v => enqueue(v),
      isIdle: () => !pumping && !Q.length && !Game.intro && !Game.dealing && !!Game.el,
    });
    S.local.onSkip(() => { leave(); if (!tutorialDone() && Server.ok) maybeWelcome(); });
  }
  function markTutorialDone() {
    if (!Auth.session) { S.tutPending = true; return; }
    S.tutPending = false;
    if (Auth.me) Auth.me.tutorial = true;
    save(AUTH_KEY, { tutorial: true });
    api('/api/tutorial', { session: Auth.session }).catch(() => {});
  }
  function finishTutorial() {
    markTutorialDone();
    leave();
    const en = I18N.lang === 'en';
    showModal(`<h2 class="gold-text">${T('Обучение пройдено!')}</h2>
      <ul class="rules tut-recap">${(en ? [
        'Bid how many tricks you will take — and hit it exactly.',
        'Follow the led suit; no suit — play anything, hearts ♥ are trumps.',
        '7♠ is the joker: always playable; on lead — “Highest on the table!”.',
        'Exact bid: 20 per trick; exact zero: 5 + 1 per card; short: −20 each; over: +1.',
        'Ranked games use bluff mode: bluff and check — a caught cheater pays 50.',
      ] : [
        'Заявляй, сколько взяток возьмёшь, — и попадай точно.',
        'Ходи в масть; нет масти — любую карту, черви ♥ — козырь.',
        '7♠ — джокер: можно всегда; первым ходом — «Старшие на стол!».',
        'Точно: 20 за взятку; точный ноль: 5 + 1 за карту; недобор: −20 за каждую; перебор: +1.',
        'В рейтинге — режим обмана: ври и проверяй, пойманный отдаёт 50.',
      ]).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      ${Auth.me ? '' : `<div class="wel-acct"><div class="gbtn" id="gbtn-fin"></div><span class="hint">${T('Войдите, чтобы прохождение сохранилось. Без входа обучение предложим снова — его можно будет пропустить.')}</span></div>`}
      <div class="actions"><button class="btn-gold" data-act="tutGo" data-tab="casual">${T('Обычная игра')}</button><button class="btn-gold" data-act="tutGo" data-tab="ranked">${T('Рейтинг')}</button><button class="btn-ghost" data-act="tutGo">${T('В меню')}</button></div>`);
    Auth.renderButton($('#gbtn-fin'));
  }

  function init() {
    Cards.setTheme(prefs.cards);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    buildDock();
    applyPrefs();
    FX.init($('#fx'), $('#shake'));
    motes();
    const sess = load(STORE_KEY);
    const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    const resume = sess.room && sess.token && (!roomParam || roomParam === sess.room);
    Server.wake();
    Auth.init();
    // Сервер ответил быстро — сразу меню. Нет — свой экран загрузки (вместо страницы Render), на нём можно начать обучение.
    const slow = setTimeout(() => { if (Server.ok) return; bootDone(); showWaking(); if (!resume) maybeWelcome(); }, 1200);
    Server.ready.then(() => {
      clearTimeout(slow); clearTimeout(wakeSlowT);
      bootDone();
      if ($('#overlay').dataset.kind === 'netcheck') { closeModal(); toast(T('Сервер на связи')); }
      if (S.local) { toast(T('Сервер готов — после обучения можно играть онлайн')); return; }
      if (resume) { connect(sess.room, sess.token); return; }
      if (S.screen !== 'home') showHome();
      maybeWelcome();
    });
  }
  window.VT = { S, Game, Social, Auth, World, tierOf, enqueue, banner };
  init();
})();
