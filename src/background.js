'use strict';
importScripts('model.js');
importScripts('cloud.js');
importScripts('exporter.js');
ChatShelf.setupCloudWorker();
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const cloud=ChatShelf.cloudWorkerMessage(message,sender,reply);if(cloud!==null)return cloud;
  if(message?.type==='CS_PRINT'){
    if(sender.id!==chrome.runtime.id||!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(sender.url||'')){reply({ok:false,error:'导出来源无效'});return false;}
    (async()=>{const snapshot=ChatShelf.Export.validate(message.snapshot),key='print-'+crypto.randomUUID();
      const stale=Object.entries(await chrome.storage.session.get(null)).filter(([k,v])=>/^print-[a-f0-9-]{36}$/.test(k)&&Date.now()-v.createdAt>600000).map(([k])=>k);if(stale.length)await chrome.storage.session.remove(stale);
      await chrome.storage.session.set({[key]:{snapshot,createdAt:Date.now()}});
      try{await chrome.tabs.create({url:chrome.runtime.getURL('export.html')+'#'+key});}catch(e){await chrome.storage.session.remove(key);throw e;}
      reply({ok:true});
    })().catch(()=>reply({ok:false,error:'无法打开打印预览；对话可能过大或存储空间不足'}));return true;
  }
  if (message?.type !== 'CS_STORE') return false;
  const origin = (() => { try { return new URL(sender.url || '').origin; } catch { return ''; } })();
  if (sender.id !== chrome.runtime.id || !['https://chatgpt.com', 'https://chat.openai.com'].includes(origin) || !/^[a-f0-9]{64}$/.test(message.account || '')) {
    reply({ok: false, error: '本地存储请求来源无效'}); return false;
  }
  const task = async () => {
    const key = `chat-shelf:v1:${message.account}`;
    const saved = (await chrome.storage.local.get(key))[key];
    const state = saved ? ChatShelf.Model.validate(saved) : ChatShelf.Model.empty();
    const next = message.op ? ChatShelf.Model.reduce(state, message.op) : state;
    if (message.op) await chrome.storage.local.set({[key]: next});
    return next;
  };
  queue = queue.then(task, task);
  queue.then(state => reply({ok: true, state}), () => reply({ok: false, error: '本地保存失败；请检查存储空间或备份格式'}));
  return true;
});
