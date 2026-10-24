'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {id} = require('./helpers.cjs');
const tick = () => new Promise(resolve => setTimeout(resolve, 8));
async function setup(t) {
  const turns = Array.from({length: 20}, (_, n) => `<article data-message-author-role="user" data-message-id="u${n}">虚构问题 ${n}</article><article data-message-author-role="assistant" data-message-id="a${n}">虚构回答 ${n}</article>`).join('');
  const dom = new JSDOM(`<aside><div id="manager"></div></aside><main>${turns}<form><textarea id="prompt-textarea"></textarea><button>发送</button></form></main><div id="tools"></div>`, {url: 'https://chatgpt.com/c/' + id(1), runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window; let submits = 0;
  w.fetch = () => assert.fail('Network forbidden'); w.document.querySelector('form').addEventListener('submit', e => {e.preventDefault(); submits++;});
  for (const name of ['model.js', 'store.js', 'api.js', 'ui.js', 'reader.js', 'page-ui.js', 'cloud.js', 'tools.js']) w.eval(fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'));
  const manager = new w.ChatShelf.Sidebar(w.document.getElementById('manager'), {api: new w.ChatShelf.DemoApi(), demo: true});
  manager.useModalPortal(); await manager.connect();
  const reader = new w.ChatShelf.Reader(); reader.refresh();
  const tools = new w.ChatShelf.Tools(w.document.getElementById('tools'), {manager, reader, demo: true});
  const find = (label, root = tools.root) => root.querySelector(`[aria-label="${label}"]`);
  t.after(() => {tools.destroy(); manager.portalHost.remove(); assert.equal(submits, 0); w.close();});
  return {w, tools, manager, reader, find};
}

test('map opens at recent entries, follows asynchronous growth, and respects a user browsing older items', async t => {
  const {w, tools, find} = await setup(t); let height = 1800, scroll = 0;
  Object.defineProperties(tools.body, {scrollHeight: {get: () => height}, clientHeight: {get: () => 300}, scrollTop: {get: () => scroll, set: value => {scroll = Math.min(height - 300, Math.max(0, value));}}});
  tools.open('minimap'); assert.equal(scroll, 1500);
  height = 6000; tools.render(); assert.equal(scroll, 5700);
  tools.body.dispatchEvent(new w.WheelEvent('wheel', {deltaY: -200})); tools.body.scrollTop = 400;
  height = 6500; tools.render(); assert.equal(scroll, 400);
  tools.open(null); tools.open('minimap'); assert.equal(scroll, 6200);
  find('筛选小地图').value = '虚构问题 1'; find('筛选小地图').dispatchEvent(new w.Event('input', {bubbles: true}));
  tools.body.scrollTop = 100; tools.render(); assert.equal(scroll, 100);
});

test('dismissing a reference preserves question, completed thread, saved records and the main draft', async t => {
  const {tools, manager, find, w} = await setup(t);
  tools.selection = '只用于本次引用的虚构内容'; tools.question = '待发送问题'; tools.thread = [{role: 'assistant', text: '已有侧聊'}];
  await tools.local({type: 'THREAD_SAVE', item: {id: 'saved-fixture', conversationId: id(1), selection: '已保存引用', messages: []}});
  w.document.querySelector('textarea').value = '主对话草稿'; tools.open('sideChat'); find('取消侧聊引用').click();
  assert.equal(tools.selection, ''); assert.equal(tools.question, '待发送问题'); assert.equal(tools.thread[0].text, '已有侧聊');
  assert.equal(manager.state.sideThreads[0].selection, '已保存引用'); assert.equal(w.document.querySelector('textarea').value, '主对话草稿');
  assert.equal(find('取消侧聊引用'), null); assert.equal(tools.root.activeElement, find('侧栏追问内容'));
});

test('closing a reference during generation cancels and ignores late model chunks and completion', async t => {
  const {tools, find} = await setup(t); let finish, delta, cancels = 0;
  tools.testCloudClient = {generate: async (payload, onDelta) => {delta = onDelta; return new Promise(resolve => {finish = resolve;});}, cancel: () => {cancels++;}};
  tools.selection = '虚构引用'; tools.question = '保留的问题'; tools.open('sideChat');
  const pending = tools.answer(); delta('未完成片段'); find('取消侧聊引用').click();
  assert.equal(cancels, 1); assert.equal(tools.generating, false); assert.equal(tools.selection, '');
  const partial = tools.partial; delta('迟到内容'); finish('迟到的完整回答'); await pending;
  assert.equal(tools.partial, partial); assert.equal(tools.thread.length, 0); assert.equal(tools.question, '保留的问题');
});

test('prompt body validation is visible and successful save persists before closing the dialog', async t => {
  const {tools, manager, find} = await setup(t); tools.open('prompts'); const pending = tools.editPrompt(); await tick();
  const root = manager.modalRoot, dialog = root.querySelector('[role="dialog"]');
  find('提示词名称', root).value = '只有名称'; find('保存提示词', root).click(); await tick();
  assert.equal(dialog.isConnected, true); assert.match(dialog.querySelector('[role="alert"]').textContent, /请先填写提示词正文/);
  assert.equal(manager.state.prompts.length, 0); assert.equal(find('提示词内容', root).getAttribute('aria-invalid'), 'true');
  find('提示词内容', root).value = '请解释 {{内容}}'; find('保存提示词', root).click(); await pending;
  assert.equal(dialog.isConnected, false); assert.equal((await manager.store.read()).prompts[0].text, '请解释 {{内容}}');
  assert.match(tools.status, /已保存/);
});

test('failed prompt persistence leaves the filled dialog open and allows retry without duplicate prompts', async t => {
  const {tools, manager, find} = await setup(t); tools.open('prompts'); const pending = tools.editPrompt(); await tick();
  const root = manager.modalRoot, original = manager.store.dispatch.bind(manager.store);
  manager.store.dispatch = async () => {throw Error('模拟存储空间不足');};
  find('提示词内容', root).value = '不丢失的正文'; find('保存提示词', root).click(); await tick();
  assert.ok(root.querySelector('[role="dialog"]')); assert.equal(find('提示词内容', root).value, '不丢失的正文');
  assert.match(root.querySelector('[role="alert"]').textContent, /未保存成功.*模拟存储空间不足/);
  manager.store.dispatch = original; find('保存提示词', root).click(); await pending; assert.equal(manager.state.prompts.length, 1);
});

test('prompt cancel writes nothing, textarea participates in keyboard focus, and Escape cannot hide an in-flight save', async t => {
  const {tools, manager, find, w} = await setup(t); tools.open('prompts'); const first = tools.editPrompt(); await tick();
  const root = manager.modalRoot, before = manager.state.revision; find('取消', root).click(); await first; assert.equal(manager.state.revision, before);
  const pending = tools.editPrompt(); await tick(); const text = find('提示词内容', root); text.value = '等待保存的内容';
  const original = manager.store.dispatch.bind(manager.store); let release;
  manager.store.dispatch = op => new Promise(resolve => {release = async () => resolve(await original(op));});
  find('保存提示词', root).click(); await tick(); root.querySelector('[role="dialog"]').dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.ok(root.querySelector('[role="dialog"]')); await release(); await pending; assert.equal(manager.state.prompts.length, 1);
});

test('returning from settings refreshes cloud status and a read error is not shown as missing configuration', async t => {
  const {tools, w} = await setup(t); tools.demo = false; let fail = false, model = 'fake-model-one';
  w.chrome = {runtime: {sendMessage: async () => {if (fail) throw Error('unavailable'); return {ok: true, config: {hasKey: true, model}};}}};
  tools.open('sideChat'); await tick(); assert.match(tools.body.textContent, /fake-model-one/);
  model = 'fake-model-two'; w.dispatchEvent(new w.Event('focus')); await tick(); assert.match(tools.body.textContent, /fake-model-two/);
  fail = true; w.dispatchEvent(new w.Event('focus')); await tick(); assert.match(tools.body.textContent, /无法读取已保存配置/);
  assert.equal(tools.cloudStatus.hasKey, true); assert.equal(tools.body.textContent.includes('此安装尚未配置 API'), false);
});

test('a late cloud status response cannot overwrite a newer successful configuration read', async t => {
  const {tools, w} = await setup(t); tools.demo = false; const responses = [];
  w.chrome = {runtime: {sendMessage: () => new Promise(resolve => responses.push(resolve))}};
  tools.open('sideChat'); w.dispatchEvent(new w.Event('focus')); assert.equal(responses.length, 2);
  responses[1]({ok: true, config: {hasKey: true, model: 'newer-model'}}); await tick();
  responses[0]({ok: true, config: {hasKey: false, model: ''}}); await tick();
  assert.equal(tools.cloudStatus.hasKey, true); assert.match(tools.body.textContent, /newer-model/);
});
