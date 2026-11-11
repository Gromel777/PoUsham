// Проверки правил движка: масть, 7♠, план раундов на 2–6 игроков, режим обмана, полные партии ботов.
const assert = require('assert');
const { Engine: E, Bots } = require('./engine/engine.js');
const R = E.RANKS;
const C = id => ({ id, suit: id.slice(-1), rank: R.indexOf(id.slice(0, -1)) });
function table(hands, opts = {}) {
  const g = E.newGame({ players: hands.length, rounds: 1, names: hands.map((_, i) => 'p' + i), bluff: !!opts.bluff });
  g.hands = hands.map(h => h.map(C)); g.bids = g.bids.map(() => 0); g.phase = 'play'; g.turn = 0;
  g.trick = { leader: 0, plays: [], command: false };
  return g;
}
const ids = a => a.map(c => c.id).sort().join(' ');

// 1. Ответ в масть: есть пики → только пики (+7♠), козырь нельзя.
let g = table([['Т♠'], ['6♠', 'К♥', '7♠', 'Т♦'], ['Д♣', '9♥']]);
E.playCard(g, 0, 'Т♠');
assert.strictEqual(ids(E.legalPlays(g, 1)), ids([C('6♠'), C('7♠')]));
E.playCard(g, 1, '6♠');
assert.strictEqual(ids(E.legalPlays(g, 2)), ids([C('Д♣'), C('9♥')]), 'нет масти — любая');
// козырь первым: есть козырь → только козырь (+7♠)
g = table([['9♥'], ['6♥', 'Т♦', '7♠'], ['К♣']]);
E.playCard(g, 0, '9♥');
assert.strictEqual(ids(E.legalPlays(g, 1)), ids([C('6♥'), C('7♠')]));
// трефы первыми, на руке трефа и козырь → только трефа
g = table([['8♣'], ['6♣', 'Т♥'], ['К♣']]);
E.playCard(g, 0, '8♣');
assert.strictEqual(ids(E.legalPlays(g, 1)), '6♣');

// 3. План раундов и максимум карт
assert.deepStrictEqual([2, 3, 4, 5, 6].map(E.maxCards), [9, 9, 9, 7, 6]);
assert.deepStrictEqual(E.roundPlan(11, 6), [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
assert.deepStrictEqual(E.roundPlan(13, 6), [1, 2, 3, 4, 5, 6, 6, 6, 5, 4, 3, 2, 1]);
g = E.newGame({ players: 6, rounds: 11, names: [1, 2, 3, 4, 5, 6].map(String) });
assert.strictEqual(Math.max(...g.plan), 6);

// 2. Обман: в режиме обмана можно положить любую карту, честность скрыта
g = table([['Т♠'], ['6♠', 'К♥'], ['Д♣', '9♥']], { bluff: true });
E.playCard(g, 0, 'Т♠');
assert.strictEqual(E.legalPlays(g, 1).length, 2);
E.playCard(g, 1, 'К♥'); // обман: были пики
assert.strictEqual(g.trick.plays[1].lawful, false);
// ошибочная проверка честной карты: −20 проверяющему
E.playCard(g, 2, 'Д♣'); // честно (пик нет) → взятка завершена
assert.strictEqual(g.phase, 'trickDone');
assert.strictEqual(g.trickWinner, 1);
E.check(g, 0, 'Д♣');
assert.deepStrictEqual(g.scores, [-20, 0, 0]);
assert.throws(() => E.check(g, 1, 'Д♣'), /уже проверили/);
assert.throws(() => E.check(g, 1, 'К♥'), /Свою карту/);
// пойманный обман после завершения взятки: ±50, карта возвращается, взятка пересчитывается
E.check(g, 2, 'К♥');
assert.deepStrictEqual(g.scores, [-20, -50, 50]);
assert.strictEqual(g.phase, 'play'); assert.strictEqual(g.turn, 1);
assert.deepStrictEqual(g.took, [0, 0, 0]);
assert.strictEqual(ids(E.legalPlays(g, 1)), '6♠', 'замена — только честная карта');
assert.throws(() => E.playCard(g, 1, 'К♥'), /честной/);
assert.throws(() => E.check(g, 0, 'Т♠'), /замена/);
E.playCard(g, 1, '6♠');
assert.strictEqual(g.trick.plays[1].card.id, '6♠', 'карта встаёт на своё место');
assert.strictEqual(g.phase, 'trickDone'); assert.strictEqual(g.trickWinner, 0);
assert.deepStrictEqual(g.took, [1, 0, 0]);
assert.deepStrictEqual(g.bonus, [-20, -50, 50]);
// пойманный обман в середине взятки: ход возвращается тому, кто ходил бы
g = table([['Т♠', '6♦'], ['6♠', 'К♥', '7♦'], ['Д♣', '9♥', '8♦'], ['8♠', '6♣']], { bluff: true });
E.playCard(g, 0, 'Т♠'); E.playCard(g, 1, 'К♥');
assert.strictEqual(g.turn, 2);
E.check(g, 3, 'К♥');
assert.strictEqual(g.turn, 1);
E.playCard(g, 1, '6♠');
assert.strictEqual(g.turn, 2, 'после замены ходит следующий');
// обход «Старшие на стол!»
g = table([['7♠', '6♦'], ['6♣', 'Т♥'], ['9♦', '8♦']], { bluff: true });
E.playCard(g, 0, '7♠', 'command');
E.playCard(g, 1, '6♣'); // обман: обязан был Т♥
E.check(g, 2, '6♣');
assert.strictEqual(ids(E.legalPlays(g, 1)), 'Т♥');
assert.strictEqual(g.trick.command, true, 'команда остаётся');
// 7♠ при «Старшие на стол!» честная; первую карту, 7♠ и вынужденный ход проверять нельзя
g = table([['Т♣', '6♦'], ['7♠', 'Т♥'], ['9♦'], ['8♦', 'К♣']], { bluff: true });
E.playCard(g, 0, 'Т♣'); E.playCard(g, 1, '7♠'); E.playCard(g, 2, '9♦'); E.playCard(g, 3, '8♦');
assert.throws(() => E.check(g, 1, 'Т♣'), /Первую карту/);
assert.throws(() => E.check(g, 0, '7♠'), /7♠/);
assert.throws(() => E.check(g, 0, '9♦'), /одна карта/);
assert.strictEqual(E.canCheck(g, 0, '8♦'), null, 'обычную карту — можно');
g = table([['7♠', '6♦'], ['7♣', 'Т♥'], ['9♦', '8♦']], { bluff: true });
g.hands[1] = [C('Т♥'), C('9♣')]; g.hands[2] = [C('7♠')].concat([]); // спецкарта у отвечающего
g = table([['Т♦', '6♦'], ['К♥', '7♠'], ['9♦', '8♦']], { bluff: true });
E.playCard(g, 0, 'Т♦', 'normal');
g.trick.command = true; // имитируем команду
assert.strictEqual(ids(E.strictLegal(g, 1)), ids([C('К♥'), C('7♠')]), '7♠ честна и при команде');

// Полные партии ботов: 2–6 игроков, с обманом и без, с проверками ботов
let checks = 0, caught = 0;
for (const n of [2, 3, 4, 5, 6]) for (const bluff of [false, true]) for (let i = 0; i < 60; i++) {
  const g = E.newGame({ players: n, rounds: 2 * E.maxCards(n) - 1, names: Array.from({ length: n }, (_, k) => 'b' + k), bluff });
  let guard = 0;
  while (g.phase !== 'gameOver') {
    if (++guard > 20000) throw new Error('зацикливание');
    if (g.phase === 'bid') E.placeBid(g, g.turn, Bots.bid(g, g.turn));
    else if (g.phase === 'play') {
      const m = Bots.play(g, g.turn); E.playCard(g, g.turn, m.cardId, m.mode);
      if (bluff && g.trick) for (let b = 0; b < n; b++) {
        const pl = g.trick.plays[g.trick.plays.length - 1];
        if (pl && b !== pl.p && !E.canCheck(g, b, pl.card.id) && Math.random() < Bots.suspicion(g, b, pl)) { checks++; if (E.check(g, b, pl.card.id).caught) caught++; break; }
      }
    } else if (g.phase === 'trickDone') E.nextTrick(g);
    else if (g.phase === 'roundDone') E.nextRound(g);
  }
  g.history.forEach(h => assert.strictEqual(h.took.reduce((a, b) => a + b, 0), h.cards, 'взятки = карты'));
  const fromHistory = g.scores.map((_, p) => g.history.reduce((a, h) => a + h.delta[p] + h.bonus[p], 0));
  assert.deepStrictEqual(g.scores, fromHistory, 'очки сходятся с историей');
}
console.log(`engine ok · проверок ботами: ${checks}, поймано: ${caught}`);

// 7♠ — джокер: под пики класть не обязательно
g = table([['Т♠'], ['7♠', 'Т♦', 'К♥'], ['Д♣']]);
E.playCard(g, 0, 'Т♠');
assert.strictEqual(ids(E.legalPlays(g, 1)), ids([C('7♠'), C('Т♦'), C('К♥')]), '7♠ не обязывает отвечать в пики');
g = table([['Т♠'], ['7♠', '6♠', 'Т♦'], ['Д♣']]);
E.playCard(g, 0, 'Т♠');
assert.strictEqual(ids(E.legalPlays(g, 1)), ids([C('7♠'), C('6♠')]), 'другие пики — обязан');

// Очки
assert.strictEqual(E.scoreFor(0, 0, 1), 12, 'ноль: 10 + 2 за карту');
assert.strictEqual(E.scoreFor(0, 0, 9), 28);
assert.strictEqual(E.scoreFor(3, 3, 9), 60);
assert.strictEqual(E.scoreFor(3, 1, 9), -40);
assert.strictEqual(E.scoreFor(1, 4, 9), 3, 'перебор: +1 за лишнюю');
assert.strictEqual(E.scoreFor(0, 2, 5), 2);

// Тестовый режим: 10-й раунд без козыря, 15-й тёмный
{
  const m = E.roundModes(E.roundPlan(17, 9), true);
  assert.strictEqual(m[9], 'notrump'); assert.strictEqual(m[14], 'dark');
  assert.strictEqual(m.filter(x => x === 'normal').length, 15);
  assert.ok(E.roundModes(E.roundPlan(17, 9), false).every(x => x === 'normal'));
  // без козыря червь не бьёт чужую масть, «старшие» — по достоинству
  const t = table([['8♣'], ['К♥', '6♦'], ['9♣']]);
  t.trick.trump = null;
  E.playCard(t, 0, '8♣'); E.playCard(t, 1, 'К♥'); E.playCard(t, 2, '9♣');
  assert.strictEqual(t.trickWinner, 2, 'в бескозырке червь не козырь');
  assert.ok(!E.beats(C('6♥'), C('Т♣'), null));
  assert.strictEqual(E.strongestOf([C('Т♣'), C('К♥')], null).id, 'Т♣');
}

// Полная тестовая партия: тёмная скрыта до конца заявок, очки ×2
function playOut(x, opts = {}) {
  let guard = 0;
  while (x.phase !== 'gameOver') {
    if (++guard > 30000) throw new Error('зацикливание');
    if (x.phase === 'pre') { if (opts.pre) opts.pre(x); if (x.phase === 'pre') E.beginBidding(x); }
    else if (x.phase === 'bid') { if (opts.bid) opts.bid(x); E.placeBid(x, x.turn, Bots.bid(x, x.turn)); }
    else if (x.phase === 'play') { const m = Bots.play(x, x.turn); E.playCard(x, x.turn, m.cardId, m.mode); }
    else if (x.phase === 'trickDone') E.nextTrick(x);
    else E.nextRound(x);
  }
  x.history.forEach(h => assert.strictEqual(h.took.reduce((a, b) => a + b, 0), h.cards));
  return x;
}
for (const n of [2, 3, 4, 5, 6]) for (let i = 0; i < 20; i++) {
  let sawDark = false;
  const x = playOut(E.newGame({ players: n, rounds: 17, names: Array.from({ length: n }, (_, k) => 'b' + k), test: true, bluff: i % 2 === 1 }), {
    bid: x => { if (x.mode === 'dark') { sawDark = true; assert.ok(E.handsHidden(x)); } },
  });
  assert.ok(sawDark);
  assert.strictEqual(x.history[9].mode, 'notrump'); assert.strictEqual(x.history[14].mode, 'dark');
  const h = x.history[14];
  h.bids.forEach((b, p) => assert.strictEqual(h.delta[p], 2 * E.scoreFor(b, h.took[p], h.cards), 'тёмная ×2'));
  const fromHistory = x.scores.map((_, p) => x.history.reduce((a, r) => a + r.delta[p] + r.bonus[p], 0));
  assert.deepStrictEqual(x.scores, fromHistory);
}
console.log('тестовый режим ok');

// Умение «Пересдача»: только в окне до заявок
{
  const off = E.newGame({ players: 3, rounds: 5, names: ['a', 'b', 'c'] });
  assert.strictEqual(off.phase, 'bid', 'без умений окна нет');
  assert.ok(E.canReshuffle(off, 0), 'без умений пересдачи нет');
  const g = E.newGame({ players: 4, rounds: 17, names: ['a', 'b', 'c', 'd'], skills: true });
  assert.strictEqual(g.phase, 'pre', 'с умениями раунд начинается с окна пересдачи');
  assert.throws(() => E.placeBid(g, g.turn, 0), /не ваша заявка/, 'заявлять в окне нельзя');
  const first = g.turn, before = JSON.stringify(g.hands);
  E.reshuffle(g, 3);
  assert.notStrictEqual(JSON.stringify(g.hands), before, 'карты новые');
  assert.strictEqual(new Set(g.hands.flat().map(c => c.id)).size, 4);
  assert.strictEqual(g.phase, 'pre', 'окно держится до конца анимации');
  assert.ok(E.canReshuffle(g, 0), 'второй пересдачи в раунде нет');
  E.beginBidding(g);
  assert.strictEqual(g.phase, 'bid'); assert.strictEqual(g.turn, first);
  assert.ok(E.canReshuffle(g, 0), 'во время заявок нельзя');
  while (g.phase === 'bid') E.placeBid(g, g.turn, 0);
  while (g.phase !== 'roundDone') { if (g.phase === 'play') E.playCard(g, g.turn, E.legalPlays(g, g.turn)[0].id); else E.nextTrick(g); }
  E.nextRound(g);
  assert.strictEqual(g.phase, 'pre');
  assert.ok(!E.canReshuffle(g, 0), 'в новом раунде другой игрок может');
  assert.ok(E.canReshuffle(g, 3), 'второй раз за партию нельзя');
  // когда умения у всех кончились — окна нет
  const y = E.newGame({ players: 2, rounds: 5, names: ['a', 'b'], skills: true });
  E.reshuffle(y, 0); E.beginBidding(y);
  while (y.phase !== 'roundDone') { if (y.phase === 'bid') E.placeBid(y, y.turn, 0); else if (y.phase === 'play') E.playCard(y, y.turn, E.legalPlays(y, y.turn)[0].id); else E.nextTrick(y); }
  E.nextRound(y); E.reshuffle(y, 1); E.beginBidding(y);
  while (y.phase !== 'roundDone') { if (y.phase === 'bid') E.placeBid(y, y.turn, 0); else if (y.phase === 'play') E.playCard(y, y.turn, E.legalPlays(y, y.turn)[0].id); else E.nextTrick(y); }
  E.nextRound(y);
  assert.strictEqual(y.phase, 'bid', 'умений не осталось — сразу заявки');
  // в тёмной окна нет
  const z = E.newGame({ players: 4, rounds: 17, names: ['a', 'b', 'c', 'd'], skills: true, test: true });
  let darkPhase = null;
  playOut(z, { pre: x => assert.notStrictEqual(x.mode, 'dark'), bid: x => { if (x.mode === 'dark' && darkPhase === null) darkPhase = x.phase; } });
  assert.strictEqual(darkPhase, 'bid');
  // партии ботов с умениями
  let used = 0;
  for (let i = 0; i < 40; i++) {
    const n = 2 + (i % 5);
    playOut(E.newGame({ players: n, rounds: 2 * E.maxCards(n) - 1, names: Array.from({ length: n }, (_, k) => 'b' + k), skills: true }), {
      pre: x => { for (let p = 0; p < x.n; p++) if (Bots.wantsReshuffle(x, p)) { E.reshuffle(x, p); used++; break; } },
    });
  }
  console.log(`пересдача ok · ботами применено: ${used} за 40 партий`);
}
