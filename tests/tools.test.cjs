'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {id} = require('./helpers.cjs');
const tick = () => new Promise(r => setTimeout(r, 8));
const plain = value => JSON.parse(JSON.stringify(value));
async function setup(t) {
  const messages = Array.from({length: 9}, (_, i) => `<article data-message-author-role="user" data-message-id="user-${i}"><p>问题 ${i} ${i === 1 ? '代码解释' : '课堂内容'}</p></article><article data-message-author-role="assistant" data-message-id="answer-${i}">${i === 0 ? '<h1>概览</h1><h2>原理</h2><h3>应用</h3>' : ''}<p>回答 ${i}</p>${i === 1 ? '<pre><code class="language-js">const sample = 42;</code></pre>' : ''}</article>`).join('');
  const dom = new JSDOM(`<body><aside id="native" style="width:260px"><a href="/project">原生项目</a><nav id="history"><a href="/c/${id(9)}">原生历史</a></nav><div id="manager"></div></aside><main style="margin-right:13px !important">${messages}<form id="composer"><textarea id="prompt-textarea">原有草稿</textarea><button type="submit">发送</button></form></main><div id="tools"></div></body>`, {url: `https://example.test/c/${id(1)}`, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window; let networks = 0, submits = 0, sends = 0;
  w.fetch = () => { networks++; throw Error('NETWORK FORBIDDEN'); };
  w.XMLHttpRequest = class {constructor() {networks++; throw Error('XHR FORBIDDEN');}};
  w.WebSocket = class {constructor() {networks++; throw Error('WEBSOCKET FORBIDDEN');}};
  w.document.querySelector('form').addEventListener('submit', e => {e.preventDefault();submits++;});
  w.document.querySelector('form button').addEventListener('click', () => sends++);
  for (const file of ['model.js', 'store.js', 'api.js', 'ui.js', 'reader.js', 'page-ui.js', 'tools.js']) w.eval(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
  const api = new w.ChatShelf.DemoApi(); const app = new w.ChatShelf.Sidebar(w.document.getElementById('manager'), {api, demo: true}); await app.connect();
  const reader = new w.ChatShelf.Reader(); reader.refresh(); const tools = new w.ChatShelf.Tools(w.document.getElementById('tools'), {manager: app, reader, demo: true});
  const find = (label, root = tools.root) => [...root.querySelectorAll('[aria-label]')].find(n => n.getAttribute('aria-label') === label);
  t.after(() => {tools.destroy();assert.equal(networks, 0, 'test must never access network');assert.equal(submits, 0, 'test must never submit main ChatGPT conversation');assert.equal(sends, 0, 'test must never click main send button');w.close();});
  return {dom, w, app, api, reader, tools, find};
}

test('four rail entries match reference order, reserve main space, preserve native navigation and close restore exact margin', async t => {
  const {w, tools, find} = await setup(t); const native = w.document.getElementById('native').outerHTML; const main = w.document.querySelector('main');
  assert.deepEqual([...tools.rail.querySelectorAll('button')].map(n => n.getAttribute('aria-label')), ['小地图', '侧栏聊天', '书签', '笔记']);
  find('小地图').click(); assert.equal(tools.active, 'minimap'); assert.equal(tools.dock.hidden, false);
  assert.equal(main.style.marginRight, '406px'); assert.equal(main.style.getPropertyPriority('margin-right'), 'important');
  assert.equal(w.document.getElementById('native').outerHTML, native); assert.notEqual(w.document.getElementById('history').style.display, 'none');
  find('小地图').click(); assert.equal(tools.active, null); assert.equal(main.style.marginRight, '13px'); assert.equal(main.style.getPropertyPriority('margin-right'), 'important');
  find('笔记').click(); find('关闭右侧面板').click(); assert.equal(tools.dock.hidden, true);
});

test('row and row-reverse containers never own or reorder the right dock', async t => {
  const {w,tools}=await setup(t);const row=w.document.createElement('div');row.style.display='flex';row.style.flexDirection='row';
  const native=w.document.getElementById('native'),main=w.document.querySelector('main');row.append(native,main);w.document.body.prepend(row);
  const before=native.outerHTML;tools.open('minimap');
  for(const direction of ['row','row-reverse','row']){
    row.style.flexDirection=direction;tools.layout();
    assert.equal(tools.host.parentElement,w.document.body);assert.equal(tools.host.style.position,'fixed');
    assert.equal(tools.dock.style.position,'');assert.equal(main.style.marginRight,'406px');assert.equal(native.outerHTML,before);
    assert.equal(row.children.length,2,'extension must not become a native flex child');
  }
  tools.open('minimap');assert.equal(main.style.marginRight,'13px');assert.equal(native.outerHTML,before);
});

test('SPA root replacement and rapid project route changes recover one body-level dock and restore old margins', async t => {
  const {w,tools,reader}=await setup(t);tools.open('minimap');
  for(let i=2;i<8;i++){
    const previous=w.document.querySelector('main'),next=previous.cloneNode(true);next.style.marginRight='19px';
    const row=w.document.createElement('section');row.style.cssText='display:flex;flex-direction:row-reverse';previous.replaceWith(row);row.append(next);
    // Simulate a native rerender removing the owned root. It must be recovered.
    tools.host.remove();w.history.pushState({},'',`/g/example-project/c/${id(i)}`);reader.refresh();tools.render();
    assert.equal(previous.style.marginRight,i===2?'13px':'19px');
    assert.equal(tools.host.parentElement,w.document.body);assert.equal(next.style.marginRight,'412px');
    assert.equal(w.document.querySelectorAll('#tools').length,1);assert.equal(tools.active,'minimap');
  }
  tools.open(null);assert.equal(w.document.querySelector('main').style.marginRight,'19px');
});

test('native inline margin updates while open are preserved and never compound', async t => {
  const {w,tools}=await setup(t);const main=w.document.querySelector('main');tools.open('minimap');
  main.style.setProperty('margin-right','23px');tools.layout();assert.equal(main.style.marginRight,'416px');
  for(let i=0;i<5;i++)tools.layout();assert.equal(main.style.marginRight,'416px');tools.open(null);assert.equal(main.style.marginRight,'23px');
  tools.open('minimap');main.style.setProperty('margin-right','31px');tools.open(null);assert.equal(main.style.marginRight,'31px');
});

test('diagnostic UI samples two explicit roles, cancels probes and never includes real content in report', async t => {
  const {w,tools,find}=await setup(t);tools.open('diagnostics');
  assert.ok(find('只含结构的诊断报告'));find('采样用户正文').click();
  w.document.querySelector('[data-message-author-role="user"] p').click();
  find('采样助手正文').click();w.document.querySelector('[data-message-author-role="assistant"] p').click();
  const report=JSON.parse(find('只含结构的诊断报告').value);assert.equal(report.samples.length,2);
  assert.deepEqual(report.samples.map(s=>s.kind),['user','assistant']);assert.equal(report.samples[0].chain.at(-1).tag,'main');
  assert.equal(JSON.stringify(report).includes('课堂内容'),false);assert.equal(tools.probeHandler,null);
  find('采样用户正文').click();find('取消结构采样').click();assert.equal(tools.probeHandler,null);
  find('采样用户正文').click();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(tools.probeHandler,null);
});

test('notes dialog portal remains outside a collapsed native sidebar section and traps focus', async t => {
  const {w,app,tools}=await setup(t);const details=w.document.createElement('details');const summary=w.document.createElement('summary');summary.textContent='Folders';
  app.host.before(details);details.append(summary,app.host);app.useModalPortal();assert.equal(details.open,false);
  const pending=tools.editNote();await tick();const box=app.modals.querySelector('[role="dialog"]');assert.ok(box);assert.equal(details.contains(box),false);
  const input=box.querySelector('[aria-label="笔记内容"]');input.value='Portal note';box.querySelector('[aria-label="保存笔记"]').click();await pending;
  assert.equal(app.state.notes[0].text,'Portal note');assert.equal(details.open,false);app.portalHost.remove();
});

test('minimap keyboard navigation handles arrows, endpoints and clearing search', async t => {
  const {w,tools}=await setup(t);tools.open('minimap');let cards=[...tools.body.querySelectorAll('.map-card')];cards[0].focus();
  cards[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(tools.root.activeElement,cards[1]);
  cards[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(tools.root.activeElement,cards.at(-1));
  const search=tools.body.querySelector('input');search.value='missing';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  tools.body.querySelector('input').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(tools.query,'');assert.ok(tools.root.activeElement.classList.contains('map-card'));
});

test('narrow windows release main reservation and resizing remains bounded', async t => {
  const {w, tools} = await setup(t); tools.open('minimap');
  Object.defineProperty(w, 'innerWidth', {value: 600, configurable: true}); w.dispatchEvent(new w.Event('resize'));
  assert.equal(w.document.querySelector('main').style.marginRight, '13px');
  const handle = tools.root.querySelector('[role="separator"]');
  for (let i = 0; i < 30; i++) handle.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
  assert.equal(tools.width, 480);
  for (let i = 0; i < 30; i++) handle.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
  assert.equal(tools.width, 260);
});

test('minimap cycles available heading levels, filters code groups and performs group text search', async t => {
  const {w, app, tools, reader, find} = await setup(t); tools.open('minimap');
  assert.equal(tools.body.querySelectorAll('.map-card').length, 9);
  for (const next of ['h3', 'h2', 'h1', 'prompts']) {await tools.cycleView();assert.equal(app.state.settings.minimapView, next);}
  await tools.cycleView(); assert.ok(tools.body.querySelector('.map-card.heading'));
  find('仅显示包含代码的消息组').click(); await tick();
  assert.equal(app.state.settings.showCode, true); assert.equal(tools.body.querySelectorAll('.map-card').length, 2);
  assert.match(tools.body.textContent, /代码解释/);
  const search = find('筛选小地图'); search.value = 'not-present';search.dispatchEvent(new w.Event('input', {bubbles: true}));
  assert.equal(tools.body.querySelectorAll('.map-card').length, 0); assert.match(tools.body.textContent, /没有匹配项/);
  const q = find('筛选小地图');q.value = 'sample';q.dispatchEvent(new w.Event('input', {bubbles: true}));
  assert.equal(tools.body.querySelectorAll('.map-card').length, 2);
  let jumped = null;reader.jump = entry => {jumped = entry;return true;};tools.body.querySelector('.map-card').click();await tick();
  assert.equal(jumped.messageId, 'user-1');
});

test('message and conversation bookmarks persist and toggle independently', async t => {
  const {app, tools, reader} = await setup(t);
  await tools.bookmark(reader.messages[0]); await tools.bookmark(); assert.equal(app.state.bookmarks.length, 2);
  const restored = await app.store.read();assert.equal(restored.bookmarks.length, 2);assert.equal(restored.bookmarks[0].messageId, 'user-0');
  tools.open('bookmarks');assert.equal(tools.body.querySelectorAll('.record').length, 2);
  await tools.bookmark(reader.messages[0]);assert.equal(app.state.bookmarks.length, 1);assert.equal(app.state.bookmarks[0].messageId, null);
});

test('note create/edit/delete uses local confirmation, preserves chat data and safely displays arbitrary text', async t => {
  const {app, tools, api, find} = await setup(t); const before = plain(api.items);tools.open('notes');
  const create = tools.editNote();await tick();find('笔记标题', app.root).value = '测试笔记';find('笔记内容', app.root).value = '<img src=x onerror=alert(1)> 课堂内容';find('保存笔记', app.root).click();await create;
  assert.equal(app.state.notes.length, 1);assert.equal(tools.body.querySelector('img'), null);assert.match(tools.body.textContent, /<img src/);
  const item = app.state.notes[0];const edit = tools.editNote(item);await tick();find('笔记内容', app.root).value = '修订笔记';find('保存笔记', app.root).click();await edit;
  assert.equal(app.state.notes[0].id, item.id);assert.equal(app.state.notes[0].text, '修订笔记');
  const cancelled = tools.remove('NOTE_DELETE', item.id);await tick();find('取消', app.root).click();await cancelled;assert.equal(app.state.notes.length, 1);
  const approved = tools.remove('NOTE_DELETE', item.id);await tick();find('确认执行', app.root).click();await approved;assert.equal(app.state.notes.length, 0);assert.deepEqual(plain(api.items), before);
});

test('prompt template variables are filled once, written as unsent draft, and template survives', async t => {
  const {w, app, tools, find} = await setup(t);
  await tools.local({type: 'PROMPT_SAVE', item: {id: 'p_test', title: '解释', text: '用{{语言}}解释{{内容}}；仍用{{语言}}。'}});
  const use = tools.usePrompt(app.state.prompts[0]);await tick();find('语言', app.root).value = '中文';find('内容', app.root).value = '<script>literal</script>';find('确认填写变量', app.root).click();await use;
  assert.equal(w.document.querySelector('#prompt-textarea').value, '用中文解释<script>literal</script>；仍用中文。');assert.equal(app.state.prompts.length, 1);assert.match(tools.status, /尚未发送/);
});

test('side question drafts include selected text without sending and clear without deleting saved records', async t => {
  const {w, app, tools, find} = await setup(t);tools.open('sideChat');tools.selection = '需要解释的引用';tools.question = '为什么？';tools.render();
  find('把追问放入主输入框').click();await tick();assert.match(w.document.querySelector('#prompt-textarea').value, /需要解释的引用/);assert.match(w.document.querySelector('#prompt-textarea').value, /为什么/);
  assert.equal(find('使用本机 AI 回答').disabled, true, 'demo never starts real local AI');
  tools.thread = [{role: 'user', text: '问题'}, {role: 'assistant', text: '明确标记的虚构回答'}];await tools.saveThread();assert.equal(app.state.sideThreads.length, 1);
  find('清空侧聊草稿').click();await tick();assert.equal(tools.thread.length, 0);assert.equal(tools.selection, '');assert.equal(app.state.sideThreads.length, 1);
  find('打开已保存侧聊').click();await tick();assert.equal(tools.thread.length, 2);assert.equal(tools.selection, '需要解释的引用');
});

test('local AI adapter mock receives explicit selected context and failed generation adds no fabricated assistant', async t => {
  const {tools} = await setup(t);tools.open('sideChat');tools.selection = '测试上下文';tools.question = '请解释';let request;
  tools.aiClient = {generate: async input => {request = input;return '测试模型的虚构回答';}, destroy() {}};
  await tools.answer();assert.equal(request.selection, '测试上下文');assert.match(request.messages[0].content, /请解释/);assert.equal(tools.thread.length, 2);assert.equal(tools.thread[1].text, '测试模型的虚构回答');
  const previous = plain(tools.thread);tools.question = '第二问';tools.aiClient.generate = async () => {throw Error('mock model unavailable');};
  await assert.rejects(tools.answer(), /unavailable/);assert.deepEqual(plain(tools.thread), previous);assert.equal(tools.question, '第二问');assert.equal(tools.generating, false);
  tools.aiClient.generate = async () => '  ';
  await assert.rejects(tools.answer(), /没有返回有效回答/);assert.deepEqual(plain(tools.thread), previous);
});

test('generation arriving after route switch is rejected and never appended to the new conversation', async t => {
  const {w, reader, tools} = await setup(t);tools.open('sideChat');tools.question = '旧对话问题';let resolve, cancels = 0;
  tools.aiClient = {generate: () => new Promise(r => {resolve = r;}), cancel() {cancels++;}, destroy() {}};
  const pending = tools.answer();assert.equal(tools.generating, true);
  w.history.pushState({}, '', `/c/${id(2)}`);reader.refresh();tools.render();assert.equal(cancels, 1);
  resolve('旧对话迟到的模拟模型回复');await assert.rejects(pending, /对话已切换/);
  assert.equal(tools.thread.length, 0);assert.equal(tools.question, '');assert.equal(tools.generating, false);
});

test('markdown and JSON exports contain only rendered mock conversation, URL is eventually released', async t => {
  const {w, tools, find} = await setup(t);const blobs = [], clicked = [], revoked = [];
  w.URL.createObjectURL = blob => {blobs.push(blob);return `blob:mock-${blobs.length}`;};w.URL.revokeObjectURL = value => revoked.push(value);
  w.Blob = class {constructor(parts, options) {this.text = parts.join('');this.type = options.type;}};
  w.HTMLAnchorElement.prototype.click = function() {clicked.push({name: this.download, href: this.href});};
  tools.open('export');find('导出当前对话为 Markdown').click();await tick();find('导出当前对话为 JSON').click();await tick();
  assert.equal(clicked[0].name, 'conversation.md');assert.match(blobs[0].text, /## 用户/);assert.match(blobs[0].text, /```js/);assert.equal(blobs[0].type, 'text/markdown');
  const data = JSON.parse(blobs[1].text);assert.equal(data.conversationId, id(1));assert.equal(data.messages.length, 18);assert.equal(JSON.stringify(data).includes('原生历史'), false);
  await new Promise(r => setTimeout(r, 1020));assert.equal(revoked.length, 2);
});

test('conversation switch scopes bookmarks and notes and does not carry side-chat draft into another conversation', async t => {
  const {w, app, reader, tools} = await setup(t);await tools.bookmark(reader.messages[0]);await tools.local({type: 'NOTE_SAVE', item: {id: 'n_one', conversationId: id(1), text: '第一段对话的笔记'}});
  tools.open('sideChat');tools.selection = '第一段引用';tools.question = '第一段问题';tools.thread = [{role: 'user', text: '第一段侧聊'}];
  w.history.pushState({}, '', `/c/${id(2)}`);reader.refresh();tools.render();
  assert.equal(tools.records('bookmarks').length, 0);assert.equal(tools.records('notes').length, 0);
  assert.equal(tools.thread.length, 0, 'conversation switch must reset unsaved side-chat context');assert.equal(tools.selection, '');assert.equal(tools.question, '');
  assert.equal(app.state.notes[0].conversationId, id(1));assert.equal(app.state.bookmarks[0].conversationId, id(1));
});


test('visible root drives margin, probes, editor and composer when first main is a hidden cached page', async t => {
  const {w,reader,tools,find}=await setup(t);const active=w.document.querySelector('main'),cache=w.document.createElement('main');
  cache.style.display='none';cache.innerHTML='<textarea id="prompt-textarea">Cached private draft</textarea><div data-cs-composer-tools>Old toolbar</div>';
  w.document.body.prepend(cache);tools.open('diagnostics');
  assert.equal(cache.style.marginRight,'');assert.equal(active.style.marginRight,'406px');assert.equal(tools.editor(),active.querySelector('textarea'));
  tools.attachComposer();assert.equal(cache.querySelector('[data-cs-composer-tools]'),null);assert.ok(active.querySelector('[data-cs-composer-tools]'));
  find('采样用户正文').click();active.querySelector('[data-message-author-role="user"] p').click();
  find('采样助手正文').click();active.querySelector('[data-message-author-role="assistant"] p').click();
  assert.match(find('正文采样进度').textContent,/用户 1 \/ 助手 1/);const report=JSON.parse(find('只含结构的诊断报告').value);
  assert.equal(report.roots[1].selected,true);assert.equal(report.samples.length,2);assert.ok(report.samples.every(s=>s.reachedRoot));
  tools.insertDraft('Updated only visible draft');assert.equal(cache.querySelector('textarea').value,'Cached private draft');assert.equal(active.querySelector('textarea').value,'Updated only visible draft');
});

test('diagnostic download rejects missing samples while explicit overview remains available', async t => {
  const {tools,reader}=await setup(t);const exports=[];tools.download=(name,text)=>exports.push(JSON.parse(text));
  assert.throws(()=>tools.downloadDiagnostics(true),/分别采样/);assert.equal(exports.length,0);
  tools.downloadDiagnostics(false);assert.equal(exports[0].samples.length,0);
  tools.diagnosticSamples=[{kind:'user',node:reader.messages[0].node},{kind:'assistant',node:reader.messages[1].node}];
  tools.downloadDiagnostics(true);assert.equal(exports[1].samples.length,2);
  reader.messages[1].node.remove();assert.throws(()=>tools.downloadDiagnostics(true),/分别采样/);
});

test('resize refreshes message index and margin target after visible root changes', async t => {
  const {w,reader,tools}=await setup(t);tools.open('minimap');const previous=w.document.querySelector('main');
  const current=w.document.createElement('main');current.innerHTML='<article data-message-author-role="user" data-message-id="responsive">Responsive fixture prompt</article>';
  previous.after(current);previous.style.display='none';w.dispatchEvent(new w.Event('resize'));
  assert.equal(reader.messages.length,1);assert.equal(reader.messages[0].id,'responsive');
  assert.equal(previous.style.marginRight,'13px');assert.equal(current.style.marginRight,'393px');
  assert.match(tools.body.textContent,/Responsive fixture prompt/);
});

test('sampled-markup bookmarks persist with the body ID and route replacement does not retain old cards',async t=>{
  const {sampledTurn}=require('./sampled-fixture.cjs');const {w,reader,tools,app}=await setup(t);
  const main=w.document.querySelector('main');main.innerHTML=sampledTurn(1);reader.refresh();tools.open('minimap');
  assert.equal(tools.body.querySelectorAll('.map-card').length,1);assert.equal(reader.messages.length,2);
  await tools.bookmark(reader.messages[1]);assert.equal(app.state.bookmarks[0].messageId,'sample-answer-1');
  assert.equal((await app.store.read()).bookmarks[0].messageId,'sample-answer-1');
  w.history.pushState({},'',`/g/p-test/c/${id(7)}`);main.innerHTML=sampledTurn(7);reader.refresh();tools.render();
  assert.match(tools.body.textContent,/虚构问题7/);assert.equal(tools.body.textContent.includes('虚构问题1'),false);
  assert.equal(tools.records('bookmarks').length,0);assert.equal(tools.host.parentElement,w.document.body);
});
