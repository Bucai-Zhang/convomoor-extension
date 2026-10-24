'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load, id} = require('./helpers.cjs');
const M = load().Model;
const plain = value => JSON.parse(JSON.stringify(value));
const note = (key = 'note-1', conversationId = id(1)) => ({id: key, conversationId, messageId: 'turn:1:assistant', title: '课堂笔记', text: '本地笔记内容'});
const saveNote = (state = M.empty(), item = note()) => M.reduce(state, {type: 'NOTE_SAVE', item});

test('old version 1 backups migrate with empty knowledge arrays and verified default settings', () => {
  const old = {version: 1, revision: 4, folders: [], assignments: {}, stars: {}};
  const state = M.validate(old);
  for (const key of ['bookmarks', 'notes', 'prompts', 'sideThreads']) assert.deepEqual(plain(state[key]), []);
  assert.deepEqual(plain(state.settings), {minimapView: 'prompts', showCode: false, theme: 'auto', showTimestamps: false});
  assert.equal(state.revision, 4); assert.equal(old.settings, undefined);
});

test('notes create, update and delete without mutating input; preserve creation time', () => {
  const state = saveNote();
  const original = plain(state);
  const revised = saveNote(state, {...note(), text: '更新笔记', createdAt: 1});
  assert.equal(revised.notes.length, 1); assert.equal(revised.notes[0].text, '更新笔记');
  assert.equal(revised.notes[0].createdAt, state.notes[0].createdAt);
  assert.equal(revised.notes[0].conversationId, id(1));
  assert.deepEqual(plain(state), original);
  assert.equal(M.reduce(revised, {type: 'NOTE_DELETE', id: 'note-1'}).notes.length, 0);
});

test('bookmarks toggle by conversation and message target, supporting conversation bookmarks', () => {
  const state = M.reduce(M.empty(), {type: 'BOOKMARK_TOGGLE', item: note('bookmark-1')});
  assert.equal(state.bookmarks.length, 1);
  assert.equal(M.reduce(state, {type: 'BOOKMARK_TOGGLE', item: note('another-id')}).bookmarks.length, 0);
  const conversation = M.reduce(state, {type: 'BOOKMARK_TOGGLE', item: {id: 'conversation-bookmark', conversationId: id(1)}});
  assert.equal(conversation.bookmarks.length, 2); assert.equal(conversation.bookmarks[1].messageId, null);
  assert.equal(M.reduce(conversation, {type: 'BOOKMARK_DELETE', id: 'bookmark-1'}).bookmarks.length, 1);
});

test('prompt templates and local side conversations support complete CRUD without retained credentials', () => {
  let state = M.reduce(M.empty(), {type: 'PROMPT_SAVE', item: {id: 'prompt-1', title: '翻译', text: '请翻译 {{text}}', token: 'excluded'}});
  state = M.reduce(state, {type: 'PROMPT_SAVE', item: {id: 'prompt-1', title: '翻译', text: '请逐句解释 {{text}}'}});
  assert.equal(state.prompts.length, 1); assert.equal(state.prompts[0].text, '请逐句解释 {{text}}'); assert.equal(state.prompts[0].token, undefined);
  state = M.reduce(state, {type: 'THREAD_SAVE', item: {id: 'thread-1', conversationId: id(1), selection: '选中的一段文字', messages: [{role: 'user', text: '解释它'}, {role: 'assistant', text: '测试回答'}], authorization: 'excluded'}});
  assert.equal(state.sideThreads[0].messages.length, 2); assert.equal(state.sideThreads[0].authorization, undefined);
  state = M.reduce(state, {type: 'THREAD_DELETE', id: 'thread-1'});
  state = M.reduce(state, {type: 'PROMPT_DELETE', id: 'prompt-1'});
  assert.equal(state.sideThreads.length, 0); assert.equal(state.prompts.length, 0);
});

test('setting patches preserve prior values and reject unsupported options', () => {
  let state = M.reduce(M.empty(), {type: 'SETTINGS', patch: {minimapView: 'h2', theme: 'dark'}});
  state = M.reduce(state, {type: 'SETTINGS', patch: {showTimestamps: true}});
  assert.equal(state.settings.minimapView, 'h2'); assert.equal(state.settings.theme, 'dark'); assert.equal(state.settings.showTimestamps, true);
  for (const patch of [{theme: 'custom'}, {minimapView: 'all'}, {showCode: 1}, {showTimestamps: 'yes'}, {remote: true}, null]) {
    assert.throws(() => M.reduce(state, {type: 'SETTINGS', patch}));
  }
});

test('confirmed deletion clears only that conversation metadata and preserves prompt templates', () => {
  let state = saveNote(saveNote(), note('note-2', id(2)));
  state = M.reduce(state, {type: 'BOOKMARK_TOGGLE', item: note('bookmark-1')});
  state = M.reduce(state, {type: 'THREAD_SAVE', item: {id: 'thread-1', conversationId: id(1), messages: []}});
  state = M.reduce(state, {type: 'PROMPT_SAVE', item: {id: 'prompt-1', text: '模板'}});
  state = M.reduce(state, {type: 'STAR', ids: [id(1), id(2)], value: true});
  const next = M.reduce(state, {type: 'FORGET_DELETED', ids: [id(1)]});
  assert.equal(next.notes.length, 1); assert.equal(next.notes[0].conversationId, id(2));
  assert.equal(next.bookmarks.length, 0); assert.equal(next.sideThreads.length, 0); assert.equal(next.prompts.length, 1);
  assert.equal(next.stars[id(1)], undefined); assert.equal(next.stars[id(2)], true);
});

test('knowledge backups roundtrip and reject malformed structures, duplicate IDs and timestamps', () => {
  const state = saveNote();
  const roundtrip = M.reduce(M.empty(), {type: 'IMPORT', state: plain(state)});
  assert.deepEqual(plain(roundtrip.notes), plain(state.notes));
  const invalid = [
    {...state, notes: {}}, {...state, notes: [state.notes[0], state.notes[0]]},
    {...state, notes: [{...state.notes[0], conversationId: 'not-a-chat'}]},
    {...state, notes: [{...state.notes[0], id: '__proto__'}]},
    {...state, notes: [{...state.notes[0], messageId: 'constructor'}]},
    {...state, notes: [{...state.notes[0], messageId: 'line\nunsafe'}]},
    {...state, notes: [{...state.notes[0], createdAt: Infinity}]},
    {...state, notes: [{...state.notes[0], text: 2}]},
    {...state, stars: []}, {...state, assignments: 'invalid'}
  ];
  for (const value of invalid) assert.throws(() => M.validate(value));
});

test('knowledge validation enforces text, per-kind, message and total storage bounds', () => {
  assert.throws(() => saveNote(M.empty(), {...note(), text: 'x'.repeat(M.LIMITS.text + 1)}), /长度/);
  assert.throws(() => saveNote(M.empty(), {...note(), text: '  '}), /不合法/);
  assert.throws(() => M.validate({...M.empty(), notes: Array(M.LIMITS.notes + 1).fill({})}), /数量/);
  assert.throws(() => M.reduce(M.empty(), {type: 'THREAD_SAVE', item: {id: 'thread-1', conversationId: id(1), messages: Array(101).fill({role: 'user', text: 'a'})}}), /数量/);
  assert.throws(() => M.reduce(M.empty(), {type: 'THREAD_SAVE', item: {id: 'thread-1', conversationId: id(1), messages: [{role: 'system', text: 'hidden'}]}}), /角色/);
  const entries = Array.from({length: 41}, (_, i) => ({...note(`n-${i}`), text: 'x'.repeat(50000), createdAt: 1}));
  assert.throws(() => M.validate({...M.empty(), notes: entries}), /总量/);
});

test('local Store retains account separation for new knowledge fields', async () => {
  const items = new Map();
  const NS = load(['model.js', 'store.js'], {localStorage: {getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value)}});
  const first = new NS.Store('account-a', true); const second = new NS.Store('account-b', true);
  await first.dispatch({type: 'NOTE_SAVE', item: note()});
  assert.equal((await first.read()).notes.length, 1); assert.equal((await second.read()).notes.length, 0);
  await second.dispatch({type: 'SETTINGS', patch: {theme: 'dark'}});
  assert.equal((await first.read()).settings.theme, 'auto'); assert.equal((await second.read()).settings.theme, 'dark');
});
