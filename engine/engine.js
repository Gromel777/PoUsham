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
  const HONEST_BONUS = 5;  // проверили честного — ему +5 за напрасное подозрение
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
  // trump — масть козыря раунда; null — «Бескозырка».
  function strength(c, trump = TRUMP) { return (trump && c.suit === trump ? 100 : 0) + c.rank * 4 + SUIT_TIE[c.suit]; }
  // «Бьёт» как в Дураке: старшая той же масти или козырь по некозырной.
  function beats(c, b, trump = TRUMP) { return c.suit === b.suit ? c.rank > b.rank : !!trump && c.suit === trump; }
  function strongestOf(cards, trump = TRUMP) { return cards.reduce((a, c) => (strength(c, trump) > strength(a, trump) ? c : a)); }
  const trickTrump = t => (t && 'trump' in t ? t.trump : TRUMP);
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

  // Очки за раунд: точно — 20 за взятку; точный ноль — 5 + 1 за каждую карту на руке;
  // недобор — −20 за каждую недостающую; перебор — +1 за каждую лишнюю взятку.
  function scoreFor(bid, took, cards = 0) {
    if (took === bid) return bid === 0 ? 5 + cards : 20 * bid;
    if (took < bid) return -20 * (bid - took);
    return took - bid;
  }

  // Особые раунды «Тестового режима»: 10-й — «Бескозырка», 15-й — «Тёмная» (заявка вслепую, очки ×2).
  function roundModes(plan, test) {
    const m = plan.map(() => 'normal');
    if (test) { if (plan.length > 9) m[9] = 'notrump'; if (plan.length > 14) m[14] = 'dark'; }
    return m;
  }

  function log(g, msg) { g.log.push(msg); if (g.log.length > 300) g.log.shift(); }

  // Для обучения: deals — заранее заданные руки по раундам ([раунд][место] = список id карт),
  // firstLeader — кто ходит первым в 1-м раунде, bluffFrom — с какого раунда (индекс) включается режим обмана.
  // «Двойные очки»: в первом и последнем раунде партии все очки раунда ×2 (с «Тёмной» — ×4). doubles=false — выключить (обучение).
  function isDoubleRound(g, idx = g.roundIdx) { return !!g.doubles && (idx === 0 || idx === g.plan.length - 1); }
  function roundMult(g, idx = g.roundIdx) { return (g.modes[idx] === 'dark' ? 2 : 1) * (isDoubleRound(g, idx) ? 2 : 1); }

  function newGame({ players, rounds, names, bluff = false, skills = false, test = false, deals = null, firstLeader = null, bluffFrom = null, doubles = true }) {
    if (players < MIN_PLAYERS || players > MAX_PLAYERS) throw new Error(`Игроков должно быть от ${MIN_PLAYERS} до ${MAX_PLAYERS}`);
    const plan = roundPlan(rounds, maxCards(players));
    const g = {
      n: players, names, plan, modes: roundModes(plan, test), test: !!test, roundIdx: 0, bluff: !!bluff, doubles: !!doubles,
      scores: Array(players).fill(0), history: [], log: [],
      firstLeader: Number.isInteger(firstLeader) ? firstLeader : Math.floor(Math.random() * players),
      deals, bluffFrom,
      checkSeq: 0, lastCheck: null,
      // Умения: каждое — один раз за партию. Пока одно: «Пересдача» (reshuffle).
      skillsOn: !!skills, skills: Array.from({ length: players }, () => ({ reshuffle: !!skills })),
      reshuffleSeq: 0, lastReshuffle: null,
    };
    startRound(g);
    return g;
  }

  function dealHands(g) {
    const k = g.plan[g.roundIdx];
    const fixed = g.deals && g.deals[g.roundIdx];
    if (fixed) {
      const all = new Map(makeDeck().map(c => [c.id, c]));
      g.hands = fixed.map(ids => ids.map(id => { const c = all.get(id); if (!c) throw new Error('Нет такой карты: ' + id); return c; }).sort(handSort));
      return;
    }
    const deck = shuffle(makeDeck());
    g.hands = [];
    for (let p = 0; p < g.n; p++) g.hands.push(deck.splice(0, k).sort(handSort));
  }

  function startRound(g) {
    const k = g.plan[g.roundIdx];
    dealHands(g);
    if (Number.isInteger(g.bluffFrom)) g.bluff = g.roundIdx >= g.bluffFrom;
    g.mode = g.modes[g.roundIdx];
    g.trump = g.mode === 'notrump' ? null : TRUMP;
    g.reshuffledRound = false;
    g.bids = Array(g.n).fill(null);
    g.took = Array(g.n).fill(0);
    g.bonus = Array(g.n).fill(0); // очки за проверки в этом раунде
    // Первый ход: в 1-м раунде случайный игрок, дальше право переходит по часовой стрелке.
    g.leader = (g.firstLeader + g.roundIdx) % g.n;
    g.turn = (g.leader + 1) % g.n;
    // Окно пересдачи перед заявками: если у кого-то осталось умение (в «Тёмной» карт не видно — окна нет).
    g.phase = g.skillsOn && g.mode !== 'dark' && g.skills.some(s => s.reshuffle) ? 'pre' : 'bid';
    g.trick = null; g.lastTrick = null; g.trickWinner = null; g.fix = null;
    g.double = isDoubleRound(g); g.mult = roundMult(g);
    const tag = (g.mode === 'notrump' ? ' БЕСКОЗЫРКА!' : g.mode === 'dark' ? ' ТЁМНАЯ: заявки вслепую, очки ×2!' : '') + (g.double ? ` ДВОЙНЫЕ ОЧКИ ×${g.mult}!` : '');
    log(g, `— Раунд ${g.roundIdx + 1}/${g.plan.length}: по ${k} карт.${tag} Первый ход у ${g.names[g.leader]}, заявки начинает ${g.names[g.turn]}.`);
  }
  // Окно пересдачи закрылось — начинаются заявки.
  function beginBidding(g) {
    if (g.phase !== 'pre') return;
    g.phase = 'bid';
    g.turn = (g.leader + 1) % g.n;
  }
  // В «Тёмной» руки скрыты, пока идут заявки.
  function handsHidden(g) { return g.mode === 'dark' && (g.phase === 'pre' || g.phase === 'bid'); }

  function placeBid(g, p, b) {
    if (g.phase !== 'bid' || g.turn !== p) throw new Error('Сейчас не ваша заявка');
    if (!Number.isInteger(b) || b < 0 || b > g.hands[p].length) throw new Error('Недопустимая заявка');
    g.bids[p] = b;
    log(g, `${g.names[p]} заявляет ${b}`);
    if (g.bids.every(x => x !== null)) {
      g.phase = 'play';
      g.turn = g.leader;
      g.trick = { leader: g.leader, plays: [], command: false, trump: g.trump };
      const sum = g.bids.reduce((a, x) => a + x, 0);
      log(g, `Заявлено всего ${sum} из ${g.plan[g.roundIdx]}. Первым ходит ${g.names[g.leader]}.`);
    } else {
      g.turn = (p + 1) % g.n;
    }
  }

  // Умение «Пересдача»: все карты всех игроков собираются, колода тасуется и раздаётся заново.
  // Только в окне перед заявками (фаза 'pre'), один раз за партию у игрока и не больше одной пересдачи за раунд.
  // После пересдачи окно остаётся открытым, пока идёт анимация; потом — заявки.
  function canReshuffle(g, p) {
    if (!g.skillsOn) return 'Умения за этим столом выключены';
    if (!g.skills[p] || !g.skills[p].reshuffle) return 'Пересдача уже использована';
    if (g.phase !== 'pre') return 'Пересдача — только до заявок';
    if (g.reshuffledRound) return 'В этом раунде уже была пересдача';
    return null;
  }
  function reshuffle(g, p) {
    const err = canReshuffle(g, p);
    if (err) throw new Error(err);
    g.skills[p].reshuffle = false;
    g.reshuffledRound = true;
    dealHands(g);
    g.reshuffleSeq++;
    g.lastReshuffle = { seq: g.reshuffleSeq, by: p, roundIdx: g.roundIdx };
    log(g, `${g.names[p]} применяет «Пересдачу»: карты перетасованы и розданы заново.`);
  }

  function leadSuit(trick) { return trick && trick.plays.length ? trick.plays[0].card.suit : null; }

  // Честный ход по правилам:
  // — есть масть первой карты → только эта масть (козырь нельзя), 7♠ можно всегда;
  //   7♠ — джокер: она не считается пикой, поэтому класть её под пики не обязательно;
  // — масти нет → любая карта;
  // — после «Старшие на стол!» → только самая сильная карта (или 7♠ — её можно всегда).
  function strictLegal(g, p) {
    const h = g.hands[p];
    const t = g.trick;
    if (!t || t.plays.length === 0) return h.slice();
    if (t.command) { const s = strongestOf(h, trickTrump(t)); const sp = h.find(c => c.id === SPECIAL_ID && c !== s); return sp ? [s, sp] : [s]; }
    const suit = leadSuit(t);
    if (!h.some(c => c.suit === suit && c.id !== SPECIAL_ID)) return h.slice();
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
    const tr = trickTrump(trick);
    for (const pl of trick.plays.slice(1)) if (beats(pl.card, best.card, tr)) best = pl;
    return best;
  }

  function playCard(g, p, cardId, mode = 'normal') {
    if (g.phase !== 'play' || g.turn !== p) throw new Error('Сейчас не ваш ход');
    const card = legalPlays(g, p).find(c => c.id === cardId);
    if (!card) throw new Error(g.fix ? 'Нужно заменить карту честной' : 'Эту карту сейчас нельзя положить');
    if (mode !== 'normal' && (card.id !== SPECIAL_ID || !specialModes(g, p).includes(mode))) throw new Error('Так сыграть эту карту нельзя');
    const lawful = strictLegal(g, p).some(c => c.id === cardId);
    const forced = g.hands[p].length === 1; // выбора не было — проверять бессмысленно
    g.hands[p] = g.hands[p].filter(c => c.id !== cardId);
    const t = g.trick;
    const play = { p, card, mode, absolute: mode !== 'normal', lawful, checked: false, forced };
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
    const idx = g.trick ? g.trick.plays.findIndex(x => x.card.id === cardId) : -1;
    const pl = idx >= 0 ? g.trick.plays[idx] : null;
    if (!pl) return 'Этой карты нет на столе';
    if (pl.p === ch) return 'Свою карту проверять нельзя';
    if (pl.checked) return 'Эту карту уже проверили';
    if (idx === 0) return 'Первую карту взятки проверять нельзя — ею можно ходить любой';
    if (pl.card.id === SPECIAL_ID) return '7♠ можно класть всегда — проверять нечего';
    if (pl.forced) return 'У игрока была одна карта — выбора не было';
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
      g.scores[pl.p] += HONEST_BONUS; g.bonus[pl.p] += HONEST_BONUS;
      g.lastCheck = { seq: g.checkSeq, by: ch, target: pl.p, cardId, caught: false, delta: WRONG_CHECK, reward: HONEST_BONUS };
      log(g, `${g.names[ch]} проверяет ${g.names[pl.p]}: честно. ${g.names[ch]} −${WRONG_CHECK}, ${g.names[pl.p]} +${HONEST_BONUS}.`);
    }
    return g.lastCheck;
  }

  function nextTrick(g) {
    if (g.phase !== 'trickDone') return;
    g.lastTrick = { ...g.trick, winner: g.trickWinner };
    if (g.hands.every(h => h.length === 0)) { scoreRound(g); return; }
    g.trick = { leader: g.trickWinner, plays: [], command: false, trump: g.trump };
    g.turn = g.trickWinner;
    g.phase = 'play';
  }

  function scoreRound(g) {
    const k = g.plan[g.roundIdx], mult = roundMult(g);
    const delta = g.bids.map((b, p) => scoreFor(b, g.took[p], k) * mult);
    delta.forEach((d, p) => { g.scores[p] += d; });
    g.history.push({ cards: k, mode: g.mode, mult, double: !!g.double, bids: [...g.bids], took: [...g.took], delta, bonus: [...g.bonus] });
    g.trick = null;
    g.phase = g.roundIdx === g.plan.length - 1 ? 'gameOver' : 'roundDone';
    log(g, `Итог раунда: ${g.names.map((nm, p) => `${nm} ${delta[p] >= 0 ? '+' : ''}${delta[p]}`).join(', ')}`);
  }

  function nextRound(g) {
    if (g.phase !== 'roundDone') return;
    g.roundIdx++;
    startRound(g);
  }

  return { SUITS, TRUMP, RANKS, SPECIAL_ID, MIN_PLAYERS, MAX_PLAYERS, CHEAT_FINE, WRONG_CHECK, HONEST_BONUS, isDoubleRound, roundMult,
           strength, beats, strongestOf, maxCards, roundPlan, roundModes, scoreFor, leadSuit,
           newGame, beginBidding, handsHidden, placeBid, strictLegal, legalPlays, specialModes, currentBest, playCard,
           canCheck, check, nextTrick, nextRound, canReshuffle, reshuffle };
})();

// ===== BOTS =====
// Эвристики: оценить руку для заявки; добирать или сбрасывать; в режиме обмана иногда хитрить.
const Bots = (() => {
  const E = Engine;
  const PLAIN = [0.03, 0.03, 0.03, 0.03, 0.05, 0.08, 0.15, 0.3, 0.55];
  function winChance(c, n, trump = E.TRUMP) {
    if (c.id === E.SPECIAL_ID) return 0.95;
    let pr;
    if (trump && c.suit === trump) pr = 0.25 + 0.75 * (c.rank / 8);
    else if (!trump) pr = Math.min(0.9, PLAIN[c.rank] * 1.5); // без козыря старшие карты надёжнее
    else pr = PLAIN[c.rank];
    const f = n <= 2 ? 1.2 : n === 3 ? 1 : n === 4 ? 0.85 : 0.7;
    return Math.min(1, pr * f);
  }
  // Средний шанс взятки у случайной карты — для заявки вслепую в «Тёмной».
  const FULL_DECK = E.SUITS.flatMap(s => E.RANKS.map((r, i) => ({ id: r + s, suit: s, rank: i })));
  function bid(g, p) {
    const h = g.hands[p];
    if (E.handsHidden(g)) {
      const avg = FULL_DECK.reduce((a, c) => a + winChance(c, g.n, g.trump), 0) / FULL_DECK.length;
      return Math.max(0, Math.min(h.length, Math.round(avg * h.length)));
    }
    const est = h.reduce((a, c) => a + winChance(c, g.n, g.trump), 0);
    return Math.max(0, Math.min(h.length, Math.round(est)));
  }
  const byStrOf = g => (a, b) => E.strength(a, g.trump) - E.strength(b, g.trump);

  // Пересдача ботом: рука «мутная» — много карт, про которые не ясно, возьмут или нет.
  // Решает один раз, когда до него доходит очередь заявлять.
  function wantsReshuffle(g, p, rng = Math.random) {
    if (E.canReshuffle(g, p)) return false;
    const h = g.hands[p];
    if (h.length < 3) return false;
    const fog = h.reduce((a, c) => { const w = winChance(c, g.n, g.trump); return a + w * (1 - w); }, 0) / h.length;
    const roundsLeft = g.plan.length - g.roundIdx;
    // Ближе к концу партии бот смелее: умение всё равно сгорит.
    const urge = fog > 0.17 ? 0.45 : roundsLeft <= 3 ? 0.25 : 0.04;
    return rng() < urge;
  }

  // Лучший ход из набора карт (без учёта обмана).
  function choose(g, p, cards) {
    const legal = cards.slice().sort(byStrOf(g));
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
    const winners = legal.filter(c => c.id !== E.SPECIAL_ID && E.beats(c, best, g.trump));
    const losers = legal.filter(c => !E.beats(c, best, g.trump));
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
    const dishonest = g.hands[p].filter(c => !honestIds.has(c.id)).sort(byStrOf(g));
    if (!dishonest.length) return move;
    const best = E.currentBest(g.trick);
    if (best.absolute) return move;
    const winsNow = c => E.beats(c, best.card, g.trump);
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
    if (!t || !t.plays.length || pl.checked || pl.p === botSeat || pl.forced) return 0;
    const idx = t.plays.indexOf(pl);
    if (idx <= 0) return 0;
    const lead = t.plays[0].card.suit;
    if (pl.card.suit === lead || pl.card.id === E.SPECIAL_ID) return 0;
    // Чем больше карт масти на руках у остальных может быть, тем подозрительнее.
    const mineOfLead = g.hands[botSeat].filter(c => c.suit === lead).length;
    // Козырь вместо масти — самый частый обман; у кого самого много этой масти, тот подозревает меньше.
    let s = g.trump && pl.card.suit === g.trump ? 0.07 : 0.03;
    if (mineOfLead >= 3) s *= 0.5;
    return s;
  }

  return { bid, play, suspicion, wantsReshuffle };
})();

return { Engine, Bots };
});
