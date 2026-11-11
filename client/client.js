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
    tab: 'ranked', players: 4, rounds: 17, roundsTouched: false, turnTime: 30, bluff: false, skills: true, listed: true,
    rankedSize: 0, casualSize: 0, // 0 — «любой стол»
  };

  // ---------- настройки и сессия ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function save(key, patch) { try { localStorage.setItem(key, JSON.stringify({ ...load(key), ...patch })); } catch {} }
  const prefs = { sound: true, music: true, musicVol: 0.1, fx: 'high', log: true, cards: 'sil', mutes: {}, lang: I18N.lang, ...load(PREF_KEY) };
  // Новая колода «Силуэты» становится основной и для тех, у кого была сохранена старая.
  if (!prefs.deckV) { prefs.cards = 'sil'; prefs.deckV = 2; }
  // Базовая громкость музыки снижена до 10% — и для тех, у кого уже сохранились прежние 20%.
  if (!prefs.musicV) { if (prefs.musicVol === 0.2) prefs.musicVol = 0.1; prefs.musicV = 1; }
  I18N.set(prefs.lang);
  const savePrefs = () => save(PREF_KEY, prefs);
  function applyPrefs() { SFX.setMuted(!prefs.sound); FX.setQuality(prefs.fx === 'high' ? 1 : 0.4); Music.setVolume(prefs.musicVol); Music.setOn(prefs.music); }

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
  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(I18N.trServer(j.error) || T('Ошибка соединения'));
    return j;
  }
  // ---------- аккаунт Google и рейтинг ----------
  const AUTH_KEY = 'vtochku-auth';
  const Auth = {
    session: load(AUTH_KEY).session || null,
    me: null, cfg: null, gisInit: false,
    async init() {
      try { this.cfg = await fetch('/api/config').then(r => r.json()); } catch {}
      if (this.session) {
        try {
          const r = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: this.session }) });
          if (r.ok) { const j = await r.json(); if (j.me) this.me = j.me; else this.forget(); }
        } catch {}
      }
      renderAcct();
    },
    forget() { this.session = null; this.me = null; save(AUTH_KEY, { session: null }); },
    // Скрипт Google грузится асинхронно — ждём, пока появится.
    whenGis(cb, tries = 0) {
      if (window.google && google.accounts && google.accounts.id) return cb();
      if (tries < 60) setTimeout(() => this.whenGis(cb, tries + 1), 250);
    },
    renderButton(el) {
      if (!this.cfg || !this.cfg.googleClientId) return;
      this.whenGis(() => {
        if (!this.gisInit) {
          google.accounts.id.initialize({ client_id: this.cfg.googleClientId, callback: resp => this.onCredential(resp), auto_select: false, ux_mode: 'popup' });
          this.gisInit = true;
        }
        if (!el.isConnected) return;
        el.innerHTML = '';
        google.accounts.id.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'medium', shape: 'pill', text: 'signin_with', locale: I18N.lang });
      });
    },
    async onCredential(resp) {
      const nameEl = cur('#name');
      try {
        const j = await api('/api/auth/google', { credential: resp.credential, nick: nameEl ? nameEl.value.trim() : '' });
        this.session = j.session; this.me = j.me;
        save(AUTH_KEY, { session: j.session });
        if (nameEl && !nameEl.value.trim()) nameEl.value = j.me.nick;
        renderAcct();
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
  const starSvg = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor"/></svg>';
  const rtTag = r => `<span class="rt">${starSvg}${r}</span>`;
  // Плашка аккаунта на главном экране: кнопка Google или «аватар · имя · рейтинг».
  function renderAcct() {
    const box = cur('#acct');
    if (!box) return;
    const me = Auth.me;
    const nameEl = cur('#name');
    if (me && nameEl && !nameEl.value.trim() && document.activeElement !== nameEl) nameEl.value = me.nick;
    if (me) {
      const pic = `<div class="ava acct-ava"><span class="ini">${esc(initial(me.nick))}</span>${avaPicHtml(me.picture)}</div>`;
      box.innerHTML = `${pic}<div class="acct-who"><b>${esc(me.nick)}</b>${rtTag(me.rating)}<span class="hint">${gamesWord(me.games)}</span></div>
        <button class="btn-ghost acct-btn" data-act="board">${T('Лидеры')}</button><button class="btn-ghost acct-btn" data-act="logout" title="${T('Выйти из аккаунта')}">${T('Выход')}</button>`;
    } else {
      box.innerHTML = `<div class="gbtn" id="gbtn"></div><span class="hint acct-hint">${T('Войдите, чтобы играть на рейтинг')}</span><button class="btn-ghost acct-btn" data-act="board">${T('Лидеры')}</button>`;
      Auth.renderButton($('#gbtn', box));
    }
    renderRankedPane();
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
    const row = (p, isMe) => `<tr class="${isMe ? 'me' : ''} ${p.rank <= 3 ? 'top' + p.rank : ''}"><td class="rk">${p.rank}</td><td class="pn">${esc(p.nick)}${isMe ? ` <span class="hint">${T('(вы)')}</span>` : ''}</td>
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
      .map(p => { const c = r.changes[p]; return `<span class="ro"><b style="color:${nameColor(p)}">${esc(v.names[p])}</b> ${c.after} <i class="${c.delta >= 0 ? 'pos' : 'neg'}">${signed(c.delta)}</i></span>`; }).join('');
    box.innerHTML = (mine
      ? `<div class="rt-me ${mine.delta > 0 ? 'up' : mine.delta < 0 ? 'down' : ''}"><span class="lbl">${T('Ваш рейтинг')}</span>${starSvg}<span class="rt-val" id="rt-val">${mine.before}</span><span class="rt-delta" id="rt-delta">${signed(mine.delta)}</span></div>`
      : `<div class="hint">${T('Вы играли без аккаунта — рейтинг не меняется.')}</div>`) + (others ? `<div class="rt-others">${others}</div>` : '');
    if (mine) {
      const val = $('#rt-val'), d = $('#rt-delta');
      setTimeout(() => { countUp(val, mine.before, mine.after, 1300); d.classList.add('on'); SFX.chip(); }, 350);
      if (Auth.me) { Auth.me.rating = mine.after; Auth.me.games++; }
    }
  }

  function connect(room, token) {
    S.room = room; S.token = token; S.err = ''; S.connecting = true;
    save(STORE_KEY, { room, token });
    if (S.es) S.es.close();
    const es = new EventSource(`/api/events?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);
    es.onmessage = e => { S.connecting = false; const v = JSON.parse(e.data); v._at = Date.now(); enqueue(v); };
    es.addEventListener('rtc', e => { try { const m = JSON.parse(e.data); Voice.onSignal(m.from, m.data); } catch {} });
    es.addEventListener('kicked', e => {
      let reason = T('Вас убрали со стола.');
      try { reason = I18N.trServer(JSON.parse(e.data).reason) || reason; } catch {}
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
    if (S.es) S.es.close();
    S.es = null; S.view = null; S.room = null; S.token = null; S.connecting = false;
    Q.length = 0;
    save(STORE_KEY, { room: null, token: null });
    history.replaceState(null, '', '/');
    closeModal();
    if (Game.el) Game.destroy();
    Voice.stopAll();
    Social.lastSeq = null; Social.toggleChat(false); Social.closeAvatarMenu();
    $('#emo-pick').classList.remove('on');
    $('#dock').classList.remove('on');
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

  function showHome() {
    const sess = load(STORE_KEY);
    const roomParam = (new URLSearchParams(location.search).get('room') || S.prefillCode || '').toUpperCase();
    if (roomParam) S.tab = 'join';
    const fan = ['Т♠', 'К♥', '7♠', 'Д♦', 'Т♥'];
    const el = setScreen('home', `
      <div class="home">
        <div class="acct glass" id="acct"></div>
        <div class="home-fan"><div class="home-fan-inner">${fan.map((id, i) => miniCard(id, i, fan.length)).join('')}</div></div>
        <div class="home-panel glass">
          <div class="home-head"><div>${logoHtml()}<div class="logo-sub">${T('заяви и попади')}</div></div>${langSeg()}</div>
          <label class="field">${T('Ваше имя')}<input id="name" maxlength="20" autocomplete="nickname" value="${esc(sess.name || (Auth.me && Auth.me.nick) || '')}" placeholder="${T('Как вас зовут?')}"></label>
          <div class="tabs tabs4">${[['ranked', 'Рейтинг'], ['casual', 'Обычная'], ['create', 'Свой стол'], ['join', 'Лобби']].map(([k, n]) => `<button data-act="tab" data-tab="${k}">${T(n)}</button>`).join('')}</div>
          <div class="panes">
          <div class="pane" data-pane="ranked" id="pane-ranked"></div>
          <div class="pane" data-pane="casual">
            <div class="row"><span class="opt-label">${T('Стол')}</span><div class="seg" id="seg-casual">${[2, 3, 4, 5, 6, 0].map(n => `<button data-act="casualSize" data-n="${n}">${n || T('Любой')}</button>`).join('')}</div></div>
            <button class="btn-gold" data-act="search" data-mode="casual">${T('Быстрая игра')}</button>
            <span class="hint">${T('Подберём игроков без рейтинга. Не набралось за 45 с — свободные места займут боты.')}</span>
          </div>
          <div class="pane" data-pane="create">
            <div class="row"><span class="opt-label">${T('Игроков')}</span><div class="seg" id="seg-players">${[2, 3, 4, 5, 6].map(n => `<button data-act="players" data-n="${n}">${n}</button>`).join('')}</div></div>
            <div class="row"><span class="opt-label">${T('Раундов')}</span><div class="stepper"><button data-act="rounds" data-d="-1">−</button><b id="rounds-val"></b><button data-act="rounds" data-d="1">+</button></div>
              <span class="opt-label" style="min-width:0;margin-left:6px">${T('Таймер')}</span>
              <div class="stepper"><button data-act="timer" data-d="-5">−</button><input class="num-input" id="timer-val" inputmode="numeric" maxlength="3"><button data-act="timer" data-d="5">+</button></div></div>
            <div class="row"><label class="switch" data-act="bluff" id="bluff-sw"><i></i><span>${T('Режим обмана')}</span></label><span class="hint" id="timer-hint"></span></div>
            <div class="row"><label class="switch" data-act="skills" id="skills-sw"><i></i><span>${T('Умения')}</span></label><span class="hint">${T('«Пересдача» — раз за партию')}</span></div>
            <div class="row"><label class="switch" data-act="listed" id="listed-sw"><i></i><span>${T('Приватная игра')}</span></label><span class="hint">${T('только по коду, в лобби не видна')}</span></div>
            <button class="btn-gold" data-act="create">${T('Создать стол')}</button>
          </div>
          <div class="pane" data-pane="join">
            <div class="rooms-head"><span>${T('Открытые столы')}</span><span class="hint" id="rooms-count"></span></div>
            <div class="room-list" id="room-list"><div class="hint">${T('Загружаем…')}</div></div>
            <div class="code-row"><input id="code" maxlength="4" value="${esc(roomParam)}" placeholder="${T('Код')}" autocapitalize="characters" title="${T('Код комнаты')}">
              <button class="btn-gold" data-act="join">${T('Войти по коду')}</button></div>
            <span class="hint">${T('Приватный стол или вылетели из игры? Введите код и то же имя.')}</span>
          </div>
          </div>
          <div class="err" id="err">${esc(S.err)}</div>
          <div class="home-foot"><div class="seg seg-sm" id="seg-theme"><button data-act="theme" data-t="sil">${T('Силуэты')}</button><button data-act="theme" data-t="dark">${T('Чёрные')}</button><button data-act="theme" data-t="light">${T('Классика')}</button></div>
            <button class="btn-ghost" data-act="rules">${T('Правила')}</button><button class="btn-ghost fs-btn" data-act="soundcfg" title="${T('Звук')}">♪</button><button class="btn-ghost fs-btn" data-act="fullscreen" title="${T('Во весь экран')}">⛶</button><button class="btn-ghost" data-act="install">${T('Установить')}</button></div>
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
    renderAcct();
    loadRooms();
  }

  // Вкладка «Рейтинг»: без входа — приглашение войти; с входом — поиск соперников и калибровка.
  function renderRankedPane() {
    const box = cur('#pane-ranked');
    if (!box) return;
    const me = Auth.me;
    if (!me) {
      box.innerHTML = `<p class="pane-note">${T('Рейтинговые партии — только с аккаунтом Google: так рейтинг сохраняется и его нельзя подделать.')}</p>
        <div class="gbtn" id="gbtn2"></div>
        <button class="btn-ghost" data-act="board">${T('Таблица лидеров')}</button>`;
      Auth.renderButton($('#gbtn2', box));
      return;
    }
    const left = Math.max(0, 5 - me.games);
    box.innerHTML = `<div class="rank-me">${rtTag(me.rating)}<span class="hint">${left ? T('калибровка {a}/5', { a: me.games }) : gamesWord(me.games)}</span>
        <span style="flex:1"></span><button class="btn-ghost acct-btn" data-act="board">${T('Лидеры')}</button></div>
      <div class="row"><span class="opt-label">${T('Стол')}</span><div class="seg" id="seg-ranked">${[2, 3, 4, 0].map(n => `<button data-act="rankedSize" data-n="${n}">${n || T('Любой')}</button>`).join('')}</div></div>
      <button class="btn-gold" data-act="search" data-mode="ranked">${T('Найти соперников')}</button>
      ${left ? `<button class="btn-ghost" data-act="calib">${T('Калибровка с ботами — осталось {n}', { n: left })}</button>` : ''}
      <span class="hint">${left ? T('Первые 5 партий можно сыграть с ботами — после них вы попадёте в таблицу лидеров.') : T('Подбираем соперников близкого рейтинга. Чем дольше ждёте — тем шире разброс.')}</span>`;
    syncHome();
  }

  // Список открытых столов (обновляется, пока открыта вкладка «Обычная»).
  let roomsTimer = 0;
  async function loadRooms() {
    clearTimeout(roomsTimer);
    if (S.screen !== 'home') return;
    roomsTimer = setTimeout(loadRooms, 4000);
    if (S.tab !== 'join') return;
    let list;
    try { list = (await fetch('/api/rooms').then(r => r.json())).rooms || []; } catch { return; }
    const box = cur('#room-list');
    if (!box) return;
    const cnt = cur('#rooms-count'); if (cnt) cnt.textContent = list.length ? String(list.length) : '';
    box.innerHTML = list.length ? list.map(r => `<div class="room-row">
        <div class="rr-main"><b>${esc(r.host)}</b><span class="hint">${T('{n} раундов', { n: r.rounds })} · ${r.turnTime ? T('таймер {s} с', { s: r.turnTime }) : T('без таймера')}${r.bluff ? ' · ' + T('обман') : ''}${r.skills ? ' · ' + T('умения') : ''}</span></div>
        <span class="rr-seats">${r.players}/${r.size}</span>
        <button class="btn-ghost" data-act="joinRoom" data-code="${esc(r.code)}">${T('Сесть')}</button></div>`).join('')
      : `<div class="hint room-empty">${T('Открытых столов пока нет — создайте свой во вкладке «Свой стол» или попробуйте «Быстрая игра».')}</div>`;
  }

  // ---------- поиск игроков ----------
  const MMS = { ticket: null, mode: null, timer: 0, started: 0, sizes: [] };
  async function startSearch(mode) {
    const name = (cur('#name') ? cur('#name').value.trim() : '') || (Auth.me && Auth.me.nick) || load(STORE_KEY).name || '';
    if (!name) { const e = cur('#err'); if (e) e.textContent = T('Введите имя'); const n = cur('#name'); if (n) n.focus(); return; }
    if (mode === 'ranked' && !Auth.me) { S.tab = 'ranked'; syncHome(); toast(T('Войдите через Google, чтобы играть на рейтинг')); return; }
    save(STORE_KEY, { name });
    const size = mode === 'ranked' ? S.rankedSize : S.casualSize;
    MMS.sizes = size ? [size] : [];
    try {
      const j = await api('/api/mm/join', { mode, sizes: MMS.sizes, name, session: Auth.session, lang: I18N.lang, prev: MMS.ticket });
      MMS.ticket = j.ticket; MMS.mode = mode; MMS.started = Date.now();
    } catch (e) { toast(e.message); return; }
    showModal(`<h2 class="gold-text">${T(mode === 'ranked' ? 'Ищем соперников' : 'Ищем игроков')}</h2>
      <div class="search-box"><div class="search-ring"><div class="loader"></div><b id="mm-time">0:00</b></div>
        <div class="search-info"><div>${T('Стол')}: <b>${MMS.sizes.length ? T('на {n}', { n: MMS.sizes[0] }) : T('любой (2–4)')}</b></div>
          <div id="mm-line1" class="hint"></div><div id="mm-line2" class="hint"></div></div></div>
      <div class="actions">${mode === 'casual' ? `<button class="btn-ghost" data-act="botsNow">${T('Играть с ботами сейчас')}</button>` : ''}<button class="btn-gold" data-act="cancelSearch">${T('Отменить')}</button></div>`, 'search-modal');
    $('#overlay').dataset.kind = 'search';
    pollSearch();
  }
  async function pollSearch() {
    clearTimeout(MMS.timer);
    if (!MMS.ticket) return;
    const t = $('#mm-time');
    if (t) { const s = Math.floor((Date.now() - MMS.started) / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    let st;
    try { st = await api('/api/mm/status', { ticket: MMS.ticket }); } catch { MMS.timer = setTimeout(pollSearch, 2000); return; }
    if (!MMS.ticket) return; // отменили, пока ждали ответ
    if (st.state === 'matched') {
      MMS.ticket = null;
      closeModal(); SFX.win && SFX.chip();
      toast(T(st.kind === 'ranked' ? 'Соперники найдены!' : 'Игроки найдены!'));
      connect(st.room, st.token);
      return;
    }
    if (st.state === 'gone') { MMS.ticket = null; closeModalIf('search'); toast(T('Поиск прервался — попробуйте ещё раз')); return; }
    const l1 = $('#mm-line1'), l2 = $('#mm-line2');
    if (l1) l1.textContent = T('Ищут игру: {n}', { n: st.inQueue });
    if (l2) l2.textContent = st.window != null ? T('Разброс рейтинга: ±{w}', { w: st.window })
      : st.botsIn > 0 ? T('Через {s} с сядем с теми, кто есть, + боты', { s: Math.ceil(st.botsIn / 1000) }) : T('Свободные места займут боты');
    MMS.timer = setTimeout(pollSearch, 1500);
  }
  function cancelSearch() {
    clearTimeout(MMS.timer);
    if (MMS.ticket) api('/api/mm/cancel', { ticket: MMS.ticket }).catch(() => {});
    MMS.ticket = null;
    closeModalIf('search');
  }
  function clampTimer(t) { return Number.isFinite(t) ? Math.max(0, Math.min(600, t)) : 30; }
  function syncHome(el = screenEl().querySelector('.screen:not(.leave)') || screenEl()) {
    if (!S.roundsTouched) S.rounds = 2 * MAX_CARDS(S.players) - 1;
    el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    el.querySelectorAll('#seg-ranked button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.rankedSize));
    el.querySelectorAll('#seg-casual button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.casualSize));
    const ls = $('#listed-sw', el); if (ls) ls.classList.toggle('on', !S.listed); // переключатель — «приватная»
    el.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === S.tab));
    el.querySelectorAll('#seg-players button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.players));
    const rv = $('#rounds-val', el); if (rv) rv.textContent = S.rounds;
    const tv = $('#timer-val', el); if (tv && document.activeElement !== tv) tv.value = S.turnTime;
    const th = $('#timer-hint', el); if (th) th.textContent = S.turnTime ? T('до {m} карт · {s} с на ход', { m: MAX_CARDS(S.players), s: S.turnTime }) : T('до {m} карт · без таймера', { m: MAX_CARDS(S.players) });
    const tv2 = $('#timer-val', el); if (tv2) tv2.title = T('секунд на ход (0 — без таймера)');
    const sw = $('#bluff-sw', el); if (sw) sw.classList.toggle('on', S.bluff);
    const ks = $('#skills-sw', el); if (ks) ks.classList.toggle('on', S.skills);
    el.querySelectorAll('#seg-theme button').forEach(b => b.classList.toggle('on', b.dataset.t === prefs.cards));
  }

  function joinLink(code) { return `${location.origin}/?room=${code}`; }
  function settingsLine(v) {
    return `<div class="settings-line"><span>${T('{n} игроков', { n: v.size })}</span><span>${T('{n} раундов', { n: v.rounds })}</span><span>${v.turnTime ? T('таймер {s} с', { s: v.turnTime }) : T('без таймера')}</span>${v.bluff ? `<span class="bluff">${T('режим обмана')}</span>` : ''}${v.skillsOn ? `<span class="skills">${T('умения')}</span>` : ''}</div>`;
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
            <button class="icon-btn" data-act="fullscreen" title="${T('Во весь экран')}">${iconSvg('full')}</button>
            <button class="icon-btn" data-act="scores" title="${T('Счёт')}">${iconSvg('scores')}</button>
            <button class="icon-btn" data-act="menu" title="${T('Меню')}">${iconSvg('menu')}</button>
          </div>
        </div>
        <div class="round-dock"><div class="skills-bar" id="skills-bar"></div><div class="status" id="status"></div><div class="round-box"><b id="hud-round">—</b><span class="s" id="hud-sub"></span><div class="bids-meter" id="bids-meter"></div><div class="tags"><span class="trump-box"><span>♥</span> ${T('козырь')}</span><span id="hud-mode"></span></div></div></div>
        <div class="me-panel" id="me-panel"></div>
        <div class="action" id="action"></div>
        <div id="vote"></div>
      </div>`);
    Game.mount(el);
  }

  // ---------- стол по образцу: кожаный борт с заклёпками, лакированная дорожка, подстаканники, сукно ----------
  function tableSvg(angles) {
    const cx = 500, cy = 300;
    const ell = (rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    let studs = '';
    for (let i = 0; i < 132; i++) { const [x, y] = ell(487, 289, (i / 132) * Math.PI * 2); studs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="url(#chrome)"/>`; }
    // Подстаканники — по одному перед каждым игроком.
    let cups = '';
    for (const deg of angles) {
      const [x, y] = ell(408, 226, deg * Math.PI / 180);
      cups += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><ellipse rx="27" ry="19" fill="url(#chrome)" stroke="#0a0a0c" stroke-width="1.5"/><ellipse rx="20" ry="13" fill="url(#cupIn)"/><ellipse rx="20" ry="13" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/></g>`;
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
      <g opacity=".2" transform="translate(${cx - 70} ${cy - 112}) scale(1.4 1)">${Brand.hood({ id: 'tbl' }).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
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
      <li><b>Play:</b> if you have the suit of the first card, you must play it (no trump then). No such suit — any card, trumps included. <b>7♠</b> can always be played. The strongest card takes the trick and its owner leads next.</li>
      <li><b>Scoring:</b> exactly your bid — +20 per trick; bid 0 and took 0 — +5; short — −20 per missing trick; over — +2.</li>
      <li><b>7♠:</b> a normal card; when leading — “Highest on the table!” (everyone plays their strongest card, the trick is yours); when following — the top card (takes the trick).</li>
      <li><b>Timer:</b> when time runs out, a random honest card is played for you (for bids — an automatic estimate of your hand).</li>
      <li><b>Bluff mode:</b> any card may be played, breaking the suit rule and “Highest on the table!”. While the trick is on the table anyone can tap “?” on someone else’s card (except the first card of the trick, 7♠ and a move with only one card in hand). Caught — the cheater gives the checker 50 points, the card goes back and an honest card must be played. Wrong — the checker loses 20 points.</li>
      <li><b>Skills</b> (table option): <b>Reshuffle</b> — once per game, while bids are being made, all players’ cards are collected, shuffled and dealt again. Bids start over. At most one reshuffle per round.</li>
    </ul><div class="actions"><button class="btn-gold" data-act="close">Got it</button></div>`;
    return `<h2 class="gold-text">Правила «В Точку»</h2><ul class="rules">
      <li>Колода 36 карт, 2–6 игроков. Козыри — черви <b style="color:var(--crimson)">♥</b>.</li>
      <li>Раунды идут «горкой»: по 1, 2, 3… карт до максимума и обратно. Максимум — 36 ÷ число игроков, но не больше 9 (5 игроков — 7 карт, 6 — 6). Лишние раунды добавляются на пике.</li>
      <li><b>Первый ход</b> в первом раунде у случайного игрока, дальше переходит по часовой стрелке (золотой шар на столе).</li>
      <li><b>Заявка:</b> начинает следующий после ходящего. Можно заявить от 0 до числа карт; сумма заявок может быть любой.</li>
      <li><b>Ходы:</b> есть масть первой карты — кладёте только её (козырь в этом случае нельзя). Масти нет — любую карту, в том числе козырь. <b>7♠</b> можно положить всегда. Взятку забирает сильнейшая карта, её владелец ходит следующим.</li>
      <li><b>Очки:</b> взял ровно заявленное — +20 за карту; заявил 0 и взял 0 — +5; недобор — −20 за каждую; перебор — +2.</li>
      <li><b>7♠:</b> как обычная карта; первым ходом — «Старшие на стол!» (все кладут самую сильную карту, взятка ваша); в ответ — как самая старшая (забирает взятку).</li>
      <li><b>Таймер:</b> если время на ход вышло, за игрока кладётся случайная честная карта (на заявку — автоматическая оценка руки).</li>
      <li><b>Режим обмана:</b> можно класть любую карту, нарушая правила масти и «Старшие на стол!». Пока взятка на столе, любой может нажать «?» на чужой карте (кроме первой карты взятки, 7♠ и хода, когда у игрока была одна карта). Поймал — обманщик отдаёт проверившему ${50} очков, карта возвращается, и он обязан положить честную. Ошибся — проверивший теряет 20 очков.</li>
      <li><b>Умения</b> (настройка стола): <b>«Пересдача»</b> — один раз за партию, пока идут заявки, карты всех игроков собираются, тасуются и раздаются заново. Заявки начинаются сначала. Не больше одной пересдачи за раунд.</li>
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
    showModal(`<h2 class="gold-text">${T('Меню')}</h2><div class="menu-list">
      ${musicCtlHtml()}
      <button class="btn-ghost" data-act="sound">${T('Звук: {v}', { v: T(prefs.sound ? 'включён' : 'выключен') })}</button>
      <button class="btn-ghost" data-act="quality">${T('Эффекты: {v}', { v: T(prefs.fx === 'high' ? 'максимум' : 'экономно') })}</button>
      <button class="btn-ghost" data-act="log">${T('Журнал: {v}', { v: T(prefs.log ? 'показан' : 'скрыт') })}</button>
      <div class="seg" id="seg-theme">${[['sil', 'Силуэты'], ['dark', 'Чёрные'], ['light', 'Классика']].map(([k, n]) => `<button data-act="theme" data-t="${k}" class="${prefs.cards === k ? 'on' : ''}">${T(n)}</button>`).join('')}</div>
      ${langSeg()}
      <button class="btn-ghost" data-act="fullscreen">${T(document.fullscreenElement ? 'Выйти из полного экрана' : 'Во весь экран')}</button>
      <button class="btn-ghost" data-act="install">${T('Установить как приложение')}</button>
      <button class="btn-ghost" data-act="rules">${T('Правила')}</button>
      <button class="btn-ghost" data-act="board">${T('Таблица лидеров')}</button>
      <button class="btn-ghost btn-crimson" data-act="leave-ask">${T('Выйти из-за стола')}</button>
    </div><div class="actions"><button class="btn-gold" data-act="close">${T('Назад')}</button></div>`);
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
      tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; go();
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
  function slotXY(spot, d, n) {
    const a = SPOT_ANGLE[spot] * Math.PI / 180;
    const rx = d.cw * (n >= 5 ? 1.6 : 1.15), ry = d.ch * (n >= 5 ? 0.28 : 0.3);
    return [d.cx + Math.cos(a) * rx, d.cy + Math.sin(a) * ry];
  }
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
      TABLE_SCALE = 0.66;
      Object.assign(this, { el, prev: null, hand: new Map(), table: new Map(), seatEls: [], sel: null, special: false, resultsShownFor: -1, overShown: false, checkSeq: 0 });
      this.cardsLayer = $('#cards', el); this.seatsLayer = $('#seats', el); this.checksLayer = $('#checks', el);
      this.applyDims();
      this.onResize = () => { this.applyDims(); if (S.view && S.view.stage === 'game') this.relayout(S.view); };
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
      if (newRound) {
        closeModalIf('results'); closeModalIf('over');
        this.overShown = false;
        await this.collectStale(v, true);
        this.updateSeats(v, prev, true);
        this.updateMe(v, null);
        if (!fast) await this.announceRound(v);
        await this.deal(v, fast);
      }
      if (rsSeq > this.reshuffleSeq) {
        this.reshuffleSeq = rsSeq;
        if (fast) await this.deal(v, true);
        else await this.reshuffleFx(v);
      }
      await this.applyCheck(v, fast);
      await this.syncTable(v, fast);
      this.updateSeats(v, newRound ? null : prev);
      this.updateMe(v, newRound ? null : prev);
      this.syncHand(v, fast);
      this.updateChecks(v);
      this.updateStatus(v);
      this.updateAction(v);
      this.updateSkills(v);
      this.updateVote(v);
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
      $('#hud-mode', this.el).innerHTML = v.bluff ? `<span class="mode-box">${T('обман')}</span>` : '';
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
      tw.innerHTML = tableSvg(Array.from({ length: v.n }, (_, p) => SPOT_ANGLE[spotOf(v, p)]));
      this.neonDeg = null; this.puckDeg = null; this.puckK = null; this.puckIn = null; this.puckAnim = false; this.ballLast = null; this.ballTrail = []; cancelAnimationFrame(this.puckRaf);
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
        if (!s.bot && !s.online) x += `<span class="tag off">${T('вылетел')}</span>`;
        if (!s.bot && !s.online && !v.vote && v.phase !== 'gameOver') x += `<button class="btn-ghost vote-btn" data-act="voteKick" data-seat="${p}">${T('Заменить ботом')}</button>`;
        el.querySelector('.xtra').innerHTML = x;
      }
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
        this.transferPoints(lc.by, null, lc.delta);
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
        el.style.zIndex = (c.id === focusId ? 200 : 100) + i;
        const to = handXY(i, ids.length, d, this.sel === c.id, focusIdx, focusId === this.hover && !this.sel);
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

    // Кнопки умений (пока одно — «Пересдача»): готово / сейчас нельзя / использовано.
    updateSkills(v) {
      const bar = $('#skills-bar', this.el);
      if (!bar) return;
      if (!v.skills) { if (bar.innerHTML) bar.innerHTML = ''; return; }
      const sk = v.skills.reshuffle;
      let b = bar.querySelector('.skill-btn');
      if (!b) {
        bar.innerHTML = `<button class="skill-btn" data-act="skill" data-skill="reshuffle" title="${T('Пересдача: все карты всех игроков перетасовать и раздать заново. Только пока идут заявки, один раз за партию.')}">
          <span class="sk-ring"></span><span class="sk-ico">${shuffleSvg()}</span><span class="sk-lock">🔒</span>
          <span class="sk-name">${T('Пересдача')}</span><span class="sk-arm">${T('Нажмите ещё раз')}</span></button>`;
        b = bar.querySelector('.skill-btn');
      }
      const state = !sk.left ? 'used' : sk.can ? 'ready' : 'idle';
      if (b.dataset.state !== state) {
        const wasReady = b.dataset.state === 'idle' && state === 'ready';
        b.dataset.state = state;
        if (state !== 'ready') b.classList.remove('armed');
        if (wasReady) popEl(b, 'sk-pop');
      }
    },

    // Пересдача: все карты слетаются в центр, колода тасуется вихрем и раздаётся заново.
    async reshuffleFx(v) {
      const rs = v.reshuffle;
      const d = dims();
      const cx = d.cx, cy = d.cy;
      this.closeSpecial();
      const box = $('#action', this.el); if (box.dataset.kind) { box.dataset.kind = ''; box.innerHTML = ''; }
      const who = rs.by === v.you ? T('Вы') : v.names[rs.by];
      banner(T('ПЕРЕСДАЧА!'), 'violet', false, who);
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
      this.hand.clear(); this.sel = null;
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
    async announceRound(v) {
      const n = v.roundIdx + 1, total = v.plan.length, k = v.plan[v.roundIdx];
      const peak = Math.max(...v.plan);
      const tag = T(n === total ? 'ФИНАЛЬНЫЙ РАУНД' : n === 1 ? 'ИГРА НАЧИНАЕТСЯ' : k === peak && v.plan[v.roundIdx - 1] !== peak ? 'ПИК ПАРТИИ' : '');
      const a = $('#announce');
      a.innerHTML = `<div class="an-back"></div><div class="an-box">
        ${tag ? `<div class="an-tag">${tag}</div>` : ''}
        <div class="an-title"><span>${T('РАУНД')}</span> <b>${n}</b></div>
        <div class="an-sub">${T('{c} · {n} из {t}', { c: poCards(k), n, t: total })}</div>
        <div class="an-line"></div></div>`;
      a.className = 'on' + (n === total ? ' final' : '');
      const cx = VIEW.w / 2, cy = VIEW.h * 0.45;
      SFX.roundGong(n === total);
      setTimeout(() => {
        FX.ring(cx, cy, { r1: Math.max(VIEW.w, VIEW.h) * 0.6, color: '#f6d27a', width: 5, life: 0.8 });
        FX.raysAt(cx, cy, { count: 16, len: Math.max(VIEW.w, VIEW.h) * 0.7, color: 'rgba(246,210,122,1)', life: 1.3, a: 0.3, spin: 0.6, force: true });
        FX.burst(cx, cy, { n: 50, colors: FX.GOLD, speed: [200, 600], size: [1.5, 3], g: 120, life: [0.6, 1.2] });
        if (n === total) { FX.ring(cx, cy, { r1: 260, color: '#ff4d5e', width: 4, delay: 0.1 }); FX.shake(8, 0.4); }
        else FX.shake(4, 0.25);
      }, 260);
      await wait(1500);
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
      const target = SPOT_ANGLE[spotOf(v, v.leader)];
      if (target == null) return;
      const mine = v.leader === v.you;
      // У себя фишку закрывают карты руки: она крупнее, с ореолом и выезжает с подстаканника на сукно.
      const kTo = mine ? 1.2 : 1, inTo = mine ? 1 : 0;
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
        // У себя: с подстаканника на сукно слева перед рукой — там его не закрывают ни карты, ни панель заявки.
        const x = 500 + Math.cos(a) * 408 + (262 - 500 - Math.cos(a) * 408) * inn;
        const y = 300 + Math.sin(a) * 226 + (412 - 300 - Math.sin(a) * 226) * inn;
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
      if (this.puckAnim && this.puckTarget === target && !fast) return; // уже едет туда
      cancelAnimationFrame(this.puckRaf); this.puckAnim = false; this.puckTarget = target;
      if (this.puckDeg == null || fast) { this.puckK = kTo; this.puckIn = inTo; this.puckDeg = target; place(target); return; }
      if (!isFinite(this.puckDeg)) this.puckDeg = target;
      if (!isFinite(this.puckIn)) this.puckIn = inTo;
      if (!isFinite(this.puckK)) this.puckK = kTo;
      let from = this.puckDeg, to = target;
      while (to <= from) to += 360; // только по часовой стрелке
      if (to - from >= 360) to -= 360;
      const kFrom = this.puckK, inFrom = this.puckIn;
      const roll = to - from >= 0.5;
      // Одно непрерывное движение: шар катится по кругу и сразу плавно сворачивает к месту остановки
      // (съезд с сукна и выезд на сукно идут одновременно с качением, без отдельных рывков).
      const tOut = 0;
      const tRoll = roll ? 800 + (to - from) * 3 : 0;
      const tIn = !roll && Math.abs(inTo - inFrom) > 0.01 ? 420 : 0;
      const total = tRoll + tIn;
      if (!total) { this.puckK = kTo; this.puckIn = inTo; place(target); return; }
      if (roll) SFX.puck();
      const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const t0 = performance.now();
      this.puckAnim = true;
      const step = now => {
        const el = now - t0;
        let deg = from;
        if (el < tRoll) {
          const e = ease(el / tRoll);
          deg = from + (to - from) * e;
          this.puckK = kFrom + (kTo - kFrom) * e;
          this.puckIn = inFrom + (inTo - inFrom) * e;
        } else {
          deg = to;
          this.puckK = kTo;
          this.puckIn = tIn ? inFrom + (inTo - inFrom) * ease(Math.min(1, (el - tRoll) / tIn)) : inTo;
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
          this.puckAnim = false; this.puckDeg = target; this.puckK = kTo; this.puckIn = inTo; place(target);
          puck.classList.add('landed'); setTimeout(() => puck.classList.remove('landed'), 600);
          if (roll) {
            // Мягкий подскок на месте — в той же системе координат, без смещения.
            const h0 = performance.now();
            const hop = t => {
              const k = Math.min(1, (t - h0) / 520);
              this.ballHop = Math.abs(Math.sin(k * Math.PI * 2)) * 9 * (1 - k);
              if (this.puckAnim || this.puckTarget !== target) { this.ballHop = 0; return; }
              place(target);
              if (k < 1) requestAnimationFrame(hop); else this.ballHop = 0;
            };
            requestAnimationFrame(hop);
          }
          const body = puck.querySelector(".ball-body");
          if (body && roll) {
            const [bx, by] = VIEW.center(body);
            FX.ring(bx, by, { r1: 46 * kTo, color: '#f6d27a', width: 2.5, life: 0.5 });
            FX.burst(bx, by, { n: 10, speed: [60, 180], size: [1.2, 2.6], g: 160, life: [0.4, 0.8] });
          }
        }
      };
      this.puckRaf = requestAnimationFrame(step);
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
    refreshFaces() {
      if (!this.el) return;
      this.el.querySelectorAll('.card').forEach(el => {
        if (el.dataset.id) el.querySelector('.front').style.backgroundImage = Cards.url(Cards.parse(el.dataset.id));
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
      banner(T(v.fix ? 'ЗАМЕНИ КАРТУ!' : v.phase === 'bid' ? 'ТВОЯ ЗАЯВКА' : 'ТВОЙ ХОД'), v.fix ? 'crimson' : 'gold', true);
      SFX.yourTurn(); vibrate(40);
      [...this.hand.values()].forEach((el, i) => setTimeout(() => { el.classList.remove('boom'); void el.offsetWidth; el.classList.add('boom'); }, i * 45));
    },

    tapHand(id, el) {
      const v = S.view;
      SFX.unlock(); Parallax.enableGyro();
      if (!v || v.stage !== 'game') return;
      const myPlay = v.phase === 'play' && v.turn === v.you && !v.paused;
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
      if (v.paused) t = T('Пауза — голосование');
      else if (v.fix) {
        mine = v.fix.p === v.you; warn = true;
        t = mine ? T('Вас поймали! Положите честную карту') : T('{n} пойман на обмане — меняет карту', { n: nm(v.fix.p) });
      } else if (v.phase === 'bid') { mine = v.turn === v.you; t = mine ? T('Ваша заявка') : T('Заявляет {n}…', { n: nm(v.turn) }); }
      else if (v.phase === 'play') {
        mine = v.turn === v.you;
        if (mine) {
          const tr = v.trick, lead = tr && tr.plays.length ? tr.plays[0].card.suit : null;
          const need = v.bids[v.you] - v.took[v.you];
          t = tr && tr.command && tr.plays.length ? T('Старшие на стол — самую сильную') : !lead ? T('Ваш ход — вы ведёте') :
            v.hand.some(c => c.suit === lead) ? T('Ваш ход — в масть {s}', { s: lead }) : T('Ваш ход — масти {s} нет', { s: lead });
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
      showModal(`<h2 class="gold-text">${T('Итоги раунда {n}', { n: v.roundIdx + 1 })}</h2>
        <table class="res-table"><tr><th>${T('Игрок')}</th><th>${T('Заявка / взял')}</th><th>${T('За раунд')}</th>${anyBonus ? `<th>${T('Проверки')}</th>` : ''}<th>${T('Всего')}</th></tr>
        ${order.map((p, i) => `<tr class="res-row ${p === v.you ? 'me-row' : ''}" style="animation-delay:${i * 90}ms"><td>${esc(v.names[p])}${p === v.you ? ` <span class="hint">${T('(вы)')}</span>` : ''}</td>
          <td>${h.bids[p]} / ${h.took[p]}</td><td class="d ${h.delta[p] >= 0 ? 'pos' : 'neg'}" data-count="${h.delta[p]}" data-signed="1">0</td>
          ${anyBonus ? `<td class="d ${bonus[p] > 0 ? 'pos' : bonus[p] < 0 ? 'neg' : 'hint'}">${bonus[p] ? (bonus[p] > 0 ? '+' : '') + bonus[p] : '—'}</td>` : ''}
          <td class="d"><span class="gold-text" data-count="${v.scores[p]}" data-from="${v.scores[p] - h.delta[p] - bonus[p]}">${v.scores[p] - h.delta[p] - bonus[p]}</span></td></tr>`).join('')}
        </table><div class="actions"><span class="hint" style="margin-right:auto">${T('Следующий раунд: {c}', { c: poCards(v.plan[v.roundIdx + 1]) })}</span>
        <button class="btn-gold" data-act="nextRound">${T('Следующий раунд')}</button></div>`);
      const ov = $('#overlay');
      ov.dataset.kind = 'results';
      ov.querySelectorAll('[data-count]').forEach(td => countUp(td, +(td.dataset.from || 0), +td.dataset.count, 900, !!td.dataset.signed));
    },

    async showGameOver(v, fast) {
      const h = v.history[v.history.length - 1];
      if (h && this.shown && v.scores.some((sc, p) => sc !== this.shown[p])) await this.roundCoins(v, h, fast);
      if (!fast) await wait(700);
      const order = v.names.map((_, p) => p).sort((a, b) => v.scores[b] - v.scores[a]);
      const iWon = v.scores[v.you] === v.scores[order[0]];
      const podium = order.map((p, i) => `<div class="pl p${i + 1}" style="animation-delay:${(order.length - i) * 150}ms"><div>${esc(v.names[p])}</div><div class="bar">${v.scores[p]}</div></div>`);
      const arranged = order.length >= 3 ? [podium[1], podium[0], podium[2], ...podium.slice(3)] : podium;
      showModal(`<h2 class="gold-text" style="text-align:center">${T(iWon ? 'Победа!' : 'Игра окончена')}</h2>
        <div class="podium">${arranged.join('')}</div>
        <div class="over-rating" id="over-rating"></div>
        <div class="actions" style="justify-content:center">${v.kind === 'ranked' ? `<button class="btn-gold" data-act="research">${T(v.calib ? 'Дальше' : 'Новый поиск')}</button>`
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
  function banner(text, cls, quick, sub) {
    const b = $('#banner');
    b.innerHTML = `<div class="t ${cls}">${esc(text)}</div>${sub ? `<div class="bsub">${esc(sub)}</div>` : ''}`;
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
        this.bubble(e.from, e.text, 'chat');
        if (!this.open && e.from !== v.you) { this.unread++; this.badge(); }
        if (e.from !== v.you) SFX.msg();
      } else if (e.kind === 'phrase') {
        if (isMuted(name, 'emote')) return;
        this.bubble(e.from, T(e.id), 'phrase');
        SFX.msg();
      } else if (e.kind === 'emote') {
        if (isMuted(name, 'emote')) return;
        this.emote(e.from, e.id);
      } else if (e.kind === 'like') {
        if (isMuted(name, 'emote')) return;
        this.like(e.from, e.to);
      } else if (e.kind === 'dislike') {
        if (isMuted(name, 'emote')) return;
        this.dislike(e.from, e.to);
      } else if (e.kind === 'mud') {
        if (isMuted(name, 'emote')) return;
        this.mud(e.from, e.to);
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
      setTimeout(() => b.classList.add('out'), kind === 'chat' ? 4200 : 2600);
      setTimeout(() => b.remove(), kind === 'chat' ? 4700 : 3100);
    },

    emote(seat, id) {
      const [x, y] = this.avatarCenter(seat);
      const conf = EMO_FX[id] || {};
      const el = document.createElement('div');
      el.className = `emo ${conf.cls || ''}`;
      el.textContent = id;
      el.style.left = x + 'px'; el.style.top = (y - 10) + 'px';
      $('#app').appendChild(el);
      setTimeout(() => conf.fx && conf.fx(x, y - 30), 180);
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

    // Грязь (только лидер): ком грязи летит по дуге и шлёпается на аватар, брызги и подтёки держатся несколько секунд.
    mud(from, to) {
      const [x1, y1] = this.avatarCenter(from), [x2, y2] = this.avatarCenter(to);
      const ball = document.createElement('div');
      ball.className = 'mud-ball';
      $('#app').appendChild(ball);
      const peak = Math.min(y1, y2) - 150;
      SFX.mudThrow();
      const a = ball.animate([
        { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.6) rotate(0deg)` },
        { transform: `translate(${(x1 + x2) / 2}px, ${peak}px) translate(-50%,-50%) scale(1.3) rotate(260deg)`, offset: 0.5 },
        { transform: `translate(${x2}px, ${y2}px) translate(-50%,-50%) scale(1) rotate(520deg)` },
      ], { duration: 820, easing: 'cubic-bezier(.35,.1,.6,1)', fill: 'forwards' });
      let trail = setInterval(() => {
        const r = VIEW.rect(ball);
        FX.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 2, type: 'dust', colors: ['#5a3a1c'], speed: [5, 20], g: 120, life: [0.4, 0.7], size: [6, 10], size2: 0.6, add: false });
      }, 50);
      a.finished.then(() => {
        clearInterval(trail);
        ball.remove();
        SFX.splat();
        FX.burst(x2, y2, { n: 34, type: 'dust', colors: ['#6b4423', '#4a2e14', '#8a5a2b'], speed: [120, 380], g: 520, life: [0.6, 1.1], size: [6, 14], size2: 0.7, add: false });
        FX.burst(x2, y2, { n: 16, type: 'glyph', glyphs: ['●'], colors: ['#5a3a1c', '#7a4e26'], speed: [160, 340], g: 600, life: [0.6, 1], size: [8, 16], add: false });
        FX.shake(5, 0.25);
        vibrate(40);
        const av = this.avatarEl(to);
        if (!av) return;
        av.classList.remove('booed'); void av.offsetWidth; av.classList.add('booed');
        const splat = document.createElement('div');
        splat.className = 'mud-splat';
        splat.innerHTML = mudSvg();
        av.appendChild(splat);
        setTimeout(() => { splat.classList.add('out'); av.classList.remove('booed'); }, 6500);
        setTimeout(() => splat.remove(), 7300);
      }).catch(() => { clearInterval(trail); ball.remove(); });
    },

    renderChat(v) {
      const list = $('#chat-list');
      if (!list) return;
      const msgs = v.chat.filter(m => !isMuted(m.name, 'chat'));
      const key = msgs.map(m => m.seq).join(',');
      if (list.dataset.key === key) return;
      list.dataset.key = key;
      list.innerHTML = msgs.map(m => `<div class="${m.from === v.you ? 'mine' : ''}"><b style="color:${nameColor(m.from)}">${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('') || `<div class="hint">${T('Сообщений пока нет')}</div>`;
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

    // Меню аватара соперника: лайк и три блокировки.
    openAvatarMenu(seat) {
      const v = S.view;
      if (!v || seat === v.you || !v.seats[seat]) return;
      const s = v.seats[seat];
      const m = mutesOf(s.name);
      const [x, y] = this.avatarCenter(seat);
      const now = Date.now();
      const left = k => Math.ceil(Math.max(0, this.readyAt[k] - now) / 1000);
      const L = left('like'), D = left('dislike'), M = left('mud');
      const pop = $('#ava-menu');
      pop.innerHTML = `<div class="am-title">${esc(s.name)}${s.bot ? ` <span class="hint">${T('бот')}</span>` : ''}</div>
        <div class="am-acts">
          <button class="am-act like" data-act="like" data-seat="${seat}" ${L ? 'disabled' : ''}><span>👍</span>${L ? T('{n} с', { n: L }) : T('Лайк')}</button>
          <button class="am-act dislike" data-act="dislike" data-seat="${seat}" ${D ? 'disabled' : ''}><span>👎</span>${D ? T('{n} с', { n: D }) : T('Дизлайк')}</button>
          <button class="am-act mud" data-act="mud" data-seat="${seat}" ${M || !this.canMud ? 'disabled' : ''} title="${T(this.canMud ? 'Кинуть грязью' : 'Только для лидера по очкам')}"><span>🟤</span>${!this.canMud ? T('Только лидер') : M ? T('{n} с', { n: M }) : T('Грязью!')}</button>
        </div>
        <div class="am-row">
          <button class="am-tg ${m.voice ? 'on' : ''}" data-act="mute" data-what="voice" data-seat="${seat}" ${s.bot ? 'disabled' : ''}><span>🎙</span>${T(m.voice ? 'Голос выкл' : 'Голос')}</button>
          <button class="am-tg ${m.chat ? 'on' : ''}" data-act="mute" data-what="chat" data-seat="${seat}"><span>💬</span>${T(m.chat ? 'Чат выкл' : 'Чат')}</button>
          <button class="am-tg ${m.emote ? 'on' : ''}" data-act="mute" data-what="emote" data-seat="${seat}"><span>😀</span>${T(m.emote ? 'Эмоции выкл' : 'Эмоции')}</button>
        </div>`;
      pop.style.left = Math.min(VIEW.w - 150, Math.max(150, x)) + 'px';
      pop.style.top = (y > VIEW.h / 2 ? y - 70 : y + 70) + 'px';
      pop.classList.toggle('above', y > VIEW.h / 2);
      pop.classList.add('on');
      pop.dataset.seat = seat;
      clearInterval(this.amT);
      if (L || D || M) this.amT = setInterval(() => { if (!pop.classList.contains('on')) return clearInterval(this.amT); this.openAvatarMenu(seat); }, 1000);
    },
    closeAvatarMenu() { $('#ava-menu').classList.remove('on'); clearInterval(this.amT); },

    openEmotes() {
      const v = S.view;
      const pick = $('#emo-pick');
      if (pick.classList.contains('on')) { pick.classList.remove('on'); return; }
      const emotes = v.emotes || [];
      pick.innerHTML = `<div class="wheel">${emotes.map((e, i) => {
        const a = (i / emotes.length) * Math.PI * 2 - Math.PI / 2;
        return `<button class="wheel-item" style="--x:${(Math.cos(a) * 74).toFixed(1)}px;--y:${(Math.sin(a) * 74).toFixed(1)}px;animation-delay:${i * 25}ms" data-act="emote" data-id="${e}">${e}</button>`;
      }).join('')}<div class="wheel-hub">😀</div></div>
        <div class="phrases">${(v.phrases || []).map(p => `<button class="phrase" data-act="emote" data-id="${esc(p)}">${esc(T(p))}</button>`).join('')}</div>`;
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

  function rtcSend(to, data) {
    if (!S.room) return;
    fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: S.room, token: S.token, type: 'rtc', to, data }) }).catch(() => {});
  }
  async function social(body) {
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
  function buildDock() {
    const dock = document.createElement('div');
    dock.id = 'dock';
    dock.innerHTML = `
      <div class="chat-panel glass" id="chat-panel">
        <div class="chat-head"><span>${T('Чат стола')}</span><button data-act="chat-close">✕</button></div>
        <div class="chat-list" id="chat-list"></div>
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
      social({ type: 'chat', text });
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
    tab: b => { S.tab = b.dataset.tab; syncHome(); if (S.tab === 'join') loadRooms(); },
    rankedSize: b => { S.rankedSize = +b.dataset.n; syncHome(); },
    casualSize: b => { S.casualSize = +b.dataset.n; syncHome(); },
    listed: () => { S.listed = !S.listed; syncHome(); },
    search: b => startSearch(b.dataset.mode),
    cancelSearch: () => cancelSearch(),
    botsNow: async () => {
      // Не ждать: свой стол с ботами, старт сразу.
      cancelSearch();
      const name = load(STORE_KEY).name || (Auth.me && Auth.me.nick) || T('Игрок');
      const players = S.casualSize || 4;
      try {
        const j = await api('/api/create', { name, players, rounds: 2 * MAX_CARDS(players) - 1, turnTime: 30, lang: I18N.lang, session: Auth.session });
        await api('/api/action', { room: j.room, token: j.token, type: 'start' });
        connect(j.room, j.token);
      } catch (e) { toast(e.message); }
    },
    calib: async () => {
      const name = (cur('#name') && cur('#name').value.trim()) || (Auth.me && Auth.me.nick) || '';
      try {
        const j = await api('/api/calib', { session: Auth.session, name, players: S.rankedSize || 4, lang: I18N.lang });
        connect(j.room, j.token);
      } catch (e) { toast(e.message); }
    },
    joinRoom: async b => {
      const name = (cur('#name') && cur('#name').value.trim()) || (Auth.me && Auth.me.nick) || '';
      if (!name) { const e = cur('#err'); if (e) e.textContent = T('Введите имя'); cur('#name') && cur('#name').focus(); return; }
      save(STORE_KEY, { name });
      try { const j = await api('/api/join', { name, room: b.dataset.code, session: Auth.session }); connect(j.room, j.token); }
      catch (e) { toast(e.message); loadRooms(); }
    },
    research: () => {
      const calib = S.view && S.view.calib;
      leave();
      S.tab = 'ranked'; syncHome(); renderRankedPane();
      if (calib && Auth.me && Auth.me.games < 5) actions.calib();
      else startSearch('ranked');
    },
    players: b => { S.players = +b.dataset.n; syncHome(); },
    rounds: b => { S.roundsTouched = true; S.rounds = Math.max(1, Math.min(60, S.rounds + +b.dataset.d)); syncHome(); },
    timer: b => { const t = S.turnTime + +b.dataset.d; S.turnTime = clampTimer(t < 5 && +b.dataset.d < 0 ? 0 : t === 5 && +b.dataset.d > 0 && S.turnTime === 0 ? 5 : t); syncHome(); },
    bluff: () => { S.bluff = !S.bluff; syncHome(); },
    skills: () => { S.skills = !S.skills; syncHome(); },
    skill: b => {
      SFX.unlock();
      const v = S.view;
      if (!v || !v.skills || !v.skills.reshuffle.can) { nope(b); toast(T(!v || !v.skills || !v.skills.reshuffle.left ? 'Пересдача уже использована' : 'Пересдача — только пока идут заявки')); return; }
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
      const name = $('#name').value.trim();
      if (!name) { $('#err').textContent = T('Введите имя'); $('#name').focus(); return; }
      const tv = $('#timer-val'); if (tv) S.turnTime = clampTimer(parseInt(tv.value, 10));
      save(STORE_KEY, { name });
      try { const j = await api('/api/create', { name, players: S.players, rounds: S.rounds, turnTime: S.turnTime, bluff: S.bluff, skills: S.skills, listed: S.listed, lang: I18N.lang, session: Auth.session }); connect(j.room, j.token); }
      catch (e) { $('#err').textContent = e.message; }
    },
    join: async () => {
      const name = $('#name').value.trim();
      const room = $('#code').value.trim().toUpperCase();
      if (!name) { $('#err').textContent = T('Введите имя'); $('#name').focus(); return; }
      if (room.length !== 4) { $('#err').textContent = T('Код комнаты — 4 символа'); return; }
      save(STORE_KEY, { name });
      try { const j = await api('/api/join', { name, room, session: Auth.session }); connect(j.room, j.token); }
      catch (e) { $('#err').textContent = e.message; }
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
    nextRound: () => { closeModal(); act({ type: 'nextRound' }); },
    chat: () => { $('#emo-pick').classList.remove('on'); Social.toggleChat(); if (Social.open) setTimeout(() => $('#chat-input').focus(), 50); },
    'chat-close': () => Social.toggleChat(false),
    emotes: () => { Social.toggleChat(false); Social.openEmotes(); },
    emote: b => { $('#emo-pick').classList.remove('on'); social({ type: 'emote', id: b.dataset.id }); },
    like: b => { Social.closeAvatarMenu(); social({ type: 'like', to: +b.dataset.seat }); },
    dislike: b => { Social.closeAvatarMenu(); social({ type: 'dislike', to: +b.dataset.seat }); },
    mud: b => { Social.closeAvatarMenu(); social({ type: 'mud', to: +b.dataset.seat }); },
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
    theme: b => { prefs.cards = b.dataset.t; savePrefs(); Cards.setTheme(prefs.cards); syncHome(); if (S.screen === 'home') { showHomeFanRefresh(); } Game.refreshFaces(); if ($('#overlay').classList.contains('on') && $('#overlay .menu-list')) showMenu(); },
    lang: b => {
      const l = b.dataset.l;
      if (l === I18N.lang) return;
      const nm = $('#name'); if (nm && nm.value.trim()) save(STORE_KEY, { name: nm.value.trim() });
      prefs.lang = l; savePrefs(); I18N.set(l); applyLangStatic(); relabelDock();
      const menuOpen = $('#overlay').classList.contains('on') && $('#overlay .menu-list');
      if (S.screen === 'home') { S.screen = null; showHome(); }
      else if (S.screen === 'lobby' && S.view) { S.screen = null; showLobby(S.view); }
      else if (S.screen === 'game' && S.view) enqueue({ remount: true }); // пересобрать стол в очереди, после текущей анимации
      if (menuOpen) showMenu();
    },
    install: () => installApp(),
    voteKick: b => act({ type: 'voteKick', seat: +b.dataset.seat }),
    vote: b => act({ type: 'vote', value: b.dataset.yes === '1' }),
    scores: () => showScores(),
    menu: () => showMenu(),
    rules: () => showModal(rulesHtml()),
    close: () => closeModal(),
    fullscreen: () => goFullscreen(),
    sound: b => { prefs.sound = !prefs.sound; save(PREF_KEY, prefs); applyPrefs(); if (b.closest('.sound-modal')) showSoundSettings(); else showMenu(); if (prefs.sound) SFX.chip(); },
    soundcfg: () => showSoundSettings(),
    music: () => {
      prefs.music = !prefs.music;
      if (prefs.music && prefs.musicVol === 0) prefs.musicVol = 0.1;
      save(PREF_KEY, prefs); applyPrefs(); syncMusicCtl();
    },
    quality: () => { prefs.fx = prefs.fx === 'high' ? 'low' : 'high'; save(PREF_KEY, prefs); applyPrefs(); showMenu(); },
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
      if (S.tab === 'join') actions.join(); else if (S.tab === 'create') actions.create();
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

  function init() {
    Cards.setTheme(prefs.cards);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    buildDock();
    applyPrefs();
    FX.init($('#fx'), $('#shake'));
    motes();
    const sess = load(STORE_KEY);
    const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    if (sess.room && sess.token && (!roomParam || roomParam === sess.room)) connect(sess.room, sess.token);
    else showHome();
    Auth.init();
  }
  window.VT = { S, Game, Social, Auth, tierOf, enqueue };
  init();
})();
