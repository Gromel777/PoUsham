// Тестовый режим на сервере: 17 раундов, «Тёмная» скрывает карты, окно пересдачи перед заявками.
process.env.PORT = 3994;
const assert = require('assert');
const http = require('http');
const { server, rooms } = require('./server/server.js');
const { Engine: E } = require('./engine/engine.js');
const base = 'http://localhost:3994';
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ ok: r.ok, j: await r.json() }));
function lastView(room, token) {
  return new Promise(res => {
    http.get(`${base}/api/events?room=${room}&token=${token}`, s => {
      let buf = '';
      s.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).split('\n').find(l => l.startsWith('data: ')); buf = buf.slice(i + 2);
          if (line) { s.destroy(); return res(JSON.parse(line.slice(6))); }
        }
      });
    });
  });
}
(async () => {
  const a = await post('/api/create', { name: 'Аня', players: 2, rounds: 5, test: true, skills: true });
  const b = await post('/api/join', { name: 'Боря', room: a.j.room });
  const r = rooms.get(a.j.room);
  assert.strictEqual(r.rounds, 17, 'тестовый режим — всегда 17 раундов');
  await post('/api/action', { room: a.j.room, token: a.j.token, type: 'start' });
  let v = await lastView(a.j.room, a.j.token);
  assert.strictEqual(v.phase, 'pre', 'раунд начинается с окна пересдачи');
  assert.ok(v.pre && v.pre.left > 3000, 'окно = объявление + раздача + 3 с');
  assert.strictEqual((await post('/api/action', { room: a.j.room, token: a.j.token, type: 'bid', value: 0 })).ok, false, 'в окне заявлять нельзя');
  assert.strictEqual((await post('/api/action', { room: a.j.room, token: b.j.token, type: 'skill', skill: 'reshuffle' })).ok, true);
  v = await lastView(a.j.room, a.j.token);
  assert.strictEqual(v.phase, 'pre'); assert.ok(v.pre.after && v.pre.left <= 4500, 'после пересдачи — пауза на анимацию');
  // перематываем к «Тёмной» (15-й раунд)
  const g = r.game;
  clearTimeout(r.preTimer); clearTimeout(r.preBotTimer);
  g.roundIdx = 13; g.phase = 'roundDone';
  E.nextRound(g);
  assert.strictEqual(g.mode, 'dark');
  r.preKey = 'x';
  v = await lastView(a.j.room, a.j.token);
  assert.strictEqual(v.phase, 'bid', 'в тёмной окна пересдачи нет');
  assert.ok(v.handHidden && v.hand.every(c => c.hidden), 'карты скрыты');
  assert.ok(!JSON.stringify(v.hand).match(/[♠♣♦♥]/), 'настоящие карты не уходят клиенту');
  E.placeBid(g, g.turn, 1); E.placeBid(g, g.turn, 1);
  r.preKey = 'y';
  v = await lastView(a.j.room, a.j.token);
  assert.ok(!v.handHidden && v.hand.every(c => !c.hidden), 'после заявок карты открыты');
  // бескозырка
  g.roundIdx = 8; g.phase = 'roundDone'; E.nextRound(g);
  assert.strictEqual(g.mode, 'notrump'); assert.strictEqual(g.trump, null);
  v = await lastView(a.j.room, a.j.token);
  assert.strictEqual(v.trump, null); assert.strictEqual(v.modes[9], 'notrump'); assert.strictEqual(v.modes[14], 'dark');
  console.log('test-modes ok');
  server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
