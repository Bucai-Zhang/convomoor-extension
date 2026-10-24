(() => {
  'use strict';
  if (globalThis.__chatShelfInstalled) return;
  globalThis.__chatShelfInstalled = true;
  const details = document.createElement('details');
  details.id = 'chat-shelf-local-folders'; details.setAttribute('data-cs-owned', 'true');
  details.style.cssText = 'display:block;margin:4px 8px;font:12px/1.5 system-ui;max-width:310px;color:inherit;';
  const summary = document.createElement('summary');
  summary.textContent = '▱ 本地文件夹与批量管理';
  summary.title = '本地分类与 ChatGPT 项目独立；原生导航始终保留';
  summary.style.cssText = 'cursor:pointer;list-style-position:inside;padding:7px 5px;border-radius:6px;';
  const host = document.createElement('div'); host.id = 'chat-shelf-extension';
  details.append(summary, host);
  const manager = new ChatShelf.Sidebar(host, {api:new ChatShelf.Api(), onClose:() => { details.open = false;if(tools.active==='manager')tools.open(null); }});
  manager.useModalPortal();
  const reader = new ChatShelf.Reader(document); reader.refresh();
  const toolHost = document.createElement('div'); toolHost.id = 'chat-shelf-tools';
  toolHost.setAttribute('data-cs-owned', 'true'); document.body.append(toolHost);
  const tools = new ChatShelf.Tools(toolHost, {manager, reader});
  tools.managerContainer=details;
  const historyApi=new ChatShelf.Api();
  const historyLoader=new ChatShelf.HistoryLoader(reader,historyApi,()=>{tools.status='';tools.scheduleRender();});
  tools.historyLoader=historyLoader;
  tools.onHistoryNeeded=(force=false)=>{
    if(!reader.conversationId)return Promise.resolve();
    if(!force&&historyLoader.route===reader.conversationId&&historyLoader.state==='error')return Promise.resolve();
    return historyLoader.load({force});
  };
  let timer = null, current = location.pathname, disposed = false;
  function updateTheme() {
    const theme = manager.state.settings?.theme || 'auto';
    const dark = theme === 'dark' || (theme === 'auto' && (document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'));
    host.toggleAttribute('data-dark', dark); toolHost.toggleAttribute('data-dark', dark);manager.portalHost?.toggleAttribute('data-dark',dark);
  }
  function mount() {
    if (disposed) return;
    const slot=ChatShelf.PageUI.historySlot(document,reader.main);
    if(slot&&tools.active!=='manager'){
      details.style.margin='4px 8px';details.style.maxWidth='310px';
      if(details.parentElement!==slot.parent||(slot.before&&details.nextSibling!==slot.before))slot.parent.insertBefore(details,slot.before);
      details.hidden=false;
    }else if(tools.active!=='manager'){
      // Never guess a nav: it may be the 42px icon rail or the account menu.
      details.hidden=true;details.remove();
    }
    tools.managerInSidebar=!!slot;
    // Never hide, replace or intercept native sidebar/history/project nodes.
    if (current !== location.pathname) {
      current = location.pathname; manager.selected.clear(); tools.thread = []; tools.selection = ''; tools.question = '';
      historyLoader.reset();tools.navigator?.cancel();
    }
    reader.refresh(); tools.decorateMessages(); tools.attachComposer(); tools.render(); updateTheme();
    if(tools.active==='minimap')tools.onHistoryNeeded();
  }
  const schedule = () => { if (timer === null) timer = setTimeout(() => { timer = null; mount(); }, 180); };
  const observer = new MutationObserver(records => {
    const relevant = records.some(r => {
      const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (node?.closest('[data-cs-owned]')) return false;
      if (r.type === 'attributes' && r.attributeName === 'style' && node === tools.mainLayout?.node && node.style.getPropertyValue('margin-right') === tools.mainLayout.applied) {
        const before = document.createElement('div'); before.style.cssText = r.oldValue || ''; before.style.removeProperty('margin-right');
        const after = document.createElement('div'); after.style.cssText = node.getAttribute('style') || ''; after.style.removeProperty('margin-right');
        if (before.style.cssText === after.style.cssText) return false;
      }
      if (r.type === 'attributes' || r.type === 'characterData') return true;
      return [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 3 || !n.matches?.('[data-cs-owned]'));
    });
    if (relevant) schedule();
  });
  const layoutSettled = event => {
    const node = event.target;
    if (node?.nodeType === 1 && reader.rootCandidates().some(root => node === root || node.contains(root))) schedule();
  };
  document.addEventListener('transitionend', layoutSettled, true);
  document.addEventListener('animationend', layoutSettled, true);
  const observe = () => observer.observe(document.documentElement, {childList:true, subtree:true, characterData:true, attributes:true, attributeOldValue:true, attributeFilter:['class','style','hidden','inert','aria-hidden','data-theme','data-message-author-role','data-message-id','data-user-message-bubble','data-dil-message-id','data-d-direction','data-d-inline-reveal','data-dil-source-message-id','data-chatgpt-copy-reference','data-markdown-copy','data-chatgpt-search-message-ids','data-chatgpt-search-unit-key','data-content-search-turn-key','data-turn-key','contenteditable','role','id','data-type','data-testid','data-placeholder']});
  observe(); tools.onSettings = () => { updateTheme(); tools.decorateMessages(); };
  tools.onManagerDetached=schedule;
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'CS_TOGGLE') {
      if(tools.managerInSidebar&&tools.active!=='manager'){details.hidden=false;details.open=!details.open;if(details.open)details.scrollIntoView?.({block:'nearest'});}
      else tools.open('manager');
    }
    if (message?.type === 'CS_MINIMAP') tools.open('minimap');
    if (message?.type === 'CS_DIAGNOSTICS') tools.open('diagnostics');
    if (message?.type === 'CS_SETTINGS') tools.open('settings');
    if (message?.type === 'CS_EXPORT') {
      const button=document.querySelector('[data-cs-composer-tools] [aria-label="导出当前对话"]');
      if(button){tools.closeExportMenu();tools.toggleExportMenu(button);}else tools.open('export');
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && manager.store && changes[manager.store.key]?.newValue && !manager.busy) manager.safe(async () => {
      const next = ChatShelf.Model.validate(changes[manager.store.key].newValue);
      if (next.revision >= manager.state.revision) { manager.state = next; manager.render(); updateTheme(); }
    });
  });
  window.addEventListener('pagehide', event => {
    disposed = true; observer.disconnect(); clearTimeout(timer); timer = null;
    historyLoader.cancel();historyApi.token=null;tools.cloudClient?.cancel();tools.aiClient?.cancel?.();tools.navigator?.cancel();tools.closeExportMenu();
    tools.cancelProbe(); manager.abort?.abort(); manager.armed = false; manager.api.token = null; tools.restoreLayout();
    if (!event.persisted) { document.removeEventListener('transitionend', layoutSettled, true); document.removeEventListener('animationend', layoutSettled, true); tools.destroy(); manager.portalHost?.remove(); }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { disposed = false; historyLoader.reset();observe(); tools.render(); mount(); }
  });
  mount();
})();
