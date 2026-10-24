'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const ns=()=>load(['cloud.js'],{TextDecoder});
const sse=(strings,status=200)=>new Response(new ReadableStream({start(controller){for(const text of strings){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));}controller.close();}}),{status,headers:{'content-type':'text/event-stream'}});
test('compatible URLs normalize full endpoints; reject HTTP, credentials, website URLs and malformed context',()=>{
 const NS=ns();assert.equal(NS.cloudConfig({baseURL:'https://router.test/api/v1/chat/completions/',model:'model-id'}).endpoint,'https://router.test/api/v1/chat/completions');
 for(const baseURL of ['http://router.test/v1','https://u:p@router.test/v1','https://router.test/v1?key=x','https://chatgpt.com'])assert.throws(()=>NS.cloudConfig({baseURL,model:'model-id'}));
 assert.throws(()=>NS.cloudPayload({messages:[{role:'tool',content:'x'}]}));assert.throws(()=>NS.cloudPayload({messages:[{role:'user',content:'x'.repeat(100001)}]}),/超过/);
});
test('SSE handles split UTF8, CRLF, comments, delta, usage and DONE with true incremental output',async()=>{
 const NS=ns(),deltas=[];const response=sse([': keepalive\r\n\r\n','data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\n','data: {"choices":[{"delta":{"content":"世界"},"finish_reason":"stop"}]}\n\n','data: {"choices":[],"usage":{"total_tokens":2}}\n\n','data: [DONE]\n\n']);assert.equal(await NS.streamCompletion(response,t=>deltas.push(t)),'你好世界');assert.deepEqual(deltas,['你好','世界']);
});
test('partial stream, mid-stream errors and HTTP errors reject and never silently retry',async()=>{
 const NS=ns();for(const tail of ['', 'data: {"error":{"message":"sensitive provider body"}}\n\n','data: {"choices":[{"finish_reason":"error"}]}\n\n']){let partial='';await assert.rejects(NS.streamCompletion(sse(['data: {"choices":[{"delta":{"content":"部分"}}]}\n\n',tail]),t=>partial+=t));assert.equal(partial,'部分');}
 await assert.rejects(NS.streamCompletion(sse(['not used'],429),()=>assert.fail()),/HTTP 429/);
});
test('non-streaming compatible JSON works but missing choices and empty replies are errors',async()=>{
 const NS=ns();let output='';assert.equal(await NS.streamCompletion(new Response(JSON.stringify({choices:[{message:{content:'兼容回答'}}]}),{headers:{'content-type':'application/json'}}),t=>output+=t),'兼容回答');assert.equal(output,'兼容回答');await assert.rejects(NS.streamCompletion(new Response('{}'),()=>{}),/兼容/);
});
test('DONE terminates even when provider keeps the connection open',async()=>{
 const NS=ns();let cancelled=false;const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"完成"}}]}\n\ndata: [DONE]\n\n'));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
 assert.equal(await NS.streamCompletion(response,()=>{}),'完成');assert.equal(cancelled,true);
});
function worker(protectedStorage=true){const data={},out=[];let options=0,fetches=0,allowed=true;
 const chrome={runtime:{id:'test-extension',openOptionsPage(){options++;},onConnect:{addListener(fn){chrome.connectListener=fn;}}},storage:{local:{setAccessLevel:async()=>{if(!protectedStorage)throw Error('unsupported');},get:async key=>({[key]:data[key]}),set:async values=>Object.assign(data,values),remove:async key=>delete data[key]}},permissions:{contains:async()=>allowed}};
 const NS=load(['cloud.js'],{chrome,TextDecoder,fetch:async(url,opts)=>{fetches++;out.push({url,opts});return sse(['data: {"choices":[{"delta":{"content":"mock"},"finish_reason":"stop"}]}\n\n']);}});NS.setupCloudWorker();
 const content={id:'test-extension',url:'https://chatgpt.com/c/fixture'},settings={id:'test-extension',url:'chrome-extension://test-extension/options.html'};
 const request=(type,sender=settings,config)=>new Promise(resolve=>NS.cloudWorkerMessage({type,config},sender,resolve));
 return {NS,chrome,data,out,request,content,settings,get fetches(){return fetches;},set allowed(v){allowed=v;}};
}
test('only extension options may save Key; status never exposes it, save does not call provider, changed host cannot retain Key',async()=>{
 const w=worker(),config={baseURL:'https://router.test/v1',model:'mock',apiKey:'fake-key-test-only'};
 assert.equal((await w.request('CS_CLOUD_SAVE',w.content,config)).ok,false);assert.equal((await w.request('CS_CLOUD_SAVE',w.settings,config)).ok,true);
 const status=await w.request('CS_CLOUD_STATUS',w.content);assert.equal(status.config.hasKey,true);assert.equal(JSON.stringify(status).includes('fake-key'),false);assert.equal(w.fetches,0);
 assert.equal((await w.request('CS_CLOUD_SAVE',w.settings,{baseURL:'https://other.test/v1',model:'mock'})).ok,false);
 w.allowed=false;assert.equal((await w.request('CS_CLOUD_SAVE',w.settings,config)).ok,false);await w.request('CS_CLOUD_CLEAR');assert.equal((await w.request('CS_CLOUD_GET')).config.hasKey,false);
});
test('worker streams explicit context with no cookies, refuses redirects, and disconnect aborts active request',async()=>{
 const w=worker();await w.request('CS_CLOUD_SAVE',w.settings,{baseURL:'https://router.test/v1',model:'mock',apiKey:'fake-key-test-only'});let onMessage,onDisconnect;const messages=[];
 const port={name:'CS_CLOUD_STREAM',sender:w.content,onMessage:{addListener:f=>onMessage=f},onDisconnect:{addListener:f=>onDisconnect=f},postMessage:m=>messages.push(m),disconnect(){}};
 w.chrome.connectListener(port);await onMessage({type:'generate',payload:{messages:[{role:'user',content:'虚构引用和问题'}]}});assert.equal(w.fetches,1);assert.equal(messages.at(-1).type,'done');assert.equal(messages[0].text,'mock');const {url,opts}=w.out[0];assert.equal(url,'https://router.test/v1/chat/completions');assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.equal(JSON.parse(opts.body).model,'mock');onDisconnect();assert.equal(opts.signal.aborted,true);
});
test('failure to restrict storage to trusted extension contexts blocks saving a Key',async()=>{
 const w=worker(false);const r=await w.request('CS_CLOUD_SAVE',w.settings,{baseURL:'https://router.test/v1',model:'mock',apiKey:'fake-test-only'});assert.equal(r.ok,false);assert.match(r.error,/隔离/);assert.equal(Object.keys(w.data).length,0);assert.equal(w.fetches,0);
});
