// Колоды из готовых картинок (варианты персонализации): «Королевская» (img/decks/royal), «Звёздная» (img/decks/star).
// Карты лежат в client/img/decks/<колода>/
// как <J|Q|K|A|6..10>_<hearts|diamonds|clubs|spades>.webp + back.webp; 7♠ уже с фиолетово-золотой рамкой (дорисована при сборке).
'use strict';
(function (root) {
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const FILE_RANK = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT = { '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' };
  // Колода из картинок в client/img/decks/<dir>/ (сервер раздаёт их автоматически).
  function imageDeck(dir) {
    const BASE = `/img/decks/${dir}/`;
    const file = c => `${BASE}${FILE_RANK[c.rank]}_${SUIT[c.suit]}.webp`;
    let loaded = false;
    return {
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
  }
  root.ImageDeck = imageDeck;
  root.CardsRoyal = imageDeck('royal');   // «Королевская»
  root.CardsStar = imageDeck('star');     // «Звёздная»
})(typeof self !== 'undefined' ? self : this);
