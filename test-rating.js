// Проверки рейтинга: попарное Эло, места, правила зачёта, вход через Google и партия онлайн с аккаунтами.
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const Rating = require('./server/rating');
const Google = require('./server/google');

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

// ---------- формула ----------
{
  // Двое равных: победитель +16, проигравший −16.
  const d = Rating.deltas([{ rating: 1000, score: 100 }, { rating: 1000, score: 50 }]);
  ok(d[0] === 16 && d[1] === -16, 'двое равных: ±16, получили ' + d);
  // Ничья равных — без изменений.
  const t = Rating.deltas([{ rating: 1000, score: 70 }, { rating: 1000, score: 70 }]);
  ok(t[0] === 0 && t[1] === 0, 'ничья равных — 0');
  // Победа над сильным даёт больше, чем над слабым.
  const strong = Rating.deltas([{ rating: 1000, score: 10 }, { rating: 1300, score: 0 }])[0];
  const weak = Rating.deltas([{ rating: 1000, score: 10 }, { rating: 700, score: 0 }])[0];
  ok(strong > 16 && weak < 16 && strong > weak, `сильный ${strong} > слабый ${weak}`);
  // Поражение от слабого стоит дороже, чем от сильного.
  const lossWeak = Rating.deltas([{ rating: 1000, score: 0 }, { rating: 700, score: 10 }])[0];
  const lossStrong = Rating.deltas([{ rating: 1000, score: 0 }, { rating: 1300, score: 10 }])[0];
  ok(lossWeak < lossStrong, `проигрыш слабому ${lossWeak} < сильному ${lossStrong}`);
  // Четверо равных: 1-е +16, 2-е +5, 3-е −5, 4-е −16 (K/(n−1) × сумма), сумма ≈ 0.
  const four = Rating.deltas([40, 30, 20, 10].map(score => ({ rating: 1000, score })));
  ok(four.join() === '16,5,-5,-16', 'четверо равных: ' + four);
  // Ушедший — последний, даже если очков больше всех.
  const left = Rating.deltas([{ rating: 1000, score: 500, left: true }, { rating: 1000, score: 0 }]);
  ok(left[0] < 0 && left[1] > 0, 'ушедший проигрывает');
  // Места с дележом.
  ok(Rating.places([{ score: 50 }, { score: 80 }, { score: 50 }, { score: 0, left: true }]).join() === '2,1,2,4', 'места с дележом');
}

// ---------- хранилище в памяти ----------
(async () => {
  const DB = require('./server/db').create('');
  await DB.init();
  ok(DB.ready() && DB.health().startsWith('memory'), 'память вместо базы без DATABASE_URL');
  const a = await DB.upsertGoogle({ sub: 'g-a', email: 'a@x', name: 'Аня Иванова', givenName: 'Аня' });
  const b = await DB.upsertGoogle({ sub: 'g-b', email: 'b@x', name: 'Боря' });
  const a2 = await DB.upsertGoogle({ sub: 'g-a', email: 'a@x', name: 'Аня Иванова' });
  ok(a.id === a2.id && a.rating === 1000 && a.nick === 'Аня', 'повторный вход — тот же игрок');
  const s = await DB.newSession(a.id);
  ok((await DB.bySession(s)).id === a.id && (await DB.bySession('нет')) === null, 'сессия');
  const res = await DB.recordMatch({ room: 'TEST' }, [{ playerId: a.id, score: 100 }, { playerId: b.id, score: 10 }]);
  ok(res[0].after === 1016 && res[1].after === 984 && res[0].win && !res[1].win, 'запись партии');
  let lb = await DB.leaderboard(10, a.id);
  ok(lb.top.length === 0 && lb.me.rank === null && lb.me.games === 1, 'в таблице лидеров — после 5 партий');
  for (let i = 0; i < 4; i++) await DB.recordMatch({}, [{ playerId: a.id, score: 1 }, { playerId: b.id, score: 0 }]);
  lb = await DB.leaderboard(10, b.id);
  ok(lb.top.length === 2 && lb.top[0].id === a.id && lb.me.rank === 2 && lb.top[0].wins === 5, 'таблица лидеров');
  await DB.dropSession(s);
  ok((await DB.bySession(s)) === null, 'выход');

  // ---------- проверка токена Google ----------
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  Google._setKeyFetcher(async () => ({ keys: [jwk], ttl: 60000 }));
  const sign = (payload, key = privateKey, kid = 'k1') => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key).toString('base64url')}`;
  };
  const CID = 'test-client.apps.googleusercontent.com';
  const good = { iss: 'https://accounts.google.com', aud: CID, sub: '42', email: 'v@x', name: 'Вика', exp: Date.now() / 1000 + 600 };
  ok((await Google.verifyIdToken(sign(good), CID)).sub === '42', 'верный токен');
  const bad = async (tok, what) => { try { await Google.verifyIdToken(tok, CID); ok(false, what); } catch { ok(true); } };
  await bad(sign({ ...good, aud: 'other' }), 'чужой aud');
  await bad(sign({ ...good, exp: 1 }), 'просрочен');
  await bad(sign({ ...good, iss: 'evil' }), 'чужой iss');
  await bad(sign(good, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), 'чужая подпись');
  await bad('мусор', 'мусор');

  // ---------- онлайн: два игрока с аккаунтом, гость и бот ----------
  process.env.PORT = 3998;
  process.env.GOOGLE_CLIENT_ID = CID;
  delete process.env.DATABASE_URL;
  const { server } = require('./server/server.js');
  const base = 'http://localhost:3998';
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json() }));
  await new Promise(r => setTimeout(r, 200));
  const health = await fetch(base + '/health').then(r => r.json());
  ok(health.google === true && health.db.startsWith('memory'), '/health: ' + JSON.stringify(health));
  const cfg = await fetch(base + '/api/config').then(r => r.json());
  ok(cfg.googleClientId === CID && cfg.ratings === true, '/api/config');
  ok((await fetch(base + '/privacy').then(r => r.status)) === 200, '/privacy');

  const login = async (sub, name) => (await post('/api/auth/google', { credential: sign({ ...good, sub, name }), nick: name })).j;
  const A = await login('ga', 'Аня'), B = await login('gb', 'Боря');
  ok(A.session && A.me.rating === 1000 && B.me.id !== A.me.id, 'вход через Google');
  ok(!(await post('/api/auth/google', { credential: sign({ ...good, aud: 'x' }) })).ok, 'плохой токен отклонён');
  ok((await post('/api/me', { session: A.session })).j.me.nick === 'Аня', '/api/me');

  const room = (await post('/api/create', { name: 'Аня', players: 4, rounds: 2, turnTime: 0, session: A.session })).j;
  const jb = (await post('/api/join', { name: 'Боря', room: room.room, session: B.session })).j;
  const guest = (await post('/api/join', { name: 'Гость', room: room.room })).j;
  ok(jb.token && guest.token, 'вошли за стол');
  // Нельзя занять место игрока с аккаунтом, просто введя его имя.
  ok(!(await post('/api/join', { name: 'Боря', room: room.room })).ok, 'чужое место с аккаунтом по имени не занять');

  const listen = (token, onView) => http.get(`${base}/api/events?room=${room.room}&token=${token}`, res => {
    let buf = '';
    res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ch = buf.slice(0, i); buf = buf.slice(i + 2); const line = ch.split('\n').find(l => l.startsWith('data: ')); if (line) onView(JSON.parse(line.slice(6))); } });
  });
  let lobbySeen = false;
  const finished = new Promise(resolve => {
    for (const h of [{ token: room.token }, { token: jb.token }, { token: guest.token }]) listen(h.token, v => {
      if (v.stage === 'lobby' && v.seats.length === 3) {
        lobbySeen = lobbySeen || (v.seats[0].rating === 1000 && v.seats[1].rating === 1000 && v.seats[2].rating === null);
      }
      if (v.stage !== 'game') return;
      if (v.phase === 'gameOver') { if (v.rating && v.rating.status !== 'pending' && v.you === 0) resolve(v); return; }
      if (v.phase === 'roundDone' && v.you === 0) return post('/api/action', { room: room.room, token: h.token, type: 'nextRound' });
      if (v.turn !== v.you) return;
      if (v.phase === 'bid') post('/api/action', { room: room.room, token: h.token, type: 'bid', value: 0 });
      else if (v.phase === 'play' && v.legal.length) post('/api/action', { room: room.room, token: h.token, type: 'play', cardId: v.legal[0], mode: 'normal' });
    });
  });
  await new Promise(r => setTimeout(r, 300));
  await post('/api/action', { room: room.room, token: room.token, type: 'start' });
  const timeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 90000);
  const v = await finished;
  clearTimeout(timeout);
  ok(lobbySeen, 'рейтинг виден в лобби у игроков с аккаунтом, у гостя — нет');
  // Стол по коду — обычная игра: рейтинг не меняется (рейтинговые партии проверяет test-lobby.js).
  ok(v.rating.status === 'skip' && /Обычная/.test(v.rating.reason), 'стол по коду — без рейтинга');
  const me = (await post('/api/me', { session: A.session })).j.me;
  ok(me.rating === 1000 && me.games === 0, 'рейтинг не изменился');
  const lb2 = (await post('/api/leaderboard', { session: B.session })).j;
  ok(lb2.me.games === 0 && lb2.minGames === 5, 'таблица лидеров по API');

  console.log(`test-rating: ${passed} проверок пройдено`);
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
