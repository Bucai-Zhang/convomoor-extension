'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(files = ['model.js'], extra = {}) {
  const context = vm.createContext({console, setTimeout, clearTimeout, AbortController, URLSearchParams, URL, TextEncoder,
    crypto: require('node:crypto').webcrypto, ...extra});
  for (const name of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'), context, {filename: name});
  return context.ChatShelf;
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
module.exports = {load, id};
