'use strict';
// A narrow publication gate, not a complete secret scan or legal clearance.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const failures = [];
const files = [];
const skip = new Set(['node_modules', '.git', 'coverage']);
const forbidden = new Set(['private', 'backups', 'local-data', 'screenshots-private', 'visual-evidence']);
function walk(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, item.name), rel = path.relative(root, full).replaceAll('\\', '/');
    if (item.isSymbolicLink()) { failures.push(`${rel}: symbolic link`); continue; }
    if (item.isDirectory()) {
      if (forbidden.has(item.name)) failures.push(`${rel}: private directory`);
      else if (!skip.has(item.name)) walk(full);
      continue;
    }
    files.push(rel);
    if (/^(?:\.env(?:\..*)?|.*\.(?:pem|crx|zip|sqlite|db|log)|auth\.json|cookies.*|chat-shelf-structure.*\.json)$/i.test(item.name)) failures.push(`${rel}: private or generated file`);
    if (!/\.(?:md|json|js|cjs|html|css)$/.test(item.name) && !['LICENSE', '.gitignore', '.gitattributes'].includes(item.name)) failures.push(`${rel}: unreviewed file type`);
    const body = fs.readFileSync(full, 'utf8');
    const rules = [
      ['personal Windows path', /\b[A-Za-z]:[\\/]+Users[\\/]+[^\s"'<>]+/i],
      ['clipboard attachment', /codex-clipboard-[a-f0-9-]+\.(?:png|jpg)/i],
      ['possible provider credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
      ['possible GitHub credential', /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{24,}\b/],
      ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ];
    for (const [label, pattern] of rules) if (pattern.test(body)) failures.push(`${rel}: ${label}`);
    if ((rel.startsWith('src/') || rel.startsWith('demo/') || rel.endsWith('.html')) && /Chat Shelf|CHAT SHELF/.test(body)) failures.push(`${rel}: legacy visible name`);
    if (rel.startsWith('src/') && /https?:\/\/(?:[^/]+\.)?gptmaster\./i.test(body)) failures.push(`${rel}: reference-product service URL`);
  }
}
walk(root);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (manifest.name !== 'ConvoMoor · 对话港' || pkg.name !== 'convomoor-extension') failures.push('Candidate branding mismatch');
if (manifest.version !== pkg.version || pkg.version !== lock.version || pkg.name !== lock.name || pkg.name !== lock.packages[''].name) failures.push('Package/manifest/lock mismatch');
if (pkg.dependencies && Object.keys(pkg.dependencies).length) failures.push('Runtime dependencies require review');
if (!pkg.private) failures.push('Accidental npm publication guard is absent');
for (const name of ['README.md', 'LICENSE', 'ORIGIN.md', 'PRIVACY.md', 'SECURITY.md', 'MIGRATION.md', 'THIRD_PARTY_NOTICES.md', 'docs/VALIDATION.md']) if (!files.includes(name)) failures.push(`${name}: required publication document missing`);
if (failures.length) {
  console.error(failures.map(item => `FAIL: ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${files.length} candidate files; naming/version alignment, allowlisted file types, private paths and common credential patterns checked.`);
  console.log('LIMIT: heuristic scan only; no legal clearance, comprehensive secret detection, runtime or original-code similarity proof.');
}
