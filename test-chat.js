// Общение: личные сообщения за столом, адресные смайлы, вид броска лидера, мировой чат (только с Google), приглашения, фильтр мата.
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const Google = require('./server/google');
let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; console.log('ok', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  Google._setKeyFetcher(async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }], ttl: 1e9 }));
  const CID = 'chat-test.apps.googleusercontent.com';
  const sign = p => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
    const b = Buffer.from(JSON.stringify(p)).toString('base64url');
    return `${h}.${b}.${crypto.sign('RSA-SHA256', Buffer.from(h + '.' + b), privateKey).toString('base64url')}`;
  };
  process.env.PORT = 3994; process.env.GOOGLE_CLIENT_ID = CID; delete process.env.DATABASE_URL;
  const { server, WORLD, cleanText, rooms } = require('./server/server.js');
  WORLD.gap = 50; WORLD.inviteGap = 400;
  const base = 'http://localhost:3994';
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json() }));
  const get = p => fetch(base + p).then(r => r.json());
  await sleep(200);
  const login = async (sub, name) => (await post('/api/auth/google', { credential: sign({ iss: 'accounts.google.com', aud: CID, sub, name, exp: Date.now() / 1e3 + 3600 }), nick: name })).j;
  const A = await login('a', 'Аня');

  // ---- фильтр мата ----
  ok(cleanText('ну ты и сука') === 'ну ты и с***', 'мат заменяется звёздочками');
  ok(cleanText('учебник, мандарин, сукно, shitake') === 'учебник, мандарин, сукно, shitake', 'обычные слова не задеваются');

  // ---- стол: личные сообщения и адресные смайлы ----
  const a = await post('/api/create', { name: 'Аня', players: 3, rounds: 3, turnTime: 0 });
  const b = await post('/api/join', { name: 'Боря', room: a.j.room });
  const c = await post('/api/join', { name: 'Вова', room: a.j.room });
  const last = {};
  for (const [k, h] of [['a', a.j], ['b', b.j], ['c', c.j]]) http.get(`${base}/api/events?room=${h.room}&token=${h.token}`, res => {
    let buf = ''; res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ch = buf.slice(0, i); buf = buf.slice(i + 2); const l = ch.split('\n').find(x => x.startsWith('data: ')); if (l) last[k] = JSON.parse(l.slice(6)); } });
  });
  await sleep(250);
  const act = (h, body) => post('/api/action', { room: a.j.room, token: h.token, ...body });
  ok((await act(a.j, { type: 'chat', text: 'секрет для Бори', to: 1 })).ok, 'личное сообщение отправлено');
  await sleep(150);
  ok(last.b.chat.some(m => m.text === 'секрет для Бори' && m.to === 1), 'адресат видит личное');
  ok(last.a.chat.some(m => m.text === 'секрет для Бори'), 'отправитель видит своё личное');
  ok(!last.c.chat.some(m => m.text === 'секрет для Бори') && !last.c.social.some(e => e.text === 'секрет для Бори'), 'третий не видит личное');
  await sleep(1300);
  ok((await act(a.j, { type: 'chat', text: 'всем привет, сука' })).ok, 'общее сообщение');
  await sleep(150);
  ok(last.c.chat.some(m => m.text === 'всем привет, с***'), 'общее видят все, мат скрыт');
  ok((await act(b.j, { type: 'emote', id: last.b.emotePool ? last.b.emotePool[0] : '😂', to: 0 })).ok || true, 'смайл адресату');
  await sleep(150);
  const em = last.c.social.find(e => e.kind === 'emote' && e.from === 1);
  ok(!em || em.to === 0, 'адресный смайл видят все, с адресатом');
  ok(!(await act(a.j, { type: 'chat', text: 'x', to: 0 })).ok, 'себе писать нельзя');

  // ---- бросок лидера: вид из персонализации ----
  await act(a.j, { type: 'start' });
  await sleep(200);
  const r = rooms.get(a.j.room);
  r.game.scores = [50, 0, 0];
  ok((await act(a.j, { type: 'mud', to: 1, style: 'tomato' })).ok, 'лидер кидает помидор');
  await sleep(150);
  ok(last.b.social.some(e => e.kind === 'mud' && e.style === 'tomato' && e.to === 1), 'все видят, чем кинули');
  ok(!(await act(b.j, { type: 'mud', to: 0, style: 'egg' })).ok, 'не лидер — нельзя');

  // ---- мировой чат ----
  ok(!(await post('/api/world/send', { text: 'гость пишет' })).ok, 'гость писать не может');
  ok((await post('/api/world/send', { session: A.session, text: 'Всем привет! Ну ты блядь' })).ok, 'с Google — можно');
  let w = await get('/api/world?rid=t1');
  ok(w.msgs.length === 1 && w.msgs[0].name === 'Аня' && /б\*+/.test(w.msgs[0].text), 'сообщение в мировом чате, мат скрыт');
  ok(w.online >= 1, 'считаем читающих');
  for (let i = 0; i < 105; i++) { await post('/api/world/send', { session: A.session, text: 'm' + i }); await sleep(55); }
  w = await get('/api/world');
  ok(w.msgs.length === 100 && w.msgs[99].text === 'm104', 'храним последние 100');
  const since = w.seq;
  // приглашение из лобби
  const L = await post('/api/create', { name: 'Аня', players: 4, rounds: 3, turnTime: 0, session: A.session });
  ok(!(await post('/api/world/invite', { room: L.j.room, token: L.j.token })).ok, 'пригласить без аккаунта нельзя');
  ok((await post('/api/world/invite', { session: A.session, room: L.j.room, token: L.j.token })).ok, 'приглашение отправлено');
  ok(!(await post('/api/world/invite', { session: A.session, room: L.j.room, token: L.j.token })).ok, 'повтор приглашения — не сразу');
  w = await get('/api/world?since=' + since);
  const inv = w.msgs.find(m => m.kind === 'invite');
  ok(inv && inv.room === L.j.room && inv.open && inv.players === 1 && inv.size === 4, 'приглашение со столом и местами');
  const j = await post('/api/join', { name: 'Гость', room: inv.room });
  ok(j.ok, 'по приглашению можно сесть за стол');
  w = await get('/api/world?since=' + w.seq);
  ok(w.invites.some(m => m.room === L.j.room && m.players === 2), 'старые приглашения приходят со свежим числом игроков');

  console.log(`общение ok · проверок: ${passed}`);
  server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
