'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load, id} = require('./helpers.cjs');
const reply = (data, status = 200) => ({status, ok: status >= 200 && status < 300, json: async () => data});
const auth = (user = 'test-user') => reply({user: {id: user}, accessToken: 'fake-token-only-for-tests'});
function setup(responder) {
  const calls = []; const NS = load(['model.js', 'api.js']);
  const api = new NS.Api(async (url, opts) => { calls.push({url, opts}); return responder(url, opts, calls); }, 'https://chatgpt.com');
  return {api, calls};
}
test('connect and pagination are GET-only; token not persisted', async () => {
  const {api, calls} = setup(url => url.endsWith('/api/auth/session') ? auth() : reply({items: [{id: id(1), title: 'Dummy'}], total: 100}));
  const account = await api.connect(); assert.match(account, /^[a-f0-9]{64}$/);
  const page = await api.list(); assert.equal(page.items.length, 1); assert.equal(page.next, 1); assert.equal(page.hasMore, true);
  assert.equal(calls.every(c => c.opts.method === 'GET'), true);
  assert.equal(calls.at(-1).opts.credentials, 'include');
});
test('correct PATCH payload and strict success acknowledgement', async () => {
  const {api, calls} = setup(url => url.endsWith('/api/auth/session') ? auth() : reply({success: true})); await api.connect();
  for (const action of ['archive', 'unarchive', 'delete']) await api.mutate(id(1), action);
  const writes = calls.filter(c => c.opts.method === 'PATCH');
  assert.deepEqual(writes.map(c => JSON.parse(c.opts.body)), [{is_archived: true}, {is_archived: false}, {is_visible: false}]);
  assert.equal(writes.every(c => c.url === `https://chatgpt.com/backend-api/conversation/${id(1)}`), true);
});
test('HTTP 200 without explicit success does not count as mutation success', async () => {
  const {api} = setup(url => url.endsWith('/api/auth/session') ? auth() : reply({detail: 'unexpected'})); await api.connect();
  await assert.rejects(api.mutate(id(1), 'delete'), e => e.uncertain === true);
});
test('rate limit is not retried', async () => {
  const {api, calls} = setup(url => url.endsWith('/api/auth/session') ? auth() : reply({}, 429)); await api.connect();
  await assert.rejects(api.mutate(id(1), 'archive'), e => e.status === 429);
  assert.equal(calls.filter(c => c.opts.method === 'PATCH').length, 1);
});
test('account switch blocks PATCH and clears token', async () => {
  let user = 'one';
  const {api, calls} = setup(() => auth(user)); await api.connect(); user = 'two';
  await assert.rejects(api.mutate(id(1), 'delete'), /账号发生变化/);
  assert.equal(calls.some(c => c.opts.method === 'PATCH'), false); assert.equal(api.token, null);
});
test('network failure after write is uncertain and not retried', async () => {
  const {api, calls} = setup(url => { if (url.endsWith('/api/auth/session')) return auth(); throw Error('network lost'); }); await api.connect();
  await assert.rejects(api.mutate(id(1), 'delete'), e => e.uncertain === true);
  assert.equal(calls.filter(c => c.opts.method === 'PATCH').length, 1);
});
test('unexpected list schema fails closed', async () => {
  const {api} = setup(url => url.endsWith('/api/auth/session') ? auth() : reply({items: [{id: 'invalid', title: 'Dummy'}]})); await api.connect();
  await assert.rejects(api.list(), /结构已变化/);
});
test('real API cannot initialize on arbitrary sites', () => {
  const {Api} = load(['model.js', 'api.js']); assert.throws(() => new Api(async () => {}, 'https://example.com'), /仅支持/);
});
test('full conversation read validates ID and identity before and after GET without writes',async()=>{
 const data={conversation_id:id(1),mapping:{},current_node:'root'};const {api,calls}=setup(url=>url.endsWith('/api/auth/session')?auth():reply(data));await api.connect();assert.equal((await api.conversation(id(1))).conversation_id,id(1));assert.equal(calls.filter(c=>c.url.endsWith('/api/auth/session')).length,3);assert.equal(calls.filter(c=>c.url.endsWith('/backend-api/conversation/'+id(1))).length,1);assert.ok(calls.every(c=>c.opts.method==='GET'));const before=calls.length;await assert.rejects(api.conversation('bad-id'),/ID/);assert.equal(calls.length,before);
});
test('identity change during full conversation read rejects result and clears token',async()=>{
 let user='one';const {api,calls}=setup(url=>{if(url.endsWith('/api/auth/session'))return auth(user);user='two';return reply({mapping:{},current_node:'root'});});await api.connect();await assert.rejects(api.conversation(id(1)),/账号发生变化/);assert.equal(api.token,null);assert.ok(calls.every(c=>c.opts.method==='GET'));
});
