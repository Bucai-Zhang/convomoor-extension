(() => {
  'use strict';
  const NS = globalThis.ChatShelf ||= {};
  class LocalAIClient {
    constructor(container, {readyTimeoutMs = 30000, generateTimeoutMs = 120000, onStatus = () => {}} = {}) {
      this.container = container; this.readyTimeoutMs = readyTimeoutMs; this.generateTimeoutMs = generateTimeoutMs; this.onStatus = onStatus;
      this.frame = null; this.port = null; this.connection = null; this.pending = null; this.state = 'disabled'; this.sequence = 0; this.epoch = 0;
    }
    ensureFrame() {
      if (this.connection) return this.connection;
      if (!globalThis.chrome?.runtime?.getURL) return Promise.reject(Error('本机 AI 需要在已安装的 Chrome 扩展中使用；网页演示请使用主输入框草稿'));
      const epoch = ++this.epoch;
      this.connection = new Promise((resolve, reject) => {
        const frame = document.createElement('iframe'); this.frame = frame;
        frame.title = 'ConvoMoor 本机 AI：手动启用'; frame.allow = 'language-model'; frame.src = chrome.runtime.getURL('local-ai.html');
        frame.style.cssText = 'display:block;width:100%;height:170px;flex:0 0 170px;border:0;border-radius:6px;';
        const channel = new MessageChannel(); this.port = channel.port1;
        const timer = setTimeout(() => { reject(Error('本机 AI 页面连接超时；可能被网站权限策略阻止')); this.destroy(); }, this.readyTimeoutMs);
        this.rejectConnection = reject; this.connectionTimer = timer;
        channel.port1.onmessage = ({data}) => {
          if (epoch !== this.epoch || !data) return;
          if (data.type === 'connected') { clearTimeout(timer); this.rejectConnection = null; resolve(this); }
          if (data.type === 'status') { this.state = data.state; this.onStatus(data); }
          if (!this.pending || data.id !== this.pending.id) return;
          if (data.type === 'result' || data.type === 'error') {
            const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
            if (data.type === 'error') pending.reject(Error(data.error || '本机生成失败'));
            else if (typeof data.text !== 'string' || data.text.length > 50000 || !data.text.trim()) pending.reject(Error('本机 AI 返回格式不正确'));
            else pending.resolve(data.text);
          }
        };
        channel.port1.start?.();
        frame.addEventListener('load', () => { if (epoch === this.epoch) frame.contentWindow.postMessage({type: 'chat-shelf-local-ai:init'}, `chrome-extension://${chrome.runtime.id}`, [channel.port2]); }, {once: true});
        frame.addEventListener('error', () => { reject(Error('无法加载本机 AI 页面')); this.destroy(); }, {once: true});
        this.container.appendChild(frame);
      });
      return this.connection;
    }
    async generate(payload) {
      await this.ensureFrame();
      if (this.pending) throw Error('已有本机生成任务；请等待或停止');
      if (this.state !== 'ready') throw Error('请先点击“启用本机 AI”并等待就绪；不支持时可使用主输入框草稿');
      return new Promise((resolve, reject) => {
        const id = `local-ai-${++this.sequence}`;
        const timer = setTimeout(() => { reject(Error('本机 AI 生成超时；已停止并释放面板，可重新启用')); this.destroy(); }, this.generateTimeoutMs);
        this.pending = {id, resolve, reject, timer};
        try { this.port.postMessage({type: 'generate', id, payload}); }
        catch (error) { clearTimeout(timer); this.pending = null; reject(error); }
      });
    }
    cancel() {
      if (!this.pending) return;
      const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
      try { this.port?.postMessage({type: 'cancel', id: pending.id}); } catch {}
      pending.reject(Error('本机生成已停止'));
    }
    destroy() {
      this.epoch++; this.cancel(); clearTimeout(this.connectionTimer); this.rejectConnection?.(Error('本机 AI 面板已关闭')); this.rejectConnection = null;
      this.port?.close(); this.port = null; this.frame?.remove(); this.frame = null; this.connection = null; this.state = 'disabled';
    }
  }
  NS.LocalAIClient = LocalAIClient;
})();
