/* Configuration stays in extension storage; this page never calls a provider. */
(() => {
  'use strict';
  const field = id => document.getElementById(id);
  let ready = false, busy = false, hasKey = false;
  function status(text, error = false) {
    field('status').textContent = text;
    field('status').classList.toggle('error', error);
  }
  function controls() { field('fields').disabled = !ready || busy; }
  function show(config) {
    if (!config || typeof config.hasKey !== 'boolean') throw Error('配置响应不兼容，请重新加载扩展后重试读取');
    field('base').value = config.baseURL || '';
    field('model').value = config.model || '';
    field('key').value = '';
    hasKey = !!config.hasKey;
    field('key').placeholder = hasKey ? 'Key 已保存；留空即可保留，无需重新填写' : '只在此页填写 API Key';
  }
  async function request(type, config) {
    const result = await chrome.runtime.sendMessage({type, ...(config ? {config} : {})});
    if (!result?.ok) throw Error(result?.error || '扩展后台没有确认操作，请重新加载扩展后再试');
    return result;
  }
  async function load() {
    ready = false; controls(); field('retry').hidden = true;
    status('正在读取此安装已保存的 API 配置…');
    try {
      const result = await request('CS_CLOUD_GET');
      show(result.config); ready = true;
      status(hasKey ? `已读取保存的配置，模型：${field('model').value}。Key 不回显，无需重新填写。` : '此安装尚未配置云端 API。');
    } catch (error) {
      status(`读取配置失败，未清除任何设置。请重试读取：${error.message}`, true);
      field('retry').hidden = false;
    } finally { controls(); }
  }
  field('api-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || busy) return;
    try {
      const config = ChatShelf.cloudConfig({baseURL: field('base').value, model: field('model').value});
      const apiKey = field('key').value.trim();
      if (!hasKey && !apiKey) { field('key').focus(); throw Error('首次配置请填写 API Key'); }
      const permission = chrome.permissions.request({origins: [config.origin + '/*']});
      busy = true; controls(); status('正在授权并保存到此安装…');
      if (!await permission) throw Error('未获得域名权限，配置没有保存');
      const result = await request('CS_CLOUD_SAVE', {baseURL: config.baseURL, model: config.model, apiKey});
      show(result.config);
      status('配置与 Key 已保存。关闭此页返回侧聊即可，无需再次填写；保存没有调用模型。');
    } catch (error) { status(error.message, true); }
    finally { busy = false; controls(); }
  });
  field('clear').addEventListener('click', async () => {
    if (!ready || busy) return;
    busy = true; controls();
    try { await request('CS_CLOUD_CLEAR'); show({hasKey: false}); status('已清除本安装的云端配置与 Key。'); }
    catch (error) { status(error.message, true); }
    finally { busy = false; controls(); }
  });
  field('retry').addEventListener('click', load);
  field('close').addEventListener('click', async () => {
    try {
      const tab = await globalThis.chrome?.tabs?.getCurrent?.();
      if (Number.isInteger(tab?.id) && chrome.tabs.remove) { await chrome.tabs.remove(tab.id); return; }
    } catch { /* A manually opened settings page may need the fallback. */ }
    window.close();
    setTimeout(() => { if (!window.closed) status('如浏览器未关闭此标签页，请按 Ctrl+W 返回。'); }, 150);
  });
  load();
})();
