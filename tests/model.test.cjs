'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load, id} = require('./helpers.cjs');
const M = load().Model;
const folder = (state, name, parentId = null) => M.reduce(state, {type: 'CREATE_FOLDER', id: name, name, parentId});
test('nested folders, assignment and deletion preserve conversations', () => {
  let state = folder(folder(M.empty(), 'parent'), 'child', 'parent');
  state = M.reduce(state, {type: 'MOVE', ids: [id(1)], folderId: 'child'});
  state = M.reduce(state, {type: 'STAR', ids: [id(1)], value: true});
  assert.equal(M.visible([{id: id(1), title: 'A', archived: false}], state, {view: 'folder:parent'}).length, 1);
  const next = M.reduce(state, {type: 'DELETE_FOLDER', id: 'parent'});
  assert.equal(next.folders.length, 0); assert.equal(next.assignments[id(1)], undefined);
  assert.equal(next.stars[id(1)], true); assert.equal(state.folders.length, 2);
});
test('reject folder cycles, dangling parent, blank name and pollution keys', () => {
  const state = folder(folder(M.empty(), 'a'), 'b', 'a');
  assert.throws(() => M.reduce(state, {type: 'EDIT_FOLDER', id: 'a', parentId: 'b'}), /循环/);
  assert.throws(() => folder(state, 'c', 'missing'), /不存在/);
  assert.throws(() => M.reduce(state, {type: 'EDIT_FOLDER', id: 'a', name: '  '}), /不合法/);
  assert.throws(() => folder(state, '__proto__'), /不合法/);
});
test('backup roundtrip, schema checks and mutation isolation', () => {
  const state = M.reduce(folder(M.empty(), 'books'), {type: 'MOVE', ids: [id(2)], folderId: 'books'});
  const restored = M.reduce(M.empty(), {type: 'IMPORT', state: JSON.parse(JSON.stringify(state))});
  assert.equal(restored.assignments[id(2)], 'books');
  assert.throws(() => M.validate({...state, stars: {[id(1)]: false}}), /不合法/);
  assert.throws(() => M.validate({...state, version: 2}), /版本/);
});
test('search and stars filter only matching loaded view', () => {
  const chats = [{id: id(1), title: 'React 学习', archived: false}, {id: id(2), title: 'Other', archived: true}];
  const state = M.reduce(M.empty(), {type: 'STAR', ids: [id(1)], value: true});
  assert.equal(M.visible(chats, state, {view: 'starred', query: 'REACT'}).length, 1);
  assert.equal(M.visible(chats, state, {archived: true}).length, 1);
  assert.equal(M.visible(chats, state, {query: 'unknown'}).length, 0);
});
test('serial batch stops after first error, with success and pending separated', async () => {
  let active = 0, peak = 0; const calls = [];
  const api = {assertAccount: async () => {}, mutate: async x => {
    active++; peak = Math.max(peak, active); calls.push(x); await new Promise(r => setTimeout(r, 2)); active--;
    if (x === id(2)) throw Error('429');
  }};
  const r = await M.runBatch({ids: [id(1), id(2), id(3)], action: 'archive', api});
  assert.equal(peak, 1); assert.equal(calls.length, 2);
  assert.equal(r.success[0], id(1)); assert.equal(r.failed[0].id, id(2)); assert.equal(r.pending[0], id(3));
});
test('account failure prevents all batch writes', async () => {
  let writes = 0;
  await assert.rejects(M.runBatch({ids: [id(1)], action: 'delete', api: {assertAccount: async () => { throw Error('account changed'); }, mutate: () => writes++}}), /account/);
  assert.equal(writes, 0);
});
test('cancellation after a transmitted request marks uncertainty', async () => {
  const controller = new AbortController();
  const r = await M.runBatch({ids: [id(1), id(2)], action: 'delete', signal: controller.signal,
    api: {assertAccount: async () => {}, mutate: async () => { controller.abort(); throw Object.assign(Error('unknown result'), {uncertain: true}); }}});
  assert.equal(r.success.length, 0); assert.equal(r.failed[0].uncertain, true); assert.equal(r.pending[0], id(2)); assert.equal(r.cancelled, true);
});
test('invalid mutation never reaches API', async () => {
  let calls = 0;
  await assert.rejects(M.runBatch({ids: ['bad'], action: 'delete', api: {assertAccount: () => calls++}}), /不合法/); assert.equal(calls, 0);
});
