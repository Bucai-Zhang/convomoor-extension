/* Ephemeral print page: consumes its session-only payload once. */
(() => {'use strict';const status=document.getElementById('status'),print=document.getElementById('print');
 document.getElementById('close').onclick=()=>window.close();print.onclick=()=>window.print();
 (async()=>{const key=location.hash.slice(1);if(!/^print-[a-f0-9-]{36}$/.test(key))throw Error('打印凭证无效，请回到聊天重新导出');
  const data=(await chrome.storage.session.get(key))[key];await chrome.storage.session.remove(key);history.replaceState(null,'',location.pathname);
  if(!data||Date.now()-data.createdAt>600000)throw Error('临时导出已过期，请重新导出');
  const s=ChatShelf.Export.validate(data.snapshot);document.getElementById('document').innerHTML=ChatShelf.Export.body(s);document.title=s.title+' · ConvoMoor';status.textContent=`共 ${s.messages.length} 条消息；${s.complete?'当前分支完整目录':'部分导出'}。`;print.disabled=false;
 })().catch(e=>status.textContent=e.message);
})();
