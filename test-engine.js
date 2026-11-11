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

// Умение «Пересдача»
{
  const off = E.newGame({ players: 3, rounds: 5, names: ['a', 'b', 'c'] });
  assert.ok(E.canReshuffle(off, 0), 'без умений пересдачи нет');
  const g = E.newGame({ players: 4, rounds: 17, names: ['a', 'b', 'c', 'd'], skills: true });
  while (g.plan[g.roundIdx] < 5) { // доходим до раунда с 5 картами
    while (g.phase === 'bid') E.placeBid(g, g.turn, 0);
    while (g.phase !== 'roundDone') { if (g.phase === 'play') E.playCard(g, g.turn, E.legalPlays(g, g.turn)[0].id); else E.nextTrick(g); }
    E.nextRound(g);
  }
  const first = g.turn, before = JSON.stringify(g.hands);
  E.placeBid(g, g.turn, 2);
  E.reshuffle(g, 3);
  assert.notStrictEqual(JSON.stringify(g.hands), before, 'карты новые');
  assert.ok(g.hands.every(h => h.length === 5), 'у всех по 5 карт');
  assert.strictEqual(new Set(g.hands.flat().map(c => c.id)).size, 20, 'без повторов');
  assert.ok(g.bids.every(b => b === null), 'заявки сброшены');
  assert.strictEqual(g.turn, first, 'заявляет снова тот же');
  assert.strictEqual(g.lastReshuffle.by, 3);
  assert.ok(E.canReshuffle(g, 0), 'второй пересдачи в раунде нет');
  assert.throws(() => E.reshuffle(g, 3));
  while (g.phase === 'bid') E.placeBid(g, g.turn, 1);
  assert.ok(E.canReshuffle(g, 0), 'во время розыгрыша нельзя');
  while (g.phase !== 'roundDone') { if (g.phase === 'play') E.playCard(g, g.turn, E.legalPlays(g, g.turn)[0].id); else E.nextTrick(g); }
  E.nextRound(g);
  assert.ok(!E.canReshuffle(g, 0), 'в новом раунде другой игрок может');
  assert.ok(E.canReshuffle(g, 3), 'второй раз за партию нельзя');
  // Партии ботов с умениями: всё сходится, каждый пересдаёт не больше раза.
  let used = 0;
  for (let i = 0; i < 40; i++) {
    const n = 2 + (i % 5);
    const x = E.newGame({ players: n, rounds: 2 * E.maxCards(n) - 1, names: Array.from({ length: n }, (_, k) => 'b' + k), skills: true });
    let c = 0;
    while (x.phase !== 'gameOver') {
      if (x.phase === 'bid') { if (Bots.wantsReshuffle(x, x.turn)) { E.reshuffle(x, x.turn); c++; } else E.placeBid(x, x.turn, Bots.bid(x, x.turn)); }
      else if (x.phase === 'play') { const m = Bots.play(x, x.turn); E.playCard(x, x.turn, m.cardId, m.mode); }
      else if (x.phase === 'trickDone') E.nextTrick(x);
      else E.nextRound(x);
    }
    assert.ok(c <= n); used += c;
    x.history.forEach(h => assert.strictEqual(h.took.reduce((a, b) => a + b, 0), h.cards));
  }
  console.log(`пересдача ok · ботами применено: ${used} за 40 партий`);
}
