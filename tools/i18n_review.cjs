#!/usr/bin/env node
/* =====================================================================
   i18n review helper.

   Prints the English, Urdu and Hindi value of every key whose name starts
   with one of the prefixes given on the command line, so the three
   languages can be read side by side and the wording corrected.

     node tools/i18n_review.cjs                        # everything
     node tools/i18n_review.cjs panel. save. table.    # those groups only

   Add --lang=ur (or hi) to print just one language — much shorter output
   when you only want to proof-read one translation.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'i18n.js'), 'utf8');

function block(lang) {
  const i = src.indexOf('\n    ' + lang + ': {');
  if (i < 0) return '';
  const start = src.indexOf('{', i);
  let depth = 1;
  for (let k = start + 1; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start + 1, k); }
  }
  return '';
}

function pairs(body) {
  const out = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)'/);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

const en = pairs(block('en'));
const ur = new Map(pairs(block('ur')));
const hi = new Map(pairs(block('hi')));

const args = process.argv.slice(2);
const langArg = args.find(a => a.startsWith('--lang='));
const onlyLang = langArg ? langArg.split('=')[1] : null;
const prefixes = args.filter(a => !a.startsWith('--'));
const want = k => !prefixes.length || prefixes.some(p => k.startsWith(p));

en.filter(([k]) => want(k)).forEach(([k, v]) => {
  if (onlyLang === 'ur') { console.log(k + ' :: ' + ur.get(k)); return; }
  if (onlyLang === 'hi') { console.log(k + ' :: ' + hi.get(k)); return; }
  console.log(k);
  console.log('   en: ' + v);
  console.log('   ur: ' + (ur.get(k) != null ? ur.get(k) : '(missing)'));
  console.log('   hi: ' + (hi.get(k) != null ? hi.get(k) : '(missing)'));
});
