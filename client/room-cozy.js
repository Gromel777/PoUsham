// Комната «Пижамная вечеринка»: домашний деревянный стол, плетёный коврик, подушки вместо кресел,
// кружки какао, гирлянда и тёплый мягкий свет. Отдаёт только разметку — логика стола общая.
(function (root) {
  const cx = 500, cy = 300;
  const ell = (rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  const f = n => n.toFixed(1);
  const MUGS = [['#f3e6d0', '#d9c7a8'], ['#f2b8c6', '#d98ea2'], ['#b9e0cf', '#8fc2ad'], ['#b8d2f0', '#8eb0d8'], ['#d8c4ef', '#b39dd6'], ['#f6dc8e', '#dbb860']];

  // Кружка какао с зефирками — по одной перед каждым игроком (в неё же закатывается шар хода).
  function mug(deg, i) {
    const a = deg * Math.PI / 180, [x, y] = ell(408, 226, a);
    const [c1, c2] = MUGS[i % MUGS.length];
    const hx = Math.cos(a) * 40, hy = Math.sin(a) * 29; // ручка смотрит к игроку
    let mm = '';
    for (let k = 0; k < 3; k++) { const b = k * 2.1 + i; mm += `<rect x="${f(Math.cos(b) * 12 - 5)}" y="${f(Math.sin(b) * 7 - 4)}" width="10" height="8" rx="2.2" fill="#fffaf2" stroke="#e6d6c3" stroke-width=".8" transform="rotate(${(k * 37 + i * 20) % 90} ${f(Math.cos(b) * 9)} ${f(Math.sin(b) * 5)})"/>`; }
    return `<g class="cup" data-a="${deg}" transform="translate(${f(x)} ${f(y)})">
      <ellipse cx="4" cy="8" rx="40" ry="27" fill="#2a1408" opacity=".35" filter="url(#czSoft)"/>
      <ellipse cx="${f(hx)}" cy="${f(hy)}" rx="11" ry="9" fill="none" stroke="${c2}" stroke-width="6"/>
      <ellipse rx="36" ry="26" fill="${c1}" stroke="${c2}" stroke-width="3"/>
      <ellipse rx="33" ry="23" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>
      <ellipse rx="29" ry="20" fill="url(#czCocoa)"/>
      <ellipse cx="-8" cy="-7" rx="11" ry="5" fill="#fff" opacity=".16"/>
      ${mm}
    </g>`;
  }

  // Салфетка-«снежинка» по центру: связанная крючком, еле заметная.
  function doily() {
    const R = 150, n = 32;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const p0 = [Math.cos(a0) * R, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, Math.sin(a1) * R], pm = [Math.cos(am) * (R + 16), Math.sin(am) * (R + 16)];
      d += (i ? '' : `M ${f(p0[0])} ${f(p0[1])} `) + `Q ${f(pm[0])} ${f(pm[1])} ${f(p1[0])} ${f(p1[1])} `;
    }
    let holes = '';
    for (const [r, k, s] of [[128, 32, 4.2], [100, 24, 5], [70, 16, 5.5], [40, 10, 4.5]]) for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + r; holes += `<circle cx="${f(Math.cos(a) * r)}" cy="${f(Math.sin(a) * r)}" r="${s}"/>`; }
    let petals = '';
    for (let i = 0; i < 8; i++) petals += `<ellipse rx="10" ry="26" transform="rotate(${i * 45}) translate(0 -22)"/>`;
    return `<g transform="translate(${cx} ${cy}) scale(1 .6)" opacity=".2">
      <path d="${d}Z" fill="#fff8ea"/>
      <g fill="#9a6a3c">${holes}</g>
      <circle r="114" fill="none" stroke="#9a6a3c" stroke-width="2" stroke-dasharray="3 5"/>
      <circle r="56" fill="none" stroke="#9a6a3c" stroke-width="2" stroke-dasharray="3 5"/>
      <g fill="none" stroke="#9a6a3c" stroke-width="2.5">${petals}</g>
    </g>`;
  }

  // Миска попкорна и тарелка печенья на свободных краях стола.
  function popcorn(x, y) {
    let k = '';
    for (let i = 0; i < 26; i++) { const a = i * 2.4, r = Math.sqrt(i / 26) * 30; k += `<circle cx="${f(Math.cos(a) * r)}" cy="${f(Math.sin(a) * r * .7 - 3)}" r="${f(5.5 + (i % 3))}" fill="${['#fff7e0', '#fbe8b8', '#f4d58c'][i % 3]}" stroke="#d8b46a" stroke-width=".6"/>`; }
    return `<g transform="translate(${x} ${y})"><ellipse cx="4" cy="8" rx="46" ry="30" fill="#2a1408" opacity=".4" filter="url(#czSoft)"/>
      <ellipse rx="44" ry="29" fill="#d64b4b"/><ellipse rx="44" ry="29" fill="url(#czStripes)"/><ellipse rx="37" ry="23" fill="#7a2a20"/>${k}</g>`;
  }
  function cookies(x, y) {
    const one = (dx, dy, r, s) => `<g transform="translate(${dx} ${dy}) rotate(${s})"><ellipse rx="${r}" ry="${f(r * .72)}" fill="#c98a4a" stroke="#a5682f" stroke-width="1.2"/>
      <ellipse cx="-2" cy="-2" rx="${f(r * .7)}" ry="${f(r * .45)}" fill="#dda362" opacity=".6"/>
      ${[[-5, -3], [4, -4], [-1, 3], [6, 3], [-7, 2]].map(([a, b]) => `<ellipse cx="${a * r / 15}" cy="${b * r / 15}" rx="2.2" ry="1.6" fill="#4a2614"/>`).join('')}</g>`;
    return `<g transform="translate(${x} ${y})"><ellipse cx="4" cy="8" rx="46" ry="29" fill="#2a1408" opacity=".4" filter="url(#czSoft)"/>
      <ellipse rx="44" ry="28" fill="#fbf6ee" stroke="#d9cbb5" stroke-width="2"/><ellipse rx="33" ry="20" fill="none" stroke="#9cc3d8" stroke-width="2" stroke-dasharray="4 3"/>
      ${one(-12, -3, 15, 10)}${one(12, -6, 14, -20)}${one(2, 8, 15, 40)}</g>`;
  }

  // Плетёный круглый коврик под столом.
  function rug() {
    const cols = ['#d98e7e', '#e9c9a8', '#9bb8a6', '#e7d7b9', '#c9a2b8', '#e9c9a8', '#d98e7e', '#9bb8a6', '#e7d7b9'];
    let rings = '';
    cols.forEach((c, i) => {
      const rx = 690 - i * 22, ry = 440 - i * 14;
      rings += `<ellipse cx="${cx}" cy="${cy + 40}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="20"/>
        <ellipse cx="${cx}" cy="${cy + 40}" rx="${rx}" ry="${ry}" fill="none" stroke="#5a3a28" stroke-opacity=".28" stroke-width="20" stroke-dasharray="7 9"/>`;
    });
    return `<g class="cz-rug" opacity=".9"><ellipse cx="${cx}" cy="${cy + 40}" rx="700" ry="450" fill="#e7d7b9"/>${rings}
      <ellipse cx="${cx}" cy="${cy + 40}" rx="${690 - cols.length * 22}" ry="${440 - cols.length * 14}" fill="#efe1c6"/>
      <ellipse cx="${cx}" cy="${cy + 40}" rx="700" ry="450" fill="url(#czRugShade)"/></g>`;
  }

  // Основа стола: всё, что до общего шара хода (его разметку подставляет client.js).
  function tableBase(angles, SIDE_SPOTS) {
    const lowerArc = dy => `M ${cx - 496} ${cy + dy} A 496 296 0 0 0 ${cx + 496} ${cy + dy}`;
    const sideBand = (y0, y1) => `M ${cx - 496} ${cy + y0} A 496 296 0 0 0 ${cx + 496} ${cy + y0} L ${cx + 496} ${cy + y1} A 496 296 0 0 1 ${cx - 496} ${cy + y1} Z`;
    let seams = '';
    for (let y = cy - 296 + 66; y < cy + 296; y += 66) seams += `<path d="M ${cx - 500} ${y} L ${cx + 500} ${y}" stroke="#4a2a14" stroke-opacity=".55" stroke-width="2.2"/><path d="M ${cx - 500} ${y + 2} L ${cx + 500} ${y + 2}" stroke="#ffe2b0" stroke-opacity=".12" stroke-width="1.5"/>`;
    return `<svg class="tbl" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <filter id="czSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
        <filter id="czFloor" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="18"/></filter>
        <filter id="neonBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="czGrain" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><feTurbulence type="fractalNoise" baseFrequency="0.0035 0.075" numOctaves="3" seed="11"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .17  0 0 0 0 .07  0 0 0 1.3 -.45"/><feComposite in2="SourceGraphic" operator="in"/></filter>
        <filter id="czKnots" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.18" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .1  0 0 0 0 .04  0 0 0 2.2 -1.25"/><feComposite in2="SourceGraphic" operator="in"/></filter>
        <linearGradient id="czWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cf9a62"/><stop offset=".5" stop-color="#bb8452"/><stop offset="1" stop-color="#9c6b3e"/></linearGradient>
        <radialGradient id="czTopLight" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".45"/><stop offset=".55" stop-color="#ffb870" stop-opacity=".08"/><stop offset="1" stop-color="#3a1a08" stop-opacity=".45"/></radialGradient>
        <linearGradient id="czSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1e0e"/><stop offset=".2" stop-color="#7a4523"/><stop offset=".5" stop-color="#94572d"/><stop offset=".8" stop-color="#7a4523"/><stop offset="1" stop-color="#3a1e0e"/></linearGradient>
        <linearGradient id="czSideV" x1="0" y1="0" x2="0" y2="1"><stop offset=".75" stop-color="#000" stop-opacity=".55"/><stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
        <radialGradient id="czCocoa" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#8a5634"/><stop offset=".7" stop-color="#5e3520"/><stop offset="1" stop-color="#3e2214"/></radialGradient>
        <radialGradient id="czRugShade" cx=".5" cy=".45" r=".55"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a0c04" stop-opacity=".55"/></radialGradient>
        <pattern id="czStripes" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="8" height="16" fill="#fff4ec"/></pattern>
        <clipPath id="czTopClip"><ellipse cx="${cx}" cy="${cy}" rx="478" ry="280"/></clipPath>
      </defs>
      ${rug()}
      <ellipse cx="${cx}" cy="${cy + 64}" rx="520" ry="300" fill="#1a0c04" opacity=".55" filter="url(#czFloor)"/>
      <path d="${sideBand(0, 40)}" fill="url(#czSide)"/>
      <path d="${sideBand(0, 40)}" fill="url(#czSideV)"/>
      <path d="${lowerArc(38)}" fill="none" stroke="#2a1408" stroke-width="3" stroke-opacity=".6"/>
      <g class="neon">
        <ellipse class="neon-glow" cx="${cx}" cy="${cy}" rx="500" ry="300" fill="none" stroke-width="26" filter="url(#neonBlur)"/>
        <ellipse class="neon-line" cx="${cx}" cy="${cy}" rx="498" ry="298" fill="none" stroke-width="2"/>
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="496" ry="296" fill="#8a5028"/>
      <ellipse cx="${cx}" cy="${cy}" rx="490" ry="290" fill="#b8763f"/>
      <ellipse cx="${cx}" cy="${cy}" rx="478" ry="280" fill="url(#czWood)"/>
      <g clip-path="url(#czTopClip)">
        <rect width="1000" height="600" fill="#fff" filter="url(#czGrain)" opacity=".85"/>
        <rect width="1000" height="600" fill="#fff" filter="url(#czKnots)" opacity=".5"/>
        ${seams}
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="478" ry="280" fill="url(#czTopLight)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="484" ry="285" fill="none" stroke="#ffd9a6" stroke-opacity=".35" stroke-width="3"/>
      <path d="M ${cx - 420} ${cy - 130} Q ${cx} ${cy - 320} ${cx + 420} ${cy - 130}" fill="none" stroke="#fff3dc" stroke-opacity=".13" stroke-width="18" stroke-linecap="round"/>
      ${doily()}
      ${popcorn(150, 440)}${cookies(850, 440)}
      <path class="neon-arc" d="" fill="none" stroke-width="9" stroke-linecap="round" filter="url(#neonBlur)"/>
      <path class="neon-arc-core" d="" fill="none" stroke-width="3" stroke-linecap="round"/>
      ${angles.map((d, i) => mug(d, i)).join('')}
      ${SIDE_SPOTS.map(([x, y], i) => `<circle class="side-spot" data-i="${i}" cx="${x}" cy="${y}" r="14" fill="none"/>`).join('')}`;
  }

  // Подушка вместо кресла: пухлая, со стяжкой-пуговкой и кантом; цвет — по месту за столом.
  const PILLOWS = { left: ['#f2b3c2', '#d98ea2'], tl: ['#b8d2f0', '#8eb0d8'], top: ['#bfe0b8', '#93c28b'], tr: ['#f6dc8e', '#d9b75e'], right: ['#d8c4ef', '#b39dd6'], me: ['#f3e0c8', '#d6bd9b'] };
  function chair(spot) {
    const [c1, c2] = PILLOWS[spot] || PILLOWS.me, id = 'pl' + spot;
    const body = 'M 24 30 Q 80 14 136 30 Q 150 80 136 130 Q 80 146 24 130 Q 10 80 24 30 Z';
    return `<svg viewBox="0 0 160 160">
      <defs><radialGradient id="${id}" cx=".42" cy=".36" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="${c1}" stop-opacity="0"/><stop offset="1" stop-color="#3a1a08" stop-opacity=".35"/></radialGradient></defs>
      <path d="${body}" fill="${c1}"/>
      <path d="${body}" fill="url(#${id})"/>
      <path d="${body}" fill="none" stroke="${c2}" stroke-width="5"/>
      <path d="${body}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="4 4" transform="translate(80 80) scale(.9) translate(-80 -80)"/>
      <g stroke="${c2}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"><path d="M 80 80 Q 60 62 40 46"/><path d="M 80 80 Q 100 62 120 46"/><path d="M 80 80 Q 60 98 40 114"/><path d="M 80 80 Q 100 98 120 114"/></g>
      <circle cx="80" cy="80" r="8" fill="${c2}"/><circle cx="78" cy="78" r="3" fill="#fff" opacity=".5"/>
    </svg>`;
  }

  // Декор комнаты поверх фона: гирлянда-«лампочки» сверху и мягкие блики.
  function deco() {
    const bulbs = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = -20 + t * 1640;
      const y = 26 + Math.sin(t * Math.PI * 2) ** 2 * 70 + Math.sin(t * Math.PI) * 20;
      bulbs.push([x, y]);
    }
    const wire = 'M ' + bulbs.map(([x, y]) => `${f(x)} ${f(y - 8)}`).join(' L ');
    const cols = ['#ffd27a', '#ffb3a1', '#fff0c2', '#ffc46b', '#f7b8d8'];
    return `<svg class="cz-garland" viewBox="0 0 1600 200" preserveAspectRatio="xMidYMin slice">
      <defs><filter id="czBulb" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="9"/></filter></defs>
      <path d="${wire}" fill="none" stroke="#2a1a10" stroke-width="2.2" stroke-linejoin="round"/>
      ${bulbs.map(([x, y], i) => `<g class="cz-bulb" style="animation-delay:${((i * 0.37) % 3).toFixed(2)}s"><circle cx="${f(x)}" cy="${f(y + 4)}" r="18" fill="${cols[i % cols.length]}" opacity=".55" filter="url(#czBulb)"/>
        <rect x="${f(x - 3)}" y="${f(y - 10)}" width="6" height="6" rx="1" fill="#3a2a1c"/><ellipse cx="${f(x)}" cy="${f(y + 3)}" rx="5.5" ry="8" fill="${cols[i % cols.length]}"/><ellipse cx="${f(x - 1.5)}" cy="${f(y)}" rx="1.6" ry="3" fill="#fff" opacity=".8"/></g>`).join('')}
    </svg>`;
  }

  root.RoomCozy = { tableBase, chair, deco };
})(typeof window !== 'undefined' ? window : globalThis);
