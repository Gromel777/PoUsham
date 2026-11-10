// Движок правил «По ушам» и боты. Без DOM и сети: работает в браузере и в Node.js.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Engine = api.Engine; root.Bots = api.Bots; }
})(typeof self !== 'undefined' ? self : this, function () {
// ===== ENGINE =====
// Чистая логика игры без DOM — этот блок переносится на любой движок как есть.
const Engine = (() => {
  const SUITS = ['♠', '♣', '♦', '♥'];
  const TRUMP = '♥';
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const SPECIAL_ID = '7♠';
  const MAX_CARDS = 9;
  // Порядок мастей при равном достоинстве (только для «старшей карты»): ♥ > ♠ > ♣ > ♦
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
  // Абсолютная сила карты: козырь выше любой некозырной, затем достоинство, затем масть.
  function strength(c) { return (c.suit === TRUMP ? 100 : 0) + c.rank * 4 + SUIT_TIE[c.suit]; }
  // «Бьёт» как в Дураке: старшая той же масти или козырь по некозырной.
  function beats(c, b) { return c.suit === b.suit ? c.rank > b.rank : c.suit === TRUMP; }
  function strongestOf(cards) { return cards.reduce((a, c) => (strength(c) > strength(a) ? c : a)); }
  function handSort(a, b) { return SUIT_SORT[a.suit] - SUIT_SORT[b.suit] || a.rank - b.rank; }

  // План раундов: 1..9, дополнительные девятки, 9..1 вниз. При коротких партиях — симметричная «горка».
  function roundPlan(n) {
    const up = [], down = [];
    if (n >= 2 * MAX_CARDS - 1) {
      for (let k = 1; k <= MAX_CARDS; k++) up.push(k);
      const extra = Array(n - (2 * MAX_CARDS - 1)).fill(MAX_CARDS);
      for (let k = MAX_CARDS - 1; k >= 1; k--) down.push(k);
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

  function newGame({ players, rounds, names }) {
    if (players < 2 || players > 4) throw new Error('Игроков должно быть от 2 до 4');
    const g = {
      n: players, names, plan: roundPlan(rounds), roundIdx: 0,
      scores: Array(players).fill(0), history: [], log: [],
      firstLeader: Math.floor(Math.random() * players),
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
    // Первый ход: в 1-м раунде случайный игрок, дальше право переходит по часовой стрелке.
    const leader = (g.firstLeader + g.roundIdx) % g.n;
    g.leader = leader;
    g.turn = (leader + 1) % g.n;
    g.phase = 'bid';
    g.trick = null; g.lastTrick = null; g.trickWinner = null;
    log(g, `— Раунд ${g.roundIdx + 1}/${g.plan.length}: по ${k} карт. Первый ход у ${g.names[leader]}, заявки начинает ${g.names[g.turn]}.`);
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

  // Какие карты игрок может положить сейчас.
  // Ответ в масть: если есть масть первой карты — кладёшь её; козыри ♥ и 7♠ можно класть всегда.
  // Нет масти — любая карта. После команды «Старшие на стол!» — только самая сильная карта.
  function leadSuit(trick) { return trick && trick.plays.length ? trick.plays[0].card.suit : null; }
  function legalPlays(g, p) {
    const h = g.hands[p];
    const t = g.trick;
    if (!t || t.plays.length === 0) return h.slice();
    if (t.command) return [strongestOf(h)];
    const suit = leadSuit(t);
    if (!h.some(c => c.suit === suit)) return h.slice();
    return h.filter(c => c.suit === suit || c.suit === TRUMP || c.id === SPECIAL_ID);
  }
  // Режимы розыгрыша 7♠: 'normal' — как обычная 7♠ (всегда);
  // 'command' — первым ходом: «Старшие на стол!», все кладут самую сильную карту, взятка ходившего;
  // 'top' — в ответ: 7♠ считается самой старшей картой и забирает взятку.
  function specialModes(g, p) {
    if (g.phase !== 'play' || g.turn !== p) return [];
    const t = g.trick;
    if (!legalPlays(g, p).some(c => c.id === SPECIAL_ID)) return [];
    return t.plays.length === 0 ? ['normal', 'command'] : ['normal', 'top'];
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
    if (!card) throw new Error('Эту карту сейчас нельзя положить');
    if (mode !== 'normal' && (card.id !== SPECIAL_ID || !specialModes(g, p).includes(mode))) throw new Error('Так сыграть эту карту нельзя');
    g.hands[p] = g.hands[p].filter(c => c.id !== cardId);
    const t = g.trick;
    const play = { p, card, mode, absolute: mode !== 'normal' };
    if (mode === 'command') t.command = true;
    t.plays.push(play);
    const note = mode === 'command' ? ' — «СТАРШИЕ НА СТОЛ!»' : mode === 'top' ? ' — как самая старшая!' : '';
    log(g, `${g.names[p]}: ${card.id}${note}`);
    if (t.plays.length === g.n) {
      const w = currentBest(t).p;
      g.took[w]++;
      g.trickWinner = w;
      g.phase = 'trickDone';
      log(g, `Взятку забирает ${g.names[w]}`);
    } else {
      g.turn = (p + 1) % g.n;
    }
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
    g.history.push({ cards: g.plan[g.roundIdx], bids: [...g.bids], took: [...g.took], delta });
    g.trick = null;
    g.phase = g.roundIdx === g.plan.length - 1 ? 'gameOver' : 'roundDone';
    log(g, `Итог раунда: ${g.names.map((nm, p) => `${nm} ${delta[p] >= 0 ? '+' : ''}${delta[p]}`).join(', ')}`);
  }

  function nextRound(g) {
    if (g.phase !== 'roundDone') return;
    g.roundIdx++;
    startRound(g);
  }

  return { SUITS, TRUMP, RANKS, SPECIAL_ID, strength, beats, strongestOf, roundPlan, scoreFor,
           newGame, placeBid, legalPlays, leadSuit, specialModes, currentBest, playCard, nextTrick, nextRound };
})();

// ===== BOTS =====
// Простые эвристики: оценить руку для заявки, затем добирать или сбрасывать по ситуации.
const Bots = (() => {
  const E = Engine;
  function winChance(c, n) {
    let pr;
    if (c.id === E.SPECIAL_ID) return 0.95; // 7♠ почти гарантированно берёт взятку
    if (c.suit === E.TRUMP) pr = 0.25 + 0.75 * (c.rank / 8);
    else pr = [0.03, 0.03, 0.03, 0.03, 0.05, 0.08, 0.15, 0.3, 0.55][c.rank];
    const f = n === 2 ? 1.2 : n === 3 ? 1 : 0.85;
    return Math.min(1, pr * f);
  }
  function bid(g, p) {
    const h = g.hands[p];
    const est = h.reduce((a, c) => a + winChance(c, g.n), 0);
    return Math.max(0, Math.min(h.length, Math.round(est)));
  }
  const byStr = (a, b) => E.strength(a) - E.strength(b);
  function play(g, p) {
    const legal = E.legalPlays(g, p).sort(byStr);
    const need = g.bids[p] - g.took[p];
    const t = g.trick;
    const modes = E.specialModes(g, p);
    const mv = (c, mode = 'normal') => ({ cardId: c.id, mode });
    const special = legal.find(c => c.id === E.SPECIAL_ID);
    if (t.plays.length === 0) {
      if (need > 0 && modes.includes('command')) return mv(special, 'command');
      return mv(need > 0 ? legal[legal.length - 1] : legal[0]);
    }
    const bestPlay = E.currentBest(t);
    if (bestPlay.absolute) return mv(legal[0]); // взятку уже не перебить — сбросить мелочь
    const best = bestPlay.card;
    const winners = legal.filter(c => c.id !== E.SPECIAL_ID && E.beats(c, best));
    const losers = legal.filter(c => !E.beats(c, best));
    if (need > 0) {
      if (winners.length) return mv(winners[0]);
      if (modes.includes('top')) return mv(special, 'top');
      return mv(legal[0]);
    }
    return mv(losers.length ? losers[losers.length - 1] : legal[0]);
  }
  return { bid, play };
})();


return { Engine, Bots };
});
