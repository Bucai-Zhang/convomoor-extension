/* Independent page integration: only positively identified history and composers. */
(() => {
 'use strict';const NS=globalThis.ChatShelf ||= {};
 const PORTAL='[role="menu"],[role="dialog"],[role="alertdialog"],[popover],[data-radix-popper-content-wrapper]';
 const OWN='[data-cs-owned]';
 const MESSAGE='article,pre,code,[data-turn-key],[data-content-search-turn-key],[data-message-author-role],[data-user-message-bubble],[data-dil-message-id],[data-chatgpt-search-unit-key],[data-testid^="conversation-turn-"]';
 function available(node){
  if(!node?.isConnected||node.closest(`${OWN},[hidden],[inert],[aria-hidden="true"]`))return false;
  const win=node.ownerDocument.defaultView;
  for(let p=node;p;p=p.parentElement){const s=win.getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.contentVisibility==='hidden'||s.opacity==='0')return false;}
  const r=node.getBoundingClientRect();if(r.width||r.height)return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<win.innerWidth&&r.top<win.innerHeight;
  // Geometry-free fixtures only; never pick a zero-sized browser placeholder.
  const box=node.ownerDocument.documentElement.getBoundingClientRect();return !box.width&&!box.height;
 }
 function historySlot(doc,main){
  const safe=node=>{
   if(!available(node)||node.closest(PORTAL)||main?.contains(node))return false;
   const r=node.getBoundingClientRect(),m=main?.getBoundingClientRect();
   if(r.width&&r.width<160)return false;
   if(m?.width&&r.width&&(r.left>=m.left+30||r.left>doc.defaultView.innerWidth*.4))return false;
   for(let p=node;p&&p!==doc.body;p=p.parentElement){if(p.matches('nav,aside,[role="navigation"]')){const b=p.getBoundingClientRect();if(b.width&&b.width<160)return false;}}
   return true;
  };
  for(const history of doc.querySelectorAll('#history,[data-testid="history-sidebar"],[data-testid="sidebar-history"]')){
   if(safe(history)&&safe(history.parentElement))return {parent:history.parentElement,before:history,reason:'history-region'};
  }
  for(const nav of doc.querySelectorAll('nav[aria-label="Chat history"],nav,[role="navigation"],aside,#stage-slideover-sidebar,[data-testid="sidebar"],#sidebar')){
   if(!safe(nav))continue;
   const links=[...nav.querySelectorAll('a[href]')].filter(a=>!a.closest(`${OWN},${PORTAL}`)&&/\/(?:g\/[^/]+\/)?c\/[a-f0-9-]{36}(?:[?#]|$)/i.test(a.getAttribute('href')||''));
   if(links.length<2)continue;
   let region=links[0].parentElement;while(region&&region!==nav&&!links.every(a=>region.contains(a)))region=region.parentElement;
   if(region&&region!==nav&&safe(region)&&safe(region.parentElement))return {parent:region.parentElement,before:region,reason:'verified-chat-links'};
   return {parent:nav,before:null,reason:'verified-chat-navigation'};
  }
  return null;
 }
 function composer(reader){
  const main=reader.main;if(!main)return null;const doc=main.ownerDocument;
  const explicit='#prompt-textarea,[data-testid="prompt-textarea"],[data-testid="composer-text-input"],textarea[name="prompt"],[role="textbox"][contenteditable="true"],[role="textbox"][contenteditable="plaintext-only"]';
  const generic='textarea,[contenteditable="true"],[contenteditable="plaintext-only"],[contenteditable=""][role="textbox"]';
  const isEditor=e=>e.tagName==='TEXTAREA'||e.hasAttribute('contenteditable')&&e.getAttribute('contenteditable')!=='false';
  const safe=e=>{
   if(!isEditor(e)||!available(e)||e.matches(':disabled,[readonly]')||e.closest(`${PORTAL},nav,aside,[role="navigation"],${MESSAGE}`))return false;
   const root=e.closest('main,[role="main"]');return !root||root===main||main.contains(root);
  };
  const strong=[...doc.querySelectorAll(explicit)].filter(safe);
  const inside=strong.filter(e=>main.contains(e));let editor=inside.length===1?inside[0]:strong.length===1?strong[0]:null;
  if(!editor){
   const candidates=[...doc.querySelectorAll(generic)].filter(e=>{if(!safe(e))return false;if(main.contains(e)||e.closest('form,[data-type="unified-composer"],[data-testid="composer"],[data-app-composer]'))return true;const r=e.getBoundingClientRect(),m=main.getBoundingClientRect();return r.width>=160&&r.top>doc.defaultView.innerHeight*.45&&r.left>=m.left-16;});
   const outer=candidates.filter(e=>!candidates.some(other=>other!==e&&other.contains(e)));
   if(outer.length===1)editor=outer[0];
  }
  if(!editor)return null;
  let anchor=editor.closest('[data-type="unified-composer"],[data-testid="composer"],[data-app-composer]')||editor.closest('form')||editor.parentElement;
  if(!anchor||anchor===main||anchor===doc.body||anchor.contains(main)||anchor.closest(PORTAL))return null;
  // A large form can wrap the entire transcript. Insert beside the input's
  // local wrapper instead, without changing native dimensions or overflow.
  const rect=anchor.getBoundingClientRect();if(rect.height>doc.defaultView.innerHeight*.55)anchor=editor.parentElement;
  if(!anchor?.parentElement||anchor===main||anchor.contains(main))return null;
  // Do not make a toolbar another horizontal child beside the textbox.
  for(let i=0;i<5;i++){
   const p=anchor.parentElement;if(!p||p===doc.body||p===main||p.contains(main))break;
   const style=doc.defaultView.getComputedStyle(p),r=p.getBoundingClientRect();
   if(style.display!=='flex'||!['row','row-reverse',''].includes(style.flexDirection)||r.height>doc.defaultView.innerHeight*.55||p.querySelector(MESSAGE))break;
   anchor=p;
  }
  return {editor,anchor,reason:main.contains(editor)?'composer-in-main':'composer-outside-main'};
 }
 NS.PageUI={available,historySlot,composer};
})();
