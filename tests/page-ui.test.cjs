'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');const {id}=require('./helpers.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'../src',f),'utf8');
function setup(t,html,{content=false}={}){
 const dom=new JSDOM(`<body>${html}</body>`,{url:'https://chatgpt.com/c/'+id(1),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let requests=0,sends=0,onMessage;
 w.fetch=()=>{requests++;throw Error('NETWORK FORBIDDEN');};w.document.addEventListener('submit',e=>{e.preventDefault();sends++;});
 w.chrome={runtime:{id:'test-extension',onMessage:{addListener:fn=>onMessage=fn}},storage:{onChanged:{addListener(){}}}};
 for(const name of content?['model.js','store.js','api.js','ui.js','reader.js','page-ui.js','history.js','tools.js','content.js']:['reader.js','page-ui.js'])w.eval(read(name));
 t.after(()=>{if(content)w.dispatchEvent(new w.Event('pagehide'));assert.equal(requests,0);assert.equal(sends,0);w.close();});
 return {w,doc:w.document,NS:w.ChatShelf,message:m=>onMessage(m)};
}
test('history insertion rejects icon rail and profile portals even when they are the only navigation nodes',t=>{
 const {doc,NS}=setup(t,`<nav id="rail"><button>头像</button></nav><div role="menu"><nav id="account"><a href="/c/${id(8)}">菜单中的聊天</a><a href="/c/${id(9)}">另一聊天</a></nav></div><main>正文</main>`);
 doc.getElementById('rail').getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:42,bottom:900,width:42,height:900});assert.equal(NS.PageUI.historySlot(doc,doc.querySelector('main')),null);
});
test('explicit history and verified wide chat navigation are accepted, while a history-looking node inside a menu is rejected',t=>{
 const {doc,NS}=setup(t,'<nav id="wide"><div id="history">原生历史</div></nav><main>正文</main>');let slot=NS.PageUI.historySlot(doc,doc.querySelector('main'));assert.equal(slot.before.id,'history');
 doc.getElementById('history').remove();doc.getElementById('wide').innerHTML=`<section><a href="/c/${id(4)}">聊天一</a><a href="/g/project/c/${id(5)}">聊天二</a></section>`;slot=NS.PageUI.historySlot(doc,doc.querySelector('main'));assert.equal(slot.reason,'verified-chat-links');
 doc.getElementById('wide').setAttribute('role','menu');assert.equal(NS.PageUI.historySlot(doc,doc.querySelector('main')),null);
});
test('a wide child history cannot authorize mounting inside its narrow rail ancestor',t=>{
 const {doc,NS}=setup(t,'<nav id="rail"><section id="history">文本</section></nav><main>正文</main>');doc.getElementById('rail').getBoundingClientRect=()=>({left:0,top:0,right:42,bottom:900,width:42,height:900});assert.equal(NS.PageUI.historySlot(doc,doc.querySelector('main')),null);
});
test('composer is found outside main, with form anchor and hidden cached editors excluded',t=>{
 const {doc,NS}=setup(t,'<main hidden><form><textarea id="prompt-textarea">旧草稿</textarea></form></main><main id="active">正文</main><footer><form id="actual-form"><textarea id="prompt-textarea">当前草稿</textarea><button>发送</button></form></footer>');const reader=new NS.Reader();const location=NS.PageUI.composer(reader);assert.equal(location.reason,'composer-outside-main');assert.equal(location.anchor.id,'actual-form');assert.equal(location.editor.value,'当前草稿');
});
test('plaintext-only textbox with no form uses its native composer frame rather than a message editor or modal input',t=>{
 const {doc,NS}=setup(t,'<main><article><div role="textbox" contenteditable="true">消息内编辑</div></article></main><footer><div data-type="unified-composer" id="frame"><div role="textbox" contenteditable="plaintext-only">主输入</div></div></footer><section role="dialog"><div role="textbox" contenteditable="true">弹窗输入</div></section>');const location=NS.PageUI.composer(new NS.Reader());assert.equal(location.anchor.id,'frame');assert.equal(location.editor.textContent,'主输入');
});
test('ambiguous external editors and hidden composers cause safe no-match rather than editing another input',t=>{
 const {doc,NS}=setup(t,'<main>正文</main><footer><form><textarea name="prompt">甲</textarea></form><form><textarea name="prompt">乙</textarea></form></footer>');const reader=new NS.Reader();assert.equal(NS.PageUI.composer(reader),null);doc.querySelector('footer').hidden=true;assert.equal(NS.PageUI.composer(reader),null);
});
test('composer toolbar is not inserted as a horizontal sibling beside the native text input',t=>{
 const {NS}=setup(t,'<main><section><div id="frame" style="display:flex;flex-direction:row"><div><div id="prompt-textarea" contenteditable="true">草稿</div></div><button>发送</button></div></section></main>');assert.equal(NS.PageUI.composer(new NS.Reader()).anchor.id,'frame');
});
test('profile menu interactions do not acquire extension nodes, replace native items or move the local manager into the rail',async t=>{
 const {w,doc,message}=setup(t,'<nav id="rail"><button id="avatar">头像</button></nav><section id="native-sidebar">原生项目与历史</section><main><article data-message-author-role="user">虚构提问</article></main><footer><form><textarea id="prompt-textarea"></textarea></form></footer>',{content:true});
 let clicks=0;doc.getElementById('avatar').onclick=()=>{clicks++;let menu=doc.getElementById('profile');if(menu){menu.remove();return;}menu=doc.createElement('div');menu.id='profile';menu.setAttribute('role','menu');menu.innerHTML='<nav><button>个人资料</button><button>设置</button><button>退出登录</button></nav>';doc.body.append(menu);};
 const rail=doc.getElementById('rail').outerHTML;doc.getElementById('avatar').click();await new Promise(r=>setTimeout(r,230));assert.equal(doc.getElementById('rail').outerHTML,rail);assert.equal(doc.querySelector('#profile [data-cs-owned]'),null);assert.equal(doc.querySelector('#rail [data-cs-owned]'),null);assert.equal(doc.querySelector('#profile nav').children.length,3);assert.equal(doc.getElementById('chat-shelf-local-folders'),null);
 message({type:'CS_TOGGLE'});const root=doc.getElementById('chat-shelf-tools').shadowRoot;assert.ok(root.querySelector('#chat-shelf-extension'));assert.equal(root.querySelector('details').open,true);root.querySelector('[aria-label="关闭右侧面板"]').click();await new Promise(r=>setTimeout(r,230));assert.equal(doc.querySelector('#rail [data-cs-owned]'),null);doc.getElementById('avatar').click();assert.equal(clicks,2);assert.equal(doc.getElementById('profile'),null);
});
test('full content integration attaches export to external composer, tracks replacement, and offers popup fallback without a composer',async t=>{
 const {w,doc,message}=setup(t,'<nav><div id="history">历史</div></nav><main><article data-message-author-role="user">虚构正文</article></main><footer id="footer"><div data-type="unified-composer" id="frame"><div role="textbox" contenteditable="plaintext-only">原草稿</div><button>发送</button></div></footer>',{content:true});
 let bar=doc.querySelector('[data-cs-composer-tools]');assert.ok(bar);assert.equal(bar.nextElementSibling.id,'frame');assert.equal(doc.querySelector('main [data-cs-composer-tools]'),null);const button=bar.querySelector('[aria-label="导出当前对话"]');button.click();assert.equal(doc.querySelectorAll('[role="menuitem"]').length,3);assert.equal(doc.querySelector('[role="textbox"]').textContent,'原草稿');message({type:'CS_EXPORT'});assert.equal(doc.querySelectorAll('[role="menuitem"]').length,3);assert.equal(doc.getElementById('chat-shelf-tools').shadowRoot.querySelector('.dock').hidden,true);
 doc.getElementById('footer').innerHTML='<form id="new-form"><textarea id="prompt-textarea">新草稿</textarea></form>';await new Promise(r=>setTimeout(r,230));bar=doc.querySelector('[data-cs-composer-tools]');assert.equal(doc.querySelectorAll('[data-cs-composer-tools]').length,1);assert.equal(bar.nextElementSibling.id,'new-form');assert.equal(doc.querySelector('[role="menu"]'),null);
 doc.getElementById('footer').remove();await new Promise(r=>setTimeout(r,230));assert.equal(doc.querySelector('[data-cs-composer-tools]'),null);message({type:'CS_EXPORT'});assert.ok(doc.getElementById('chat-shelf-tools').shadowRoot.querySelector('[aria-label="导出当前对话为 HTML"]'));
});
test('fallback local manager returns to verified history after panel close, keeping its state and one instance',async t=>{
 const {doc,message}=setup(t,'<nav id="native"></nav><main>正文</main>',{content:true});message({type:'CS_TOGGLE'});const root=doc.getElementById('chat-shelf-tools').shadowRoot,node=root.querySelector('#chat-shelf-local-folders');assert.ok(node);doc.getElementById('native').innerHTML='<div id="history">新挂载的原生历史</div>';await new Promise(r=>setTimeout(r,230));root.querySelector('[aria-label="关闭右侧面板"]').click();await new Promise(r=>setTimeout(r,230));assert.equal(doc.getElementById('chat-shelf-local-folders'),node);assert.equal(node.nextElementSibling.id,'history');assert.equal(doc.querySelectorAll('#chat-shelf-extension').length,1);
});
