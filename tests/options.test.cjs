'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {load} = require('./helpers.cjs');
const root = path.join(__dirname, '..');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

// Each worker has a fresh JS context but shares persistent mock local storage.
function worker(data = {}) {
  let writes = 0;
  const chrome = {
    runtime: {id: 'test-extension', onConnect: {addListener() {}}},
    storage: {local: {
      setAccessLevel: async () => {}, get: async key => ({[key]: data[key]}),
      set: async values => {writes++; Object.assign(data, values);}, remove: async key => {delete data[key];},
    }}, permissions: {contains: async () => true},
  };
  const ns = load(['cloud.js'], {chrome, TextDecoder, fetch: () => assert.fail('No provider request is permitted')});
  ns.setupCloudWorker();
  return {data, get writes() {return writes;}, request: message => new Promise(resolve => {
    ns.cloudWorkerMessage(message, {id: 'test-extension', url: 'chrome-extension://test-extension/options.html'}, resolve);
  })};
}
async function page(t, service, {failRead = false, permission = true} = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'options.html'), 'utf8'), {url: 'https://options.test/options.html', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, removed = [], calls = [], state = {failRead, permission};
  w.fetch = () => assert.fail('No network request is permitted');
  w.chrome = {
    runtime: {sendMessage: message => {calls.push(message.type); if (state.failRead && message.type === 'CS_CLOUD_GET') return Promise.reject(Error('mock read failure')); return service.request(message);}},
    permissions: {request: async () => state.permission},
    tabs: {getCurrent: async () => ({id: 17}), remove: async id => removed.push(id)},
  };
  w.eval(fs.readFileSync(path.join(root, 'src/cloud.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'src/options.js'), 'utf8'));
  t.after(() => w.close());
  const field = id => w.document.getElementById(id);
  const submit = () => field('api-form').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  await tick(); return {w, field, submit, removed, calls, state};
}

test('API settings survive a new options page and a fresh worker; an empty Key keeps the saved credential', async t => {
  const store = {}, firstWorker = worker(store), first = await page(t, firstWorker);
  first.field('base').value = 'https://router.test/v1'; first.field('model').value = 'fake-model'; first.field('key').value = 'fake-key-test-only';
  first.submit(); await tick(); assert.match(first.field('status').textContent, /已保存/); assert.equal(firstWorker.writes, 1);
  assert.equal(first.field('key').value, ''); assert.equal(first.field('base').value, 'https://router.test/v1');
  const restarted = worker(store), second = await page(t, restarted);
  assert.equal(second.field('base').value, 'https://router.test/v1'); assert.equal(second.field('model').value, 'fake-model');
  assert.equal(second.field('key').value, ''); assert.match(second.field('status').textContent, /无需重新填写/);
  second.field('model').value = 'fake-model-two'; second.submit(); await tick();
  assert.equal(store['chat-shelf:cloud-config'].apiKey, 'fake-key-test-only');
  assert.equal(store['chat-shelf:cloud-config'].model, 'fake-model-two');
  assert.equal(second.w.document.body.textContent.includes('fake-key-test-only'), false);
});

test('read failure is distinct from missing configuration and retry restores it without a write', async t => {
  const service = worker({'chat-shelf:cloud-config': {baseURL: 'https://router.test/v1', model: 'saved-model', apiKey: 'fake-key-test-only'}});
  const ui = await page(t, service, {failRead: true}); assert.equal(ui.field('fields').disabled, true);
  assert.match(ui.field('status').textContent, /读取配置失败/); assert.equal(ui.field('retry').hidden, false);
  ui.submit(); await tick(); assert.equal(service.writes, 0);
  ui.state.failRead = false; ui.field('retry').click(); await tick();
  assert.equal(ui.field('fields').disabled, false); assert.equal(ui.field('model').value, 'saved-model');
  assert.match(ui.field('status').textContent, /已读取保存/); assert.equal(service.writes, 0);
});

test('permission refusal keeps the draft and does not save; subsequent explicit save succeeds', async t => {
  const service = worker(), ui = await page(t, service, {permission: false});
  ui.field('base').value = 'https://router.test/v1'; ui.field('model').value = 'fake-model'; ui.field('key').value = 'fake-key-test-only';
  ui.submit(); await tick(); assert.match(ui.field('status').textContent, /未获得域名权限/);
  assert.equal(service.writes, 0); assert.equal(ui.field('key').value, 'fake-key-test-only');
  ui.state.permission = true; ui.submit(); await tick(); assert.equal(service.writes, 1); assert.equal(ui.field('key').value, '');
});

test('settings close removes only its own tab and clear persists across another page', async t => {
  const service = worker({'chat-shelf:cloud-config': {baseURL: 'https://router.test/v1', model: 'saved-model', apiKey: 'fake-key-test-only'}});
  const ui = await page(t, service); ui.field('close').click(); await tick(); assert.deepEqual(ui.removed, [17]);
  ui.field('clear').click(); await tick(); assert.equal(service.data['chat-shelf:cloud-config'], undefined);
  const again = await page(t, worker(service.data)); assert.equal(again.field('base').value, ''); assert.match(again.field('status').textContent, /尚未配置/);
});

test('incompatible configuration response cannot masquerade as an empty saved configuration', async t => {
  const service = worker({'chat-shelf:cloud-config': {baseURL: 'https://router.test/v1', model: 'saved-model', apiKey: 'fake-key-test-only'}});
  service.request = async () => ({ok: true, config: {}});
  const ui = await page(t, service);
  assert.equal(ui.field('fields').disabled, true); assert.match(ui.field('status').textContent, /配置响应不兼容/);
  assert.equal(ui.field('retry').hidden, false); assert.equal(service.data['chat-shelf:cloud-config'].apiKey, 'fake-key-test-only');
});
