/* Explicit localhost/extension test harness. All identities and replies are fictional. */
(() => {'use strict';
 const account='a'.repeat(64),data={},listeners=[];let mainSends=0;
 class FixtureApi extends ChatShelf.DemoApi {
  constructor(){super();this.account=account;}
  async conversation(id){return {conversation_id:id,title:'虚构HAVING示例',current_node:'answer',mapping:{root:{parent:null,message:null},question:{parent:'root',message:{id:'fixture-question',author:{role:'user'},content:{parts:['请用虚构示例解释 HAVING COUNT(*)。']}}},answer:{parent:'question',message:{id:'fixture-answer',author:{role:'assistant'},content:{parts:['## 按分组结果筛选\n\n全部内容为虚构数据。\n\n```sql\nSELECT department, COUNT(*)\nFROM fictional_employee\nGROUP BY department\nHAVING COUNT(*) > 3;\n```']}}}}};}
 }
 ChatShelf.Api=FixtureApi;
 globalThis.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async m=>{if(m.type!=='CS_STORE')return {ok:false,error:'本页只验证虚构界面，不调用真实服务'};const state=data[m.account]||ChatShelf.Model.empty();const next=m.op?ChatShelf.Model.reduce(state,m.op):state;data[m.account]=next;return {ok:true,state:next};}},storage:{onChanged:{addListener(){}}}};
 // A valid fictional route lets the same production content script parse IDs.
 Object.defineProperty(ChatShelf.Reader.prototype,'conversationId',{get(){return '00000000-0000-4000-8000-000000000001';}});
 const avatar=document.getElementById('avatar'),profile=document.getElementById('profile');avatar.onclick=()=>{profile.hidden=!profile.hidden;avatar.setAttribute('aria-expanded',String(!profile.hidden));};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){profile.hidden=true;avatar.setAttribute('aria-expanded','false');}});
 document.getElementById('test-export').onclick=()=>listeners.forEach(fn=>fn({type:'CS_EXPORT'}));document.getElementById('test-manager').onclick=()=>listeners.forEach(fn=>fn({type:'CS_TOGGLE'}));
 document.getElementById('native-send').onclick=()=>{mainSends++;document.documentElement.dataset.mainSends=String(mainSends);};document.documentElement.dataset.mainSends='0';
 document.getElementById('theme').onclick=()=>document.documentElement.classList.toggle('dark');
})();
