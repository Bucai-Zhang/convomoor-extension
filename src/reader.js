/* Independently written DOM reader. It reads rendered messages without requests. */
(() => {
  'use strict';
  const NS = globalThis.ChatShelf = globalThis.ChatShelf || {};
  const ROLE = '[data-message-author-role="user"],[data-message-author-role="assistant"]';
  // Attribute combinations observed in the user's 0.2.4 structural samples.
  // A paragraph, list item, code block or turn number alone is not a message.
  const USER_BUBBLE = '[data-user-message-bubble]';
  const ANSWER_BODY = '[data-dil-message-id][data-d-direction][data-d-inline-reveal]';
  const ANSWER_SOURCE = '[data-dil-source-message-id][data-chatgpt-copy-reference][data-markdown-copy]';
  const SEARCH_UNIT = '[data-chatgpt-search-message-ids][data-chatgpt-search-unit-key]';
  const OMIT = '[data-cs-owned],script,style,button,svg,nav,[hidden],[aria-hidden="true"]';
  const BLOCKS = 'p,div,section,article,li,ul,ol,blockquote,table,tr,h1,h2,h3,h4,h5,h6';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const normalize = value => String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const preview = value => normalize(value).replace(/\s+/g, ' ').slice(0, 500);
  function digest(value) {
    let h = 2166136261;
    for (let n = 0; n < value.length; n++) h = Math.imul(h ^ value.charCodeAt(n), 16777619);
    return (h >>> 0).toString(36);
  }
  function cleanClone(node, markdown = false) {
    const clone = node.cloneNode(true), doc = node.ownerDocument;
    const codeBlocks = [];
    clone.querySelectorAll(OMIT).forEach(n => n.remove());
    if (markdown) {
      // Fences export displayed code only; no attempt is made to fetch missing content.
      clone.querySelectorAll('pre').forEach(pre => {
        const code = pre.querySelector('code') || pre;
        const lang = [...code.classList].find(c => c.startsWith('language-'))?.slice(9).replace(/[^\w+-]/g, '') || '';
        const raw = code.textContent || '';
        const fence = '`'.repeat(Math.max(3, ...[...raw.matchAll(/`+/g)].map(m => m[0].length + 1)));
        // Prose whitespace cleanup must not alter indentation, tabs, blank lines
        // or trailing spaces inside code. Restore fenced blocks only afterwards.
        let token = `\uE000CHAT_SHELF_CODE_${codeBlocks.length}\uE001`;
        while (node.textContent.includes(token)) token += '_';
        codeBlocks.push({token, text: `${fence}${lang}\n${raw}${raw.endsWith('\n') ? '' : '\n'}${fence}`});
        pre.replaceWith(doc.createTextNode(`\n${token}\n`));
      });
      clone.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => h.prepend(doc.createTextNode(`${'#'.repeat(Number(h.tagName.slice(1)))} `)));
    }
    clone.querySelectorAll('br').forEach(n => n.replaceWith(doc.createTextNode('\n')));
    clone.querySelectorAll(BLOCKS).forEach(n => { n.prepend(doc.createTextNode('\n')); n.append(doc.createTextNode('\n')); });
    let text = normalize(clone.textContent);
    for (const block of codeBlocks) text = text.split(block.token).join(block.text);
    return text;
  }
  class Reader {
    constructor(root = document) {
      this.root = root; this.messages = []; this.entriesCache = [];
      this.ids = new WeakMap(); this.jumpTimers = new WeakMap();
      this.domMessages=[];this.retained=[];this.history=null;this.activeConversation=this.conversationId;
    }
    clearHistory(){this.history=null;this.historyAliases?.clear();this.historyText?.clear();this.retained=[];this.messages=this.domMessages.slice();}
    setHistory(value){
      if(value.conversationId!==this.conversationId)throw Error('历史目录与当前对话不匹配');this.history=value;this.retained=this.domMessages.slice();
      // Build these once per fetched snapshot, not quadratically on each scroll.
      this.historyAliases=new Map();this.historyText=new Map();
      for(const record of value.messages){for(const id of record.aliases)this.historyAliases.set(record.role+':'+id,record);const key=record.role+':'+normalize(record.text);this.historyText.set(key,this.historyText.has(key)?null:record);}
    }
    mergeMessages(dom){
      if(!this.history&&!this.retainUnmounted){this.retained=dom.slice();return dom;}
      const retained=this.retained.filter(m=>dom.some(n=>n.node===m.node)||(!m.node?.isConnected&&!this.history));
      for(let i=0;i<dom.length;i++){const m=dom[i],known=retained.findIndex(x=>x.id===m.id);if(known>=0)retained[known]=m;else{const next=dom.slice(i+1).find(n=>retained.some(x=>x.id===n.id));if(next)retained.splice(retained.findIndex(x=>x.id===next.id),0,m);else{const previous=dom.slice(0,i).reverse().find(n=>retained.some(x=>x.id===n.id));if(previous)retained.splice(retained.findIndex(x=>x.id===previous.id)+1,0,m);else retained.push(m);}}}
      this.retained=retained;
      if(!this.history)return retained;
      const used=new Set(),linked=new Map(),liveText=new Map();
      for(const m of dom){const key=m.role+':'+normalize(m.text);liveText.set(key,liveText.has(key)?null:m);}
      for(const m of dom){let record;for(const id of [m.id,...(m.aliases||[])]){record=this.historyAliases.get(m.role+':'+id);if(record)break;}
        if(!record){const key=m.role+':'+normalize(m.text);if(liveText.get(key)===m)record=this.historyText.get(key);}
        if(record&&!linked.has(record)){linked.set(record,m);used.add(m);}
      }
      const result=this.history.messages.map(record=>{
        const live=linked.get(record);
        if(live)return {...record,...live,id:record.id,aliases:[...new Set([...record.aliases,...(live.aliases||[]),live.id])],markdown:record.markdown};
        return {...record,node:null,headings:record.headings.map(h=>({...h,node:null}))};
      });
      for(const m of dom)if(!used.has(m))result.push(m);return result;
    }
    get conversationId() {
      const pathname = this.root.ownerDocument?.defaultView?.location.pathname || this.root.defaultView?.location.pathname || globalThis.location?.pathname || '';
      const id = pathname.match(/\/c\/([^/]+)\/?$/)?.[1];
      return id && UUID.test(id) ? id : null;
    }
    rootCandidates() {
      const selector = 'main,[role="main"]';
      return [...(this.root.matches?.(selector) ? [this.root] : []), ...this.root.querySelectorAll(selector)]
        .filter(node => !node.closest('[data-cs-owned]'));
    }
    rootInfo(node) {
      const win = node.ownerDocument.defaultView, rect = node.getBoundingClientRect();
      let available = this.eligible(node);
      for (let parent = node; available && parent; parent = parent.parentElement) {
        const style = win.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden' || style.opacity === '0') available = false;
      }
      const intersection = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
      return {node, available, hasBox: rect.width > 0 && rect.height > 0, intersection};
    }
    selectRoot() {
      const candidates = this.rootCandidates().map(node => this.rootInfo(node));
      const visible = candidates.filter(c => c.available && c.intersection > 0);
      // Prefer the outer main over a nested role=main scroller. Hidden or
      // offscreen cached SPA pages cannot win because they occur first in DOM.
      visible.sort((a, b) => b.intersection - a.intersection || Number(b.node.tagName === 'MAIN') - Number(a.node.tagName === 'MAIN'));
      if (visible.length) return {node: visible[0].node, reason: 'visible-viewport-root'};
      // Without a geometry engine (e.g. detached HTML fixtures), only semantic
      // roots remain available. A rendered browser with no visible root waits
      // for the next DOM/layout update instead of reading an inactive page.
      const doc = this.root.ownerDocument || this.root, box = doc.documentElement.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 || candidates.some(c => c.hasBox)) return {node: null, reason: 'no-visible-root'};
      const fallback = candidates.filter(c => c.available);
      fallback.sort((a, b) => Number(b.node.tagName === 'MAIN') - Number(a.node.tagName === 'MAIN'));
      return {node: fallback[0]?.node || null, reason: fallback.length ? 'no-layout-semantic-root' : 'no-eligible-root'};
    }
    get main() { return this.selectRoot().node; }
    contentRootFor(node) {
      if (!node?.isConnected || !this.eligible(node)) return null;
      // Probe the clicked visible root, even while a native transition is in
      // progress. Do not restrict sampling to a previously selected hidden main.
      const candidates = this.rootCandidates().map(root => this.rootInfo(root));
      const box = node.ownerDocument.documentElement.getBoundingClientRect();
      const hasLayout = box.width > 0 && box.height > 0 || candidates.some(c => c.hasBox);
      return candidates.filter(c => c.node.contains(node) && c.available && (!hasLayout || c.intersection > 0))
        .map(c => c.node).sort((a, b) => a.contains(b) ? 1 : b.contains(a) ? -1 : 0)[0] || null;
    }
    eligible(node) { return !node.closest('[data-cs-owned],script,style,[hidden],[inert],[aria-hidden="true"]'); }
    messageCandidates(main) {
      const records = [];
      for (const node of main.querySelectorAll(`${ROLE},${USER_BUBBLE},${ANSWER_BODY}`)) {
        if (!this.eligible(node) || !this.rootInfo(node).available) continue;
        const explicit = node.getAttribute('data-message-author-role');
        if (explicit === 'user' || explicit === 'assistant') {
          records.push({node, role: explicit, adapter: 'explicit-role'}); continue;
        }
        if (node.closest('pre,code,nav,aside,form,[contenteditable="true"]')) continue;
        const turn = node.closest('[data-turn-key]'), contentTurn = node.closest('[data-content-search-turn-key]'), unit = node.closest(SEARCH_UNIT);
        // The sampled content/search containers corroborate the message marker;
        // the whole turn can contain both authors and is never used as a row.
        if (!turn || !contentTurn || !unit || !main.contains(turn) || !turn.contains(contentTurn) || !contentTurn.contains(unit)) continue;
        if (node.matches(USER_BUBBLE) && !node.closest(ANSWER_SOURCE)) {
          records.push({node, role: 'user', adapter: 'sampled-markers', turn, unit});
        } else if (node.matches(ANSWER_BODY) && !node.closest(USER_BUBBLE)) {
          const source = node.closest(ANSWER_SOURCE);
          if (source && unit.contains(source)) records.push({node, role: 'assistant', adapter: 'sampled-markers', turn, unit, source});
        }
      }
      return records;
    }
    nativeMessageId(record, main) {
      const {node, role, adapter, turn, unit, source} = record;
      const valid = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,179}$/i.test(value.trim()) && !['__proto__', 'constructor', 'prototype'].includes(value.trim()) ? value.trim() : null;
      const ancestor = node.closest('[data-message-id]');
      const legacy = valid(node.getAttribute('data-message-id')) || (ancestor && main.contains(ancestor) ? valid(ancestor.getAttribute('data-message-id')) : null);
      if (legacy || adapter === 'explicit-role') return legacy;
      if (role === 'assistant') {
        const id = valid(node.getAttribute('data-dil-message-id')) || valid(source?.getAttribute('data-dil-source-message-id'));
        if (id) return id;
      }
      const searchIds = unit.getAttribute('data-chatgpt-search-message-ids');
      try {
        const ids = JSON.parse(searchIds);
        if (Array.isArray(ids) && ids.length === 1 && valid(ids[0])) return valid(ids[0]);
      } catch { if (UUID.test(searchIds || '')) return searchIds; }
      // Optional stable turn key for a single author body. Unknown key formats
      // fall back to the existing streamed-node/text identity, without requests.
      const key = valid(turn.getAttribute('data-turn-key'));
      const bodies = [...turn.querySelectorAll(role === 'user' ? USER_BUBBLE : ANSWER_BODY)].filter(n => this.eligible(n) && this.rootInfo(n).available);
      return key && bodies.length === 1 ? `turn:${role}:${key}` : null;
    }
    refresh() {
      if(this.activeConversation!==this.conversationId){this.clearHistory();this.ids=new WeakMap();this.activeConversation=this.conversationId;}
      const main = this.main;
      this.retainUnmounted=!!(main?.matches('[data-app-action-timeline-scroll]')||main?.querySelector('[data-app-action-timeline-scroll]'));
      if(main!==this.retainedRoot){this.retained=[];this.retainedRoot=main;}
      if (!main || !this.eligible(main)) { this.domMessages=[];this.messages=this.mergeMessages([]); this.entriesCache = []; return this.messages; }
      const seen = new Set(), occurrences = new Map(), output = [];
      const candidates = this.messageCandidates(main), roles = new Map(candidates.map(r => [r.node, r.role]));
      // Reserve IDs of surviving nodes before assigning IDs to new nodes. This
      // preserves a streamed node's identity even if a new identical message is
      // inserted before it and would otherwise reuse its original text hash.
      const reserved = new Set(candidates.filter(r => this.ids.has(r.node)).map(r => `${r.role}:${this.ids.get(r.node)}`));
      for (const record of candidates) {
        const {node, role, adapter} = record;
        let parent = node.parentElement, nested = false;
        while (parent && parent !== main) {
          if (roles.get(parent) === role) { nested = true; break; }
          parent = parent.parentElement;
        }
        if (nested) continue;
        const images = [...node.querySelectorAll('img')].filter(n => this.eligible(n)).map(n => ({alt: n.getAttribute('alt') || '', node: n}));
        const attachments = [...node.querySelectorAll('[data-testid*="attachment"],[data-testid*="file"],a[download]')].filter(n => this.eligible(n));
        const hasCode = [...node.querySelectorAll('pre,code')].some(n => this.eligible(n));
        let text = cleanClone(node);
        if (!text) {
          if (images.length) text = `图片消息（${images.length} 张${images.some(i => i.alt.trim()) ? `：${images.map(i => i.alt.trim()).filter(Boolean).join('、')}` : '；未提供文字说明'}）`;
          else if (attachments.length) text = '附件消息（页面未提供可读取的附件正文）';
          else if (node.querySelector('audio,video,canvas')) text = '非文本消息（当前页面未提供可读取的正文）';
          else text = '消息正文尚未显示';
        }
        const fingerprint = `${role}:${digest(text)}`;
        const occurrence = occurrences.get(fingerprint) || 0; occurrences.set(fingerprint, occurrence + 1);
        let id = this.nativeMessageId(record, main);
        if (!id) {
          const known = this.ids.get(node);
          const base = known || `dom-${fingerprint.replace(':', '-')}-${occurrence}`;
          id = base; let suffix = 1;
          while (seen.has(`${role}:${id}`) || (!known && reserved.has(`${role}:${id}`))) id = `${base}-${suffix++}`;
          this.ids.set(node, id);
        }
        const identity = `${role}:${id}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const headings = [...node.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => this.eligible(h) && !h.closest('pre,code')).map(h => ({level: Number(h.tagName.slice(1)), text: cleanClone(h), node: h})).filter(h => h.text);
        const aliases=[id];const unit=node.closest(SEARCH_UNIT);if(unit){const raw=unit.getAttribute('data-chatgpt-search-message-ids')||'';try{const values=JSON.parse(raw);if(Array.isArray(values))for(const value of values)if(typeof value==='string'&&value.length<=200)aliases.push(value);}catch{const ids=raw.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/ig);if(ids)aliases.push(...ids);}}
        const message = {id,aliases:[...new Set(aliases)], role, text, node, hasCode, headings, images, adapter};
        const time = [...node.querySelectorAll('time[datetime]')].find(n => this.eligible(n));
        if (time) { const value = Date.parse(time.getAttribute('datetime')); if (Number.isFinite(value)) message.timestamp = value; }
        output.push(message);
      }
      this.domMessages=output;this.messages = this.mergeMessages(output); this.entriesCache = [];
      return this.messages;
    }
    groups() {
      const groups = []; let current = null;
      for (const message of this.messages) {
        if (message.role === 'user' || !current) { current = []; groups.push(current); }
        current.push(message);
      }
      return groups;
    }
    entries({view = 'prompts', codeOnly = false, query = ''} = {}) {
      const level = {h1: 1, h2: 2, h3: 3}[view];
      const needle = normalize(query).toLocaleLowerCase();
      const promptsOnly = view === 'prompts' && this.messages.some(m => m.headings.length);
      const entries = [];
      for (const group of this.groups()) {
        if (codeOnly && !group.some(m => m.hasCode)) continue;
        if (needle && !group.some(m => m.text.toLocaleLowerCase().includes(needle))) continue;
        const user = group.find(m => m.role === 'user');
        if (user) entries.push({id: user.id, label: preview(user.text), node: user.node, role: user.role, messageId: user.id, level: 0, hasCode: group.some(m => m.hasCode)});
        if (promptsOnly && user) continue;
        for (const message of group.filter(m => m.role === 'assistant')) {
          if (level && message.headings.length) {
            message.headings.forEach((h, index) => {
              if (h.level <= level) entries.push({id: `${message.id}:h${h.level}:${index}`, label: preview(h.text), node: h.node, role: message.role, messageId: message.id, level: h.level, hasCode: message.hasCode});
            });
          } else entries.push({id: message.id, label: preview(message.text), node: message.node, role: message.role, messageId: message.id, level: 0, hasCode: message.hasCode});
        }
      }
      this.entriesCache = entries;
      return entries;
    }
    getByMessageId(id) { return this.messages.find(m => m.id === id||m.aliases?.includes(id)) || null; }
    diagnostics(samples = []) {
      // Read structure only: never serialize outerHTML, text, class names,
      // href/src, IDs, aria-labels, input values or browser storage.
      const doc = this.root.ownerDocument || this.root, win = doc.defaultView;
      const selection = this.selectRoot(), main = selection.node, tokens = new Map();
      const token = (name, value) => {
        if (!value) return null;
        const known = name === 'role' ? /^(main|article|list|listitem|button|textbox|navigation|complementary|region)$/ : name === 'component' ? /^(list-item|paragraph|text|heading|code-block|message|message-content|user-message|assistant-message|conversation|conversation-turn)$/ : /^(user|assistant)$/;
        if (known.test(value)) return value;
        const key = `${name}:${value}`;
        if (!tokens.has(key)) tokens.set(key, `${name}-${tokens.size + 1}`);
        return tokens.get(key);
      };
      const children = node => [...node.children].filter(n => this.eligible(n));
      const describe = node => {
        const rect = node.getBoundingClientRect();
        return {tag: node.tagName.toLowerCase(), attributes: [...node.attributes].map(a => a.name).sort(),
          component: token('component', node.getAttribute('data-d-component')),
          author: token('author', node.getAttribute('data-message-author-role')),
          role: token('role', node.getAttribute('role')), classCount: node.classList.length,
          childElements: children(node).length, textLength: node.textContent?.length || 0,
          box: {x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)},
          layout: {display: win.getComputedStyle(node).display, direction: win.getComputedStyle(node).flexDirection,
            overflowY: win.getComputedStyle(node).overflowY, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight}};
      };
      const counts = node => Object.fromEntries(Object.entries({roleUser: '[data-message-author-role="user"]', roleAssistant: '[data-message-author-role="assistant"]', userBubble: USER_BUBBLE, answerBody: ANSWER_BODY, answerSource: ANSWER_SOURCE, turnKey: '[data-turn-key]', contentTurnKey: '[data-content-search-turn-key]', searchUnit: SEARCH_UNIT, conversationTurn: '[data-testid^="conversation-turn-"]', turnId: '[data-turn-id]', messageId: '[data-message-id]', markdown: '.markdown', components: '[data-d-component]', frames: 'iframe'}).map(([key, selector]) => [key, [...node.querySelectorAll(selector)].filter(n => this.eligible(n)).length]));
      let budget = 180;
      const tree = (node, depth) => {
        if (budget-- <= 0) return null;
        const result = describe(node), all = children(node);
        if (depth > 0) result.children = all.slice(0, 24).map(n => tree(n, depth - 1)).filter(Boolean);
        if (all.length > 24 && depth > 0) result.childrenTruncated = all.length - 24;
        return result;
      };
      const location = win.location;
      return {version: '0.3.1', scope: 'structure-only-no-chat-text', hostname: location.hostname,
        routeKind: /\/c\/[^/]+/.test(location.pathname) ? (location.pathname.includes('/g/') ? 'project-conversation' : 'conversation') : 'other',
        readyState: doc.readyState, viewport: {width: win.innerWidth, height: win.innerHeight},
        indexedMessages: this.messages.length, readerStrategy: 'explicit-role+sampled-markers', rootSelection: selection.reason,
        recognized: {user: this.messages.filter(m => m.role === 'user').length, assistant: this.messages.filter(m => m.role === 'assistant').length, sampledMarkers: this.messages.filter(m => m.adapter === 'sampled-markers').length},
        documentCounts: counts(doc), roots: this.rootCandidates().slice(0, 12).map(n => ({...describe(n), selected: n === main, available: this.rootInfo(n).available, counts: counts(n)})),
        selectedRoot: main ? tree(main, 6) : null,
        samples: samples.slice(-2).map(({kind, node}) => {
          const chain = [], sampleRoot = this.contentRootFor(node); let reachedRoot = false;
          if (!sampleRoot) return {kind, disconnected: true};
          for (let n = node; n && chain.length < 24; n = n.parentElement) {
            const siblings = n.parentElement ? children(n.parentElement) : [];
            const position = siblings.indexOf(n), neighbours = siblings.slice(Math.max(0, position - 2), position + 3);
            chain.push({...describe(n), indexInParent: position, siblingCount: siblings.length,
              neighbours: neighbours.map(s => ({...describe(s), selected: s === n}))});
            if (n === sampleRoot) { reachedRoot = true; break; }
          }
          return {kind, rootIndex: this.rootCandidates().indexOf(sampleRoot), inSelectedRoot: !!main?.contains(node), reachedRoot, chain};
        }),
        limits: ['No messages are inferred from list items or turn parity.', 'Closed shadow roots and iframe contents are not inspected.', 'Attribute values outside structural enums are replaced or omitted.']};
    }
    getMessageMarkdown(idOrMessage) {
      const message = typeof idOrMessage === 'string' ? this.getByMessageId(idOrMessage) : idOrMessage;
      if (!message || !this.messages.includes(message)) return '';
      return message.markdown|| (message.node?.isConnected?cleanClone(message.node, true):'') || message.text;
    }
    jump(entryOrId) {
      const entry = typeof entryOrId === 'string' ? this.entriesCache.find(e => e.id === entryOrId) || this.getByMessageId(entryOrId) : entryOrId;
      const node = entry?.node;
      if (!node?.isConnected || !this.main?.contains(node) || !this.eligible(node)) return false;
      const doc = node.ownerDocument, win = doc.defaultView;
      if (!doc.querySelector('style[data-cs-owned="reader-style"]')) {
        const style = doc.createElement('style'); style.setAttribute('data-cs-owned', 'reader-style');
        style.textContent = '.chat-shelf-reader-target{outline:2px solid #a6cd58!important;outline-offset:5px;scroll-margin-top:90px}';
        (doc.head || doc.documentElement).append(style);
      }
      const reduceMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView?.({behavior: reduceMotion ? 'auto' : 'smooth', block: 'start'});
      node.classList.add('chat-shelf-reader-target');
      const previous = this.jumpTimers.get(node); if (previous) win.clearTimeout(previous);
      this.jumpTimers.set(node, win.setTimeout(() => { node.classList.remove('chat-shelf-reader-target'); this.jumpTimers.delete(node); }, 1400));
      return true;
    }
    getMarkdown() {
      const title = this.root.ownerDocument?.title || this.root.title || '当前对话';
      return `# ${title}\n\n${this.messages.map(m => `## ${m.role === 'user' ? '用户' : '助手'}\n\n${this.getMessageMarkdown(m)}`).join('\n\n---\n\n')}\n`;
    }
  }
  NS.Reader = Reader;
})();
