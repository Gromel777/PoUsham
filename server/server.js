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
// Окно «Пересдачи» перед заявками: 3 с после того, как у игроков отыграли объявление раунда и раздача.
const PRE_WINDOW = 3000;
// Итоги раунда: следующий раунд — когда все живые игроки нажали «Следующий раунд», или по таймеру.
const NEXT_WAIT = 15000;      // сколько ждём забывших (отсчёт видят все)
const RESULTS_ANIM = 5000;    // запас на сбор карт, монеты и корону: окно итогов появляется позже конца раунда
const RESHUFFLE_FX = 4500; // после пересдачи — время на анимацию тасовки и новую раздачу
const preIntro = (k, n, special = false) => (special ? 4200 : 3300) + Math.min(1600, k * n * 110) + k * 55;
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
  '/room-cozy.js': 'client/room-cozy.js',
  '/i18n.js': 'client/i18n.js',
  '/brand.js': 'client/brand.js',
  '/viewport.js': 'client/viewport.js',
  '/voice.js': 'client/voice.js',
  '/music.js': 'client/music.js',
  '/sw.js': 'client/sw.js',
  '/manifest.webmanifest': 'client/manifest.webmanifest',
  '/icons/icon-180.png': 'client/icons/icon-180.png',
  '/icons/icon-192.png': 'client/icons/icon-192.png',
  '/icons/icon-512.png': 'client/icons/icon-512.png',
  '/icons/maskable-512.png': 'client/icons/maskable-512.png',
  '/img/logo.webp': 'client/img/logo.webp',
  '/fx.js': 'client/fx.js',
  '/engine.js': 'engine/engine.js',
  '/tutorial.js': 'client/tutorial.js',
  '/music/menu.mp3': 'client/music/menu.mp3',
  '/music/ranked.mp3': 'client/music/ranked.mp3',
  '/music/victory.mp3': 'client/music/victory.mp3',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json; charset=utf-8', '.mp3': 'audio/mpeg' };
const EMOTES = ['😂', '😱', '🖕', '😎', '😡', '🤔', '👏', '💀'];
// Пул смайликов, из которых игрок собирает своё колесо эмоций (такой же список в client.js).
const EMOTE_POOL = ['😂', '😱', '🖕', '😎', '😡', '🤔', '👏', '💀', '🤣', '😭', '😏', '🙄', '😴', '🤯', '🥳', '😇', '🤡', '🤬', '🥶', '😈', '👍', '👎', '🙏', '🤝', '👀', '🔥', '💩', '❤️', '💔', '🍀', '🎯', '🏆'];
const PHRASE_MAX = 24; // свои фразы игрока на колесе
const PHRASES = ['Блефуешь!', 'Проверю!', 'Ну ты даёшь', 'Везёт же', 'Давай быстрее', 'Красиво!', 'Не верю', 'GG'];
const LIKE_COOLDOWN = 60 * 1000; // у лайка, дизлайка и грязи — своя минута у каждого
const CHAT_GAP = 1200, EMOTE_GAP = 1500;
// Пауза (как в Dota): у каждого игрока несколько пауз на партию; снять может любой — через отсчёт 5…1.
const PAUSES_PER_PLAYER = 3;
const UNPAUSE_COUNTDOWN = 5000;
const PAUSE_MAX = 5 * 60 * 1000; // дольше — пауза снимается сама (тоже с отсчётом)

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

// kind: 'private' — по коду; 'public' — виден в списке столов; 'casual' — собран подбором (без рейтинга);
// 'ranked' — собран рейтинговым подбором или калибровка с ботами (calib).
function createRoom({ name, players, rounds, turnTime, bluff, skills, test, lang, listed }, acc = null, extra = {}) {
  const size = clampInt(players, Engine.MIN_PLAYERS, Engine.MAX_PLAYERS, 4);
  const r = {
    code: newCode(),
    kind: listed ? 'public' : 'private',
    calib: false,
    autoStartAt: 0,
    created: Date.now(),
    size,
    rounds: clampInt(rounds, 1, 60, 2 * Engine.maxCards(size) - 1),
    turnTime: clampInt(turnTime, 0, 600, DEFAULT_TURN_TIME), // секунд на ход, 0 — без таймера
    bluff: !!bluff,
    skills: skills !== false && !extra.kind, // умения: на своих столах по умолчанию включены, в подборе и рейтинге — нет
    // «Тестовый режим» (только свои столы): 17 раундов, 10-й — «Бескозырка», 15-й — «Тёмная».
    test: !!test && !extra.kind,
    lang: lang === 'en' ? 'en' : 'ru', // язык имён ботов
    turnTimer: null, turnKey: null, deadline: 0, checkTimers: [],
    chat: [], social: [], socialSeq: 0,
    seats: [],
    game: null,
    streams: new Set(),
    timer: null,
    touched: Date.now(),
  };
  Object.assign(r, extra);
  if (r.test) r.rounds = 17;
  const token = newToken();
  r.seats.push({ name: cleanName(name), token, bot: false, pid: newPid(), ...accSeat(acc) });
  r.hostSeat = 0;
  rooms.set(r.code, r);
  return { r, token };
}

// Аккаунт игрока на месте: id для рейтинга и рейтинг на момент входа (для показа).
const accSeat = acc => (acc ? { uid: acc.id, rating: acc.rating, pic: acc.picture || null } : { uid: null, rating: null, pic: null });
const matchedRoom = r => r.kind === 'ranked' || r.kind === 'casual';

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
  if (matchedRoom(r)) fail('За этот стол садятся только через поиск игроков.');
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
// Игра стоит: идёт голосование или кто-то поставил паузу (в том числе во время отсчёта снятия).
const halted = r => !!(r.vote || r.pause);

// Перед остановкой запоминаем, сколько оставалось на таймере хода и в окне пересдачи, — после паузы продолжим с того же места.
function freezeTimers(r) {
  if (halted(r)) return;
  const now = Date.now();
  r.savedTurn = r.turnKey && r.deadline ? { key: r.turnKey, left: Math.max(1500, r.deadline - now) } : null;
  r.savedPre = r.preKey && r.preEnds ? { key: r.preKey, left: Math.max(800, r.preEnds - now) } : null;
}

function clearPause(r) {
  if (!r.pause) return;
  clearTimeout(r.pause.resumeTimer); clearTimeout(r.pause.maxTimer);
  r.pause = null;
}
// Запуск отсчёта 5…1; по его окончании игра продолжается.
function startUnpause(r, seat) {
  const pz = r.pause;
  if (!pz || pz.resumeAt) return;
  pz.resumeAt = Date.now() + UNPAUSE_COUNTDOWN;
  pz.resumeBy = seat;
  clearTimeout(pz.maxTimer);
  gameLog(r, seat === null ? 'Пауза слишком долгая — игра продолжится через 5 с' : `${r.seats[seat].name} снимает паузу — игра продолжится через 5 с`);
  pz.resumeTimer = setTimeout(() => {
    if (r.pause !== pz) return;
    clearPause(r);
    gameLog(r, 'Игра продолжается');
    update(r);
  }, UNPAUSE_COUNTDOWN);
}
function setPause(r, seat) {
  const g = r.game;
  if (!g || g.phase === 'gameOver') fail('Сейчас паузу поставить нельзя');
  if (r.pause && !r.pause.resumeAt) fail('Игра уже на паузе');
  if (!(r.pausesLeft[seat] > 0)) fail('Паузы закончились');
  r.pausesLeft[seat]--;
  const name = r.seats[seat].name;
  if (r.pause) { // отсчёт снятия идёт — новая пауза его отменяет
    clearPause(r);
    gameLog(r, `${name} снова ставит паузу`);
  } else {
    freezeTimers(r);
    gameLog(r, `${name} ставит паузу`);
  }
  r.pause = { by: seat, at: Date.now(), resumeAt: 0, resumeBy: null, resumeTimer: null };
  r.pause.maxTimer = setTimeout(() => { if (r.pause && !r.pause.resumeAt) { startUnpause(r, null); broadcast(r); } }, PAUSE_MAX);
}
function resetPauses(r) {
  clearPause(r);
  r.pausesLeft = r.seats.map(() => PAUSES_PER_PLAYER);
  r.savedTurn = r.savedPre = null;
}

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
  r.gameSeq = (r.gameSeq || 0) + 1;
  r.game = Engine.newGame({ players: r.size, rounds: r.rounds, names: r.seats.map(s => s.name), bluff: r.bluff, skills: r.skills, test: r.test });
  resetPauses(r);
}

function seatView(r, s, i) {
  const acc = s.uid && !s.left;
  return { name: s.name, bot: s.bot, online: s.bot || isOnline(r, i), host: i === r.hostSeat, pid: s.pid, rating: acc ? s.rating : null, pic: acc ? s.pic : null, uid: acc ? s.uid : null };
}

// Что видит конкретный игрок: только свои карты, у остальных — количество.
function viewFor(r, seat) {
  const hostSeat = r.hostSeat;
  const me = r.seats[seat];
  const base = {
    code: r.code, you: seat, youPid: me.pid, isHost: seat === hostSeat, size: r.size, rounds: r.rounds, turnTime: r.turnTime, bluff: r.bluff, skillsOn: r.skills, test: r.test,
    kind: r.kind, calib: r.calib, autoStartIn: !r.game && r.autoStartAt ? Math.max(0, r.autoStartAt - Date.now()) : 0,
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
      modes: Engine.roundModes(Engine.roundPlan(r.rounds, Engine.maxCards(r.size)), r.test),
      seats: r.seats.map((s, i) => seatView(r, s, i)),
    };
  }
  const g = r.game;
  const myTurn = g.turn === seat && (g.phase === 'bid' || g.phase === 'play');
  return {
    ...base, stage: 'game',
    names: g.names,
    seats: r.seats.map((s, i) => seatView(r, s, i)),
    n: g.n, plan: g.plan, modes: g.modes, mode: g.mode, trump: g.trump, roundIdx: g.roundIdx, phase: g.phase, turn: g.turn, leader: g.leader,
    bids: g.bids, took: g.took, scores: g.scores,
    handCounts: g.hands.map(h => h.length),
    // В «Тёмной» свои карты не видны, пока идут заявки: вместо них — рубашки.
    hand: Engine.handsHidden(g) ? g.hands[seat].map((_, i) => ({ id: 'X' + i, hidden: true })) : g.hands[seat],
    handHidden: Engine.handsHidden(g),
    pre: g.phase === 'pre' && r.preEnds ? { left: Math.max(0, r.preEnds - Date.now()), window: PRE_WINDOW, after: !!g.reshuffledRound } : null,
    trick: publicTrick(g.trick), lastTrick: publicTrick(g.lastTrick), trickWinner: g.trickWinner,
    history: g.history, log: g.log.slice(-100),
    legal: myTurn && g.phase === 'play' ? Engine.legalPlays(g, seat).map(c => c.id) : [],
    honest: myTurn && g.phase === 'play' ? Engine.strictLegal(g, seat).map(c => c.id) : [],
    fix: g.fix ? { p: g.fix.p } : null,
    lastCheck: g.lastCheck,
    timer: r.deadline && r.turnKey ? { left: Math.max(0, r.deadline - Date.now()), total: r.turnTime * 1000 } : null,
    specialModes: myTurn ? Engine.specialModes(g, seat) : [],
    skills: g.skillsOn ? { reshuffle: { left: g.skills[seat].reshuffle, can: !halted(r) && !Engine.canReshuffle(g, seat) } } : null,
    skillsUsed: g.skills.map(x => !x.reshuffle),
    reshuffle: g.lastReshuffle,
    paused: halted(r),
    pause: r.pause ? {
      by: r.pause.by,
      resumeIn: r.pause.resumeAt ? Math.max(0, r.pause.resumeAt - Date.now()) : 0,
      resumeBy: r.pause.resumeBy,
    } : null,
    pausesLeft: r.pausesLeft ? r.pausesLeft[seat] : 0,
    next: g.phase === 'roundDone' && r.readyKey ? {
      ready: [...r.ready], need: readyNeed(r),
      left: r.readyHeld != null ? r.readyHeld : Math.max(0, r.readyEnds - Date.now()), wait: NEXT_WAIT, held: r.readyHeld != null,
    } : null,
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
  if (!g || halted(r)) return; // голосование или пауза
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
  if (!g || halted(r) || !r.turnTime || r.seats[g.turn].bot) return null;
  if (g.phase !== 'bid' && g.phase !== 'play') return null;
  return `${g.roundIdx}:${g.reshuffleSeq}:${g.phase}:${g.turn}:${g.trick ? g.trick.plays.length : 0}:${g.fix ? 'f' : ''}:${g.took.join('')}`;
}
function scheduleTurnTimer(r) {
  const key = turnKeyOf(r);
  if (key === r.turnKey) return;
  clearTimeout(r.turnTimer);
  r.turnKey = key;
  // После паузы тот же ход продолжается с оставшимся временем.
  const left = key && r.savedTurn && r.savedTurn.key === key ? r.savedTurn.left : r.turnTime * 1000;
  if (key || !halted(r)) r.savedTurn = null;
  r.deadline = key ? Date.now() + left : 0;
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
  }, left + 300);
}

// Боты в режиме обмана иногда проверяют подозрительные карты.
function scheduleBotChecks(r) {
  const g = r.game;
  if (!g || !g.bluff || g.fix || halted(r) || !g.trick) return;
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
        if (r.game !== g || halted(r) || Engine.canCheck(g, b, pl.card.id)) return;
        try { Engine.check(g, b, pl.card.id); update(r); } catch {}
      }, 900 + Math.random() * 1600);
      r.checkTimers.push(t);
      break;
    }
  }
}

// Окно пересдачи: по таймеру начинаются заявки; боты решают, пересдавать ли, пока окно открыто.
function schedulePre(r) {
  const g = r.game;
  const key = g && !halted(r) && g.phase === 'pre' ? `${g.roundIdx}:${g.reshuffleSeq}:${g.history.length}:${r.gameSeq || 0}` : null;
  if (key === r.preKey) return;
  clearTimeout(r.preTimer); clearTimeout(r.preBotTimer);
  r.preKey = key; r.preEnds = 0;
  if (!key) return;
  const k = g.plan[g.roundIdx];
  const intro = preIntro(k, g.n, g.mode !== 'normal');
  const resumed = r.savedPre && r.savedPre.key === key ? r.savedPre.left : 0;
  r.savedPre = null;
  const delay = resumed || (g.reshuffledRound ? RESHUFFLE_FX : intro + PRE_WINDOW);
  r.preEnds = Date.now() + delay;
  r.preTimer = setTimeout(() => {
    if (r.game !== g || r.preKey !== key) return;
    Engine.beginBidding(g);
    update(r);
  }, delay);
  if (g.reshuffledRound) return;
  const bot = r.seats.findIndex((s, p) => s.bot && Bots.wantsReshuffle(g, p));
  if (bot < 0) return;
  r.preBotTimer = setTimeout(() => {
    if (r.game !== g || r.preKey !== key || Engine.canReshuffle(g, bot)) return;
    try { Engine.reshuffle(g, bot); } catch (e) { console.error('bot reshuffle', e); }
    update(r);
  }, resumed ? Math.random() * Math.max(0, resumed - 700) : intro + 500 + Math.random() * 1800);
}

// Готовность к следующему раунду: ждут только живых людей в сети (боты и вылетевшие не задерживают).
function readyNeed(r) { return humanSeats(r).filter(i => !r.seats[i].left && isOnline(r, i)); }
function readyNext(r, seat) {
  const g = r.game;
  if (!g || g.phase !== 'roundDone') return;
  if (!r.readyKey) scheduleNext(r);
  r.ready.add(seat);
  tryNext(r);
}
function tryNext(r) {
  const g = r.game;
  if (!g || g.phase !== 'roundDone' || !r.ready || halted(r)) return false;
  const need = readyNeed(r);
  if (need.length && !need.every(i => r.ready.has(i))) return false;
  clearTimeout(r.nextTimer); r.nextTimer = null;
  r.readyKey = null; r.readyEnds = 0; r.ready = new Set(); r.readyHeld = null;
  Engine.nextRound(g);
  return true;
}
function scheduleNext(r) {
  const g = r.game;
  const key = g && g.phase === 'roundDone' ? `${g.roundIdx}:${r.gameSeq || 0}` : null;
  if (key !== r.readyKey) {
    clearTimeout(r.nextTimer);
    r.readyKey = key; r.ready = new Set(); r.readyEnds = 0; r.readyHeld = null;
    if (!key) return;
    r.readyEnds = Date.now() + RESULTS_ANIM + NEXT_WAIT;
  } else if (!key) return;
  // Пауза или голосование — отсчёт замирает и продолжается с того же места.
  if (halted(r)) {
    if (r.readyHeld == null) { clearTimeout(r.nextTimer); r.nextTimer = null; r.readyHeld = Math.max(0, r.readyEnds - Date.now()); }
    return;
  }
  if (r.readyHeld != null) { r.readyEnds = Date.now() + r.readyHeld; r.readyHeld = null; clearTimeout(r.nextTimer); r.nextTimer = null; }
  if (r.nextTimer) return;
  r.nextTimer = setTimeout(() => {
    r.nextTimer = null;
    if (r.game !== g || r.readyKey !== key || g.phase !== 'roundDone' || halted(r)) return;
    gameLog(r, 'Время вышло — следующий раунд начинается автоматически');
    r.readyKey = null; r.ready = new Set(); r.readyEnds = 0;
    Engine.nextRound(g);
    update(r);
  }, Math.max(0, r.readyEnds - Date.now()));
}

function update(r) {
  r.touched = Date.now();
  if (r.game && r.game.phase === 'gameOver' && !r.game.rating) rateGame(r, r.game);
  scheduleNext(r);
  // Кто-то вышел из сети / был заменён ботом — возможно, ждать больше некого.
  if (tryNext(r)) scheduleNext(r);
  schedulePre(r);
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
    if (!EMOTE_POOL.includes(id) && !phrase) fail('Нет такой эмоции');
    if (now - (s.emoteAt || 0) < EMOTE_GAP) fail('Не так быстро');
    s.emoteAt = now;
    push({ kind: phrase ? 'phrase' : 'emote', id });
    return;
  }
  if (body.type === 'phrase') { // своя фраза с колеса эмоций
    const text = String(body.text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PHRASE_MAX);
    if (!text) fail('Пустое сообщение');
    if (now - (s.emoteAt || 0) < EMOTE_GAP) fail('Не так быстро');
    s.emoteAt = now;
    push({ kind: 'phrase', id: text });
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
  if (!g || halted(r) || g.phase === 'gameOver' || r.streams.size === 0) return;
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
    if (matchedRoom(r)) fail('Игра начнётся сама, когда все подключатся');
    if (seat !== r.hostSeat) fail('Начать игру может только хост');
    if (r.game) fail('Игра уже идёт');
    startGame(r);
    return;
  }
  if (type === 'restart') {
    if (r.kind === 'ranked') fail('Рейтинговую партию не переигрывают — найдите новую игру');
    if (seat !== r.hostSeat) fail('Новую партию начинает хост');
    if (!g || g.phase !== 'gameOver') fail('Партия ещё не закончена');
    r.seenPlays = new Set();
    for (const s of r.seats) if (s.bot) { s.uid = null; s.left = false; s.rating = null; } // ушедшие в новой партии не участвуют
    r.gameSeq = (r.gameSeq || 0) + 1;
    r.game = Engine.newGame({ players: r.size, rounds: r.rounds, names: r.seats.map(s => s.name), bluff: r.bluff, skills: r.skills, test: r.test });
    resetPauses(r);
    return;
  }
  if (type === 'kick') {
    if (matchedRoom(r)) fail('За столом подбора убирать игроков нельзя');
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
    freezeTimers(r);
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
  if (type === 'pause') { setPause(r, seat); return; }
  if (type === 'unpause') {
    if (!r.pause) fail('Игра не на паузе');
    if (r.pause.resumeAt) fail('Пауза уже снимается');
    startUnpause(r, seat);
    return;
  }
  if (r.vote) fail('Игра на паузе: идёт голосование');
  if (r.pause) fail('Игра на паузе');
  try {
    if (type === 'bid') Engine.placeBid(g, seat, Number(body.value));
    else if (type === 'play') Engine.playCard(g, seat, String(body.cardId), body.mode || 'normal');
    else if (type === 'nextRound') readyNext(r, seat);
    else if (type === 'check') Engine.check(g, seat, String(body.cardId));
    else if (type === 'skill' && body.skill === 'reshuffle') Engine.reshuffle(g, seat);
    else fail('Неизвестное действие');
  } catch (e) {
    if (e instanceof GameError) throw e;
    throw new GameError(e.message);
  }
}

// ---------- рейтинг ----------
// В рейтинг идут только рейтинговые столы: собранные подбором (минимум двое с аккаунтом)
// и калибровка — первые партии новичка с ботами (у ботов рейтинг 1000).
// Результат (g.rating) уходит всем в состоянии стола: { status: 'pending' | 'done' | 'skip' | 'error', ... }.
function rateGame(r, g) {
  if (r.kind !== 'ranked') { g.rating = { status: 'skip', reason: 'Обычная партия — рейтинг не меняется.' }; return; }
  const accSeats = r.seats.map((s, i) => ({ s, i })).filter(x => x.s.uid);
  if (!r.calib && accSeats.length < Rating.MIN_RATED) {
    g.rating = { status: 'skip', reason: 'Партия не в рейтинге: нужно минимум двое игроков, вошедших через Google.' };
    return;
  }
  if (!accSeats.length) { g.rating = { status: 'skip', reason: 'Партия не в рейтинге.' }; return; }
  if (!DB.ready()) { g.rating = { status: 'skip', reason: 'Рейтинг сейчас недоступен (нет связи с базой).' }; return; }
  g.rating = { status: 'pending' };
  // Места — среди всех за столом (боты тоже занимают места); ушедшие — последние.
  const all = r.seats.map((s, i) => ({ score: g.scores[i], left: !!s.left }));
  const placeAll = Rating.places(all);
  const inRating = r.calib ? r.seats.map((s, i) => ({ s, i })) : accSeats;
  const entries = inRating.map(({ s, i }) => (s.uid
    ? { playerId: s.uid, score: g.scores[i], left: !!s.left, place: placeAll[i] }
    : { bot: true, score: g.scores[i], left: false, place: placeAll[i] }));
  DB.recordMatch({ room: r.code, seats: r.size, rounds: r.rounds, bluff: r.bluff }, entries).then(res => {
    const changes = {};
    for (const x of res) {
      const seat = accSeats.find(({ s }) => s.uid === x.playerId).i;
      changes[seat] = { before: x.before, after: x.after, delta: x.delta, place: x.place };
      if (!r.seats[seat].left) r.seats[seat].rating = x.after;
    }
    g.rating = { status: 'done', changes, calib: r.calib };
  }).catch(e => {
    console.error('rating:', e.message);
    g.rating = { status: 'error', reason: 'Не удалось сохранить рейтинг — партия не засчитана.' };
  }).finally(() => { if (r.game === g) broadcast(r); });
}

// ---------- открытые столы и подбор игроков ----------
// Список открытых столов: ещё не начались и есть свободные места.
function openRooms() {
  return [...rooms.values()]
    .filter(r => r.kind === 'public' && !r.game && r.seats.length < r.size && r.seats.some((s, i) => isOnline(r, i)))
    .sort((a, b) => b.created - a.created).slice(0, 40)
    .map(r => ({
      code: r.code, host: r.seats[r.hostSeat].name, players: r.seats.length, size: r.size,
      rounds: r.rounds, turnTime: r.turnTime, bluff: r.bluff, skills: r.skills, test: r.test, lang: r.lang,
    }));
}

// Рейтинговые столы и калибровка: всегда режим обмана и 17 раундов.
const RANKED_RULES = { bluff: true, rounds: 17 };

// Очередь подбора. Записи живут, пока клиент опрашивает статус (раз в пару секунд).
const MM = {
  queue: new Map(),           // ticket -> запись
  ANY: [2, 3, 4],             // «любой стол»
  STEP_SMALLER: 10000,        // «любой»: стол на одного меньше — после каждых 10 с ожидания
  CASUAL_BOTS_AFTER: 45000,   // обычная игра: через 45 с можно вдвоём-втроём, остальные — боты
  RANKED_SIZE: 4,             // рейтинговая игра — только стол на 4
  RANKED_BOTS_AFTER: 60000,   // рейтинг: за минуту четверо не набрались — садим троих, четвёртое место — бот
  RANKED_MIN: 3,
  RANKED_WINDOW: (waitMs) => Math.min(600, 100 + Math.floor(waitMs / 1000) * 5), // разброс рейтинга растёт с ожиданием
  STALE: 20000,
  AUTOSTART: 15000,           // стол подбора стартует сам: когда все подключились или через 15 с
};

function mmJoin(body, acc) {
  const mode = body.mode === 'ranked' ? 'ranked' : 'casual';
  if (mode === 'ranked' && !acc) fail('Рейтинговая игра — только после входа через Google');
  let sizes = Array.isArray(body.sizes) ? body.sizes.map(Number).filter(n => n >= Engine.MIN_PLAYERS && n <= Engine.MAX_PLAYERS) : [];
  if (mode === 'ranked') sizes = [MM.RANKED_SIZE]; // рейтинг — только стол на 4
  if (!sizes.length) sizes = MM.ANY;
  sizes = [...new Set(sizes)].sort((a, b) => a - b);
  // Один человек — одна заявка: повторный поиск заменяет старый.
  for (const [t, e] of MM.queue) if (!e.result && ((acc && e.acc && e.acc.id === acc.id) || (body.prev && t === body.prev))) MM.queue.delete(t);
  const ticket = newToken();
  MM.queue.set(ticket, {
    ticket, mode, sizes, acc, name: cleanName(body.name || (acc && acc.nick)), lang: body.lang === 'en' ? 'en' : 'ru',
    rating: acc ? acc.rating : 0, since: Date.now(), seen: Date.now(), result: null,
  });
  mmMatch();
  return ticket;
}

function mmStatus(ticket) {
  const e = MM.queue.get(String(ticket || ''));
  if (!e) return { state: 'gone' };
  e.seen = Date.now();
  if (e.result) { MM.queue.delete(e.ticket); return { state: 'matched', ...e.result }; }
  const waited = Date.now() - e.since;
  const same = [...MM.queue.values()].filter(o => o.mode === e.mode && !o.result).length;
  return {
    state: 'waiting', waited, inQueue: same, sizes: e.sizes,
    window: e.mode === 'ranked' ? MM.RANKED_WINDOW(waited) : null,
    botsIn: Math.max(0, (e.mode === 'casual' ? MM.CASUAL_BOTS_AFTER : MM.RANKED_BOTS_AFTER) - waited),
  };
}

// Подходит ли игроку стол такого размера сейчас. «Любой» сначала ищет стол побольше.
function mmAccepts(e, size, now) {
  if (!e.sizes.includes(size)) return false;
  if (e.sizes.length === 1) return true;
  return now - e.since >= (Math.max(...e.sizes) - size) * MM.STEP_SMALLER;
}

function mmMatch() {
  const now = Date.now();
  for (const [t, e] of MM.queue) if (now - e.seen > MM.STALE) MM.queue.delete(t); // ушёл и не отменил
  let found = true;
  while (found) {
    found = false;
    for (const mode of ['ranked', 'casual']) {
      for (let size = Engine.MAX_PLAYERS; size >= Engine.MIN_PLAYERS && !found; size--) {
        const pool = [...MM.queue.values()].filter(e => e.mode === mode && !e.result && mmAccepts(e, size, now));
        let group = null;
        if (mode === 'ranked') {
          pool.sort((a, b) => a.rating - b.rating);
          for (let i = 0; i + size <= pool.length && !group; i++) {
            const g = pool.slice(i, i + size);
            const spread = g[g.length - 1].rating - g[0].rating;
            if (g.every(e => spread <= MM.RANKED_WINDOW(now - e.since))) group = g;
          }
          // Четверо не набрались за минуту — садим троих (самых долго ждущих), место займёт бот.
          if (!group && pool.length >= MM.RANKED_MIN && pool.length < size) {
            const byWait = pool.slice().sort((a, b) => a.since - b.since);
            if (now - byWait[0].since >= MM.RANKED_BOTS_AFTER) group = byWait.slice(0, size);
          }
        } else {
          pool.sort((a, b) => a.since - b.since);
          if (pool.length >= size) group = pool.slice(0, size);
          // Долго ждут — сажаем тех, кто есть, остальные места займут боты.
          else if (pool.length >= 2 && now - pool[0].since >= MM.CASUAL_BOTS_AFTER) group = pool;
        }
        if (group) { mmMakeRoom(group, size, mode); found = true; }
      }
      if (found) break;
    }
  }
}

function mmMakeRoom(group, size, mode) {
  const first = group[0];
  const { r, token } = createRoom({ name: first.name, players: size, turnTime: DEFAULT_TURN_TIME, lang: first.lang, ...(mode === 'ranked' ? RANKED_RULES : { bluff: false }) }, first.acc,
    { kind: mode, autoStartAt: Date.now() + MM.AUTOSTART });
  first.result = { room: r.code, token, kind: mode };
  const taken = new Set([r.seats[0].name.toLowerCase()]);
  for (const e of group.slice(1)) {
    let nm = e.name, k = 2;
    while (taken.has(nm.toLowerCase())) nm = `${e.name.slice(0, 17)} ${k++}`;
    taken.add(nm.toLowerCase());
    const t = newToken();
    r.seats.push({ name: nm, token: t, bot: false, pid: newPid(), ...accSeat(e.acc) });
    e.result = { room: r.code, token: t, kind: mode };
  }
  console.log(`подбор: ${mode} стол ${r.code} на ${size}, игроков ${group.length}`);
}

// Автостарт столов подбора. Кто так и не подключился — его место занимает бот (в рейтинге — последнее место).
function autoStartTick() {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.game || !r.autoStartAt) continue;
    const humans = humanSeats(r);
    const allIn = humans.every(i => isOnline(r, i));
    if (!allIn && now < r.autoStartAt) continue;
    if (!humans.some(i => r.seats[i].everOnline)) { if (now > r.autoStartAt + 60000) r.autoStartAt = 0; continue; } // никто не пришёл
    for (const i of humans) {
      const s = r.seats[i];
      if (s.everOnline) continue;
      s.bot = true; s.token = null; s.name = `${s.name} (${r.lang === 'en' ? 'bot' : 'бот'})`;
      if (s.uid) s.left = true;
    }
    if (r.seats[r.hostSeat].bot) { const h = humanSeats(r)[0]; if (h !== undefined) r.hostSeat = h; }
    r.autoStartAt = 0;
    startGame(r);
    update(r);
  }
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
    r.seats[seat].everOnline = true;
    r.touched = Date.now();
    checkVote(r);
    update(r);
    if (r.autoStartAt) autoStartTick(); // все подключились — не ждём таймера
    req.on('close', () => { if (r.streams.delete(st)) { checkVote(r); update(r); } });
    return;
  }
  if (url.pathname === '/api/rooms' && req.method === 'GET') return sendJson(res, 200, { rooms: openRooms() });
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
  if (url.pathname === '/api/tutorial') {
    const me = await DB.bySession(body.session).catch(() => null);
    if (!me) fail('Войдите через Google, чтобы сохранить прохождение');
    await DB.setTutorial(me.id).catch(e => { console.error('tutorial db:', e.message); fail('База данных недоступна, попробуйте позже'); });
    return sendJson(res, 200, { ok: true });
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
  if (url.pathname === '/api/mm/join') {
    const acc = await accountOf(body.session, body.name);
    if (body.mode === 'ranked' && !DB.ready()) fail('Рейтинг сейчас недоступен (нет связи с базой).');
    return sendJson(res, 200, { ticket: mmJoin(body, acc) });
  }
  if (url.pathname === '/api/mm/status') return sendJson(res, 200, mmStatus(body.ticket));
  if (url.pathname === '/api/mm/cancel') {
    const e = MM.queue.get(String(body.ticket || ''));
    if (e && !e.result) MM.queue.delete(e.ticket);
    return sendJson(res, 200, { ok: true });
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
    if (['chat', 'emote', 'phrase', 'like', 'dislike', 'mud'].includes(body.type)) { socialAction(r, seat, body); r.touched = Date.now(); broadcast(r); return sendJson(res, 200, { ok: true }); }
    doAction(r, seat, body);
    update(r);
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'Не найдено' });
}

function serveStatic(req, res, url) {
  const rel = STATIC[url.pathname];
  if (!rel) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
  const ext = path.extname(rel);
  if (ext === '.mp3') return serveMedia(req, res, path.join(ROOT, rel));
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Ошибка сервера'); }
    res.writeHead(200, { 'X-VT': '1', 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': (ext === '.png' || ext === '.webp') ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

// Музыка: отдаём кусками по запросу Range (без этого Safari на iPhone не проигрывает аудио), файл кэшируется на неделю.
function serveMedia(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404); return res.end(); }
    const head = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(200, { ...head, 'Content-Length': st.size });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
    }
    let start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
    let end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Клиент может быть открыт со статического хостинга (он не засыпает) — разрешаем ему обращаться к API.
  if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Max-Age': '86400' }); return res.end(); }
  }
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
setInterval(() => { try { mmMatch(); autoStartTick(); } catch (e) { console.error('matchmaking', e); } }, 1000);

// Пинг держит SSE-соединения живыми за прокси; уборка старых комнат.
setInterval(() => { for (const r of rooms.values()) for (const st of r.streams) { try { st.res.write(': ping\n\n'); } catch {} } }, 20000);
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (r.streams.size === 0 && now - r.touched > ROOM_TTL) { clearTimeout(r.timer); clearPause(r); rooms.delete(code); }
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log(`В Точку: сервер запущен на порту ${PORT}`));
DB.init();
module.exports = { server, rooms, DB, MM };
