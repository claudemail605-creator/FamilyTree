#!/usr/bin/env node
/* =====================================================================
   A repeatable, read-only audit of the browser code. It answers the four
   questions a reviewer asks about a website that talks to a database:

     1. Is anything secret in the shipped files?
     2. Does any user-supplied value reach innerHTML without escaping?
     3. Which columns does the browser write, and could it write one the
        database is supposed to own (path, created_by, updated_by,
        legacy_id, role, active)?
     4. Which tables are touched at all?

   Run from the project root:   node tools/scan_security.cjs
   Exit code is 1 when something needs a human look.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');

// Columns the browser must never send. legacy_id is allowed only from the admin
// import, and role/active only through the admin-users Edge Function (not this code).
const FORBIDDEN = ['path', 'created_by', 'updated_by', 'legacy_id', 'role', 'active'];
// role/active: the admin screen edits other accounts directly, which the database's
// profiles_guard trigger permits for an admin and refuses for everybody else (a user
// cannot promote themselves — verified in the Phase 7 role tests).
const ALLOWED_ELSEWHERE = { legacy_id: /admin\.js$/, role: /admin\.js$/, active: /admin\.js$/ };

const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js'));
let problems = 0;
const line = s => process.stdout.write(s + '\n');

/* ------------------------- 1. secrets in the code ------------------------- */
line('== 1. Secrets ==');
const secretPatterns = [
  [/service_role|service-role key/i, 'service-role mention (comments are fine, a key is not)'],
  [/sb_secret_[A-Za-z0-9_]+/, 'a secret key'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'a JWT'],
  [/ghp_[A-Za-z0-9]{20,}/, 'a GitHub token'],
  [/sk-[A-Za-z0-9]{20,}/, 'an API key']
];
let secretHits = 0;
for (const f of files.concat(['../index.html', '../sw.js', '../manifest.webmanifest'])) {
  const p = path.join(JS_DIR, f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  let inBlock = false;
  text.split('\n').forEach((l, i) => {
    // A mention in a comment is documentation, not a leak. Track /* … */ as well as
    // line comments, because this project's block comments are prose without asterisks.
    const t = l.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; return; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return; }
    if (t.startsWith('*') || t.startsWith('//')) return;
    for (const [re, what] of secretPatterns) {
      if (re.test(l)) {
        secretHits++;
        line(`  ! js/${path.basename(f)}:${i + 1} looks like ${what}: ${t.slice(0, 90)}`);
      }
    }
  });
}
const cfg = fs.readFileSync(path.join(JS_DIR, 'config.js'), 'utf8');
const cfgKeys = [...cfg.matchAll(/^\s*([A-Z_]+)\s*:/gm)].map(m => m[1]);
line(`  js/config.js keys: ${cfgKeys.join(', ') || '(none)'}`);
if (cfgKeys.some(k => !/^SUPABASE_(URL|ANON_KEY)$/.test(k))) {
  problems++;
  line('  ! config.js carries something other than the URL and the publishable key');
} else {
  line('  ok — only SUPABASE_URL and the publishable key');
}
if (secretHits) problems += secretHits;

/* ---------------------------- 2. escaping ---------------------------- */
line('\n== 2. Values written to innerHTML ==');
const HTML_SINK = /(innerHTML|outerHTML|insertAdjacentHTML)\s*[=(]/;
const SAFE = /^esc\(|^SHEET_NAME$|^''$|^""$/;
let sinks = 0;
const flagged = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(JS_DIR, f), 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (!HTML_SINK.test(l)) return;
    // Pull every ${…} out of the line and check it is escaped or a number/constant.
    for (const m of l.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
      sinks++;
      const expr = m[1].trim();
      if (SAFE.test(expr)) continue;
      if (/^Number\(|^[a-z]+ *\+ *1$/.test(expr)) continue;
      // A literal or a value that came from these safe helpers is fine.
      if (/^T\(|^I18n\.t\(|^I18n\.fmt\(|^icon\(|^initials\(/.test(expr)) continue;
      // Escaped somewhere inside the expression (a ternary, a join, …) is fine too.
      if (/\besc\(/.test(expr)) continue;
      flagged.push(`  ? js/${f}:${i + 1}  \${${expr.slice(0, 70)}}`);
    }
  });
}
line(`  ${sinks} interpolation(s) inside HTML sinks, ${flagged.length} without an obvious esc()`);
flagged.slice(0, 25).forEach(line);
problems += flagged.length;

/* ------------------------- 3. database writes ------------------------- */
line('\n== 3. What the browser writes ==');
const WRITE = /\.(insert|update|upsert)\(/;
let writes = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  const lines = text.split('\n');
  let lastTable = '(unknown)';
  lines.forEach((l, i) => {
    // Remember the most recent table name so a write can be attributed to it.
    const from = l.match(/\.from\('([^']+)'\)/);
    if (from) lastTable = from[1];
    if (!WRITE.test(l)) return;
    writes++;
    const table = lastTable;
    const keys = [...l.matchAll(/([a-z_]+)\s*:/g)].map(m => m[1]);
    const bad = keys.filter(k => FORBIDDEN.includes(k) && !(ALLOWED_ELSEWHERE[k] && ALLOWED_ELSEWHERE[k].test(f)));
    const noted = keys.filter(k => FORBIDDEN.includes(k) && ALLOWED_ELSEWHERE[k] && ALLOWED_ELSEWHERE[k].test(f) && ALLOWED_ELSEWHERE[k] === ALLOWED_ELSEWHERE.role);
    line(`  js/${f}:${i + 1}  ${table}  ${l.trim().slice(0, 96)}`);
    if (bad.length) { problems++; line(`     ! writes a database-owned column: ${bad.join(', ')}`); }
    if (noted.length) line(`     note: changes ${noted.join(', ')} — allowed by the database for admins only (see the Phase 7 report)`);
  });
}
line(`  ${writes} write call(s)`);

/* --------------------------- 4. tables touched --------------------------- */
line('\n== 4. Tables referenced ==');
const tables = new Set();
for (const f of files) {
  const text = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  for (const m of text.matchAll(/\.from\('([^']+)'\)/g)) tables.add(`${m[1]} (js/${f})`);
  for (const m of text.matchAll(/functions\.invoke\('([^']+)'/g)) tables.add(`${m[1]} (rpc, js/${f})`);
}
[...tables].sort().forEach(t => line('  ' + t));

line('\n' + (problems ? `scan finished: ${problems} item(s) need a human look` : 'scan finished: nothing flagged'));
process.exit(problems ? 1 : 0);
