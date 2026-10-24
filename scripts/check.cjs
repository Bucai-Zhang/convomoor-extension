'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = [manifest.background.service_worker, manifest.action.default_popup,manifest.options_ui.page, ...manifest.content_scripts.flatMap(c => c.js), ...(manifest.web_accessible_resources || []).flatMap(r=>r.resources)];
for (const f of files) {
  if (path.isAbsolute(f) || f.includes('..') || !fs.existsSync(path.join(root, f))) throw Error(`Missing or invalid manifest path: ${f}`);
}
let count = 0;
for (const dir of ['src', 'demo']) for (const name of fs.readdirSync(path.join(root, dir))) if (name.endsWith('.js')) {
  new vm.Script(fs.readFileSync(path.join(root, dir, name), 'utf8'), {filename: name}); count++;
}
if (manifest.manifest_version !== 3) throw Error('Manifest must be MV3');
if (manifest.host_permissions.some(s => !['https://chatgpt.com/*', 'https://chat.openai.com/*'].includes(s))) throw Error('Unexpected host access');
if (manifest.permissions.some(s => !['storage', 'activeTab'].includes(s))) throw Error('Unexpected permission');
if(JSON.stringify(manifest.optional_host_permissions)!=='["https://*/*"]')throw Error('Cloud host access must be optional HTTPS only');
const htmlFiles = ['popup.html', 'demo/index.html','demo/integration.html', 'local-ai.html','options.html','export.html'];
for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  if (/<script\b[^>]*>\s*[^<\s]/i.test(html) || /\son\w+=/i.test(html)) throw Error(`MV3 inline JS in ${name}`);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https:/.test(match[1])) continue;
    if (!fs.existsSync(path.resolve(root, path.dirname(name), match[1]))) throw Error(`Missing HTML asset: ${match[1]}`);
  }
}
console.log(`PASS: ${count} JavaScript files parse; manifest paths, HTML assets, MV3 CSP and host permissions checked.`);
