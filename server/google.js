// Проверка входа через Google: ID-токен (JWT, RS256) проверяется по открытым ключам Google.
// Без внешних библиотек — только встроенный crypto и fetch (Node 18+).
'use strict';
const crypto = require('crypto');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let keys = null, keysUntil = 0;
let fetchKeys = async () => {
  const r = await fetch(CERTS_URL);
  if (!r.ok) throw new Error('Не удалось получить ключи Google');
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  return { keys: j.keys || [], ttl: m ? +m[1] * 1000 : 3600 * 1000 };
};

async function getKey(kid) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!keys || Date.now() > keysUntil || attempt === 1) {
      const got = await fetchKeys();
      keys = got.keys; keysUntil = Date.now() + got.ttl;
    }
    const jwk = keys.find(k => k.kid === kid);
    if (jwk) return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }
  throw new Error('Неизвестный ключ подписи');
}

const part = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

// Возвращает данные пользователя или бросает ошибку.
async function verifyIdToken(token, clientId) {
  const bits = String(token || '').split('.');
  if (bits.length !== 3) throw new Error('Неверный токен');
  const header = part(bits[0]);
  if (header.alg !== 'RS256') throw new Error('Неверный алгоритм подписи');
  const key = await getKey(header.kid);
  const ok = crypto.verify('RSA-SHA256', Buffer.from(bits[0] + '.' + bits[1]), key, Buffer.from(bits[2], 'base64url'));
  if (!ok) throw new Error('Подпись не прошла проверку');
  const p = part(bits[1]);
  const now = Date.now() / 1000;
  if (!ISSUERS.includes(p.iss)) throw new Error('Чужой выпускающий');
  if (p.aud !== clientId) throw new Error('Токен выдан другому приложению');
  if (!p.exp || p.exp < now - 60) throw new Error('Токен просрочен');
  if (!p.sub) throw new Error('Нет идентификатора пользователя');
  return {
    sub: String(p.sub),
    email: p.email || null,
    name: p.name || p.given_name || null,
    givenName: p.given_name || null,
    picture: p.picture || null,
    nonce: p.nonce || null,
  };
}

// Для проверок: подменить загрузку ключей.
function _setKeyFetcher(fn) { fetchKeys = fn; keys = null; keysUntil = 0; }

module.exports = { verifyIdToken, _setKeyFetcher };
