// Вылет игрока: за него сразу ходит бот, голосовать за замену — после паузы, вернуться — пока не истекло время, потом место за ботом.
process.env.PORT = 3997;
const http = require('http');
const { server, rooms, AWAY } = require('./server/server.js');
AWAY.GRACE = 300; AWAY.VOTE = 1200; AWAY.KEEP = 3000;
const base = 'http://localhost:3997';
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ ok: r.ok, j: await r.json() }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exit(1); } console.log('ok', m); };
function listen(h, last, k) {
  const req = http.get(`${base}/api/events?room=${h.room}&token=${h.token}`, res => {
    let buf = ''; res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ch = buf.slice(0, i); buf = buf.slice(i + 2); const l = ch.split('\n').find(x => x.startsWith('data: ')); if (l) last[k] = JSON.parse(l.slice(6)); } });
  });
  return req;
}
(async () => {
  const a = await post('/api/create', { name: 'Аня', players: 3, rounds: 5, turnTime: 0, skills: false, blang: 'zh-CN', tz: 'Asia/Shanghai' });
  const b = await post('/api/join', { name: 'Боря', room: a.j.room });
  const last = {};
  listen(a.j, last, 'a');
  let rb = listen(b.j, last, 'b');
  await sleep(200);
  const A = body => post('/api/action', { room: a.j.room, token: a.j.token, ...body });
  await A({ type: 'start' });
  await sleep(200);
  const r = rooms.get(a.j.room);
  assert(/^机器人 /.test(r.seats[2].name), 'имя бота — по региону хозяина (китайское): ' + r.seats[2].name);
  // Боря вылетел
  rb.destroy();
  await sleep(150);
  assert(!(await A({ type: 'voteKick', seat: 1 })).ok, 'голосовать сразу после вылета нельзя');
  // за Борю ходит бот: ход доходит до Ани без участия Бори (таймера хода нет)
  for (let i = 0; i < 60 && !(last.a.turn === 0 && (last.a.phase === 'bid' || last.a.phase === 'play')); i++) {
    if ((last.a.phase === 'bid' || last.a.phase === 'play') && last.a.turn === 0) break;
    await sleep(100);
  }
  const g = r.game;
  const borisActed = g.bids[1] !== null || (g.trick && g.trick.plays.some(p => p.p === 1)) || g.took[1] > 0 || g.history.length;
  assert(borisActed || g.turn !== 1, 'за вылетевшего ходит бот');
  assert(last.a.seats[1].away > 0 && last.a.seats[1].keepLeft > 0, 'остальные видят, что он вылетел и сколько ждать');
  // вернулся до истечения — место его
  rb = listen(b.j, last, 'b');
  await sleep(300);
  assert(!r.seats[1].awaySince && !r.seats[1].bot, 'вернулся — место за ним');
  // снова вылетел; после паузы голосование доступно
  rb.destroy();
  await sleep(AWAY.VOTE + 200);
  assert((await A({ type: 'voteKick', seat: 1 })).ok, 'после паузы голосование доступно');
  await sleep(300);
  assert(r.seats[1].bot, 'голосование (единственный голосующий за) — место отдано боту');
  // второй сценарий: не вернулся — место за ботом по таймеру
  const c = await post('/api/create', { name: 'Вова', players: 3, rounds: 5, turnTime: 0, skills: false });
  const d = await post('/api/join', { name: 'Гена', room: c.j.room });
  const l2 = {};
  listen(c.j, l2, 'c'); const rd = listen(d.j, l2, 'd');
  await sleep(200);
  await post('/api/action', { room: c.j.room, token: c.j.token, type: 'start' });
  await sleep(200);
  rd.destroy();
  await sleep(AWAY.KEEP + 400);
  const r2 = rooms.get(c.j.room);
  assert(r2.seats[1].bot && /бот/.test(r2.seats[1].name), 'не вернулся за отведённое время — место занял бот');
  assert(!(await post('/api/join', { name: 'Гена', room: c.j.room })).ok, 'после этого вернуться на место нельзя');
  server.close(); process.exit(0);
})();
