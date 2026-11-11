// Комната «Переговорка»: овальный стол для совещаний из ореха, офисные кресла на колёсиках,
// кофе на блюдцах, спикерфон, ноутбук и стикеры, ковролин и холодный свет панелей.
// Отдаёт только разметку — логика стола общая (как room-cozy.js).
(function (root) {
  const cx = 500, cy = 300;
  const ell = (rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  const f = n => n.toFixed(1);

  // Чашка кофе на блюдце — перед каждым игроком (в неё закатывается шар хода).
  function cup(deg, i) {
    const a = deg * Math.PI / 180, [x, y] = ell(408, 226, a);
    const hx = Math.cos(a) * 33, hy = Math.sin(a) * 24; // ручка смотрит к игроку
    const art = i % 2
      ? `<path d="M0 6 C -9 -1 -8 -9 -2 -8 C 0 -8 0 -6 0 -5 C 0 -6 0 -8 2 -8 C 8 -9 9 -1 0 6 Z" fill="#f1dcc0" opacity=".9"/>`
      : `<ellipse rx="9" ry="6" fill="none" stroke="#f1dcc0" stroke-width="2.4" opacity=".85"/><ellipse rx="3.5" ry="2.4" fill="#f1dcc0" opacity=".85"/>`;
    return `<g class="cup" data-a="${deg}" transform="translate(${f(x)} ${f(y)})">
      <ellipse cx="4" cy="8" rx="44" ry="30" fill="#05070a" opacity=".45" filter="url(#ofSoft)"/>
      <ellipse rx="42" ry="29" fill="#f4f6f8" stroke="#c9ced6" stroke-width="2"/>
      <ellipse rx="34" ry="23" fill="none" stroke="#dfe3e8" stroke-width="2"/>
      <ellipse cx="${f(hx)}" cy="${f(hy)}" rx="10" ry="8" fill="none" stroke="#e9ecf0" stroke-width="6"/>
      <ellipse cx="2" cy="4" rx="29" ry="21" fill="#0b0d10" opacity=".25" filter="url(#ofSoft)"/>
      <ellipse rx="28" ry="20" fill="#fbfcfd" stroke="#d5dae1" stroke-width="2"/>
      <ellipse rx="23" ry="16" fill="url(#ofCoffee)"/>
      ${art}
      <ellipse cx="-9" cy="-9" rx="10" ry="3.5" fill="#fff" opacity=".5"/>
    </g>`;
  }

  // Спикерфон для созвонов по центру стола.
  function speaker() {
    const tri = 'M 0 -46 Q 6 -46 10 -39 L 44 20 Q 47 27 40 28 L -40 28 Q -47 27 -44 20 L -10 -39 Q -6 -46 0 -46 Z';
    return `<g transform="translate(${cx} ${cy}) scale(1 .62)">
      <path d="${tri}" transform="translate(5 10)" fill="#05070a" opacity=".5" filter="url(#ofSoft)"/>
      <path d="${tri}" fill="url(#ofSpeaker)" stroke="#0e1014" stroke-width="2"/>
      <path d="${tri}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.5" transform="scale(.9)"/>
      ${[[0, -30], [-28, 18], [28, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#0b0c0f"/><circle cx="${x}" cy="${y}" r="1.6" fill="#555b66"/>`).join('')}
      <circle r="11" fill="#14171c" stroke="#3a3f48" stroke-width="1.5"/>
      <circle r="5" fill="#45e09a" class="of-led"/><circle r="11" fill="#45e09a" opacity=".25" filter="url(#ofSoft)" class="of-led"/>
    </g>`;
  }

  // Мелочи на краях: закрытый ноутбук, блокнот с ручкой, стикеры.
  function laptop(x, y) {
    return `<g transform="translate(${x} ${y}) rotate(-14)">
      <rect x="-56" y="-34" width="116" height="76" rx="8" fill="#05070a" opacity=".45" filter="url(#ofSoft)"/>
      <rect x="-60" y="-40" width="120" height="78" rx="7" fill="url(#ofAlu)" stroke="#8a919c" stroke-width="1.5"/>
      <rect x="-60" y="31" width="120" height="7" rx="3" fill="#9aa1ab"/>
      <circle cx="0" cy="-2" r="8" fill="none" stroke="#c9ced6" stroke-width="2" opacity=".7"/>
      <path d="M -50 -34 L 10 -34" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
    </g>`;
  }
  function notepad(x, y) {
    let lines = '';
    for (let k = 0; k < 6; k++) lines += `<path d="M -26 ${-22 + k * 9} L 28 ${-22 + k * 9}" stroke="#9ab6d6" stroke-width="1.2"/>`;
    return `<g transform="translate(${x} ${y}) rotate(10)">
      <rect x="-34" y="-38" width="72" height="88" rx="4" fill="#05070a" opacity=".4" filter="url(#ofSoft)"/>
      <rect x="-36" y="-42" width="72" height="88" rx="3" fill="#fbfaf4" stroke="#d9d6c8" stroke-width="1.5"/>
      <rect x="-36" y="-42" width="72" height="9" rx="2" fill="#2c3e5c"/>
      ${lines}
      <path d="M -18 -14 C -10 -20 -2 -10 6 -16 S 18 -14 22 -18" fill="none" stroke="#2c4fa8" stroke-width="1.6" stroke-linecap="round"/>
      <g transform="translate(46 4) rotate(-28)"><rect x="-4" y="-40" width="8" height="78" rx="4" fill="#1c3f9e"/><path d="M -4 38 L 0 50 L 4 38 Z" fill="#c9ced6"/><rect x="-1.5" y="-36" width="3" height="26" rx="1.5" fill="#c9ced6"/></g>
    </g>`;
  }
  function stickies(x, y) {
    const one = (dx, dy, c, r, txt) => `<g transform="translate(${dx} ${dy}) rotate(${r})"><rect x="-17" y="-15" width="36" height="34" fill="#05070a" opacity=".35" filter="url(#ofSoft)"/><rect x="-18" y="-18" width="36" height="34" fill="${c}"/>
      <rect x="-18" y="-18" width="36" height="7" fill="#000" opacity=".06"/>${txt}</g>`;
    const scribble = '<path d="M -11 -4 L 10 -4 M -11 3 L 6 3 M -11 10 L 9 10" stroke="#5a4a2a" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>';
    return `<g transform="translate(${x} ${y})">${one(0, 0, '#ffe46b', -8, scribble)}${one(30, 10, '#ff9fc0', 12, '<path d="M -8 0 L -2 7 L 10 -8" fill="none" stroke="#7a2a48" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')}${one(8, 34, '#9fe0c6', 4, scribble)}</g>`;
  }

  // Основа стола: всё, что до общего шара хода (его разметку подставляет client.js).
  function tableBase(angles, SIDE_SPOTS) {
    const lowerArc = dy => `M ${cx - 496} ${cy + dy} A 496 296 0 0 0 ${cx + 496} ${cy + dy}`;
    const sideBand = (y0, y1) => `M ${cx - 496} ${cy + y0} A 496 296 0 0 0 ${cx + 496} ${cy + y0} L ${cx + 496} ${cy + y1} A 496 296 0 0 1 ${cx - 496} ${cy + y1} Z`;
    return `<svg class="tbl" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <filter id="ofSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
        <filter id="ofFloor" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="20"/></filter>
        <filter id="neonBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="ofGrain" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><feTurbulence type="fractalNoise" baseFrequency="0.0022 0.11" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .06  0 0 0 0 .02  0 0 0 1.5 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter>
        <linearGradient id="ofWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6e4a2e"/><stop offset=".5" stop-color="#5a3a22"/><stop offset="1" stop-color="#432a18"/></linearGradient>
        <radialGradient id="ofTopLight" cx=".5" cy=".38" r=".65"><stop offset="0" stop-color="#e6f0ff" stop-opacity=".18"/><stop offset=".6" stop-color="#e6f0ff" stop-opacity="0"/><stop offset="1" stop-color="#05070a" stop-opacity=".5"/></radialGradient>
        <linearGradient id="ofSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#15100b"/><stop offset=".25" stop-color="#3a2717"/><stop offset=".5" stop-color="#4a3220"/><stop offset=".75" stop-color="#3a2717"/><stop offset="1" stop-color="#15100b"/></linearGradient>
        <linearGradient id="ofSideV" x1="0" y1="0" x2="0" y2="1"><stop offset=".75" stop-color="#000" stop-opacity=".55"/><stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
        <linearGradient id="ofAlu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2e6eb"/><stop offset=".5" stop-color="#c3c9d1"/><stop offset="1" stop-color="#a7aeb8"/></linearGradient>
        <linearGradient id="ofSpeaker" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f48"/><stop offset="1" stop-color="#1b1e23"/></linearGradient>
        <radialGradient id="ofCoffee" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#b07848"/><stop offset=".55" stop-color="#7a4a26"/><stop offset="1" stop-color="#3c2210"/></radialGradient>
        <clipPath id="ofTopClip"><ellipse cx="${cx}" cy="${cy}" rx="484" ry="285"/></clipPath>
      </defs>
      <ellipse cx="${cx}" cy="${cy + 66}" rx="530" ry="305" fill="#05070a" opacity=".6" filter="url(#ofFloor)"/>
      <path d="${sideBand(0, 38)}" fill="url(#ofSide)"/>
      <path d="${sideBand(0, 38)}" fill="url(#ofSideV)"/>
      <path d="${lowerArc(6)}" fill="none" stroke="#c9ced6" stroke-opacity=".55" stroke-width="3"/>
      <path d="${lowerArc(36)}" fill="none" stroke="#000" stroke-width="3" stroke-opacity=".6"/>
      <g class="neon">
        <ellipse class="neon-glow" cx="${cx}" cy="${cy}" rx="500" ry="300" fill="none" stroke-width="26" filter="url(#neonBlur)"/>
        <ellipse class="neon-line" cx="${cx}" cy="${cy}" rx="498" ry="298" fill="none" stroke-width="2"/>
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="496" ry="296" fill="#2a1b10"/>
      <ellipse cx="${cx}" cy="${cy}" rx="491" ry="291" fill="#b8bec7"/>
      <ellipse cx="${cx}" cy="${cy}" rx="487" ry="287" fill="#3a2717"/>
      <ellipse cx="${cx}" cy="${cy}" rx="484" ry="285" fill="url(#ofWood)"/>
      <g clip-path="url(#ofTopClip)">
        <rect width="1000" height="600" fill="#fff" filter="url(#ofGrain)" opacity=".9"/>
        <g fill="#fff" opacity=".07"><path d="M 120 600 L 380 0 L 470 0 L 210 600 Z"/><path d="M 260 600 L 520 0 L 545 0 L 285 600 Z"/><path d="M 640 600 L 900 0 L 990 0 L 730 600 Z"/></g>
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="484" ry="285" fill="url(#ofTopLight)"/>
      <path d="M ${cx - 400} ${cy - 160} Q ${cx} ${cy - 330} ${cx + 400} ${cy - 160}" fill="none" stroke="#f2f6ff" stroke-opacity=".12" stroke-width="14" stroke-linecap="round"/>
      ${speaker()}
      ${laptop(160, 440)}${notepad(850, 436)}${stickies(250, 395)}
      <path class="neon-arc" d="" fill="none" stroke-width="9" stroke-linecap="round" filter="url(#neonBlur)"/>
      <path class="neon-arc-core" d="" fill="none" stroke-width="3" stroke-linecap="round"/>
      ${angles.map((d, i) => cup(d, i)).join('')}
      ${SIDE_SPOTS.map(([x, y], i) => `<circle class="side-spot" data-i="${i}" cx="${x}" cy="${y}" r="14" fill="none"/>`).join('')}`;
  }

  // Офисное кресло сверху: спинка-сетка (наружу от стола), сиденье, подлокотники, крестовина на колёсиках.
  function chair() {
    let legs = '';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 2, x = 80 + Math.cos(a) * 66, y = 90 + Math.sin(a) * 66;
      legs += `<path d="M 80 90 L ${f(x)} ${f(y)}" stroke="#7c8491" stroke-width="9" stroke-linecap="round"/><circle cx="${f(x)}" cy="${f(y)}" r="7" fill="#111316" stroke="#3a3f48" stroke-width="2"/>`;
    }
    let mesh = '';
    for (let k = 0; k < 9; k++) mesh += `<path d="M ${30 + k * 12.5} 20 L ${30 + k * 12.5} 50" stroke="#fff" stroke-opacity=".12" stroke-width="1.2"/>`;
    return `<svg viewBox="0 0 160 160">
      <defs>
        <linearGradient id="ofSeat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6472"/><stop offset="1" stop-color="#363c47"/></linearGradient>
        <linearGradient id="ofBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5361"/><stop offset="1" stop-color="#262b33"/></linearGradient>
      </defs>
      ${legs}
      <rect x="16" y="66" width="16" height="54" rx="8" fill="#2a2f37" stroke="#6a727f" stroke-width="2"/>
      <rect x="128" y="66" width="16" height="54" rx="8" fill="#2a2f37" stroke="#6a727f" stroke-width="2"/>
      <rect x="32" y="52" width="96" height="86" rx="28" fill="url(#ofSeat)" stroke="#0b0c0f" stroke-width="2.5"/>
      <rect x="40" y="60" width="80" height="70" rx="22" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
      <path d="M 22 50 Q 80 4 138 50 L 132 58 Q 80 22 28 58 Z" fill="url(#ofBack)" stroke="#0b0c0f" stroke-width="2"/>
      <path d="M 26 46 Q 80 6 134 46" fill="none" stroke="#8d96a4" stroke-width="2.5" stroke-linecap="round"/>
      <g clip-path="none">${mesh}</g>
    </svg>`;
  }

  // Декор: светодиодные панели на потолке (мягкое холодное свечение сверху).
  function deco() {
    const panel = x => `<g><rect x="${x - 120}" y="-40" width="240" height="70" rx="6" fill="#eaf3ff" opacity=".35" filter="url(#ofPanel)"/>
      <rect x="${x - 100}" y="-30" width="200" height="40" rx="4" fill="#f4f8ff" opacity=".55"/></g>`;
    return `<svg class="of-ceiling" viewBox="0 0 1600 200" preserveAspectRatio="xMidYMin slice">
      <defs><filter id="ofPanel" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="22"/></filter></defs>
      ${panel(420)}${panel(1180)}
    </svg>`;
  }

  root.RoomOffice = { tableBase, chair, deco };
})(typeof window !== 'undefined' ? window : globalThis);
