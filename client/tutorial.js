// Обучение «В Точку»: тестовая партия с 4 ботами прямо в браузере (без сервера — работает, пока сервер просыпается).
// 7 раундов 1-2-3-4-3-2-1. Раунды 1–5 разыграны по сценарию (подтасованные карты, ходы ботов заданы),
// ученик может нажать только то, что подсвечено. Раунды 6–7 — сам, в режиме обмана, как в рейтинге.
// Сценарий (SCRIPT) — просто данные: его же проверяет test-tutorial.js.
'use strict';
(function (root) {
  const E = (typeof module === 'object' && module.exports) ? require('../engine/engine.js').Engine : root.Engine;
  const BOTS_API = (typeof module === 'object' && module.exports) ? require('../engine/engine.js').Bots : root.Bots;

  // Места: 0 — ученик, 1–4 — боты по часовой стрелке. Первый ход в 1-м раунде — у ученика,
  // дальше право хода переходит по кругу: во 2–5-м раундах первыми ходят боты 1, 2, 3, 4.
  const SCRIPT = {
    players: 5, rounds: 7, firstLeader: 0, bluffFrom: 4, scripted: 5,
    deals: [
      // 1: старшая карта
      [['Т♣'], ['9♠'], ['К♣'], ['8♦'], ['10♣']],
      // 2: козырь
      [['6♥', 'Т♦'], ['К♠', '8♣'], ['9♠', '7♥'], ['10♠', '9♦'], ['В♠', '6♣']],
      // 3: 7♠ — «Старшие на стол!»
      [['Т♣', '7♠', '6♦'], ['8♣', 'Д♥', 'Т♦'], ['9♣', 'Т♥', '8♠'], ['7♣', 'К♥', 'Д♦'], ['10♣', '9♥', '6♠']],
      // 4: очки — точный ноль, перебор, недобор
      [['6♠', '7♣', '6♦', '8♦'], ['9♠', 'К♣', '10♦', '7♥'], ['Д♠', '9♣', '7♦', '8♥'], ['Т♠', 'Т♣', 'Т♦', '6♥'], ['К♠', '8♣', '9♦', '10♥']],
      // 5: режим обмана — соврать и поймать
      [['К♠', '6♣', '7♦'], ['10♠', 'Т♦', 'Т♥'], ['8♠', '9♥', '8♦'], ['6♠', '9♦', 'Д♣'], ['9♠', 'В♣', '10♣']],
    ],
    // Заявки и ходы ботов по раундам: plays[место] — карты по порядку (с режимом для 7♠ — 'id:mode').
    bots: [
      { bids: { 1: 0, 2: 0, 3: 0, 4: 0 }, plays: { 1: ['9♠'], 2: ['К♣'], 3: ['8♦'], 4: ['10♣'] } },
      { bids: { 1: 1, 2: 1, 3: 0, 4: 0 }, plays: { 1: ['К♠', '8♣'], 2: ['9♠', '7♥'], 3: ['10♠', '9♦'], 4: ['В♠', '6♣'] } },
      { bids: { 1: 1, 2: 1, 3: 1, 4: 0 }, plays: { 1: ['8♣', 'Д♥', 'Т♦'], 2: ['9♣', 'Т♥', '8♠'], 3: ['7♣', 'К♥', 'Д♦'], 4: ['10♣', '9♥', '6♠'] } },
      { bids: { 1: 0, 2: 0, 3: 2, 4: 2 }, plays: { 1: ['9♠', 'К♣', '10♦', '7♥'], 2: ['Д♠', '9♣', '7♦', '8♥'], 3: ['Т♠', 'Т♣', 'Т♦', '6♥'], 4: ['К♠', '8♣', '9♦', '10♥'] } },
      // Бот 2 врёт (9♥ на бубну при 8♦ на руке), его ловят — он кладёт 8♦, а 9♥ возвращается и уходит в 3-й взятке.
      { bids: { 1: 3, 2: 0, 3: 0, 4: 0 }, plays: { 1: ['10♠', 'Т♦', 'Т♥'], 2: ['8♠', '9♥', '8♦', '9♥'], 3: ['6♠', '9♦', 'Д♣'], 4: ['9♠', 'В♣', '10♣'] } },
    ],
  };

  // ---------- шаги подсказок ----------
  const tricksDone = g => g.took.reduce((a, b) => a + b, 0);
  const R = (g, i) => g.roundIdx === i;
  const bidStart = (g, i) => R(g, i) && g.phase === 'bid' && g.bids.every(b => b === null);
  const myBid = (g, i) => R(g, i) && g.phase === 'bid' && g.turn === 0;
  const myPlay = (g, i, trick) => R(g, i) && g.phase === 'play' && g.turn === 0 && !g.fix && tricksDone(g) === trick - 1;
  const trickDone = (g, i, trick) => R(g, i) && g.phase === 'trickDone' && tricksDone(g) === trick;
  const roundDone = (g, i) => R(g, i) && g.phase === 'roundDone';
  const bid = (value) => ({ expect: { type: 'bid', value }, target: { chip: value } });
  const play = (cardId, mode = 'normal') => ({ expect: { type: 'play', cardId, mode }, target: { card: cardId, mode } });
  const next = () => ({ expect: { type: 'nextRound' }, target: { next: true } });

  const STEPS = [
    // ===== Раунд 1: старшая карта =====
    { when: g => bidStart(g, 0), tap: true, ru: 'Добро пожаловать за стол! В каждом раунде все сначала <b>заявляют</b>, сколько взяток возьмут, а потом разыгрывают карты. Попал в заявку — получаешь очки.',
      en: 'Welcome to the table! Each round everyone first <b>bids</b> how many tricks they will take, then the cards are played. Hit your bid — score points.' },
    { when: g => myBid(g, 0), ...bid(1), ru: 'У тебя <b>Туз треф</b> — старшая карта. Козырей (червей ♥)сейчас ни у кого нет, значит, взятка твоя. Заяви <b>1</b>.',
      en: 'You hold the <b>ace of clubs</b> — the highest club. Nobody has trumps (hearts ♥), so the trick is yours. Bid <b>1</b>.' },
    { when: g => myPlay(g, 0, 1), ...play('Т♣'), ru: 'Ты ходишь первым. Нажми на карту — она выделится, — и нажми ещё раз, чтобы разыграть.',
      en: 'You lead. Tap the card to select it, then tap again to play it.' },
    { when: g => trickDone(g, 0, 1), tap: true, ru: 'Взятку забирает <b>старшая карта в масти первого хода</b>. Карты других мастей не бьют — кроме козыря.',
      en: 'The trick goes to the <b>highest card of the led suit</b>. Other suits can’t beat it — except trumps.' },
    { when: g => roundDone(g, 0), ...next(), ru: 'Заявил 1 — взял 1: <b>в точку, +20</b>. Боты заявили 0 и ничего не взяли — это тоже точно: 10 + 2 за карту.',
      en: 'Bid 1, took 1: <b>spot on, +20</b>. The bots bid 0 and took nothing — also exact: 10 + 2 per card.' },

    // ===== Раунд 2: козырь =====
    { when: g => bidStart(g, 1), tap: true, ru: '<b>Червы ♥ — козырь.</b> Любой козырь бьёт любую карту другой масти, даже туза.',
      en: '<b>Hearts ♥ are trumps.</b> Any trump beats any card of another suit — even an ace.' },
    { when: g => myBid(g, 1), ...bid(1), ru: 'У тебя <b>шестёрка червей</b> — это козырь, она может забрать взятку. Заяви <b>1</b>.',
      en: 'You have the <b>six of hearts</b> — a trump that can take a trick. Bid <b>1</b>.' },
    { when: g => myPlay(g, 1, 1), ...play('6♥'), ru: 'Ход пикой, а <b>пик у тебя нет</b> — значит, можно бить козырем. Положи 6♥.',
      en: 'Spades were led and <b>you have no spades</b> — so you may trump. Play the 6♥.' },
    { when: g => trickDone(g, 1, 1), tap: true, ru: 'Шестёрка-козырь побила короля пик! Важно: если масть хода у тебя <b>есть</b>, класть нужно её — козырем бить тогда нельзя.',
      en: 'A trump six beat the king of spades! Remember: if you <b>have</b> the led suit, you must follow it — no trumping then.' },
    { when: g => myPlay(g, 1, 2), ...play('Т♦'), ru: 'Взявший взятку ходит следующим. Положи <b>туза бубен</b>.',
      en: 'Whoever takes the trick leads next. Play the <b>ace of diamonds</b>.' },
    { when: g => trickDone(g, 1, 2), tap: true, ru: 'У {2} бубен не было — и козырь побил туза. <b>Даже туз не гарантирует взятку.</b>',
      en: '{2} had no diamonds — and a trump beat your ace. <b>Even an ace is no guarantee.</b>' },
    { when: g => roundDone(g, 1), ...next(), ru: 'Снова в точку, +20. А у {1} заявка 1, взятка 0 — <b>недобор: −20</b>.',
      en: 'Spot on again, +20. {1} bid 1 but took 0 — <b>short: −20</b>.' },

    // ===== Раунд 3: 7♠ =====
    { when: g => bidStart(g, 2), tap: true, ru: '<b>7♠ — особая карта, джокер.</b> Её можно положить всегда, и она не считается пикой.',
      en: '<b>7♠ is a special card — the joker.</b> It can always be played and doesn’t count as a spade.' },
    { when: g => myBid(g, 2), ...bid(2), ru: 'Туз треф и 7♠ принесут две взятки. Заяви <b>2</b>.',
      en: 'The ace of clubs and the 7♠ will bring two tricks. Bid <b>2</b>.' },
    { when: g => myPlay(g, 2, 1), ...play('Т♣'), ru: 'Ход в трефы, и трефы у тебя есть — кладёшь трефу. <b>Туз треф</b> старше всех.',
      en: 'Clubs were led and you have clubs — so you follow. The <b>ace of clubs</b> beats them all.' },
    { when: g => myPlay(g, 2, 2), ...play('7♠', 'command'), ru: 'Твой ход. Положи <b>7♠</b> и выбери <b>«Старшие на стол!»</b>: каждый обязан положить свою самую сильную карту, а взятка — твоя.',
      en: 'Your lead. Play the <b>7♠</b> and choose <b>“Highest on the table!”</b>: everyone must play their strongest card, and the trick is yours.' },
    { when: g => trickDone(g, 2, 2), tap: true, ru: 'Боты отдали все козыри — даже туза червей! А в ответ на чужой ход 7♠ можно сыграть <b>«как самую старшую»</b> — она бьёт всё.',
      en: 'The bots had to give up all their trumps — even the ace of hearts! When following, the 7♠ can be played <b>“as the top card”</b> — it beats everything.' },
    { when: g => myPlay(g, 2, 3), ...play('6♦'), ru: 'Последняя карта слабая — её заберут. Ты заявил 2 и уже взял 2.',
      en: 'Your last card is weak — it will lose. You bid 2 and already have 2.' },
    { when: g => roundDone(g, 2), ...next(), ru: '<b>+40 — в точку.</b> В точной заявке каждая взятка стоит 20.',
      en: '<b>+40 — spot on.</b> With an exact bid, every trick is worth 20.' },

    // ===== Раунд 4: очки =====
    { when: g => bidStart(g, 3), tap: true, ru: 'Этот раунд — про очки:<br>• попал в заявку — <b>20 за каждую взятку</b>;<br>• заявил 0 и не взял — <b>10 + 2 за каждую карту</b>;<br>• недобор — <b>−20</b> за каждую недостающую;<br>• перебор — всего <b>+1</b> за лишнюю.',
      en: 'This round is about scoring:<br>• exact bid — <b>20 per trick</b>;<br>• bid 0 and took 0 — <b>10 + 2 per card</b>;<br>• short — <b>−20</b> per missing trick;<br>• over — only <b>+1</b> per extra trick.' },
    { when: g => myBid(g, 3), ...bid(0), ru: 'Карты слабые: ни козырей, ни старших. Заяви <b>0</b> — точный ноль сейчас даст 10 + 2×4 = <b>18</b>.',
      en: 'Weak cards: no trumps, no high cards. Bid <b>0</b> — an exact zero now gives 10 + 2×4 = <b>18</b>.' },
    { when: g => myPlay(g, 3, 1), ...play('6♠'), ru: 'Ход в пики — пика у тебя одна, кладёшь её.', en: 'Spades led — you have one spade, so you play it.' },
    { when: g => myPlay(g, 3, 2), ...play('7♣'), ru: 'Трефы — кладёшь 7♣.', en: 'Clubs — play the 7♣.' },
    { when: g => myPlay(g, 3, 3), ...play('6♦'), ru: 'Бубны: обе твои младше туза. Положи 6♦.', en: 'Diamonds: both of yours are below the ace. Play the 6♦.' },
    { when: g => myPlay(g, 3, 4), ...play('8♦'), ru: 'Червей нет — кладёшь последнюю карту.', en: 'No hearts — play your last card.' },
    { when: g => roundDone(g, 3), ...next(), ru: 'Ты: 0 из 0 → <b>+18</b>. {3}: заявка 2, взятки 3 → только <b>+1</b>. {4}: заявка 2, взятка 1 → <b>−20</b>. Точность важнее количества!',
      en: 'You: 0 of 0 → <b>+18</b>. {3}: bid 2, took 3 → only <b>+1</b>. {4}: bid 2, took 1 → <b>−20</b>. Accuracy beats quantity!' },

    // ===== Раунд 5: режим обмана =====
    { when: g => bidStart(g, 4), tap: true, ru: 'Теперь — <b>режим обмана</b>, как в рейтинговых играх. Можно положить любую карту, даже против правил. Но пока взятка на столе, любой может её проверить: поймали — обманщик отдаёт <b>50 очков</b>.',
      en: 'Now — <b>bluff mode</b>, as in ranked games. You may play any card, even against the rules. But while the trick is on the table anyone can check it: a caught cheater gives away <b>50 points</b>.' },
    { when: g => myBid(g, 4), ...bid(0), ru: 'Карты опять слабые. Заявляешь первым — заяви <b>0</b>.', en: 'Weak cards again. You bid first — bid <b>0</b>.' },
    { when: g => myPlay(g, 4, 1), ...play('6♣'), ru: 'По правилам нужно положить К♠ — он заберёт взятку и сорвёт ноль. <b>Соври: положи 6♣.</b> Риск — −50, если проверят.',
      en: 'By the rules you must play the K♠ — it would take the trick and break your zero. <b>Bluff: play the 6♣.</b> Risk: −50 if checked.' },
    { when: g => trickDone(g, 4, 1), tap: true, ru: 'Никто не проверил — обман прошёл! Проверять нельзя первую карту взятки, 7♠ и ход последней картой.',
      en: 'Nobody checked — the bluff worked! You can’t check the first card of a trick, the 7♠, or a move with one card left.' },
    { when: g => R(g, 4) && !g.fix && !!g.trick && g.trick.plays.some(pl => pl.p === 2 && pl.card.id === '9♥' && !pl.checked), expect: { type: 'check', cardId: '9♥' }, target: { check: '9♥' },
      ru: '{2} побил бубну козырем. Подозрительно — может, бубны у него есть? Нажми <b>«?»</b> на его карте и подтверди проверку.',
      en: '{2} trumped the diamond lead. Suspicious — maybe they do have diamonds? Tap <b>“?”</b> on that card and confirm.' },
    { when: g => R(g, 4) && !!g.lastCheck && g.lastCheck.caught, tap: true, ru: '<b>Поймал!</b> Тебе +50, обманщику −50, и он обязан положить честную карту. Ошибся бы — потерял бы 20.',
      en: '<b>Caught!</b> +50 for you, −50 for the cheater, who must now play an honest card. A wrong check would cost you 20.' },
    { when: g => myPlay(g, 4, 2), ...play('7♦'), ru: 'Бубна у тебя есть — кладёшь 7♦.', en: 'You have a diamond — play the 7♦.' },
    { when: g => myPlay(g, 4, 3), ...play('К♠'), ru: 'Ход козырем, червей у тебя нет — сбрасываешь К♠.', en: 'Trump led and you have no hearts — discard the K♠.' },
    { when: g => roundDone(g, 4), ...next(), last: true, ru: 'Ноль удержан, и +50 за поимку! <b>Дальше — сам:</b> два последних раунда без подсказок. Правила — в меню ☰. Удачи!',
      en: 'Zero held, plus 50 for the catch! <b>Now on your own:</b> two last rounds without hints. Rules are in the ☰ menu. Good luck!' },
  ];

  // Ход бота: по сценарию, если в этом раунде он задан и карта подходит; иначе — обычный бот.
  function botMove(g, p, queues) {
    const q = queues && queues[p];
    while (q && q.length) {
      const [id, mode = 'normal'] = q[0].split(':');
      if (E.legalPlays(g, p).some(c => c.id === id)) { q.shift(); return { cardId: id, mode }; }
      q.shift();
    }
    return BOTS_API.play(g, p);
  }
  function botBid(g, p) {
    const s = SCRIPT.bots[g.roundIdx];
    return s && s.bids[p] !== undefined ? s.bids[p] : BOTS_API.bid(g, p);
  }
  const queuesFor = idx => {
    const s = SCRIPT.bots[idx];
    if (!s) return null;
    const q = {};
    for (const k of Object.keys(s.plays)) q[k] = s.plays[k].slice();
    return q;
  };
  function newTutorialGame(names) {
    return E.newGame({ players: SCRIPT.players, rounds: SCRIPT.rounds, names, deals: SCRIPT.deals, firstLeader: SCRIPT.firstLeader, bluffFrom: SCRIPT.bluffFrom });
  }
  const matches = (exp, body) => exp && body.type === exp.type &&
    (exp.value === undefined || Number(body.value) === exp.value) &&
    (exp.cardId === undefined || body.cardId === exp.cardId) &&
    (exp.mode === undefined || (body.mode || 'normal') === exp.mode);

  const api = { SCRIPT, STEPS, botMove, botBid, queuesFor, newTutorialGame, matches };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  // ===================== браузер =====================
  const BOT_NAMES = { ru: ['Бот Аня', 'Бот Борис', 'Бот Вика', 'Бот Гоша'], en: ['Bot Anna', 'Bot Boris', 'Bot Vika', 'Bot Gosha'] };
  const BOT_DELAY = 1150, TRICK_PAUSE = 2100, TRICK_PAUSE_BLUFF = 3800;
  const clone = o => JSON.parse(JSON.stringify(o));
  const pubTrick = t => (t ? { ...t, plays: t.plays.map(pl => ({ p: pl.p, card: pl.card, mode: pl.mode, absolute: pl.absolute, checked: pl.checked, forced: pl.forced })) } : null);

  // Локальный «стол»: те же правила (engine.js), что на сервере, и такое же состояние для клиента.
  function create({ name, pic, lang, onView, isIdle, toastFn }) {
    const L = lang === 'en' ? 'en' : 'ru';
    const names = [name, ...BOT_NAMES[L]];
    const g = newTutorialGame(names);
    const seats = names.map((n, i) => ({ name: n, bot: i > 0, online: true, host: i === 0, pid: 'tut' + i, rating: null, pic: i === 0 ? pic || null : null }));
    let queues = queuesFor(0), queuesRound = 0, timer = null, stepIdx = 0, dead = false;
    const seen = new Set(), checkTimers = [];
    const scripted = () => g.roundIdx < SCRIPT.scripted;
    const activeStep = () => { const s = STEPS[stepIdx]; return s && scripted() && s.when(g) ? s : null; };

    function view() {
      const myTurn = g.turn === 0 && (g.phase === 'bid' || g.phase === 'play');
      return clone({
        code: '', you: 0, youPid: 'tut0', isHost: true, size: g.n, rounds: g.plan.length, turnTime: 0, bluff: g.bluff, skillsOn: false, test: false,
        kind: 'tutorial', calib: false, autoStartIn: 0, chat: [], social: [], likeReadyIn: 0, dislikeReadyIn: 0, mudReadyIn: 0, canMud: false, emotes: [], phrases: [],
        stage: 'game', names: g.names, seats, n: g.n, plan: g.plan, modes: g.modes, mode: g.mode, trump: g.trump, roundIdx: g.roundIdx, phase: g.phase,
        turn: g.turn, leader: g.leader, bids: g.bids, took: g.took, scores: g.scores, handCounts: g.hands.map(h => h.length),
        hand: g.hands[0], handHidden: false, pre: null, trick: pubTrick(g.trick), lastTrick: pubTrick(g.lastTrick), trickWinner: g.trickWinner,
        history: g.history, log: g.log.slice(-100),
        legal: myTurn && g.phase === 'play' ? E.legalPlays(g, 0).map(c => c.id) : [],
        honest: myTurn && g.phase === 'play' ? E.strictLegal(g, 0).map(c => c.id) : [],
        fix: g.fix ? { p: g.fix.p } : null, lastCheck: g.lastCheck, timer: null,
        specialModes: myTurn ? E.specialModes(g, 0) : [], skills: null, skillsUsed: g.skills.map(() => false), reshuffle: null,
        paused: false, pause: null, pausesLeft: 0, rating: null, vote: null,
      });
    }
    function push() { if (dead) return; const v = view(); v._at = Date.now(); onView(v); schedule(); botChecks(); }
    function schedule() {
      clearTimeout(timer);
      if (dead) return;
      if (queuesRound !== g.roundIdx) { queues = queuesFor(g.roundIdx); queuesRound = g.roundIdx; }
      if (activeStep()) return; // ждём ученика: подсказка на экране
      if (g.phase === 'trickDone') timer = setTimeout(() => { E.nextTrick(g); push(); }, g.bluff ? TRICK_PAUSE_BLUFF : TRICK_PAUSE);
      else if ((g.phase === 'bid' || g.phase === 'play') && g.turn !== 0) {
        timer = setTimeout(() => {
          const p = g.turn;
          try {
            if (g.phase === 'bid') E.placeBid(g, p, botBid(g, p));
            else { const m = botMove(g, p, queues); E.playCard(g, p, m.cardId, m.mode); }
          } catch (e) { console.error('tutorial bot', e); }
          push();
        }, BOT_DELAY);
      }
    }
    // Свободные раунды: боты иногда проверяют подозрительные карты (как на сервере).
    function botChecks() {
      if (scripted() || !g.bluff || g.fix || !g.trick || (g.phase !== 'play' && g.phase !== 'trickDone')) return;
      for (const pl of g.trick.plays) {
        const key = g.roundIdx + ':' + pl.card.id;
        if (seen.has(key)) continue;
        seen.add(key);
        for (let b = 1; b < g.n; b++) {
          if (b === pl.p || Math.random() >= BOTS_API.suspicion(g, b, pl) * 1.5) continue;
          checkTimers.push(setTimeout(() => {
            if (dead || E.canCheck(g, b, pl.card.id)) return;
            try { E.check(g, b, pl.card.id); push(); } catch {}
          }, 900 + Math.random() * 1400));
          break;
        }
      }
    }
    // Действие ученика. В сценарных раундах — только то, что подсвечено.
    function action(body) {
      if (dead) return;
      const t = body.type;
      if (['pause', 'unpause', 'voteKick', 'vote', 'kick', 'start', 'skill', 'restart'].includes(t)) throw new Error(L === 'en' ? 'Not available in the tutorial' : 'В обучении это недоступно');
      const st = activeStep();
      if (scripted()) {
        if (!st || !st.expect || !matches(st.expect, body)) throw new Error(L === 'en' ? 'Follow the hint' : 'Следуй подсказке');
      }
      if (t === 'bid') E.placeBid(g, 0, Number(body.value));
      else if (t === 'play') E.playCard(g, 0, String(body.cardId), body.mode || 'normal');
      else if (t === 'check') E.check(g, 0, String(body.cardId));
      else if (t === 'nextRound') E.nextRound(g);
      else throw new Error('?');
      if (st && st.expect) stepIdx++;
      push();
    }

    // ---------- подсказки: подсветка, затемнение, текст ----------
    const app = document.getElementById('app');
    const layer = document.createElement('div');
    layer.id = 'coach';
    layer.innerHTML = `<div class="coach-dim"></div><div class="coach-dim"></div><div class="coach-dim"></div><div class="coach-dim"></div><div class="coach-hole"></div><div class="coach-bubble glass"><div class="coach-who"><span class="coach-ava"></span></div><div class="coach-text"></div><button class="btn-gold coach-next" data-coach="next">${L === 'en' ? 'Next' : 'Дальше'}</button></div>
      <button class="btn-ghost coach-skip" data-coach="skip">${L === 'en' ? 'Skip tutorial' : 'Пропустить обучение'}</button>`;
    app.appendChild(layer);
    document.body.classList.add('tutorial');
    const dims = [...layer.querySelectorAll('.coach-dim')];
    const hole = layer.querySelector('.coach-hole'), bubble = layer.querySelector('.coach-bubble'), textEl = layer.querySelector('.coach-text');
    let shown = null, targetEl = null, onSkip = null;
    const fill = s => s.replace(/\{(\d)\}/g, (m, i) => g.names[+i] || m);

    function findTarget(st) {
      const tg = st.target;
      if (!tg) return null;
      const q = s => document.querySelector(s);
      if (tg.chip !== undefined) return q(`#action [data-act="bid"][data-b="${tg.chip}"]`);
      if (tg.next) return q('#overlay [data-act="nextRound"]');
      if (tg.check) return q(`.check-btn[data-card="${CSS.escape(tg.check)}"]`);
      if (tg.card) {
        if (tg.mode && tg.mode !== 'normal') { const b = q(`#action [data-act="special"][data-mode="${tg.mode}"]`); if (b) return b; }
        return q(`.inhand[data-id="${CSS.escape(tg.card)}"]`);
      }
      return null;
    }
    function place(r) {
      const W = VIEW.w, H = VIEW.h, m = 10;
      // Цель внутри окна (итоги раунда) — пузырь сбоку от окна, чтобы не закрывать таблицу.
      const modal = targetEl && targetEl.closest('.modal');
      if (modal) {
        const mr = VIEW.rect(modal), tr = VIEW.rect(targetEl);
        const right = W - (mr.left + mr.width) - m - 12, left = mr.left - m - 12;
        const side = right >= left ? 'r' : 'l', room = Math.max(right, left);
        if (room >= 210) {
          bubble.style.width = Math.min(360, room) + 'px';
          const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
          const y = Math.max(m + 30, Math.min(H - bh - m, tr.top + tr.height / 2 - bh / 2));
          return [side === 'r' ? mr.left + mr.width + 12 : mr.left - 12 - bw, y];
        }
      }
      bubble.style.width = '';
      // Пузырь — рядом с подсвеченным, не закрывая его: сверху, снизу, слева или справа.
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      const clampX = x => Math.max(m, Math.min(W - bw - m, x)), clampY = y => Math.max(m + 30, Math.min(H - bh - m, y));
      if (!r) return [clampX((W - bw) / 2), clampY((H - bh) / 2 - 30)];
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const opts = [
        [clampX(cx - bw / 2), r.top - bh - 18],
        [clampX(cx - bw / 2), r.top + r.height + 18],
        [r.left - bw - 22, clampY(cy - bh / 2)],
        [r.left + r.width + 22, clampY(cy - bh / 2)],
      ];
      const fits = ([x, y]) => x >= m && y >= m + 28 && x + bw <= W - m && y + bh <= H - m &&
        !(x < r.left + r.width && x + bw > r.left && y < r.top + r.height && y + bh > r.top);
      return opts.find(fits) || [clampX(cx - bw / 2), clampY(r.top > H / 2 ? m + 30 : H - bh - m)];
    }
    function tick() {
      if (dead) return;
      const st = activeStep();
      const ready = st && isIdle();
      layer.classList.toggle('on', !!ready);
      if (!ready) { if (targetEl) targetEl.classList.remove('coach-target'); targetEl = null; return; }
      if (shown !== st) {
        shown = st;
        textEl.innerHTML = fill(L === 'en' ? st.en : st.ru);
        layer.querySelector('.coach-next').style.display = st.tap ? '' : 'none';
        bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
      }
      const t = findTarget(st);
      if (t !== targetEl) { if (targetEl) targetEl.classList.remove('coach-target'); if (t) t.classList.add('coach-target'); }
      targetEl = t;
      // Итоги раунда: светлым остаётся всё окно (таблица нужна для объяснения), нажать можно только кнопку.
      const spot = targetEl && st.target.next ? targetEl.closest('.modal') || targetEl : targetEl;
      const r = spot ? VIEW.rect(spot) : null;
      layer.classList.toggle('free', !r);
      // Затемнение — четыре полосы вокруг подсвеченного элемента; без цели — весь экран.
      const pad = 6, W = VIEW.w, H = VIEW.h;
      const hl = r ? r.left - pad : W / 2, ht = r ? r.top - pad : H / 2, hw = r ? r.width + pad * 2 : 0, hh = r ? r.height + pad * 2 : 0;
      const box = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
      box(dims[0], 0, 0, W, ht); box(dims[1], 0, ht + hh, W, H - ht - hh); box(dims[2], 0, ht, hl, hh); box(dims[3], hl + hw, ht, W - hl - hw, hh);
      box(hole, hl, ht, hw, hh);
      const [x, y] = place(r);
      bubble.style.left = x + 'px'; bubble.style.top = y + 'px';
    }
    const iv = setInterval(tick, 120);
    // Жёсткий режим: пока подсказка на экране, нажимается только подсвеченное (и кнопки подсказки).
    function guard(e) {
      if (dead) return;
      if (e.target.closest && e.target.closest('[data-coach]')) return;
      if (!scripted()) return;
      const st = activeStep();
      const ok = st && st.expect && targetEl && layer.classList.contains('on') && targetEl.contains(e.target);
      if (ok) return;
      // Окно «Как сыграть 7♠?» — внутри выбора разрешаем только подсвеченную кнопку.
      e.stopPropagation(); e.preventDefault();
      if (e.type === 'pointerdown') { bubble.classList.remove('nudge'); void bubble.offsetWidth; bubble.classList.add('nudge'); }
    }
    ['pointerdown', 'click', 'touchstart'].forEach(t => document.addEventListener(t, guard, { capture: true, passive: false }));
    layer.addEventListener('click', e => {
      const b = e.target.closest('[data-coach]');
      if (!b) return;
      if (b.dataset.coach === 'next') { const st = activeStep(); if (st && st.tap) { stepIdx++; shown = null; tick(); schedule(); } }
      if (b.dataset.coach === 'skip' && onSkip) onSkip();
    });

    function destroy() {
      dead = true;
      clearTimeout(timer); checkTimers.forEach(clearTimeout); clearInterval(iv);
      ['pointerdown', 'click', 'touchstart'].forEach(t => document.removeEventListener(t, guard, { capture: true }));
      layer.remove(); document.body.classList.remove('tutorial');
    }
    setTimeout(push, 50);
    return {
      action, destroy,
      onSkip(fn) { onSkip = fn; },
      get over() { return g.phase === 'gameOver'; },
    };
  }

  root.Tutorial = { create, SCRIPT, STEPS };
})(typeof self !== 'undefined' ? self : this);
