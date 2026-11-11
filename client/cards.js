// Колода «В Точку»: чёрные карты с золотом, нарисованные кодом (SVG).
// Любую карту можно позже заменить картинкой — достаточно поменять Cards.url().
'use strict';
(function (root) {
  const W = 250, H = 350;
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const isRed = s => s === '♥' || s === '♦';
  // Пики и трефы — золото; червы и бубны — рубин с золотым контуром.
  const fillOf = s => (isRed(s) ? 'url(#ruby)' : 'url(#gold)');
  const strokeOf = s => (isRed(s) ? 'stroke="url(#goldLine)" stroke-width="5"' : '');

  const SUIT = {
    '♥': 'M50 90 C 20 66 3 48 3 29 C 3 13 15 3 29 3 C 39 3 46 9 50 18 C 54 9 61 3 71 3 C 85 3 97 13 97 29 C 97 48 80 66 50 90 Z',
    '♦': 'M50 2 Q 67 30 90 50 Q 67 70 50 98 Q 33 70 10 50 Q 33 30 50 2 Z',
    '♠': 'M50 3 C 80 32 97 47 97 63 C 97 77 86 85 74 85 C 64 85 57 80 53 72 C 55 84 59 91 67 97 L 33 97 C 41 91 45 84 47 72 C 43 80 36 85 26 85 C 14 85 3 77 3 63 C 3 47 20 32 50 3 Z',
    '♣': 'M50 4 A 21 21 0 0 1 68 36 A 21 21 0 1 1 56 72 C 57 84 61 91 68 97 L 32 97 C 39 91 43 84 44 72 A 21 21 0 1 1 32 36 A 21 21 0 0 1 50 4 Z',
  };
  function suit(s, x, y, size, rot = 0, fill = fillOf(s), extra = strokeOf(s)) {
    return `<path d="${SUIT[s]}" fill="${fill}" ${extra} transform="translate(${x} ${y}) rotate(${rot}) translate(${-size / 2} ${-size / 2}) scale(${size / 100})"/>`;
  }

  const DEFS = `
    <linearGradient id="black" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26262c"/><stop offset=".45" stop-color="#121216"/><stop offset="1" stop-color="#050507"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9a6f22"/><stop offset=".3" stop-color="#f7e08f"/><stop offset=".55" stop-color="#d4a541"/><stop offset=".8" stop-color="#ffefb0"/><stop offset="1" stop-color="#8a6420"/>
    </linearGradient>
    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b8892e"/><stop offset=".5" stop-color="#fbe7a1"/><stop offset="1" stop-color="#a87d2a"/>
    </linearGradient>
    <linearGradient id="ruby" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff5a6a"/><stop offset=".45" stop-color="#c3122f"/><stop offset="1" stop-color="#6d0718"/>
    </linearGradient>
    <linearGradient id="violet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3cff"/><stop offset=".5" stop-color="#f6d27a"/><stop offset="1" stop-color="#b98cff"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/>
    </linearGradient>
    <pattern id="emboss" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 9 H18 M9 0 V18" stroke="#1d1d23" stroke-width="1"/>
    </pattern>`;

  function frame(special) {
    return `
      <rect x="2" y="2" width="246" height="346" rx="16" fill="url(#black)" stroke="${special ? 'url(#violet)' : 'url(#gold)'}" stroke-width="${special ? 6 : 3}"/>
      <rect x="10" y="10" width="230" height="330" rx="10" fill="url(#emboss)" opacity=".9"/>
      <rect x="10" y="10" width="230" height="330" rx="10" fill="none" stroke="url(#goldLine)" stroke-width="1" opacity=".55"/>
      <rect x="2" y="2" width="246" height="346" rx="16" fill="url(#sheen)"/>`;
  }

  function corners(c) {
    const r = root.CardLabel ? root.CardLabel(c.rank) : RANKS[c.rank];
    const fs = r === '10' ? 42 : 48;
    const red = isRed(c.suit);
    const one = `<g>
      <text x="29" y="54" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs}" fill="${red ? 'url(#ruby)' : 'url(#gold)'}" ${red ? 'stroke="url(#goldLine)" stroke-width="1.2"' : ''} ${r === '10' ? 'letter-spacing="-3"' : ''}>${r}</text>
      ${suit(c.suit, 29, 80, 30)}
    </g>`;
    return one + `<g transform="rotate(180 125 175)">${one}</g>`;
  }

  const PIPS = {
    6: [[0, .08], [1, .08], [0, .5], [1, .5], [0, .92], [1, .92]],
    7: [[0, .08], [1, .08], [.5, .29], [0, .5], [1, .5], [0, .92], [1, .92]],
    8: [[0, .08], [1, .08], [.5, .29], [0, .5], [1, .5], [.5, .71], [0, .92], [1, .92]],
    9: [[0, .08], [1, .08], [0, .36], [1, .36], [.5, .5], [0, .64], [1, .64], [0, .92], [1, .92]],
    10: [[0, .08], [1, .08], [.5, .22], [0, .36], [1, .36], [0, .64], [1, .64], [.5, .78], [0, .92], [1, .92]],
  };
  function pips(c) {
    const n = +RANKS[c.rank];
    return PIPS[n].map(([fx, fy]) => suit(c.suit, 80 + fx * 90, 62 + fy * 226, 42, fy > .55 ? 180 : 0)).join('');
  }

  // Фигуры: золотая гравюра на чёрном, верхняя половина зеркалится.
  function face(c) {
    const red = isRed(c.suit);
    const robe = red ? '#4a0a16' : '#141826';
    const accent = red ? 'url(#ruby)' : '#2b3a6b';
    const kind = RANKS[c.rank];
    const G = 'url(#goldLine)';
    let hat = '', hair = '', item = '';
    if (kind === 'К') {
      hat = `<path d="M101 77 L103 55 L113 67 L125 48 L137 67 L147 55 L149 77 Z" fill="url(#gold)" stroke="#5a4012" stroke-width="1.5"/>
             <circle cx="125" cy="62" r="3.5" fill="${red ? '#4b7bd9' : '#e0112f'}"/>`;
      hair = `<path d="M106 100 Q125 132 144 100 Q140 120 125 124 Q110 120 106 100 Z" fill="#2a2016" stroke="${G}" stroke-width="1.2"/>`;
      item = `<line x1="164" y1="172" x2="172" y2="110" stroke="${G}" stroke-width="5" stroke-linecap="round"/><circle cx="172" cy="106" r="7" fill="url(#gold)"/>`;
    } else if (kind === 'Д') {
      hat = `<path d="M104 79 Q125 56 146 79 L144 83 Q125 70 106 83 Z" fill="url(#gold)" stroke="#5a4012" stroke-width="1.2"/>
             <circle cx="125" cy="66" r="4" fill="${red ? '#4b7bd9' : '#e0112f'}"/>`;
      hair = `<path d="M104 84 Q100 112 108 128 L114 124 Q108 104 112 86 Z M146 84 Q150 112 142 128 L136 124 Q142 104 138 86 Z" fill="#3a2a16" stroke="${G}" stroke-width="1"/>`;
      item = `<line x1="84" y1="172" x2="80" y2="122" stroke="${G}" stroke-width="2.5"/>
              <g fill="${accent}" stroke="${G}" stroke-width="1"><circle cx="80" cy="116" r="6"/><circle cx="73" cy="121" r="5"/><circle cx="87" cy="121" r="5"/></g>`;
    } else {
      hat = `<path d="M102 82 Q104 60 126 58 Q148 60 150 82 Z" fill="${robe}" stroke="${G}" stroke-width="2.5"/>
             <path d="M146 66 Q168 46 176 58 Q164 60 150 74" fill="url(#gold)"/>`;
      hair = `<path d="M105 84 Q104 98 109 104 L112 88 Z M147 84 Q148 98 143 104 L140 88 Z" fill="#3a2a16"/>`;
      item = `<line x1="80" y1="172" x2="86" y2="104" stroke="${G}" stroke-width="4" stroke-linecap="round"/><path d="M86 92 L93 108 L80 106 Z" fill="url(#gold)"/>`;
    }
    const half = `
      <g clip-path="url(#top)">
        ${item}
        <path d="M64 176 L64 160 Q68 128 104 120 L146 120 Q182 128 186 160 L186 176 Z" fill="${robe}" stroke="${G}" stroke-width="2"/>
        <path d="M74 176 L74 162 Q80 138 104 130 M176 176 L176 162 Q170 138 146 130" fill="none" stroke="${G}" stroke-width="1" opacity=".7"/>
        <rect x="121" y="128" width="8" height="48" fill="url(#gold)"/>
        <path d="M104 120 Q125 138 146 120" stroke="${G}" stroke-width="4" fill="none"/>
        ${suit(c.suit, 125, 152, 22, 0, red ? 'url(#ruby)' : 'url(#gold)')}
        <ellipse cx="125" cy="120" rx="25" ry="7" fill="#1a1a20" stroke="${G}" stroke-width="1.5"/>
        <ellipse cx="125" cy="97" rx="18" ry="21" fill="#e6cf9e" stroke="#8a6420" stroke-width="1.5"/>
        ${hair}
        <circle cx="118.5" cy="95" r="2.2" fill="#1a120a"/><circle cx="131.5" cy="95" r="2.2" fill="#1a120a"/>
        <path d="M119 107 Q125 110 131 107" stroke="#7a3a2a" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${hat}
      </g>`;
    return `
      <clipPath id="top"><rect x="54" y="50" width="142" height="125"/></clipPath>
      <rect x="54" y="50" width="142" height="250" rx="8" fill="#0b0b0e" stroke="url(#gold)" stroke-width="3"/>
      <g id="half">${half}</g>
      <use href="#half" transform="rotate(180 125 175)"/>
      <line x1="56" y1="175" x2="194" y2="175" stroke="url(#gold)" stroke-width="2"/>
      <rect x="59" y="55" width="132" height="240" rx="5" fill="none" stroke="url(#goldLine)" stroke-width="1" opacity=".6"/>`;
  }

  function ace(c) {
    const trump = c.suit === '♥';
    return `
      <circle cx="125" cy="175" r="82" fill="none" stroke="url(#gold)" stroke-width="3"/>
      <circle cx="125" cy="175" r="73" fill="none" stroke="url(#goldLine)" stroke-width="1.2" stroke-dasharray="2 5"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<g transform="rotate(${a} 125 175)"><path d="M125 86 L130 94 L125 102 L120 94 Z" fill="url(#gold)"/></g>`).join('')}
      ${trump ? `<circle cx="125" cy="175" r="64" fill="#c3122f" opacity=".12"/>` : ''}
      ${suit(c.suit, 125, 178, 104)}`;
  }

  function cardSvg(c) {
    const special = c.id === '7♠';
    const n = c.rank;
    const body = n <= 4 ? pips(c) : n <= 7 ? face(c) : ace(c);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <defs>${DEFS}</defs>
      ${frame(special)}
      ${body}
      ${corners(c)}
      ${special ? `<path d="M125 16 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1 z" fill="url(#violet)"/>
                   <g transform="rotate(180 125 175)"><path d="M125 16 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1 z" fill="url(#violet)"/></g>` : ''}
    </svg>`;
  }

  // Рубашка: чёрное тиснение с золотой рамкой и медальоном-«мишенью» (знак «В Точку»).
  function backSvg() {
    const ring = (r, w, o = 1) => `<circle cx="125" cy="175" r="${r}" fill="none" stroke="url(#gold)" stroke-width="${w}" opacity="${o}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <defs>${DEFS}
        <pattern id="lace" width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="26" height="26" fill="#0c0c0f"/>
          <path d="M13 1 Q20 13 13 25 Q6 13 13 1 Z M1 13 Q13 6 25 13 Q13 20 1 13 Z" fill="none" stroke="#24242b" stroke-width="1.4"/>
          <circle cx="13" cy="13" r="2" fill="#2a2a32"/>
        </pattern>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="16" fill="#08080a" stroke="url(#gold)" stroke-width="3"/>
      <rect x="13" y="13" width="224" height="324" rx="10" fill="url(#lace)" stroke="url(#goldLine)" stroke-width="1.5"/>
      <rect x="20" y="20" width="210" height="310" rx="7" fill="none" stroke="#3a3a44" stroke-width="1"/>
      <circle cx="125" cy="175" r="62" fill="#08080a"/>
      ${ring(62, 3)}${ring(52, 1.2, .7)}
      <g transform="translate(79 129) scale(.92)">${root.Brand ? root.Brand.hood({ id: 'bk' }).replace(/<svg[^>]*>|<\/svg>/g, '') : ''}</g>
      ${[0, 90, 180, 270].map(a => `<g transform="rotate(${a} 125 175)"><path d="M125 40 L132 50 L125 60 L118 50 Z" fill="url(#gold)"/></g>`).join('')}
      <rect x="2" y="2" width="246" height="346" rx="16" fill="url(#sheen)"/>
    </svg>`;
  }

  const cache = {};
  // url('…') без кавычек внутри — можно вставлять и в style="", и в JS.
  const toUrl = svg => `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ')).replace(/'/g, '%27')}')`;
  const Cards = {
    RANKS,
    svg: cardSvg,
    backSvg,
    url(c) { const k = (root.CardLang || '') + c.id; return cache[k] || (cache[k] = toUrl(cardSvg(c))); },
    backUrl() { return cache.back || (cache.back = toUrl(backSvg())); },
    parse(id) { const s = id.slice(-1); return { id, suit: s, rank: RANKS.indexOf(id.slice(0, -1)) }; },
  };
  // Выбор темы: 'dark' — чёрные с золотом, 'light' — классические светлые. Личная настройка игрока.
  // 'sil' — силуэты (по умолчанию), 'dark' — чёрные с золотом, 'light' — классические светлые, 'royal' — «Королевская» (картинки).
  const Dark = Cards;
  root.CardsDark = Dark;
  const THEMES = ['sil', 'dark', 'light', 'royal'];
  let theme = 'sil';
  try { const t = (JSON.parse(localStorage.getItem('vtochku-prefs')) || {}).cards; if (THEMES.includes(t)) theme = t; } catch {}
  const pickDeck = () => (theme === 'light' && root.CardsLight ? root.CardsLight : theme === 'sil' && root.CardsSil ? root.CardsSil : theme === 'royal' && root.CardsRoyal ? root.CardsRoyal : Dark);
  const Facade = {
    RANKS,
    get theme() { return theme; },
    setTheme(t) { theme = THEMES.includes(t) ? t : 'sil'; if (theme === 'royal' && root.CardsRoyal) root.CardsRoyal.preload(); },
    svg: c => pickDeck().svg(c),
    url: c => pickDeck().url(c),
    backUrl: () => pickDeck().backUrl(),
    parse: Dark.parse,
  };
  if (typeof module === 'object' && module.exports) module.exports = Facade;
  else root.Cards = Facade;
})(typeof self !== 'undefined' ? self : this);
