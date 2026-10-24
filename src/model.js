/* ConvoMoor data model. Development provenance is documented in ORIGIN.md. */
(() => {
  'use strict';
  const NS = globalThis.ChatShelf = globalThis.ChatShelf || {};
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const badKeys = new Set(['__proto__', 'constructor', 'prototype']);
  const safeKey = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !badKeys.has(value);
  const defaults = () => ({minimapView: 'prompts', showCode: false, theme: 'auto', showTimestamps: false});
  const LIMITS = Object.freeze({bookmarks: 5000, notes: 5000, prompts: 1000, sideThreads: 500, text: 50000, messages: 100, storageCharacters: 2000000});
  const empty = () => ({version: 1, revision: 0, folders: [], assignments: {}, stars: {}, bookmarks: [], notes: [], prompts: [], sideThreads: [], settings: defaults()});
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function boundedText(value, max, label, {optional = false, nonempty = false} = {}) {
    if (value === undefined && optional) return '';
    if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()) || /\u0000/.test(value)) throw Error(`${label}不合法或超过长度限制`);
    return value;
  }
  function timestamp(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw Error('本地记录时间不合法');
    return value;
  }
  function itemBase(value, conversation = true) {
    if (!record(value) || !safeKey(value.id)) throw Error('本地记录 ID 不合法');
    const out = {id: value.id, createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt ?? value.createdAt)};
    if (conversation) {
      if (typeof value.conversationId !== 'string' || !UUID.test(value.conversationId)) throw Error('聊天 ID 不合法');
      out.conversationId = value.conversationId;
      if (value.messageId != null) {
        if (typeof value.messageId !== 'string' || !value.messageId || value.messageId.length > 200 || badKeys.has(value.messageId) || /[\u0000-\u001f]/.test(value.messageId)) throw Error('消息 ID 不合法');
        out.messageId = value.messageId;
      } else out.messageId = null;
    }
    return out;
  }
  function knowledgeItem(value, kind) {
    const out = itemBase(value, kind !== 'prompts');
    out.title = boundedText(value.title, 300, '标题', {optional: true});
    if (kind === 'sideThreads') {
      out.selection = boundedText(value.selection, 20000, '选中文本', {optional: true});
      if (!Array.isArray(value.messages) || value.messages.length > LIMITS.messages) throw Error('侧聊消息数量不合法');
      out.messages = value.messages.map(message => {
        if (!record(message) || !['user', 'assistant'].includes(message.role)) throw Error('侧聊消息角色不合法');
        return {role: message.role, text: boundedText(message.text, LIMITS.text, '侧聊消息', {nonempty: true})};
      });
    } else out.text = boundedText(value.text, kind === 'prompts' ? 20000 : LIMITS.text, '正文', {optional: kind === 'bookmarks', nonempty: kind !== 'bookmarks'});
    return out;
  }
  function settings(value) {
    const out = defaults();
    if (value === undefined) return out;
    if (!record(value)) throw Error('设置数据不合法');
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(out, key)) throw Error('未知设置项');
      if (key === 'minimapView' && !['prompts', 'h1', 'h2', 'h3'].includes(value[key])) throw Error('小地图视图不合法');
      if (key === 'theme' && !['auto', 'light', 'dark'].includes(value[key])) throw Error('主题不合法');
      if ((key === 'showCode' || key === 'showTimestamps') && typeof value[key] !== 'boolean') throw Error('开关设置不合法');
      out[key] = value[key];
    }
    return out;
  }
  function descendants(state, id) {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of state.folders) if (ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true; }
    }
    return ids;
  }
  function validate(value) {
    if (!record(value) || value.version !== 1 || !Array.isArray(value.folders) || value.folders.length > 2000) throw Error('备份格式或版本不受支持');
    const out = empty(); const ids = new Set();
    for (const f of value.folders) {
      if (!safeKey(f.id) || ids.has(f.id) || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 80) throw Error('文件夹数据不合法');
      if (f.parentId !== null && !safeKey(f.parentId)) throw Error('父文件夹不合法');
      ids.add(f.id);
      out.folders.push({id: f.id, name: f.name.trim(), parentId: f.parentId, color: /^#[a-f0-9]{6}$/i.test(f.color) ? f.color : '#638466'});
    }
    for (const f of out.folders) {
      if (f.parentId !== null && !ids.has(f.parentId)) throw Error('父文件夹不存在');
      let next = f; const seen = new Set();
      while (next) {
        if (seen.has(next.id)) throw Error('文件夹层级不能形成循环');
        seen.add(next.id); next = out.folders.find(x => x.id === next.parentId);
        if (seen.size > 16) throw Error('文件夹层级最多 16 层');
      }
    }
    if (value.assignments !== undefined && !record(value.assignments)) throw Error('聊天分类数据不合法');
    if (value.stars !== undefined && !record(value.stars)) throw Error('星标数据不合法');
    if (Object.keys(value.assignments || {}).length > 10000 || Object.keys(value.stars || {}).length > 10000) throw Error('聊天元数据数量超过限制');
    for (const [id, folder] of Object.entries(value.assignments || {})) {
      if (!UUID.test(id) || !ids.has(folder)) throw Error('聊天分类数据不合法');
      out.assignments[id] = folder;
    }
    for (const [id, flag] of Object.entries(value.stars || {})) {
      if (!UUID.test(id) || flag !== true) throw Error('星标数据不合法');
      out.stars[id] = true;
    }
    for (const kind of ['bookmarks', 'notes', 'prompts', 'sideThreads']) {
      const items = value[kind] === undefined ? [] : value[kind];
      if (!Array.isArray(items) || items.length > LIMITS[kind]) throw Error('本地记录数量不合法或超过限制');
      const seen = new Set(); const bookmarkTargets = new Set();
      out[kind] = items.map(item => {
        const clean = knowledgeItem(item, kind);
        if (seen.has(clean.id)) throw Error('本地记录 ID 重复');
        if (kind === 'bookmarks') {
          const target = JSON.stringify([clean.conversationId, clean.messageId]);
          if (bookmarkTargets.has(target)) throw Error('书签消息目标重复');
          bookmarkTargets.add(target);
        }
        seen.add(clean.id); return clean;
      });
    }
    out.settings = settings(value.settings);
    out.revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
    if (JSON.stringify(out).length > LIMITS.storageCharacters) throw Error('本地数据总量超过限制，请先备份并清理');
    return out;
  }
  function reduce(state, op) {
    if (!record(op) || typeof op.type !== 'string') throw Error('本地操作不合法');
    const next = validate(state); const folder = id => next.folders.find(f => f.id === id);
    const ids = () => {
      if (!Array.isArray(op.ids) || op.ids.length > 10000 || op.ids.some(id => !UUID.test(id))) throw Error('聊天 ID 不合法');
      return [...new Set(op.ids)];
    };
    if (op.type === 'CREATE_FOLDER') {
      const parentId = op.parentId || null;
      if (parentId && !folder(parentId)) throw Error('父文件夹不存在');
      if (!safeKey(op.id) || folder(op.id)) throw Error('文件夹 ID 不合法');
      next.folders.push({id: op.id, name: String(op.name || '').trim(), parentId, color: op.color || '#638466'});
    } else if (op.type === 'EDIT_FOLDER') {
      const f = folder(op.id); if (!f) throw Error('文件夹不存在');
      if (op.name !== undefined) f.name = String(op.name).trim();
      if (op.color !== undefined) f.color = op.color;
      if (op.parentId !== undefined) f.parentId = op.parentId;
    } else if (op.type === 'DELETE_FOLDER') {
      if (!folder(op.id)) throw Error('文件夹不存在');
      const removed = descendants(next, op.id);
      next.folders = next.folders.filter(f => !removed.has(f.id));
      for (const [id, f] of Object.entries(next.assignments)) if (removed.has(f)) delete next.assignments[id];
    } else if (op.type === 'MOVE') {
      if (op.folderId !== null && !folder(op.folderId)) throw Error('目标文件夹不存在');
      for (const id of ids()) { if (op.folderId === null) delete next.assignments[id]; else next.assignments[id] = op.folderId; }
    } else if (op.type === 'STAR') {
      for (const id of ids()) { if (op.value) next.stars[id] = true; else delete next.stars[id]; }
    } else if (op.type === 'FORGET_DELETED') {
      const removed = new Set(ids());
      for (const id of removed) { delete next.assignments[id]; delete next.stars[id]; }
      for (const kind of ['bookmarks', 'notes', 'sideThreads']) next[kind] = next[kind].filter(item => !removed.has(item.conversationId));
    } else if (['BOOKMARK_TOGGLE', 'NOTE_SAVE', 'PROMPT_SAVE', 'THREAD_SAVE'].includes(op.type)) {
      const kind = {BOOKMARK_TOGGLE: 'bookmarks', NOTE_SAVE: 'notes', PROMPT_SAVE: 'prompts', THREAD_SAVE: 'sideThreads'}[op.type];
      if (!record(op.item)) throw Error('本地记录不合法');
      const index = next[kind].findIndex(item => item.id === op.item.id);
      // Bookmark identity is the conversation/message pair, independent of generated button IDs.
      const existing = kind === 'bookmarks' ? next[kind].findIndex(item => item.conversationId === op.item.conversationId && item.messageId === (op.item.messageId ?? null)) : index;
      if (kind === 'bookmarks' && existing >= 0) {
        // Validate identity even on a removal; never interpret arbitrary malformed input as an action.
        knowledgeItem({...op.item, createdAt: Date.now()}, kind);
        next[kind].splice(existing, 1);
      } else {
        const previous = index >= 0 ? next[kind][index] : null;
        const item = knowledgeItem({...op.item, createdAt: previous?.createdAt ?? op.item.createdAt ?? Date.now(), updatedAt: Date.now()}, kind);
        if (index >= 0) next[kind][index] = item; else next[kind].push(item);
      }
    } else if (['BOOKMARK_DELETE', 'NOTE_DELETE', 'PROMPT_DELETE', 'THREAD_DELETE'].includes(op.type)) {
      if (!safeKey(op.id)) throw Error('本地记录 ID 不合法');
      const kind = {BOOKMARK_DELETE: 'bookmarks', NOTE_DELETE: 'notes', PROMPT_DELETE: 'prompts', THREAD_DELETE: 'sideThreads'}[op.type];
      next[kind] = next[kind].filter(item => item.id !== op.id);
    } else if (op.type === 'SETTINGS') {
      next.settings = settings({...next.settings, ...settingsPatch(op.patch)});
    } else if (op.type === 'IMPORT') {
      const imported = validate(op.state); imported.revision = next.revision + 1; return imported;
    } else { throw Error('未知本地操作'); }
    next.revision += 1;
    return validate(next);
  }
  function visible(chats, state, {view = 'all', query = '', archived = false} = {}) {
    const q = query.trim().toLocaleLowerCase();
    const folderIds = view.startsWith('folder:') ? descendants(state, view.slice(7)) : null;
    return chats.filter(c => !!c.archived === archived && (!q || c.title.toLocaleLowerCase().includes(q)) &&
      (view !== 'starred' || state.stars[c.id]) && (view !== 'inbox' || !state.assignments[c.id]) &&
      (!folderIds || folderIds.has(state.assignments[c.id])));
  }
  async function runBatch({ids, action, api, signal, onProgress = () => {}}) {
    if (!['archive', 'unarchive', 'delete'].includes(action) || !Array.isArray(ids) || ids.some(id => !UUID.test(id))) throw Error('批量任务参数不合法');
    const result = {success: [], failed: [], pending: [...new Set(ids)], cancelled: false};
    await api.assertAccount();
    while (result.pending.length && !signal?.aborted) {
      const id = result.pending[0];
      try {
        await api.mutate(id, action, signal);
        result.success.push(id); result.pending.shift();
      } catch (error) {
        if (signal?.aborted) {
          if (error.uncertain) { result.failed.push({id, message: error.message, uncertain: true}); result.pending.shift(); }
          result.cancelled = true; break;
        }
        result.failed.push({id, message: error.message, uncertain: !!error.uncertain}); result.pending.shift();
        // Stop on the first failure: avoid amplification, stale credentials and uncertain writes.
        break;
      }
      onProgress(copy(result));
    }
    result.cancelled = result.cancelled || !!signal?.aborted;
    onProgress(copy(result)); return result;
  }
  function settingsPatch(value) {
    if (!record(value)) throw Error('设置数据不合法');
    settings(value); return value;
  }
  NS.Model = {UUID, LIMITS, empty, validate, reduce, visible, descendants, runBatch};
})();
