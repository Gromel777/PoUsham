// Движок правил «В Точку» и боты. Без DOM и сети: работает в браузере и в Node.js.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Engine = api.Engine; root.Bots = api.Bots; }
})(typeof self !== 'undefined' ? self : this, function () {
// ===== ENGINE =====
const Engine = (() => {
  const SUITS = ['♠', '♣', '♦', '♥'];
  const TRUMP = '♥';
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const SPECIAL_ID = '7♠';
  const DECK_SIZE = 36;
  const MIN_PLAYERS = 2, MAX_PLAYERS = 6;
  const CHEAT_FINE = 50;   // пойманный на обмане отдаёт проверившему
  const WRONG_CHECK = 20;  // штраф за ошибочную проверку
  // Порядок мастей при равном достоинстве (только для «самой сильной карты»): ♥ > ♠ > ♣ > ♦
  const SUIT_TIE = { '♥': 3, '♠': 2, '♣': 1, '♦': 0 };
  const SUIT_SORT = { '♠': 0, '♣': 1, '♦': 2, '♥': 3 };

  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (let r = 0; r < RANKS.length; r++) d.push({ id: RANKS[r] + s, suit: s, rank: r });
    return d;
  }
  function shuffle(a, rng = Math.random) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function strength(c) { return (c.suit === TRUMP ? 100 : 0) + c.rank * 4 + SUIT_TIE[c.suit]; }
  // «Бьёт» как в Дураке: старшая той же масти или козырь по некозырной.
  function beats(c, b) { return c.suit === b.suit ? c.rank > b.rank : c.suit === TRUMP; }
  function strongestOf(cards) { return cards.reduce((a, c) => (strength(c) > strength(a) ? c : a)); }
  function handSort(a, b) { return SUIT_SORT[a.suit] - SUIT_SORT[b.suit] || a.rank - b.rank; }

  // Максимум карт на руке: колода делится на игроков, но не больше 9.
  function maxCards(players) { return Math.min(9, Math.floor(DECK_SIZE / players)); }

  // План раундов: 1..max, дополнительные раунды на пике, max-1..1. Короткая партия — симметричная «горка».
  function roundPlan(n, max = 9) {
    const up = [], down = [];
    if (n >= 2 * max - 1) {
      for (let k = 1; k <= max; k++) up.push(k);
      const extra = Array(n - (2 * max - 1)).fill(max);
      for (let k = max - 1; k >= 1; k--) down.push(k);
      return [...up, ...extra, ...down];
    }
    const peak = Math.ceil(n / 2);
    for (let k = 1; k <= peak; k++) up.push(k);
    const startDown = n % 2 === 0 ? peak : peak - 1;
    for (let k = startDown; k >= 1; k--) down.push(k);
    return [...up, ...down];
  }

  function scoreFor(bid, took) {
    if (took === bid) return bid === 0 ? 5 : 20 * bid;
    if (took < bid) return -20 * (bid - took);
    return 2; // перебор — всегда +2
  }

  function log(g, msg) { g.log.push(msg); if (g.log.length > 300) g.log.shift(); }

  function newGame({ players, rounds, names, bluff = false }) {
    if (players < MIN_PLAYERS || players > MAX_PLAYERS) throw new Error(`Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}`);
    const g = {
      n: players, names, plan: roundPlan(rounds, maxCards(players)), roundIdx: 0, bluff: !!bluff,
      scores: Array(players).fill(0), history: [], log: [],
      firstLeader: Math.floor(Math.random() * players),
      checkSeq: 0, lastCheck: null,
    };
    startRound(g);
    return g;
  }

  function startRound(g) {
    const k = g.plan[g.roundIdx];
    const deck = shuffle(makeDeck());
    g.hands = [];
    for (let p = 0; p < g.n; p++) g.hands.push(deck.splice(0, k).sort(handSort));
    g.bids = Array(g.n).fill(null);
    g.took = Array(g.n).fill(0);
    g.bonus = Array(g.n).fill(0); // очки за проверки в этом раунде
    // Первый ход: в 1-м раунде случайный игрок, дальше право переходит по часовой стрелке.
    g.leader = (g.firstLeader + g.roundIdx) % g.n;
    g.turn = (g.leader + 1) % g.n;
    g.phase = 'bid';
    g.trick = null; g.lastTrick = null; g.trickWinner = null; g.fix = null;
    log(g, `— Раунд ${g.roundIdx + 1}/${g.plan.length}: по ${k} карт. Первый ход у ${g.names[g.leader]}, заявки начинает ${g.names[g.turn]}.`);
  }

  function placeBid(g, p, b) {
    if (g.phase !== 'bid' || g.turn !== p) throw new Error('Сейчас не ваша заявка');
    if (!Number.isInteger(b) || b < 0 || b > g.hands[p].length) throw new Error('Недопустимая заявка');
    g.bids[p] = b;
    log(g, `${g.names[p]} заявляет ${b}`);
    if (g.bids.every(x => x !== null)) {
      g.phase = 'play';
      g.turn = g.leader;
      g.trick = { leader: g.leader, plays: [], command: false };
      const sum = g.bids.reduce((a, x) => a + x, 0);
      log(g, `Заявлено всего ${sum} из ${g.plan[g.roundIdx]}. Первым ходит ${g.names[g.leader]}.`);
    } else {
      g.turn = (p + 1) % g.n;
    }
  }

  function leadSuit(trick) { return trick && trick.plays.length ? trick.plays[0].card.suit : null; }

  // Честный ход по правилам:
  // — есть масть первой карты → только эта масть (козырь нельзя), 7♠ можно всегда;
  // — масти нет → любая карта;
  // — после «Старшие на стол!» → только самая сильная карта.
  function strictLegal(g, p) {
    const h = g.hands[p];
    const t = g.trick;
    if (!t || t.plays.length === 0) return h.slice();
    if (t.command) return [strongestOf(h)];
    const suit = leadSuit(t);
    if (!h.some(c => c.suit === suit)) return h.slice();
    return h.filter(c => c.suit === suit || c.id === SPECIAL_ID);
  }
  // Что можно положить: в режиме обмана — любую карту (кроме замены пойманной карты).
  function legalPlays(g, p) {
    if (g.fix) return g.fix.p === p ? strictLegal(g, p) : [];
    if (g.bluff) return g.hands[p].slice();
    return strictLegal(g, p);
  }

  // Режимы 7♠: 'normal' — всегда; 'command' — первым ходом («Старшие на стол!», взятка ходившего);
  // 'top' — в ответ (как самая старшая, забирает взятку).
  function specialModes(g, p) {
    if (g.phase !== 'play' || g.turn !== p) return [];
    if (!legalPlays(g, p).some(c => c.id === SPECIAL_ID)) return [];
    return g.trick.plays.length === 0 ? ['normal', 'command'] : ['normal', 'top'];
  }
  function currentBest(trick) {
    const abs = trick.plays.find(pl => pl.absolute);
    if (abs) return abs;
    let best = trick.plays[0];
    for (const pl of trick.plays.slice(1)) if (beats(pl.card, best.card)) best = pl;
    return best;
  }

  function playCard(g, p, cardId, mode = 'normal') {
    if (g.phase !== 'play' || g.turn !== p) throw new Error('Сейчас не ваш ход');
    const card = legalPlays(g, p).find(c => c.id === cardId);
    if (!card) throw new Error(g.fix ? 'Нужно заменить карту честной' : 'Эту карту сейчас нельзя положить');
    if (mode !== 'normal' && (card.id !== SPECIAL_ID || !specialModes(g, p).includes(mode))) throw new Error('Так сыграть эту карту нельзя');
    const lawful = strictLegal(g, p).some(c => c.id === cardId);
    g.hands[p] = g.hands[p].filter(c => c.id !== cardId);
    const t = g.trick;
    const play = { p, card, mode, absolute: mode !== 'normal', lawful, checked: false };
    if (mode === 'command') t.command = true;
    const note = mode === 'command' ? ' — «СТАРШИЕ НА СТОЛ!»' : mode === 'top' ? ' — как самая старшая!' : '';
    if (g.fix) {
      play.checked = true;
      t.plays.splice(g.fix.index, 0, play);
      log(g, `${g.names[p]} заменяет карту: ${card.id}${note}`);
      const resume = g.fix.resume;
      g.fix = null;
      if (t.plays.length === g.n) return finishTrick(g);
      g.turn = resume;
      return;
    }
    t.plays.push(play);
    log(g, `${g.names[p]}: ${card.id}${note}`);
    if (t.plays.length === g.n) finishTrick(g);
    else g.turn = (p + 1) % g.n;
  }

  function finishTrick(g) {
    const w = currentBest(g.trick).p;
    g.took[w]++;
    g.trickWinner = w;
    g.phase = 'trickDone';
    log(g, `Взятку забирает ${g.names[w]}`);
  }

  // Проверка на обман: любой игрок может проверить чужую карту, пока взятка на столе.
  function canCheck(g, ch, cardId) {
    if (!g.bluff) return 'Проверки доступны только в режиме обмана';
    if (g.fix) return 'Подождите: идёт замена карты';
    if (g.phase !== 'play' && g.phase !== 'trickDone') return 'Сейчас проверять нельзя';
    const pl = g.trick && g.trick.plays.find(x => x.card.id === cardId);
    if (!pl) return 'Этой карты нет на столе';
    if (pl.p === ch) return 'Свою карту проверять нельзя';
    if (pl.checked) return 'Эту карту уже проверили';
    return null;
  }
  function check(g, ch, cardId) {
    const err = canCheck(g, ch, cardId);
    if (err) throw new Error(err);
    const t = g.trick;
    const idx = t.plays.findIndex(x => x.card.id === cardId);
    const pl = t.plays[idx];
    pl.checked = true;
    g.checkSeq++;
    if (!pl.lawful) {
      g.scores[pl.p] -= CHEAT_FINE; g.scores[ch] += CHEAT_FINE;
      g.bonus[pl.p] -= CHEAT_FINE; g.bonus[ch] += CHEAT_FINE;
      t.plays.splice(idx, 1);
      if (pl.mode === 'command') t.command = false;
      g.hands[pl.p].push(pl.card);
      g.hands[pl.p].sort(handSort);
      if (g.phase === 'trickDone') { g.took[g.trickWinner]--; g.trickWinner = null; }
      g.fix = { p: pl.p, index: idx, resume: g.phase === 'trickDone' ? null : g.turn };
      g.phase = 'play';
      g.turn = pl.p;
      g.lastCheck = { seq: g.checkSeq, by: ch, target: pl.p, cardId, caught: true, delta: CHEAT_FINE };
      log(g, `${g.names[ch]} проверяет ${g.names[pl.p]}: ОБМАН! ${g.names[pl.p]} −${CHEAT_FINE}, ${g.names[ch]} +${CHEAT_FINE}. Карта ${pl.card.id} возвращается, нужен честный ход.`);
    } else {
      g.scores[ch] -= WRONG_CHECK; g.bonus[ch] -= WRONG_CHECK;
      g.lastCheck = { seq: g.checkSeq, by: ch, target: pl.p, cardId, caught: false, delta: WRONG_CHECK };
      log(g, `${g.names[ch]} проверяет ${g.names[pl.p]}: честно. ${g.names[ch]} −${WRONG_CHECK}.`);
    }
    return g.lastCheck;
  }

  function nextTrick(g) {
    if (g.phase !== 'trickDone') return;
    g.lastTrick = { ...g.trick, winner: g.trickWinner };
    if (g.hands.every(h => h.length === 0)) { scoreRound(g); return; }
    g.trick = { leader: g.trickWinner, plays: [], command: false };
    g.turn = g.trickWinner;
    g.phase = 'play';
  }

  function scoreRound(g) {
    const delta = g.bids.map((b, p) => scoreFor(b, g.took[p]));
    delta.forEach((d, p) => { g.scores[p] += d; });
    g.history.push({ cards: g.plan[g.roundIdx], bids: [...g.bids], took: [...g.took], delta, bonus: [...g.bonus] });
    g.trick = null;
    g.phase = g.roundIdx === g.plan.length - 1 ? 'gameOver' : 'roundDone';
    log(g, `Итог раунда: ${g.names.map((nm, p) => `${nm} ${delta[p] >= 0 ? '+' : ''}${delta[p]}`).join(', ')}`);
  }

  function nextRound(g) {
    if (g.phase !== 'roundDone') return;
    g.roundIdx++;
    startRound(g);
  }

  return { SUITS, TRUMP, RANKS, SPECIAL_ID, MIN_PLAYERS, MAX_PLAYERS, CHEAT_FINE, WRONG_CHECK,
           strength, beats, strongestOf, maxCards, roundPlan, scoreFor, leadSuit,
           newGame, placeBid, strictLegal, legalPlays, specialModes, currentBest, playCard,
           canCheck, check, nextTrick, nextRound };
})();

// ===== BOTS =====
// Эвристики: оценить руку для заявки; добирать или сбрасывать; в режиме обмана иногда хитрить.
const Bots = (() => {
  const E = Engine;
  function winChance(c, n) {
    if (c.id === E.SPECIAL_ID) return 0.95;
    let pr;
    if (c.suit === E.TRUMP) pr = 0.25 + 0.75 * (c.rank / 8);
    else pr = [0.03, 0.03, 0.03, 0.03, 0.05, 0.08, 0.15, 0.3, 0.55][c.rank];
    const f = n <= 2 ? 1.2 : n === 3 ? 1 : n === 4 ? 0.85 : 0.7;
    return Math.min(1, pr * f);
  }
  function bid(g, p) {
    const h = g.hands[p];
    const est = h.reduce((a, c) => a + winChance(c, g.n), 0);
    return Math.max(0, Math.min(h.length, Math.round(est)));
  }
  const byStr = (a, b) => E.strength(a) - E.strength(b);

  // Лучший ход из набора карт (без учёта обмана).
  function choose(g, p, cards) {
    const legal = cards.slice().sort(byStr);
    const need = g.bids[p] - g.took[p];
    const t = g.trick;
    const modes = E.specialModes(g, p);
    const mv = (c, mode = 'normal') => ({ cardId: c.id, mode });
    const special = legal.find(c => c.id === E.SPECIAL_ID);
    if (t.plays.length === 0) {
      if (need > 0 && special && modes.includes('command')) return mv(special, 'command');
      return mv(need > 0 ? legal[legal.length - 1] : legal[0]);
    }
    const bestPlay = E.currentBest(t);
    if (bestPlay.absolute) return mv(legal[0]);
    const best = bestPlay.card;
    const winners = legal.filter(c => c.id !== E.SPECIAL_ID && E.beats(c, best));
    const losers = legal.filter(c => !E.beats(c, best));
    if (need > 0) {
      if (winners.length) return mv(winners[0]);
      if (special && modes.includes('top')) return mv(special, 'top');
      return mv(legal[0]);
    }
    return mv(losers.length ? losers[losers.length - 1] : legal[0]);
  }

  function play(g, p, rng = Math.random) {
    const honest = E.strictLegal(g, p);
    const move = choose(g, p, honest);
    if (!g.bluff || g.fix || g.trick.plays.length === 0 || rng() > 0.3) return move;
    // Иногда врём: если честно не выходит то, что нужно.
    const need = g.bids[p] - g.took[p];
    const honestIds = new Set(honest.map(c => c.id));
    const dishonest = g.hands[p].filter(c => !honestIds.has(c.id)).sort(byStr);
    if (!dishonest.length) return move;
    const best = E.currentBest(g.trick);
    if (best.absolute) return move;
    const winsNow = c => E.beats(c, best.card);
    const honestCard = honest.find(c => c.id === move.cardId);
    if (need > 0 && !winsNow(honestCard)) {
      const w = dishonest.find(c => c.id !== E.SPECIAL_ID && winsNow(c));
      if (w) return { cardId: w.id, mode: 'normal' };
    }
    if (need <= 0 && winsNow(honestCard)) {
      const l = dishonest.filter(c => !winsNow(c));
      if (l.length) return { cardId: l[l.length - 1].id, mode: 'normal' };
    }
    return move;
  }

  // Подозрительная ли карта для бота: игрок не ответил в масть первой карты.
  function suspicion(g, botSeat, pl) {
    const t = g.trick;
    if (!t || !t.plays.length || pl.checked || pl.p === botSeat) return 0;
    const idx = t.plays.indexOf(pl);
    if (idx <= 0) return 0;
    const lead = t.plays[0].card.suit;
    if (pl.card.suit === lead || pl.card.id === E.SPECIAL_ID) return 0;
    // Чем больше карт масти на руках у остальных может быть, тем подозрительнее.
    const mineOfLead = g.hands[botSeat].filter(c => c.suit === lead).length;
    // Козырь вместо масти — самый частый обман; у кого самого много этой масти, тот подозревает меньше.
    let s = pl.card.suit === E.TRUMP ? 0.07 : 0.03;
    if (mineOfLead >= 3) s *= 0.5;
    return s;
  }

  return { bid, play, suspicion };
})();

return { Engine, Bots };
});
