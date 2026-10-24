/* Independent OpenAI-compatible streaming adapter. No bundled credentials. */
(() => {
 'use strict';const NS=globalThis.ChatShelf ||= {};
 function cloudConfig(value){
  const url=new URL(value?.baseURL||'');if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname.includes('..'))throw Error('API地址须为不含账号、查询参数的HTTPS地址');
  if(['chatgpt.com','chat.openai.com'].includes(url.hostname))throw Error('这里需要API服务地址，不能填写ChatGPT网页');
  const model=String(value.model||'').trim();if(!model||model.length>160||/[\u0000-\u001f]/.test(model))throw Error('请填写有效模型名');
  const baseURL=url.href.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
  return {baseURL,model,origin:url.origin,endpoint:baseURL+'/chat/completions'};
 }
 function cloudPayload(value){
  if(!Array.isArray(value?.messages)||!value.messages.length||value.messages.length>64)throw Error('侧聊消息数量无效');let length=0;
  const messages=value.messages.map(m=>{if(!['user','assistant','system'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())throw Error('侧聊消息格式无效');length+=m.content.length;return {role:m.role,content:m.content};});
  if(length>100000)throw Error('侧聊上下文超过100000字符，请缩短引用或新建侧聊');return messages;
 }
 async function streamCompletion(response,onDelta){
  if(!response.ok)throw Error(`云端接口返回HTTP ${response.status}；未自动重试`);
  if(!response.body?.getReader)throw Error('接口没有返回可读取的响应');
  if(!(response.headers?.get('content-type')||'').includes('text/event-stream')){
   const data=await response.json();const text=data?.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw Error('接口没有返回兼容的回答');if(text.length>200000)throw Error('回答超过安全显示上限');onDelta(text);return text;
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',complete=false,terminal=false;
  const frame=raw=>{const values=raw.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,''));if(!values.length)return;const body=values.join('\n');if(body==='[DONE]'){complete=true;terminal=true;return;}
   let data;try{data=JSON.parse(body);}catch{throw Error('云端流返回了不兼容的数据');}if(data.error)throw Error('云端在生成过程中返回错误；部分文本不视为完整回答');
   const choice=data.choices?.[0];if(choice?.finish_reason==='error')throw Error('云端生成失败；部分文本不视为完整回答');if(choice?.finish_reason)complete=true;const delta=choice?.delta?.content;
   if(typeof delta==='string'&&delta){text+=delta;if(text.length>200000)throw Error('回答超过安全显示上限');onDelta(delta);}
  };
  try{while(!terminal){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>1000000)throw Error('单个流事件过大');let match;while(!terminal&&(match=/\r?\n\r?\n/.exec(buffer))){frame(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}}
   buffer+=decoder.decode();if(!terminal&&buffer.trim())frame(buffer);if(!complete)throw Error('连接提前结束；已显示的部分文本不视为完整回答');if(!text.trim())throw Error('模型没有返回文本回答');return text;
  }finally{try{await reader.cancel();}catch{}reader.releaseLock?.();}
 }
 class CloudClient{
  constructor(){this.pending=null;}
  generate(payload,onDelta=()=>{}){
   if(this.pending)return Promise.reject(Error('已有侧聊生成任务'));if(!chrome.runtime?.connect)return Promise.reject(Error('云端侧聊需要安装扩展'));
   return new Promise((resolve,reject)=>{const port=chrome.runtime.connect({name:'CS_CLOUD_STREAM'}),task={port,reject};this.pending=task;
    const finish=(error,text)=>{if(this.pending!==task)return;this.pending=null;port.disconnect();error?reject(Error(error)):resolve(text);};
    let text='';port.onMessage.addListener(m=>{if(m.type==='delta'){text+=m.text;onDelta(m.text);}if(m.type==='done')finish(null,text);if(m.type==='error')finish(m.error||'云端生成失败');});
    port.onDisconnect.addListener(()=>{if(this.pending===task)finish('云端连接已关闭；请检查设置或重新提问');});port.postMessage({type:'generate',payload});
   });
  }
  cancel(){if(this.pending){const task=this.pending;this.pending=null;task.port.disconnect();task.reject(Error('已停止云端生成'));}}
  destroy(){this.cancel();}
 }
 function setupCloudWorker(){
  const storage=chrome.storage.local,key='chat-shelf:cloud-config';let queue=Promise.resolve();
  let protectedStorage=Promise.resolve(false);try{if(storage.setAccessLevel)protectedStorage=Promise.resolve(storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})).then(()=>true,()=>false);}catch{}
  const validSender=sender=>sender?.id===chrome.runtime.id&&/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(sender.url||'');
  const settingsSender=sender=>{try{const u=new URL(sender.url);return sender.id===chrome.runtime.id&&u.protocol==='chrome-extension:'&&u.hostname===chrome.runtime.id&&u.pathname==='/options.html';}catch{return false;}};
  const read=async()=> (await storage.get(key))[key]||{};
  const publicConfig=c=>({baseURL:c.baseURL||'',model:c.model||'',hasKey:!!c.apiKey});
  NS.cloudWorkerMessage=(message,sender,reply)=>{
   if(!['CS_CLOUD_STATUS','CS_CLOUD_GET','CS_CLOUD_SAVE','CS_CLOUD_CLEAR','CS_CLOUD_OPTIONS'].includes(message?.type))return null;
   if(message.type==='CS_CLOUD_OPTIONS'&&validSender(sender)){chrome.runtime.openOptionsPage();reply({ok:true});return false;}
   if(message.type==='CS_CLOUD_STATUS'&&validSender(sender)){read().then(c=>reply({ok:true,config:publicConfig(c)}),()=>reply({ok:false,error:'读取云端配置失败'}));return true;}
   if(!settingsSender(sender)){reply({ok:false,error:'API设置只允许从扩展自己的设置页修改'});return false;}
   const run=async()=>{const saved=await read();if(message.type==='CS_CLOUD_CLEAR'){await storage.remove(key);return {};}
    if(message.type==='CS_CLOUD_SAVE'){
     if(!await protectedStorage)throw Error('当前浏览器未能隔离扩展存储，停止保存Key');
     const config=cloudConfig(message.config);const apiKey=String(message.config.apiKey||'').trim()||(saved.baseURL===config.baseURL?saved.apiKey:'');
     if(!apiKey||apiKey.length>4096||/[\r\n]/.test(apiKey))throw Error('请填写API Key');
     if(!await chrome.permissions.contains({origins:[config.origin+'/*']}))throw Error('尚未获得该API域名权限');
     await storage.set({[key]:{baseURL:config.baseURL,model:config.model,apiKey}});return publicConfig({...config,apiKey});
    }return publicConfig(saved);
   };queue=queue.then(run,run);queue.then(config=>reply({ok:true,config}),e=>reply({ok:false,error:e.message}));return true;
  };
  chrome.runtime.onConnect?.addListener(port=>{
   if(port.name!=='CS_CLOUD_STREAM')return;if(!validSender(port.sender)){port.disconnect();return;}
   let started=false;const abort=new AbortController();port.onDisconnect.addListener(()=>abort.abort());
   const send=m=>{try{port.postMessage(m);}catch{abort.abort();}};
   port.onMessage.addListener(async message=>{if(started||message.type!=='generate')return;started=true;const timer=setTimeout(()=>abort.abort(),120000);
    try{if(!await protectedStorage)throw Error('当前浏览器未能隔离扩展存储，停止云端调用');const saved=await read(),config=cloudConfig(saved);if(!saved.apiKey)throw Error('请先在扩展云端API设置中填写Key');const messages=cloudPayload(message.payload);
     if(!await chrome.permissions.contains({origins:[config.origin+'/*']}))throw Error('API域名权限已撤销，请重新保存设置');
     const response=await fetch(config.endpoint,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:abort.signal,headers:{Authorization:`Bearer ${saved.apiKey}`,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({model:config.model,messages,stream:true})});
     await streamCompletion(response,text=>send({type:'delta',text}));send({type:'done'});
    }catch(e){send({type:'error',error:abort.signal.aborted?'生成已停止或超时；未自动重试':e.message});}finally{clearTimeout(timer);}
   });
  });
 }
 Object.assign(NS,{cloudConfig,cloudPayload,streamCompletion,CloudClient,setupCloudWorker});
})();
