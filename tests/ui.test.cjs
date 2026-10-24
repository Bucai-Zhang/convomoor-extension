'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {id} = require('./helpers.cjs');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 5));
async function setup() {
  const dom = new JSDOM('<body><div id="host"></div></body>', {url: 'https://example.test/demo/', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window; w.fetch = () => { throw Error('NETWORK FORBIDDEN IN UI TEST'); };
  for (const f of ['model.js', 'store.js', 'api.js', 'ui.js']) w.eval(read(f));
  const api = new w.ChatShelf.DemoApi();
  const app = new w.ChatShelf.Sidebar(w.document.getElementById('host'), {api, demo: true});
  await app.connect();
  const find = label => [...app.root.querySelectorAll('[aria-label]')].find(n => n.getAttribute('aria-label') === label);
  return {dom, w, app, api, find};
}
test('sidebar selection, shift range, stars and title search', async t => {
  const {dom, app, find} = await setup(); t.after(() => dom.window.close());
  find('切换批量选择').click(); find('选择 深入理解计算机网络').click();
  app.toggle(id(3), true); assert.equal(app.selected.size, 3);
  find('批量星标').click(); await tick(); assert.equal(Object.keys(app.state.stars).length, 3);
  find('搜索已加载对话').value = 'Python'; find('搜索已加载对话').dispatchEvent(new dom.window.Event('input', {bubbles: true}));
  assert.equal(app.root.querySelectorAll('.chatrow').length, 1); assert.equal(app.selected.size, 0);
});
test('folder create/edit, drop classification and persistence across reload', async t => {
  const {dom, app, find, w} = await setup(); t.after(() => dom.window.close());
  find('新建文件夹').click(); await tick();
  find('文件夹名称').value = '独立实现'; find('保存文件夹').click(); await tick();
  const folder = app.state.folders.find(f => f.name === '独立实现'); assert.ok(folder);
  const row = app.root.querySelector(`[data-folder-id="${folder.id}"]`);
  app.drop({preventDefault() {}, stopPropagation() {}, currentTarget: row, dataTransfer: {getData: () => JSON.stringify({kind: 'chats', ids: [id(2)]})}}, folder.id);
  await tick(); assert.equal(app.state.assignments[id(2)], folder.id);
  const restored = await new w.ChatShelf.Store('demo', true).read(); assert.equal(restored.assignments[id(2)], folder.id);
  await app.local({type: 'DELETE_FOLDER', id: folder.id}); assert.equal(app.chats.some(c => c.id === id(2)), true);
});
test('delete requires exact confirmation phrase; cancellation writes nothing', async t => {
  const {dom, app, api, find} = await setup(); t.after(() => dom.window.close());
  app.multi = true; app.selected.add(id(1)); app.render(); const count = api.items.length;
  const pending = app.batch('delete'); await tick();
  assert.equal(find('确认执行').disabled, true);
  const input = find('删除确认文字'); input.value = '删除 2'; input.dispatchEvent(new dom.window.Event('input')); assert.equal(find('确认执行').disabled, true);
  input.value = '删除 1'; input.dispatchEvent(new dom.window.Event('input')); assert.equal(find('确认执行').disabled, false);
  find('取消').click(); await pending; assert.equal(api.items.length, count);
});
test('confirmed mock delete and archive update only successful rows', async t => {
  const {dom, app, api, find} = await setup(); t.after(() => dom.window.close());
  app.multi = true; app.selected.add(id(1)); app.render();
  const pending = app.batch('archive'); await tick(); find('确认执行').click(); await pending;
  assert.equal(api.items.find(c => c.id === id(1)).archived, true); assert.equal(app.chats.some(c => c.id === id(1)), false);
  assert.equal(app.lastResult.success.length, 1);
  assert.equal(app.hasMore, false); assert.equal(app.offset, 0);
  await app.switchArchive(); assert.equal(app.chats.some(c => c.id === id(1)), true);
  app.selected.add(id(1)); const remove = app.batch('delete'); await tick();
  const input = find('删除确认文字'); input.value = '删除 1'; input.dispatchEvent(new dom.window.Event('input')); find('确认执行').click(); await remove;
  assert.equal(api.items.some(c => c.id === id(1)), false); assert.equal(app.state.assignments[id(1)], undefined);
});
test('unarmed real-mode gate cannot call mutation', async t => {
  const {dom, app, api} = await setup(); t.after(() => dom.window.close());
  let writes = 0; api.mutate = async () => { writes++; };
  app.armed = false; app.selected.add(id(1)); await app.batch('delete');
  assert.equal(writes, 0); assert.equal(app.modals.childElementCount, 0); assert.match(app.message, /未发起写入/);
});
test('partial failure preserves failed and pending rows and metadata', async t => {
  const {dom, app, api, find} = await setup(); t.after(() => dom.window.close());
  api.mutate = async x => { if (x === id(2)) throw Object.assign(Error('network failure'), {uncertain: true}); return {success: true}; };
  app.selected = new Set([id(1), id(2), id(3)]);
  const pending = app.batch('archive'); await tick(); find('确认执行').click(); await pending;
  assert.equal(app.chats.some(c => c.id === id(1)), false); assert.equal(app.chats.some(c => c.id === id(2)), true); assert.equal(app.chats.some(c => c.id === id(3)), true);
  assert.equal(app.lastResult.failed[0].uncertain, true); assert.equal(app.selected.size, 2);
});
test('untrusted chat titles and folder names are text, never HTML', async t => {
  const {dom, app} = await setup(); t.after(() => dom.window.close());
  app.chats[0].title = '<img src=x onerror="alert(1)">';
  await app.local({type: 'CREATE_FOLDER', id: 'xss', name: '<script>bad()</script>'}); app.render();
  assert.equal(app.root.querySelector('img'), null); assert.equal(app.root.querySelector('script'), null); assert.match(app.root.textContent, /<img/);
});
test('backup restoration requires matching account and explicit confirmation', async t => {
  const {dom, app, find} = await setup(); t.after(() => dom.window.close());
  const data = {format: 'chat-shelf-backup', version: 1, account: 'another', state: app.state};
  await assert.rejects(app.importBackup({size: 10, text: async () => JSON.stringify(data)}), /其他账号/);
  data.account = 'demo';
  const pending = app.importBackup({size: 10, text: async () => JSON.stringify(data)}); await tick();
  assert.ok(find('确认执行')); find('确认执行').click(); await pending; assert.equal(app.state.folders.length, 2);
});
test('content script preserves native navigation/history and only adds collapsed tools', async t => {
  const dom = new JSDOM('<body><nav style="width:260px"><a id="project" href="/project">Native project</a><div id="history"><a href="/c/example">Native history</a></div></nav><main><article data-message-author-role="user" data-message-id="u1">Test prompt</article><article data-message-author-role="assistant" data-message-id="a1"><h1>Answer</h1><p>Dummy body</p></article></main></body>', {url: 'https://chatgpt.com/', runScripts: 'outside-only', pretendToBeVisual: true});
  t.after(() => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close(); }); const w = dom.window;
  Object.defineProperty(w, 'crypto', {value: require('node:crypto').webcrypto}); w.TextEncoder = TextEncoder;
  const {load} = require('./helpers.cjs'); const model = load().Model;
  let state = model.empty(); let writes = 0;
  w.fetch = async (url, opts) => {
    if (opts.method !== 'GET') { writes++; throw Error('writes forbidden'); }
    return {ok: true, status: 200, json: async () => url.endsWith('/api/auth/session') ? {user: {id: 'fake'}, accessToken: 'fake'} : {items: [{id: id(1), title: 'Dummy'}], total: 1}};
  };
  w.chrome = {runtime: {onMessage: {addListener() {}}, sendMessage: async m => { if (m.op) state = model.reduce(state, m.op); return {ok: true, state}; }}, storage: {onChanged: {addListener() {}}}};
  for (const f of ['model.js', 'store.js', 'api.js', 'ui.js', 'reader.js', 'page-ui.js', 'history.js', 'ai-client.js', 'tools.js', 'content.js']) w.eval(read(f));
  const host = w.document.getElementById('chat-shelf-extension'); assert.ok(host);
  const section=w.document.getElementById('chat-shelf-local-folders'); assert.equal(section.nextSibling.id, 'history'); assert.equal(section.open,false);
  assert.equal(w.document.querySelector('nav').style.width,'260px'); assert.equal(w.document.getElementById('project').getAttribute('href'),'/project');
  host.shadowRoot.querySelector('[aria-label="连接聊天列表"]').click();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(w.document.getElementById('history').style.display, ''); assert.match(w.document.getElementById('history').textContent,/Native history/);
  const tools=w.document.getElementById('chat-shelf-tools').shadowRoot;
  assert.equal(tools.querySelectorAll('.rail button').length,4); tools.querySelector('[aria-label="小地图"]').click();
  assert.equal(w.document.querySelector('nav').style.width,'260px'); assert.equal(w.document.getElementById('history').style.display,'');
  host.shadowRoot.querySelector('[aria-label="收起本地管理"]').click();
  assert.equal(section.open,false); assert.equal(w.document.getElementById('history').style.display, ''); assert.equal(writes, 0);
});

test('content observer follows style-only cached-page switches and samples the visible unknown message structure', async t => {
  const dom = new JSDOM('<body><nav><div id="history">Native history</div></nav><main id="cache" style="display:none"><article data-message-author-role="user">Fictional previous prompt</article></main><main id="active"><section><p id="pick-user">Fictional current question</p><div data-d-component="list-item"><p id="pick-answer">Fictional current answer</p></div></section></main></body>', {url: 'https://chatgpt.com/c/'+id(1), runScripts:'outside-only', pretendToBeVisual:true});
  const w=dom.window;t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
  let requests=0;w.fetch=()=>{requests++;throw Error('NETWORK FORBIDDEN');};
  let onMessage;w.chrome={runtime:{onMessage:{addListener(fn){onMessage=fn;}}},storage:{onChanged:{addListener(){}}}};
  for(const f of ['model.js','store.js','api.js','ui.js','reader.js','page-ui.js','history.js','ai-client.js','tools.js','content.js'])w.eval(read(f));
  const root=w.document.getElementById('chat-shelf-tools').shadowRoot;
  const button=label=>root.querySelector(`[aria-label="${label}"]`);
  onMessage({type:'CS_DIAGNOSTICS'});button('采样用户正文').click();w.document.getElementById('pick-user').click();
  button('采样助手正文').click();w.document.getElementById('pick-answer').click();
  let report=JSON.parse(button('只含结构的诊断报告').value);
  assert.equal(report.samples.length,2);assert.equal(report.roots[1].selected,true);assert.equal(report.indexedMessages,0);
  assert.equal(w.document.getElementById('cache').style.marginRight,'');
  w.document.getElementById('active').style.display='none';w.document.getElementById('cache').style.display='block';
  await new Promise(r=>setTimeout(r,260));report=JSON.parse(button('只含结构的诊断报告').value);
  assert.equal(report.roots[0].selected,true);assert.equal(report.indexedMessages,1);
  assert.equal(w.document.getElementById('active').style.marginRight,'');assert.equal(w.document.getElementById('cache').style.marginRight,'393px');
  assert.equal(w.document.querySelectorAll('#chat-shelf-tools').length,1);assert.equal(requests,0);
});

test('incremental markers update the content-script minimap after one failed read, without automatic retries', async t=>{
  const {sampledTurn}=require('./sampled-fixture.cjs');
  const dom=new JSDOM(`<body><nav><div id="history">Native history</div></nav><main>${sampledTurn(1)}</main></body>`,{url:'https://chatgpt.com/g/p-test/c/'+id(1),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});let requests=0;
  w.fetch=()=>{requests++;throw Error('NETWORK FORBIDDEN');};let onMessage;
  w.chrome={runtime:{onMessage:{addListener(fn){onMessage=fn;}}},storage:{onChanged:{addListener(){}}}};
  for(const f of ['model.js','store.js','api.js','ui.js','reader.js','page-ui.js','history.js','ai-client.js','tools.js','content.js'])w.eval(read(f));
  const root=w.document.getElementById('chat-shelf-tools').shadowRoot;onMessage({type:'CS_MINIMAP'});
  assert.equal(root.querySelectorAll('.map-card').length,1);assert.match(root.querySelector('.status').textContent,/目录 2 条/);
  const fragment=w.document.createElement('section');fragment.innerHTML=sampledTurn(2);
  const body=fragment.querySelector('[data-dil-message-id]');body.removeAttribute('data-d-inline-reveal');
  w.document.querySelector('main').append(fragment);await new Promise(r=>setTimeout(r,240));
  assert.match(root.querySelector('.status').textContent,/目录 3 条/);
  body.setAttribute('data-d-inline-reveal','');await new Promise(r=>setTimeout(r,240));
  assert.match(root.querySelector('.status').textContent,/目录 4 条/);assert.equal(root.querySelectorAll('.map-card').length,2);
  let jump=0;w.document.querySelector('[data-user-message-bubble]').scrollIntoView=()=>{jump++;};root.querySelector('.map-card').click();assert.equal(jump,1);
  assert.equal(w.document.querySelectorAll('[data-cs-message-tools]').length,4);assert.equal(requests,1);
});
