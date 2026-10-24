(() => {
  'use strict';
  const NS = globalThis.ChatShelf;
  class Store {
    constructor(account, demo = false) { this.account = account; this.demo = demo; this.key = `chat-shelf:v1:${account}`; }
    async dispatch(op) {
      if (this.demo) {
        const raw = localStorage.getItem(this.key);
        const state = raw ? NS.Model.validate(JSON.parse(raw)) : NS.Model.empty();
        const next = op ? NS.Model.reduce(state, op) : state;
        if (op) localStorage.setItem(this.key, JSON.stringify(next));
        return next;
      }
      const response = await chrome.runtime.sendMessage({type: 'CS_STORE', account: this.account, op});
      if (!response?.ok) throw Error(response?.error || '扩展连接中断，请刷新页面');
      return NS.Model.validate(response.state);
    }
    read() { return this.dispatch(); }
  }
  NS.Store = Store;
})();
