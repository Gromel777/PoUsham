// Сборка клиента для статического хостинга (Render Static Site): он не засыпает, поэтому игра открывается сразу,
// а пока сервер просыпается, показывается свой экран загрузки и можно пройти обучение.
// Результат — папка dist/: всё из client/ плюс engine/engine.js.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'client'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'engine', 'engine.js'), path.join(out, 'engine.js'));
fs.copyFileSync(path.join(out, 'privacy.html'), path.join(out, 'privacy')); // адрес /privacy, как на сервере
console.log('dist/ готова:', fs.readdirSync(out).length, 'файлов и папок');
