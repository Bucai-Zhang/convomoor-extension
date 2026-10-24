'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const id = '00000000-0000-4000-8000-000000000001';
const source = fs.readFileSync(path.join(__dirname, '../src/reader.js'), 'utf8');
function setup(t, body, route = `/c/${id}`) {
  const dom = new JSDOM(`<title>测试对话</title><body>${body}</body>`, {url: `https://chatgpt.com${route}`, runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  dom.window.fetch = () => { throw Error('NETWORK FORBIDDEN'); };
  dom.window.eval(source);
  const reader = new dom.window.ChatShelf.Reader(dom.window.document); reader.refresh();
  return {dom, reader, doc: dom.window.document};
}
const msg = (role, id, body) => `<div data-message-author-role="${role}" data-message-id="${id}">${body}</div>`;
test('reads current main only, excludes owned UI and deduplicates nested nodes and stable IDs', t => {
  const {reader} = setup(t, msg('user', 'outside', 'outside') + `<main>${msg('user', 'u1', '问题' + msg('user', 'nested', 'nested'))}${msg('assistant', 'a1', '<p>回答</p><button>复制</button>')}${msg('assistant', 'a1', 'duplicate')}<aside data-cs-owned>${msg('user', 'own', 'owned')}</aside></main>`);
  assert.deepEqual(Array.from(reader.messages, m => m.id), ['u1', 'a1']);
  assert.equal(reader.messages[1].text, '回答');
  assert.equal(reader.getByMessageId('a1').role, 'assistant');
  assert.equal(reader.getByMessageId('missing'), null);
});
test('prompts view uses user prompts rather than assistant response cards', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u', '给我解释网络')}${msg('assistant', 'a', '<h1>网络</h1>回答正文')}</main>`);
  assert.deepEqual(Array.from(reader.entries(), e => e.label), ['给我解释网络']);
  assert.equal(reader.entries()[0].messageId, 'u');
});
test('heading views retain user, include ancestors, reject code headings and preview plain answers', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u1', '问题一')}${msg('assistant', 'a1', '<h1>一级</h1><h2>二级</h2><h3>三级</h3><pre><code><h1>伪标题</h1>x</code></pre>')}${msg('user', 'u2', '问题二')}${msg('assistant', 'a2', '<p>没有标题的解释</p>')}</main>`);
  for (const [view, headings] of [['h1', ['一级']], ['h2', ['一级', '二级']], ['h3', ['一级', '二级', '三级']]]) {
    assert.deepEqual(Array.from(reader.entries({view}), e => e.label), ['问题一', ...headings, '问题二', '没有标题的解释']);
  }
  assert.deepEqual(Array.from(reader.messages[1].headings, h => h.level), [1, 2, 3]);
});
test('code-only and search filters match whole prompt-answer groups', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u1', '代码问题')}${msg('assistant', 'a1', '<h1>标题</h1><pre><code>const Needle=1</code></pre>')}${msg('user', 'u2', '另一个问题')}${msg('assistant', 'a2', '无代码')}</main>`);
  assert.deepEqual(Array.from(reader.entries({codeOnly: true}), e => e.messageId), ['u1']);
  assert.deepEqual(Array.from(reader.entries({view: 'h1', query: 'needle'}), e => e.messageId), ['u1', 'a1']);
  assert.deepEqual(Array.from(reader.entries({view: 'h1', query: '代码问题', codeOnly: true}), e => e.messageId), ['u1', 'a1']);
  assert.equal(reader.entries({query: 'unknown'}).length, 0);
  assert.equal(reader.entries({codeOnly: true, query: '另一个问题'}).length, 0);
});
test('headings at other levels do not become answer previews', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u', '问题')}${msg('assistant', 'a', '<h2>仅二级</h2>正文')}</main>`);
  assert.deepEqual(Array.from(reader.entries({view: 'h1'}), e => e.messageId), ['u']);
});
test('orphan assistant has a useful fallback card', t => {
  const {reader} = setup(t, `<main>${msg('assistant', 'a', '页面只加载了一条回答')}</main>`);
  assert.equal(reader.entries()[0].label, '页面只加载了一条回答');
  assert.equal(reader.entries()[0].role, 'assistant');
});
test('prompts view includes assistant previews when the entire conversation has no headings', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u', '一个问题')}${msg('assistant', 'a', '<p>没有标题的回答</p>')}</main>`);
  assert.deepEqual(Array.from(reader.entries(), e => e.label), ['一个问题', '没有标题的回答']);
});
test('non-text messages give observable image, attachment or media labels', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u1', '<img alt="课堂板书" src="https://example.test/a.png">')}${msg('assistant', 'a1', '<div data-testid="attachment"></div>')}${msg('user', 'u2', '<audio></audio>')}</main>`);
  assert.match(reader.messages[0].text, /图片消息.*课堂板书/);
  assert.equal(reader.messages[0].images.length, 1);
  assert.match(reader.messages[1].text, /附件消息/);
  assert.match(reader.messages[2].text, /非文本消息/);
});
test('conversation identity supports project routes and rejects unsaved/non UUID paths', t => {
  const {reader, dom} = setup(t, '<main></main>', `/g/a-project/c/${id}`);
  assert.equal(reader.conversationId, id);
  dom.reconfigure({url: 'https://chatgpt.com/c/not-a-real-id'}); assert.equal(reader.conversationId, null);
  dom.reconfigure({url: 'https://chatgpt.com/'}); assert.equal(reader.conversationId, null);
});
test('generated message IDs survive repeat refresh, streaming and identical node replacement', t => {
  const {reader, doc} = setup(t, '<main><div data-message-author-role="user">测试</div><div data-message-author-role="assistant">回答</div></main>');
  const ids = reader.messages.map(m => m.id);
  reader.refresh(); assert.deepEqual(reader.messages.map(m => m.id), ids);
  doc.querySelector('[data-message-author-role="assistant"]').textContent = '回答继续生成';
  reader.refresh(); assert.deepEqual(reader.messages.map(m => m.id), ids);
  const user = doc.querySelector('[data-message-author-role="user"]'); user.replaceWith(user.cloneNode(true));
  reader.refresh(); assert.equal(reader.messages[0].id, ids[0]);
});
test('uses native message identity on enclosing article; repeated text gets separate fallback IDs', t => {
  const {reader} = setup(t, '<main><article data-message-id="native"><div data-message-author-role="user">重复</div></article><div data-message-author-role="user">重复</div><div data-message-author-role="user">重复</div></main>');
  assert.equal(reader.messages[0].id, 'native');
  assert.equal(new Set(reader.messages.map(m => m.id)).size, 3);
});
test('streaming fallback-ID collisions never drop new messages before or after the streamed node', t => {
  const {reader, doc} = setup(t, '<main><div data-message-author-role="assistant">A</div></main>');
  const original = reader.messages[0], originalId = original.id;
  original.node.textContent = 'B';
  doc.querySelector('main').insertAdjacentHTML('beforeend', '<div data-message-author-role="assistant">A</div>');
  reader.refresh();
  assert.equal(reader.messages.length, 2); assert.equal(reader.messages[0].id, originalId);
  assert.notEqual(reader.messages[1].id, originalId);
  const secondId = reader.messages[1].id;
  doc.querySelector('main').insertAdjacentHTML('afterbegin', '<div data-message-author-role="assistant">A</div>');
  reader.refresh();
  assert.equal(reader.messages.length, 3); assert.equal(new Set(reader.messages.map(m => m.id)).size, 3);
  assert.equal(reader.messages[1].id, originalId); assert.equal(reader.messages[2].id, secondId);
  const ids = reader.messages.map(m => m.id); reader.refresh(); assert.deepEqual(reader.messages.map(m => m.id), ids);
});
test('jump scrolls the exact heading and marks it briefly; rejects missing or disconnected entries', t => {
  const {reader, doc} = setup(t, `<main>${msg('user', 'u', '问题')}${msg('assistant', 'a', '<h1>定位目标</h1>')}</main>`);
  const entry = reader.entries({view: 'h1'})[1]; let options;
  entry.node.scrollIntoView = value => { options = value; };
  assert.equal(reader.jump(entry.id), true); assert.equal(options.behavior, 'smooth'); assert.equal(options.block, 'start');
  assert.equal(entry.node.classList.contains('chat-shelf-reader-target'), true);
  assert.ok(doc.querySelector('style[data-cs-owned="reader-style"]'));
  assert.equal(reader.jump('missing'), false); entry.node.remove(); assert.equal(reader.jump(entry), false);
});
test('jump respects reduced-motion preference without smooth animation', t => {
  const {reader, dom} = setup(t, `<main>${msg('user', 'u', '无动画定位')}</main>`);
  let mediaQuery, options;
  dom.window.matchMedia = query => { mediaQuery = query; return {matches: true}; };
  const entry = reader.entries()[0]; entry.node.scrollIntoView = value => { options = value; };
  assert.equal(reader.jump(entry), true);
  assert.equal(mediaQuery, '(prefers-reduced-motion: reduce)');
  assert.equal(options.behavior, 'auto'); assert.equal(options.block, 'start');
});
test('Markdown export includes displayed code with safe fences and excludes injected controls', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u', '<p>请解释代码</p>')}${msg('assistant', 'a', '<h1>代码说明</h1><pre><code class="language-js">const x = `hi`;</code></pre><div data-cs-owned>工具栏秘密</div><time datetime="2026-10-23T08:00:00Z"></time>')}</main>`);
  const text = reader.getMarkdown();
  assert.match(text, /# 测试对话/); assert.match(text, /# 代码说明/); assert.match(text, /```js\nconst x = `hi`;/);
  assert.doesNotMatch(text, /工具栏秘密/);
  assert.equal(reader.messages[1].timestamp, Date.parse('2026-10-23T08:00:00Z'));
});
test('Markdown preserves exact code indentation, tabs, blank lines and trailing whitespace', t => {
  const {reader} = setup(t, `<main>${msg('assistant', 'a', '<p>代码如下</p><pre><code class="language-python"></code></pre><p>结束</p>')}</main>`);
  const raw = 'if True:\n    print("hello")  \n\n\t# tab-indented\n\n\n';
  reader.messages[0].node.querySelector('code').textContent = raw;
  const exported = reader.getMarkdown();
  assert.ok(exported.includes(`\u0060\u0060\u0060python\n${raw}\u0060\u0060\u0060`));
  assert.ok(exported.includes('    print("hello")  \n'));
  assert.ok(exported.includes('\n\n\t# tab-indented\n\n\n'));
});
test('Markdown fence escaping and code placeholders cannot rewrite original code text', t => {
  const {reader} = setup(t, `<main>${msg('assistant', 'a', '<pre><code></code></pre><pre><code></code></pre>')}</main>`);
  const blocks = reader.messages[0].node.querySelectorAll('code');
  blocks[0].textContent = '\uE000CHAT_SHELF_CODE_0\uE001\n```\n  literal'; blocks[1].textContent = '    second\n';
  const exported = reader.getMarkdown();
  assert.ok(exported.includes('````\n\uE000CHAT_SHELF_CODE_0\uE001\n```\n  literal\n````'));
  assert.ok(exported.includes('```\n    second\n```'));
});
test('single-message Markdown supports ID or message, preserves code and excludes owned toolbars', t => {
  const {reader} = setup(t, `<main>${msg('user', 'u', '不要导出这条')}${msg('assistant', 'a', '<p>Python 示例</p><pre><code class="language-python"></code></pre><div data-cs-owned>工具栏内容</div><button>复制</button>')}</main>`);
  const message = reader.getByMessageId('a'), raw = 'if True:\n    print("缩进")\n\t# tab\n';
  message.node.querySelector('code').textContent = raw;
  const exported = reader.getMessageMarkdown('a');
  assert.equal(exported, reader.getMessageMarkdown(message));
  assert.ok(exported.includes(`\u0060\u0060\u0060python\n${raw}\u0060\u0060\u0060`));
  assert.doesNotMatch(exported, /不要导出这条|工具栏内容|复制/);
  assert.equal(reader.getMessageMarkdown('missing'), '');
  assert.equal(reader.getMessageMarkdown(null), '');
});
test('no main means no broad reading of navigation or side panels', t => {
  const {reader} = setup(t, `<nav>${msg('user', 'u', '这不是正文')}</nav>`);
  assert.equal(reader.messages.length, 0); assert.equal(reader.entries().length, 0);
});
test('unknown conversation-turn wrappers never guess message roles from numbering or labels', t => {
  const {reader} = setup(t, '<main><article data-testid="conversation-turn-1" aria-label="You said:"><h5>You said:</h5><p>没有可靠角色属性</p></article><article data-testid="conversation-turn-2" aria-label="ChatGPT said:"><h6>ChatGPT said:</h6><p>回答文本</p></article></main>');
  assert.equal(reader.messages.length, 0); assert.equal(reader.entries().length, 0);
});

test('reported data-d-component nested list items remain unclassified and diagnosis captures only structure', t => {
  const secret = 'PRIVATE_CHAT_TOKEN_9e37';
  const {reader, doc, dom} = setup(t, `<nav>${secret}</nav><main><section id="${secret}" class="${secret}" data-d-component="${secret}"><div data-d-component="message-content"><ol><li class="item-O8JWQe" data-d-component="list-item" data-d-marker-layout="native"><div><p title="${secret}">${secret}</p></div></li><li data-d-component="list-item">Second list item</li></ol></div></section><textarea>${secret}</textarea><a href="https://example.test/${secret}">x</a><div data-cs-owned data-message-author-role="user">${secret}</div></main>`);
  doc.cookie = `token=${secret}`; dom.window.localStorage.setItem('token', secret);
  assert.equal(reader.messages.length, 0, 'a list item is not a message');
  const report = reader.diagnostics([{kind: 'assistant', node: doc.querySelector('li p')}]);
  const text = JSON.stringify(report);
  assert.equal(text.includes(secret), false); assert.equal(text.includes('Second list item'), false);
  assert.equal(text.includes('item-O8JWQe'), false); assert.equal(text.includes('example.test'), false);
  assert.equal(report.documentCounts.components, 4);assert.equal(report.documentCounts.roleUser, 0);
  assert.equal(report.roots[0].selected, true); assert.equal(report.samples[0].chain.at(-1).tag, 'main');
  assert.ok(report.samples[0].chain.some(n => n.component === 'list-item'));
  assert.equal(report.readerStrategy, 'explicit-role+sampled-markers');
});

test('diagnosis describes missing main, multiple roots and disconnected samples without reading frame contents', t => {
  const {reader, doc} = setup(t, '<main><p>Plain content</p><iframe src="https://private.example/secret"></iframe></main><div role="main"><p>Other root</p></div>');
  const report = reader.diagnostics([{kind: 'user', node: doc.createElement('p')}]);
  assert.equal(report.roots.length, 2);assert.equal(report.documentCounts.frames, 1);
  assert.equal(report.samples[0].disconnected, true);assert.equal(JSON.stringify(report).includes('private.example'), false);
  doc.querySelector('main').remove();assert.equal(reader.main.getAttribute('role'), 'main');doc.querySelector('[role=main]').remove();assert.equal(reader.diagnostics().selectedRoot, null);
});

function rect(node,x,y,width,height){node.getBoundingClientRect=()=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height});}

test('real report geometry selects the fourth visible root instead of hidden cached main and nested role=main', t => {
  const {reader,doc,dom}=setup(t,'<main data-app-shell-main-surface data-codex-history-swipe-page><div role="main">Cached</div></main><main data-app-shell-main-surface>Cached second</main><main data-app-shell-main-surface><section><p>Fake user text</p><div data-d-component="list-item"><p>Fake assistant list item</p></div></section></main>');
  Object.defineProperty(dom.window,'innerWidth',{value:2304,configurable:true});Object.defineProperty(dom.window,'innerHeight',{value:1094,configurable:true});
  rect(doc.documentElement,0,0,2304,1094);const roots=[...doc.querySelectorAll('main,[role=main]')];
  for(const root of roots)rect(root,0,0,0,0);rect(roots[3],334,0,1970,1094);
  reader.refresh();assert.equal(reader.main,roots[3]);assert.equal(reader.messages.length,0,'root selection must not invent unknown messages');
  const report=reader.diagnostics([{kind:'user',node:roots[3].querySelector('p')},{kind:'assistant',node:roots[3].querySelector('[data-d-component] p')}]);
  assert.equal(report.rootSelection,'visible-viewport-root');assert.equal(report.roots[3].selected,true);assert.equal(report.roots[0].selected,false);
  assert.deepEqual(Array.from(report.samples,s=>s.rootIndex),[3,3]);assert.ok(report.samples.every(s=>s.reachedRoot&&s.inSelectedRoot));
  assert.equal(JSON.stringify(report).includes('Fake user text'),false);
  assert.equal(reader.contentRootFor(roots[0].querySelector('div')),null);
});

test('active root changes by layout alone and previous route messages cannot be read or jumped', t => {
  const {reader,doc}=setup(t,`<main id="first">${msg('user','old','Previous prompt')}</main><main id="second">${msg('user','current','Current prompt')}</main>`);
  rect(doc.documentElement,0,0,1024,768);const first=doc.getElementById('first'),second=doc.getElementById('second');
  rect(first,0,0,0,0);rect(second,260,0,764,768);reader.refresh();assert.deepEqual(Array.from(reader.messages,m=>m.id),['current']);
  const previous=reader.entries()[0];rect(first,260,0,764,768);rect(second,0,0,0,0);reader.refresh();
  assert.equal(reader.main,first);assert.deepEqual(Array.from(reader.messages,m=>m.id),['old']);assert.equal(reader.jump(previous),false);
  rect(first,-1024,0,764,768);reader.refresh();assert.equal(reader.main,null);assert.equal(reader.messages.length,0);
});

test('CSS-hidden, inert, owned and offscreen roots cannot beat the active main or role=main', t => {
  const {reader,doc}=setup(t,'<section style="visibility:hidden"><main id="hidden"><p>Cache</p></main></section><main inert>Inert</main><div data-cs-owned><main>Owned</main></div><div role="main" id="active"><p>Visible</p></div>');
  rect(doc.documentElement,0,0,1024,768);for(const root of doc.querySelectorAll('main,[role=main]'))rect(root,0,0,1024,768);
  assert.equal(reader.main,doc.getElementById('active'));
  assert.equal(reader.rootCandidates().length,3);
  doc.getElementById('active').style.display='none';assert.equal(reader.main,null);
});
