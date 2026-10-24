'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {sampledTurn} = require('./sampled-fixture.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/reader.js'), 'utf8');
function setup(t, html) {
  const dom = new JSDOM(`<main>${html}</main>`, {url:'https://chatgpt.com/g/p-fixture/c/00000000-0000-4000-8000-000000000001',runScripts:'outside-only'});
  t.after(()=>dom.window.close());dom.window.fetch=()=>{throw Error('NETWORK FORBIDDEN');};dom.window.eval(source);
  const reader=new dom.window.ChatShelf.Reader();reader.refresh();return {reader,doc:dom.window.document,w:dom.window};
}
test('sampled user bubbles and answer bodies become four ordered messages without legacy markers or list-item splitting',t=>{
  const {reader,doc}=setup(t,sampledTurn(1)+sampledTurn(2));
  assert.equal(doc.querySelectorAll('[data-message-author-role]').length,0);
  assert.deepEqual(Array.from(reader.messages,m=>[m.id,m.role,m.adapter]),[
    ['sample-user-1','user','sampled-markers'],['sample-answer-1','assistant','sampled-markers'],
    ['sample-user-2','user','sampled-markers'],['sample-answer-2','assistant','sampled-markers']]);
  assert.equal(reader.messages[0].text,'虚构问题1');assert.match(reader.messages[1].text,/第一项/);
  assert.ok(reader.messages.every(m=>!m.text.includes('操作控件')));
  assert.deepEqual(Array.from(reader.entries(),e=>e.label),['虚构问题1','虚构问题2']);
  const d=reader.diagnostics();assert.equal(d.recognized.sampledMarkers,4);assert.equal(d.documentCounts.roleUser,0);assert.equal(d.documentCounts.userBubble,2);
});
test('sampled answers retain heading search, code groups, exact jump and code whitespace export',t=>{
  const {reader,doc}=setup(t,sampledTurn(1,{answer:'<h2>代码结构</h2><p>详细解释</p><div data-code-block><button>复制代码</button><pre><code class="language-python"></code></pre></div>'})+sampledTurn(2));
  const raw='if True:\n    print("fixture")  \n\t# tab\n';doc.querySelector('code').textContent=raw;reader.refresh();
  const entries=reader.entries({view:'h2',codeOnly:true,query:'fixture'});
  assert.deepEqual(Array.from(entries,e=>e.label),['虚构问题1','代码结构']);let jumped=false;
  entries[1].node.scrollIntoView=()=>{jumped=true;};assert.equal(reader.jump(entries[1]),true);assert.equal(jumped,true);
  assert.ok(reader.getMarkdown().includes('```python\n'+raw+'```'));assert.equal(reader.getMarkdown().includes('复制代码'),false);
});
test('standalone or incomplete new markers, code examples and owned app content do not establish message roles',t=>{
  const incomplete='<div data-user-message-bubble>not a verified turn</div><div data-dil-message-id="x" data-d-direction data-d-inline-reveal>unverified answer</div>';
  const {reader,doc}=setup(t,incomplete+sampledTurn(1));assert.equal(reader.messages.length,2);
  const main=doc.querySelector('main');main.insertAdjacentHTML('beforeend',`<div data-cs-owned>${sampledTurn(2)}</div><pre>${sampledTurn(3)}</pre><aside>${sampledTurn(4)}</aside><div hidden>${sampledTurn(5)}</div><div style="display:none">${sampledTurn(6)}</div>`);
  reader.refresh();assert.equal(reader.messages.length,2);
  main.querySelector('[data-chatgpt-copy-reference]').removeAttribute('data-dil-source-message-id');reader.refresh();
  assert.deepEqual(Array.from(reader.messages,m=>m.role),['user']);
});
test('mixed legacy and sampled markup deduplicates overlapping bodies, and DOM order handles multiple assistant messages',t=>{
  const {reader,doc}=setup(t,sampledTurn(1));const user=doc.querySelector('[data-user-message-bubble]');user.setAttribute('data-message-author-role','user');user.setAttribute('data-message-id','sample-user-1');
  const answer=doc.querySelector('[data-dil-message-id]');answer.innerHTML+='<div data-message-author-role="assistant" data-message-id="sample-answer-1">duplicate nested legacy body</div>';
  const unit=answer.closest('[data-chatgpt-search-unit-key]'),copy=unit.cloneNode(true);copy.querySelector('[data-dil-message-id]').setAttribute('data-dil-message-id','sample-answer-branch');unit.after(copy);
  reader.refresh();assert.deepEqual(Array.from(reader.messages,m=>[m.id,m.role]),[['sample-user-1','user'],['sample-answer-1','assistant'],['sample-answer-branch','assistant']]);
});
test('streaming, node replacement and repeated prompts preserve distinct native identities',t=>{
  const {reader,doc}=setup(t,sampledTurn(1,{user:'重复提问'})+sampledTurn(2,{user:'重复提问'}));const ids=Array.from(reader.messages,m=>m.id);
  const body=doc.querySelector('[data-dil-message-id]');body.innerHTML+='<p>新流式内容</p>';reader.refresh();assert.deepEqual(Array.from(reader.messages,m=>m.id),ids);
  body.replaceWith(body.cloneNode(true));reader.refresh();assert.deepEqual(Array.from(reader.messages,m=>m.id),ids);
  assert.equal(new Set(reader.messages.filter(m=>m.role==='user').map(m=>m.id)).size,2);
});
test('empty or unsupported identity values fall back safely without losing the sampled role',t=>{
  const {reader,doc}=setup(t,sampledTurn(1));
  for(const n of doc.querySelectorAll('[data-chatgpt-search-message-ids]'))n.setAttribute('data-chatgpt-search-message-ids','unknown-format');
  doc.querySelector('[data-dil-message-id]').setAttribute('data-dil-message-id','');doc.querySelector('[data-dil-source-message-id]').setAttribute('data-dil-source-message-id','');
  reader.refresh();assert.deepEqual(Array.from(reader.messages,m=>m.id),['turn:user:sample-turn-1','turn:assistant:sample-turn-1']);
  doc.querySelector('[data-turn-key]').setAttribute('data-turn-key','unsupported key format');reader.refresh();assert.equal(reader.messages.length,2);assert.ok(reader.messages.every(m=>m.id.startsWith('dom-')));
});

test('replays the actual reported tag/attribute ancestry with fictional text and empty identifier values',t=>{
  const paths=require('./fixtures/reported-paths.json');const {reader,doc}=setup(t,'');const main=doc.querySelector('main');
  for(const sample of paths.samples){
    let leaf=null,child=null;
    for(const entry of sample.chain){
      const node=doc.createElement(entry.tag);for(const name of entry.attributes)node.setAttribute(name,'');
      if(child)node.append(child);else{leaf=node;node.textContent='Fictional '+sample.kind+' sample';}child=node;
    }
    assert.ok(leaf);main.append(child);
  }
  reader.refresh();assert.deepEqual(Array.from(reader.messages,m=>m.role),['user','assistant']);
  assert.equal(reader.messages[0].node.hasAttribute('data-user-message-bubble'),true);
  assert.equal(reader.messages[1].node.hasAttribute('data-dil-message-id'),true);
  assert.equal(reader.messages[1].hasCode,true);assert.equal(reader.messages.length,2);
});
