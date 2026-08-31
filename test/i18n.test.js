const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const i18n = require('../app/i18n.js');

test('Spanish interface translations cover navigation and daily operations', () => {
  assert.equal(i18n.translate('Dashboard', 'es'), 'Panel');
  assert.equal(i18n.translate('Task Lists', 'es'), 'Listas de tareas');
  assert.equal(i18n.translate('Temperature checks', 'es'), 'Controles de temperatura');
  assert.equal(i18n.translate('Sales & labor', 'es'), 'Ventas y mano de obra');
  assert.equal(i18n.translate('Dashboard', 'en'), 'Dashboard');
});

test('Spanish translations preserve names and translate changing progress counts', () => {
  assert.equal(i18n.translate('Good morning, Todd', 'es'), 'Buenos días, Todd');
  assert.equal(i18n.translate('3 of 8 done', 'es'), '3 de 8 completadas');
  assert.equal(i18n.translate('5 remaining in this list', 'es'), '5 pendientes en esta lista');
  assert.equal(i18n.translate('0 completed · 42 remaining · 42 total', 'es'), '0 completadas · 42 pendientes · 42 en total');
});

test('language controls load before authentication and do not rewrite stored option values', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'i18n.js'), 'utf8');
  const worker = fs.readFileSync(path.join(__dirname, '..', 'app', 'service-worker.js'), 'utf8');
  assert.ok(index.indexOf('i18n.js') < index.indexOf('auth.js'));
  assert.match(index, /data-language-toggle/);
  assert.match(source, /option && !option\.hasAttribute\('value'\)/);
  assert.match(source, /if \(label\.textContent !== nextLabel\)/);
  assert.match(source, /if \(button\.getAttribute\('aria-label'\) !== nextTitle\)/);
  assert.match(source, /#fpcList/);
  assert.match(worker, /'\/i18n\.js'/);
});
