// Колода «Королевская»: готовые картинки (вариант персонализации). Карты лежат в client/img/decks/royal/
// как <J|Q|K|A|6..10>_<hearts|diamonds|clubs|spades>.webp + back.webp; 7♠ уже с фиолетово-золотой рамкой.
'use strict';
(function (root) {
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const FILE_RANK = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT = { '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' };
  const BASE = '/img/decks/royal/';
  const file = c => `${BASE}${FILE_RANK[c.rank]}_${SUIT[c.suit]}.webp`;
  let loaded = false;
  const Royal = {
    RANKS,
    svg: () => '',
    url: c => `url('${file(c)}')`,
    backUrl: () => `url('${BASE}back.webp')`,
    parse(id) { const s = id.slice(-1); return { id, suit: s, rank: RANKS.indexOf(id.slice(0, -1)) }; },
    // Подгружаем всю колоду заранее, чтобы карты не «мигали» при раздаче.
    preload() {
      if (loaded || typeof Image === 'undefined') return; loaded = true;
      for (const s in SUIT) for (let r = 0; r < 9; r++) { const im = new Image(); im.src = file({ suit: s, rank: r }); }
      const b = new Image(); b.src = `${BASE}back.webp`;
    },
  };
  root.CardsRoyal = Royal;
})(typeof self !== 'undefined' ? self : this);
