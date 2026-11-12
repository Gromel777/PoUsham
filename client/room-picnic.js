// Комната «Пикник»: поляна (картинка client/img/rooms/picnic.webp — фон), на траве два пледа друг на друге.
// Между краем нижнего и верхнего пледа проходит общая подсветка хода (неон, rx 492 / ry 292).
// Кружки — эмалированные походные, места игроков — сложенные пледы. Отдаёт только разметку (как room-cozy.js).
(function (root) {
  const cx = 500, cy = 300;
  const ell = (rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  const f = n => n.toFixed(1);
  const MUGS = [['#e8473f', '#b52f29'], ['#3f7fd0', '#2a5a9c'], ['#f2efe6', '#c9c3b2'], ['#3e9a5c', '#2a6e40'], ['#f2b632', '#c58a14'], ['#7a4fc4', '#55348f']];

  // Неровный край пледа: эллипс с лёгкой волной (ткань лежит на траве не идеально).
  function blanketPath(rx, ry, amp, seed) {
    const n = 72; let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = 1 + amp * (Math.sin(a * 5 + seed) * .6 + Math.sin(a * 9 + seed * 2) * .4);
      const [x, y] = [cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w];
      d += (i ? ' L ' : 'M ') + f(x) + ' ' + f(y);
    }
    return d + ' Z';
  }
  // Бахрома по краю нижнего пледа.
  function fringe(rx, ry) {
    let s = '';
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * Math.PI * 2, [x0, y0] = ell(rx, ry, a), [x1, y1] = ell(rx + 13, ry + 9, a + .004);
      s += `<path d="M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}"/>`;
    }
    return `<g stroke="#e9dcc0" stroke-width="2.2" stroke-linecap="round" opacity=".85">${s}</g>`;
  }

  // Эмалированная кружка: белый скол на ободке, тёмный кант, ручка к игроку.
  function mug(deg, i) {
    const a = deg * Math.PI / 180, [x, y] = ell(408, 226, a);
    const [c1, c2] = MUGS[i % MUGS.length];
    const hx = Math.cos(a) * 36, hy = Math.sin(a) * 26;
    return `<g class="cup" data-a="${deg}" transform="translate(${f(x)} ${f(y)})">
      <ellipse cx="4" cy="8" rx="38" ry="26" fill="#1c1408" opacity=".4" filter="url(#pcSoft)"/>
      <ellipse cx="${f(hx)}" cy="${f(hy)}" rx="10" ry="8" fill="none" stroke="${c2}" stroke-width="6"/>
      <ellipse rx="33" ry="23" fill="${c1}" stroke="#1f2328" stroke-width="3"/>
      <ellipse rx="29" ry="20" fill="#f6f3ea"/>
      <ellipse rx="25" ry="17" fill="url(#pcTea)"/>
      <path d="M 16 -19 q 6 2 9 7" stroke="#1f2328" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="-9" cy="-7" rx="9" ry="3.5" fill="#fff" opacity=".35"/>
    </g>`;
  }

  // Угощения на пледе: доска с бутербродами и тарелка с фруктами.
  function sandwiches(x, y) {
    const one = (dx, dy, r) => `<g transform="translate(${dx} ${dy}) rotate(${r})"><path d="M -18 10 L 0 -16 L 18 10 Z" fill="#e8c88a" stroke="#b98d4a" stroke-width="2" stroke-linejoin="round"/>
      <path d="M -13 6 L 13 6" stroke="#7fb850" stroke-width="3.5" stroke-linecap="round"/><path d="M -10 2 L 10 2" stroke="#e05a4a" stroke-width="3" stroke-linecap="round"/></g>`;
    return `<g transform="translate(${x} ${y}) rotate(-8)"><rect x="-50" y="-28" width="104" height="62" rx="12" fill="#1c1408" opacity=".35" filter="url(#pcSoft)"/>
      <rect x="-52" y="-32" width="104" height="62" rx="12" fill="#c8915a" stroke="#9a6a3a" stroke-width="2"/>
      <path d="M -44 -20 L 44 -20 M -44 -6 L 44 -6 M -44 8 L 44 8" stroke="#9a6a3a" stroke-opacity=".35" stroke-width="1.5"/>
      ${one(-22, 0, -10)}${one(4, -4, 14)}${one(28, 2, -4)}</g>`;
  }
  function fruit(x, y) {
    const apple = (dx, dy, c) => `<circle cx="${dx}" cy="${dy}" r="13" fill="${c}"/><circle cx="${dx - 4}" cy="${dy - 4}" r="4" fill="#fff" opacity=".35"/><path d="M ${dx} ${dy - 12} q 2 -6 6 -7" stroke="#5a3a1a" stroke-width="2" fill="none"/>`;
    let grapes = '';
    for (let i = 0; i < 9; i++) grapes += `<circle cx="${18 + (i % 3) * 8 - (i > 5 ? -4 : 0)}" cy="${-6 + Math.floor(i / 3) * 7}" r="5" fill="#b9d36a" stroke="#8aa63e" stroke-width="1"/>`;
    return `<g transform="translate(${x} ${y})"><ellipse cx="4" cy="8" rx="50" ry="32" fill="#1c1408" opacity=".35" filter="url(#pcSoft)"/>
      <ellipse rx="48" ry="31" fill="#b07a44" stroke="#7d5229" stroke-width="2.5"/><ellipse rx="39" ry="23" fill="#8a5a2e"/>
      ${apple(-18, -2, '#d83a2c')}${apple(-2, 8, '#e04a35')}${grapes}</g>`;
  }

  function tableBase(angles, SIDE_SPOTS) {
    return `<svg class="tbl" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <filter id="pcSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
        <filter id="neonBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
        <!-- нижний плед: красно-кремовая шотландка -->
        <pattern id="pcTartan" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
          <rect width="64" height="64" fill="#b8322c"/>
          <rect x="0" y="22" width="64" height="20" fill="#8e1f1c" opacity=".7"/><rect x="22" y="0" width="20" height="64" fill="#8e1f1c" opacity=".55"/>
          <rect x="0" y="30" width="64" height="4" fill="#f2e6c8" opacity=".85"/><rect x="30" y="0" width="4" height="64" fill="#f2e6c8" opacity=".75"/>
          <rect x="0" y="6" width="64" height="2" fill="#1c2a4a" opacity=".6"/><rect x="6" y="0" width="2" height="64" fill="#1c2a4a" opacity=".5"/>
        </pattern>
        <!-- верхний плед: светлая сине-кремовая клетка -->
        <pattern id="pcGingham" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-4)">
          <rect width="56" height="56" fill="#f1ead8"/>
          <rect x="0" y="0" width="56" height="28" fill="#5c86b8" opacity=".33"/><rect x="0" y="0" width="28" height="56" fill="#5c86b8" opacity=".33"/>
          <rect x="0" y="13" width="56" height="2" fill="#2f4f7c" opacity=".25"/><rect x="13" y="0" width="2" height="56" fill="#2f4f7c" opacity=".25"/>
        </pattern>
        <radialGradient id="pcSun" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="#fff6d8" stop-opacity=".22"/><stop offset=".6" stop-color="#fff6d8" stop-opacity="0"/><stop offset="1" stop-color="#2a1c08" stop-opacity=".35"/></radialGradient>
        <linearGradient id="pcFolds" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".3" stop-color="#000" stop-opacity=".1"/><stop offset=".34" stop-color="#fff" stop-opacity=".08"/><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".09"/><stop offset=".74" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
        <radialGradient id="pcTea" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#c08a4a"/><stop offset=".7" stop-color="#8a5a26"/><stop offset="1" stop-color="#5a3812"/></radialGradient>
      </defs>
      <path d="${blanketPath(512, 312, .012, 1)}" transform="translate(0 6)" fill="#1c1408" opacity=".35" filter="url(#pcSoft)"/>
      ${fringe(506, 306)}
      <path d="${blanketPath(510, 310, .012, 1)}" fill="url(#pcTartan)"/>
      <path d="${blanketPath(510, 310, .012, 1)}" fill="url(#pcSun)"/>
      <g class="neon">
        <ellipse class="neon-glow" cx="${cx}" cy="${cy}" rx="500" ry="300" fill="none" stroke-width="26" filter="url(#neonBlur)"/>
        <ellipse class="neon-line" cx="${cx}" cy="${cy}" rx="492" ry="292" fill="none" stroke-width="2"/>
      </g>
      <path d="${blanketPath(478, 280, .01, 4)}" transform="translate(2 5)" fill="#1c1408" opacity=".4" filter="url(#pcSoft)"/>
      <path d="${blanketPath(476, 278, .01, 4)}" fill="url(#pcGingham)"/>
      <path d="${blanketPath(476, 278, .01, 4)}" fill="url(#pcFolds)"/>
      <path d="${blanketPath(476, 278, .01, 4)}" fill="url(#pcSun)"/>
      <path d="${blanketPath(470, 272, .01, 4)}" fill="none" stroke="#2f4f7c" stroke-opacity=".35" stroke-width="2" stroke-dasharray="6 6"/>
      ${sandwiches(170, 430)}${fruit(830, 432)}
      <path class="neon-arc" d="" fill="none" stroke-width="9" stroke-linecap="round" filter="url(#neonBlur)"/>
      <path class="neon-arc-core" d="" fill="none" stroke-width="3" stroke-linecap="round"/>
      ${angles.map((d, i) => mug(d, i)).join('')}
      ${SIDE_SPOTS.map(([x, y], i) => `<circle class="side-spot" data-i="${i}" cx="${x}" cy="${y}" r="14" fill="none"/>`).join('')}`;
  }

  // Место игрока: сложенный в несколько слоёв плед, цвет — по месту за столом.
  const SEATS = { left: ['#d9534f', '#a93a36'], tl: ['#4f86c6', '#356095'], top: ['#5aa36a', '#3d7a4b'], tr: ['#e6a93a', '#b47f1e'], right: ['#9067c6', '#6a4699'], me: ['#c98a5a', '#9a6438'] };
  function chair(spot) {
    const [c1, c2] = SEATS[spot] || SEATS.me, id = 'pcs' + spot;
    const layer = (dy, w, op) => `<rect x="${80 - w / 2}" y="${36 + dy}" width="${w}" height="92" rx="14" fill="${c1}" stroke="${c2}" stroke-width="3" opacity="${op}"/>`;
    return `<svg viewBox="0 0 160 160">
      <defs><pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="none"/><rect y="8" width="20" height="4" fill="#fff" opacity=".22"/><rect x="8" width="4" height="20" fill="#fff" opacity=".18"/><rect y="0" width="20" height="2" fill="#000" opacity=".12"/></pattern></defs>
      <rect x="18" y="46" width="128" height="96" rx="16" fill="#1c1408" opacity=".3"/>
      ${layer(10, 124, 1)}${layer(4, 120, 1)}
      <rect x="22" y="32" width="116" height="92" rx="14" fill="${c1}" stroke="${c2}" stroke-width="3"/>
      <rect x="22" y="32" width="116" height="92" rx="14" fill="url(#${id})"/>
      <path d="M 30 40 Q 80 30 130 40" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>
      <g stroke="#f2e6c8" stroke-width="2" stroke-linecap="round" opacity=".8">${Array.from({ length: 12 }, (_, k) => `<path d="M ${28 + k * 9.5} 124 L ${28 + k * 9.5} 132"/>`).join('')}</g>
    </svg>`;
  }

  // Декор поверх фона не нужен — всё на картинке поляны.
  function deco() { return ''; }

  root.RoomPicnic = { tableBase, chair, deco };
})(typeof window !== 'undefined' ? window : globalThis);
