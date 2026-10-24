'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('service worker serializes concurrent edits without lost updates and isolates accounts', async () => {
  let listener; const data = {};
  const context = vm.createContext({console, URL, chrome: {runtime: {id: 'test-extension', onMessage: {addListener: fn => listener = fn}}, storage: {local: {
    get: async key => ({[key]: data[key]}), set: async entry => { await new Promise(r => setTimeout(r, 1)); Object.assign(data, entry); }
  }}}});
  context.importScripts = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8'), context);
  const request = (account, op, sender = {id: 'test-extension', url: 'https://chatgpt.com/'}) => new Promise(resolve => listener({type: 'CS_STORE', account, op}, sender, resolve));
  const account = 'a'.repeat(64);
  const replies = await Promise.all(Array.from({length: 5}, (_, i) => request(account, {type: 'CREATE_FOLDER', id: `f${i}`, name: `Folder ${i}`})));
  assert.equal(replies.every(r => r.ok), true); assert.equal((await request(account)).state.folders.length, 5);
  assert.equal((await request('b'.repeat(64))).state.folders.length, 0);
  assert.equal((await request(account, undefined, {id: 'test-extension', url: 'https://example.com/'})).ok, false);
  assert.equal((await request('invalid')).ok, false);
});
