'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const {load,id}=require('./helpers.cjs');
function fixture(count=120){const mapping={root:{parent:null,message:null}};let parent='root';for(let i=0;i<count;i++){const key=id(i+100),role=i%2?'assistant':'user';mapping[key]={parent,message:{id:key,author:{role},content:{parts:[role==='user'?`虚构问题 ${i/2+1}`:`## 回答 ${(i+1)/2}\n\n独立测试正文\n\n\`\`\`js\nconst n = ${i};\n\`\`\``]},create_time:1000+i}};parent=key;}return {conversation_id:id(1),title:'虚构长对话',current_node:parent,mapping};}
module.exports={fixture};
test('120-message current branch is complete, excludes alternate branches, tools, analysis and hidden messages',()=>{
 const NS=load(['history.js']),data=fixture();data.mapping.alternate={parent:'root',message:{id:'alternate',author:{role:'user'},content:{parts:['不应出现的分支']}}};
 let parent=data.current_node;for(const [key,message]of Object.entries({tool:{author:{role:'tool'}},analysis:{author:{role:'assistant'},channel:'analysis'},hidden:{author:{role:'assistant'},metadata:{is_visually_hidden_from_conversation:true}}})){data.mapping[key]={parent,message};parent=key;}data.current_node=parent;
 const result=NS.parseConversation(data,id(1));assert.equal(result.messages.length,120);assert.equal(result.complete,true);assert.equal(result.messages[0].text,'虚构问题 1');assert.equal(result.messages.at(-1).headings[0].text,'回答 60');assert.ok(result.messages.at(-1).hasCode);assert.equal(result.messages.some(m=>m.id==='alternate'),false);
});
test('malformed chains and mismatching identities fail rather than pretending the result is complete',()=>{
 const NS=load(['history.js']);assert.throws(()=>NS.parseConversation({},id(1)),/结构/);const data=fixture(2);data.mapping.root.parent=data.current_node;assert.throws(()=>NS.parseConversation(data,id(1)),/循环/);assert.throws(()=>NS.parseConversation(fixture(),id(2)),/身份/);delete data.mapping[data.current_node];assert.throws(()=>NS.parseConversation(data,id(1)),/不完整/);
});
test('multimodal bodies use attachment descriptions and preserve text; code fences cannot create headings',()=>{
 const NS=load(['history.js']),data=fixture(2),m=data.mapping[data.current_node].message;m.content.parts=['解释图片',{content_type:'image_asset_pointer',asset_pointer:'private-file'},{text:'```md\n# code heading\n```\n## Actual heading'}];const result=NS.parseConversation(data,id(1));assert.match(result.messages[1].text,/图片消息/);assert.equal(result.messages[1].text.includes('private-file'),false);assert.deepEqual(Array.from(result.messages[1].headings,h=>h.text),['Actual heading']);
});
test('history loader coalesces concurrent reads, rejects stale route results and records error without fake history',async()=>{
 const NS=load(['history.js']);let resolve,reads=0,stored;const reader={conversationId:id(1),setHistory:v=>stored=v,refresh(){},clearHistory(){stored=null;}};
 const api={account:'test',assertAccount:async()=>{},conversation:async()=>{reads++;return new Promise(r=>resolve=r);}};const loader=new NS.HistoryLoader(reader,api);const pending=loader.load();await new Promise(r=>setImmediate(r));const other=loader.load();assert.equal(reads,1);reader.conversationId=id(2);resolve(fixture());await Promise.all([pending,other]);assert.equal(stored,undefined);
 loader.reset();api.conversation=async()=>{throw Error('schema unavailable');};await loader.load();assert.equal(loader.state,'error');assert.equal(stored,null);assert.match(loader.error,/unavailable/);
});
function virtual(t){const dom=new JSDOM('<main><div data-app-action-timeline-scroll style="overflow-y:auto"></div></main>',{url:'https://chatgpt.com/c/'+id(1),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());
 for(const f of ['reader.js','history.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'));
 const data=fixture(),records=w.ChatShelf.parseConversation(data,id(1)),scroller=w.document.querySelector('[data-app-action-timeline-scroll]');let top=0,jumped=null;
 function mount(){const index=Math.min(115,Math.floor(top/100));scroller.replaceChildren();for(const m of records.messages.slice(index,index+5)){const a=w.document.createElement('article');a.dataset.messageAuthorRole=m.role;a.dataset.messageId=m.id;a.textContent=m.text;a.scrollIntoView=()=>{jumped=m.id;};scroller.append(a);}}
 Object.defineProperties(scroller,{scrollHeight:{get:()=>12000},clientHeight:{get:()=>500},scrollTop:{get:()=>top,set:v=>{top=Math.max(0,Math.min(11500,v));mount();}}});mount();const reader=new w.ChatShelf.Reader();reader.refresh();reader.setHistory(records);reader.refresh();return {w,reader,scroller,getJump:()=>jumped};
}
test('only five mounted messages still yield 120 indexed messages and one click navigates to distant then first message',async t=>{
 const {w,reader,scroller,getJump}=virtual(t);assert.equal(reader.domMessages.length,5);assert.equal(reader.messages.length,120);const nav=new w.ChatShelf.VirtualNavigator(reader);
 assert.equal(await nav.navigate({id:id(219),messageId:id(219)}),true);assert.equal(getJump(),id(219));assert.equal(reader.domMessages.length,5);assert.equal(reader.messages.length,120);assert.ok(scroller.scrollTop>10000);
 assert.equal(await nav.navigate({id:id(100),messageId:id(100)}),true);assert.equal(getJump(),id(100));assert.equal(reader.messages.length,120);
});
test('user scroll cancels virtual navigation, and route changes clear the prior full catalog',async t=>{
 const {w,reader}=virtual(t),nav=new w.ChatShelf.VirtualNavigator(reader);const pending=nav.navigate({id:id(180),messageId:id(180)});w.dispatchEvent(new w.Event('wheel'));assert.equal(await pending,false);
 w.history.pushState({},'',`/c/${id(2)}`);w.document.querySelector('main').replaceChildren();reader.refresh();assert.equal(reader.history,null);assert.equal(reader.messages.length,0);assert.equal(reader.historyAliases.size,0);assert.equal(reader.historyText.size,0);
});
test('known virtual scroller retains seen messages across unmount, without fabricating unseen ones',t=>{
 const {reader,scroller}=virtual(t);reader.clearHistory();reader.refresh();assert.equal(reader.messages.length,5);scroller.scrollTop=1000;reader.refresh();assert.equal(reader.messages.length,10);assert.equal(reader.history,null);
});
test('rapid second navigation cancels stale task and restores original scrolling style without overriding new target',async t=>{
 const {w,reader,scroller}=virtual(t),nav=new w.ChatShelf.VirtualNavigator(reader);scroller.style.setProperty('scroll-behavior','smooth');const old=nav.navigate({id:id(180),messageId:id(180)});const node=scroller.querySelector('article');assert.ok(node);assert.equal(await nav.navigate({id:node.dataset.messageId,messageId:node.dataset.messageId,node}),true);assert.equal(await old,false);assert.equal(scroller.style.scrollBehavior,'smooth');assert.equal(scroller.style.getPropertyPriority('scroll-behavior'),'');
});
