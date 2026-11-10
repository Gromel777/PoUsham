// Рейтинг «В Точку»: попарное Эло для партии на 2–6 игроков.
// Каждый игрок с аккаунтом сравнивается с каждым другим игроком с аккаунтом по итоговому месту:
// выше — победа (1), вровень — ничья (0.5), ниже — поражение (0). Сумма (факт − ожидание) по всем
// соперникам умножается на K и делится на число соперников. Ушедший из партии считается последним.
'use strict';

const START = 1000;        // стартовый рейтинг
const K = 32;              // насколько сильно одна партия двигает рейтинг
const MIN_RATED = 2;       // партия идёт в рейтинг, если за столом минимум 2 игрока с аккаунтом
const BOARD_MIN_GAMES = 5; // в таблицу лидеров — после 5 партий

// Ключ сравнения: ушедшие ниже всех, остальные — по очкам.
const keyOf = e => (e.left ? -Infinity : e.score);

// Место каждого (1 — лучший). Одинаковые очки — одно место на всех.
function places(entries) {
  return entries.map(e => 1 + entries.filter(o => keyOf(o) > keyOf(e)).length);
}

const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

// entries: [{ rating, score, left }] → изменения рейтинга (целые числа) в том же порядке.
function deltas(entries, k = K) {
  const n = entries.length;
  if (n < 2) return entries.map(() => 0);
  return entries.map((a, i) => {
    let sum = 0;
    entries.forEach((b, j) => {
      if (i === j) return;
      const ka = keyOf(a), kb = keyOf(b);
      const s = ka > kb ? 1 : ka < kb ? 0 : 0.5;
      sum += s - expected(a.rating, b.rating);
    });
    return Math.round((k / (n - 1)) * sum);
  });
}

module.exports = { START, K, MIN_RATED, BOARD_MIN_GAMES, places, deltas, expected };
