// Проверки: список открытых столов, подбор (рейтинговый и обычный), автостарт, калибровка с ботами.
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const Google = require('./server/google');

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  Google._setKeyFetcher(async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }], ttl: 1e9 }));
  const CID = 'lobby-test.apps.googleusercontent.com';
  const sign = p => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
    const b = Buffer.from(JSON.stringify(p)).toString('base64url');
    return `${h}.${b}.${crypto.sign('RSA-SHA256', Buffer.from(h + '.' + b), privateKey).toString('base64url')}`;
  };
  process.env.PORT = 3995; process.env.GOOGLE_CLIENT_ID = CID; delete process.env.DATABASE_URL;
  const { server, MM, rooms } = require('./server/server.js');
  MM.CASUAL_BOTS_AFTER = 1500; MM.AUTOSTART = 1500;
  const base = 'http://localhost:3995';
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json() }));
  await sleep(200);
  const login = async (sub, name) => (await post('/api/auth/google', { credential: sign({ iss: 'accounts.google.com', aud: CID, sub, name, picture: 'https://example.com/' + sub + '.jpg', exp: Date.now() / 1e3 + 3600 }), nick: name })).j;

  // Слушаем стол; бот-логика для живых игроков: заявка 0, первая разрешённая карта.
  const play = (room, token, onView) => http.get(`${base}/api/events?room=${room}&token=${token}`, res => {
    let buf = '';
    res.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const ch = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = ch.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const v = JSON.parse(line.slice(6));
        onView && onView(v);
        if (v.stage !== 'game') continue;
        if (v.phase === 'roundDone' && v.isHost) post('/api/action', { room, token, type: 'nextRound' });
        if (v.turn !== v.you) continue;
        if (v.phase === 'bid') post('/api/action', { room, token, type: 'bid', value: 0 });
        else if (v.phase === 'play' && v.legal.length) post('/api/action', { room, token, type: 'play', cardId: v.legal[0], mode: 'normal' });
      }
    });
  });

  // ---------- открытые столы ----------
  const pub = (await post('/api/create', { name: 'Хост', players: 3, listed: true })).j;
  const priv = (await post('/api/create', { name: 'Тайный', players: 3 })).j;
  let list = (await fetch(base + '/api/rooms').then(r => r.json())).rooms;
  ok(list.length === 0, 'стол без хоста в сети не показывается');
  const hostReq = play(pub.room, pub.token);
  await sleep(200);
  list = (await fetch(base + '/api/rooms').then(r => r.json())).rooms;
  ok(list.length === 1 && list[0].code === pub.room && list[0].host === 'Хост' && list[0].size === 3, 'открытый стол в списке, закрытого нет');
  ok(!list.some(x => x.code === priv.room), 'закрытый стол не в списке');
  hostReq.destroy();

  // ---------- рейтинговый подбор ----------
  const A = await login('a', 'Аня'), B = await login('b', 'Боря'), C = await login('c', 'Вова'), D = await login('d', 'Гена');
  ok(!(await post('/api/mm/join', { mode: 'ranked', name: 'Гость' })).ok, 'рейтинг без входа нельзя');
  const ta = (await post('/api/mm/join', { mode: 'ranked', sizes: [2], session: A.session, name: 'Аня' })).j.ticket;
  let st = (await post('/api/mm/status', { ticket: ta })).j;
  ok(st.state === 'waiting' && st.window === 100, 'ждём соперника: ' + JSON.stringify(st));
  const tb = (await post('/api/mm/join', { mode: 'ranked', sizes: [2], session: B.session, name: 'Боря' })).j.ticket;
  ok((await post('/api/mm/status', { ticket: ta })).j.state === 'waiting', 'рейтинг вдвоём не садим — нужен стол на 4');
  const tc = (await post('/api/mm/join', { mode: 'ranked', session: C.session, name: 'Вова' })).j.ticket;
  const td = (await post('/api/mm/join', { mode: 'ranked', session: D.session, name: 'Гена' })).j.ticket;
  const ma = (await post('/api/mm/status', { ticket: ta })).j, mb = (await post('/api/mm/status', { ticket: tb })).j;
  const mc = (await post('/api/mm/status', { ticket: tc })).j, md = (await post('/api/mm/status', { ticket: td })).j;
  ok([mb, mc, md].every(m => m.state === 'matched' && m.room === ma.room) && ma.kind === 'ranked', 'четверо нашли друг друга');
  ok(!(await post('/api/join', { room: ma.room, name: 'Чужой' })).ok, 'за стол подбора по коду не сесть');
  let lastA = null;
  const doneRanked = new Promise(resolve => {
    play(ma.room, ma.token, v => { lastA = v; if (v.stage === 'game' && v.phase === 'gameOver' && v.rating && v.rating.status === 'done') resolve(v); });
    play(mb.room, mb.token); play(mc.room, mc.token); play(md.room, md.token);
  });
  await sleep(400);
  ok(lastA.stage === 'game', 'стол подбора стартовал сам, когда все подключились');
  ok(lastA.seats[0].pic === 'https://example.com/a.jpg' && lastA.kind === 'ranked', 'фото и тип стола в состоянии');
  ok(lastA.bluff === true && lastA.rounds === 17, 'рейтинг: режим обмана и 17 раундов');
  // Чтобы не ждать 17 раундов — сокращаем партию.
  const room = rooms.get(ma.room); room.game.plan = room.game.plan.slice(0, 1);
  const v = await Promise.race([doneRanked, sleep(60000).then(() => null)]);
  ok(v && Object.keys(v.rating.changes).length === 4, 'рейтинговая партия засчитана');
  ok(!(await post('/api/action', { room: ma.room, token: ma.token, type: 'restart' })).ok, 'рейтинговую не переиграть');

  // ---------- рейтинг: только на 4; за минуту не набрались — трое + бот ----------
  MM.RANKED_BOTS_AFTER = 1500;
  const r1 = (await post('/api/mm/join', { mode: 'ranked', sizes: [2], session: A.session, name: 'Аня' })).j.ticket;
  const r2 = (await post('/api/mm/join', { mode: 'ranked', session: B.session, name: 'Боря' })).j.ticket;
  await sleep(300);
  ok((await post('/api/mm/status', { ticket: r1 })).j.sizes.join() === '4', 'рейтинговый поиск — всегда стол на 4');
  await sleep(1800);
  ok((await post('/api/mm/status', { ticket: r1 })).j.state === 'waiting', 'рейтинг вдвоём не садим даже после ожидания');
  const r3 = (await post('/api/mm/join', { mode: 'ranked', session: C.session, name: 'Вова' })).j.ticket;
  await sleep(1200);
  const s1 = (await post('/api/mm/status', { ticket: r1 })).j, s3 = (await post('/api/mm/status', { ticket: r3 })).j;
  ok(s1.state === 'matched' && s1.room === s3.room && s1.kind === 'ranked', 'втроём после ожидания — за рейтинговый стол');
  const rr = rooms.get(s1.room);
  ok(rr.size === 4 && rr.seats.length === 3, 'стол на 4, трое людей — четвёртое место займёт бот');
  await post('/api/mm/status', { ticket: r2 });

  // ---------- обычный подбор с ботами после ожидания ----------
  const g1 = (await post('/api/mm/join', { mode: 'casual', sizes: [4], name: 'Гость1' })).j.ticket;
  const g2 = (await post('/api/mm/join', { mode: 'casual', sizes: [4], name: 'Гость1' })).j.ticket;
  ok((await post('/api/mm/status', { ticket: g1 })).j.state === 'waiting', 'вдвоём на стол из 4 — пока ждём');
  await sleep(2600);
  const c1 = (await post('/api/mm/status', { ticket: g1 })).j, c2 = (await post('/api/mm/status', { ticket: g2 })).j;
  ok(c1.state === 'matched' && c1.room === c2.room && c1.kind === 'casual', 'после ожидания — за стол с ботами');
  const rc = rooms.get(c1.room);
  ok(rc.seats.map(s => s.name).join() === 'Гость1,Гость1 2', 'одинаковые имена различаются');
  // Второй так и не пришёл — на старте его место займёт бот.
  play(c1.room, c1.token);
  await sleep(2600);
  ok(rc.game && rc.seats.length === 4 && rc.seats[1].bot && rc.seats.filter(s => s.bot).length === 3, 'не подключившегося заменил бот');

  // ---------- «любой стол»: сначала ждём стол побольше ----------
  const x1 = (await post('/api/mm/join', { mode: 'casual', name: 'X' })).j.ticket;
  const x2 = (await post('/api/mm/join', { mode: 'casual', name: 'Y' })).j.ticket;
  ok((await post('/api/mm/status', { ticket: x1 })).j.state === 'waiting', '«любой»: вдвоём сразу не садим');
  await post('/api/mm/cancel', { ticket: x1 });
  ok((await post('/api/mm/status', { ticket: x1 })).j.state === 'gone', 'отмена поиска');
  await post('/api/mm/cancel', { ticket: x2 });

  console.log(`test-lobby: ${passed} проверок пройдено`);
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
