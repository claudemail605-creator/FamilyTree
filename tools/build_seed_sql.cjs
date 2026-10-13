#!/usr/bin/env node
/* =====================================================================
   Regenerate database/04_seed_from_excel.sql from the family spreadsheet.

   The spreadsheet is the source of truth for the tree. This script reads the
   .xlsx itself — no Python, no npm packages, only Node — and writes the SQL
   that imports it.

   Usage:
     node tools/build_seed_sql.cjs                  # full upsert script
     node tools/build_seed_sql.cjs --insert-only    # never overwrite existing rows
     node tools/build_seed_sql.cjs --out /tmp/x.sql # write somewhere else
     FT_XLSX="other.xlsx" node tools/build_seed_sql.cjs

   Then run the generated file in Supabase -> SQL Editor (after 01_schema.sql).
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const xlsxPath = process.env.FT_XLSX
  ? path.resolve(process.cwd(), process.env.FT_XLSX)
  : path.join(root, 'data', 'Master_Family_Tree_Database.xlsx');
const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const outSql = path.resolve(root, argOf('--out') || path.join('database', '04_seed_from_excel.sql'));
const sheetName = argOf('--sheet');
const insertOnly = process.argv.includes('--insert-only');

/* ------------------------------- .xlsx reading -------------------------------
   An .xlsx is a zip of XML parts. Only what a data sheet needs is supported:
   inline strings, shared strings, numbers, booleans and date-formatted numbers.
   ----------------------------------------------------------------------------- */
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file — is this really an .xlsx?');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const parts = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Damaged zip central directory.');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localAt = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (csize === 0xffffffff || localAt === 0xffffffff) {
      throw new Error('Zip64 archives are not supported.');
    }
    if (buf.readUInt32LE(localAt) !== 0x04034b50) throw new Error('Damaged zip entry: ' + name);
    const nameLen2 = buf.readUInt16LE(localAt + 26);
    const extraLen2 = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + nameLen2 + extraLen2;
    const raw = buf.slice(start, start + csize);
    parts.set(name, method === 8 ? zlib.inflateRawSync(raw) : raw);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return parts;
}

const unxml = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&');
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');
const attr = (xml, name) => {
  const m = new RegExp(name + '="([^"]*)"').exec(xml);
  return m ? unxml(m[1]) : null;
};
const columnIndex = (ref) => {
  const letters = String(ref || '').match(/^[A-Za-z]+/);
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Built-in number formats that mean "this is a date" (ECMA-376 §18.8.30).
const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function looksLikeDateFormat(code) {
  const bare = String(code)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '');
  return /[yd]/i.test(bare) || (/m/i.test(bare) && !/[hs]/i.test(bare));
}

function readSheetParts(parts) {
  const wbXml = parts.get('xl/workbook.xml');
  if (!wbXml) throw new Error('The workbook part is missing from the .xlsx.');
  const wb = wbXml.toString('utf8');
  const date1904 = /date1904="(1|true)"/i.test(wb);

  const relsXml = parts.get('xl/_rels/workbook.xml.rels');
  const relTarget = new Map();
  if (relsXml) {
    for (const m of relsXml.toString('utf8').matchAll(/<Relationship[^>]*\/>/g)) {
      const id = attr(m[0], 'Id');
      const target = attr(m[0], 'Target');
      if (id && target) relTarget.set(id, target.replace(/^\//, '').replace(/^xl\//, ''));
    }
  }

  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id') || attr(m[0], 'id');
    let target = relTarget.get(rid) || '';
    if (target && !/^xl\//.test(target)) target = 'xl/' + target;
    sheets.push({ name, target });
  }

  const sharedXml = parts.get('xl/sharedStrings.xml');
  const shared = sharedXml
    ? [...sharedXml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]))
    : [];

  const stylesXml = parts.get('xl/styles.xml');
  const dateStyles = new Set();
  if (stylesXml) {
    const styles = stylesXml.toString('utf8');
    const custom = new Map();
    for (const m of styles.matchAll(/<numFmt\b[^>]*\/>/g)) {
      const id = +attr(m[0], 'numFmtId');
      const code = attr(m[0], 'formatCode') || '';
      custom.set(id, code);
    }
    const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles);
    if (cellXfs) {
      [...cellXfs[1].matchAll(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)].forEach((m, i) => {
        const id = +(attr(m[0], 'numFmtId') || 0);
        const code = custom.has(id) ? custom.get(id) : '';
        if (BUILTIN_DATE_IDS.has(id) || (code && looksLikeDateFormat(code))) dateStyles.add(i);
      });
    }
  }
  return { sheets, shared, dateStyles, date1904 };
}

function serialToText(serial, date1904) {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial * 86400000));
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
}

function readSheetRows(file) {
  const parts = readZip(file);
  const { sheets, shared, dateStyles, date1904 } = readSheetParts(parts);

  let sheet = sheetName ? sheets.find(s => s.name === sheetName) : null;
  if (sheetName && !sheet) {
    throw new Error('No "' + sheetName + '". Sheets: ' + sheets.map(s => s.name).join(', '));
  }
  if (!sheet) sheet = sheets.find(s => s.name === 'Family_Data') || sheets[0];
  if (!sheet) throw new Error('The workbook has no sheets.');
  const part = parts.get(sheet.target) || parts.get('xl/worksheets/sheet1.xml');
  if (!part) throw new Error('Sheet "' + sheet.name + '" is missing from the .xlsx.');

  const xml = part.toString('utf8');
  const table = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = columnIndex(attr(cellMatch[1], 'r'));
      const type = attr(cellMatch[1], 't') || 'n';
      const style = +(attr(cellMatch[1], 's') || 0);
      const inner = cellMatch[2] || '';
      let value = null;
      if (type === 'inlineStr') {
        value = textOf(inner) || null;
      } else if (type === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = v ? (shared[+v[1]] ?? null) : null;
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (v) {
          const raw = unxml(v[1]);
          if (type === 'str') value = raw;
          else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'e') value = null;
          else if (dateStyles.has(style)) value = serialToText(+raw, date1904);
          else value = raw;
        }
      }
      const i = at >= 0 ? at : cells.length;
      cells[i] = value;
    }
    table.push(cells);
  }
  return { sheetName: sheet.name, table };
}

/* ------------------------------ rows -> objects ------------------------------ */
const { sheetName: usedSheet, table } = readSheetRows(xlsxPath);
if (!table.length) {
  console.error('The sheet is empty.');
  process.exit(1);
}
const header = (table[0] || []).map(h => String(h == null ? '' : h).trim());
if (!header.some(h => /individual/i.test(h))) {
  console.error('Row 1 of "' + usedSheet + '" does not look like the family header ' +
    '(no Individual_ID column). Found: ' + header.filter(Boolean).join(', '));
  process.exit(1);
}
const raw = table.slice(1)
  .filter(cells => cells.some(c => c != null && String(c).trim() !== ''))
  .map(cells => {
    const o = {};
    header.forEach((h, i) => {
      const v = cells[i];
      o[h] = (v == null || String(v).trim() === '') ? null : String(v).trim();
    });
    return o;
  });

/* ------------------------------- helpers -------------------------------- */
// "01/03/1970" -> "1970-03-01" ; anything partial ("1970", "1965 (approx)") -> null
function isoDate(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}
const tidy = v => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};
function sqlText(v) {
  if (v == null) return 'null';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
const pick = (row, ...names) => {
  for (const n of names) {
    if (row[n] != null && String(row[n]).trim() !== '') return String(row[n]).trim();
  }
  return null;
};

/* ------------------------------- map rows ------------------------------- */
const problems = [];
const rows = raw.map((r, i) => {
  const legacy = tidy(pick(r, 'Individual_ID', 'IndividualId', 'ID'));
  if (!legacy) problems.push(`row ${i + 2}: no Individual_ID — skipped`);
  const gender = tidy(pick(r, 'Gender'));
  if (gender && gender !== 'Male' && gender !== 'Female') {
    problems.push(`row ${i + 2} (${legacy}): gender "${gender}" is not Male/Female — importing as null`);
  }
  const row = {
    legacy,
    parent: tidy(pick(r, 'Parent_ID', 'ParentId')),
    gender: gender === 'Male' || gender === 'Female' ? gender : null,
    full_name: tidy(pick(r, 'Full_Name', 'FullName')) || '(name missing)',
    nick_name: tidy(pick(r, 'Nick_Name', 'NickName')),
    fathers_name: tidy(pick(r, 'Fathers_Name', 'FathersName')),
    mothers_name: tidy(pick(r, 'Mothers_Name', 'MothersName')),
    spouse_name: tidy(pick(r, 'Spouse_Name', 'SpouseName')),
    spouse_father_name: tidy(pick(r, 'Spouse_Father_Name', 'SpouseFatherName')),
    dob_text: tidy(pick(r, 'DOB', 'Date_of_Birth')),
    dod_text: tidy(pick(r, 'Date_of_Death', 'DOD')),
    place_of_birth: tidy(pick(r, 'Place_of_Birth', 'PlaceOfBirth')),
    qualification: tidy(pick(r, 'Qualification')),
    place_of_burial: tidy(pick(r, 'Place_of_Burial', 'PlaceOfBurial')),
    source: tidy(pick(r, 'Source_File', 'SourceFile')),
    name_ur: tidy(pick(r, 'Name_Urdu', 'Name_UR', 'Full_Name_Urdu')),
    name_hi: tidy(pick(r, 'Name_Hindi', 'Name_HI', 'Full_Name_Hindi'))
  };
  row.dob = isoDate(row.dob_text);
  row.dod = isoDate(row.dod_text);
  return row;
}).filter(r => r.legacy);

// duplicate Individual_IDs
const seen = new Map();
rows.forEach(r => seen.set(r.legacy, (seen.get(r.legacy) || 0) + 1));
seen.forEach((n, id) => { if (n > 1) problems.push(`Individual_ID ${id} appears ${n} times`); });

// unknown parents + impossible dates
const ids = new Set(rows.map(r => r.legacy));
rows.forEach(r => {
  if (r.parent && !ids.has(r.parent)) problems.push(`${r.legacy}: Parent_ID ${r.parent} is not in the spreadsheet — imported as a root person`);
  if (r.dob && r.dod && r.dod < r.dob) problems.push(`${r.legacy}: date of death is before date of birth — the database will reject this row`);
});

/* ------------------- parents-first ordering (topological) ---------------- */
const byId = new Map(rows.map(r => [r.legacy, r]));
const ordered = [];
const state = new Map(); // 1 = visiting, 2 = done
function visit(row, trail) {
  if (state.get(row.legacy) === 2) return;
  if (state.get(row.legacy) === 1) {
    problems.push(`${row.legacy}: circular Parent_ID chain (${trail.join(' -> ')}) — placed at the top level`);
    return;
  }
  state.set(row.legacy, 1);
  const parent = row.parent && byId.get(row.parent);
  if (parent) visit(parent, trail.concat(row.legacy));
  state.set(row.legacy, 2);
  ordered.push(row);
}
rows.forEach(r => visit(r, [r.legacy]));
// a row whose parent is missing from the sheet is a root
ordered.forEach(r => { if (r.parent && !ids.has(r.parent)) r.parent = null; });

/* ------------------------------- emit SQL -------------------------------- */
const COLS = [
  'legacy_id', 'parent_id', 'gender', 'full_name', 'nick_name', 'fathers_name',
  'mothers_name', 'spouse_name', 'spouse_father_name', 'dob', 'dob_text',
  'place_of_birth', 'qualification', 'dod', 'dod_text', 'place_of_burial',
  'name_ur', 'name_hi', 'source'
];

const lines = [];
for (const r of ordered) {
  const parentExpr = r.parent
    ? `(select id from public.people where legacy_id = ${sqlText(r.parent)})`
    : 'null';
  const vals = [
    sqlText(r.legacy), parentExpr, sqlText(r.gender), sqlText(r.full_name),
    sqlText(r.nick_name), sqlText(r.fathers_name), sqlText(r.mothers_name),
    sqlText(r.spouse_name), sqlText(r.spouse_father_name), sqlText(r.dob),
    sqlText(r.dob_text), sqlText(r.place_of_birth), sqlText(r.qualification),
    sqlText(r.dod), sqlText(r.dod_text), sqlText(r.place_of_burial),
    sqlText(r.name_ur), sqlText(r.name_hi), sqlText(r.source)
  ];
  const conflict = insertOnly
    ? 'on conflict (legacy_id) do nothing'
    : 'on conflict (legacy_id) do update set\n    ' +
      COLS.filter(c => c !== 'legacy_id').map(c => `${c} = excluded.${c}`).join(',\n    ');
  lines.push(
    `insert into public.people (${COLS.join(', ')})\n  values (${vals.join(', ')})\n  ${conflict};`
  );
}

const relSrc = path.relative(root, xlsxPath);
const srcName = relSrc.startsWith('..') ? path.basename(xlsxPath) : relSrc.replace(/\\/g, '/');
const headerOut = `-- =====================================================================
--  YOUR FAMILY DATA  —  generated from ${srcName} (sheet "${usedSheet}")
--  Regenerate with:  node tools/build_seed_sql.cjs
--                    node tools/build_seed_sql.cjs --insert-only
--
--  ${ordered.length} people${insertOnly ? ', insert-only (existing rows are left alone)' : ', existing rows are UPDATED to match the spreadsheet'}.
--
--  Run AFTER 01_schema.sql:
--    Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
--  Parents are inserted before their children, so parent_id resolves against the
--  legacy_id column (the old Individual_ID) — no manual UUID work needed.
--  This only ever touches rows whose legacy_id is in the spreadsheet; people you
--  added in the website keep their own ids and are not listed here.
-- =====================================================================
begin;`;

const footer = `commit;\n-- ${ordered.length} people written`;

const problemsBlock = problems.length
  ? `\n-- ---------------------------------------------------------------------\n--  WARNINGS from the generator\n-- ---------------------------------------------------------------------\n` +
    problems.map(p => `--   * ${p}`).join('\n') + '\n'
  : '';

fs.mkdirSync(path.dirname(outSql), { recursive: true });
fs.writeFileSync(
  outSql,
  headerOut + '\n' + problemsBlock + '\n' + lines.join('\n\n') + '\n\n' + footer + '\n',
  'utf8'
);

console.log(`Read ${raw.length} rows from ${srcName} (sheet "${usedSheet}")`);
console.log(`Wrote ${ordered.length} people to ${path.relative(root, outSql)}`);
if (problems.length) {
  console.log(`\n${problems.length} warning(s):`);
  problems.forEach(p => console.log('  * ' + p));
}
