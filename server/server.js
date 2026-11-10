// Сервер «В Точку»: комнаты по коду, ходы игроков, боты на пустых местах.
// HTTP для действий, Server-Sent Events для обновлений стола. Аккаунты Google и рейтинг — в базе (server/db.js).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Engine, Bots } = require('../engine/engine.js');
const Rating = require('./rating');
const Google = require('./google');
const DB = require('./db').create();

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const BOT_NAMES = ['Бот Аня', 'Бот Борис', 'Бот Вика', 'Бот Гоша', 'Бот Даша'];
const BOT_NAMES_EN = ['Bot Anna', 'Bot Boris', 'Bot Vika', 'Bot Gosha', 'Bot Dasha'];
const BOT_DELAY = 1000;
const TRICK_PAUSE = 2100; // время на эффекты последней карты и показ, кто взял
const TRICK_PAUSE_BLUFF = 5000; // в режиме обмана — время, чтобы успеть проверить
const DEFAULT_TURN_TIME = 30;
const ROOM_TTL = 3 * 60 * 60 * 1000; // пустая комната живёт 3 часа
// Client ID не секретный; переменная GOOGLE_CLIENT_ID на Render позволяет сменить его без правки кода.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '626516411258-ii9eiq7dni57082mmiil8mhbdma9p8qr.apps.googleusercontent.com';

const STATIC = {
  '/': 'client/index.html',
  '/index.html': 'client/index.html',
  '/privacy': 'client/privacy.html',
  '/privacy.html': 'client/privacy.html',
  '/client.js': 'client/client.js',
  '/style.css': 'client/style.css',
  '/qrcode.js': 'client/qrcode.js',
  '/cards.js': 'client/cards.js',
  '/cards-light.js': 'client/cards-light.js',
  '/cards-sil.js': 'client/cards-sil.js',
  '/i18n.js': 'client/i18n.js',
  '/brand.js': 'client/brand.js',
  '/viewport.js': 'client/viewport.js',
  '/voice.js': 'client/voice.js',
  '/sw.js': 'client/sw.js',
  '/manifest.webmanifest': 'client/manifest.webmanifest',
  '/icons/icon-180.png': 'client/icons/icon-180.png',
  '/icons/icon-192.png': 'client/icons/icon-192.png',
  '/icons/icon-512.png': 'client/icons/icon-512.png',
  '/icons/maskable-512.png': 'client/icons/maskable-512.png',
  '/fx.js': 'client/fx.js',
  '/engine.js': 'engine/engine.js',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const EMOTES = ['😂', '😱', '🖕', '😎', '😡', '🤔', '👏', '💀'];
const PHRASES = ['Блефуешь!', 'Проверю!', 'Ну ты даёшь', 'Везёт же', 'Давай быстрее', 'Красиво!', 'Не верю', 'GG'];
const LIKE_COOLDOWN = 60 * 1000; // у лайка, дизлайка и грязи — своя минута у каждого
const CHAT_GAP = 1200, EMOTE_GAP = 1500;

/** @type {Map<string, any>} */
const rooms = new Map();

// ---------- утилиты ----------
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const newToken = () => crypto.randomBytes(16).toString('hex');
const newPid = () => crypto.randomBytes(6).toString('hex');
const clampInt = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const cleanName = s => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Игрок';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e5) { reject(new Error('Слишком большой запрос')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('Неверный JSON')); } });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
class GameError extends Error {}
const fail = msg => { throw new GameError(msg); };

// ---------- комнаты ----------
function getRoom(code) {
  const r = rooms.get(String(code || '').toUpperCase());
  if (!r) fail('Комната не найдена');
  return r;
}
function seatOf(r, token) { return token ? r.seats.findIndex(s => s.token === token) : -1; }
function requireSeat(r, token) { const s = seatOf(r, token); if (s < 0) fail('Вы не за этим столом'); return s; }
function isOnline(r, seat) { for (const st of r.streams) if (st.seat === seat) return true; return false; }

function createRoom({ name, players, rounds, turnTime, bluff, lang }, acc = null) {
  const size = clampInt(players, Engine.MIN_PLAYERS, Engine.MAX_PLAYERS, 4);
  const r = {
    code: newCode(),
    size,
    rounds: clampInt(rounds, 1, 60, 2 * Engine.maxCards(size) - 1),
    turnTime: clampInt(turnTime, 0, 600, DEFAULT_TURN_TIME), // секунд на ход, 0 — без таймера
    bluff: !!bluff,
    lang: lang === 'en' ? 'en' : 'ru', // язык имён ботов
    turnTimer: null, turnKey: null, deadline: 0, checkTimers: [],
    chat: [], social: [], socialSeq: 0,
    seats: [],
    game: null,
    streams: new Set(),
    timer: null,
    touched: Date.now(),
  };
  const token = newToken();
  r.seats.push({ name: cleanName(name), token, bot: false, pid: newPid(), ...accSeat(acc) });
  r.hostSeat = 0;
  rooms.set(r.code, r);
  return { r, token };
}

// Аккаунт игрока на месте: id для рейтинга и рейтинг на момент входа (для показа).
const accSeat = acc => (acc ? { uid: acc.id, rating: acc.rating } : { uid: null, rating: null });

// Вход в комнату. Если за столом есть отключившийся игрок с тем же именем — это он вернулся:
// отдаём ему его место с новым ключом (старый ключ перестаёт работать).
// Игрок с аккаунтом возвращается на своё место по аккаунту; чужое место с аккаунтом по имени занять нельзя.
function joinRoom(r, name, acc = null) {
  const nm = cleanName(name);
  if (acc) {
    const mine = r.seats.findIndex(s => !s.bot && s.uid === acc.id);
    if (mine >= 0) {
      if (isOnline(r, mine)) fail('Вы уже за этим столом — закройте другую вкладку.');
      const token = newToken();
      r.seats[mine].token = token;
      return { token, rejoined: true };
    }
  }
  const same = r.seats.findIndex(s => !s.bot && s.name.toLowerCase() === nm.toLowerCase());
  if (same >= 0 && r.seats[same].uid && (!acc || acc.id !== r.seats[same].uid)) {
    fail(`Имя «${r.seats[same].name}» занято игроком с аккаунтом Google. Если это вы — войдите в тот же аккаунт, иначе выберите другое имя.`);
  }
  if (same >= 0) {
    if (isOnline(r, same)) fail(`Игрок «${r.seats[same].name}» уже за столом. Если это вы — закройте другую вкладку или введите другое имя.`);
    const token = newToken();
    r.seats[same].token = token;
    return { token, rejoined: true };
  }
  if (r.game) {
    const offline = r.seats.filter((s, i) => !s.bot && !isOnline(r, i)).map(s => s.name);
    fail(offline.length
      ? `Игра уже идёт. Чтобы вернуться за стол, введите имя, под которым играли: ${offline.join(', ')}.`
      : 'Игра в этой комнате уже идёт, свободных мест нет.');
  }
  if (r.seats.length >= r.size) fail('Свободных мест нет');
  const token = newToken();
  r.seats.push({ name: nm, token, bot: false, pid: newPid(), ...accSeat(acc) });
  return { token, rejoined: false };
}

// ---------- кик и голосование ----------
const humanSeats = r => r.seats.map((s, i) => i).filter(i => !r.seats[i].bot);
function gameLog(r, msg) { if (r.game) { r.game.log.push(msg); if (r.game.log.length > 300) r.game.log.shift(); } }

// Закрыть соединения игрока и сообщить ему, что его убрали со стола.
function dropStreams(r, seat, reason) {
  for (const st of [...r.streams]) {
    if (st.seat !== seat) continue;
    r.streams.delete(st);
    try { st.res.write(`event: kicked\ndata: ${JSON.stringify({ reason })}\n\n`); st.res.end(); } catch {}
  }
}

// Лобби: хост убирает игрока, места остальных сдвигаются.
function lobbyKick(r, target) {
  if (!r.seats[target] || target === r.hostSeat) fail('Этого игрока убрать нельзя');
  dropStreams(r, target, 'Хост убрал вас из комнаты.');
  r.seats.splice(target, 1);
  for (const st of r.streams) if (st.seat > target) st.seat--;
  if (r.hostSeat > target) r.hostSeat--;
}

// Игра: место вылетевшего игрока занимает бот.
function replaceWithBot(r, target) {
  const s = r.seats[target];
  dropStreams(r, target, 'Голосованием ваше место отдано боту.');
  s.bot = true; s.token = null; s.name = `${s.name} (${r.lang === 'en' ? 'bot' : 'бот'})`;
  if (s.uid) s.left = true; // в рейтинге ушедший считается последним
  r.game.names[target] = s.name;
  gameLog(r, `${s.name}: место игрока занял бот`);
  if (target === r.hostSeat) {
    const next = humanSeats(r)[0];
    if (next !== undefined) { r.hostSeat = next; gameLog(r, `Новый хост — ${r.seats[next].name}`); }
  }
}

// Голосуют все, кто в сети (кроме того, за кого голосуют). Пока не проголосовали все — пауза.
function voters(r) { return humanSeats(r).filter(i => i !== r.vote.target && isOnline(r, i)); }
function checkVote(r) {
  const v = r.vote;
  if (!v) return;
  const name = r.seats[v.target].name;
  if (isOnline(r, v.target)) { r.vote = null; gameLog(r, `${name} вернулся — голосование отменено`); return; }
  const list = voters(r);
  for (const i of [...v.yes]) if (!list.includes(i)) v.yes.delete(i);
  for (const i of [...v.no]) if (!list.includes(i)) v.no.delete(i);
  if (!list.every(i => v.yes.has(i) || v.no.has(i))) return;
  r.vote = null;
  if (v.yes.size > v.no.size) { gameLog(r, `Голосование: ${name} заменён ботом (${v.yes.size} за, ${v.no.size} против)`); replaceWithBot(r, v.target); }
  else gameLog(r, `Голосование: ${name} остаётся за столом (${v.yes.size} за, ${v.no.size} против)`);
}

function startGame(r) {
  let b = 0;
  while (r.seats.length < r.size) r.seats.push({ name: (r.lang === 'en' ? BOT_NAMES_EN : BOT_NAMES)[b++], token: null, bot: true, pid: newPid() });
  r.seenPlays = new Set();
  r.game = Engine.newGame({ players: r.size, rounds: r.rounds, names: r.seats.map(s => s.name), bluff: r.bluff });
}

function seatView(r, s, i) {
  return { name: s.name, bot: s.bot, online: s.bot || isOnline(r, i), host: i === r.hostSeat, pid: s.pid, rating: s.uid && !s.left ? s.rating : null };
}

// Что видит конкретный игрок: только свои карты, у остальных — количество.
function viewFor(r, seat) {
  const hostSeat = r.hostSeat;
  const me = r.seats[seat];
  const base = {
    code: r.code, you: seat, youPid: me.pid, isHost: seat === hostSeat, size: r.size, rounds: r.rounds, turnTime: r.turnTime, bluff: r.bluff,
    chat: r.chat.slice(-40), social: r.social.slice(-16),
    likeReadyIn: Math.max(0, (me.likeAt || 0) + LIKE_COOLDOWN - Date.now()),
    dislikeReadyIn: Math.max(0, (me.dislikeAt || 0) + LIKE_COOLDOWN - Date.now()),
    mudReadyIn: Math.max(0, (me.mudAt || 0) + LIKE_COOLDOWN - Date.now()),
    canMud: isLeader(r, seat),
    emotes: EMOTES, phrases: PHRASES,
  };
  if (!r.game) {
    return {
      ...base, stage: 'lobby', plan: Engine.roundPlan(r.rounds, Engine.maxCards(r.size)),
      seats: r.seats.map((s, i) => seatView(r, s, i)),
    };
  }
  const g = r.game;
  const myTurn = g.turn === seat && (g.phase === 'bid' || g.phase === 'play');
  return {
    ...base, stage: 'game',
    names: g.names,
    seats: r.seats.map((s, i) => seatView(r, s, i)),
    n: g.n, plan: g.plan, roundIdx: g.roundIdx, phase: g.phase, turn: g.turn, leader: g.leader,
    bids: g.bids, took: g.took, scores: g.scores,
    handCounts: g.hands.map(h => h.length),
    hand: g.hands[seat],
    trick: publicTrick(g.trick), lastTrick: publicTrick(g.lastTrick), trickWinner: g.trickWinner,
    history: g.history, log: g.log.slice(-60),
    legal: myTurn && g.phase === 'play' ? Engine.legalPlays(g, seat).map(c => c.id) : [],
    honest: myTurn && g.phase === 'play' ? Engine.strictLegal(g, seat).map(c => c.id) : [],
    fix: g.fix ? { p: g.fix.p } : null,
    lastCheck: g.lastCheck,
    timer: r.deadline && r.turnKey ? { left: Math.max(0, r.deadline - Date.now()), total: r.turnTime * 1000 } : null,
    specialModes: myTurn ? Engine.specialModes(g, seat) : [],
    paused: !!r.vote,
    rating: g.phase === 'gameOver' ? (g.rating || null) : null,
    vote: r.vote ? {
      target: r.vote.target,
      yes: [...r.vote.yes], no: [...r.vote.no],
      voters: voters(r),
    } : null,
  };
}

// Карты на столе без скрытого признака «честно/нечестно».
function publicTrick(t) {
  if (!t) return null;
  return { ...t, plays: t.plays.map(pl => ({ p: pl.p, card: pl.card, mode: pl.mode, absolute: pl.absolute, checked: pl.checked, forced: pl.forced })) };
}

function broadcast(r) {
  for (const st of r.streams) {
    try { st.res.write(`data: ${JSON.stringify(viewFor(r, st.seat))}\n\n`); } catch { /* закрытое соединение уберёт обработчик close */ }
  }
}

// Боты и автоматическая пауза после взятки.
function schedule(r) {
  clearTimeout(r.timer);
  const g = r.game;
  if (!g || r.vote) return; // голосование — пауза
  if (g.phase === 'trickDone') {
    r.timer = setTimeout(() => { Engine.nextTrick(g); update(r); }, g.bluff ? TRICK_PAUSE_BLUFF : TRICK_PAUSE);
  } else if ((g.phase === 'bid' || g.phase === 'play') && r.seats[g.turn].bot) {
    r.timer = setTimeout(() => {
      const p = g.turn;
      try {
        if (g.phase === 'bid') Engine.placeBid(g, p, Bots.bid(g, p));
        else if (g.phase === 'play') { const m = Bots.play(g, p); Engine.playCard(g, p, m.cardId, m.mode); }
      } catch (e) { console.error('bot error', e); }
      update(r);
    }, BOT_DELAY);
  }
}
// Таймер хода для живых игроков: по истечении — автоматическая заявка или случайная честная карта.
function turnKeyOf(r) {
  const g = r.game;
  if (!g || r.vote || !r.turnTime || r.seats[g.turn].bot) return null;
  if (g.phase !== 'bid' && g.phase !== 'play') return null;
  return `${g.roundIdx}:${g.phase}:${g.turn}:${g.trick ? g.trick.plays.length : 0}:${g.fix ? 'f' : ''}:${g.took.join('')}`;
}
function scheduleTurnTimer(r) {
  const key = turnKeyOf(r);
  if (key === r.turnKey) return;
  clearTimeout(r.turnTimer);
  r.turnKey = key;
  r.deadline = key ? Date.now() + r.turnTime * 1000 : 0;
  if (!key) return;
  r.turnTimer = setTimeout(() => {
    const g = r.game;
    if (!g || turnKeyOf(r) !== key) return;
    const p = g.turn;
    try {
      if (g.phase === 'bid') {
        Engine.placeBid(g, p, Bots.bid(g, p));
      } else {
        const honest = Engine.strictLegal(g, p);
        const c = honest[Math.floor(Math.random() * honest.length)];
        Engine.playCard(g, p, c.id, 'normal');
      }
      gameLog(r, `${r.seats[p].name}: время вышло — ход сделан автоматически`);
    } catch (e) { console.error('timeout move error', e); }
    update(r);
  }, r.turnTime * 1000 + 300);
}

// Боты в режиме обмана иногда проверяют подозрительные карты.
function scheduleBotChecks(r) {
  const g = r.game;
  if (!g || !g.bluff || g.fix || r.vote || !g.trick) return;
  if (g.phase !== 'play' && g.phase !== 'trickDone') return;
  r.seenPlays = r.seenPlays || new Set();
  for (const pl of g.trick.plays) {
    const key = `${g.roundIdx}:${pl.card.id}`;
    if (r.seenPlays.has(key)) continue;
    r.seenPlays.add(key);
    for (let b = 0; b < g.n; b++) {
      if (!r.seats[b].bot || b === pl.p) continue;
      if (Math.random() >= Bots.suspicion(g, b, pl)) continue;
      const t = setTimeout(() => {
        if (r.game !== g || r.vote || Engine.canCheck(g, b, pl.card.id)) return;
        try { Engine.check(g, b, pl.card.id); update(r); } catch {}
      }, 900 + Math.random() * 1600);
      r.checkTimers.push(t);
      break;
    }
  }
}

function update(r) {
  r.touched = Date.now();
  if (r.game && r.game.phase === 'gameOver' && !r.game.rating) rateGame(r, r.game);
  scheduleTurnTimer(r);
  broadcast(r);
  schedule(r);
  scheduleBotChecks(r);
}

// Лидер по очкам: у него больше всех (если не у всех поровну). Только лидер может кидаться грязью.
function isLeader(r, seat) {
  const g = r.game;
  if (!g) return false;
  const max = Math.max(...g.scores), min = Math.min(...g.scores);
  return max !== min && g.scores[seat] === max;
}

// Общение: чат, эмоции, лайки, дизлайки, грязь. Не влияет на игру и не сбрасывает таймеры ботов.
function socialAction(r, seat, body) {
  const s = r.seats[seat];
  const now = Date.now();
  const push = ev => { ev.seq = ++r.socialSeq; ev.at = now; ev.from = seat; r.social.push(ev); if (r.social.length > 40) r.social.shift(); };
  if (body.type === 'chat') {
    const text = String(body.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!text) fail('Пустое сообщение');
    if (now - (s.chatAt || 0) < CHAT_GAP) fail('Не так быстро');
    s.chatAt = now;
    const msg = { seq: ++r.socialSeq, at: now, from: seat, name: s.name, text };
    r.chat.push(msg); if (r.chat.length > 60) r.chat.shift();
    r.social.push({ ...msg, kind: 'chat' }); if (r.social.length > 40) r.social.shift();
    return;
  }
  if (body.type === 'emote') {
    const id = String(body.id || '');
    const phrase = PHRASES.includes(id);
    if (!EMOTES.includes(id) && !phrase) fail('Нет такой эмоции');
    if (now - (s.emoteAt || 0) < EMOTE_GAP) fail('Не так быстро');
    s.emoteAt = now;
    push({ kind: phrase ? 'phrase' : 'emote', id });
    return;
  }
  if (body.type === 'like' || body.type === 'dislike' || body.type === 'mud') {
    const kind = body.type;
    const to = Number(body.to);
    const what = { like: 'Лайк', dislike: 'Дизлайк', mud: 'Грязь' }[kind];
    if (!r.seats[to] || to === seat) fail('Выберите другого игрока');
    if (kind === 'mud' && !isLeader(r, seat)) fail('Кидаться грязью может только лидер');
    const key = kind + 'At';
    const left = (s[key] || 0) + LIKE_COOLDOWN - now;
    if (left > 0) fail(`${what} можно через ${Math.ceil(left / 1000)} с`);
    s[key] = now;
    push({ kind, to });
    return;
  }
  fail('Неизвестное действие');
}

// Боты тоже общаются: изредка ставят лайки и дизлайки, бот-лидер иногда кидается грязью.
// Кулдауны те же, что у людей (по минуте на каждое действие).
function botSocialTick(r) {
  const g = r.game;
  if (!g || r.vote || g.phase === 'gameOver' || r.streams.size === 0) return;
  const now = Date.now();
  for (let b = 0; b < r.seats.length; b++) {
    const s = r.seats[b];
    if (!s.bot || Math.random() > 0.08) continue;
    const others = r.seats.map((_, i) => i).filter(i => i !== b);
    if (!others.length) continue;
    // Чаще «общаемся» с живыми игроками.
    const humans = others.filter(i => !r.seats[i].bot);
    const pool = humans.length && Math.random() < 0.7 ? humans : others;
    const to = pool[Math.floor(Math.random() * pool.length)];
    const ready = k => now - (s[k + 'At'] || 0) >= LIKE_COOLDOWN;
    let kind = null;
    if (isLeader(r, b) && ready('mud') && Math.random() < 0.35) kind = 'mud';
    else if (Math.random() < 0.55 ? ready('like') : false) kind = 'like';
    else if (ready('dislike')) kind = 'dislike';
    if (!kind) continue;
    // Дизлайк — тому, у кого больше очков; лайк — тому, у кого меньше (чтобы выглядело осмысленно).
    let target = to;
    if (kind !== 'mud' && others.length > 1) {
      const sorted = others.slice().sort((a, c) => g.scores[c] - g.scores[a]);
      if (Math.random() < 0.5) target = kind === 'dislike' ? sorted[0] : sorted[sorted.length - 1];
    }
    try { socialAction(r, b, { type: kind, to: target }); } catch { continue; }
    broadcast(r);
    break; // не больше одного действия за тик
  }
}

// Голос: пересылка сигналов WebRTC (предложение/ответ/кандидаты) нужному игроку по его pid.
function relayRtc(r, seat, body) {
  const to = r.seats.findIndex(s => s.pid === body.to);
  if (to < 0) fail('Игрок не найден');
  const msg = JSON.stringify({ from: r.seats[seat].pid, data: body.data });
  if (msg.length > 20000) fail('Слишком большое сообщение');
  for (const st of r.streams) if (st.seat === to) { try { st.res.write(`event: rtc\ndata: ${msg}\n\n`); } catch {} }
}

function doAction(r, seat, body) {
  const g = r.game;
  const type = body.type;
  if (type === 'start') {
    if (seat !== r.hostSeat) fail('Начать игру может только хост');
    if (r.game) fail('Игра уже идёт');
    startGame(r);
    return;
  }
  if (type === 'restart') {
    if (seat !== r.hostSeat) fail('Новую партию начинает хост');
    if (!g || g.phase !== 'gameOver') fail('Партия ещё не закончена');
    r.seenPlays = new Set();
    for (const s of r.seats) if (s.bot) { s.uid = null; s.left = false; s.rating = null; } // ушедшие в новой партии не участвуют
    r.game = Engine.newGame({ players: r.size, rounds: r.rounds, names: r.seats.map(s => s.name), bluff: r.bluff });
    return;
  }
  if (type === 'kick') {
    if (seat !== r.hostSeat) fail('Убирать игроков может только хост');
    if (r.game) fail('Во время игры — только голосованием');
    lobbyKick(r, Number(body.seat));
    return;
  }
  if (!g) fail('Игра ещё не началась');
  if (type === 'voteKick') {
    const target = Number(body.seat);
    if (r.vote) fail('Голосование уже идёт');
    if (!r.seats[target] || r.seats[target].bot || target === seat) fail('За этого игрока голосовать нельзя');
    if (isOnline(r, target)) fail('Игрок в сети — голосовать можно только за вылетевшего');
    r.vote = { target, yes: new Set([seat]), no: new Set() };
    gameLog(r, `${r.seats[seat].name} предлагает заменить ботом игрока ${r.seats[target].name}. Игра на паузе.`);
    checkVote(r);
    return;
  }
  if (type === 'vote') {
    const v = r.vote;
    if (!v) fail('Голосования нет');
    if (!voters(r).includes(seat)) fail('Вы не участвуете в этом голосовании');
    if (v.yes.has(seat) || v.no.has(seat)) fail('Вы уже проголосовали');
    (body.value ? v.yes : v.no).add(seat);
    checkVote(r);
    return;
  }
  if (r.vote) fail('Игра на паузе: идёт голосование');
  try {
    if (type === 'bid') Engine.placeBid(g, seat, Number(body.value));
    else if (type === 'play') Engine.playCard(g, seat, String(body.cardId), body.mode || 'normal');
    else if (type === 'nextRound') Engine.nextRound(g);
    else if (type === 'check') Engine.check(g, seat, String(body.cardId));
    else fail('Неизвестное действие');
  } catch (e) {
    if (e instanceof GameError) throw e;
    throw new GameError(e.message);
  }
}

// ---------- рейтинг ----------
// Партия окончена: если за столом минимум 2 игрока с аккаунтом — считаем попарное Эло и пишем в базу.
// Результат (g.rating) уходит всем в состоянии стола: { status: 'pending' | 'done' | 'skip' | 'error', ... }.
function rateGame(r, g) {
  const seats = r.seats.map((s, i) => ({ s, i })).filter(x => x.s.uid);
  if (seats.length < Rating.MIN_RATED) {
    g.rating = { status: 'skip', reason: 'Партия не в рейтинге: нужно минимум двое игроков, вошедших через Google.' };
    return;
  }
  if (!DB.ready()) { g.rating = { status: 'skip', reason: 'Рейтинг сейчас недоступен (нет связи с базой).' }; return; }
  g.rating = { status: 'pending' };
  // Места — среди всех за столом (боты и гости тоже занимают места); ушедшие — последние.
  const all = r.seats.map((s, i) => ({ score: g.scores[i], left: !!s.left }));
  const placeAll = Rating.places(all);
  const entries = seats.map(({ s, i }) => ({ playerId: s.uid, score: g.scores[i], left: !!s.left, place: placeAll[i] }));
  DB.recordMatch({ room: r.code, seats: r.size, rounds: r.rounds, bluff: r.bluff }, entries).then(res => {
    const changes = {};
    for (const x of res) {
      const seat = seats.find(({ s }) => s.uid === x.playerId).i;
      changes[seat] = { before: x.before, after: x.after, delta: x.delta, place: x.place };
      if (!r.seats[seat].left) r.seats[seat].rating = x.after;
    }
    g.rating = { status: 'done', changes };
  }).catch(e => {
    console.error('rating:', e.message);
    g.rating = { status: 'error', reason: 'Не удалось сохранить рейтинг — партия не засчитана.' };
  }).finally(() => { if (r.game === g) broadcast(r); });
}

// Аккаунт по ключу сессии (или null для гостя). Заодно запоминаем имя за столом — оно идёт в таблицу лидеров.
async function accountOf(session, nick) {
  if (!session) return null;
  const acc = await DB.bySession(session);
  if (acc && nick) { try { await DB.setNick(acc.id, nick); acc.nick = cleanName(nick); } catch {} }
  return acc;
}

// ---------- HTTP ----------
async function handleApi(req, res, url) {
  if (url.pathname === '/api/events' && req.method === 'GET') {
    const r = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
    const seat = r ? seatOf(r, url.searchParams.get('token')) : -1;
    if (!r || seat < 0) return sendJson(res, 404, { error: 'Комната не найдена' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const st = { res, seat };
    r.streams.add(st);
    r.touched = Date.now();
    checkVote(r);
    update(r);
    req.on('close', () => { if (r.streams.delete(st)) { checkVote(r); update(r); } });
    return;
  }
  if (url.pathname === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, { googleClientId: GOOGLE_CLIENT_ID, ratings: DB.ready() });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Метод не поддерживается' });
  const body = await readBody(req);
  if (url.pathname === '/api/auth/google') {
    let u;
    try { u = await Google.verifyIdToken(body.credential, GOOGLE_CLIENT_ID); }
    catch (e) { fail('Вход через Google не удался: ' + e.message); }
    let acc;
    try { acc = await DB.upsertGoogle({ ...u, nick: body.nick }); }
    catch (e) { console.error('auth db:', e.message); fail('База данных недоступна, попробуйте позже'); }
    const session = await DB.newSession(acc.id);
    return sendJson(res, 200, { session, me: acc });
  }
  if (url.pathname === '/api/me') {
    if (!DB.ready()) return sendJson(res, 503, { error: 'База данных недоступна' }); // не путать с «сессии нет»
    const me = await DB.bySession(body.session).catch(() => null);
    return sendJson(res, 200, { me });
  }
  if (url.pathname === '/api/logout') {
    if (body.session) await DB.dropSession(body.session).catch(() => {});
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname === '/api/leaderboard') {
    const me = await DB.bySession(body.session).catch(() => null);
    let board;
    try { board = await DB.leaderboard(50, me && me.id); }
    catch (e) { fail('Таблица лидеров сейчас недоступна'); }
    return sendJson(res, 200, board);
  }
  if (url.pathname === '/api/create') {
    const acc = await accountOf(body.session, body.name);
    const { r, token } = createRoom(body, acc);
    return sendJson(res, 200, { room: r.code, token });
  }
  if (url.pathname === '/api/join') {
    const r = getRoom(body.room);
    const acc = await accountOf(body.session, body.name);
    const { token, rejoined } = joinRoom(r, body.name, acc);
    update(r);
    return sendJson(res, 200, { room: r.code, token, rejoined });
  }
  if (url.pathname === '/api/action') {
    const r = getRoom(body.room);
    const seat = requireSeat(r, body.token);
    if (body.type === 'rtc') { relayRtc(r, seat, body); return sendJson(res, 200, { ok: true }); }
    if (['chat', 'emote', 'like', 'dislike', 'mud'].includes(body.type)) { socialAction(r, seat, body); r.touched = Date.now(); broadcast(r); return sendJson(res, 200, { ok: true }); }
    doAction(r, seat, body);
    update(r);
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'Не найдено' });
}

function serveStatic(req, res, url) {
  const rel = STATIC[url.pathname];
  if (!rel) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Ошибка сервера'); }
    const ext = path.extname(rel);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, rooms: rooms.size, db: DB.health(), google: !!process.env.GOOGLE_CLIENT_ID });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    if (!(e instanceof GameError)) console.error(e);
    if (!res.headersSent) sendJson(res, e instanceof GameError ? 400 : 500, { error: e instanceof GameError ? e.message : 'Ошибка сервера' });
  }
});

setInterval(() => { for (const r of rooms.values()) { try { botSocialTick(r); } catch (e) { console.error('bot social', e); } } }, 9000);

// Пинг держит SSE-соединения живыми за прокси; уборка старых комнат.
setInterval(() => { for (const r of rooms.values()) for (const st of r.streams) { try { st.res.write(': ping\n\n'); } catch {} } }, 20000);
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (r.streams.size === 0 && now - r.touched > ROOM_TTL) { clearTimeout(r.timer); rooms.delete(code); }
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log(`В Точку: сервер запущен на порту ${PORT}`));
DB.init();
module.exports = { server, rooms, DB };
