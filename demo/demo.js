/* All data in this fixture is fictional; no ChatGPT network calls. */
'use strict';
const fixtureTitles=['请解释操作系统中线程与进程的区别','用一个表格总结关键概念','给出一个最小 Python 示例','这个示例中的锁有什么作用','补充一段代码并解释输出','如果任务失败应当怎么处理','再给一个具体场景','归纳一下今天的学习重点','最后列出三个复习问题'];
const messages=document.getElementById('messages');
for(let i=0;i<fixtureTitles.length;i++){
 const user=document.createElement('article');user.className='user';user.dataset.messageAuthorRole='user';user.dataset.messageId='fixture_user_'+i;user.textContent=fixtureTitles[i];messages.append(user);
 const assistant=document.createElement('article');assistant.className='assistant';assistant.dataset.messageAuthorRole='assistant';assistant.dataset.messageId='fixture_assistant_'+i;
 const heading=document.createElement(i%3===0?'h1':i%3===1?'h2':'h3');heading.textContent=['关键概念与边界','示例及分步解释','实践中的注意事项'][i%3];assistant.append(heading);
 for(let j=0;j<3;j++){const p=document.createElement('p');p.textContent='这是一段虚构的测试回答，用来检查长对话小地图的定位、分组与滚动。先明确输入与约束，再观察执行过程，最后核对结果是否满足预期。此页面不会读取、发送或修改真实聊天。';assistant.append(p);}
 if(i%3===2){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent='def inspect_task(value):\n    return {"status": "checked", "value": value}\n\nprint(inspect_task(3))';pre.append(code);assistant.append(pre);}
 const time=document.createElement('time');time.dateTime='2026-10-23T10:'+String(i+10)+':00Z';time.textContent='';assistant.append(time);messages.append(assistant);
}
const details=document.createElement('details');details.id='chat-shelf-local-folders';details.setAttribute('data-cs-owned','true');const summary=document.createElement('summary');summary.textContent='▱ 本地文件夹与批量管理';summary.style.cssText='font-size:12px;padding:7px;cursor:pointer;';const managerHost=document.createElement('div');managerHost.id='chat-shelf-extension';details.append(summary,managerHost);document.getElementById('manager-slot').append(details);
const manager=new ChatShelf.Sidebar(managerHost,{api:new ChatShelf.DemoApi(),demo:true,onClose:()=>{details.open=false;}});
manager.useModalPortal();
class FixtureReader extends ChatShelf.Reader{get conversationId(){return '00000000-0000-4000-8000-000000000001';}}
// Synthetic regression mode: cached pages and optionally unknown message roles.
// These nodes are fictional; they do not claim to reproduce the user's message DOM.
const fixtureMode=new URLSearchParams(location.search).get('fixture');
if(['multiple','unknown','sampled'].includes(fixtureMode)){
 const cache=document.createElement('section');cache.hidden=true;
 cache.innerHTML='<main data-app-shell-main-surface data-codex-history-swipe-page><div role="main">Fictional cache A</div></main><main data-app-shell-main-surface>Fictional cache B</main>';
 document.body.prepend(cache);
 document.querySelector('.app main').setAttribute('data-app-shell-main-surface','');
 if(fixtureMode==='unknown')for(const node of messages.querySelectorAll('article')){node.removeAttribute('data-message-author-role');node.removeAttribute('data-message-id');node.setAttribute('data-d-component','message');}
}
if(fixtureMode==='sampled'){
 const articles=[...messages.querySelectorAll('article')];
 for(let i=0;i<articles.length;i+=2){
  const user=articles[i],answer=articles[i+1],turn=document.createElement('div'),content=document.createElement('div');
  turn.setAttribute('data-turn-key','fixture-turn-'+i);content.setAttribute('data-content-search-turn-key','fixture-turn-'+i);turn.append(content);
  for(const [node,role]of [[user,'user'],[answer,'assistant']]){
   const id=node.getAttribute('data-message-id');node.removeAttribute('data-message-author-role');node.removeAttribute('data-message-id');
   const unit=document.createElement('div');unit.setAttribute('data-chatgpt-search-message-ids',JSON.stringify([id]));unit.setAttribute('data-chatgpt-search-unit-key',id);unit.setAttribute('data-content-search-unit-key',id);
   if(role==='user'){node.setAttribute('data-user-message-bubble','');unit.append(node);}
   else{const source=document.createElement('div');source.setAttribute('data-dil-source-message-id',id);source.setAttribute('data-chatgpt-copy-reference','');source.setAttribute('data-markdown-copy','');node.setAttribute('data-dil-message-id',id);node.setAttribute('data-d-direction','ltr');node.setAttribute('data-d-inline-reveal','');source.append(node);unit.append(source);}
   content.append(unit);
  }
  messages.append(turn);
 }
}
let virtualData=null;
if(fixtureMode==='virtual'){
 virtualData={conversation_id:'00000000-0000-4000-8000-000000000001',title:'虚构长对话 · 60轮/120条消息',current_node:'root',mapping:{root:{parent:null,message:null}}};
 for(let i=0;i<120;i++){const id='fixture-full-'+i,role=i%2?'assistant':'user';virtualData.mapping[id]={parent:virtualData.current_node,message:{id,author:{role},content:{parts:[i%2?`## 第 ${(i+1)/2} 轮回答\n\n这是独立构造的虚拟滚动测试正文。只挂载五条，完整目录包含120条。`:`第 ${i/2+1} 轮：虚构长对话问题 ${i/2+1}`]}}};virtualData.current_node=id;}
 const records=ChatShelf.parseConversation(virtualData,virtualData.conversation_id).messages;
 messages.style.cssText='position:relative;height:calc(100vh - 210px);overflow-y:auto;scroll-behavior:auto;max-width:740px;padding:0;margin:0 auto;';messages.setAttribute('data-app-action-timeline-scroll','');
 const space=document.createElement('div'),visible=document.createElement('div');space.style.cssText='height:21600px;position:relative;';visible.style.cssText='position:absolute;left:20px;right:20px;';space.append(visible);messages.replaceChildren(space);
 const renderVirtual=()=>{const first=Math.min(115,Math.floor(messages.scrollTop/180));visible.style.top=(first*180)+'px';visible.replaceChildren();for(const m of records.slice(first,first+5)){const a=document.createElement('article');a.className=m.role;a.dataset.messageAuthorRole=m.role;a.dataset.messageId=m.id;a.style.cssText='height:180px;overflow:hidden;margin:0;padding:20px;border-radius:0;';if(m.role==='assistant'){const title=document.createElement('h2');title.textContent=m.headings[0].text;a.append(title);}const p=document.createElement('p');p.textContent=m.text.replace(/^##[^\n]*\n\n/,'');a.append(p);visible.append(a);}document.documentElement.dataset.fixtureMounted='5';};
 renderVirtual();messages.addEventListener('scroll',()=>{renderVirtual();if(globalThis.fixtureTools){fixtureTools.reader.refresh();fixtureTools.decorateMessages();fixtureTools.updateActive();}});
 const info=document.createElement('span');info.id='fixture-info';info.style.fontSize='10px';info.textContent='虚构虚拟滚动：挂载5条，完整目录待读取';document.querySelector('.chat-header').prepend(info);
}
const reader=new FixtureReader(document);reader.refresh();const toolHost=document.createElement('div');toolHost.id='chat-shelf-tools';toolHost.setAttribute('data-cs-owned','true');document.body.append(toolHost);const tools=new ChatShelf.Tools(toolHost,{manager,reader,demo:true});
tools.managerContainer=details;tools.onManagerDetached=()=>{details.open=false;details.style.margin='';details.style.maxWidth='';document.getElementById('manager-slot').append(details);};
if(virtualData){
 const loader=new ChatShelf.HistoryLoader(reader,{account:'fictional',assertAccount:async()=>{},conversation:async()=>structuredClone(virtualData)},()=>{tools.status='';tools.scheduleRender();document.getElementById('fixture-info').textContent=`虚构接口：目录 ${reader.messages.length} 条 / 60轮；DOM仅挂载5条`;document.documentElement.dataset.fixtureIndexed=String(reader.messages.length);});
 tools.historyLoader=loader;tools.onHistoryNeeded=(force=false)=>loader.load({force});globalThis.fixtureTools=tools;
}
if(fixtureMode==='cloud'){
 tools.cloudStatus={hasKey:true,model:'模拟模型（无真实API）'};tools.testCloudClient={generate:async(payload,delta)=>{let text='';for(const part of ['这是虚构的','流式侧聊回答，','用于验证显示和保存。']){await new Promise(r=>setTimeout(r,220));text+=part;delta(part);}return text;}};
 const banner=document.createElement('p');banner.textContent='模拟云端：没有Key、没有网络请求、不会产生费用';banner.style.cssText='font-size:11px;color:#9b751d;';document.querySelector('.chat-header').prepend(banner);
}
tools.decorateMessages();tools.attachComposer();tools.open('minimap');manager.safe(()=>manager.connect());
document.querySelector('form').addEventListener('submit',e=>e.preventDefault());document.getElementById('test-send').addEventListener('click',()=>{document.getElementById('test-send').title='这是虚构输入框，没有发送任何内容';});
document.getElementById('theme').addEventListener('click',()=>{const dark=document.documentElement.classList.toggle('dark');managerHost.toggleAttribute('data-dark',dark);toolHost.toggleAttribute('data-dark',dark);manager.portalHost?.toggleAttribute('data-dark',dark);});

document.getElementById('diagnostics').addEventListener('click',()=>tools.open('diagnostics'));
