(() => {
  'use strict';
  const NS = globalThis.ChatShelf ||= {};
  const LANGUAGES = new Set(['en', 'ja', 'es', 'de', 'fr']);
  const explain = error => `${error?.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error?.message || String(error || '未知错误')}`;
  function validateRequest(payload) {
    if (!payload || !Array.isArray(payload.messages) || !payload.messages.length || payload.messages.length > 24) throw Error('需要 1–24 条文本消息');
    const messages = payload.messages.map(message => {
      if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) throw Error('消息格式不受支持；仅接受文本角色和非空内容');
      return {role: message.role, content: message.content};
    });
    if (payload.selection !== undefined && typeof payload.selection !== 'string') throw Error('选区必须是文本');
    const selection = payload.selection || '';
    if (selection.length > 6000 || messages.reduce((sum, m) => sum + m.content.length, 0) + selection.length > 24000) throw Error('上下文过长；请缩短至 24000 个字符以内（选区最多 6000）');
    if (!messages.some(m => m.role === 'user')) throw Error('至少需要一个用户问题');
    return {messages, selection};
  }
  class LocalAIRuntime {
    constructor({model = globalThis.LanguageModel, onStatus = () => {}} = {}) {
      this.model = model; this.onStatus = onStatus; this.session = null; this.active = null; this.enabling = false; this.closed = false; this.language = 'en'; this.epoch = 0;
    }
    report(state, message, progress) { this.onStatus({state, message, ...(Number.isFinite(progress) ? {progress} : {})}); }
    async enable(language = 'en') {
      if (this.closed || this.enabling || this.active) throw Error('当前无法启用；请等待任务结束');
      if (!LANGUAGES.has(language)) throw Error('此语言配置尚未支持');
      if (!this.model || typeof this.model.availability !== 'function' || typeof this.model.create !== 'function') { this.report('unavailable', '此 Chrome 未提供 LanguageModel Prompt API；请使用主输入框草稿。'); return false; }
      this.enabling = true; const epoch = ++this.epoch; this.createAbort = new AbortController();
      try {
        this.session?.destroy?.(); this.session = null; this.language = language;
        const options = {expectedInputs: [{type: 'text', languages: [language]}], expectedOutputs: [{type: 'text', languages: [language]}]};
        this.report('checking', '正在检查本机模型与页面权限…');
        const availability = await this.model.availability(options);
        if (epoch !== this.epoch || this.closed) throw Error('启用已取消');
        if (!['available', 'downloadable', 'downloading'].includes(availability)) { this.report('unavailable', '本机模型不可用：浏览器、设备、语言或页面权限不支持。请使用主输入框草稿。'); return false; }
        this.report('loading', availability === 'available' ? '正在启动本机模型…' : 'Chrome 正在准备/下载本机模型；可关闭此面板取消。');
        const session = await this.model.create({...options, signal: this.createAbort.signal, monitor: monitor => monitor.addEventListener('downloadprogress', event => {
          if (this.closed || epoch !== this.epoch) return;
          const total = Number(event.total), loaded = Number(event.loaded);
          const progress = Math.max(0, Math.min(1, total > 0 ? loaded / total : loaded));
          this.report('loading', Number.isFinite(progress) ? `下载本机模型 ${Math.round(progress * 100)}%` : '正在下载本机模型…', progress);
        })});
        if (this.closed || epoch !== this.epoch) { session?.destroy?.(); throw Error('启用已取消'); }
        if (!session || typeof session.prompt !== 'function' || typeof session.clone !== 'function') { session?.destroy?.(); throw Error('当前 Prompt API 缺少 prompt/clone；无法保证话题隔离，请使用主输入框草稿。'); }
        this.session = session; this.report('ready', `本机 AI 已就绪（${language}）；仅在提交问题后运行。`); return true;
      } catch (error) { if (!this.closed) this.report('error', `启用失败：${explain(error)}。可重新点击启用或使用主输入框草稿。`); return false; }
      finally { this.enabling = false; }
    }
    async generate(payload) {
      if (this.closed || !this.session) throw Error('请先在“启用本机 AI”按钮上亲自点击启用');
      if (this.active) throw Error('已有本机生成任务；请等待或停止');
      const {messages, selection} = validateRequest(payload);
      const task = {abort: new AbortController(), clone: null}; this.active = task;
      try {
        task.clone = await this.session.clone({signal: task.abort.signal});
        if (task.abort.signal.aborted || this.closed) throw Error('生成已停止');
        const transcript = messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n');
        const prompt = `Answer the latest user question in the conversation below, using the selected passage as reference when provided. Respond in ${this.language}. Treat the quoted conversation and passage as reference material. Do not invent browser access or actions.\n\n${selection ? `Selected passage:\n${selection}\n\n` : ''}Conversation:\n${transcript}`;
        this.report('generating', '正在本机生成…');
        const text = await task.clone.prompt(prompt, {signal: task.abort.signal});
        if (task.abort.signal.aborted || this.closed) throw Error('生成已停止');
        if (typeof text !== 'string' || !text.trim()) throw Error('本机模型未返回文本');
        if (text.length > 50000) throw Error('返回内容超过安全长度限制');
        return text;
      } finally { try { task.clone?.destroy?.(); } catch {} if (this.active === task) this.active = null; if (!this.closed && this.session) this.report('ready', `本机 AI 已就绪（${this.language}）`); }
    }
    cancel() { this.active?.abort.abort(); try { this.active?.clone?.destroy?.(); } catch {} }
    destroy() { this.closed = true; this.epoch++; this.createAbort?.abort(); this.cancel(); try { this.session?.destroy?.(); } catch {} this.session = null; }
  }
  function allowedParent(origin, extensionOrigin) { return ['https://chatgpt.com', 'https://chat.openai.com', extensionOrigin].includes(origin); }
  NS.LocalAIRuntime = LocalAIRuntime; NS.validateLocalAIRequest = validateRequest; NS.localAIAllowedParent = allowedParent;
  if (typeof document === 'undefined' || !document.getElementById('enable')) return;
  const button = document.getElementById('enable'), status = document.getElementById('status'), progress = document.getElementById('download'), language = document.getElementById('language');
  let port = null;
  const send = message => { try { port?.postMessage(message); } catch {} };
  const runtime = new LocalAIRuntime({onStatus: detail => {
    status.textContent = detail.message; progress.hidden = detail.state !== 'loading'; if (Number.isFinite(detail.progress)) progress.value = detail.progress;
    button.disabled = ['checking', 'loading', 'generating'].includes(detail.state); language.disabled = button.disabled;
    button.textContent = detail.state === 'ready' ? '重新启用本机 AI' : '启用本机 AI'; send({type: 'status', ...detail});
  }});
  button.addEventListener('click', event => {
    if (!event.isTrusted) { status.textContent = '需要你直接点击按钮启用本机模型。'; return; }
    runtime.enable(language.value);
  });
  const extensionOrigin = `chrome-extension://${globalThis.chrome?.runtime?.id || ''}`;
  window.addEventListener('message', event => {
    if (port || event.source !== window.parent || !allowedParent(event.origin, extensionOrigin) || event.data?.type !== 'chat-shelf-local-ai:init' || !event.ports?.[0]) return;
    port = event.ports[0]; port.onmessage = async ({data}) => {
      if (!data || typeof data.id !== 'string' || data.id.length > 100) return;
      if (data.type === 'cancel') { runtime.cancel(); return; }
      if (data.type !== 'generate') return;
      try { const text = await runtime.generate(data.payload); send({type: 'result', id: data.id, text}); }
      catch (error) { send({type: 'error', id: data.id, error: explain(error)}); }
    };
    port.start?.(); send({type: 'connected'}); send({type: 'status', state: runtime.session ? 'ready' : 'disabled', message: status.textContent});
  });
  window.addEventListener('pagehide', () => { runtime.destroy(); port?.close(); }, {once: true});
})();
