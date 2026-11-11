// Интеграционный тест: сервер, два человека в комнате, остальное боты; играем партию до конца.
process.env.PORT = 3999;
const http = require('http');
const { server } = require('./server/server.js');
const base = 'http://localhost:3999';
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ ok: r.ok, j: await r.json() }));
function listen(room, token, onView) {
  http.get(`${base}/api/events?room=${room}&token=${token}`, res => {
    let buf = '';
    res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ch = buf.slice(0, i); buf = buf.slice(i + 2); const line = ch.split('\n').find(l => l.startsWith('data: ')); if (line) onView(JSON.parse(line.slice(6))); } });
  });
}
(async () => {
  const st = await fetch(base + '/').then(r => r.status); console.log('index', st, await fetch(base + '/client.js').then(r => r.status), await fetch(base + '/style.css').then(r => r.status));
  const a = await post('/api/create', { name: 'Аня', players: 4, rounds: 3 });
  const b = await post('/api/join', { name: 'Боря', room: a.j.room });
  console.log('room', a.j.room, 'join ok', b.ok);
  console.log('bad join', (await post('/api/join', { name: 'x', room: 'ZZZZ' })).j.error);
  console.log('non-host start', (await post('/api/action', { room: a.j.room, token: b.j.token, type: 'start' })).j.error);
  const humans = [a.j, b.j]; let done = false; let checks = { hiddenOk: true };
  for (const h of humans) listen(h.room, h.token, async v => {
    if (v.stage !== 'game' || done) return;
    if (v.you === 0 && v.skills && v.skills.reshuffle.can && !checks.reshuffleSent) {
      checks.reshuffleSent = true;
      post('/api/action', { room: h.room, token: h.token, type: 'skill', skill: 'reshuffle' }).then(r => { checks.reshuffleOk = r.ok; });
      return;
    }
    if (v.reshuffle && v.reshuffle.by === 0) checks.reshuffleSeen = true;
    if (v.you === 0 && checks.reshuffleSeen && v.skills && v.skills.reshuffle.left) checks.reshuffleLeftBug = true;
    if (v.hand.length !== v.handCounts[v.you]) checks.hiddenOk = false;
    if (JSON.stringify(v).includes('"hands"')) checks.hiddenOk = false;
    if (v.phase === 'gameOver') { if (!done) { done = true; console.log('gameOver scores', v.scores, 'rounds', v.history.length, checks); server.close(); process.exit(0); } return; }
    if (v.phase === 'roundDone') { if (v.next && v.next.ready.length && !v.next.ready.includes(v.you)) checks.waitsForAll = true; if (v.next && !v.next.ready.includes(v.you)) post('/api/action', { room: h.room, token: h.token, type: 'nextRound' }); return; }
    if (v.turn !== v.you) return;
    if (v.phase === 'bid') post('/api/action', { room: h.room, token: h.token, type: 'bid', value: 0 });
    else if (v.phase === 'play' && v.legal.length) post('/api/action', { room: h.room, token: h.token, type: 'play', cardId: v.legal[0], mode: 'normal' });
  });
  await new Promise(r => setTimeout(r, 300));
  console.log('start', (await post('/api/action', { room: a.j.room, token: a.j.token, type: 'start' })).ok);
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
})();
