// Языки интерфейса: русский (исходный) и английский.
// Ключ перевода — сама русская строка; {x} — подстановки. Сервер присылает тексты по-русски,
// их переводят trServer (ошибки, причины) и trLog (строки журнала).
'use strict';
(function (root) {
  const LANGS = ['ru', 'en'];
  const KEY = 'vtochku-prefs';
  let lang = 'ru';
  try {
    const p = JSON.parse(localStorage.getItem(KEY)) || {};
    lang = LANGS.includes(p.lang) ? p.lang : /^ru|^uk|^be|^kk/i.test(navigator.language || '') ? 'ru' : 'en';
  } catch {}

  const EN = {
    'Вернуться в игру': 'Back to game', 'раунд {a}/{b}': 'round {a}/{b}', 'Скрыть': 'Hide', 'очки': 'points', 'Ход': 'Lead', 'Старшие на стол!': 'Highest on the table!', 'Не нравятся карты? Есть {s} секунд': 'Don’t like your cards? You have {s} seconds', 'заказ': 'bid', '— ни одной!': '— none!', 'ДВОЙНЫЕ ОЧКИ': 'DOUBLE POINTS', 'Все очки раунда — и плюсы, и минусы — удваиваются': 'All points this round — gains and losses — are doubled', 'Замена через {n} с': 'Replace in {n} s', 'Выбранную заранее карту сейчас положить нельзя — выберите другую': 'The pre-selected card can’t be played now — choose another', 'Предвыбор снят': 'Pre-selection cleared', 'Карта выбрана заранее — сыграется, когда дойдёт ваш ход': 'Card pre-selected — it will be played on your turn', 'Сейчас не ваш ход · двойной тап — выбрать карту заранее': 'Not your turn · double-tap to pre-select a card', 'пики': 'spades', 'трефы': 'clubs', 'бубны': 'diamonds', 'червы': 'hearts',
    'Поиск рейтинговой игры': 'Searching ranked game', 'Поиск обычной игры': 'Searching casual game', 'Идёт поиск игры — сначала отмените его': 'Search in progress — cancel it first',
    'Рейтинговая игра': 'Ranked game', 'Создание лобби': 'Create lobby', 'Гость': 'Guest', 'Количество игроков': 'Number of players', 'Любое': 'Any', 'Список лобби': 'Lobby list', 'Без рейтинга. Подберём живых игроков на стол выбранного размера; если за 45 с не набрались — свободные места займут боты. Правила стола — классические.': 'Unrated. We match real players for a table of the chosen size; if not enough join within 45 s, bots take the free seats. Classic table rules.', 'Играть с ботами': 'Play with bots', 'Приватная': 'Private', 'Создать': 'Create', 'Код стола подставлен — нажмите «Войти»': 'Table code filled in — press “Join”', 'Текущий рейтинг': 'Current rating', 'нужен вход через Google': 'Google sign-in required', 'Стол на 4 игрока, 17 раундов, режим обмана. Подбираем соперников близкого рейтинга; если за минуту четверо не набрались — садимся втроём, четвёртое место займёт бот. Рейтинг меняется только между людьми.': '4-player table, 17 rounds, bluff mode. We match opponents of similar rating; if four don’t gather within a minute, three play and a bot takes the fourth seat. Rating changes only between people.', 'Первые 5 партий — калибровка: после них вы попадёте в таблицу лидеров.': 'Your first 5 games are calibration — after them you enter the leaderboard.', 'Войдите в аккаунт': 'Sign in to your account', 'Калибровка {a}/5': 'Calibration {a}/5', 'Поиск игры': 'Find a game', 'Звуки игры': 'Game sounds', 'Установить приложение': 'Install app', 'Окно': 'Window', 'Полный экран': 'Fullscreen', 'Гость · войти': 'Guest · sign in', 'Вход': 'Sign in', 'или': 'or', 'С аккаунтом Google сохраняются рейтинг и прохождение обучения, и можно играть в рейтинговой игре.': 'With a Google account your rating and tutorial progress are saved, and you can play ranked games.', 'Введите имя, чтобы играть': 'Enter a name to play', 'столов: {n}': 'tables: {n}', 'Открытых столов пока нет — создайте свой в «Создание лобби» или нажмите «Поиск игры».': 'No open tables yet — create one in “Create lobby” or press “Find a game”.', 'Разброс ±{w}': 'Range ±{w}', 'через {s} с — втроём + бот': 'in {s} s — three players + bot', 'втроём + бот, как только найдётся третий': 'three + bot as soon as a third player is found', 'Ищем соперников…': 'Looking for opponents…', 'Ищем игроков…': 'Looking for players…',
    // общее
    'В Точку': 'Spot On', 'В ТОЧКУ': 'SPOT ON', 'заяви и попади': 'call it · nail it',
    'Ошибка соединения': 'Connection error', 'Вас убрали со стола.': 'You were removed from the table.',
    'Не удалось вернуться за стол автоматически. Введите код комнаты и то же имя, под которым играли. Если сервер перезапускался, комната могла пропасть — тогда создайте новую.':
      'Could not rejoin automatically. Enter the room code and the same name you played under. If the server restarted, the room may be gone — create a new one.',
    'Подключаюсь к столу {c}… Если сервер спал, это может занять до минуты.': 'Connecting to table {c}… If the server was asleep this can take up to a minute.',
    'Поверните телефон': 'Rotate your phone', '«В Точку» рассчитана на горизонтальный экран': '“Spot On” is made for landscape',
    // главный
    'Ваше имя': 'Your name', 'Как вас зовут?': 'What’s your name?', 'Создать стол': 'Create table', 'Войти по коду': 'Join by code',
    'Игроков': 'Players', 'Раундов': 'Rounds', 'Таймер': 'Timer', 'Режим обмана': 'Bluff mode', 'Код комнаты': 'Room code', 'Войти': 'Join',
    'Вылетели из игры? Введите код и то же имя — вернётесь на своё место.': 'Dropped out? Enter the code and the same name to get your seat back.',
    'Силуэты': 'Silhouettes', 'Чёрные': 'Black', 'Классика': 'Classic', 'Правила': 'Rules', 'Во весь экран': 'Fullscreen', 'Установить': 'Install',
    'до {m} карт · {s} с на ход': 'up to {m} cards · {s} s per move', 'до {m} карт · без таймера': 'up to {m} cards · no timer',
    'секунд на ход (0 — без таймера)': 'seconds per move (0 — no timer)', 'Введите имя': 'Enter your name', 'Код комнаты — 4 символа': 'Room code is 4 characters',
    'Язык': 'Language',
    // загрузка и обучение
    'Сервер просыпается — обычно это до минуты.': 'The server is waking up — usually under a minute.',
    'Пройти обучение, пока ждём': 'Play the tutorial while we wait', 'Пройти обучение': 'Play the tutorial', 'Пропустить': 'Skip', 'Обучение': 'Tutorial',
    'Добро пожаловать в игру «В Точку»': 'Welcome to “Spot On”',
    'Короткое обучение — минут на пять — покажет правила на настоящей партии с ботами.': 'A short tutorial — about five minutes — teaches the rules in a real game with bots.',
    'Войдите через Google — тогда прохождение обучения и рейтинг сохранятся. Можно и позже.': 'Sign in with Google to save your tutorial progress and rating. You can also do it later.',
    'Вы вошли: {n}': 'Signed in: {n}', 'Сначала выйдите из-за стола': 'Leave the table first', 'Вы': 'You',
    'Обучение уже пройдено на этом аккаунте': 'This account has already completed the tutorial',
    'Сервер готов — после обучения можно играть онлайн': 'Server is ready — you can play online after the tutorial',
    'В обучении это недоступно': 'Not available in the tutorial', 'Завершить обучение': 'Finish tutorial', 'Обучение пройдено!': 'Tutorial complete!',
    'Войдите, чтобы прохождение сохранилось. Без входа обучение предложим снова — его можно будет пропустить.': 'Sign in to save your progress. Without signing in we will offer the tutorial again — you can skip it.',
    'Обычная игра': 'Casual game',
    'Персонализация': 'Customize', 'Колоды': 'Decks', 'Комнаты': 'Rooms', 'Эффекты': 'Effects', 'Выбрана': 'Selected', 'Выбрать': 'Select',
    'Королевская': 'Royal', 'Пижамная вечеринка': 'Pajama party', 'Переговорка': 'Meeting room', 'Колесо': 'Wheel', 'Фразы': 'Phrases', 'Пусто': 'Empty', 'Сбросить по умолчанию': 'Reset to default', 'Колесо эмоций сброшено': 'Emote wheel reset',
    'Выберите место на колесе, затем смайлик': 'Pick a wheel slot, then an emoji',
    'Скоро здесь появятся оформления столов и комнат.': 'Table and room styles are coming soon.',
    'Скоро здесь появятся эффекты розыгрыша карт.': 'Card play effects are coming soon.',
    // умения
    'Умения': 'Skills', 'умения': 'skills', '«Пересдача» — раз за партию': '“Reshuffle” — once per game', 'Пересдача': 'Reshuffle', 'ПЕРЕСДАЧА!': 'RESHUFFLE!',
    'Нажмите ещё раз': 'Tap again', 'Вы': 'You',
    'Пересдача уже использована': 'Reshuffle already used', 'Пересдача — только до заявок': 'Reshuffle — only before bidding',
    'Пересдача: все карты всех игроков перетасовать и раздать заново. Только перед заявками, один раз за партию.': 'Reshuffle: collect everyone’s cards, shuffle and deal again. Only before bidding, once per game.',
    'ПЕРЕСДАЧА?': 'RESHUFFLE?', 'Не нравятся карты? Есть 3 секунды': 'Don’t like your cards? You have 3 seconds',
    'Окно пересдачи · заявки через {s} с': 'Reshuffle window · bidding in {s} s', 'Пересдача — карты раздаются заново': 'Reshuffle — dealing again', 'Раздача…': 'Dealing…',
    'Тестовый режим': 'Test mode', 'тестовый режим': 'test mode', 'тестовый': 'test', '17 раундов: 10-й — «Бескозырка», 15-й — «Тёмная»': '17 rounds: 10th — “No trumps”, 15th — “Dark”',
    'без козыря': 'no trumps', 'тёмная ×2': 'dark ×2', 'БЕСКОЗЫРКА': 'NO TRUMPS', 'ТЁМНАЯ': 'DARK ROUND', 'КАРТЫ ОТКРЫТЫ': 'CARDS REVEALED',
    'Червы — не козырь. Берёт старшая карта масти': 'Hearts are not trumps. The highest card of the suit wins',
    'Заявка вслепую — карты откроются после заявок. Очки ×2': 'Blind bid — cards are revealed after bidding. Points ×2',
    'В этом раунде уже была пересдача': 'There was already a reshuffle this round', 'Умения за этим столом выключены': 'Skills are off at this table',
    // аккаунт и рейтинг
    'Вы вошли: {n} · рейтинг {r}': 'Signed in: {n} · rating {r}', 'Лидеры': 'Leaders', 'Выйти из аккаунта': 'Sign out', 'Выход': 'Sign out',
    'Войдите, чтобы играть на рейтинг': 'Sign in to play for rating', 'Таблица лидеров': 'Leaderboard', 'Закрыть': 'Close',
    'Игрок': 'Player', 'Рейтинг': 'Rating', 'Партий': 'Games', 'Побед': 'Wins',
    'Пока никто не сыграл {n} рейтинговых партий — станьте первым!': 'Nobody has played {n} rated games yet — be the first!',
    'Войдите через Google на главном экране, чтобы играть на рейтинг.': 'Sign in with Google on the main screen to play for rating.',
    'Ваш рейтинг {r}. В таблицу вы попадёте после {n} партий — сыграно {g}.': 'Your rating is {r}. You join the table after {n} games — played {g}.',
    'Рейтинг меняется в партиях, где за столом минимум двое вошедших через Google. Старт — 1000.': 'Rating changes in games with at least two players signed in with Google. Start — 1000.',
    'Считаем рейтинг…': 'Calculating rating…', 'Ваш рейтинг': 'Your rating', 'Вы играли без аккаунта — рейтинг не меняется.': 'You played without an account — no rating change.',
    'Партия не в рейтинге: нужно минимум двое игроков, вошедших через Google.': 'Unrated game: at least two players must be signed in with Google.',
    'Рейтинг сейчас недоступен (нет связи с базой).': 'Rating is unavailable right now (no database connection).',
    'Не удалось сохранить рейтинг — партия не засчитана.': 'Could not save the rating — the game was not counted.',
    'База данных недоступна, попробуйте позже': 'Database unavailable, try again later', 'Таблица лидеров сейчас недоступна': 'Leaderboard is unavailable right now',
    'Вы уже за этим столом — закройте другую вкладку.': 'You are already at this table — close the other tab.',
    // меню режимов, подбор, столы
    'Рейтинг': 'Ranked', 'Обычная': 'Casual', 'Свой стол': 'Host', 'По коду': 'By code', 'Любой': 'Any', 'Быстрая игра': 'Quick match',
    'Открытые столы': 'Open tables', 'Загружаем…': 'Loading…', 'Открытый стол': 'Open table', 'виден всем в списке столов': 'listed for everyone',
    'Рейтинговые партии — только с аккаунтом Google: так рейтинг сохраняется и его нельзя подделать.': 'Ranked games need a Google account — that keeps your rating safe and real.',
    'калибровка {a}/5': 'calibration {a}/5', 'Найти соперников': 'Find opponents', 'Калибровка с ботами — осталось {n}': 'Calibration vs bots — {n} left',
    'Первые 5 партий можно сыграть с ботами — после них вы попадёте в таблицу лидеров.': 'Your first 5 games can be played vs bots — then you join the leaderboard.',
    'Подбираем соперников близкого рейтинга. Чем дольше ждёте — тем шире разброс.': 'We match players of similar rating. The longer you wait, the wider the range.',
    'Сесть': 'Sit', 'Открытых столов пока нет — нажмите «Быстрая игра» или создайте свой стол.': 'No open tables yet — try Quick match or host your own.',
    'Ищем соперников': 'Finding opponents', 'Ищем игроков': 'Finding players', 'на {n}': 'for {n}', 'любой (2–4)': 'any (2–4)',
    'Играть с ботами сейчас': 'Play with bots now', 'Отменить': 'Cancel', 'Соперники найдены!': 'Opponents found!', 'Игроки найдены!': 'Players found!',
    'Поиск прервался — попробуйте ещё раз': 'Search interrupted — try again', 'Ищут игру: {n}': 'Searching: {n}', 'Разброс рейтинга: ±{w}': 'Rating range: ±{w}',
    'Через {s} с сядем с теми, кто есть, + боты': 'In {s} s we start with whoever is here + bots', 'Свободные места займут боты': 'Bots will fill free seats',
    'Ждём игроков — игра начнётся сама': 'Waiting for players — the game starts by itself', 'через {s} с': 'in {s} s',
    'Калибровка с ботами': 'Calibration vs bots', 'Рейтинговый стол': 'Ranked table', 'Стол подбора': 'Matched table',
    'Дальше': 'Next', 'Новый поиск': 'New search', 'Войдите через Google, чтобы играть на рейтинг': 'Sign in with Google to play ranked', 'Игрок': 'Player',
    'Обычная партия — рейтинг не меняется.': 'Casual game — rating does not change.', 'Партия не в рейтинге.': 'Unrated game.',
    'Рейтинговая игра — только после входа через Google': 'Ranked play requires Google sign-in',
    'Калибровка пройдена — ищите соперников в рейтинговой игре': 'Calibration done — find opponents in ranked play',
    'За этот стол садятся только через поиск игроков.': 'This table is filled by matchmaking only.',
    'Игра начнётся сама, когда все подключатся': 'The game starts by itself when everyone connects',
    'Рейтинговую партию не переигрывают — найдите новую игру': 'Ranked games can’t be replayed — find a new game',
    'За столом подбора убирать игроков нельзя': 'You can’t remove players at a matched table',
    'Лобби': 'Lobby', 'Приватная игра': 'Private game', 'только по коду, в лобби не видна': 'code only, hidden from the lobby', 'Код': 'Code',
    'Подберём игроков без рейтинга. Не набралось за 45 с — свободные места займут боты.': 'We’ll find players, no rating. Not enough in 45 s — bots fill the free seats.',
    'Приватный стол или вылетели из игры? Введите код и то же имя.': 'Private table or dropped out? Enter the code and the same name.',
    'Открытых столов пока нет — создайте свой во вкладке «Свой стол» или попробуйте «Быстрая игра».': 'No open tables yet — host one in “Host” or try Quick match.',
    // лобби
    '{n} игроков': '{n} players', '{n} раундов': '{n} rounds', 'таймер {s} с': 'timer {s} s', 'без таймера': 'no timer', 'режим обмана': 'bluff mode',
    'Скопировать ссылку': 'Copy link', 'Стол': 'Table', 'Свободно': 'Free', 'займёт бот': 'a bot will sit', '(вы)': '(you)',
    'хост': 'host', 'в сети': 'online', 'не в сети': 'offline', 'Убрать': 'Remove', 'Начать игру': 'Start game', 'Пустые места займут боты': 'Bots will fill empty seats',
    'Ждём, когда хост начнёт игру…': 'Waiting for the host to start…', 'Выйти': 'Leave', 'Ссылка скопирована': 'Link copied',
    'Позовите друзей: QR-код или ссылка': 'Invite friends: QR code or link',
    // игра
    'Журнал': 'Log', 'Заказы / карты': 'Bids / cards', 'Готов': 'Ready', 'Ждём других…': 'Waiting for others…', 'Готовы {a} из {b}': '{a} of {b} ready', 'Авто через': 'Auto in', 'Настройки': 'Settings', 'Партия': 'Game', 'ждём заявки': 'waiting for bids', 'перебор +{d}': 'over by {d}', 'ровно': 'exact', 'недобор −{d}': 'under by {d}', 'заявили {a} из {b}': '{a} of {b} bid', 'К новым': 'To latest', 'Счёт': 'Score', 'Меню': 'Menu', 'козырь': 'trump', 'Раунд {a}/{b}': 'Round {a}/{b}', 'обман': 'bluff',
    'думает…': 'thinking…', 'заявка —': 'bid —', '{a} из {b}': '{a} of {b}', 'вылетел': 'dropped', 'Заменить ботом': 'Replace with bot',
    'заявка': 'bid', 'взял': 'took', 'ВРЁШЬ!': 'LIAR!', 'ЧЕСТНО!': 'HONEST!', 'СТАРШИЕ НА СТОЛ!': 'HIGHEST ON THE TABLE!', 'САМАЯ СТАРШАЯ!': 'THE TOP CARD!',
    'ТУЗ КОЗЫРЕЙ!': 'ACE OF TRUMPS!', 'ФИНАЛЬНЫЙ РАУНД': 'FINAL ROUND', 'ИГРА НАЧИНАЕТСЯ': 'GAME ON', 'ПИК ПАРТИИ': 'PEAK OF THE GAME', 'РАУНД': 'ROUND',
    '{c} · {n} из {t}': '{c} · {n} of {t}', 'ТЫ ЛИДЕР!': 'YOU LEAD!', 'НОВЫЙ ЛИДЕР': 'NEW LEADER', 'ЗАМЕНИ КАРТУ!': 'SWAP YOUR CARD!', 'ТВОЯ ЗАЯВКА': 'YOUR BID', 'ТВОЙ ХОД': 'YOUR MOVE',
    'Сейчас идут заявки': 'Bidding in progress', 'Сейчас не ваш ход': 'Not your move', 'Положите честную карту': 'Play an honest card',
    'Команда «Старшие на стол!» — нужна самая сильная карта': '“Highest on the table!” — play your strongest card', 'Нужно ходить в масть {s} (или 7♠)': 'You must follow {s} (or 7♠)',
    'Как сыграть 7♠?': 'How to play 7♠?', 'Как обычную 7♠': 'As a normal 7♠', '«Старшие на стол!»': '“Highest on the table!”', 'Как самую старшую': 'As the top card',
    'Все кладут самую сильную карту, взятка ваша': 'Everyone plays their strongest card, the trick is yours', 'Карта бьёт всё, взятка ваша': 'Beats everything, the trick is yours', 'Отмена': 'Cancel',
    'Проверить на обман': 'Check for cheating', 'Проверить? (−20, если честно)': 'Check? (−20 if honest)',
    'Пауза — голосование': 'Paused — voting', 'Пауза': 'Pause', 'ПАУЗА': 'PAUSED', 'Снять паузу': 'Unpause', 'Пауза снимается…': 'Unpausing…', 'Пауза ({n})': 'Pause ({n})',
    'Игра продолжится через': 'Game resumes in', 'Пауза снимается автоматически': 'Pause is ending automatically', 'Паузу снимает {n}': '{n} is unpausing',
    'Вы поставили паузу': 'You paused the game', 'Паузу поставил {n}': '{n} paused the game',
    'Игра продолжится через 5 секунд после снятия. Осталось ваших пауз: {n}': 'The game resumes 5 seconds after unpausing. Your pauses left: {n}',
    'Идёт голосование — игра стоит до его окончания': 'A vote is running — the game waits until it ends', 'Вас поймали! Положите честную карту': 'Caught! Play an honest card', '{n} пойман на обмане — меняет карту': '{n} caught cheating — swapping the card',
    'Ваша заявка': 'Your bid', 'Заявляет {n}…': '{n} is bidding…', 'Старшие на стол — самую сильную': 'Highest on the table — your strongest',
    'Ваш ход — вы ведёте': 'Your move — you lead', 'Ваш ход — в масть {s}': 'Your move — follow {s}', 'Ваш ход — масти {s} нет': 'Your move — no {s}',
    ' · добрать {n}': ' · need {n} more', ' · заявка выполнена': ' · bid made', ' · перебор': ' · over',
    'Это обман! Нажмите ещё раз, чтобы рискнуть': 'That’s a cheat! Tap again to risk it', 'Нажмите карту ещё раз, чтобы сыграть': 'Tap the card again to play',
    'Ходит {n}…': '{n} to move…', 'Берёт {n} · «?» — проверить': '{n} takes · “?” to check', 'Взятку берёт {n}': '{n} takes the trick', 'Раунд окончен': 'Round over', 'Ждём…': 'Waiting…',
    'Заявлено другими: {a} из {b}': 'Others bid: {a} of {b}',
    'Заменить ботом игрока {n}?': 'Replace {n} with a bot?', 'За: {a} · Против: {b}': 'For: {a} · Against: {b}', 'Да, заменить': 'Yes, replace', 'Нет, подождём': 'No, wait',
    'Ждём голоса: {l}. ': 'Waiting for votes: {l}. ', 'Если игрок вернётся, голосование отменится.': 'If the player returns, the vote is cancelled.',
    'Итоги раунда {n}': 'Round {n} results', 'Игрок': 'Player', 'Заявка / взял': 'Bid / took', 'За раунд': 'Round', 'Проверки': 'Checks', 'Всего': 'Total',
    'Следующий раунд: {c}': 'Next round: {c}', 'Следующий раунд': 'Next round', 'Победа!': 'Victory!', 'Игра окончена': 'Game over', 'Ещё партию': 'Play again',
    'Новую партию запускает хост': 'The host starts a new game', 'Таблица': 'Table', 'В меню': 'Main menu',
    'Карт': 'Cards', 'Итого': 'Total', 'Закрыть': 'Close',
    // меню
    'Музыка': 'Music', 'Громкость музыки': 'Music volume', 'выкл.': 'off', 'Звук': 'Sound', 'Готово': 'Done',
    'Звуки игры: {v}': 'Game sounds: {v}', 'включены': 'on', 'выключены': 'off',
    'Звук: {v}': 'Sound: {v}', 'включён': 'on', 'выключен': 'off', 'Эффекты: {v}': 'Effects: {v}', 'максимум': 'max', 'экономно': 'light', 'Графика': 'Graphics', 'Высокая': 'High', 'Низкая': 'Low',
    'Журнал: {v}': 'Log: {v}', 'показан': 'shown', 'скрыт': 'hidden', 'Выйти из полного экрана': 'Exit fullscreen', 'Установить как приложение': 'Install as app',
    'Выйти из-за стола': 'Leave the table', 'Назад': 'Back', 'Понятно': 'Got it',
    'Выйти из-за стола?': 'Leave the table?', 'Ваше место останется, вернуться можно по коду и тому же имени.': 'Your seat stays; come back with the code and the same name.', 'Остаться': 'Stay',
    'На iPhone полный экран доступен только для игры, добавленной на экран «Домой» (Поделиться → На экран «Домой»).': 'On iPhone fullscreen works only when the game is added to the Home Screen (Share → Add to Home Screen).',
    'Браузер не разрешил полный экран — попробуйте ещё раз или через меню браузера.': 'The browser refused fullscreen — try again or use the browser menu.',
    'Установить «В Точку»': 'Install “Spot On”', 'Игра уже установлена и открыта как приложение.': 'The game is already installed and running as an app.',
    'IOS_INSTALL': '<p>On iPhone: tap <b>Share</b> (square with an arrow) at the bottom of Safari → <b>Add to Home Screen</b> → Add.</p><p class="hint">After that the game opens fullscreen, like an app.</p>',
    'ANDROID_INSTALL': '<p>Open the browser menu (⋮) → <b>Install app</b> or <b>Add to Home screen</b>.</p><p class="hint">After that the game opens fullscreen, like an app.</p>',
    // общение
    'Сообщений пока нет': 'No messages yet', 'бот': 'bot', '{n} с': '{n} s', 'Лайк': 'Like', 'Дизлайк': 'Dislike', 'Кинуть грязью': 'Throw mud', 'Только для лидера по очкам': 'Score leader only',
    'Только лидер': 'Leader only', 'Грязью!': 'Mud!', 'Голос выкл': 'Voice off', 'Голос': 'Voice', 'Чат выкл': 'Chat off', 'Чат': 'Chat', 'Эмоции выкл': 'Emotes off', 'Эмоции': 'Emotes',
    'Чат стола': 'Table chat', 'Сообщение…': 'Message…', 'Нажми и говори': 'Push to talk', 'говорить': 'talk',
    'Этот браузер не поддерживает голосовой чат': 'This browser does not support voice chat', 'Нет доступа к микрофону — разрешите его в настройках браузера': 'No microphone access — allow it in browser settings',
    '{n}: {w} {s}': '{n}: {w} {s}', 'голос': 'voice', 'чат': 'chat', 'эмоции и лайки': 'emotes and likes', 'заблокированы': 'blocked', 'снова видны': 'visible again',
    // волна 2: меню аватара, личные сообщения, броски, мировой чат
    'Реакции': 'Reactions', 'Лично ему': 'Just for them', 'Заглушить': 'Mute', 'Написать лично': 'Private message', 'Боты не читают личные': 'Bots don’t read DMs',
    'Бросок лидера': 'Leader’s throw', 'Помидором!': 'Tomato!', 'Яйцом!': 'Egg!', 'Плюнуть!': 'Spit!', 'Лично': 'Private', 'Личное сообщение…': 'Private message…',
    'Грязь': 'Mud', 'Помидор': 'Tomato', 'Яйцо': 'Egg', 'Плевок': 'Spit', 'Бросок лидера — чем лидер по очкам может бросить в соперника': 'Leader’s throw — what the score leader can throw at an opponent',
    'Мировой чат': 'World chat', '{n} в сети': '{n} online', 'Пока тихо. Напишите первым!': 'Quiet so far. Be the first to write!', 'Сообщение всем…': 'Message to everyone…',
    'Войдите через Google, чтобы писать': 'Sign in with Google to write', 'Зовёт за стол': 'Invites to table', 'Сесть за стол': 'Take a seat', 'Стол уже собран': 'Table is full',
    '{n} раундов': '{n} rounds', 'обман': 'bluff', 'умения': 'skills', 'тест': 'test', 'Пригласить в мировой чат': 'Invite via world chat', 'Приглашение отправлено в мировой чат': 'Invite posted to world chat',
    'Писать в мировой чат можно только с аккаунтом Google': 'Only Google accounts can write in world chat', 'Боты не читают личные сообщения': 'Bots don’t read private messages',
    // быстрые фразы (их id — русский текст)
    'Блефуешь!': 'You’re bluffing!', 'Проверю!': 'I’ll check!', 'Ну ты даёшь': 'Wow, really?', 'Везёт же': 'Lucky you', 'Давай быстрее': 'Hurry up', 'Красиво!': 'Beautiful!', 'Не верю': 'Don’t buy it',
    // ошибки сервера и движка
    'Во время игры — только голосованием': 'During a game — only by vote', 'Вы не за этим столом': 'You are not at this table', 'Вы не участвуете в этом голосовании': 'You are not part of this vote',
    'Вы уже проголосовали': 'You have already voted', 'Выберите другого игрока': 'Pick another player', 'Голосование уже идёт': 'A vote is already running', 'Голосования нет': 'No vote in progress',
    'За этого игрока голосовать нельзя': 'You can’t vote on this player', 'Игра ещё не началась': 'The game hasn’t started', 'Игра на паузе: идёт голосование': 'Paused: voting in progress', 'Игра на паузе': 'The game is paused', 'Игра уже на паузе': 'The game is already paused', 'Игра не на паузе': 'The game is not paused', 'Пауза уже снимается': 'Already unpausing', 'Паузы закончились': 'No pauses left', 'Сейчас паузу поставить нельзя': 'You can’t pause now',
    'Игра уже идёт': 'The game is already running', 'Игрок в сети — голосовать можно только за вылетевшего': 'The player is online — you can only vote on someone who dropped',
    'Игрок не найден': 'Player not found', 'Кидаться грязью может только лидер': 'Only the leader can throw mud', 'Комната не найдена': 'Room not found', 'Начать игру может только хост': 'Only the host can start',
    'Не так быстро': 'Not so fast', 'Неизвестное действие': 'Unknown action', 'Нет такой эмоции': 'No such emote', 'Новую партию начинает хост': 'The host starts a new game',
    'Партия ещё не закончена': 'The game is not over yet', 'Пустое сообщение': 'Empty message', 'Свободных мест нет': 'No free seats', 'Слишком большое сообщение': 'Message too long',
    'Убирать игроков может только хост': 'Only the host can remove players', 'Этого игрока убрать нельзя': 'This player can’t be removed',
    'Игра в этой комнате уже идёт, свободных мест нет.': 'A game is running in this room and there are no free seats.', 'Хост убрал вас из комнаты.': 'The host removed you from the room.',
    'Голосованием ваше место отдано боту.': 'By vote your seat went to a bot.', 'Вы не вернулись за 2 минуты — ваше место занял бот.': 'You did not return within 2 minutes — a bot took your seat.', 'Ошибка сервера': 'Server error', 'Не найдено': 'Not found', 'Слишком большой запрос': 'Request too large',
    'Сейчас не ваша заявка': 'Not your bid', 'Недопустимая заявка': 'Invalid bid', 'Нужно заменить карту честной': 'Replace it with an honest card', 'Эту карту сейчас нельзя положить': 'You can’t play this card now',
    'Так сыграть эту карту нельзя': 'You can’t play this card that way', 'Проверки доступны только в режиме обмана': 'Checks are only in bluff mode', 'Подождите: идёт замена карты': 'Wait: a card is being swapped',
    'Сейчас проверять нельзя': 'You can’t check now', 'Этой карты нет на столе': 'That card is not on the table', 'Свою карту проверять нельзя': 'You can’t check your own card',
    'Эту карту уже проверили': 'This card was already checked', 'Первую карту взятки проверять нельзя — ею можно ходить любой': 'The first card of a trick can’t be checked — any card may lead',
    '7♠ можно класть всегда — проверять нечего': '7♠ may always be played — nothing to check', 'У игрока была одна карта — выбора не было': 'The player had one card — no choice',
  };

  const RANK_EN = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const RANK_RU = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];

  function t(ru, p) {
    let s = lang === 'en' && EN[ru] != null ? EN[ru] : ru;
    if (p) s = s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
    return s;
  }
  const cardEn = id => id.replace(/^(10|[6-9]|[ВДКТ])([♠♣♦♥])$/, (m, r, s) => RANK_EN[RANK_RU.indexOf(r)] + s);
  const cardsIn = str => (lang === 'en' ? str.replace(/(^|[\s(:])(10|[6-9]|[ВДКТ])([♠♣♦♥])/g, (m, pre, r, s) => pre + RANK_EN[RANK_RU.indexOf(r)] + s) : str);

  // Тексты с подстановками, которые приходят с сервера.
  const SERVER_RE = [
    [/^Голосовать можно через (\d+) с после вылета$/, (m, n) => `Voting is possible ${n} s after the player dropped`],
    [/^(Лайк|Дизлайк|Грязь) можно через (\d+) с$/, (m, w, n) => `${{ 'Лайк': 'Like', 'Дизлайк': 'Dislike', 'Грязь': 'Mud' }[w]} available in ${n} s`],
    [/^Игрок «(.+)» уже за столом\./, (m, n) => `Player “${n}” is already at the table. If that’s you, close the other tab or use another name.`],
    [/^Игра уже идёт\. Чтобы вернуться за стол, введите имя, под которым играли: (.+)\.$/, (m, l) => `The game is running. To rejoin, enter the name you played under: ${l}.`],
    [/^Имя «(.+)» занято игроком с аккаунтом Google\./, (m, n) => `The name “${n}” belongs to a player signed in with Google. If that’s you, sign in with the same account, otherwise pick another name.`],
    [/^Вход через Google не удался: (.*)$/, (m, e) => `Google sign-in failed: ${e}`],
    [/^Приглашение можно повторить через (\d+) с$/, (m, n) => `You can invite again in ${n} s`],
    [/^Игроков должно быть от (\d+) до (\d+)$/, (m, a, b) => `Players must be from ${a} to ${b}`],
  ];
  function trServer(msg) {
    if (lang !== 'en' || !msg) return msg;
    if (EN[msg] != null) return EN[msg];
    for (const [re, f] of SERVER_RE) if (re.test(msg)) return msg.replace(re, f);
    return msg;
  }

  const NOTE = s => s.replace(' — «СТАРШИЕ НА СТОЛ!»', ' — “HIGHEST ON THE TABLE!”').replace(' — как самая старшая!', ' — as the top card!');
  const LOG_RE = [
    [/^— Раунд (\d+)\/(\d+): по (\d+) карт\.( БЕСКОЗЫРКА!| ТЁМНАЯ: заявки вслепую, очки ×2!)?( ДВОЙНЫЕ ОЧКИ ×(\d)!)? Первый ход у (.+), заявки начинает (.+)\.$/, (m, a, b, k, sp, dbl, x, l, f) => `— Round ${a}/${b}: ${k} card${k === '1' ? '' : 's'} each.${!sp ? '' : sp.includes('БЕСК') ? ' NO TRUMPS!' : ' DARK: blind bids, points ×2!'}${dbl ? ` DOUBLE POINTS ×${x}!` : ''} ${l} leads, ${f} bids first.`],
    [/^(.+) вылетел — пока за него ходит бот\. На возвращение 2 минуты$/, (m, n) => `${n} dropped out — a bot plays for them. 2 minutes to come back`],
    [/^(.+) не вернулся за 2 минуты$/, (m, n) => `${n} did not return within 2 minutes`],
    [/^(.+) вернулся за стол$/, (m, n) => `${n} is back at the table`],
    [/^Заявлено всего (\d+) из (\d+)\. Первым ходит (.+)\.$/, (m, s, k, l) => `Total bid ${s} of ${k}. ${l} leads.`],
    [/^Итог раунда: (.*)$/, (m, r) => `Round result: ${r}`],
    [/^Взятку забирает (.+)$/, (m, n) => `${n} takes the trick`],
    [/^(.+) проверяет (.+): ОБМАН! (.+) −(\d+), (.+) \+(\d+)\. Карта (\S+) возвращается, нужен честный ход\.$/, (m, a, b, c, x, d, y, id) => `${a} checks ${b}: CHEAT! ${c} −${x}, ${d} +${y}. ${cardEn(id)} goes back, an honest card is required.`],
    [/^(.+) проверяет (.+): честно\. (.+) −(\d+)\.$/, (m, a, b, c, x) => `${a} checks ${b}: honest. ${c} −${x}.`],
    [/^(.+) проверяет (.+): честно\. (.+) −(\d+), (.+) \+(\d+)\.$/, (m, a, b, c, x, d, y) => `${a} checks ${b}: honest. ${c} −${x}, ${d} +${y}.`],
    [/^(.+): место игрока занял бот$/, (m, n) => `${n}: a bot took the seat`],
    [/^Новый хост — (.+)$/, (m, n) => `New host — ${n}`],
    [/^(.+) ставит паузу$/, (m, n) => `${n} paused the game`],
    [/^(.+) снова ставит паузу$/, (m, n) => `${n} paused again`],
    [/^(.+) снимает паузу — игра продолжится через 5 с$/, (m, n) => `${n} unpaused — resuming in 5 s`],
    [/^Пауза слишком долгая — игра продолжится через 5 с$/, () => 'Pause too long — resuming in 5 s'],
    [/^Игра продолжается$/, () => 'Game resumed'],
    [/^(.+) вернулся — голосование отменено$/, (m, n) => `${n} is back — vote cancelled`],
    [/^Голосование: (.+) заменён ботом \((\d+) за, (\d+) против\)$/, (m, n, a, b) => `Vote: ${n} replaced by a bot (${a} for, ${b} against)`],
    [/^Голосование: (.+) остаётся за столом \((\d+) за, (\d+) против\)$/, (m, n, a, b) => `Vote: ${n} stays (${a} for, ${b} against)`],
    [/^(.+): время вышло — ход сделан автоматически$/, (m, n) => `${n}: time’s up — auto move`],
    [/^Время вышло — следующий раунд начинается автоматически$/, () => `Time’s up — next round starts automatically`],
    [/^(.+) предлагает заменить ботом игрока (.+)\. Игра на паузе\.$/, (m, a, b) => `${a} proposes replacing ${b} with a bot. Game paused.`],
    [/^(.+) заменяет карту: (10|[6-9]|[ВДКТ])([♠♣♦♥])(.*)$/, (m, n, r, s, note) => `${n} swaps the card: ${cardEn(r + s)}${NOTE(note)}`],
    [/^(.+) применяет «Пересдачу»: карты перетасованы и розданы заново\.$/, (m, n) => `${n} uses “Reshuffle”: cards shuffled and dealt again.`],
    [/^(.+) заявляет (\d+)$/, (m, n, b) => `${n} bids ${b}`],
    [/^(.+): (10|[6-9]|[ВДКТ])([♠♣♦♥])(.*)$/, (m, n, r, s, note) => `${n}: ${cardEn(r + s)}${NOTE(note)}`],
  ];
  function trLog(line) {
    if (lang !== 'en') return line;
    for (const [re, f] of LOG_RE) if (re.test(line)) return line.replace(re, f);
    return line;
  }

  function poCards(n) {
    if (lang === 'en') return `${n} card${n === 1 ? '' : 's'} each`;
    const m10 = n % 10, m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? 'карте' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'карты' : 'карт';
    return `по ${n} ${w}`;
  }

  function apply() {
    root.CardLang = lang;
    root.CardLabel = r => (lang === 'en' ? RANK_EN : RANK_RU)[r];
    if (root.document) document.documentElement.lang = lang;
  }
  apply();

  root.I18N = {
    LANGS,
    get lang() { return lang; },
    set(l) { lang = LANGS.includes(l) ? l : 'ru'; apply(); },
    t, trServer, trLog, cardsIn, poCards,
  };
})(typeof self !== 'undefined' ? self : this);
