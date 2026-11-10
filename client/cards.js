// Колода «По ушам»: классические карты в стиле «тёмный премиум», нарисованные кодом (SVG).
// Любую карту можно позже заменить картинкой — достаточно поменять Cards.url().
'use strict';
(function (root) {
  const W = 250, H = 350;
  const RED = '#b3122a', BLACK = '#17171c';
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];

  // Масти в квадрате 100×100.
  const SUIT = {
    '♥': 'M50 90 C 20 66 3 48 3 29 C 3 13 15 3 29 3 C 39 3 46 9 50 18 C 54 9 61 3 71 3 C 85 3 97 13 97 29 C 97 48 80 66 50 90 Z',
    '♦': 'M50 2 Q 67 30 90 50 Q 67 70 50 98 Q 33 70 10 50 Q 33 30 50 2 Z',
    '♠': 'M50 3 C 80 32 97 47 97 63 C 97 77 86 85 74 85 C 64 85 57 80 53 72 C 55 84 59 91 67 97 L 33 97 C 41 91 45 84 47 72 C 43 80 36 85 26 85 C 14 85 3 77 3 63 C 3 47 20 32 50 3 Z',
    '♣': 'M50 4 A 21 21 0 0 1 68 36 A 21 21 0 1 1 56 72 C 57 84 61 91 68 97 L 32 97 C 39 91 43 84 44 72 A 21 21 0 1 1 32 36 A 21 21 0 0 1 50 4 Z',
  };
  const colorOf = s => (s === '♥' || s === '♦' ? RED : BLACK);

  function suit(s, x, y, size, rot = 0, fill = colorOf(s), extra = '') {
    return `<path d="${SUIT[s]}" fill="${fill}" ${extra} transform="translate(${x} ${y}) rotate(${rot}) translate(${-size / 2} ${-size / 2}) scale(${size / 100})"/>`;
  }

  const DEFS = `
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#f6eedb"/><stop offset="1" stop-color="#e9dcc0"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a87d2a"/><stop offset=".35" stop-color="#f4dc94"/><stop offset=".6" stop-color="#d1a445"/><stop offset="1" stop-color="#8a6420"/>
    </linearGradient>
    <linearGradient id="violet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b2bb5"/><stop offset=".5" stop-color="#e4c46a"/><stop offset="1" stop-color="#7c3cff"/>
    </linearGradient>
    <radialGradient id="faceBg" cx=".5" cy=".5" r=".7">
      <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ecdcb8"/>
    </radialGradient>`;

  function corners(c) {
    const col = colorOf(c.suit);
    const r = RANKS[c.rank];
    const fs = r === '10' ? 40 : 46;
    const one = `<g>
      <text x="27" y="52" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs}" fill="${col}" ${r === '10' ? 'letter-spacing="-3"' : ''}>${r}</text>
      ${suit(c.suit, 27, 76, 28)}
    </g>`;
    return one + `<g transform="rotate(180 125 175)">${one}</g>`;
  }

  // Раскладка очков для 6–10 (доли от области 62..188 × 52..298).
  const PIPS = {
    6: [[0, .08], [1, .08], [0, .5], [1, .5], [0, .92], [1, .92]],
    7: [[0, .08], [1, .08], [.5, .29], [0, .5], [1, .5], [0, .92], [1, .92]],
    8: [[0, .08], [1, .08], [.5, .29], [0, .5], [1, .5], [.5, .71], [0, .92], [1, .92]],
    9: [[0, .08], [1, .08], [0, .36], [1, .36], [.5, .5], [0, .64], [1, .64], [0, .92], [1, .92]],
    10: [[0, .08], [1, .08], [.5, .22], [0, .36], [1, .36], [0, .64], [1, .64], [.5, .78], [0, .92], [1, .92]],
  };
  function pips(c) {
    const n = +RANKS[c.rank];
    return PIPS[n].map(([fx, fy]) => {
      const x = 78 + fx * 94, y = 60 + fy * 230;
      return suit(c.suit, x, y, 42, fy > .55 ? 180 : 0);
    }).join('');
  }

  // Фигуры: двуглавый портрет, верхняя половина зеркалится.
  function face(c) {
    const red = c.suit === '♥' || c.suit === '♦';
    const robe = red ? '#a3122a' : '#1d2747';
    const robe2 = red ? '#d43b3b' : '#33427a';
    const kind = RANKS[c.rank];
    let hat = '', hair = '', item = '';
    if (kind === 'К') {
      hat = `<path d="M101 77 L103 55 L113 67 L125 48 L137 67 L147 55 L149 77 Z" fill="url(#gold)" stroke="#7a5a18" stroke-width="1.5"/>
             <circle cx="125" cy="62" r="3.5" fill="${red ? '#1d4fa3' : '#c3122f'}"/><circle cx="111" cy="70" r="2.5" fill="#fff"/><circle cx="139" cy="70" r="2.5" fill="#fff"/>`;
      hair = `<path d="M106 100 Q125 132 144 100 Q140 120 125 124 Q110 120 106 100 Z" fill="#5d3f22"/>
              <path d="M114 107 Q125 112 136 107" stroke="#3d2814" stroke-width="2" fill="none"/>`;
      item = `<line x1="164" y1="172" x2="172" y2="110" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>
              <circle cx="172" cy="106" r="7" fill="url(#gold)" stroke="#7a5a18"/>`;
    } else if (kind === 'Д') {
      hat = `<path d="M104 79 Q125 56 146 79 L144 83 Q125 70 106 83 Z" fill="url(#gold)" stroke="#7a5a18" stroke-width="1.2"/>
             <circle cx="125" cy="66" r="4" fill="${red ? '#1d4fa3' : '#c3122f'}"/>`;
      hair = `<path d="M104 84 Q100 112 108 128 L114 124 Q108 104 112 86 Z M146 84 Q150 112 142 128 L136 124 Q142 104 138 86 Z" fill="#a8652c"/>`;
      item = `<line x1="84" y1="172" x2="80" y2="122" stroke="#3f6b2a" stroke-width="3"/>
              <g fill="${robe2}"><circle cx="80" cy="116" r="6"/><circle cx="73" cy="121" r="5"/><circle cx="87" cy="121" r="5"/></g>
              <circle cx="80" cy="118" r="3" fill="url(#gold)"/>`;
    } else {
      hat = `<path d="M102 82 Q104 60 126 58 Q148 60 150 82 Z" fill="${robe}" stroke="url(#gold)" stroke-width="2.5"/>
             <path d="M146 66 Q168 46 176 58 Q164 60 150 74" fill="url(#gold)" stroke="#7a5a18" stroke-width="1"/>`;
      hair = `<path d="M105 84 Q104 98 109 104 L112 88 Z M147 84 Q148 98 143 104 L140 88 Z" fill="#7a4a24"/>`;
      item = `<line x1="80" y1="172" x2="86" y2="104" stroke="#8a6a3a" stroke-width="4" stroke-linecap="round"/>
              <path d="M86 92 L93 108 L80 106 Z" fill="url(#gold)" stroke="#7a5a18"/>`;
    }
    const half = `
      <g clip-path="url(#top)">
        ${item}
        <path d="M64 176 L64 160 Q68 128 104 120 L146 120 Q182 128 186 160 L186 176 Z" fill="${robe}"/>
        <path d="M64 176 L64 162 Q70 136 98 128 L104 176 Z" fill="${robe2}" opacity=".55"/>
        <rect x="121" y="128" width="8" height="48" fill="url(#gold)"/>
        <path d="M104 120 Q125 138 146 120" stroke="url(#gold)" stroke-width="4" fill="none"/>
        ${suit(c.suit, 125, 152, 22, 0, 'url(#gold)')}
        <ellipse cx="125" cy="120" rx="25" ry="7" fill="#f7f1e2" stroke="#c9b37e" stroke-width="1.5"/>
        <ellipse cx="125" cy="97" rx="18" ry="21" fill="#f1d2b0" stroke="#b98b62" stroke-width="1.5"/>
        ${hair}
        <circle cx="118.5" cy="95" r="2.2" fill="#2a1d12"/><circle cx="131.5" cy="95" r="2.2" fill="#2a1d12"/>
        <path d="M119 107 Q125 110 131 107" stroke="#9b4a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${hat}
      </g>`;
    return `
      <clipPath id="top"><rect x="54" y="50" width="142" height="125"/></clipPath>
      <rect x="54" y="50" width="142" height="250" rx="8" fill="url(#faceBg)" stroke="url(#gold)" stroke-width="3"/>
      <g id="half">${half}</g>
      <use href="#half" transform="rotate(180 125 175)"/>
      <line x1="56" y1="175" x2="194" y2="175" stroke="url(#gold)" stroke-width="2"/>
      <rect x="59" y="55" width="132" height="240" rx="5" fill="none" stroke="#c9b37e" stroke-width="1" opacity=".7"/>`;
  }

  function ace(c) {
    const trump = c.suit === '♥';
    return `
      <circle cx="125" cy="175" r="80" fill="none" stroke="url(#gold)" stroke-width="3"/>
      <circle cx="125" cy="175" r="72" fill="none" stroke="#c9b37e" stroke-width="1.2" stroke-dasharray="2 5"/>
      ${[0, 90, 180, 270].map(a => `<g transform="rotate(${a} 125 175)"><path d="M125 88 L130 96 L125 104 L120 96 Z" fill="url(#gold)"/></g>`).join('')}
      ${trump ? `<circle cx="125" cy="175" r="62" fill="#c3122f" opacity=".07"/>` : ''}
      ${suit(c.suit, 125, 178, 104, 0, colorOf(c.suit), trump ? 'stroke="url(#gold)" stroke-width="3"' : '')}`;
  }

  function cardSvg(c) {
    const special = c.id === '7♠';
    const n = c.rank;
    const body = n <= 4 ? pips(c) : n <= 7 ? face(c) : ace(c);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <defs>${DEFS}</defs>
      <rect x="2" y="2" width="246" height="346" rx="18" fill="url(#paper)" stroke="${special ? 'url(#violet)' : '#c9b37e'}" stroke-width="${special ? 6 : 2}"/>
      <rect x="10" y="10" width="230" height="330" rx="12" fill="none" stroke="#c9b37e" stroke-width="1" opacity=".55"/>
      ${body}
      ${corners(c)}
      ${special ? `<path d="M125 18 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1 z" fill="url(#violet)"/>
                   <g transform="rotate(180 125 175)"><path d="M125 18 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1 z" fill="url(#violet)"/></g>` : ''}
    </svg>`;
  }

  function backSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <defs>${DEFS}
        <pattern id="lat" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="#14111d"/>
          <path d="M0 0 H22 M0 0 V22" stroke="#4a3a17" stroke-width="1.6"/>
          <circle cx="11" cy="11" r="1.6" fill="#8a6a2a"/>
        </pattern>
        <radialGradient id="shine" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#3a2d5c" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="18" fill="#0d0b13" stroke="url(#gold)" stroke-width="3"/>
      <rect x="14" y="14" width="222" height="322" rx="10" fill="url(#lat)" stroke="url(#gold)" stroke-width="2"/>
      <rect x="14" y="14" width="222" height="322" rx="10" fill="url(#shine)"/>
      <rect x="22" y="22" width="206" height="306" rx="7" fill="none" stroke="#a8822c" stroke-width="1" opacity=".8"/>
      <circle cx="125" cy="175" r="56" fill="#0d0b13" stroke="url(#gold)" stroke-width="3"/>
      <circle cx="125" cy="175" r="47" fill="none" stroke="#a8822c" stroke-width="1" stroke-dasharray="3 4"/>
      ${suit('♠', 113, 172, 52, -14, 'url(#gold)', 'stroke="#0d0b13" stroke-width="5"')}
      ${suit('♥', 139, 182, 46, 14, '#c3122f', 'stroke="url(#gold)" stroke-width="4"')}
      ${[0, 1, 2, 3].map(i => `<g transform="rotate(${i * 90} 125 175)"><path d="M125 108 L131 117 L125 126 L119 117 Z" fill="url(#gold)"/></g>`).join('')}
    </svg>`;
  }

  const cache = {};
  // url('…') без кавычек внутри — можно вставлять и в style="", и в JS.
  const toUrl = svg => `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ')).replace(/'/g, '%27')}')`;
  const Cards = {
    RANKS,
    svg: cardSvg,
    backSvg,
    url(c) { return cache[c.id] || (cache[c.id] = toUrl(cardSvg(c))); },
    backUrl() { return cache.back || (cache.back = toUrl(backSvg())); },
    parse(id) { const s = id.slice(-1); return { id, suit: s, rank: RANKS.indexOf(id.slice(0, -1)) }; },
  };
  if (typeof module === 'object' && module.exports) module.exports = Cards;
  else root.Cards = Cards;
})(typeof self !== 'undefined' ? self : this);
