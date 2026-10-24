'use strict';const {test}=require('node:test'),assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
test('HTML export preserves code, headings, tables and lists; malicious markup and network images stay inert text',()=>{
 const X=load(['exporter.js']).Export,s={title:'<script>Title</script>',complete:true,messages:[{role:'assistant',text:'## 概念\n\n```js\n<script>alert(1)</script>\n  const x = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- 第一项\n- 第二项\n\n<img src="https://private.invalid/file" onerror="alert(1)">'}]};const html=X.html(s);assert.match(html,/<h2>概念<\/h2>/);assert.match(html,/<table>/);assert.match(html,/<ul>/);assert.match(html,/  const x = 1;/);assert.equal(/<script[ >]|<img[ >]|onerror="/i.test(html),false);assert.match(html,/default-src 'none'/);assert.match(html,/当前对话所选分支/);
});
test('partial markdown is explicitly labeled; non-user/assistant and oversized snapshots are rejected',()=>{
 const X=load(['exporter.js']).Export;assert.match(X.text({title:'导出',complete:false,messages:[{role:'user',text:'问题'}]}),/部分导出/);assert.throws(()=>X.validate({title:'x',messages:[{role:'system',text:'secret'}]}));assert.throws(()=>X.validate({title:'x',messages:[{role:'user',text:'x'.repeat(5000001)}]}),/安全上限/);
});
