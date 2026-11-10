// Веб-клиент «По ушам». Только показывает стол и отправляет действия — все правила на сервере.
'use strict';
const app = document.getElementById('app');
const STORE_KEY = 'pousham-session';
const S = { view: null, es: null, room: null, token: null, pendingSpecial: false, err: '', confirmQuit: false, busy: false, connecting: false, prefillCode: '' };

// ---------- хранение сессии (переживает перезагрузку страницы) ----------
function loadSession() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function saveSession(patch) { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadSession(), ...patch })); } catch {} }
function clearRoom() { saveSession({ room: null, token: null }); }

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
  saveSession({ room, token });
  if (S.es) S.es.close();
  const es = new EventSource(`/api/events?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`);
  es.onmessage = e => {
    S.view = JSON.parse(e.data);
    S.connecting = false;
    if (!(S.view.stage === 'game' && S.view.turn === S.view.you && S.view.phase === 'play')) S.pendingSpecial = false;
    render();
  };
  es.addEventListener('kicked', e => {
    let reason = 'Вас убрали со стола.';
    try { reason = JSON.parse(e.data).reason || reason; } catch {}
    es.close();
    leave();
    S.err = reason;
    render();
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      const code = S.room;
      leave();
      S.prefillCode = code || '';
      S.err = 'Не удалось вернуться за стол автоматически. Введите код комнаты и то же имя, под которым играли, — и нажмите «Войти». ' +
        'Если сервер перезапускался, комната могла пропасть — тогда создайте новую.';
      render();
    }
  };
  S.es = es;
  history.replaceState(null, '', '?room=' + room);
}
function leave() {
  if (S.es) S.es.close();
  S.es = null; S.view = null; S.room = null; S.token = null; S.confirmQuit = false; S.connecting = false;
  clearRoom();
  history.replaceState(null, '', '/');
  render();
}
async function act(body) {
  if (S.busy) return;
  S.busy = true; S.err = '';
  try { await api('/api/action', { room: S.room, token: S.token, ...body }); }
  catch (e) { S.err = e.message; render(); }
  finally { S.busy = false; }
}

// ---------- обработчики ----------
window.onCreate = async () => {
  const name = document.getElementById('name').value;
  saveSession({ name });
  try {
    const j = await api('/api/create', { name, players: document.getElementById('players').value, rounds: document.getElementById('rounds').value });
    connect(j.room, j.token);
  } catch (e) { S.err = e.message; render(); }
};
window.onJoin = async () => {
  const name = document.getElementById('name').value;
  const room = document.getElementById('code').value.trim().toUpperCase();
  saveSession({ name });
  try { const j = await api('/api/join', { name, room }); connect(j.room, j.token); }
  catch (e) { S.err = e.message; render(); }
};
window.onCopy = async () => {
  const link = `${location.origin}/?room=${S.view.code}`;
  try { await navigator.clipboard.writeText(link); S.err = 'Ссылка скопирована'; } catch { S.err = 'Скопируйте ссылку: ' + link; }
  render();
};
window.onLeave = () => {
  if (S.view && S.view.stage === 'game' && S.view.phase !== 'gameOver' && !S.confirmQuit) { S.confirmQuit = true; render(); return; }
  leave();
};
window.onLeaveCancel = () => { S.confirmQuit = false; render(); };
window.onStart = () => act({ type: 'start' });
window.onRestart = () => act({ type: 'restart' });
window.onBid = b => act({ type: 'bid', value: b });
window.onCard = id => {
  if (id === '7♠' && S.view.specialModes.length > 1) { S.pendingSpecial = true; render(); return; }
  act({ type: 'play', cardId: id, mode: 'normal' });
};
window.onSpecial = mode => { S.pendingSpecial = false; act({ type: 'play', cardId: '7♠', mode }); };
window.onSpecialCancel = () => { S.pendingSpecial = false; render(); };
window.onNextRound = () => act({ type: 'nextRound' });
window.onKick = seat => act({ type: 'kick', seat });
window.onVoteKick = seat => act({ type: 'voteKick', seat });
window.onVote = yes => act({ type: 'vote', value: yes });

// ---------- отрисовка ----------
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isRed = c => c.suit === '♥' || c.suit === '♦';
const cardHtml = c => `<span class="card ${isRed(c) ? 'red' : ''} ${c.id === '7♠' ? 'special' : ''}">${c.id}</span>`;
const errHtml = () => (S.err ? `<div style="color:#c62828;margin-top:6px">${esc(S.err)}</div>` : '');

function rulesHtml() {
  return `<details class="panel"><summary>Правила</summary><ul class="rules">
    <li>Колода 36 карт, 2–4 игрока. Козыри — черви ♥.</li>
    <li>Раунды: по 1, 2 … 9 карт, затем по убыванию до 1. Если раундов больше 17 — добавляются раунды по 9 карт.</li>
    <li><b>Право первого хода:</b> в первом раунде у случайного игрока, дальше переходит по часовой стрелке (★).</li>
    <li><b>Заявление:</b> начинает игрок после того, у кого первый ход. Заявить можно от 0 до числа карт на руке; сумма заявок может быть любой.</li>
    <li><b>Ходы:</b> первым ходит игрок с ★. Остальные отвечают <b>в масть</b> первой карты; козырь ♥ и 7♠ можно положить всегда. Если ходят козырем — отвечать козырем, если он есть. Нет нужной масти — любую карту. Бьёт старшая той же масти или козырь; взятку забирает сильнейшая карта, её владелец ходит следующим.</li>
    <li><b>Очки:</b> взял ровно заявленное — +20 за карту; заявил 0 и взял 0 — +5; недобор — −20 за каждую недостающую; перебор — +2.</li>
    <li><b>7♠:</b> всегда можно сыграть как обычную. Первым ходом — «Старшие на стол!»: все кладут самую сильную карту, взятку забирает ходивший. В ответ — как самую старшую карту, забирает взятку.</li>
  </ul></details>`;
}

function renderHome() {
  const sess = loadSession();
  const roomParam = new URLSearchParams(location.search).get('room') || S.prefillCode || '';
  app.innerHTML = `
    <h1>По ушам</h1>
    <div class="panel col">
      <label>Ваше имя: <input id="name" maxlength="20" value="${esc(sess.name || '')}" placeholder="Имя"></label>
    </div>
    <div class="grid2">
      <div class="panel col">
        <h3>Создать стол</h3>
        <div class="row">
          <label>Игроков: <select id="players">${[2, 3, 4].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Раундов: <input id="rounds" type="number" min="1" max="40" value="17" style="width:70px"></label>
        </div>
        <div><button class="btn" onclick="onCreate()">Создать</button></div>
        <span class="hint">Пустые места займут боты.</span>
      </div>
      <div class="panel col">
        <h3>Войти по коду</h3>
        <label>Код комнаты: <input id="code" maxlength="4" value="${esc(roomParam)}" style="width:90px;text-transform:uppercase"></label>
        <div><button class="btn" onclick="onJoin()">Войти</button></div>
        <span class="hint">Вылетели из игры? Введите код и то же имя — вернётесь на своё место.</span>
      </div>
    </div>
    ${errHtml()}
    ${rulesHtml()}`;
}

function renderLobby(v) {
  const seats = Array.from({ length: v.size }, (_, i) => {
    const s = v.seats[i];
    if (!s) return `<div class="seat"><div class="name hint">Свободно</div><div class="meta">займёт бот, если никто не придёт</div></div>`;
    const kick = v.isHost && !s.host ? `<div style="margin-top:6px"><button class="btn alt" onclick="onKick(${i})">Убрать</button></div>` : '';
    return `<div class="seat ${i === v.you ? 'me' : ''}"><div class="name"><span class="dot ${s.online ? '' : 'off'}"></span>${esc(s.name)}${s.host ? ' (хост)' : ''}${i === v.you ? ' (вы)' : ''}</div>${s.online ? '' : '<div class="meta">не в сети</div>'}${kick}</div>`;
  }).join('');
  app.innerHTML = `
    <div class="bar"><h1>По ушам</h1><button class="btn alt" onclick="onLeave()">Выйти</button></div>
    <div class="panel">
      <h3>Код комнаты</h3>
      <div class="row"><span class="code-big">${esc(v.code)}</span><button class="btn alt" onclick="onCopy()">Скопировать ссылку</button></div>
      <p class="hint">Друзья открывают ссылку или вводят код на главной странице. Раундов: ${v.rounds} (${v.plan.join(', ')}).</p>
    </div>
    <div class="seats" style="margin-bottom:12px">${seats}</div>
    <div class="panel">${v.isHost
      ? `<button class="btn" onclick="onStart()">Начать игру</button> <span class="hint">Пустые места займут боты.</span>`
      : `<span class="hint">Ждём, когда хост начнёт игру…</span>`}${errHtml()}</div>
    ${rulesHtml()}`;
}

function renderGame(v) {
  const me = v.you;
  const k = v.plan[v.roundIdx];
  const t = v.trick;
  const myTurn = v.turn === me && (v.phase === 'bid' || v.phase === 'play');
  // Места по кругу, начиная с себя.
  const order = Array.from({ length: v.n }, (_, i) => (me + i) % v.n);

  const seats = order.map(p => {
    const s = v.seats[p];
    const isTurn = v.turn === p && (v.phase === 'bid' || v.phase === 'play');
    return `<div class="seat ${isTurn ? 'turn' : ''} ${p === me ? 'me' : ''}">
      <div class="name"><span class="dot ${s.online ? '' : 'off'}"></span>${esc(s.name)}${p === me ? ' (вы)' : ''} ${p === v.leader ? '★' : ''}</div>
      <div class="meta">Очки: <b>${v.scores[p]}</b></div>
      <div class="meta">Заявка: <b>${v.bids[p] === null ? '—' : v.bids[p]}</b> · Взял: <b>${v.took[p]}</b></div>
      <div class="meta">Карт: ${v.handCounts[p]}</div>
      ${!s.bot && !s.online ? `<div class="meta" style="color:#c62828">вылетел</div>${!v.vote && p !== me
        ? `<div style="margin-top:6px"><button class="btn alt" onclick="onVoteKick(${p})">Заменить ботом</button></div>` : ''}` : ''}
    </div>`;
  }).join('');

  let table = '<span class="hint">Пусто</span>';
  if (t && t.plays.length) {
    const winP = v.phase === 'trickDone' ? v.trickWinner : null;
    table = (t.command ? '<div style="margin-bottom:6px"><span class="badge">7♠ — «СТАРШИЕ НА СТОЛ!»</span></div>' : '') +
      t.plays.map(pl => `<div class="play ${pl.p === winP ? 'win' : ''}">${cardHtml(pl.card)}${esc(v.names[pl.p])}${pl.mode === 'top' ? '<span class="badge">старшая!</span>' : ''}</div>`).join('');
  }
  const last = v.lastTrick && v.phase !== 'trickDone'
    ? `<div class="hint" style="margin-top:6px">Прошлая взятка (${esc(v.names[v.lastTrick.winner])}): ${v.lastTrick.plays.map(pl => pl.card.id).join(' ')}</div>` : '';

  let action = '';
  if (v.vote) {
    const vt = v.vote;
    const voted = vt.yes.includes(me) || vt.no.includes(me);
    const canVote = vt.voters.includes(me) && !voted;
    const waiting = vt.voters.filter(i => !vt.yes.includes(i) && !vt.no.includes(i)).map(i => esc(v.names[i]));
    action = `<h3>Пауза — голосование</h3>
      <div>Заменить ботом игрока <b>${esc(v.names[vt.target])}</b>? <span class="hint">За: ${vt.yes.length} · Против: ${vt.no.length}</span></div>
      ${canVote ? `<div class="row" style="margin-top:6px"><button class="btn" onclick="onVote(true)">Да, заменить</button><button class="btn alt" onclick="onVote(false)">Нет, подождём</button></div>` : ''}
      <div class="hint" style="margin-top:6px">${waiting.length ? 'Ждём голоса: ' + waiting.join(', ') : ''} Если ${esc(v.names[vt.target])} вернётся, голосование отменится.</div>`;
  } else if (v.phase === 'bid') {
    action = myTurn
      ? `<h3>Ваша заявка</h3><div class="row">${Array.from({ length: k + 1 }, (_, b) => `<button class="btn alt" onclick="onBid(${b})">${b}</button>`).join('')}</div>`
      : `<span class="hint">Заявляет ${esc(v.names[v.turn])}…</span>`;
  } else if (v.phase === 'play') {
    if (myTurn && S.pendingSpecial) {
      const m = v.specialModes;
      action = `<h3>Как сыграть 7♠?</h3><div class="row">
        <button class="btn alt" onclick="onSpecial('normal')">Как обычную 7♠</button>
        ${m.includes('command') ? `<button class="btn purple" onclick="onSpecial('command')">«Старшие на стол!» — забрать взятку</button>` : ''}
        ${m.includes('top') ? `<button class="btn purple" onclick="onSpecial('top')">Как самую старшую — забрать взятку</button>` : ''}
        <button class="btn alt" onclick="onSpecialCancel()">Отмена</button></div>`;
    } else if (myTurn) {
      const need = v.bids[me] - v.took[me];
      const lead = t.plays.length ? t.plays[0].card.suit : null;
      const hint = t.command && t.plays.length ? 'Команда «Старшие на стол!» — кладите самую сильную карту.'
        : !lead ? 'Вы ведёте взятку.'
        : v.hand.some(c => c.suit === lead) ? `Ходите в масть ${lead} (или козырем ♥ / 7♠).` : `Масти ${lead} нет — можно любую карту.`;
      action = `<b>Ваш ход.</b> <span class="hint">${hint} Осталось добрать: ${Math.max(0, need)}${need < 0 ? ' (уже перебор)' : ''}.</span>`;
    } else action = `<span class="hint">Ходит ${esc(v.names[v.turn])}…</span>`;
  } else if (v.phase === 'trickDone') {
    action = `<span class="hint">Взятку забирает ${esc(v.names[v.trickWinner])}…</span>`;
  } else if (v.phase === 'roundDone') {
    action = `<b>Раунд окончен.</b> <button class="btn" onclick="onNextRound()">Следующий раунд</button>`;
  } else if (v.phase === 'gameOver') {
    const max = Math.max(...v.scores);
    const winners = v.names.filter((_, p) => v.scores[p] === max).join(', ');
    action = `<b>Игра окончена! Победитель: ${esc(winners)} (${max} очков).</b> ` +
      (v.isHost ? `<button class="btn" onclick="onRestart()">Ещё партию</button>` : `<span class="hint">Новую партию запускает хост.</span>`);
  }

  const legal = new Set(S.pendingSpecial ? [] : v.legal);
  const hand = v.hand.map(c => `<button class="card ${isRed(c) ? 'red' : ''} ${c.id === '7♠' ? 'special' : ''}" ${legal.has(c.id) ? '' : 'disabled'}
      onclick="onCard('${c.id}')">${c.id}</button>`).join('') || '<span class="hint">Карт нет</span>';

  const head = `<tr><th>#</th><th>Карт</th>${v.names.map(n => `<th>${esc(n)}</th>`).join('')}</tr>`;
  const rows = v.history.map((h, i) => `<tr><td>${i + 1}</td><td>${h.cards}</td>${h.delta.map((d, p) =>
    `<td class="${d >= 0 ? 'pos' : 'neg'}">${h.bids[p]}/${h.took[p]}: ${d >= 0 ? '+' : ''}${d}</td>`).join('')}</tr>`).join('');
  const total = `<tr><th></th><th>Итого</th>${v.scores.map(s => `<th>${s}</th>`).join('')}</tr>`;

  app.innerHTML = `
    <div class="bar"><h1>По ушам <span class="hint">· ${esc(v.code)}</span></h1>
      <div class="row"><span>Раунд <b>${v.roundIdx + 1}/${v.plan.length}</b> · по <b>${k}</b> карт · Козырь <b style="color:#c62828">♥</b></span>
      ${S.confirmQuit
        ? `<span>Покинуть стол?</span> <button class="btn" onclick="onLeave()">Да</button> <button class="btn alt" onclick="onLeaveCancel()">Нет</button>`
        : `<button class="btn alt" onclick="onLeave()">Выйти</button>`}</div></div>
    <div class="seats" style="margin-bottom:12px">${seats}</div>
    <div class="panel"><h3>Стол</h3><div class="table-area">${table}</div>${last}</div>
    <div class="panel">${action}${errHtml()}</div>
    <div class="panel"><h3>Ваши карты</h3>${hand}</div>
    <div class="panel"><h3>Таблица очков (заявка/взял: очки)</h3><table>${head}${rows}${total}</table></div>
    <div class="panel"><h3>Журнал</h3><div class="log">${v.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div></div>
    ${rulesHtml()}`;
}

function render() {
  if (!S.view && S.connecting) {
    app.innerHTML = `<h1>По ушам</h1><div class="panel">Подключаюсь к столу ${esc(S.room || '')}… <span class="hint">Если сервер спал, это может занять до минуты.</span></div>`;
    return;
  }
  if (!S.view) renderHome();
  else if (S.view.stage === 'lobby') renderLobby(S.view);
  else renderGame(S.view);
}

// ---------- старт ----------
(function init() {
  const sess = loadSession();
  const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (sess.room && sess.token && (!roomParam || roomParam === sess.room)) connect(sess.room, sess.token);
  render();
})();
