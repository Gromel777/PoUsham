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
                     social (chat/emotes/likes/mud), WebRTC relay, matchmaking, rating trigger, HTTP API. ~1050 lines.
server/db.js         Store: memoryStore() and pgStore(); SCHEMA (auto-created on start); players, sessions, matches, leaderboard.
server/rating.js     Pairwise multiplayer Elo: START 1000, K 32, MIN_RATED 2, BOARD_MIN_GAMES 5; left/kicked = last place.
server/google.js     Google ID-token (JWT RS256) verification with built-in crypto, no libs.
client/index.html    Shell + script load order (order matters: viewport, brand, i18n, cards-* (cards.js first, then light/sil/royal), fx, qrcode, voice, music, GSI, room-cozy, room-office, engine, tutorial, client).
                     Inline `#boot` splash (shown before any JS; removed by `bootDone()` in client.js).
client/tutorial.js   Tutorial: local table in the browser (same engine.js, no server), SCRIPT (rigged deals + bot moves for rounds 1–5),
                     STEPS (coach hints: `when(g)`, `tap` or `expect` + `target`), coach overlay (#coach: dim strips + gold ring, bubble, hard click guard).
                     UMD: require() in Node exports SCRIPT/STEPS for test-tutorial.js; window.Tutorial.create() in browser.
client/client.js     Whole UI (~3200 lines, one IIFE). See section index below.
client/style.css     All styles (~1200 lines). Room skins via body class `room-cozy` / `room-office`.
client/fx.js         Canvas particle effects per suit (♠ steel, ♣ emerald, ♦ ice, ♥ flame, 7♠ storm) + synthesized SFX. window.FX / SFX.
client/cards.js      Deck "dark gold" (CardsDark) + facade window.Cards (parse, url, backUrl, theme switch).
client/cards-sil.js  Deck "Силуэты" (default, prefs.cards='sil'). window.CardsSil.
client/cards-light.js Deck "classic light". window.CardsLight.
client/cards-royal.js Image decks via `ImageDeck(dir)`: "Королевская" (CardsRoyal, img/decks/royal, prefs.cards='royal'), "Звёздная" (CardsStar, img/decks/star, 'star').
                     Files <6..10|J|Q|K|A>_<suit>.webp + back.webp. New image deck = folder + one line here + THEMES/pickDeck (cards.js) + DECKS/deckImpl (client.js).
                     Server auto-serves every .webp in client/img/decks/<deck>/. Rebuild images: scripts/deck-from-sheets.py (owner's sheets → cards).
client/room-cozy.js  Room skin "Пижамная вечеринка": only SVG markup (tableBase, chair, deco). Classic table SVG is inside client.js.
client/room-office.js Room skin "Переговорка" (same interface). New room = new room-*.js + entry in ROOMS/ROOM_SKINS (client.js) + roomPreview + CSS `body.room-<k>`.
                     Preview without settings: `?skin=cozy|office` (`?room=` is the table code for invite links!).
client/i18n.js       ru/en. Key = the Russian string itself. trServer() translates server errors, trLog() translates log lines.
client/viewport.js   Virtual screen height 488 (min width 950) scaled with CSS zoom. window.VIEW.
client/voice.js      Push-to-talk voice, WebRTC P2P (STUN only), signaling via action type 'rtc'.
client/music.js      Background music via Web Audio (menu / ranked lobby / victory), default volume 0.1.
client/brand.js      Logo helpers; real logo image is client/img/logo.webp (animated eye glow in CSS).
client/qrcode.js     Third-party QR generator (MIT). Don't edit.
client/sw.js         Service worker, network-first with 2.5s timeout; falls back to cache if the server is asleep or returns a non-game page
                     (game files carry header `X-VT: 1`). CACHE name 'vtochku-vNN'.
scripts/build-static.js  Builds dist/ (client + engine.js) for Render Static Site; `npm run build:static`.
client/manifest.webmanifest, client/icons/, client/img/, client/music/*.mp3, client/privacy.html
prototype/po-usham.html  First offline single-file prototype vs bots. Legacy, not served. Don't edit.
test-*.js            Tests (plain node scripts, no framework). `npm test` runs all.
render.yaml          Render web service `pousham` (free plan, healthCheckPath /health) + static site (never sleeps), live at https://pousham-1.onrender.com.
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
- Scoring `scoreFor(bid, took, cards)`: exact → 20×bid; exact zero → 5 + 1×cards; under → −20 per missing; over → +1 per extra. Round multiplier `roundMult(g)`: "dark" ×2, «Двойные очки» (first and last round, `g.doubles`, off in tutorial) ×2 → dark+double ×4. `g.double`/`g.mult` per round, history keeps `mult`.
- Bluff mode (`g.bluff`): any card may be played; others may `check` a non-first, non-7♠, non-forced card while trick is on table. Caught cheat −50 to cheater, +50 to checker, card returns, `g.fix` forces an honest replacement. Wrong check −20 to checker and +5 (`HONEST_BONUS`) to the checked player (`lastCheck.reward`).
- Skills: only `reshuffle` (once per game per player, only in `pre`, max once per round). Off in matchmade/ranked tables.
- `newGame` tutorial options: `deals` (fixed hands per round), `firstLeader`, `bluffFrom` (round index from which `g.bluff` turns on).
- Test mode (`test`, custom tables only): 17 rounds, round 10 `notrump`, round 15 `dark` (blind bids, hands hidden).
- `Bots`: `bid`, `play` (sometimes cheats in bluff), `suspicion` (chance to check), `wantsReshuffle`.

## Server (server/server.js) — key concepts
- Room object `r`: `code` (4 chars), `kind`: `private` (code only) | `public` (listed in lobby) | `casual` (matchmade, unrated) | `ranked` (matchmade only; `r.calib` is legacy, always false), `seats[]` `{name, token, bot, pid, uid, rating, pic, left, everOnline}`, `hostSeat`, `game` (engine state), `streams` (SSE), timers.
- Ranked: always `RANKED_RULES = { bluff: true, rounds: 17 }`, **table of 4 only** (`MM.RANKED_SIZE`), no skills/test, no restart, no lobby kick.
- `update(r)` is the central tick after any change: rate if gameOver → next-round readiness → pre window → turn timer → `broadcast` → bot moves → bot checks.
- Timers: `TRICK_PAUSE` 2.1s (5s in bluff, time to check), `DEFAULT_TURN_TIME` 30s (timeout → auto bid / random honest card), `PRE_WINDOW` 5s, `NEXT_WAIT` 15s, `BOT_DELAY` 1s (`BOT_BID_DELAY` 2.3s for bids, so the client's bid announcement fits; same in tutorial.js).
- Dropped player (`AWAY`, exported for tests): after `AWAY.GRACE` 4s a bot plays for them (`autoSeat()`), they have `AWAY.KEEP` 2 min to come back (same name/account), then `replaceWithBot`; vote-kick allowed only after `AWAY.VOTE` 20s. Seats in view carry `away/keepLeft/voteIn`.
- Bot names by region (`regionOf(blang, tz)` from the creator / first in matchmaking): `BOT_NAMES` ru/en/zh/kz/in.
- Pause: 3 per player per game, unpause countdown 5s, max 5 min. Vote-kick only for an offline player; game halts until all online voters vote; kicked seat → bot, `left=true` (last place in rating).
- Rejoin: same Google account or same name of an offline seat gets the seat back with a new token.
- Matchmaking `MM`: queue by ticket, client polls `/api/mm/status`. Ranked: 4 people by rating window that widens with wait; after `MM.RANKED_BOTS_AFTER` (60s) without four — 3 people + 1 bot (`MM.RANKED_MIN`). Casual fills with bots after 45s. Matched rooms auto-start (15s or when all connected); no-shows become bots.
- Calibration = the first `BOARD_MIN_GAMES`(5) ranked games (normal matchmaking, UI shows «Калибровка N/5»); then the player enters the leaderboard. The old «calibration vs bots» mode and `/api/calib` were removed.
- `rateGame()`: only `kind==='ranked'`, needs ≥2 accounts (unless calib) and DB ready → `DB.recordMatch` → `g.rating {status, changes}`.

### HTTP API
GET: `/health`, `/api/events` (SSE; events: default state, `kicked`, `rtc`), `/api/rooms` (open public tables), `/api/config` (googleClientId, ratings), `/api/alive?room&token` (is the last game still running and the seat ours — home «Вернуться в игру»), `/api/world?since=&rid=` (world chat: new msgs, refreshed old invites, `seq`, `online` = readers in last 30s).
POST: `/api/auth/google`, `/api/me`, `/api/logout`, `/api/tutorial` (mark tutorial done for the session's account), `/api/leaderboard`, `/api/create`, `/api/join`, `/api/mm/join|status|cancel`, `/api/action`, `/api/world/send {session,text}` (Google only, gap 2.5s), `/api/world/invite {session,room,token}` (lobby of a non-matchmade table with free seats, once per 30s).
`/api/action` types: game — `start, restart, kick, voteKick, vote, pause, unpause, bid, play, nextRound, check, skill`; social — `chat, emote, phrase, like, dislike, mud` (mud only for score leader, `style` ∈ `MUD_STYLES` mud/tomato/egg/spit); optional `to` on chat = private message (only sender+recipient see it, filtered in `viewFor`; not to bots), on emote/phrase = flies to that avatar (everyone sees); chat/phrases/world chat go through `cleanText()` (basic profanity filter); `rtc` relay.
World chat (`WORLD` in server.js): last 100 messages in memory only (lost on restart), kinds `msg` | `invite`.
Errors: throw via `fail('русский текст')` (GameError → 400 with `{error}`).
CORS `*` on `/health` and `/api/*` (client may be served from the static site); `OPTIONS` → 204.

## Client (client/client.js) — section index
Search by the `// ----------` headers (line numbers drift):
`настройки и сессия` (state `S`, `prefs` in localStorage `vtochku-prefs`, session `vtochku-session`, rooms classic/cozy/office: `ROOMS`, `ROOM_SKINS`, `applyRoom`, `roomSkin()`) ·
`музыка` · `сеть` (`API` base: same origin on pousham.onrender.com/localhost, else `https://pousham.onrender.com`; override `?api=`; `Server.wake()` polls /health, `Server.ready` promise — `api()` and `Auth.init` wait for it) · `аккаунт Google и рейтинг` (sign-in, avatar photo, `#00042` player tag = DB id, leaderboard) ·
`connect/leave/act` + animation queue `enqueue/pump/apply` (state snapshots are animated sequentially) ·
`экраны` (`showHome` — layout from owner's sketch: left logo + «Spot On» (always English) + card fan; right column: player plate `#h-player` (→ `showProfile`: guest name / Google), sections `.h-sec` ranked/casual/create/settings opened by `openSec()` (FLIP animation, one at a time, click on empty space closes), bottom row Настройки/Правила/Полный экран; `renderGo()` = big button or in-panel search status; `showRoomsList` modal; `myName()/needName()`; `showLobby`, `showGameScreen`) · `поиск игроков` ·
`стол` (`classicTableSvg`, chairs, icons) · `модальные окна, тосты` (big center captions `banner(text, cls, quick, sub, {hold, now})` go through queue `BQ`: no interruption, rushed to 1s when queued, `now` = ТВОЙ ХОД/ЗАМЕНИ КАРТУ clears queue), `rulesHtml`, `showMenu` ·
`персонализация` (`showCustomize`: Колоды / Комнаты / Эффекты, emote wheel) · `параллакс` · `геометрия` (seat/hand positions) ·
`карты в DOM` (`makeCard`, `fly`) · `игровой экран` (largest block: score, trick, deal, bluff checks, reshuffle, round banner (+«Двойные очки»), leader crown, first-move ball = leader of the current trick, lead card (`slotXY(..., lead)`: pushed out from center ×1.32, `LEAD_SCALE` 1.16, thick white glow) + `#lead-suit` plate pinned above it (`markLead`/`placeLeadBox`), bid announcement `announceBid`, card pre-select `queued`/`playQueued` (double tap while others play), away countdown `tickAway`, neon, pause, round results) ·
`общение` (chat + private `Social.setDm`, emote wheel, avatar menu groups Реакции/Лично ему/Заглушить, `emoteTo`, leader throws `mud(from,to,style)` + `impact` with `throwSvg`/`splatSvg`, `prefs.mudStyle` chosen in Персонализация → Эффекты, voice dock) · `мировой чат` (`World`: home left button + translucent panel, polls /api/world 4s open / 15s closed; lobby button «Пригласить в мировой чат») · `экран загрузки` (`showWaking` while server wakes; after `NETCHECK_AFTER` 60s shows «Проблемы с подключением?») · `диагностика подключения` (`NetCheck`: modal with checks online / own site / gstatic no-cors / server no-cors / server /health cors, plain-language verdict + collapsible details + «Скопировать отчёт»; `Server.t0/tries/last` record the wake loop) ·
`обучение` (`maybeWelcome`/`showWelcome` — welcome overlay #welcome; `startTutorial` sets `S.local` = local table: `act()` routes to it, `social()` is off;
`finishTutorial`, `markTutorialDone` → `/api/tutorial` or `S.tutPending` until sign-in; flag cached in `vtochku-auth.tutorial`) · `действия по кнопкам` (click handlers by `data-act`) · `PWA` · `init()`.

## Performance rules (phones!)
- **Graphics setting** `prefs.gfx` = `high` | `low` (Настройки → «Графика», also in-game menu; unset → `low` on phones, `high` on desktop). `applyGfx()` toggles `body.gfx-low` + FX quality/DPR cap. Low = no backdrop-filter (solid backgrounds), no gyro parallax, table/decoration infinite animations off (CSS block at the end of style.css).
- **Table = stack of SVG layers** (`renderTable()` in client.js splits `tableSvg()` output): static parts with heavy filters → `svg.tbl-static` (`tbl-heavy` = will-change), animated parts listed in `TABLE_LIVE` → `svg.tbl-live` / `svg.tbl-glow`. A new animated element on the table must get a class from `TABLE_LIVE`, otherwise it forces a full re-raster of the static table every frame. Table drop shadow is baked into the first layer (`#tblDrop`, color from CSS var `--tbl-shadow`), never a CSS `filter` on a layer.
- **Parallax** `--px/--py` are `@property inherits:false` and are written only into the moving layers (`Parallax.TARGETS`), never into `:root` (that recalculated the whole page's styles on every gyro event — FPS ~6 on phones).
- Don't animate `box-shadow`/`filter`/`left` in infinite animations — use opacity of a pseudo-element with a fixed shadow (`glowPulse`/`glowAlt`) or transform.
- Perf check: Playwright + /usr/bin/google-chrome, mobile emulation (DPR 3, CPU ×4 throttle), FPS via rAF, gyro simulated by dispatching `deviceorientation` each frame.

## Data (Postgres, auto-created in db.js SCHEMA)
`players` (google_sub, nick, picture, rating, games, wins, tutorial — `pub()` reports tutorial=true also for anyone with games>0) · `sessions` (token_hash sha256 → player) · `matches` · `match_players` (place, score, left_game, rating before/after).

## Env vars (Render)
`DATABASE_URL` (Neon pooled string), `GOOGLE_CLIENT_ID` (fallback hardcoded, not secret), `PORT`. Check `/health` → `db: "ok"`, `google: true`. Never put secret values in the repo.

## Run & test
`npm start` → http://localhost:3000 (in-memory DB). `npm test` → engine, rating, lobby/matchmaking, test modes, online integration (port 3999), pause, dropped player (test-away.js, port 3997), social/private chat/profanity/world chat (test-chat.js, port 3994), tutorial script (test-tutorial.js).
Tutorial in a real browser: Playwright + /usr/bin/google-chrome works in the sandbox (Google sign-in/fonts are blocked there).

## Not implemented yet / planned (don't assume they exist)
More skins (decks/rooms/effects), native mobile apps, monetization (paid skins, paid leagues). Check git log / ask the owner for current priorities.
