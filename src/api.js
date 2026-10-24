(() => {
  'use strict';
  const NS = globalThis.ChatShelf;
  class ApiError extends Error { constructor(message, props = {}) { super(message); Object.assign(this, props); } }
  class Api {
    constructor(fetcher = globalThis.fetch.bind(globalThis), origin = globalThis.location.origin) {
      if (!['https://chatgpt.com', 'https://chat.openai.com'].includes(origin)) throw Error('仅支持 ChatGPT 网站');
      this.fetcher = fetcher; this.origin = origin; this.token = null; this.account = null;
    }
    async request(path, {method = 'GET', body, token = this.token, signal} = {}) {
      const mutation = method !== 'GET';
      const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20000);
      const cancel = () => abort.abort(); signal?.addEventListener('abort', cancel, {once: true});
      if (signal?.aborted) abort.abort();
      try {
        const response = await this.fetcher(`${this.origin}${path}`, {
          method, credentials: 'include', cache: 'no-store', redirect: 'error', signal: abort.signal,
          headers: {Accept: 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
          ...(body ? {body: JSON.stringify(body)} : {})
        });
        if (!response.ok) {
          const text = response.status === 429 ? '请求受到限流；请稍后刷新核对，不会自动重试' :
            [401, 403].includes(response.status) ? '登录已过期或网站拒绝请求；请重新登录并连接' : `接口返回 HTTP ${response.status}`;
          throw new ApiError(text, {status: response.status, uncertain: mutation && response.status >= 500});
        }
        if (response.status === 204) return {success: true};
        let data;
        try { data = await response.json(); } catch { throw new ApiError('接口没有返回有效 JSON；请刷新核对', {uncertain: mutation}); }
        if (!data || typeof data !== 'object' || data.success === false || data.error) throw new ApiError('接口未确认操作成功；请刷新核对', {uncertain: mutation});
        if (mutation && data.success !== true) throw new ApiError('接口未明确确认写入成功；请刷新核对', {uncertain: true});
        return data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(mutation ? '请求中断或超时；服务器可能已处理，请刷新核对，勿直接重试' : '读取失败或超时，请检查登录与网络', {uncertain: mutation});
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    }
    async session() {
      const data = await this.request('/api/auth/session', {token: null});
      if (typeof data.user?.id !== 'string' || !data.user.id || typeof data.accessToken !== 'string' || !data.accessToken) throw Error('无法读取登录身份；当前网站接口可能已变化');
      // Token stays only in the content script's isolated memory, never storage or exports.
      this.token = data.accessToken;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chat-shelf:${data.user.id}`));
      return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    }
    async connect() { this.account = await this.session(); return this.account; }
    async assertAccount() {
      if (!this.account || await this.session() !== this.account) { this.token = null; throw Error('ChatGPT 账号发生变化，请刷新页面重新连接'); }
    }
    async list({offset = 0, archived = false} = {}) {
      await this.assertAccount();
      const data = await this.request(`/backend-api/conversations?${new URLSearchParams({offset: String(offset), limit: '50', order: 'updated', is_archived: String(archived)})}`);
      if (!Array.isArray(data.items) || data.items.some(c => !c || !NS.Model.UUID.test(c.id) || typeof c.title !== 'string')) throw Error('聊天列表结构已变化；停止读取');
      const total = Number.isFinite(data.total) ? data.total : null;
      return {items: data.items.map(c => ({id: c.id, title: c.title || '未命名对话', archived, updatedAt: c.update_time || ''})), next: offset + data.items.length,
        hasMore: data.items.length > 0 && (total === null ? data.items.length === 50 : offset + data.items.length < total), total};
    }
    async mutate(id, action, signal) {
      if (!NS.Model.UUID.test(id) || !['archive', 'unarchive', 'delete'].includes(action)) throw Error('操作参数不合法');
      // Recheck identity for every item, including an account switch mid-batch.
      await this.assertAccount();
      return this.request(`/backend-api/conversation/${id}`, {method: 'PATCH', signal,
        body: action === 'delete' ? {is_visible: false} : {is_archived: action === 'archive'}});
    }
    async conversation(id,signal){
      if(!NS.Model.UUID.test(id))throw Error('对话ID不合法');await this.assertAccount();
      const result=await this.request(`/backend-api/conversation/${id}`,{signal});
      await this.assertAccount();return result;
    }
  }
  class DemoApi {
    constructor() {
      this.account = 'demo';
      this.items = Array.from({length: 12}, (_, i) => ({id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        title: ['深入理解计算机网络', '周末旅行计划', 'React 状态管理思路', '论文阅读与笔记', 'Python 数据分析', '我的每周复盘', '数据库实验整理', '早餐灵感清单', '面试准备', '设计一个小工具', '读书摘录', '已完成的练习'][i], archived: i === 11, updatedAt: ''}));
    }
    async connect() { return this.account; }
    async assertAccount() {}
    async list({archived = false} = {}) { return {items: this.items.filter(c => c.archived === archived).map(c => ({...c})), next: 12, hasMore: false, total: 12}; }
    async mutate(id, action, signal) {
      if (signal?.aborted) throw Error('已停止');
      const found = this.items.find(c => c.id === id); if (!found) throw Error('模拟对话不存在');
      if (action === 'delete') this.items = this.items.filter(c => c.id !== id); else found.archived = action === 'archive';
      return {success: true};
    }
  }
  NS.Api = Api; NS.ApiError = ApiError; NS.DemoApi = DemoApi;
})();
