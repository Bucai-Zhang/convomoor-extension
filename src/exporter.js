/* Independent, script-free conversation exports. Markdown is treated as untrusted text. */
(() => {
 'use strict';const NS=globalThis.ChatShelf ||= {};
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function validate(value){
  if(!value||typeof value.title!=='string'||value.title.length>500||!Array.isArray(value.messages)||value.messages.length>50000)throw Error('导出内容格式无效');let size=0;
  const messages=value.messages.map(m=>{if(!['user','assistant'].includes(m.role)||typeof m.text!=='string')throw Error('导出消息无效');size+=m.text.length;return {role:m.role,text:m.text,...(Number.isFinite(m.timestamp)?{timestamp:m.timestamp}:{})};});
  if(size>5000000)throw Error('当前导出超过500万字符安全上限，请分段保存');
  return {title:value.title,messages,complete:value.complete===true};
 }
 const inline=text=>escape(text).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
 function markdown(text){
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0;
  while(i<lines.length){const line=lines[i],fence=line.match(/^\s*(`{3,}|~{3,})([^\s]*)\s*$/);
   if(fence){const code=[];i++;while(i<lines.length&&!new RegExp('^\\s*'+fence[1][0]+'{'+fence[1].length+',}\\s*$').test(lines[i]))code.push(lines[i++]);i++;out.push('<pre><code>'+escape(code.join('\n'))+'</code></pre>');continue;}
   const heading=line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);if(heading){const n=heading[1].length;out.push(`<h${n}>${inline(heading[2])}</h${n}>`);i++;continue;}
   if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
    const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|');const head=cells(line);i+=2;const rows=[];while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(cells(lines[i++]));
    out.push('<table><thead><tr>'+head.map(c=>'<th>'+inline(c.trim())+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+inline(c.trim())+'</td>').join('')+'</tr>').join('')+'</tbody></table>');continue;
   }
   if(!line.trim()){i++;continue;}if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){out.push('<hr>');i++;continue;}
   const list=line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.*)/);if(list){const ordered=/^\s*\d/.test(line),items=[];while(i<lines.length){const m=lines[i].match(ordered?/^\s*\d+[.)]\s+(.*)/:/^\s*[-*+]\s+(.*)/);if(!m)break;items.push('<li>'+inline(m[1])+'</li>');i++;}out.push((ordered?'<ol>':'<ul>')+items.join('')+(ordered?'</ol>':'</ul>'));continue;}
   if(/^>\s?/.test(line)){out.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');i++;continue;}
   out.push('<p>'+inline(line)+'</p>');i++;
  }return out.join('\n');
 }
 const css='body{font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif;max-width:900px;margin:32px auto;padding:0 28px;color:#202124;background:#fff}h1{font-size:26px}article{border-top:1px solid #ddd;margin-top:24px;padding-top:16px;break-inside:auto}h2.role{font-size:14px;color:#68745c}p{white-space:pre-wrap;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f5;border:1px solid #ddd;padding:14px;border-radius:6px}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}blockquote{border-left:3px solid #9ab76d;padding-left:12px;color:#555}small{color:#666}@media print{body{margin:0;max-width:none;padding:0}article{page-break-inside:auto}pre,tr{break-inside:avoid}a{color:inherit}@page{size:auto;margin:16mm}}';
 function body(value){const s=validate(value);return '<h1>'+escape(s.title)+'</h1><small>'+ (s.complete?'当前对话所选分支的用户与助手消息':'部分导出：仅含本页已收集的用户与助手消息')+'</small>'+s.messages.map(m=>'<article><h2 class="role">'+(m.role==='user'?'用户':'助手')+(m.timestamp?' · '+escape(new Date(m.timestamp).toLocaleString()):'')+'</h2>'+markdown(m.text)+'</article>').join('\n');}
 function html(s){return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>'+escape(s.title)+'</title><style>'+css+'</style></head><body>'+body(s)+'</body></html>';}
 function text(s){s=validate(s);return '# '+s.title+'\n\n'+(s.complete?'':'> 部分导出：仅含本页已收集消息。\n\n')+s.messages.map(m=>'## '+(m.role==='user'?'用户':'助手')+'\n\n'+m.text).join('\n\n---\n\n')+'\n';}
 NS.Export={validate,markdown,body,html,text,css};
})();
