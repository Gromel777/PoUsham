// Проверка сценария обучения: подтасованные раздачи и ходы ботов дают ровно те ситуации, о которых говорят подсказки.
'use strict';
const assert = require('assert');
const { Engine: E } = require('./engine/engine.js');
const T = require('./client/tutorial.js');

for (let run = 0; run < 30; run++) {
  const g = T.newTutorialGame(['Ученик', 'Аня', 'Борис', 'Вика', 'Гоша']);
  assert.deepStrictEqual(g.plan, [1, 2, 3, 4, 3, 2, 1], 'план 1-4-1');
  let step = 0, queues = null, qr = -1, guard = 0;
  const active = () => { const s = T.STEPS[step]; return s && g.roundIdx < T.SCRIPT.scripted && s.when(g) ? s : null; };
  const res = [];
  while (g.phase !== 'gameOver' && guard++ < 2000) {
    if (qr !== g.roundIdx) { queues = T.queuesFor(g.roundIdx); qr = g.roundIdx; }
    const st = active();
    if (st && st.tap) { step++; continue; }
    if (st && st.expect) {
      const x = st.expect;
      if (x.type === 'bid') E.placeBid(g, 0, x.value);
      else if (x.type === 'play') E.playCard(g, 0, x.cardId, x.mode);
      else if (x.type === 'check') { const c = E.check(g, 0, x.cardId); assert.ok(c.caught, 'обманщик пойман'); }
      else if (x.type === 'nextRound') { res.push({ scores: g.scores.slice(), h: g.history[g.history.length - 1] }); E.nextRound(g); }
      step++;
      continue;
    }
    if (g.roundIdx < T.SCRIPT.scripted) {
      // в сценарных раундах ученик действует только по подсказке
      assert.ok(!(g.turn === 0 && (g.phase === 'bid' || g.phase === 'play')) || g.fix, `раунд ${g.roundIdx + 1}: ход ученика без подсказки (шаг ${step})`);
      assert.ok(g.phase !== 'roundDone', `раунд ${g.roundIdx + 1}: конец раунда без подсказки`);
    }
    if (g.phase === 'trickDone') { E.nextTrick(g); continue; }
    if (g.phase === 'roundDone') { E.nextRound(g); continue; }
    const p = g.turn;
    if (g.phase === 'bid') E.placeBid(g, p, p === 0 ? 0 : T.botBid(g, p));
    else if (p === 0) { const c = E.strictLegal(g, 0)[0]; E.playCard(g, 0, c.id, 'normal'); }
    else { const m = T.botMove(g, p, queues); E.playCard(g, p, m.cardId, m.mode); }
  }
  assert.strictEqual(g.phase, 'gameOver', 'партия доиграна');
  assert.strictEqual(step, T.STEPS.length, 'все подсказки показаны');
  const h = i => res[i].h;
  // 1: заявил 1, взял 1
  assert.deepStrictEqual([h(0).bids[0], h(0).took[0], h(0).delta[0]], [1, 1, 20]);
  // 2: козырь — 1/1; бот 1 недобрал
  assert.deepStrictEqual([h(1).took[0], h(1).delta[0], h(1).delta[1]], [1, 20, -20]);
  // 3: 7♠ — 2/2 = +40
  assert.deepStrictEqual([h(2).took[0], h(2).delta[0]], [2, 40]);
  // 4: точный ноль +9 (5 + 4 карты), перебор +1 у бота 3, недобор −20 у бота 4
  assert.deepStrictEqual([h(3).took[0], h(3).delta[0], h(3).delta[3], h(3).delta[4]], [0, 9, 1, -20]);
  // 5: ноль удержан (+8 = 5 + 3 карты) и +50 за поимку бота 2
  assert.deepStrictEqual([h(4).took[0], h(4).delta[0], h(4).bonus[0], h(4).bonus[2]], [0, 8, 50, -50]);
  assert.ok(g.bluff, 'последние раунды — в режиме обмана');
}
console.log('обучение ok · сценарий из', T.STEPS.length, 'шагов');

// Флаг «обучение пройдено» в аккаунте (хранилище в памяти — то же поведение, что у Postgres).
(async () => {
  const DB = require('./server/db').create('');
  await DB.init();
  const me = await DB.upsertGoogle({ sub: 't1', email: 'a@b.c', name: 'Тест', nick: 'Тест' });
  assert.strictEqual(me.tutorial, false, 'новичку обучение предлагается');
  const sess = await DB.newSession(me.id);
  await DB.setTutorial(me.id);
  assert.strictEqual((await DB.bySession(sess)).tutorial, true, 'после прохождения флаг стоит');
  console.log('флаг обучения ok');
})().catch(e => { console.error(e); process.exit(1); });
