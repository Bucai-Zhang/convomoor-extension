(() => {
  'use strict';
  const NS = globalThis.ChatShelf;
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'on') { for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler); }
      else if (key === 'class') node.className = value;
      else if (['checked', 'disabled', 'selected', 'value', 'hidden', 'draggable'].includes(key)) node[key] = value;
      else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }
  const styles = `
    :host{display:block;color-scheme:light dark;--bg:#f9f9f9;--fg:#242424;--muted:#717171;--line:#e5e5e5;--hover:#ececec;--accent:#2c694b;--danger:#b63838;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--fg);text-align:left}
    :host([hidden]){display:none!important}:host([data-dark]){--bg:#171717;--fg:#ececec;--muted:#999;--line:#333;--hover:#292929;--accent:#95c3a7;--danger:#f18d8d}
    *{box-sizing:border-box}button,input,textarea,select{font:inherit}button,a,input,select{outline-offset:2px}button{cursor:pointer;color:inherit;border:0;background:transparent;border-radius:7px;padding:6px 8px;line-height:1.4}button:hover{background:var(--hover)}button:disabled{opacity:.4;cursor:not-allowed}input,textarea,select{color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:7px 8px;min-width:0}input[type=checkbox]{accent-color:var(--accent);width:14px;height:14px;flex:none;cursor:pointer}a{color:inherit;text-decoration:none}h2,h3,p{margin:0}h3{font-size:15px}small,.muted{color:var(--muted);font-size:11px}.shell{background:transparent;display:flex;flex-direction:column;width:100%;min-width:0;max-height:min(40vh,350px);min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:2px 3px 5px}
    .head{display:flex;align-items:center;gap:5px;padding:6px 2px}.brand{font-size:13px;font-weight:650;letter-spacing:.2px;flex:1}.mark{color:var(--accent);font-size:20px;margin-right:7px}.search{width:100%;background:transparent;border:1px solid var(--line);padding:8px 10px;margin:4px 0 9px}.navrow,.folderline,.chatrow{display:flex;align-items:center;gap:5px;min-height:34px;border-radius:7px;padding:3px 6px}.navrow{width:100%;text-align:left}.navrow.active,.folderline.active{background:var(--hover)}.navrow .grow,.label{flex:1;min-width:0}.count{font-size:10px;color:var(--muted);padding:0 4px}.section{display:flex;align-items:center;padding:9px 5px 3px;gap:4px;color:var(--muted);font-size:11px}.section span{flex:1}.folderline:hover,.chatrow:hover{background:var(--hover)}.folderline.over{box-shadow:inset 0 0 0 2px var(--accent)}.foldername{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:0}.foldericon{font-size:16px}.smallbtn{padding:3px 5px;font-size:13px;min-width:24px}.more{opacity:0}.folderline:hover .more,.more:focus,.chatrow:hover .more{opacity:1}.tree{flex:none;max-height:32vh;overflow:auto}.chats{overflow:auto;flex:1;min-height:100px}.chatrow{gap:7px;position:relative;min-height:35px}.chatrow.selected{background:color-mix(in srgb,var(--accent) 13%,var(--bg))}.chatrow.current:before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;background:var(--accent)}.chatlink{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;padding:4px 0;font-size:12px}.star{color:var(--muted);padding:2px 4px;font-size:15px}.star.on{color:#b68730;opacity:1}.selectrow{display:flex;align-items:center;gap:3px;flex-wrap:wrap;border-top:1px solid var(--line);padding:6px 0}.selectrow strong{font-size:11px;flex:1}.toolbar{border-top:1px solid var(--line);padding:8px 0 0;display:flex;flex-wrap:wrap;gap:4px}.toolbar button{font-size:12px;padding:7px}.danger{color:var(--danger)}.primary{background:var(--fg);color:var(--bg)}.primary:hover{opacity:.85;background:var(--fg)}.empty{padding:18px 9px;color:var(--muted);font-size:12px;text-align:center}.welcome{padding:12px 6px}.welcome p{margin:10px 0;font-size:12px;color:var(--muted)}.welcome button{width:100%;margin-top:5px}.notice{font-size:11px;color:var(--muted);border-top:1px solid var(--line);margin-top:6px;padding:7px 4px;overflow-wrap:anywhere}.notice.error{color:var(--danger)}.mode{display:flex;align-items:center;gap:4px;padding:5px 2px}.mode span{flex:1;font-size:10px;color:var(--muted)}.mode button{font-size:10px}.foot{display:flex;gap:4px;padding-top:4px}.foot button{font-size:10px;color:var(--muted)}.load{font-size:11px;width:100%;color:var(--muted)}.busy{font-size:11px;color:var(--accent);padding:6px}.modal-layer{position:fixed;inset:0;background:#0006;z-index:2147483646;display:flex;justify-content:center;align-items:center;padding:20px}.dialog{width:430px;max-width:100%;max-height:85vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:22px;box-shadow:0 24px 100px #0004;font-size:13px}.dialog p{margin:12px 0;color:var(--muted)}.dialog label{display:block;margin:12px 0 5px}.dialog input:not([type=color]),.dialog select{width:100%}.dialog ul{padding-left:18px;font-size:12px}.dialog .actions{display:flex;justify-content:flex-end;gap:6px;margin-top:20px}.result{white-space:pre-wrap;max-height:180px;overflow:auto;font-size:12px;padding:9px;background:var(--hover);border-radius:6px}.pill{font-size:9px;border:1px solid var(--line);border-radius:4px;color:var(--muted);padding:1px 4px}.toggle{font-weight:600}button:focus-visible,a:focus-visible{outline:2px solid var(--accent)}
    /* The manager lives in a collapsed native-sidebar section in normal flow.
       It never owns the native history area or a viewport-sized overlay. */
    .head{padding:2px 2px;gap:3px;min-height:25px}.brand{font-size:12px;font-weight:600}.mark{font-size:15px;margin-right:5px}
    .search{padding:5px 7px;margin:3px 0 5px;font-size:12px}.navrow,.folderline,.chatrow{min-height:29px;padding-top:1px;padding-bottom:1px}
    .navrow{font-size:12px}.section{padding:6px 4px 2px;font-size:10px}.smallbtn{padding:2px 4px;min-width:22px}
    .tree{max-height:110px;min-height:0;overflow:auto;scrollbar-width:thin}.chats{flex:1 0 78px;min-height:78px;max-height:180px;overflow:auto;scrollbar-width:thin}
    .selectrow{padding:3px 0;gap:1px}.selectrow button,.toolbar button{padding:4px 5px;font-size:11px}.toolbar{padding-top:4px;gap:2px}
    .mode{padding:3px 2px}.foot{padding-top:2px;gap:1px}.notice{margin-top:3px;padding:4px 3px;font-size:10px;line-height:1.4}
    .local-label{font-size:10px;color:var(--muted);padding:0 4px 3px;line-height:1.4}.welcome{padding:5px 4px}.welcome h3{font-size:12px}.welcome p{margin:6px 0;font-size:11px}
    .modal-layer{max-height:none;overflow:auto}.dialog{flex:none}.chatrow:focus-within .more,.folderline:focus-within .more{opacity:1}
    .dialog textarea{display:block;width:100%;min-height:160px;resize:vertical;font:inherit;line-height:1.6;padding:10px}.dialog textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.dialog textarea[aria-invalid=true]{border-color:var(--danger)}.dialog .form-error{color:var(--danger);margin:10px 0;overflow-wrap:anywhere}.dialog [hidden]{display:none!important}
    @media(pointer:coarse){.more{opacity:1}.chatrow,.folderline,.navrow{min-height:34px}}
  `;
  class Sidebar {
    constructor(host, {api, demo = false, onClose = () => {}, onStateChange = null}) {
      this.host = host; this.api = api; this.demo = demo; this.onClose = onClose; this.onStateChange = onStateChange;
      this.root = host.attachShadow({mode: 'open'});
      this.shell = el('section', {class: 'shell', 'aria-label': 'ConvoMoor 对话管理'});
      this.modals = el('div'); this.root.append(el('style', {}, styles), this.shell, this.modals);
      this.state = NS.Model.empty(); this.chats = []; this.selected = new Set(); this.expanded = new Set();
      this.view = 'all'; this.query = ''; this.archived = false; this.multi = false; this.connected = false;
      this.busy = false; this.armed = demo; this.message = ''; this.hasMore = false; this.offset = 0;
      this.abort = null; this.lastSelected = null; this.lastResult = null;
      this.render();
    }
    btn(text, title, action, attrs = {}) { return el('button', {type: 'button', title, 'aria-label': title, disabled: this.busy, on: {click: () => this.safe(action)}, ...attrs}, text); }
    async safe(action) { try { return await action(); } catch (error) { this.message = error.message || '操作失败'; this.error = true; this.render(); } }
    setView(view) { this.view = view; this.selected.clear(); this.lastSelected = null; this.render(); }
    async connect() {
      if (this.busy) return; this.busy = true; this.message = '正在只读连接…'; this.render();
      try {
        const account = await this.api.connect(); this.store = new NS.Store(account, this.demo);
        this.state = await this.store.read();
        if (this.demo && !this.state.folders.length && this.state.revision === 0) {
          this.state = await this.store.dispatch({type: 'CREATE_FOLDER', id: 'learning', name: '学习与研究', color: '#638466'});
          this.state = await this.store.dispatch({type: 'CREATE_FOLDER', id: 'life', name: '生活灵感', color: '#b68730'});
          this.state = await this.store.dispatch({type: 'MOVE', ids: this.api.items.slice(0, 1).map(c => c.id), folderId: 'learning'});
        }
        this.expanded = new Set(this.state.folders.map(f => f.id));
        await this.load(true); this.connected = true; this.error = false;
      } finally { this.busy = false; this.render(); }
    }
    async local(op) { const next = await this.store.dispatch(op); if (next.revision >= this.state.revision) this.state = next; this.error = false; this.render(); }
    async load(reset = false) {
      const page = await this.api.list({offset: reset ? 0 : this.offset, archived: this.archived});
      // Commit only after a complete, validated response; failed refresh keeps existing rows.
      const merged = new Map((reset ? [] : this.chats).map(c => [c.id, c]));
      for (const c of page.items) merged.set(c.id, c);
      this.chats = [...merged.values()]; this.offset = page.next; this.hasMore = page.hasMore;
      if (reset) this.selected.clear();
      this.message = this.demo ? '离线演示 · 所有聊天均为虚构数据' : '已只读加载；批量写入须先启用并逐次确认'; this.error = false;
    }
    async refresh(reset = true) {
      if (this.busy) return; this.busy = true; this.render();
      try { await this.load(reset); this.state = await this.store.read(); } finally { this.busy = false; this.render(); }
    }
    async switchArchive() {
      const previous = this.archived; this.archived = !previous;
      try { await this.refresh(); } catch (e) { this.archived = previous; throw e; }
    }
    rows() { return NS.Model.visible(this.chats, this.state, {view: this.view, query: this.query, archived: this.archived}); }
    selectionRows() {
      const rows = this.rows();
      if (this.view !== 'all' || this.query) return rows;
      const walk = parent => this.state.folders.filter(f => f.parentId === parent).flatMap(f => this.expanded.has(f.id) ? [
        ...walk(f.id), ...rows.filter(c => this.state.assignments[c.id] === f.id)
      ] : []);
      return [...walk(null), ...rows.filter(c => !this.state.assignments[c.id])];
    }
    toggle(id, shift = false) {
      if (this.busy) return;
      const rows = this.selectionRows().map(c => c.id); const begin = rows.indexOf(this.lastSelected), end = rows.indexOf(id);
      if (shift && begin >= 0 && end >= 0) for (const x of rows.slice(Math.min(begin, end), Math.max(begin, end) + 1)) this.selected.add(x);
      else if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
      this.multi = true; this.lastSelected = id; this.render();
    }
    useModalPortal() {
      if(this.portalHost?.isConnected) return;
      const portal=document.createElement('div');portal.setAttribute('data-cs-owned','true');portal.id='chat-shelf-dialogs';
      this.modalRoot=portal.attachShadow({mode:'open'});
      const style=document.createElement('style');style.textContent=this.root.querySelector('style').textContent;
      this.modalRoot.append(style,this.modals);document.body.append(portal);this.portalHost=portal;
    }
    async modal(title, build) {
      if (this.modals.childElementCount) return null;
      const modalScope=this.modalRoot||this.root;
      const previous = modalScope.activeElement||this.root.activeElement;
      return new Promise(resolve => {
        const close = value => { if(box.getAttribute('aria-busy')==='true')return;layer.remove(); previous?.focus(); resolve(value); };
        const box = el('div', {class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title}, el('h3', {}, title));
        const layer = el('div', {class: 'modal-layer', on: {keydown: event => {
          if (event.key === 'Escape') { event.stopPropagation(); close(null); }
          if (event.key === 'Tab') {
            const nodes = [...box.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')];
            if (!nodes.length) return;
            if (event.shiftKey && modalScope.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
            else if (!event.shiftKey && modalScope.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
          }
        }}}, box);
        build(box, close); this.modals.append(layer);
        (box.querySelector('[autofocus]') || box.querySelector('input,textarea,select,button'))?.focus();
      });
    }
    async confirm(title, description, {danger = false, phrase = null, details = []} = {}) {
      return this.modal(title, (box, close) => {
        box.append(el('p', {}, description));
        if (details.length) box.append(el('ul', {}, details.slice(0, 8).map(s => el('li', {}, s)), details.length > 8 ? el('li', {}, `另有 ${details.length - 8} 项`) : null));
        const yes = this.btn(danger ? '确认删除' : '确认', '确认执行', () => close(true), {class: danger ? 'danger' : 'primary', disabled: !!phrase});
        if (phrase) box.append(el('label', {}, `输入「${phrase}」确认：`), el('input', {'aria-label': '删除确认文字', autocomplete: 'off', on: {input: event => { yes.disabled = event.target.value !== phrase; }}}));
        box.append(el('div', {class: 'actions'}, this.btn('取消', '取消', () => close(null)), yes));
      });
    }
    folderOptions(excluded = new Set()) {
      const walk = (parent, depth = 0) => this.state.folders.filter(f => f.parentId === parent && !excluded.has(f.id)).flatMap(f => [
        el('option', {value: f.id}, `${'　'.repeat(depth)}${f.name}`), ...walk(f.id, depth + 1)]);
      return [el('option', {value: ''}, '未分类 / 根目录'), ...walk(null)];
    }
    async editFolder(id = null) {
      if (!this.connected) return;
      const f = this.state.folders.find(x => x.id === id);
      const result = await this.modal(f ? '编辑文件夹' : '新建文件夹', (box, close) => {
        const name = el('input', {'aria-label': '文件夹名称', value: f?.name || '', maxlength: '80', autofocus: '', autocomplete: 'off'});
        const color = el('input', {type: 'color', 'aria-label': '文件夹颜色', value: f?.color || '#638466'});
        const parent = el('select', {'aria-label': '父文件夹'}, this.folderOptions(f ? NS.Model.descendants(this.state, f.id) : new Set()));
        parent.value = f?.parentId || (this.view.startsWith('folder:') ? this.view.slice(7) : '');
        if (!parent.value) parent.value = '';
        const save = this.btn('保存', '保存文件夹', () => { if (name.value.trim()) close({name: name.value.trim(), color: color.value, parentId: parent.value || null}); });
        const actions = el('div', {class: 'actions'});
        if (f) actions.append(this.btn('删除文件夹', '删除文件夹', () => close('delete'), {class: 'danger'}));
        actions.append(this.btn('取消', '取消', () => close(null)), save);
        box.append(el('label', {}, '名称'), name, el('label', {}, '父文件夹'), parent, el('label', {}, '颜色'), color, actions);
        name.addEventListener('keydown', e => { if (e.key === 'Enter' && name.value.trim()) save.click(); });
      });
      if (result === 'delete') {
        if (await this.confirm('删除本地文件夹？', '该文件夹和子文件夹会被移除，其中的聊天回到未分类。不会删除或归档 ChatGPT 对话。')) {
          await this.local({type: 'DELETE_FOLDER', id}); this.setView('all');
        }
      } else if (result) {
        const target = f?.id || `f_${crypto.randomUUID()}`;
        await this.local({type: f ? 'EDIT_FOLDER' : 'CREATE_FOLDER', id: target, ...result});
        if (result.parentId) this.expanded.add(result.parentId);
        this.expanded.add(target); this.render();
      }
    }
    async move(ids = [...this.selected]) {
      if (!ids.length) return;
      const target = await this.modal('移动到文件夹', (box, close) => {
        const select = el('select', {'aria-label': '目标文件夹'}, this.folderOptions());
        box.append(el('p', {}, `将 ${ids.length} 个对话归类。此操作只更改扩展的本地文件夹。`), select,
          el('div', {class: 'actions'}, this.btn('取消', '取消', () => close(null)), this.btn('移动', '确认移动', () => close({folderId: select.value || null}), {class: 'primary'})));
      });
      if (target) { await this.local({type: 'MOVE', ids, ...target}); this.selected.clear(); this.render(); }
    }
    drop(event, folderId) {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('over');
      if (this.busy) return;
      this.safe(async () => {
        const payload = JSON.parse(event.dataTransfer.getData('application/x-chat-shelf'));
        if (payload.kind === 'chats') {
          if (!Array.isArray(payload.ids) || payload.ids.some(id => !this.chats.some(c => c.id === id))) throw Error('拖放数据无效');
          await this.local({type: 'MOVE', ids: payload.ids, folderId}); this.selected.clear();
        } else if (payload.kind === 'folder') await this.local({type: 'EDIT_FOLDER', id: payload.id, parentId: folderId});
        this.render();
      });
    }
    dropEvents(folderId) { return {dragover: e => { if ([...e.dataTransfer.types].includes('application/x-chat-shelf') && !this.busy) { e.preventDefault(); e.currentTarget.classList.add('over'); } },
      dragleave: e => e.currentTarget.classList.remove('over'), drop: e => this.drop(e, folderId)}; }
    async arm() {
      if (this.armed) { this.armed = false; this.render(); return; }
      if (await this.confirm('启用本标签页的真实操作？', '启用后，归档、取消归档和删除仍会逐次列出对话并要求确认。删除不可撤销。刷新页面后会重新关闭。')) {
        await this.api.assertAccount(); this.armed = true; this.render();
      }
    }
    async batch(action) {
      const ids = [...this.selected].filter(id => this.chats.some(c => c.id === id));
      if (!ids.length || this.busy) return;
      if (!this.armed) { this.message = '请先点击底部「启用真实操作」；当前未发起写入请求'; this.render(); return; }
      const name = {archive: '归档', unarchive: '取消归档', delete: '删除'}[action];
      if (!name) return;
      const approved = await this.confirm(`${name} ${ids.length} 个对话？`, action === 'delete' ? '删除后无法通过本扩展恢复。请核对以下对话。' : '该操作将改变 ChatGPT 账号中这些对话的归档状态。', {
        danger: action === 'delete', phrase: action === 'delete' ? `删除 ${ids.length}` : null,
        details: ids.map(id => this.chats.find(c => c.id === id)?.title || id)
      });
      if (!approved || !this.armed || this.busy) return;
      this.busy = true; this.abort = new AbortController(); this.error = false; this.render();
      try {
        const result = await NS.Model.runBatch({ids, action, api: this.api, signal: this.abort.signal,
          onProgress: r => { this.message = `${name}：已确认 ${r.success.length}/${ids.length}；遇到失败自动停止`; this.render(); }});
        this.lastResult = result;
        for (const id of result.success) this.selected.delete(id);
        // Only remove rows and metadata for server-confirmed successful items.
        const succeeded = new Set(result.success);
        this.chats = this.chats.filter(c => !succeeded.has(c.id));
        // A successful mutation changes server pagination. Never continue a stale offset.
        if (result.success.length) { this.hasMore = false; this.offset = 0; }
        if (action === 'delete' && result.success.length) {
          try { this.state = await this.store.dispatch({type: 'FORGET_DELETED', ids: result.success}); }
          catch { result.failed.push({id: '本地元数据', message: '服务器已确认删除，但本地分类清理失败；本地备份仍可使用'}); }
        }
        const uncertain = result.failed.some(f => f.uncertain) || (result.cancelled && result.pending.length);
        this.message = `${name}：成功 ${result.success.length}，失败 ${result.failed.length}，未处理 ${result.pending.length}。${uncertain ? '有结果不确定的请求；请刷新核对。' : '请刷新列表以重新计算分页。'}`;
        this.error = result.failed.length > 0 || !!uncertain;
      } catch (e) { this.message = e.message; this.error = true; }
      finally { this.busy = false; this.abort = null; this.render(); }
    }
    async showResult() {
      const r = this.lastResult; if (!r) return;
      await this.modal('最近一次批量操作结果', (box, close) => {
        box.append(el('p', {}, `已确认成功 ${r.success.length}；失败 ${r.failed.length}；未处理 ${r.pending.length}`),
          el('div', {class: 'result'}, [...r.success.map(id => `成功 · ${id}`), ...r.failed.map(f => `${f.uncertain ? '结果不确定' : '失败'} · ${f.id} · ${f.message}`), ...r.pending.map(id => `未处理 · ${id}`)].join('\n')),
          el('div', {class: 'actions'}, this.btn('关闭', '关闭结果', () => close(null))));
      });
    }
    async exportBackup() {
      this.state = await this.store.read();
      const backup = {format: 'chat-shelf-backup', version: 1, account: this.store.account, exportedAt: new Date().toISOString(), state: this.state};
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'}));
      const link = el('a', {href: url, download: `chat-shelf-${new Date().toISOString().slice(0, 10)}.json`});
      this.root.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async importBackup(file) {
      if (!file || file.size > 2 * 1024 * 1024) throw Error('请选择小于 2 MB 的本扩展 JSON 备份');
      const data = JSON.parse(await file.text());
      if (data.format !== 'chat-shelf-backup' || data.version !== 1 || data.account !== this.store.account) throw Error('备份格式不支持或属于其他账号');
      const state = NS.Model.validate(data.state);
      if (await this.confirm('恢复本地分类备份？', `将覆盖本账号的本地文件夹、星标、分类、书签、笔记及提示词，共 ${state.folders.length} 个文件夹。建议先导出当前备份。不会修改聊天内容或归档状态。`)) {
        await this.local({type: 'IMPORT', state}); this.expanded = new Set(state.folders.map(f => f.id)); this.setView('all');
      }
    }
    renderFolders(parent = null, depth = 0) {
      return this.state.folders.filter(f => f.parentId === parent).flatMap(f => {
        const open = this.expanded.has(f.id); const hasChild = this.state.folders.some(c => c.parentId === f.id);
        const count = this.chats.filter(c => this.state.assignments[c.id] === f.id).length;
        const line = el('div', {class: `folderline ${this.view === `folder:${f.id}` ? 'active' : ''}`, style: `padding-left:${depth * 15 + 3}px`, draggable: !this.busy,
          'data-folder-id': f.id, role: 'treeitem', 'aria-expanded': hasChild ? open : undefined,
          on: {...this.dropEvents(f.id), contextmenu: e => { e.preventDefault(); if (!this.busy) this.safe(() => this.editFolder(f.id)); },
            dragstart: e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-chat-shelf', JSON.stringify({kind: 'folder', id: f.id})); } }},
          this.btn(hasChild ? (open ? '⌄' : '›') : '·', `${open ? '折叠' : '展开'} ${f.name}`, () => { open ? this.expanded.delete(f.id) : this.expanded.add(f.id); this.render(); }, {class: 'smallbtn'}),
          el('span', {class: 'foldericon', style: `color:${f.color}`}, '▱'),
          this.btn(f.name, `打开文件夹 ${f.name}`, () => this.setView(`folder:${f.id}`), {class: 'foldername'}),
          el('span', {class: 'count'}, count || ''), this.btn('···', `编辑文件夹 ${f.name}`, () => this.editFolder(f.id), {class: 'smallbtn more'}));
        const nestedChats = this.view === 'all' && !this.query && open ? this.rows().filter(c => this.state.assignments[c.id] === f.id).map(c => this.renderChat(c, depth + 1)) : [];
        return [line, ...(open ? this.renderFolders(f.id, depth + 1) : []), ...nestedChats];
      });
    }
    chatHref(chat) {
      if (this.demo) return '#';
      // A native Project conversation can carry a /g/.../c/:id route. Reuse a
      // same-origin route observed in the page rather than discarding its project.
      for (const link of document.querySelectorAll('a[href*="/c/"]')) {
        try {
          const url = new URL(link.getAttribute('href'), location.origin);
          if (url.origin === location.origin && url.pathname.endsWith(`/c/${chat.id}`)) return `${url.pathname}${url.search}${url.hash}`;
        } catch { /* Ignore malformed page anchors; the ordinary chat route remains available. */ }
      }
      return `/c/${encodeURIComponent(chat.id)}`;
    }
    renderChat(chat, depth = 0) {
      const star = !!this.state.stars[chat.id]; const selected = this.selected.has(chat.id);
      const checkbox = el('input', {type: 'checkbox', checked: selected, disabled: this.busy, 'aria-label': `选择 ${chat.title}`,
        on: {click: e => { e.stopPropagation(); this.toggle(chat.id, e.shiftKey); }}});
      const row = el('div', {class: `chatrow ${selected ? 'selected' : ''} ${location.pathname.endsWith(`/c/${chat.id}`) ? 'current' : ''}`,
        'data-chat-id': chat.id, style: `padding-left:${depth * 15 + 6}px`, draggable: !this.busy, on: {
          dragstart: e => { e.dataTransfer.effectAllowed = 'move'; const ids = selected ? [...this.selected] : [chat.id]; e.dataTransfer.setData('application/x-chat-shelf', JSON.stringify({kind: 'chats', ids})); },
          contextmenu: e => { e.preventDefault(); if (!this.busy) this.safe(() => this.move([chat.id])); }
        }},
        this.multi ? checkbox : el('span', {class: 'muted', 'aria-hidden': 'true'}, '◌'),
        el('a', {class: 'chatlink', href: this.chatHref(chat), title: chat.title, on: {click: e => {
          if (this.multi || this.demo || this.busy) { e.preventDefault(); if (!this.busy && this.multi) this.toggle(chat.id, e.shiftKey); }
        }}}, chat.title),
        this.btn(star ? '★' : '☆', `${star ? '取消星标' : '星标'} ${chat.title}`, () => this.local({type: 'STAR', ids: [chat.id], value: !star}), {class: `star ${star ? 'on' : 'more'}`}),
        this.btn('···', `移动 ${chat.title}`, () => this.move([chat.id]), {class: 'smallbtn more'}));
      return row;
    }
    render() {
      const focus = this.root.activeElement; const focusKey = focus?.getAttribute('data-focus'); const cursor = focus?.selectionStart;
      const fragment = document.createDocumentFragment();
      fragment.append(el('header', {class: 'head'}, el('span', {class: 'brand'}, el('span', {class: 'mark'}, '▤'), 'ConvoMoor'), this.demo ? el('span', {class: 'pill'}, '演示') : null,
        this.btn('⟳', '刷新已加载对话', () => this.refresh(), {class: 'smallbtn', disabled: this.busy || !this.connected}),
        this.btn('×', '收起本地管理', () => this.onClose(), {class: 'smallbtn', disabled: this.busy})));
      if (!this.connected) {
        fragment.append(el('div', {class: 'welcome'}, el('h3', {}, '本地文件夹与批量管理'), el('p', {}, '展开后管理文件夹、星标和拖拽分类；收起后继续使用原生导航。'),
          el('p', {}, '连接时只读取身份和聊天标题。文件夹按账号保存在本机。'),
          this.btn(this.demo ? '打开模拟侧栏' : '只读连接 ChatGPT', '连接聊天列表', () => this.connect(), {class: 'primary'})));
      } else {
        const rows = this.rows(); const selectionRows = this.selectionRows();
        const inlineTree = this.view === 'all' && !this.query;
        fragment.append(el('div', {class: 'local-label', title: 'ConvoMoor 文件夹仅保存在此浏览器、按账号隔离。它们不会创建、移动或修改 ChatGPT 原生 Project。'}, '本地文件夹 · 与 ChatGPT 项目独立'));
        fragment.append(el('input', {class: 'search', type: 'search', placeholder: '搜索已加载对话…', 'aria-label': '搜索已加载对话', 'data-focus': 'search', value: this.query, disabled: this.busy,
          on: {input: e => { this.query = e.target.value; this.selected.clear(); this.render(); }}}));
        const nav = (key, icon, text, extra = {}) => this.btn([icon, '　', el('span', {class: 'grow'}, text)], text, () => this.setView(key), {class: `navrow ${this.view === key ? 'active' : ''}`, ...extra});
        fragment.append(nav('all', '◫', '全部对话'), nav('starred', '☆', '星标对话'), nav('inbox', '◌', '未分类', {on: {click: () => this.setView('inbox'), ...this.dropEvents(null)}}));
        if (!inlineTree) {
          fragment.append(el('div', {class: 'section'}, el('span', {}, '文件夹'), this.btn('+', '新建文件夹', () => this.editFolder(), {class: 'smallbtn'})));
          fragment.append(el('div', {class: 'tree', role: 'tree', 'aria-label': '文件夹'}, this.renderFolders()));
        }
        fragment.append(el('div', {class: 'section'}, el('span', {}, `${inlineTree ? '文件夹与对话' : this.archived ? '已归档' : '对话'} · ${rows.length} 项`),
          inlineTree ? this.btn('+', '新建文件夹', () => this.editFolder(), {class: 'smallbtn'}) : null,
          this.btn(this.multi ? '完成' : '多选', '切换批量选择', () => { this.multi = !this.multi; this.selected.clear(); this.render(); }, {class: 'smallbtn toggle'})));
        if (this.multi) fragment.append(el('div', {class: 'selectrow'}, this.btn('全选', '全选当前筛选结果', () => { selectionRows.forEach(c => this.selected.add(c.id)); this.render(); }),
          this.btn('反选', '反选当前筛选结果', () => { selectionRows.forEach(c => this.selected.has(c.id) ? this.selected.delete(c.id) : this.selected.add(c.id)); this.render(); }),
          this.btn('清空', '清空选择', () => { this.selected.clear(); this.render(); }), el('strong', {}, `已选 ${this.selected.size}`)));
        fragment.append(el('div', {class: 'chats'}, inlineTree ? el('div', {role: 'tree', 'aria-label': '文件夹'}, this.renderFolders()) : null,
          (inlineTree ? rows.filter(c => !this.state.assignments[c.id]) : rows).map(c => this.renderChat(c)), rows.length === 0 ? el('div', {class: 'empty'}, '这里还没有匹配的已加载对话') : null,
          this.hasMore ? this.btn('加载更多对话', '加载更多对话', () => this.refresh(false), {class: 'load'}) : null));
        if (this.multi) fragment.append(el('div', {class: 'toolbar'},
          this.btn('▱ 移动', '批量移动到文件夹', () => this.move(), {disabled: this.busy || !this.selected.size}),
          this.btn('☆ 星标', '批量星标', () => this.local({type: 'STAR', ids: [...this.selected], value: true}), {disabled: this.busy || !this.selected.size}),
          this.btn('归档' + (this.archived ? '还原' : ''), this.archived ? '批量取消归档' : '批量归档', () => this.batch(this.archived ? 'unarchive' : 'archive'), {disabled: this.busy || !this.selected.size}),
          this.btn('删除', '批量删除', () => this.batch('delete'), {class: 'danger', disabled: this.busy || !this.selected.size})));
        fragment.append(el('div', {class: 'mode'}, el('span', {}, this.demo ? '虚构数据 · 无网络写入' : this.armed ? '真实操作已启用 · 仍需逐次确认' : '只读模式'),
          this.demo ? null : this.btn(this.armed ? '关闭真实操作' : '启用真实操作', '切换真实操作开关', () => this.arm())));
        const input = el('input', {type: 'file', accept: 'application/json,.json', hidden: true, on: {change: e => this.safe(() => this.importBackup(e.target.files[0]))}});
        fragment.append(el('footer', {class: 'foot'}, this.btn(this.archived ? '返回对话' : '已归档', '切换归档列表', () => this.switchArchive()),
          this.btn('备份', '导出分类备份', () => this.exportBackup()), this.btn('恢复', '恢复分类备份', () => input.click()), input,
          this.lastResult ? this.btn('结果', '查看操作结果', () => this.showResult()) : null));
      }
      if (this.message) fragment.append(el('div', {class: `notice ${this.error ? 'error' : ''}`, role: 'status', 'aria-live': 'polite'}, this.message));
      if (this.abort) fragment.append(this.btn('停止后续操作', '停止批量任务', () => this.abort?.abort(), {disabled: false}));
      this.shell.replaceChildren(fragment);
      if (focusKey) { const replacement = this.shell.querySelector(`[data-focus="${focusKey}"]`); replacement?.focus(); try { replacement?.setSelectionRange(cursor, cursor); } catch {} }
      this.onStateChange?.();
    }
  }
  NS.Sidebar = Sidebar;
  NS.el = el;
})();
