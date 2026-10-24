'use strict';
document.getElementById('toggle').addEventListener('click', async () => {
  const status = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url || '')) throw Error('请先打开 ChatGPT 标签页');
    await chrome.tabs.sendMessage(tab.id, {type: 'CS_TOGGLE'}); window.close();
  } catch (e) { status.textContent = e.message.includes('Receiving end') ? '请刷新 ChatGPT 页面，再打开侧栏' : e.message; }
});
document.getElementById('demo').addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('demo/index.html')}));
document.getElementById('cloud').addEventListener('click', () => chrome.runtime.openOptionsPage());

for (const [id, type] of [['export', 'CS_EXPORT'], ['minimap', 'CS_MINIMAP'], ['settings', 'CS_SETTINGS'], ['diagnostics', 'CS_DIAGNOSTICS']]) {
 document.getElementById(id).addEventListener('click', async () => {
  try {
   const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
   if (!tab?.id || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url || '')) throw Error('请先打开 ChatGPT 标签页');
   await chrome.tabs.sendMessage(tab.id,{type}); window.close();
  } catch(e) { document.getElementById('status').textContent='请刷新 ChatGPT 页面后重试：'+e.message; }
 });
}
