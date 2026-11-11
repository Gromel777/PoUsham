# CLAUDE.md — agent map for «В Точку» (repo PoUsham)

Read this first. It is the fast map of the project so you don't have to scan every file.
**Keep it current:** when you add/move/rename files, add API actions, phases, env vars or change a core rule — update this file in the same commit.

## Working rules (from the owner)
- Owner speaks Russian. Reply, UI texts, README, code comments and commit messages are **in Russian**.
- If a request is unclear or has gaps — ask clarifying questions **before** implementing. Implement only when nothing is open.
- Pushing to `main` deploys to Render automatically (https://pousham.onrender.com). Run `npm test` before every push.
- Manager-facing (non-programmer) architecture doc lives in Claude Docs, not in the repo. Mention to the owner if architecture changed so it can be updated too.

## What it is
Online trick-taking card game for 2–6 players, 36-card deck (6…A), **hearts (♥) always trump** (except "notrump" round), **7♠ is a special card**. Each round: deal → (optional reshuffle window) → bids (how many tricks you'll take) → play tricks → scoring. Empty seats are bots. Web app (PWA), landscape phones, dark/gold "2.5D" style.

## Stack (no build step, no frameworks)
- Node.js ≥18, plain `http` server. Only dependency: `pg`.
- Client: vanilla JS in IIFE modules attached to `window`, loaded by `<script>` tags in order. No bundler, no npm on client.
- Transport: client → `POST /api/action` (JSON); server → client via **SSE** `GET /api/events?room=&token=` (full per-player state snapshot on every change). No WebSockets.
- DB: Postgres (Neon) if `DATABASE_URL` set, otherwise in-memory store (local dev/tests).
- Rooms/games live **only in server memory** — lost on restart/redeploy. Only accounts/ratings/matches persist.

## File map
```
engine/engine.js     Rules + bots. Pure logic, no DOM/network. UMD: require() in Node, window.Engine/Bots in browser. ~420 lines.
server/server.js     Everything server-side except DB: static files, rooms, seats, timers, bots scheduling, pause/vote,
                     social (chat/emotes/likes/mud), WebRTC relay, matchmaking, calibration, rating trigger, HTTP API. ~1050 lines.
server/db.js         Store: memoryStore() and pgStore(); SCHEMA (auto-created on start); players, sessions, matches, leaderboard.
server/rating.js     Pairwise multiplayer Elo: START 1000, K 32, MIN_RATED 2, BOARD_MIN_GAMES 5; left/kicked = last place.
server/google.js     Google ID-token (JWT RS256) verification with built-in crypto, no libs.
client/index.html    Shell + script load order (order matters: viewport, brand, i18n, cards-*, fx, qrcode, voice, music, GSI, room-cozy, client).
client/client.js     Whole UI (~3200 lines, one IIFE). See section index below.
client/style.css     All styles (~1200 lines). Room skin via body class `room-cozy`.
client/fx.js         Canvas particle effects per suit (♠ steel, ♣ emerald, ♦ ice, ♥ flame, 7♠ storm) + synthesized SFX. window.FX / SFX.
client/cards.js      Deck "dark gold" (CardsDark) + facade window.Cards (parse, url, backUrl, theme switch).
client/cards-sil.js  Deck "Силуэты" (default, prefs.cards='sil'). window.CardsSil.
client/cards-light.js Deck "classic light". window.CardsLight.
client/room-cozy.js  Room skin "Пижамная вечеринка": only SVG markup (tableBase, chair, deco). Classic table SVG is inside client.js.
client/i18n.js       ru/en. Key = the Russian string itself. trServer() translates server errors, trLog() translates log lines.
client/viewport.js   Virtual screen height 488 (min width 950) scaled with CSS zoom. window.VIEW.
client/voice.js      Push-to-talk voice, WebRTC P2P (STUN only), signaling via action type 'rtc'.
client/music.js      Background music via Web Audio (menu / ranked lobby / victory), default volume 0.1.
client/brand.js      Logo helpers; real logo image is client/img/logo.webp (animated eye glow in CSS).
client/qrcode.js     Third-party QR generator (MIT). Don't edit.
client/sw.js         Service worker, network-first. CACHE name 'vtochku-vNN'.
client/manifest.webmanifest, client/icons/, client/img/, client/music/*.mp3, client/privacy.html
prototype/po-usham.html  First offline single-file prototype vs bots. Legacy, not served. Don't edit.
test-*.js            Tests (plain node scripts, no framework). `npm test` runs all.
render.yaml          Render web service (free plan, healthCheckPath /health).
README.md            Human README in Russian (structure, run, deploy, env).
```

## Checklists (easy to forget)
- **New client file** → add to `STATIC` map in `server/server.js` (whitelist; unknown paths 404), add `<script>` in `client/index.html`, add to `SHELL` in `client/sw.js` **and bump `CACHE` version**.
- **Any client change that must reach users fast** → bump `CACHE` in `client/sw.js`.
- **New server message/error/log line** (server texts are Russian) → add English translation in `client/i18n.js` (`trServer` / `trLog`).
- **New UI string** → wrap with `T('русская строка')` and add `en` entry in `i18n.js`.
- **Emote pool** is duplicated: `EMOTE_POOL` in `server/server.js` and in `client/client.js` — keep identical.
- **New field the client needs** → add it in `viewFor()` (server.js). Never expose other players' hands or `lawful` flag (see `publicTrick()`).
- **Rule change** → change `engine/engine.js` only, add a check in `test-engine.js`. Bots use the same engine.
- Update `README.md` structure section if files change.

## Engine (engine/engine.js)
- Card: `{ id: 'Т♥', suit: '♥', rank: 0..8 }`; RANKS `6 7 8 9 10 В Д К Т`; SPECIAL_ID `'7♠'`.
- `roundPlan(n, max)`: 1..max, extra rounds at peak, max-1..1. `maxCards(players) = min(9, floor(36/players))`.
- Phases `g.phase`: `pre` (reshuffle window) → `bid` → `play` → `trickDone` → (`play`…) → `roundDone` → … → `gameOver`.
- First leader random in round 1, then rotates clockwise each round. Bidding starts from leader+1. Sum of bids unrestricted.
- Follow suit strictly (`strictLegal`): must play lead suit if you have it (trump NOT allowed then); 7♠ always allowed and doesn't count as spade; no lead suit → any card.
- 7♠ modes (`specialModes`): `normal`; `command` on lead = "Старшие на стол!" (everyone must play their strongest; leader takes trick); `top` when following = absolute top card.
- Scoring `scoreFor(bid, took, cards)`: exact → 20×bid; exact zero → 10 + 2×cards; under → −20 per missing; over → +1 per extra. "dark" round ×2.
- Bluff mode (`g.bluff`): any card may be played; others may `check` a non-first, non-7♠, non-forced card while trick is on table. Caught cheat −50 to cheater, +50 to checker, card returns, `g.fix` forces an honest replacement. Wrong check −20.
- Skills: only `reshuffle` (once per game per player, only in `pre`, max once per round). Off in matchmade/ranked tables.
- Test mode (`test`, custom tables only): 17 rounds, round 10 `notrump`, round 15 `dark` (blind bids, hands hidden).
- `Bots`: `bid`, `play` (sometimes cheats in bluff), `suspicion` (chance to check), `wantsReshuffle`.

## Server (server/server.js) — key concepts
- Room object `r`: `code` (4 chars), `kind`: `private` (code only) | `public` (listed in lobby) | `casual` (matchmade, unrated) | `ranked` (matchmade or `calib`), `seats[]` `{name, token, bot, pid, uid, rating, pic, left, everOnline}`, `hostSeat`, `game` (engine state), `streams` (SSE), timers.
- Ranked & calibration: always `RANKED_RULES = { bluff: true, rounds: 17 }`, sizes ≤4, no skills/test, no restart, no lobby kick.
- `update(r)` is the central tick after any change: rate if gameOver → next-round readiness → pre window → turn timer → `broadcast` → bot moves → bot checks.
- Timers: `TRICK_PAUSE` 2.1s (5s in bluff, time to check), `DEFAULT_TURN_TIME` 30s (timeout → auto bid / random honest card), `PRE_WINDOW` 3s, `NEXT_WAIT` 15s, `BOT_DELAY` 1s.
- Pause: 3 per player per game, unpause countdown 5s, max 5 min. Vote-kick only for an offline player; game halts until all online voters vote; kicked seat → bot, `left=true` (last place in rating).
- Rejoin: same Google account or same name of an offline seat gets the seat back with a new token.
- Matchmaking `MM`: queue by ticket, client polls `/api/mm/status`. Ranked groups by rating window that widens with wait; casual fills with bots after 45s. Matched rooms auto-start (15s or when all connected); no-shows become bots.
- Calibration: first `BOARD_MIN_GAMES`(5) ranked games can be vs bots (bots count as rating 1000, don't change).
- `rateGame()`: only `kind==='ranked'`, needs ≥2 accounts (unless calib) and DB ready → `DB.recordMatch` → `g.rating {status, changes}`.

### HTTP API
GET: `/health`, `/api/events` (SSE; events: default state, `kicked`, `rtc`), `/api/rooms` (open public tables), `/api/config` (googleClientId, ratings).
POST: `/api/auth/google`, `/api/me`, `/api/logout`, `/api/leaderboard`, `/api/create`, `/api/join`, `/api/mm/join|status|cancel`, `/api/calib`, `/api/action`.
`/api/action` types: game — `start, restart, kick, voteKick, vote, pause, unpause, bid, play, nextRound, check, skill`; social — `chat, emote, phrase, like, dislike, mud` (mud only for score leader); `rtc` relay.
Errors: throw via `fail('русский текст')` (GameError → 400 with `{error}`).

## Client (client/client.js) — section index
Search by the `// ----------` headers (line numbers drift):
`настройки и сессия` (state `S`, `prefs` in localStorage `vtochku-prefs`, session `vtochku-session`, rooms classic/cozy) ·
`музыка` · `сеть` (`api()`) · `аккаунт Google и рейтинг` (sign-in, avatar photo, `#00042` player tag = DB id, leaderboard) ·
`connect/leave/act` + animation queue `enqueue/pump/apply` (state snapshots are animated sequentially) ·
`экраны` (`showHome` tabs ranked/casual/lobby/private, `showLobby`, `showGameScreen`) · `поиск игроков` ·
`стол` (`classicTableSvg`, chairs, icons) · `модальные окна, тосты`, `rulesHtml`, `showMenu` ·
`персонализация` (`showCustomize`: Колоды / Комнаты / Эффекты, emote wheel) · `параллакс` · `геометрия` (seat/hand positions) ·
`карты в DOM` (`makeCard`, `fly`) · `игровой экран` (largest block: score, trick, deal, bluff checks, reshuffle, round banner, leader crown, first-move ball, neon, pause, round results) ·
`общение` (chat, emote wheel, likes, mud, voice dock) · `действия по кнопкам` (click handlers by `data-act`) · `PWA` · `init()`.

## Data (Postgres, auto-created in db.js SCHEMA)
`players` (google_sub, nick, picture, rating, games, wins) · `sessions` (token_hash sha256 → player) · `matches` · `match_players` (place, score, left_game, rating before/after).

## Env vars (Render)
`DATABASE_URL` (Neon pooled string), `GOOGLE_CLIENT_ID` (fallback hardcoded, not secret), `PORT`. Check `/health` → `db: "ok"`, `google: true`. Never put secret values in the repo.

## Run & test
`npm start` → http://localhost:3000 (in-memory DB). `npm test` → engine, rating, lobby/matchmaking, test modes, online integration (port 3999), pause.

## Not implemented yet / planned (don't assume they exist)
Tutorial for first-time players, more skins (decks/rooms/effects), native mobile apps, monetization (paid skins, paid leagues). Check git log / ask the owner for current priorities.
