#!/usr/bin/env node
/* =====================================================================
   i18n quality scanner (Phase 3 / Phase 7).

   The Urdu and Hindi dictionaries must read as natural Urdu/Devanagari.
   This script pulls the three object literals out of js/i18n.js and reports:

     1. keys present in English but missing from Urdu or Hindi,
     2. Urdu/Hindi values that still contain Latin words (an untranslated
        leftover such as "immediately"), ignoring {placeholders} and the
        few abbreviations a family tree legitimately keeps (ID, DOB, ...),
     3. values that are byte-identical to English (usually a forgotten key).

   Run:  node tools/scan_i18n_quality.cjs
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'js', 'i18n.js');
const src = fs.readFileSync(FILE, 'utf8');

// Slice out `lang: { ... }` by brace counting, so nested objects are handled.
function block(lang) {
  const i = src.indexOf('\n    ' + lang + ': {');
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 1;
  for (let k = start + 1; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start + 1, k); }
  }
  return null;
}

// Parse 'key': 'value' pairs, honouring \' escapes.
function pairs(body) {
  const out = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)'/);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

const en = pairs(block('en') || '');
const ur = pairs(block('ur') || '');
const hi = pairs(block('hi') || '');
const enMap = new Map(en), urMap = new Map(ur), hiMap = new Map(hi);

// `node tools/scan_i18n_quality.cjs <prefix>` prints the three languages side by
// side for every key starting with <prefix>, which is how the wording is reviewed.
const filterPrefix = process.argv[2];
if (filterPrefix) {
  for (const [k, v] of en) {
    if (!k.startsWith(filterPrefix)) continue;
    console.log(k);
    console.log('  en: ' + v);
    console.log('  ur: ' + (urMap.get(k) != null ? urMap.get(k) : '(missing)'));
    console.log('  hi: ' + (hiMap.get(k) != null ? hiMap.get(k) : '(missing)'));
  }
  process.exit(0);
}

console.log('keys: en=' + en.length + ' ur=' + ur.length + ' hi=' + hi.length);

let problems = 0;

const missingUr = en.filter(([k]) => !urMap.has(k)).map(([k]) => k);
const missingHi = en.filter(([k]) => !hiMap.has(k)).map(([k]) => k);
if (missingUr.length) { problems += missingUr.length; console.log('\nMISSING in Urdu: ' + missingUr.join(', ')); }
if (missingHi.length) { problems += missingHi.length; console.log('MISSING in Hindi: ' + missingHi.join(', ')); }
if (!missingUr.length && !missingHi.length) console.log('key parity: OK (no missing keys)');

// KEEP: words that are genuinely Latin in any language (currency, units, acronyms).
const KEEP = /^(ID|DOB|DOD|JPEG|PNG|WebP|MB|JSON|Excel|xlsx|PDF|PNG|KB)$/i;

for (const [lang, map] of [['ur', urMap], ['hi', hiMap]]) {
  const latin = [];
  const identical = [];
  for (const [k, v] of map) {
    const stripped = v.replace(/\{[a-zA-Z]+\}/g, ' ');
    const words = stripped.match(/[A-Za-z]{3,}/g) || [];
    const bad = words.filter(w => !KEEP.test(w));
    if (bad.length) latin.push(k + ': ' + v + '   <<< latin: ' + bad.join(', '));
    const e = enMap.get(k);
    if (e != null && e === v) identical.push(k + ' = ' + v);
  }
  console.log('\n[' + lang + '] values with Latin leftovers: ' + latin.length);
  latin.forEach(l => console.log('  ' + l));
  console.log('[' + lang + '] values identical to English: ' + identical.length);
  identical.forEach(l => console.log('  ' + l));
  problems += latin.length;
}

console.log('\nscan finished: ' + problems + ' item(s) need attention');
