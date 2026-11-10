// Масштабирование «В Точку»: вся игра рисуется на виртуальном экране расчётной высоты 390
// (и ширины не меньше 760), а затем целиком вписывается в реальный экран.
// Так пропорции одинаковы на любом телефоне, планшете и мониторе — ничего не наползает и не уходит за край.
'use strict';
(function (root) {
  const BASE_H = 390, MIN_W = 760;
  const VIEW = { w: BASE_H * 2, h: BASE_H, s: 1 };
  function update() {
    const W = root.innerWidth, H = root.innerHeight;
    const s = Math.max(0.4, Math.min(3, H / BASE_H, W / MIN_W));
    VIEW.s = s; VIEW.w = W / s; VIEW.h = H / s;
    const st = document.documentElement.style;
    st.setProperty('--s', s.toFixed(4));
    st.setProperty('--app-w', VIEW.w.toFixed(2) + 'px');
    st.setProperty('--app-h', VIEW.h.toFixed(2) + 'px');
    st.setProperty('--VW', (VIEW.w / 100).toFixed(3) + 'px');
    st.setProperty('--VH', (VIEW.h / 100).toFixed(3) + 'px');
  }
  // Прямоугольник элемента в виртуальных координатах.
  VIEW.rect = el => {
    const r = el.getBoundingClientRect(), s = VIEW.s;
    return { left: r.left / s, top: r.top / s, width: r.width / s, height: r.height / s };
  };
  VIEW.center = el => { const r = VIEW.rect(el); return [r.left + r.width / 2, r.top + r.height / 2]; };
  VIEW.update = update;
  update();
  // Обновляем раньше остальных обработчиков resize (этот скрипт подключается первым).
  root.addEventListener('resize', update);
  root.addEventListener('orientationchange', () => setTimeout(() => { update(); root.dispatchEvent(new Event('resize')); }, 250));
  root.VIEW = VIEW;
})(window);
