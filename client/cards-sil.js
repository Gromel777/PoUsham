// Колода «Силуэты»: светлые карты, фигуры — градиентные профили с искрами.
// Индекс (ранг и масть) в левом верхнем и правом нижнем углу — так его видно в веере руки.
'use strict';
(function (root) {
  const W = 250, H = 350;
  const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const isRed = s => s === '♥' || s === '♦';
  const label = r => (root.CardLabel ? root.CardLabel(r) : RANKS[r]);

  const SUIT = {
    '♥': 'M50 90 C 20 66 3 48 3 29 C 3 13 15 3 29 3 C 39 3 46 9 50 18 C 54 9 61 3 71 3 C 85 3 97 13 97 29 C 97 48 80 66 50 90 Z',
    '♦': 'M50 2 Q 67 30 90 50 Q 67 70 50 98 Q 33 70 10 50 Q 33 30 50 2 Z',
    '♠': 'M50 3 C 80 32 97 47 97 63 C 97 77 86 85 74 85 C 64 85 57 80 53 72 C 55 84 59 91 67 97 L 33 97 C 41 91 45 84 47 72 C 43 80 36 85 26 85 C 14 85 3 77 3 63 C 3 47 20 32 50 3 Z',
    '♣': 'M50 4 A 21 21 0 0 1 68 36 A 21 21 0 1 1 56 72 C 57 84 61 91 68 97 L 32 97 C 39 91 43 84 44 72 A 21 21 0 1 1 32 36 A 21 21 0 0 1 50 4 Z',
  };
  const pipFill = s => (isRed(s) ? 'url(#sRed)' : 'url(#sBlack)');
  function suit(s, x, y, size, fill = pipFill(s), extra = '') {
    return `<path d="${SUIT[s]}" fill="${fill}" ${extra} transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})"/>`;
  }

  const DEFS = `
    <linearGradient id="paper" x1="0" y1="0" x2=".6" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f4f4f6"/><stop offset="1" stop-color="#e3e3e8"/>
    </linearGradient>
    <linearGradient id="sRed" x1="0" y1="0" x2=".5" y2="1">
      <stop offset="0" stop-color="#ff6a6a"/><stop offset=".45" stop-color="#d9141f"/><stop offset="1" stop-color="#860612"/>
    </linearGradient>
    <linearGradient id="sBlack" x1="0" y1="0" x2=".5" y2="1">
      <stop offset="0" stop-color="#6b6b70"/><stop offset=".45" stop-color="#1e1e22"/><stop offset="1" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="figRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff3a3a"/><stop offset=".35" stop-color="#e01620"/><stop offset=".75" stop-color="#a10a16"/><stop offset="1" stop-color="#6e040d"/>
    </linearGradient>
    <linearGradient id="figBlack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8c8c92"/><stop offset=".3" stop-color="#3a3a40"/><stop offset=".7" stop-color="#121214"/><stop offset="1" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="figSheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="violet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3cff"/><stop offset=".5" stop-color="#e4b84a"/><stop offset="1" stop-color="#b98cff"/>
    </linearGradient>
    <clipPath id="inner"><rect x="17" y="17" width="216" height="316" rx="11"/></clipPath>`;

  function frame(special) {
    return `
      <rect x="1.5" y="1.5" width="247" height="347" rx="17" fill="url(#paper)" stroke="#9c9ca4" stroke-width="3"/>
      <rect x="17" y="17" width="216" height="316" rx="11" fill="none" stroke="#c9c9cf" stroke-width="5"/>
      <rect x="17" y="17" width="216" height="316" rx="11" fill="none" stroke="${special ? 'url(#violet)' : '#7d7d85'}" stroke-width="${special ? 3 : 1.6}"/>`;
  }

  function corners(c, top = false) {
    const r = label(c.rank);
    const ten = r === '10';
    const fill = isRed(c.suit) ? 'url(#sRed)' : 'url(#sBlack)';
    const one = `<g>
      <text x="${ten ? 40 : 38}" y="62" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${ten ? 36 : 40}" fill="${fill}" ${ten ? 'letter-spacing="-3"' : ''}>${r}</text>
      ${suit(c.suit, 38, 84, 24)}
    </g>`;
    return top ? one : one + `<g transform="rotate(180 125 175)">${one}</g>`;
  }

  // Детерминированный «случай» для искр — у каждой карты свой узор, но всегда одинаковый.
  function rng(seed) {
    let x = 0;
    for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    x = x || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  const bez = (p, t) => {
    const u = 1 - t;
    return [0, 1].map(i => u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i]);
  };
  // Вихрь искр: тонкие завитки и россыпь капель вдоль них, к концу — мельче и прозрачнее.
  function sparks(seed, curves, red, density = 46) {
    const R = rng(seed);
    const col = red ? ['#e01620', '#ff5a5a', '#a10a16', '#b0b0b8'] : ['#1e1e22', '#55555c', '#000', '#b0b0b8'];
    let out = '';
    for (const p of curves) {
      out += `<path d="M${p[0]} C${p[1]} ${p[2]} ${p[3]}" fill="none" stroke="${col[0]}" stroke-width=".9" opacity=".45"/>`;
      out += `<path d="M${p[0]} C${p[1]} ${p[2]} ${p[3]}" fill="none" stroke="${col[3]}" stroke-width=".6" opacity=".6" transform="translate(3 -2)"/>`;
      for (let i = 0; i < density; i++) {
        const t = Math.pow(R(), 0.8);
        const [x, y] = bez(p, t);
        const spread = 4 + t * 16;
        const dx = (R() - 0.5) * spread, dy = (R() - 0.5) * spread;
        const r = (1 - t) * 2.6 + R() * 1.4 + 0.3;
        const o = (1 - t * 0.7) * (0.55 + R() * 0.45);
        const kind = R();
        if (kind < 0.12) {
          const s = r * 2.2;
          out += `<path d="M${(x + dx).toFixed(1)} ${(y + dy - s).toFixed(1)} l${(s * .3).toFixed(1)} ${(s * .7).toFixed(1)} ${(s * .7).toFixed(1)} ${(s * .3).toFixed(1)} ${(-s * .7).toFixed(1)} ${(s * .3).toFixed(1)} ${(-s * .3).toFixed(1)} ${(s * .7).toFixed(1)} ${(-s * .3).toFixed(1)} ${(-s * .7).toFixed(1)} ${(-s * .7).toFixed(1)} ${(-s * .3).toFixed(1)} ${(s * .7).toFixed(1)} ${(-s * .3).toFixed(1)}z" fill="${col[1]}" opacity="${o.toFixed(2)}"/>`;
        } else {
          out += `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${r.toFixed(2)}" fill="${col[kind < 0.55 ? 0 : kind < 0.8 ? 2 : 3]}" opacity="${o.toFixed(2)}"/>`;
        }
      }
    }
    return out;
  }

  // Профили (смотрят влево), в координатах карты 250×350; низ уходит под рамку.
  const JACK = `M232 340 C232 300 214 274 190 264 C180 260 174 252 174 240 C174 228 182 214 184 196
    C190 160 178 118 140 104 C110 94 80 104 72 132 C69 142 70 150 72 158 C73 164 70 168 66 172
    C58 184 52 190 50 196 C49 201 54 203 60 204 C60 208 58 211 59 214 C60 217 64 218 64 221
    C62 224 62 228 65 231 C66 238 64 244 70 250 C76 256 92 256 102 256 C104 266 102 276 96 284
    C78 296 56 306 40 340 Z`;
  const QUEEN = `M232 340 C232 300 216 276 192 268 C182 264 178 256 178 244 C178 232 184 220 186 210
    C206 206 220 188 216 168 C212 150 196 140 180 144 C170 116 148 102 122 104 C94 106 78 124 76 146
    C75 154 76 160 77 166 C77 171 74 174 71 178 C65 187 60 192 58 197 C57 202 62 204 67 205
    C67 209 65 212 66 215 C67 218 71 219 71 221 C69 224 69 228 72 231 C74 238 74 244 80 249
    C86 254 98 254 106 254 C110 266 108 278 102 288 C86 300 62 310 46 340 Z`;
  const KING = `M232 340 C232 300 214 274 190 262 C180 258 174 250 174 238 C174 226 180 214 182 198
    C188 162 178 124 142 110 C112 100 82 108 72 136 C69 146 70 154 71 160 C72 166 69 170 65 174
    C57 186 51 192 49 198 C48 203 53 205 59 206 C57 210 56 214 58 216 C54 220 54 226 58 230
    C54 246 56 266 62 288 C72 280 88 270 108 264 C112 264 112 270 108 278 C102 290 96 296 90 300
    C70 308 52 318 40 340 Z`;
  // Короны и украшения поверх головы (тем же градиентом, с белыми «прорезями»).
  const CROWN_K = `M78 116 L70 66 L92 88 L104 52 L120 84 L140 54 L146 92 L168 74 L162 124 C138 112 104 108 78 116 Z`;
  const CROWN_K_CUT = [[92, 104, 4], [116, 100, 4.5], [140, 104, 4], [104, 52, 4], [140, 54, 4], [70, 66, 3.5], [168, 74, 3.5]];
  const TIARA = `M82 120 L84 96 L98 108 L110 84 L124 104 L140 88 L146 110 L160 102 L160 124 C134 112 106 112 82 120 Z`;
  const TIARA_CUT = [[110, 84, 3.5], [140, 88, 3], [84, 96, 3], [160, 102, 3], [116, 112, 3], [136, 112, 2.6]];

  function figure(c) {
    const red = isRed(c.suit);
    const fill = red ? 'url(#figRed)' : 'url(#figBlack)';
    const k = RANKS[c.rank];
    const body = k === 'В' ? JACK : k === 'Д' ? QUEEN : KING;
    const curves = [
      [[150, 330], [236, 290], [140, 210], [214, 150]],
      [[176, 318], [250, 250], [176, 190], [226, 96]],
      [[196, 300], [236, 240], [214, 190], [236, 60]],
    ];
    let deco = '';
    if (k === 'К') deco = `<path d="${CROWN_K}" fill="${fill}"/>${CROWN_K_CUT.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".9"/>`).join('')}
      <path d="M84 112 C110 104 138 106 160 118" fill="none" stroke="#fff" stroke-width="2.4" opacity=".85"/>`;
    else if (k === 'Д') deco = `<path d="${TIARA}" fill="${fill}"/>${TIARA_CUT.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".9"/>`).join('')}
      <path d="M88 118 C112 110 136 110 156 118" fill="none" stroke="#fff" stroke-width="1.8" opacity=".8"/>`;
    // Тонкие светлые линии: ухо, прядь, ворот — чтобы силуэт читался.
    const lines = k === 'В'
      ? `<path d="M146 176 C152 168 160 172 158 182 C156 190 150 192 148 188" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>
         <path d="M84 120 C104 102 140 100 166 120 C176 130 180 146 182 160 M92 116 C112 106 136 108 154 120 M78 134 C86 122 98 116 110 114" fill="none" stroke="#fff" stroke-width="1.2" opacity=".38"/>
         <path d="M100 258 C120 262 140 266 172 262" fill="none" stroke="#fff" stroke-width="1.3" opacity=".35"/>`
      : k === 'Д'
      ? `<path d="M186 214 C178 236 182 252 192 262" fill="none" stroke="#fff" stroke-width="1.4" opacity=".45"/>
         <circle cx="190" cy="176" r="14" fill="none" stroke="#fff" stroke-width="1.2" opacity=".35"/>
         <circle cx="104" cy="256" r="2.6" fill="#fff" opacity=".8"/>`
      : `<path d="M146 180 C152 172 160 176 158 186 C156 194 150 196 148 192" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>
         <path d="M60 218 C68 214 78 216 86 222" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>
         <path d="M66 236 C68 252 66 266 64 280 M76 234 C78 250 76 262 74 274 M88 232 C92 244 92 256 88 268 M100 236 C104 246 104 254 100 262" fill="none" stroke="#fff" stroke-width="1" opacity=".38"/>
         <path d="M110 204 C120 214 140 222 170 222" fill="none" stroke="#fff" stroke-width="1" opacity=".3"/>`;
    return `<g clip-path="url(#inner)">
      ${sparks(c.id, curves, red)}
      <path d="${body}" fill="${fill}"/>
      <path d="${body}" fill="url(#figSheen)"/>
      ${lines}${deco}
    </g>`;
  }

  // Числовые карты: глянцевые масти без поворота, как на эскизе.
  const COLS = [88, 125, 162];
  const PIPS = {
    6: [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1]],
    7: [[0, 0], [2, 0], [1, .25], [0, .5], [2, .5], [0, 1], [2, 1]],
    8: [[0, 0], [2, 0], [1, .25], [0, .5], [2, .5], [1, .75], [0, 1], [2, 1]],
    9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, .5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
    10: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
  };
  function pips(c) {
    const n = +RANKS[c.rank];
    return PIPS[n].map(([col, fy]) => suit(c.suit, COLS[col], 88 + fy * 174, 38, pipFill(c.suit), 'stroke="rgba(0,0,0,.12)" stroke-width="2"')).join('');
  }

  function ace(c) {
    const red = isRed(c.suit);
    const curves = [
      [[70, 300], [40, 230], [120, 236], [92, 160]],
      [[180, 300], [220, 240], [150, 220], [178, 120]],
      [[118, 316], [96, 270], [160, 262], [132, 210]],
    ];
    return `<g clip-path="url(#inner)">${sparks(c.id, curves, red, 40)}</g>
      ${suit(c.suit, 125, 172, 118, pipFill(c.suit), 'stroke="rgba(0,0,0,.14)" stroke-width="1.6"')}
      <path d="M96 140 C104 128 116 124 124 126" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>`;
  }

  function cardSvg(c) {
    const special = c.id === '7♠';
    const n = c.rank;
    const body = n <= 4 ? pips(c) : n <= 7 ? figure(c) : ace(c);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <defs>${DEFS}</defs>
      ${frame(special)}
      ${body}
      ${corners(c, n >= 5 && n <= 7)}
      ${special ? `<path d="M125 22 l3.5 7.5 8.5 1 -6.5 5 2.5 8.5 -8 -5 -8 5 2.5 -8.5 -6.5 -5 8.5 -1 z" fill="url(#violet)"/>
                   <g transform="rotate(180 125 175)"><path d="M125 22 l3.5 7.5 8.5 1 -6.5 5 2.5 8.5 -8 -5 -8 5 2.5 -8.5 -6.5 -5 8.5 -1 z" fill="url(#violet)"/></g>` : ''}
    </svg>`;
  }

  // Рубашка — общая с основной колодой (чёрная с золотом и капюшоном).
  const cache = {};
  const toUrl = svg => `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ')).replace(/'/g, '%27')}')`;
  const Cards = {
    RANKS,
    svg: cardSvg,
    url(c) { const k = (root.CardLang || '') + c.id; return cache[k] || (cache[k] = toUrl(cardSvg(c))); },
    backUrl() { return root.CardsDark ? root.CardsDark.backUrl() : ''; },
    parse(id) { const s = id.slice(-1); return { id, suit: s, rank: RANKS.indexOf(id.slice(0, -1)) }; },
  };
  if (typeof module === 'object' && module.exports) module.exports = Cards;
  else root.CardsSil = Cards;
})(typeof self !== 'undefined' ? self : this);
