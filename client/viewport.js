// Масштабирование «В Точку»: вся игра рисуется на виртуальном экране расчётной высоты 488
// (и ширины не меньше 950), а затем целиком вписывается в реальный экран через CSS zoom —
// браузер перерисовывает всё в родном разрешении экрана, поэтому картинка остаётся чёткой.
// Так пропорции одинаковы на любом телефоне, планшете и мониторе — ничего не наползает и не уходит за край.
'use strict';
(function (root) {
  const BASE_H = 488, MIN_W = 950;
  const useZoom = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '2');
  let rectK = 1; // во сколько раз getBoundingClientRect больше виртуальных координат
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
    const app = document.getElementById('app');
    if (app) {
      if (useZoom) { app.style.zoom = s; app.style.transform = ''; }
      else { app.style.zoom = ''; app.style.transform = `scale(${s})`; app.style.transformOrigin = '0 0'; }
      // Проверяем, в каких единицах браузер отдаёт координаты (разные браузеры по-разному учитывают zoom).
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none';
      app.appendChild(probe);
      rectK = probe.getBoundingClientRect().width / 100 || 1;
      probe.remove();
    }
  }
  // Прямоугольник элемента в виртуальных координатах.
  VIEW.rect = el => {
    const r = el.getBoundingClientRect(), k = rectK;
    return { left: r.left / k, top: r.top / k, width: r.width / k, height: r.height / k };
  };
  VIEW.center = el => { const r = VIEW.rect(el); return [r.left + r.width / 2, r.top + r.height / 2]; };
  VIEW.update = update;
  update();
  // Обновляем раньше остальных обработчиков resize (этот скрипт подключается первым).
  root.addEventListener('resize', update);
  root.addEventListener('orientationchange', () => setTimeout(() => { update(); root.dispatchEvent(new Event('resize')); }, 250));
  root.VIEW = VIEW;
})(window);
