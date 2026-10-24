'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers.cjs');
const request = {messages: [{role: 'user', content: 'Explain this passage'}], selection: 'A fictional passage.'};
function setup({availability = 'available', prompt = async () => 'Local answer', createError} = {}) {
  const calls = [], statuses = [];
  const clone = {prompt: async (...args) => { calls.push(['prompt', ...args]); return prompt(...args); }, destroy: () => calls.push(['destroy-clone'])};
  const model = {availability: async options => { calls.push(['availability', options]); return availability; }, create: async options => {
    calls.push(['create', options]); if (createError) throw createError;
    options.monitor({addEventListener: (name, listener) => { calls.push(['monitor', name]); listener({loaded: .5, total: 1}); }});
    return {prompt() {}, clone: async () => { calls.push(['clone']); return clone; }, destroy: () => calls.push(['destroy-root'])};
  }};
  const NS = load(['local-ai.js']); const runtime = new NS.LocalAIRuntime({model, onStatus: status => statuses.push(status)});
  return {NS, runtime, calls, statuses};
}
test('no activation or model acquisition until enable; generate rejects while disabled', async () => {
  const {runtime, calls} = setup(); assert.equal(calls.length, 0);
  await assert.rejects(runtime.generate(request), /点击启用/); assert.equal(calls.length, 0);
});
test('availability is feature detected; unsupported model never creates or prompts', async () => {
  const {runtime, calls, statuses} = setup({availability: 'unavailable'});
  assert.equal(await runtime.enable(), false); assert.equal(calls.some(c => c[0] === 'create'), false); assert.equal(statuses.at(-1).state, 'unavailable');
  const {LocalAIRuntime} = load(['local-ai.js']); const missing = new LocalAIRuntime({model: null}); assert.equal(await missing.enable(), false);
});
test('explicit enable uses matching declared language options and emits download progress', async () => {
  const {runtime, calls, statuses} = setup({availability: 'downloadable'}); assert.equal(await runtime.enable('ja'), true);
  const availability = calls.find(c => c[0] === 'availability')[1], create = calls.find(c => c[0] === 'create')[1];
  assert.deepEqual(create.expectedInputs, availability.expectedInputs); assert.equal(create.expectedInputs[0].languages[0], 'ja');
  assert.equal(statuses.some(s => s.progress === .5), true); assert.equal(statuses.at(-1).state, 'ready');
});
test('each generation uses a separate clone, carries selection, returns literal text, then destroys clone', async () => {
  const output = '<script>untrusted model output</script>';
  const {runtime, calls} = setup({prompt: async () => output}); await runtime.enable();
  assert.equal(await runtime.generate(request), output); assert.equal(await runtime.generate(request), output);
  assert.equal(calls.filter(c => c[0] === 'clone').length, 2); assert.equal(calls.filter(c => c[0] === 'destroy-clone').length, 2);
  assert.match(calls.find(c => c[0] === 'prompt')[1], /A fictional passage/); runtime.destroy();
  assert.equal(calls.filter(c => c[0] === 'destroy-root').length, 1);
});
test('concurrent tasks are rejected; cancel aborts active inference and failure frees clone', async () => {
  let started; const ready = new Promise(resolve => { started = resolve; });
  const {runtime, calls} = setup({prompt: (_, {signal}) => new Promise((resolve, reject) => { started(); signal.addEventListener('abort', () => reject(Error('aborted'))); })});
  await runtime.enable(); const pending = runtime.generate(request); await ready;
  await assert.rejects(runtime.generate(request), /已有/); runtime.cancel(); await assert.rejects(pending, /aborted/);
  assert.equal(calls.some(c => c[0] === 'destroy-clone'), true); assert.equal(runtime.active, null);
});
test('malformed, oversized and missing-user input is rejected before inference', async () => {
  const {runtime, calls, NS} = setup(); await runtime.enable();
  for (const value of [{messages: []}, {messages: [{role: 'tool', content: 'x'}]}, {messages: [{role: 'user', content: 'x'.repeat(24001)}]}, {messages: [{role: 'assistant', content: 'x'}]}, {...request, selection: 'x'.repeat(6001)}]) assert.throws(() => NS.validateLocalAIRequest(value));
  await assert.rejects(runtime.generate({messages: []})); assert.equal(calls.some(c => c[0] === 'clone'), false);
});
test('permission and language failures are visible; no fake fallback answers', async () => {
  const {runtime, statuses} = setup({createError: Object.assign(Error('permission blocked'), {name: 'NotAllowedError'})});
  assert.equal(await runtime.enable(), false); assert.match(statuses.at(-1).message, /NotAllowedError.*permission blocked/);
  await assert.rejects(runtime.generate(request), /启用/); await assert.rejects(runtime.enable('zh'), /语言/);
});
test('allowed parent origins exclude foreign pages, null, lookalike domains and other extensions', () => {
  const {localAIAllowedParent: allow} = load(['local-ai.js']); const origin = 'chrome-extension://test';
  for (const valid of ['https://chatgpt.com', 'https://chat.openai.com', origin]) assert.equal(allow(valid, origin), true);
  for (const invalid of ['null', 'http://chatgpt.com', 'https://chatgpt.com.evil.test', 'chrome-extension://other', 'https://example.com']) assert.equal(allow(invalid, origin), false);
});
function mockClient(options = {}) {
  const frames = [], channels = [];
  class Channel {
    constructor() { const port = {closed: false, sent: [], postMessage(data) { this.sent.push(data); }, start() {}, close() { this.closed = true; }}; this.port1 = port; this.port2 = {}; channels.push(this); }
  }
  const document = {createElement() { const listeners = {}; const frame = {style: {}, contentWindow: {postMessage: (...args) => { frame.init = args; }}, addEventListener: (name, fn) => { listeners[name] = fn; }, remove() { frame.removed = true; }, fire: name => listeners[name]()}; frames.push(frame); return frame; }};
  const NS = load(['ai-client.js'], {document, MessageChannel: Channel, chrome: {runtime: {id: 'test', getURL: path => `chrome-extension://test/${path}`}}});
  const client = new NS.LocalAIClient({appendChild() {}}, options);
  const emit = data => channels.at(-1).port1.onmessage({data});
  return {client, channels, frames, emit};
}
test('client creates delegated extension iframe and handshake, but never activates model', async () => {
  const {client, frames, channels, emit} = mockClient(); const connecting = client.ensureFrame();
  assert.equal(frames[0].allow, 'language-model'); assert.match(frames[0].src, /local-ai.html$/); frames[0].fire('load');
  assert.equal(frames[0].init[1], 'chrome-extension://test'); assert.equal(frames[0].init[2][0], channels[0].port2);
  emit({type: 'connected'}); await connecting; await assert.rejects(client.generate(request), /点击/); assert.equal(channels[0].port1.sent.length, 0); client.destroy();
});
test('client accepts correlated text only, rejects concurrency, and cancel releases task', async () => {
  const {client, emit, channels} = mockClient(); const connecting = client.ensureFrame(); emit({type: 'connected'}); emit({type: 'status', state: 'ready'}); await connecting;
  const generated = client.generate(request); await Promise.resolve(); const id = channels[0].port1.sent.at(-1).id;
  await assert.rejects(client.generate(request), /已有/); emit({type: 'result', id: 'wrong', text: 'wrong'}); assert.ok(client.pending);
  emit({type: 'result', id, text: 'Answer'}); assert.equal(await generated, 'Answer');
  const cancelled = client.generate(request); await Promise.resolve(); client.cancel(); await assert.rejects(cancelled, /停止/); client.destroy();
});
test('client connection and inference timeouts clean ports and frame', async () => {
  const first = mockClient({readyTimeoutMs: 10}); await assert.rejects(first.client.ensureFrame(), /超时/); assert.equal(first.frames[0].removed, true); assert.equal(first.channels[0].port1.closed, true);
  const next = mockClient({generateTimeoutMs: 10}); const connecting = next.client.ensureFrame(); next.emit({type: 'connected'}); next.emit({type: 'status', state: 'ready'}); await connecting;
  await assert.rejects(next.client.generate(request), /超时/); assert.equal(next.frames[0].removed, true); assert.equal(next.channels[0].port1.closed, true);
});
