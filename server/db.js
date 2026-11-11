// Хранилище игроков, сессий и рейтинга.
// Если задан DATABASE_URL — Postgres (Neon). Если нет — память процесса (для запуска у себя и проверок;
// после перезапуска сервера всё пропадает).
'use strict';
const crypto = require('crypto');
const Rating = require('./rating');

const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const newSessionToken = () => crypto.randomBytes(24).toString('base64url');
const cleanNick = s => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
const num = v => (v == null ? v : Number(v));
const pub = p => p && ({ id: num(p.id), nick: p.nick, rating: num(p.rating), games: num(p.games), wins: num(p.wins), picture: p.picture || null });

// Общий расчёт партии: на входе актуальные рейтинги, на выходе новые значения.
function compute(entries, current) {
  // Боты (калибровка) участвуют в расчёте с рейтингом 1000, но сами не меняются.
  const list = entries.map(e => ({ ...e, rating: e.bot ? Rating.START : current.get(e.playerId) }));
  const d = Rating.deltas(list);
  const pl = Rating.places(list);
  return list.map((e, i) => (e.bot ? null : {
    playerId: e.playerId, place: e.place ?? pl[i], score: e.score, left: !!e.left,
    before: e.rating, after: e.rating + d[i], delta: d[i], win: !e.left && (e.place ?? pl[i]) === 1,
  })).filter(Boolean);
}

// ---------- память ----------
function memoryStore() {
  const players = new Map(), bySub = new Map(), sessions = new Map(), matches = [];
  let seq = 0;
  return {
    kind: 'memory',
    async init() {},
    async upsertGoogle(u) {
      let p = bySub.get(u.sub);
      if (!p) {
        p = { id: ++seq, sub: u.sub, nick: cleanNick(u.nick || u.givenName || u.name) || 'Игрок', rating: Rating.START, games: 0, wins: 0 };
        players.set(p.id, p); bySub.set(u.sub, p);
      }
      Object.assign(p, { email: u.email, name: u.name, picture: u.picture });
      return pub(p);
    },
    async newSession(playerId) { const t = newSessionToken(); sessions.set(hash(t), playerId); return t; },
    async bySession(t) { const id = t && sessions.get(hash(t)); return id ? pub(players.get(id)) : null; },
    async dropSession(t) { sessions.delete(hash(t)); },
    async setNick(id, nick) { const p = players.get(id); const n = cleanNick(nick); if (p && n) p.nick = n; },
    async recordMatch(meta, entries) {
      const current = new Map(entries.filter(e => !e.bot).map(e => [e.playerId, players.get(e.playerId).rating]));
      const res = compute(entries, current);
      for (const r of res) { const p = players.get(r.playerId); p.rating = r.after; p.games++; if (r.win) p.wins++; }
      matches.push({ meta, res, at: Date.now() });
      return res;
    },
    async leaderboard(limit, meId) {
      const all = [...players.values()].filter(p => p.games >= Rating.BOARD_MIN_GAMES)
        .sort((a, b) => b.rating - a.rating || b.games - a.games || a.id - b.id);
      const top = all.slice(0, limit).map((p, i) => ({ rank: i + 1, ...pub(p) }));
      let me = null;
      if (meId && players.has(meId)) {
        const p = players.get(meId);
        me = { ...pub(p), rank: p.games >= Rating.BOARD_MIN_GAMES ? 1 + all.filter(o => o.rating > p.rating).length : null };
      }
      return { top, me, minGames: Rating.BOARD_MIN_GAMES };
    },
  };
}

// ---------- Postgres ----------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id          BIGSERIAL PRIMARY KEY,
  google_sub  TEXT UNIQUE NOT NULL,
  email       TEXT,
  name        TEXT,
  picture     TEXT,
  nick        TEXT NOT NULL,
  rating      INTEGER NOT NULL DEFAULT ${Rating.START},
  games       INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  player_id   BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS matches (
  id          BIGSERIAL PRIMARY KEY,
  played_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  room        TEXT,
  seats       INTEGER,
  rounds      INTEGER,
  bluff       BOOLEAN
);
CREATE TABLE IF NOT EXISTS match_players (
  match_id      BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  place         INTEGER NOT NULL,
  score         INTEGER NOT NULL,
  left_game     BOOLEAN NOT NULL DEFAULT false,
  rating_before INTEGER NOT NULL,
  rating_after  INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS players_rating_idx ON players (rating DESC);
CREATE INDEX IF NOT EXISTS match_players_player_idx ON match_players (player_id);
`;
const COLS = 'id, nick, rating, games, wins, picture';

function pgStore(url) {
  const { Pool } = require('pg');
  // channel_binding из строки Neon передаём драйверу отдельным параметром, чтобы он не ушёл серверу как настройка.
  const u = new URL(url);
  const cb = u.searchParams.get('channel_binding');
  u.searchParams.delete('channel_binding');
  const pool = new Pool({ connectionString: u.toString(), enableChannelBinding: cb === 'require', max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000 });
  pool.on('error', e => console.error('db pool:', e.message)); // обрыв простаивающего соединения — не падаем
  const q = (text, params) => pool.query(text, params);
  return {
    kind: 'postgres',
    async init() { await q(SCHEMA); },
    async upsertGoogle(u) {
      const nick = cleanNick(u.nick || u.givenName || u.name) || 'Игрок';
      const { rows } = await q(
        `INSERT INTO players (google_sub, email, name, picture, nick) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture, last_seen = now()
         RETURNING ${COLS}`, [u.sub, u.email, u.name, u.picture, nick]);
      return pub(rows[0]);
    },
    async newSession(playerId) {
      const t = newSessionToken();
      await q('INSERT INTO sessions (token_hash, player_id) VALUES ($1, $2)', [hash(t), playerId]);
      return t;
    },
    async bySession(t) {
      if (!t) return null;
      const { rows } = await q(`SELECT ${COLS.split(', ').map(c => 'p.' + c).join(', ')} FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = $1`, [hash(t)]);
      return rows[0] ? pub(rows[0]) : null;
    },
    async dropSession(t) { await q('DELETE FROM sessions WHERE token_hash = $1', [hash(t)]); },
    async setNick(id, nick) {
      const n = cleanNick(nick);
      if (n) await q('UPDATE players SET nick = $2, last_seen = now() WHERE id = $1', [id, n]);
    },
    async recordMatch(meta, entries) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const ids = entries.filter(e => !e.bot).map(e => e.playerId);
        const { rows } = await c.query('SELECT id, rating FROM players WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [ids]);
        const current = new Map(rows.map(r => [Number(r.id), Number(r.rating)]));
        if (current.size !== ids.length) throw new Error('Игрок не найден в базе');
        const res = compute(entries, current);
        const m = await c.query('INSERT INTO matches (room, seats, rounds, bluff) VALUES ($1, $2, $3, $4) RETURNING id', [meta.room, meta.seats, meta.rounds, !!meta.bluff]);
        const matchId = m.rows[0].id;
        for (const r of res) {
          await c.query('UPDATE players SET rating = $2, games = games + 1, wins = wins + $3 WHERE id = $1', [r.playerId, r.after, r.win ? 1 : 0]);
          await c.query('INSERT INTO match_players (match_id, player_id, place, score, left_game, rating_before, rating_after) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [matchId, r.playerId, r.place, r.score, r.left, r.before, r.after]);
        }
        await c.query('COMMIT');
        return res;
      } catch (e) {
        try { await c.query('ROLLBACK'); } catch {}
        throw e;
      } finally { c.release(); }
    },
    async leaderboard(limit, meId) {
      const min = Rating.BOARD_MIN_GAMES;
      const { rows } = await q(`SELECT ${COLS} FROM players WHERE games >= $1 ORDER BY rating DESC, games DESC, id LIMIT $2`, [min, limit]);
      const top = rows.map((r, i) => ({ rank: i + 1, ...pub(r) }));
      let me = null;
      if (meId) {
        const r = await q(`SELECT ${COLS}, CASE WHEN games >= $2 THEN 1 + (SELECT COUNT(*) FROM players o WHERE o.games >= $2 AND o.rating > p.rating) END AS rank
                           FROM players p WHERE id = $1`, [meId, min]);
        if (r.rows[0]) me = { ...pub(r.rows[0]), rank: r.rows[0].rank == null ? null : Number(r.rows[0].rank) };
      }
      return { top, me, minGames: min };
    },
  };
}

// ---------- обёртка: состояние подключения и повторные попытки ----------
function create(url = process.env.DATABASE_URL) {
  let store = null, status = 'off', error = null;
  if (url) {
    try { store = pgStore(url); status = 'connecting'; }
    catch (e) { status = 'error'; error = e.message; console.error('db:', e.message); }
  } else {
    store = memoryStore(); status = 'memory';
  }
  async function init() {
    if (!store) return;
    try { await store.init(); status = store.kind === 'memory' ? 'memory' : 'ok'; error = null; if (store.kind !== 'memory') console.log('База данных: подключено'); }
    catch (e) { status = 'error'; error = e.message; console.error('db init:', e.message); setTimeout(init, 30000); }
  }
  const need = () => { if (!store || (status !== 'ok' && status !== 'memory')) throw new Error('База данных недоступна, попробуйте позже'); return store; };
  return {
    init,
    ready: () => status === 'ok' || status === 'memory',
    health: () => (status === 'ok' ? 'ok' : status === 'memory' ? 'memory (DATABASE_URL не задан)' : status === 'connecting' ? 'connecting' : `error: ${error || 'нет драйвера'}`),
    upsertGoogle: u => need().upsertGoogle(u),
    newSession: id => need().newSession(id),
    bySession: t => (store && (status === 'ok' || status === 'memory') ? store.bySession(t) : Promise.resolve(null)),
    dropSession: t => need().dropSession(t),
    setNick: (id, n) => need().setNick(id, n),
    recordMatch: (m, e) => need().recordMatch(m, e),
    leaderboard: (l, me) => need().leaderboard(l, me),
  };
}

module.exports = { create, compute };
