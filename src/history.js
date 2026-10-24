/* Independent current-branch history parser and virtualized navigation. */
(() => {
  'use strict';
  const NS=globalThis.ChatShelf ||= {};
  function parseConversation(data,conversationId){
    if(!data||typeof data.mapping!=='object'||!data.mapping||Array.isArray(data.mapping)||typeof data.current_node!=='string')throw Error('完整对话接口结构不受支持；保留页面目录');
    if((data.conversation_id&&data.conversation_id!==conversationId)||(data.id&&data.id!==conversationId))throw Error('完整对话身份不匹配');
    const mapping=data.mapping,keys=Object.keys(mapping);if(keys.length>50000)throw Error('对话节点超过安全读取上限；没有截断后冒充完整历史');
    const seen=new Set(),path=[];let key=data.current_node;
    while(key!=null){
      if(typeof key!=='string'||seen.has(key)||!Object.hasOwn(mapping,key))throw Error('当前分支父链不完整或存在循环');
      seen.add(key);const node=mapping[key];if(!node||typeof node!=='object')throw Error('对话节点无效');path.push({key,node});key=node.parent;
    }
    let characters=0;const messages=[];
    for(const {key,node}of path.reverse()){
      const m=node.message,role=m?.author?.role;if(!['user','assistant'].includes(role))continue;
      if(m.metadata?.is_visually_hidden_from_conversation||m.metadata?.is_hidden||m.channel==='analysis'||(m.recipient&&m.recipient!=='all'))continue;
      const c=m.content||{};let text='';
      if(Array.isArray(c.parts))text=c.parts.map(p=>typeof p==='string'?p:typeof p?.text==='string'?p.text:p?.content_type==='image_asset_pointer'?'[图片消息]':'[非文本附件]').join('\n');
      else if(typeof c.text==='string')text=c.text;
      else text='[当前接口未提供文本的消息]';
      characters+=text.length;if(characters>20000000)throw Error('对话正文超过安全读取上限；未返回伪完整结果');
      const id=typeof m.id==='string'&&m.id?m.id:key;
      const headings=[];let fence=null;for(const line of text.split('\n')){const f=line.match(/^\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1];else if(fence[0]===f[1][0]&&f[1].length>=fence.length&&/^\s*(`+|~+)\s*$/.test(line))fence=null;continue;}if(!fence){const h=line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);if(h)headings.push({level:h[1].length,text:h[2],node:null});}}
      messages.push({id,aliases:[...new Set([id,key])],role,text,node:null,headings,hasCode:/^\s*(`{3,}|~{3,})/m.test(text),images:[],adapter:'server-history',markdown:text,...(Number.isFinite(m.create_time)?{timestamp:m.create_time*1000}:{})});
    }
    return {conversationId,title:typeof data.title==='string'?data.title.slice(0,300):'当前对话',messages,complete:true,totalNodes:keys.length};
  }
  class HistoryLoader{
    constructor(reader,api,onChange=()=>{}){Object.assign(this,{reader,api,onChange,state:'idle',error:'',pending:null,abort:null,route:null});}
    async load({force=false}={}){
      const id=this.reader.conversationId;if(!id)throw Error('请打开已保存的对话');
      if(this.pending&&this.route===id)return this.pending;if(!force&&this.route===id&&this.state==='ready')return;
      this.cancel();this.route=id;const abort=new AbortController();this.abort=abort;this.state='loading';this.error='';this.onChange();
      this.pending=(async()=>{try{
        if(!this.api.account)await this.api.connect();else await this.api.assertAccount();
        const data=await this.api.conversation(id,abort.signal);const result=parseConversation(data,id);
        if(abort.signal.aborted||id!==this.reader.conversationId)return;
        this.reader.setHistory(result);this.reader.refresh();this.state='ready';
      }catch(e){if(!abort.signal.aborted){this.state='error';this.error=e.message||'完整历史读取失败';}}finally{if(this.abort===abort){this.pending=null;this.onChange();}}})();return this.pending;
    }
    cancel(){this.abort?.abort();this.abort=null;this.pending=null;}
    reset(){this.cancel();this.state='idle';this.error='';this.route=null;this.reader.clearHistory();}
  }
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  class VirtualNavigator{
    constructor(reader){this.reader=reader;this.sequence=0;this.release=null;}
    cancel(){this.sequence++;this.release?.();this.release=null;}
    async navigate(entry){
      this.cancel();const serial=this.sequence;
      if(this.reader.jump(entry))return true;
      const reader=this.reader,route=reader.conversationId,main=reader.main;
      if(!main)return false;
      const target=reader.messages.findIndex(m=>m.id===entry.messageId||m.id===entry.id);if(target<0)return false;
      const parents=[];for(let n=main.parentElement;n;n=n.parentElement)parents.push(n);
      const candidates=[...main.querySelectorAll('[data-app-action-timeline-scroll]'),main,...parents,...main.querySelectorAll('*'),document.scrollingElement].filter(Boolean);
      const scroller=candidates.find(n=>n.scrollHeight>n.clientHeight+2&&n.clientHeight>0&&/auto|scroll/.test(getComputedStyle(n).overflowY));
      if(!scroller)return false;const initial=scroller.scrollTop;let interrupted=false;
      const previousBehavior=scroller.style.getPropertyValue('scroll-behavior'),previousPriority=scroller.style.getPropertyPriority('scroll-behavior');scroller.style.setProperty('scroll-behavior','auto','important');
      const release=()=>{if(scroller.style.getPropertyValue('scroll-behavior')==='auto'&&scroller.style.getPropertyPriority('scroll-behavior')==='important'){if(previousBehavior)scroller.style.setProperty('scroll-behavior',previousBehavior,previousPriority);else scroller.style.removeProperty('scroll-behavior');}};this.release=release;
      const stop=()=>{interrupted=true;};const key=e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Escape'].includes(e.key))stop();};
      window.addEventListener('wheel',stop,{capture:true,passive:true});window.addEventListener('touchstart',stop,{capture:true,passive:true});window.addEventListener('keydown',key,true);
      let low=0,high=Math.max(0,scroller.scrollHeight-scroller.clientHeight),position=high*target/Math.max(1,reader.messages.length-1),success=false;
      try{for(let attempt=0;attempt<24;attempt++){
        if(interrupted||serial!==this.sequence||route!==reader.conversationId||!scroller.isConnected)return false;
        scroller.scrollTop=Math.max(0,Math.min(scroller.scrollHeight-scroller.clientHeight,position));await delay(160);reader.refresh();
        if(interrupted||serial!==this.sequence||route!==reader.conversationId||!scroller.isConnected)return false;
        const message=reader.getByMessageId(entry.messageId||entry.id);
        if(message?.node?.isConnected){
          const h=entry.level?message.headings.find(h=>h.level===entry.level&&h.text.replace(/\s+/g,' ').trim().slice(0,500)===entry.label.replace(/\s+/g,' ').trim()):null;
          success=reader.jump({...entry,node:h?.node||message.node});return success;
        }
        const mounted=reader.messages.map((m,i)=>({m,i})).filter(x=>x.m.node?.isConnected);
        if(mounted.length){const min=Math.min(...mounted.map(x=>x.i)),max=Math.max(...mounted.map(x=>x.i));if(target<min)high=Math.min(high,scroller.scrollTop);else if(target>max)low=Math.max(low,scroller.scrollTop);else position=Math.max(0,scroller.scrollTop+(attempt%2?1:-1)*scroller.clientHeight*.4);if(target<min||target>max)position=(low+high)/2;}
        else position=attempt%2?(low+high)/2:high*target/Math.max(1,reader.messages.length-1);
        if(high-low<4)position=Math.max(0,Math.min(scroller.scrollHeight-scroller.clientHeight,position+(attempt%2?1:-1)*scroller.clientHeight*.6));
      }return false;}finally{
        window.removeEventListener('wheel',stop,true);window.removeEventListener('touchstart',stop,true);window.removeEventListener('keydown',key,true);
        if(!success&&!interrupted&&route===reader.conversationId&&serial===this.sequence&&scroller.isConnected)scroller.scrollTop=initial;
        if(this.release===release){release();this.release=null;}
      }
    }
  }
  NS.parseConversation=parseConversation;NS.HistoryLoader=HistoryLoader;NS.VirtualNavigator=VirtualNavigator;
})();
