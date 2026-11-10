// Логотип «В Точку»: аноним в капюшоне — лицо в тени, видны только золотые искры глаз, в руке веер карт.
'use strict';
(function (root) {
  let n = 0;
  // opts: { bg: true } — круглый тёмный фон (для иконок); id — уникальный суффикс для градиентов.
  function hood(opts = {}) {
    const id = 'h' + (opts.id || ++n);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${opts.attrs ? ' ' + opts.attrs : ''}>
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a6f22"/><stop offset=".35" stop-color="#f7e08f"/><stop offset=".6" stop-color="#d4a541"/><stop offset="1" stop-color="#8a6420"/></linearGradient>
        <radialGradient id="${id}c" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#3a3542"/><stop offset=".6" stop-color="#17141d"/><stop offset="1" stop-color="#07060a"/></radialGradient>
        <radialGradient id="${id}f" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#000"/><stop offset=".7" stop-color="#050407"/><stop offset="1" stop-color="#1a1620"/></radialGradient>
        <radialGradient id="${id}e" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d0"/><stop offset=".45" stop-color="#f6d27a"/><stop offset="1" stop-color="#f6d27a" stop-opacity="0"/></radialGradient>
        <radialGradient id="${id}b" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#2a2236"/><stop offset="1" stop-color="#07060b"/></radialGradient>
      </defs>
      ${opts.bg ? `<circle cx="50" cy="50" r="49" fill="url(#${id}b)" stroke="url(#${id}g)" stroke-width="2"/>` : ''}
      <path d="M4 100 C 8 86 20 79 34 77 L 66 77 C 80 79 92 86 96 100 Z" fill="#0c0a10" stroke="url(#${id}g)" stroke-width="1.4"/>
      <path d="M50 3 C 41 9 27 19 22 37 C 17 54 20 70 13 85 C 25 90 37 91 50 91 C 63 91 75 90 87 85 C 80 70 83 54 78 37 C 73 19 59 9 50 3 Z" fill="url(#${id}c)" stroke="url(#${id}g)" stroke-width="2"/>
      <path d="M29 42 C 25 58 28 72 22 84 M71 42 C 75 58 72 72 78 84 M50 3 C 47 10 46 18 49 26" fill="none" stroke="url(#${id}g)" stroke-width="1" opacity=".45"/>
      <path d="M50 26 C 37 26 31 37 31 50 C 31 62 38 72 50 76 C 62 72 69 62 69 50 C 69 37 63 26 50 26 Z" fill="url(#${id}f)" stroke="#000" stroke-width="1"/>
      <path d="M33 45 C 35 34 42 28 50 28 C 58 28 65 34 67 45" fill="none" stroke="url(#${id}g)" stroke-width="1.1" opacity=".6"/>
      <ellipse cx="41.5" cy="52" rx="6" ry="3.2" fill="url(#${id}e)"/><ellipse cx="58.5" cy="52" rx="6" ry="3.2" fill="url(#${id}e)"/>
      <ellipse cx="41.5" cy="52" rx="2.4" ry="1.1" fill="#fffbe8"/><ellipse cx="58.5" cy="52" rx="2.4" ry="1.1" fill="#fffbe8"/>
      <g transform="translate(68 80) rotate(-14)">
        <rect x="-7" y="-10" width="13" height="18" rx="2" fill="#0c0a10" stroke="url(#${id}g)" stroke-width="1.2" transform="rotate(-16)"/>
        <rect x="-5" y="-10" width="13" height="18" rx="2" fill="#f6eedb" stroke="url(#${id}g)" stroke-width="1.2" transform="rotate(10)"/>
        <path d="M1.5 -4 C 0 -6.5 -3 -5 -1.5 -2 L 1.5 1 L 4.5 -2 C 6 -5 3 -6.5 1.5 -4 Z" fill="#c3122f" transform="rotate(10)"/>
      </g>
    </svg>`;
  }
  const Brand = { hood, url(opts) { return `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(hood(opts)).replace(/'/g, '%27')}')`; } };
  if (typeof module === 'object' && module.exports) module.exports = Brand;
  else root.Brand = Brand;
})(typeof self !== 'undefined' ? self : this);
