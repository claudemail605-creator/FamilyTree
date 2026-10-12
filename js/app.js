/* =====================================================================
   Family Tree viewer
   Data order: 1) data/Master_Family_Tree_Database.xlsx (when served over http)
               2) js/data.js (embedded fallback, works when opened as a file)
               3) "Open Excel" button (pick any .xlsx with the same columns)
   ===================================================================== */
(function () {
  'use strict';

  const XLSX_PATH = 'data/Master_Family_Tree_Database.xlsx';
  const SHEET_NAME = 'Family_Data';

  // Layout constants (px)
  const NW = 180, NH = 72, GX = 16, GY = 66, PAD = 90, SG = 26;
  const unitW = p => p.spouse ? NW * 2 + SG : NW;   // person card (+ spouse card)

  // Excel column -> internal field. Headers are matched ignoring case/underscores/spaces.
  const COLS = {
    individualid: 'id', parentid: 'parentId', generation: 'genFile', gender: 'gender',
    fullname: 'name', nickname: 'nick', fathersname: 'father', mothersname: 'mother',
    spousename: 'spouse', spousefathername: 'spouseFather', dob: 'dob',
    placeofbirth: 'pob', qualification: 'qual', dateofdeath: 'dod',
    placeofburial: 'burial', sourcefile: 'source'
  };

  // Columns shown in the table view / detail panel.
  // Includes the extra Supabase fields (name_ur, name_hi, notes, photo_path, dob_text,
  // dod_text, legacy_id, is_deleted). In the static/Excel mode these fields are absent
  // and render as "—" everywhere (table, panel, edit form) — that's fine.
  const TABLE_COLS = [
    ['id', 'ID'], ['legacy_id', 'Legacy ID'], ['name', 'Full name'], ['nick', 'Nickname'],
    ['gen', 'Gen'], ['gender', 'Gender'], ['father', "Father"], ['mother', "Mother"],
    ['spouse', 'Spouse'], ['spouseFather', "Spouse's father"], ['dob', 'Date of birth'],
    ['dob_text', 'DOB (original text)'], ['pob', 'Place of birth'], ['qual', 'Qualification'],
    ['dod', 'Date of death'], ['dod_text', 'DOD (original text)'], ['burial', 'Place of burial'],
    ['name_ur', 'Name (Urdu)'], ['name_hi', 'Name (Hindi)'], ['notes', 'Notes'],
    ['photo_path', 'Photo'], ['source', 'Source file'], ['is_deleted', 'Deleted?']
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Auth is provided by js/auth.js (Supabase). app.js uses it for data source
  // selection and edit permissions; the tree still works statically without it.
  const Auth = (typeof window.Auth === 'object' && window.Auth) ? window.Auth : null;

  /* ------------------------------ State ------------------------------ */
  const S = {
    people: [], byId: new Map(), kids: new Map(), roots: [],
    collapsed: new Set(),
    f: { q: '', gens: new Set(), genders: new Set(), status: '', branch: '', pob: '', qual: '', has: '' },
    view: 'tree', selected: null, sourceLabel: '',
    showDeleted: false, _allRows: [],
    sort: { key: 'gen', dir: 1 },
    scale: 1, tx: 0, ty: 0, bbox: { w: 0, h: 0 }, pos: new Map(),
    editing: false, editForm: null, auditRows: []
  };

  /* ---------------------------- Data loading ---------------------------- */
  function norm(h) { return String(h || '').toLowerCase().replace(/[^a-z]/g, ''); }

  function fmtDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) {
      const d = new Date(v.getTime() + 12 * 3600 * 1000); // absorb timezone drift
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    }
    return String(v).trim() || null;
  }

  // Format a JS Date / Supabase date string as DD/MM/YYYY for display.
  function fmtSupabaseDate(v) {
    if (v == null || v === '') return null;
    let d = v instanceof Date ? v : parseDate(String(v));
    if (!d || isNaN(d.getTime())) return null;
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  function rowsFromWorkbook(wb) {
    const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
    // NOTE: pass the WORKSHEET (ws) — handing the whole workbook to sheet_to_json
    // silently returns no rows.
    return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, cellDates: true });
  }

  function rowsFromEmbedded() { return window.FAMILY_DATA || []; }

  function normaliseRows(rows) {
    return rows.map(r => {
      const o = {};
      for (const k of Object.keys(r)) {
        const f = COLS[norm(k)];
        if (!f) continue;
        let v = r[k];
        if (f === 'dob' || f === 'dod') v = fmtDate(v);
        else v = (v == null || String(v).trim() === '') ? null : String(v).trim();
        o[f] = v;
      }
      return o;
    }).filter(o => o.id && o.name);
  }

  // Phase 1: the tree comes from Supabase only, and only for an active signed-in user.
  // The Excel / embedded loaders (rowsFromWorkbook, rowsFromEmbedded, normaliseRows) and
  // the "Open Excel" handler are kept in this file but nothing calls them any more.
  async function loadData() {
    if (!(Auth && Auth.client && Auth.isAdminOrActive())) return [];
    const rows = await loadFromSupabase();
    return rows || [];
  }

  // Supabase caps a single response at 1000 rows, so page through. The sort order must
  // be unique (dob + id is) or rows can repeat or vanish between pages.
  const PAGE = 1000;
  async function fetchAllPeople(admin) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      let q = Auth.client
        .from('people')
        .select('*')
        .order('dob', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      // The RLS policy already hides soft-deleted rows from non-admins; say it again so
      // this stays true if that policy is ever relaxed.
      if (!admin) q = q.eq('is_deleted', false);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || !data.length) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return out;
  }

  // Load the live tree from Supabase. Returns rows in the internal format, or null on
  // failure. Only ever called for an active signed-in user.
  async function loadFromSupabase() {
    if (!Auth || !Auth.client) return null;
    S.sourceLabel = 'Supabase';
    try {
      // RLS already limits rows: active users only, soft-deleted hidden for non-admin.
      // We also filter client-side for clarity.
      const admin = Auth.isAdmin();
      const data = await fetchAllPeople(admin);
      if (!data.length) {
        toast(I18n.t('generic.emptyTree'));
        return [];
      }
      const rows = data.map(r => {
        const p = {};
        p.id = r.id || null;
        p.legacy_id = r.legacy_id || null;
        p.parentId = r.parent_id || null;            // uuid — build() matches by id
        p.gender = r.gender || null;
        p.name = r.full_name || null;
        p.nick = r.nick_name || null;
        p.father = r.fathers_name || null;
        p.mother = r.mothers_name || null;
        p.spouse = r.spouse_name || null;
        p.spouseFather = r.spouse_father_name || null;
        p.dob = fmtSupabaseDate(r.dob);          // the real date — Age and sorting need this
        p.dob_text = r.dob_text || null;
        // What the UI shows prefers the original text ("1965 (approx)", "12/3/1940") and only
        // falls back to the tidied date. Both stay available.
        p.dob_display = p.dob_text || p.dob;
        p.pob = r.place_of_birth || null;
        p.qual = r.qualification || null;
        p.dod = fmtSupabaseDate(r.dod);
        p.dod_text = r.dod_text || null;
        p.dod_display = p.dod_text || p.dod;
        p.burial = r.place_of_burial || null;
        p.name_ur = r.name_ur || null;
        p.name_hi = r.name_hi || null;
        p.notes = r.notes || null;
        p.photo_path = r.photo_path || null;
        p.source = r.source || null;
        p.is_deleted = !!(r.is_deleted);
        p.created_by = r.created_by || null;
        p.updated_by = r.updated_by || null;
        p.created_at = r.created_at ? new Date(r.created_at).toISOString() : null;
        p.updated_at = r.updated_at ? new Date(r.updated_at).toISOString() : null;
        // path (uuid[]) maintained by DB trigger — used by canEditPerson only
        p.path = (r.path && Array.isArray(r.path)) ? r.path.slice() : [];
        return p;
      }).filter(o => o.id && o.name);

      // Admin sees soft-deleted people too; non-admin never receive them (the RLS
      // people_select policy already excludes is_deleted rows for non-admin). As a
      // belt-and-suspenders guard, drop any deleted row a non-admin somehow received.
      const out = [];
      for (const p of rows) {
        if (p.is_deleted && !admin) continue;
        Auth.setPersonPath(p.id, p.path);
        out.push(p);
      }

      // Build model — same as the static path. parentId is a uuid; build() matches by id,
      // so spouses (stored as text) do not create parent links, which is correct.
      build(out);
      S.sourceLabel = 'Supabase';
      return out;
    } catch (err) {
      console.warn('loadFromSupabase failed:', err);
      const msg = err?.message || String(err);
      // Friendly mapping for common RLS / network errors.
      const friendly = msg.includes('invalid_token') || msg.includes('JWT')
        ? 'Your sign-in expired — please sign in again.'
        : msg.includes('not found') && msg.includes('table')
        ? 'The people table wasn\'t found — check your Supabase project.'
        : 'Couldn\'t load the tree from Supabase: ' + msg;
      toast(friendly);
      return null;
    }
  }

  /* ----------------------------- Build model ----------------------------- */
  function build(rows) {
    // Keep every fetched row so the "Show deleted" toggle can rebuild without re-fetching.
    S._allRows = rows;
    // Soft-deleted people only join the model when the toggle is on (admins only).
    rows = rows.filter(p => !(p.is_deleted && !S.showDeleted));
    S.people = rows;
    S.byId = new Map(rows.map(p => [p.id, p]));
    S.kids = new Map(rows.map(p => [p.id, []]));
    S.roots = [];
    for (const p of rows) {
      if (p.parentId && S.byId.has(p.parentId) && p.parentId !== p.id) S.kids.get(p.parentId).push(p);
      else S.roots.push(p);
    }
    // depth from the tree structure (more reliable than the Generation column)
    const walk = (p, d, seen) => {
      if (seen.has(p.id)) return; seen.add(p.id);
      p.gen = d; p.parent = p.parentId && S.byId.get(p.parentId) || null;
      S.kids.get(p.id).forEach(c => walk(c, d + 1, seen));
    };
    const seen = new Set();
    S.roots.forEach(r => walk(r, 0, seen));
    // anything stuck in a parent loop becomes a root
    rows.forEach(p => { if (!seen.has(p.id)) { S.roots.push(p); walk(p, 0, seen); } });
    // text for searching
    rows.forEach(p => {
      p._hay = [p.id, p.name, p.nick, p.spouse, p.dob, p.pob, p.qual, p.dod, p.burial]
        .filter(Boolean).join(' ').toLowerCase();
      p._initials = initials(p.name);
    });
  }

  function initials(name) {
    const w = name.replace(/^(syed|syeda|mohammed|md|mohd)\s+/i, '').split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }
  const gcls = p => /^m/i.test(p.gender || '') ? 'male' : /^f/i.test(p.gender || '') ? 'female' : 'unknown';

  /* ----------------------------- Date helpers ----------------------------- */
  function parseDate(s) {
    if (!s) return null;
    let m = String(s).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    m = String(s).match(/^(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[1], 0, 1));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function yearsBetween(a, b) {
    let y = b.getUTCFullYear() - a.getUTCFullYear();
    const m = b.getUTCMonth() - a.getUTCMonth();
    if (m < 0 || (m === 0 && b.getUTCDate() < a.getUTCDate())) y--;
    return y;
  }
  function ageText(p) {
    const b = parseDate(p.dob); if (!b) return null;
    const d = parseDate(p.dod);
    if (p.dod && !d) return null;
    const y = yearsBetween(b, d || new Date());
    return y < 0 ? null : d ? `${y} years (at death)` : `${y} years`;
  }
  // Timestamps (created_at/updated_at/changed_at) as a local, human-readable string.
  function fmtWhen(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  /* ------------------------------- Filters ------------------------------- */
  const isDescendant = (p, branchId) => { for (let c = p; c; c = c.parent) if (c.id === branchId) return true; return false; };

  function filterActive() {
    const f = S.f;
    return !!(f.q || f.gens.size || f.genders.size || f.status || f.branch || f.pob || f.qual || f.has);
  }
  function matches(p) {
    const f = S.f;
    if (f.q && !f.q.split(/\s+/).every(t => p._hay.includes(t))) return false;
    if (f.gens.size && !f.gens.has(p.gen)) return false;
    if (f.genders.size && !f.genders.has(gcls(p))) return false;
    if (f.status === 'deceased' && !p.dod) return false;
    if (f.status === 'living' && p.dod) return false;
    if (f.branch && !isDescendant(p, f.branch)) return false;
    if (f.pob && p.pob !== f.pob) return false;
    if (f.qual && p.qual !== f.qual) return false;
    if (f.has === 'dob' && !p.dob) return false;
    if (f.has === 'spouse' && !p.spouse) return false;
    if (f.has === 'children' && !S.kids.get(p.id).length) return false;
    if (f.has === 'nochildren' && S.kids.get(p.id).length) return false;
    return true;
  }

  /* --------------------------- Sidebar controls --------------------------- */
  function uniq(key) { return [...new Set(S.people.map(p => p[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }

  function buildControls() {
    // generation chips
    const gens = [...new Set(S.people.map(p => p.gen))].sort((a, b) => a - b);
    const gc = $('#genChips'); gc.innerHTML = '';
    gens.forEach(g => gc.append(chip('Gen ' + g, () => toggle(S.f.gens, g), () => S.f.gens.has(g))));
    // gender chips
    const gd = $('#genderChips'); gd.innerHTML = '';
    [['male', 'Male'], ['female', 'Female']].forEach(([k, l]) => gd.append(chip(l, () => toggle(S.f.genders, k), () => S.f.genders.has(k))));

    fillSelect($('#fBranch'), [['', 'Whole family']].concat(
      S.people.filter(p => S.kids.get(p.id).length).sort((a, b) => a.gen - b.gen || a.name.localeCompare(b.name))
        .map(p => [p.id, `${'· '.repeat(p.gen)}${p.name}`])));
    fillSelect($('#fPob'), [['', 'Any place']].concat(uniq('pob').map(v => [v, v])));
    fillSelect($('#fQual'), [['', 'Any qualification']].concat(uniq('qual').map(v => [v, v])));
  }
  function fillSelect(sel, opts) { sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); }
  function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
  function chip(label, onToggle, isOn) {
    const b = el('button', 'chip' + (isOn() ? ' on' : ''), esc(label));
    b.onclick = () => { onToggle(); b.classList.toggle('on', isOn()); refresh(); };
    return b;
  }

  function bindControls() {
    let t;
    $('#search').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { S.f.q = e.target.value.trim().toLowerCase(); refresh(); }, 120); });
    [['#fStatus', 'status'], ['#fBranch', 'branch'], ['#fPob', 'pob'], ['#fQual', 'qual'], ['#fHas', 'has']]
      .forEach(([sel, key]) => $(sel).addEventListener('change', e => { S.f[key] = e.target.value; if (key === 'branch' && e.target.value) S.collapsed.delete(e.target.value); refresh(true); }));

    $('#viewSwitch').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S.view = b.dataset.view;
      [...$('#viewSwitch').children].forEach(x => x.classList.toggle('on', x === b));
      $('#treeView').hidden = S.view !== 'tree';
      $('#tableView').hidden = S.view !== 'table';
      refresh(true);
    });
    $('#btnReset').onclick = resetFilters;
    $('#btnFilters').onclick = () => $('#sidebar').classList.toggle('open');
    $('#btnTheme').onclick = () => {
      const r = document.documentElement;
      const next = r.dataset.theme === 'dark' ? 'light' : 'dark';
      r.dataset.theme = next;
      try { localStorage.setItem('ft-theme', next); } catch (e) { /* ignore */ }
    };
    $('#btnAdmin').onclick = () => { if (Auth && Auth.isAdmin()) openAdminPanel(); };
    $('#btnRefresh').onclick = () => syncFromServer(false);
    $('#btnExport').onclick = exportToExcel;
    // "Show deleted" rebuilds the model from rows already fetched — no second round trip.
    $('#showDeleted').addEventListener('change', e => {
      S.showDeleted = !!e.target.checked;
      if (S._allRows.length) init(S._allRows);
    });
    // Refresh the admin button, close the admin panel on sign-out, and re-load the tree
    // whenever the signed-in state or profile settles. The very first load happens
    // before the session/profile is known, so without this a signed-in active user
    // would keep seeing the static tree instead of the live Supabase one.
    const onAuthStateSettled = () => {
      const admin = !!(Auth && Auth.isAdmin());
      $('#btnAdmin').hidden = !admin;
      $('#btnExport').hidden = !admin;     // exporting the whole tree is admin-only
      $('#deletedField').hidden = !admin;  // so is looking at soft-deleted people
      if (admin) startLiveUpdates(); else stopLiveUpdates();
      if (adminPanelOpen && !admin) closeAdminPanel();
      reloadData();
      // Re-draw the open panel: it may have been rendered before branch_access arrived,
      // which is what decides whether an editor sees the edit buttons.
      if (S.selected) renderPanel();
    };
    if (Auth) Auth._callbacks.onAuthChange = onAuthStateSettled;
    if (Auth && Auth.isAdmin()) $('#btnAdmin').hidden = false;

    // Language toggle: opens a small picker; chosen language is persisted on the
    // user's profile (if signed in) and in localStorage. The I18n module handles
    // re-applying [data-i18n] attributes across the page.
    $('#btnLang').onclick = () => toggleLangPicker();
    window.addEventListener('click', e => { if (!e.target.closest('.lang-picker') && !e.target.closest('#btnLang')) closeLangPicker(); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeLangPicker(); });
    // When the user's profile language changes (profile edit / admin panel), push it
    // to the i18n module.
    if (Auth) Auth._callbacks.onProfileChange = (prof) => {
      if (prof && prof.language) I18n.setLanguage(prof.language);
      onAuthStateSettled();
    };
    // Initialise i18n from the profile if known, else from localStorage.
    if (Auth && Auth.profile && Auth.profile.language) I18n.setLanguage(Auth.profile.language);
    else if (localStorage.getItem('ft-lang')) I18n.setLanguage(localStorage.getItem('ft-lang'));
    I18n.apply();

    const fileEl = $('#fileInput');
    if (fileEl) fileEl.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const rows = normaliseRows(rowsFromWorkbook(wb));
        if (!rows.length) throw new Error('No rows with Individual_ID and Full_Name were found.');
        S.sourceLabel = file.name; init(rows); toast(I18n.fmt('generic.fileLoaded', { n: rows.length, name: esc(file.name) }));
      } catch (err) { toast(I18n.fmt('generic.fileReadFailed', { msg: esc(err.message) })); }
      e.target.value = '';
    });
    $('#zoomIn').onclick = () => zoomBy(1.25);
    $('#zoomOut').onclick = () => zoomBy(1 / 1.25);
    $('#zoomFit').onclick = fit;
    $('#expandAll').onclick = () => { S.collapsed.clear(); refresh(true); };
    $('#collapseAll').onclick = () => { S.people.forEach(p => { if (S.kids.get(p.id).length) S.collapsed.add(p.id); }); refresh(true); };
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
    window.addEventListener('resize', () => { if (S.view === 'tree') fit(); });
  }

  function resetFilters() {
    Object.assign(S.f, { q: '', status: '', branch: '', pob: '', qual: '', has: '' });
    S.f.gens.clear(); S.f.genders.clear();
    $('#search').value = '';
    ['#fStatus', '#fBranch', '#fPob', '#fQual', '#fHas'].forEach(s => $(s).value = '');
    document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
    refresh(true);
  }

  /* ------------------------------- Rendering ------------------------------- */
  // Filters REMOVE everyone who doesn't match. Matching people whose parents were removed are re-attached to their
  // nearest remaining ancestor; with a Branch filter the chosen person becomes the starting point.
  let visible = null;   // Set of ids shown, or null for "everyone"
  let matchSet = new Set();
  let vKids = new Map(), vRoots = [];

  function computeVisibility() {
    matchSet = new Set(S.people.filter(matches).map(p => p.id));
    if (!filterActive()) { visible = null; vKids = S.kids; vRoots = S.roots; return; }
    visible = new Set(matchSet);
    if (S.f.branch) visible.add(S.f.branch);
    vKids = new Map(S.people.map(p => [p.id, []])); vRoots = [];
    S.people.forEach(p => {
      if (!visible.has(p.id)) return;
      let a = p.parent; while (a && !visible.has(a.id)) a = a.parent;
      (a ? vKids.get(a.id) : vRoots).push(p);
    });
  }
  const shownKids = p => vKids.get(p.id) || [];

  function refresh(refit) {
    computeVisibility();
    renderStats();
    if (S.view === 'tree') renderTree(refit); else renderTable();
    renderPanel();
    // Dynamic markup (stats, panel, table) carries data-i18n attributes, so re-apply
    // translations after every render.
    I18n.apply();
  }

  function renderStats() {
    const n = S.people.length, gens = new Set(S.people.map(p => p.gen)).size;
    const dec = S.people.filter(p => p.dod).length;
    $('#stats').innerHTML =
      `<div class="stat"><b>${n}</b><span data-i18n>stats.people</span></div>` +
      `<div class="stat"><b>${gens}</b><span data-i18n>stats.generations</span></div>` +
      `<div class="stat"><b>${dec}</b><span data-i18n>stats.deceased</span></div>`;
    $('#subtitle').textContent = I18n.fmt('brand.subtitle', { n, g: gens, source: S.sourceLabel });
    const rc = $('#resultCount');
    rc.textContent = filterActive()
      ? I18n.fmt('table.resultCount.filtered', { shown: S.view === 'tree' && visible ? visible.size : matchSet.size, n })
      : I18n.fmt('table.resultCount.all', { n });
  }

  /* ---- Tree layout (top-down, subtree-width based) ---- */
  function layout() {
    const pos = new Map();
    const roots = vRoots;
    S.minGen = roots.length ? Math.min(...roots.map(r => r.gen)) : 0;
    const width = p => {
      const k = S.collapsed.has(p.id) ? [] : shownKids(p);
      const w = k.length ? Math.max(unitW(p), k.reduce((s, c) => s + width(c), 0) + GX * (k.length - 1)) : unitW(p);
      p._w = w; return w;
    };
    const place = (p, left) => {
      pos.set(p.id, { x: left + p._w / 2 - unitW(p) / 2, y: (p.gen - S.minGen) * (NH + GY), w: unitW(p) });
      const k = S.collapsed.has(p.id) ? [] : shownKids(p);
      if (!k.length) return;
      const total = k.reduce((s, c) => s + c._w, 0) + GX * (k.length - 1);
      let x = left + (p._w - total) / 2;
      k.forEach(c => { place(c, x); x += c._w + GX; });
    };
    let x = 0;
    roots.forEach(r => { width(r); place(r, x); x += r._w + GX * 2; });
    return { pos, roots };
  }

  function renderTree(refit) {
    const world = $('#world');
    const { pos, roots } = layout();
    S.pos = pos;
    $('#emptyMsg').hidden = !(filterActive() && !matchSet.size);
    if (!pos.size) { world.innerHTML = ''; return; }

    let maxX = 0, maxY = 0, maxGen = 0;
    pos.forEach((v, id) => { maxX = Math.max(maxX, v.x + v.w); maxY = Math.max(maxY, v.y + NH); maxGen = Math.max(maxGen, S.byId.get(id).gen); });
    const W = maxX + PAD * 2, H = maxY + PAD * 2;
    S.bbox = { w: W, h: H };
    const ox = PAD, oy = PAD;   // content offset inside the world

    const active = filterActive();
    let html = '';
    // generation bands
    const gensUsed = new Set([...pos.keys()].map(id => S.byId.get(id).gen));
    gensUsed.forEach(g => {
      if (g % 2) return;
      html += `<div class="band" style="top:${oy + (g - S.minGen) * (NH + GY) - GY / 2}px;height:${NH + GY}px;width:${W}px"><span>Generation ${g}</span></div>`;
    });
    // edges
    let edges = '';
    pos.forEach((v, id) => {
      const p = S.byId.get(id);
      if (S.collapsed.has(id)) return;
      shownKids(p).forEach(c => {
        const q = pos.get(c.id); if (!q) return;
        const x1 = ox + v.x + v.w / 2, y1 = oy + v.y + NH, x2 = ox + q.x + q.w / 2, y2 = oy + q.y, my = y1 + (y2 - y1) / 2;
        const dim = '';
        edges += `<path class="edge${dim}" d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}"/>`;
      });
    });
    html += `<svg width="${W}" height="${H}">${edges}</svg>`;
    // nodes
    pos.forEach((v, id) => {
      const p = S.byId.get(id);
      const nk = shownKids(p).length;
      const cls = ['node', gcls(p)];
      if (S.selected === id) cls.push('selected');
      if (p.is_deleted) cls.push('deleted');
      const tg = nk ? `<button class="tg" data-tg="${esc(id)}" style="left:${ox + v.x + v.w / 2}px;top:${oy + v.y + NH - 11}px" title="${S.collapsed.has(id) ? 'Expand' : 'Collapse'}">${S.collapsed.has(id) ? '+ ' + nk : '−'}</button>` : '';
      html += `<div class="${cls.join(' ')}" data-id="${esc(id)}" style="left:${ox + v.x}px;top:${oy + v.y}px;width:${NW}px;height:${NH}px">
        <div class="avatar">${esc(p._initials)}${p.photo_path ? `<img class="node-photo" data-card-photo="${esc(p.photo_path)}" alt="" hidden>` : ''}</div>
        <div class="meta"><div class="nm">${esc(p.name)}</div>${p.nick ? `<div class="nk">“${esc(p.nick)}”</div>` : ''}</div>
        ${(p.dod || p.is_deleted) ? `<span class="dag" title="${p.dod ? 'Deceased' : ''}${p.dod && p.is_deleted ? ' · ' : ''}${p.is_deleted ? 'Deleted' : ''}">${p.dod ? '†' : ''}${p.is_deleted ? '✕' : ''}</span>` : ''}</div>`;
      if (p.spouse) {
        const sg = gcls(p) === 'male' ? 'female' : gcls(p) === 'female' ? 'male' : 'unknown';
        const sx = ox + v.x + NW;
        html += `<div class="spouse-link" style="left:${sx}px;top:${oy + v.y + NH / 2}px;width:${SG}px"><i>♥</i></div>
          <div class="node spouse ${sg}${S.selected === id ? ' selected' : ''}" data-id="${esc(id)}" data-spouse="1" style="left:${sx + SG}px;top:${oy + v.y}px;width:${NW}px;height:${NH}px">
          <div class="avatar">${esc(initials(p.spouse))}</div>
          <div class="meta"><div class="nm">${esc(p.spouse)}</div><div class="nk">Spouse of ${esc(p.nick || p.name)}</div></div></div>`;
      }
      html += tg;
    });
    world.innerHTML = html;
    world.style.width = W + 'px'; world.style.height = H + 'px';
    hydrateCardPhotos();
    if (refit) fit(); else applyTransform();
  }

  // Cards show the person's photo instead of their initials. All the URLs for the whole
  // tree are fetched in ONE signed-URL request (hundreds of cards would otherwise mean
  // hundreds of round trips); each image stays hidden until it actually loads, so a
  // missing or broken photo silently falls back to the initials.
  async function hydrateCardPhotos() {
    if (!(Auth && Auth.client && window.Photos && Photos.signedUrls)) return;
    const imgs = [...document.querySelectorAll('#world img[data-card-photo]')];
    if (!imgs.length) return;
    const paths = [...new Set(imgs.map(i => i.getAttribute('data-card-photo')))].filter(Boolean);
    let urls = null;
    try {
      urls = await Photos.signedUrls(paths);
    } catch (e) {
      console.warn('Could not sign the card photos:', e);
      return;
    }
    if (!urls) return;
    imgs.forEach(img => {
      const path = img.getAttribute('data-card-photo');
      const url = urls.get(Photos.toKey ? Photos.toKey(path) : path);
      if (!url) return;
      img.addEventListener('load', () => { img.hidden = false; }, { once: true });
      img.addEventListener('error', () => { img.hidden = true; }, { once: true });
      img.src = url;
    });
  }

  /* ---- Pan / zoom ---- */
  function applyTransform() { $('#world').style.transform = `translate(${S.tx}px,${S.ty}px) scale(${S.scale})`; }
  function fit() {
    const st = $('#treeView'); if (!st || !S.bbox.w) return;
    const vw = st.clientWidth, vh = st.clientHeight;
    // Never shrink below a readable size; if the tree is wider than the screen, start centred on the first root and pan.
    const s = Math.min(1, Math.min(vw / S.bbox.w, (vh - 40) / S.bbox.h));
    S.scale = Math.max(.55, s);
    if (S.bbox.w * S.scale <= vw) S.tx = (vw - S.bbox.w * S.scale) / 2;
    else {
      const first = [...S.pos.values()].sort((a, b) => a.y - b.y || a.x - b.x)[0];
      if (vRoots.length > 1) S.tx = 30 - PAD * S.scale;   // several starting points: begin at the left edge
      else S.tx = vw / 2 - (PAD + (first ? first.x + first.w / 2 : 0)) * S.scale;
    }
    S.ty = Math.max(20, (vh - S.bbox.h * S.scale) / 2 - 10);
    if (S.bbox.h * S.scale > vh) S.ty = 20 - PAD * S.scale + 40;
    applyTransform();
  }
  function zoomAt(f, cx, cy) {
    const ns = Math.min(2.2, Math.max(.2, S.scale * f)), r = ns / S.scale;
    S.tx = cx - (cx - S.tx) * r; S.ty = cy - (cy - S.ty) * r; S.scale = ns; applyTransform();
  }
  function zoomBy(f) { const st = $('#treeView'); zoomAt(f, st.clientWidth / 2, st.clientHeight / 2); }

  function bindStage() {
    const st = $('#treeView'), world = $('#world');
    st.addEventListener('wheel', e => {
      e.preventDefault();
      const r = st.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    let drag = null, moved = false;
    st.addEventListener('pointerdown', e => {
      if (e.target.closest('.node, .tg, .spouse-link, .stage-ctrls, .legend')) return;
      drag = { x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty }; moved = false; st.classList.add('dragging'); st.setPointerCapture(e.pointerId);
    });
    st.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      S.tx = drag.tx + dx; S.ty = drag.ty + dy; applyTransform();
    });
    const end = () => { drag = null; st.classList.remove('dragging'); };
    st.addEventListener('pointerup', e => { if (drag && !moved && !e.target.closest('.node, .tg')) closePanel(); end(); });
    st.addEventListener('pointercancel', end);

    // Cards: click (details), toggle button (collapse), hover (tooltip)
    world.addEventListener('click', e => {
      const tg = e.target.closest('.tg');
      if (tg) {
        const id = tg.dataset.tg, before = S.pos.get(id);
        S.collapsed.has(id) ? S.collapsed.delete(id) : S.collapsed.add(id); hideTip(); refresh(false);
        // keep the clicked person where it was on screen while the layout re-centres around the new branch
        const after = S.pos.get(id);
        if (before && after) { S.tx -= (after.x + after.w / 2 - before.x - before.w / 2) * S.scale; S.ty -= (after.y - before.y) * S.scale; applyTransform(); }
        return;
      }
      const n = e.target.closest('.node'); if (n) select(n.dataset.id);
    });
    world.addEventListener('mouseover', e => {
      const n = e.target.closest('.node'); if (!n || e.target.closest('.tg')) return;
      if (n === tipNode) return; tipNode = n; n.dataset.spouse ? showSpouseTip(S.byId.get(n.dataset.id), n) : showTip(S.byId.get(n.dataset.id), n);
    });
    world.addEventListener('mouseout', e => {
      const n = e.target.closest('.node'); if (!n) return;
      if (e.relatedTarget && n.contains(e.relatedTarget)) return; hideTip();
    });
    world.addEventListener('mousemove', e => { if (tipNode) moveTip(e); });
  }

  /* ------------------------------ Tooltip ------------------------------ */
  let tipNode = null;
  function showTip(p, node) {
    const rows = [
      ['Generation', 'Gen ' + p.gen], ['Spouse', p.spouse], ['Born', [p.dob_display || p.dob, p.pob].filter(Boolean).join(' · ')],
      ['Qualification', p.qual], ['Died', p.dod_display || p.dod], ['Children', S.kids.get(p.id).length || null]
    ].filter(r => r[1] != null && r[1] !== '');
    const tip = $('#tooltip');
    tip.innerHTML = `<h4>${esc(p.name)}</h4><div class="sub">${p.nick ? '“' + esc(p.nick) + '” · ' : ''}${esc(p.gender || '')}</div>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="more">Click for full details</div>`;
    tip.hidden = false;
    const r = node.getBoundingClientRect(); placeTip(r.right + 12, r.top);
    tip._anchor = r;
  }
  function showSpouseTip(p, node) {
    const rows = [['Spouse of', p.name], ["Spouse's father", p.spouseFather], ['Children together', S.kids.get(p.id).length || null]]
      .filter(r => r[1] != null && r[1] !== '');
    const tip = $('#tooltip');
    tip.innerHTML = `<h4>${esc(p.spouse)}</h4><div class="sub">Spouse</div>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="more">Click for ${esc(p.nick || p.name)}’s full details</div>`;
    tip.hidden = false;
    const r = node.getBoundingClientRect(); tip._anchor = r; placeTip(r.right + 12, r.top);
  }
  function placeTip(x, y) {
    const tip = $('#tooltip'), w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > innerWidth - 10) x = Math.max(10, x - w - ($('#tooltip')._anchor ? $('#tooltip')._anchor.width : 0) - 24);
    if (y + h > innerHeight - 10) y = innerHeight - h - 10;
    tip.style.left = x + 'px'; tip.style.top = Math.max(10, y) + 'px';
  }
  function moveTip() { /* anchored to the card, nothing to do */ }
  function hideTip() { tipNode = null; $('#tooltip').hidden = true; }

  /* ----------------------------- Detail panel ----------------------------- */
  function select(id, opts = {}) {
    S.selected = id; hideTip();
    document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
    const n = $(`.node[data-id="${CSS.escape(id)}"]`); if (n) n.classList.add('selected');
    renderPanel();
    if (opts.focus) focusPerson(id);
    if (S.view === 'table') document.querySelectorAll('#table tbody tr').forEach(r => r.classList.toggle('sel', r.dataset.id === id));
  }
  function closePanel() {
    S.selected = null; $('#panel').hidden = true;
    document.querySelectorAll('.node.selected, tr.sel').forEach(n => n.classList.remove('selected', 'sel'));
  }

  function row(k, v) { return v != null && v !== '' ? `<div class="p-row"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>` : ''; }
  function sec(title, rows) { const r = rows.join(''); return r ? `<div class="p-sec"><h5>${title}</h5>${r}</div>` : ''; }
  function relBtns(list) { return list.map(p => `<button data-goto="${esc(p.id)}">${esc(p.nick ? p.nick + ' – ' : '')}${esc(p.name)}</button>`).join(''); }

  // Editable people fields (mirror the Supabase people columns an editor/admin may touch).
  // These are also the fields the edit form renders. Static/Excel mode has none of these
  // extra fields; the form still shows, but saving goes nowhere useful (no Supabase client).
  const EDIT_FIELDS = [
    ['full_name', 'Full name', 'text', true],
    ['nick_name', 'Nickname', 'text', false],
    ['gender', 'Gender', 'select', true],
    ['fathers_name', "Father's name", 'text', false],
    ['mothers_name', "Mother's name", 'text', false],
    ['spouse_name', 'Spouse', 'text', false],
    ['spouse_father_name', "Spouse's father", 'text', false],
    ['dob', 'Date of birth', 'date', false],
    ['dob_text', 'DOB (original text)', 'text', false],
    ['place_of_birth', 'Place of birth', 'text', false],
    ['qualification', 'Qualification', 'text', false],
    ['dod', 'Date of death', 'date', false],
    ['dod_text', 'DOD (original text)', 'text', false],
    ['place_of_burial', 'Place of burial', 'text', false],
    ['name_ur', 'Name (Urdu script)', 'text', false],
    ['name_hi', 'Name (Hindi / Devanagari)', 'text', false],
    ['notes', 'Notes', 'textarea', false]
  ];
  const GENDER_OPTIONS = [['Male', 'Male'], ['Female', 'Female']];

  function renderPanel() {
    const pn = $('#panel');
    const p = S.selected && S.byId.get(S.selected);
    if (!p) { pn.hidden = true; S.editing = false; return; }

    if (S.editing && S.editForm && S.editForm.id === p.id) {
      if (S.editForm.mode === 'deletionrequest') { renderDeletionRequestForm(pn, p); return; }
      renderEditForm(pn, p);
      return;
    }
    // view mode
    S.editing = false;
    const kids = S.kids.get(p.id);
    const sibs = p.parent ? S.kids.get(p.parent.id).filter(x => x.id !== p.id) : [];
    const age = ageText(p);
    const personal = [row('Date of birth', p.dob_display || p.dob), row('Age', age), row('Place of birth', p.pob), row('Qualification', p.qual)];
    const family = [row("Father's name", p.father), row("Mother's name", p.mother), row('Spouse', p.spouse), row("Spouse's father", p.spouseFather)];
    const passing = [row('Date of death', p.dod_display || p.dod), row('Place of burial', p.burial)];
    const record = [row('Individual ID', p.id), row('Legacy ID', p.legacy_id), row('Parent ID', p.parentId), row('Source file', p.source)];
    // "Last edited" is written by hand rather than via row() so the admin-only audit-lookup
    // below can swap the text in through textContent (which escapes it for us).
    if (p.updated_at) {
      record.push(`<div class="p-row"><div class="k">${esc(I18n.t('panel.lastEdited'))}</div>` +
        `<div class="v" data-last-edited>${esc(fmtWhen(p.updated_at) || '')}</div></div>`);
    }
    const body = sec('Personal', personal) + sec('Family', family) + sec('Passing', passing);

    let rel = '';
    if (p.parent) rel += `<div class="rel-label">Parent</div><div class="rel">${relBtns([p.parent])}</div>`;
    if (sibs.length) rel += `<div class="rel-label">Siblings (${sibs.length})</div><div class="rel">${relBtns(sibs)}</div>`;
    if (kids.length) rel += `<div class="rel-label">Children (${kids.length})</div><div class="rel">${relBtns(kids)}</div>`;

    // Action bar: Edit + Add child + deletion request (when user may edit this person),
    // plus admin soft-delete/restore and audit log.
    const canEdit = Auth && Auth.canEditPerson(p.id);
    const isAdmin = Auth && Auth.isAdmin();
    const isEditor = Auth && Auth.isActiveEditor();
    const canRequestDeletion = isEditor && canEdit && !p.is_deleted;
    const actionBar = (canEdit || isAdmin) ? `
      <div class="p-actions">
        ${canEdit ? `<button class="btn" id="btnAddChild" data-i18n>panel.addChild</button>` : ''}
        ${canEdit ? `<button class="btn" id="btnEdit" data-i18n>panel.edit</button>` : ''}
        ${canRequestDeletion ? `<button class="btn" id="btnRequestDeletion" data-i18n>panel.requestDeletion</button>` : ''}
        ${isAdmin ? (p.is_deleted
          ? `<button class="btn" id="btnRestore" data-i18n>panel.restore</button>`
          : `<button class="btn" id="btnSoftDelete" data-i18n>panel.softDelete</button>`) : ''}
        ${isAdmin ? `<button class="btn ghost" id="btnAudit" data-i18n>panel.viewAudit</button>` : ''}
      </div>` : '';

    // Photo (Supabase Storage). The bucket is private, so the image is shown through a
    // short-lived signed URL. Everyone signed in can see it; only people who may edit
    // this person get upload/replace/remove — and the database enforces that too.
    const canManagePhoto = !!(Auth && Auth.client && canEdit);
    // Photos only exist in the live Supabase tree; don't show an empty Photo block for
    // every person while running off the static Excel data.
    const showPhotoSec = !!(Auth && Auth.client && (S.sourceLabel === 'Supabase' || p.photo_path));
    const photoSec = showPhotoSec ? `
      <div class="p-sec" id="photoSec">
        <h5 data-i18n>panel.photo</h5>
        <div class="photo-wrap">
          ${p.photo_path
            ? `<button type="button" class="photo-frame has-photo" id="btnPhotoZoom" data-i18n="photos.viewLarger" data-i18n-attr="aria-label">
                 <span class="photo-empty" data-i18n>photos.loading</span>
                 <img class="photo-img" data-photo-img alt="${esc(I18n.fmt('photos.alt', { name: p.name }))}" hidden>
               </button>`
            : `<div class="photo-frame"><span class="photo-empty" data-i18n>photos.none</span></div>`}
          ${canManagePhoto ? `<div class="photo-actions">
            <button type="button" class="btn sm" id="btnPhotoPick" data-i18n="${p.photo_path ? 'photos.replace' : 'photos.upload'}">${p.photo_path ? 'Replace photo' : 'Upload photo'}</button>
            ${p.photo_path ? `<button type="button" class="btn sm danger" id="btnPhotoRemove" data-i18n>photos.remove</button>` : ''}
            <input type="file" id="photoInput" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
          </div>` : ''}
        </div>
      </div>` : '';

    pn.innerHTML = `
      <div class="p-head">
        <button class="icon-btn p-close" id="pClose" aria-label="Close">✕</button>
        <div class="avatar p-avatar" data-photo-avatar>${esc(p._initials)}<img class="p-avatar-img" data-photo-avatar-img alt="" hidden></div>
        <h3>${esc(p.name)}</h3>
        ${p.nick ? `<div class="p-nick">“${esc(p.nick)}”</div>` : ''}
        <div class="p-tags"><span class="tag ${gcls(p)}">${esc(p.gender || 'Gender unknown')}</span><span class="tag">Generation ${p.gen}</span>
          ${p.dod ? '<span class="tag gray">Deceased</span>' : ''}${kids.length ? `<span class="tag gray">${kids.length} child${kids.length > 1 ? 'ren' : ''}</span>` : ''}
          ${p.is_deleted ? '<span class="tag gray">Deleted</span>' : ''}${p.legacy_id ? `<span class="tag gray">legacy ${esc(p.legacy_id)}</span>` : ''}</div>
      </div>
      ${photoSec}
      ${body.trim() ? body : '<div class="p-none">No further details recorded.</div>'}
      ${rel ? `<div class="p-sec"><h5>Relatives</h5>${rel}</div>` : ''}
      ${sec('Record', record)}
      ${actionBar}
      ${isAdmin ? `<div class="p-sec" id="auditBox"></div>` : ''}
      ${p.name_ur ? `<div class="p-sec"><h5>Name (Urdu)</h5><div class="p-row"><div class="v" style="grid-column:1/-1;font-size:15px">${esc(p.name_ur)}</div></div></div>` : ''}
      ${p.name_hi ? `<div class="p-sec"><h5>Name (Hindi)</h5><div class="p-row"><div class="v" style="grid-column:1/-1;font-size:15px">${esc(p.name_hi)}</div></div></div>` : ''}
      <div style="height:16px"></div>`;
    pn.className = 'panel ' + gcls(p);
    pn.hidden = false;
    pn.scrollTop = 0;
    $('#pClose').onclick = () => { S.editing = false; closePanel(); };
    // colour the avatar in the panel header
    const av = $('.p-avatar', pn); const g = gcls(p);
    av.style.background = `var(--${g}-soft)`; av.style.color = `var(--${g})`;
    pn.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => select(b.dataset.goto, { focus: true }));
    if (canEdit) $('#btnAddChild', pn).onclick = () => startAddChild(p);
    if (canEdit) $('#btnEdit', pn).onclick = () => startEditing(p);
    if (canRequestDeletion) $('#btnRequestDeletion', pn).onclick = () => startDeletionRequest(p);
    if (isAdmin) {
      // Soft-delete and restore are mutually exclusive: only one of the two is rendered.
      const bDel = $('#btnSoftDelete', pn);
      const bRes = $('#btnRestore', pn);
      const bAud = $('#btnAudit', pn);
      if (bDel) bDel.onclick = () => toggleSoftDelete(p);
      if (bRes) bRes.onclick = () => toggleSoftDelete(p);
      if (bAud) bAud.onclick = () => loadAudit(p);
    }
    bindPhotoActions(pn, p);
    hydratePhoto(pn, p);
    hydrateLastEdited(pn, p);
    I18n.apply();
  }

  // "Last edited" already shows updated_at. Admins get the extra detail of WHO made the
  // change, read from audit_log (RLS allows admins to read it). Failing to read it is
  // not worth an error message — the timestamp is already on screen.
  async function hydrateLastEdited(pn, p) {
    if (!p.updated_at) return;
    if (!(Auth && Auth.client && Auth.isAdmin())) return;
    const slot = pn.querySelector('[data-last-edited]');
    if (!slot) return;
    try {
      const { data, error } = await Auth.client
        .from('audit_log')
        .select('changed_by_name, changed_at')
        .eq('person_id', p.id)
        .order('changed_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const hit = data && data[0];
      if (!hit || S.selected !== p.id) return;
      // The panel may have been replaced while this was in flight.
      const live = $('#panel').querySelector('[data-last-edited]');
      if (!live) return;
      const when = fmtWhen(hit.changed_at) || fmtWhen(p.updated_at) || '';
      live.textContent = hit.changed_by_name
        ? I18n.fmt('panel.lastEditedBy', { name: hit.changed_by_name, date: when })
        : I18n.fmt('panel.lastEditedOn', { date: when });
    } catch (e) {
      console.warn('Could not read the audit log for last-edited:', e);
    }
  }

  /* --------------------- Photos (Supabase Storage) --------------------- */
  // Wire the upload / replace / remove / zoom controls for the selected person.
  function bindPhotoActions(pn, p) {
    const input = $('#photoInput', pn);
    const pick = $('#btnPhotoPick', pn);
    if (pick && input) {
      pick.onclick = () => input.click();
      input.onchange = () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (file) uploadPhoto(p, file);
      };
    }
    const rm = $('#btnPhotoRemove', pn);
    if (rm) rm.onclick = () => removePhoto(p);
    const zoom = $('#btnPhotoZoom', pn);
    if (zoom) zoom.onclick = () => {
      const img = zoom.querySelector('img[data-photo-img]');
      if (img && img.src) openLightbox(p, img.src);
    };
  }

  // Resolve the signed URL and swap it into the header avatar and the photo preview.
  async function hydratePhoto(pn, p) {
    if (!p || !p.photo_path || !Auth || !Auth.client || !window.Photos) return;
    const wantId = p.id;
    let url;
    try {
      url = await Photos.signedUrl(p.photo_path);
    } catch (err) {
      console.warn('Could not sign the photo URL:', err);
      showPhotoError(pn);
      return;
    }
    // The panel may have moved on to another person while we waited.
    if (!url || S.selected !== wantId) return;
    showImage(pn.querySelector('img[data-photo-img]'), url);
    showImage(pn.querySelector('img[data-photo-avatar-img]'), url);
  }

  function showImage(img, url) {
    if (!img) return;
    const frame = img.closest('.photo-frame');
    const hint = frame ? frame.querySelector('.photo-empty') : null;
    img.addEventListener('load', () => {
      img.hidden = false;
      if (hint) hint.hidden = true;
    }, { once: true });
    img.addEventListener('error', () => {
      img.hidden = true;
      if (hint) { hint.hidden = false; hint.removeAttribute('data-i18n'); hint.textContent = I18n.t('photos.errLoad'); }
    }, { once: true });
    img.src = url;
  }

  function showPhotoError(scope) {
    const hint = scope && scope.querySelector ? scope.querySelector('.photo-empty') : null;
    if (hint) { hint.hidden = false; hint.removeAttribute('data-i18n'); hint.textContent = I18n.t('photos.errLoad'); }
  }

  async function uploadPhoto(p, file) {
    if (!Auth || !Auth.client || !window.Photos) { toast(I18n.t('photos.notConnected')); return; }
    const v = Photos.validate(file);
    if (!v.ok) {
      toast(v.error === 'photos.errSize' ? I18n.fmt('photos.errSize', { max: v.max }) : I18n.t(v.error));
      return;
    }
    const btn = $('#btnPhotoPick', $('#panel'));
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = I18n.t('photos.uploading'); }
    try {
      const key = await Photos.upload(p.id, file, p.photo_path || null);
      p.photo_path = key;
      renderPanel();
      toast(I18n.t('photos.uploaded'));
    } catch (err) {
      toast(photoError(err));
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  async function removePhoto(p) {
    if (!Auth || !Auth.client || !window.Photos) { toast(I18n.t('photos.notConnected')); return; }
    if (!window.confirm(I18n.t('photos.removeConfirm'))) return;
    const btn = $('#btnPhotoRemove', $('#panel'));
    if (btn) { btn.disabled = true; btn.textContent = I18n.t('photos.removing'); }
    try {
      await Photos.remove(p.id, p.photo_path);
      p.photo_path = null;
      renderPanel();
      toast(I18n.t('photos.removed'));
    } catch (err) {
      toast(photoError(err));
      renderPanel();
    }
  }

  // Map a storage/RLS failure to a friendly, translated message.
  function photoError(err) {
    if (err && err.code && String(err.code).indexOf('photos.') === 0) {
      return err.code === 'photos.errSize' ? I18n.fmt('photos.errSize', { max: err.max }) : I18n.t(err.code);
    }
    const msg = (err && (err.message || err.error_description)) || String(err);
    if (/row-level security|permission|not allowed|forbids|violates|unauthoriz|403/i.test(msg)) return I18n.t('photos.errPerm');
    if (/invalid api key|jwt|invalid_token|expired/i.test(msg)) return I18n.t('photos.errAuth');
    return I18n.fmt('photos.errFailed', { msg: msg });
  }

  // ---------- Photo lightbox ----------
  let lightboxEl = null;
  function lightboxKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLightbox(); }
  }
  function openLightbox(p, src) {
    if (!src) return;
    closeLightbox();
    const alt = I18n.fmt('photos.alt', { name: p.name });
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', alt);
    box.innerHTML = `<button class="icon-btn lightbox-close" aria-label="${esc(I18n.t('panel.close'))}">✕</button><img alt="${esc(alt)}">`;
    box.querySelector('img').src = src;
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('.lightbox-close')) closeLightbox();
    });
    document.body.appendChild(box);
    lightboxEl = box;
    // Capture phase, so Escape closes the lightbox instead of the detail panel behind it.
    window.addEventListener('keydown', lightboxKey, true);
  }
  function closeLightbox() {
    window.removeEventListener('keydown', lightboxKey, true);
    if (lightboxEl) { lightboxEl.remove(); lightboxEl = null; }
  }

  // ---------- Edit form ----------
  function startEditing(p) {
    S.editing = true;
    S.editForm = { id: p.id, values: captureEditValues(p), mode: 'edit' };
    renderPanel();
  }

  // ---------- Deletion request form (editor) ----------
  function startDeletionRequest(p) {
    if (!Auth || !Auth.client) {      toast(I18n.t('save.notConnected')); return; }
    S.editing = true;
    S.editForm = { id: p.id, mode: 'deletionrequest', parentId: null, reason: '' };
    renderPanel();
  }

  function renderDeletionRequestForm(pn, p) {
    const form = el('form', 'edit-form');
    form.innerHTML = `
      <div class="p-head">
        <button class="icon-btn p-close" id="pClose" aria-label="Close" data-i18n-attr="aria-label">✕</button>
        <div class="avatar p-avatar" style="width:44px;height:44px;font-size:16px">${esc(p._initials)}</div>
        <h3>${I18n.fmt('panel.requestDeletionTitle', { name: esc(p.name) })}</h3>
        <div class="p-nick" style="margin-top:4px">${I18n.t('panel.requestDeletionSub')}</div>
      </div>
      <div class="p-sec" style="padding-top:14px">
        <div class="edit-field">
          <label class="edit-label" for="drReason">${I18n.t('panel.deletionReason')} <span class="edit-req" data-i18n>edit.required</span></label>
          <textarea class="edit-input" id="drReason" rows="4" placeholder="${esc(I18n.t('panel.deletionReasonPlaceholder') || '')}" style="resize:vertical;min-height:80px">${esc(S.editForm.reason)}</textarea>
        </div>
        <div class="p-none" style="padding:4px 18px 10px;font-size:12px">${I18n.t('panel.requestDeletionNote')}</div>
      </div>
      <div class="p-actions" style="padding:14px 18px;border-top:1px solid var(--line)">
        <button type="button" class="btn" id="btnCancelEdit" data-i18n>panel.cancel</button>
        <button type="submit" class="btn primary" id="btnSaveEdit" style="background:var(--accent);color:#fff;border-color:var(--accent)" data-i18n>panel.submitRequest</button>
      </div>`;
    pn.innerHTML = '';
    pn.append(form);
    pn.className = 'panel ' + gcls(p);
    pn.hidden = false;
    pn.scrollTop = 0;
    $('#pClose', pn).onclick = () => { S.editing = false; S.editForm = null; renderPanel(); };
    $('#btnCancelEdit', pn).onclick = () => { S.editing = false; S.editForm = null; renderPanel(); };
    form.onsubmit = (e) => { e.preventDefault(); submitDeletionRequest(p, form); };
    const first = form.querySelector('.edit-input');
    if (first) setTimeout(() => first.focus(), 0);
    I18n.apply();
  }

  async function submitDeletionRequest(p, form) {
    const reason = document.getElementById('drReason').value.trim();
    if (!reason) { toast('Please enter a reason for the deletion request.'); const r = document.getElementById('drReason'); if (r) { r.focus(); r.style.borderColor = 'var(--accent)'; } return; }
    if (!Auth || !Auth.client) {      toast(I18n.t('save.notConnected')); return; }
    const btn = $('#btnSaveEdit', form);
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const { error } = await Auth.client.from('deletion_requests').insert({
        person_id: p.id,
        reason: reason
      });
      if (error) throw error;
      S.editing = false; S.editForm = null;
      renderPanel();
      toast(I18n.t('panel.requestSubmitted'));
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('permission') || msg.includes('forbids') || msg.includes('not allowed')
        ? I18n.t('save.permError')
        : I18n.fmt('save.deleteRequestFailed', { msg });
      toast(friendly);
      btn.disabled = false;
      btn.textContent = I18n.t('panel.submitRequest');
    }
  }

  // ---------- Add child form ----------
  function startAddChild(p) {
    S.editing = true;
    S.editForm = { id: p.id, values: captureEditValues({}), mode: 'addchild', parentId: p.id };
    renderPanel();
  }

  function captureEditValues(p) {
    const v = {};
    for (const [key] of EDIT_FIELDS) v[key] = p[key] != null ? p[key] : '';
    return v;
  }

  function renderEditForm(pn, p) {
    const form = el('form', 'edit-form');
    const mode = S.editForm.mode;
    const isAddChild = mode === 'addchild';
    const parent = isAddChild ? S.byId.get(S.editForm.parentId) : null;
    const titleName = parent ? parent.name : p.name;
    form.innerHTML = `
      <div class="p-head">
        <button class="icon-btn p-close" id="pClose" aria-label="Close" data-i18n-attr="aria-label">✕</button>
        <div class="avatar p-avatar" style="width:44px;height:44px;font-size:16px">${esc(p._initials)}</div>
        <h3>${isAddChild ? I18n.fmt('panel.addChildTitle', { name: esc(titleName) }) : I18n.fmt('panel.editTitle', { name: esc(titleName) })}</h3>
        <div class="p-nick" style="margin-top:4px">${isAddChild
          ? I18n.t('panel.addChildSub')
          : I18n.fmt('panel.editSub', { gen: p.gen, gender: esc(p.gender || 'unknown') })}</div>
      </div>
      ${isAddChild ? `<div class="p-none" style="padding:6px 18px 12px">${I18n.fmt('panel.addChildOf', { name: esc(parent.name), gen: parent.gen })}<br><span style="font-size:12px">${I18n.t('photos.addChildNote')}</span></div>` : ''}
      <div class="p-sec" style="padding-top:14px">`;
    for (const [key, label, type, required] of EDIT_FIELDS) {
      const val = S.editForm.values[key] != null ? S.editForm.values[key] : '';
      const field = el('div', 'edit-field');
      const lbl = el('label', 'edit-label', I18n.t(label) + (required ? ' <span class="edit-req" data-i18n>edit.required</span>' : ''));
      lbl.htmlFor = 'ef_' + key;
      if (type === 'select') {
        const sel = el('select', 'edit-input');
        sel.id = 'ef_' + key;
        sel.required = required;
        GENDER_OPTIONS.forEach(([ov, ol]) => {
          const opt = document.createElement('option');
          opt.value = ov;
          opt.textContent = ol;
          if (ov === val) opt.selected = true;
          sel.append(opt);
        });
        field.append(lbl, sel);
      } else if (type === 'textarea') {
        const ta = el('textarea', 'edit-input', esc(val));
        ta.id = 'ef_' + key; ta.rows = 3; ta.required = required;
        ta.placeholder = I18n.t('edit.textareaPlaceholder') || 'Optional — free text.';
        field.append(lbl, ta);
      } else {
        const inp = el('input', 'edit-input', esc(val));
        inp.id = 'ef_' + key;
        inp.type = type === 'date' ? 'date' : 'text';
        inp.required = required;
        if (type === 'date') inp.placeholder = I18n.t('edit.datePlaceholder') || 'YYYY-MM-DD (or leave blank)';
        field.append(lbl, inp);
      }
      form.append(field, el('div', ''));
    }
    form.innerHTML += `</div>
      <div class="p-actions" style="padding:14px 18px;border-top:1px solid var(--line)">
        <button type="button" class="btn" id="btnCancelEdit" data-i18n>panel.cancel</button>
        <button type="submit" class="btn primary" id="btnSaveEdit" style="background:var(--accent);color:#fff;border-color:var(--accent)" data-i18n>${isAddChild ? 'panel.addGo' : 'panel.save'}</button>
      </div>`;
    pn.innerHTML = '';
    pn.append(form);
    pn.className = 'panel ' + gcls(p);
    pn.hidden = false;
    pn.scrollTop = 0;
    $('#pClose', pn).onclick = () => { S.editing = false; S.editForm = null; renderPanel(); };
    $('#btnCancelEdit', pn).onclick = () => { S.editing = false; S.editForm = null; renderPanel(); };
    form.onsubmit = (e) => { e.preventDefault(); isAddChild ? saveAddChild(p, form) : saveEdit(p, form); };
    I18n.apply();
    // focus first field
    const first = form.querySelector('.edit-input');
    if (first) setTimeout(() => first.focus(), 0);
  }

  function readEditValues(form) {
    const v = {};
    for (const [key, , type] of EDIT_FIELDS) {
      const el2 = document.getElementById('ef_' + key);
      v[key] = el2 ? (el2.value || (type === 'select' ? '' : '')) : '';
    }
    return v;
  }

  function saveEdit(p, form) {
    const vals = readEditValues(form);
    // Basic validation: full_name required (and non-empty after trim).
    if (!vals.full_name || !String(vals.full_name).trim()) {
      toast('Full name is required.');
      const nf = document.getElementById('ef_full_name');
      if (nf) { nf.focus(); nf.style.borderColor = 'var(--accent)'; }
      return;
    }
    // Build the update payload.
    //   * dob/dod: send ISO date when set, null when cleared.
    //   * gender: send only when a valid value is chosen (empty = no change). The DB
    //     check constraint rejects empty strings and NULLs for gender.
    //   * everything else: send the value as-is, including emptying a field.
    const payload = {};
    for (const [key, , type] of EDIT_FIELDS) {
      let v = vals[key];
      if (key === 'gender') {
        if (!v || !GENDER_OPTIONS.some(([o]) => o === v)) continue; // no change or invalid → skip
        payload[key] = v;
        continue;
      }
      if (v === '') {
        if (key === 'dob' || key === 'dod') payload[key] = null;
        else payload[key] = '';
      } else {
        if (key === 'dob' || key === 'dod') {
          const d = parseDate(v);
          payload[key] = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
          if (!payload[key]) { toast('“' + key + '“ is not a valid date.'); return; }
        } else {
          payload[key] = v;
        }
      }
    }

    if (!Auth || !Auth.client) {        toast(I18n.t('save.notConnected'));
      return;
    }
    const before = performance.now();
    $('#btnSaveEdit', form).disabled = true;
    $('#btnSaveEdit', form).textContent = 'Saving…';
    Auth.client.from('people').update(payload).eq('id', p.id)
      .then(({ error }) => {
        if (error) throw error;
        // Reload the person from the server so the panel reflects server values
        // (including any trigger-stamped updated_at / path changes).
        return Auth.client.from('people').select('*').eq('id', p.id).single();
      })
      .then(row => {
        if (!row) { toast('Saved, but the person vanished — reload the page.'); S.editing = false; S.editForm = null; renderPanel(); return; }
        // Merge server columns back into the local model so the panel + tree stay consistent.
        Object.assign(p, mapSupabasePerson(row));
        // refresh derived fields (initials, search haystack) for the updated person
        p._initials = initials(p.name);
        p._hay = [p.id, p.name, p.nick, p.spouse, p.dob, p.pob, p.qual, p.dod, p.burial]
          .filter(Boolean).join(' ').toLowerCase();
        // refresh path for canEditPerson
        Auth.setPersonPath(p.id, (row.path && Array.isArray(row.path)) ? row.path.slice() : []);
        S.editing = false; S.editForm = null;
        renderPanel();
        toast(I18n.t('save.changesSaved'));
      })
      .catch(err => {
        const msg = err?.message || String(err);
        const friendly = msg.includes('Only an admin can move a person')
          ? I18n.t('save.moveError')
          : msg.includes('Only an admin can delete or restore')
          ? I18n.t('save.deleteRestoreError')
          : msg.includes('new row for relation "people" violates foreign key')
          || msg.includes('Parent not found')
          ? I18n.t('save.foreignKeyError')
          : msg.includes('permission') || msg.includes('not allowed') || msg.includes('forbids')
          ? I18n.t('save.permError')
          : I18n.fmt('save.saveFailed', { msg });
        toast(friendly);
        toast(friendly);
        $('#btnSaveEdit', form).disabled = false;
        $('#btnSaveEdit', form).textContent = 'Save changes';
      });
  }

  // Map a Supabase people row back to the internal model fields.
  function mapSupabasePerson(r) {
    const p = {};
    p.id = r.id || null;
    p.legacy_id = r.legacy_id || null;
    p.parentId = r.parent_id || null;
    p.gender = r.gender || null;
    p.name = r.full_name || null;
    p.nick = r.nick_name || null;
    p.father = r.fathers_name || null;
    p.mother = r.mothers_name || null;
    p.spouse = r.spouse_name || null;
    p.spouseFather = r.spouse_father_name || null;
    p.dob = fmtSupabaseDate(r.dob);
    p.dob_text = r.dob_text || null;
    p.pob = r.place_of_birth || null;
    p.qual = r.qualification || null;
    p.dod = fmtSupabaseDate(r.dod);
    p.dod_text = r.dod_text || null;
    p.burial = r.place_of_burial || null;
    p.name_ur = r.name_ur || null;
    p.name_hi = r.name_hi || null;
    p.notes = r.notes || null;
    p.photo_path = r.photo_path || null;
    p.source = r.source || null;
    p.is_deleted = !!(r.is_deleted);
    p.created_by = r.created_by || null;
    p.updated_by = r.updated_by || null;
    p.created_at = r.created_at ? new Date(r.created_at).toISOString() : null;
    p.updated_at = r.updated_at ? new Date(r.updated_at).toISOString() : null;
    p.path = (r.path && Array.isArray(r.path)) ? r.path.slice() : [];
    return p;
  }

  // ---------- Add child (insert) ----------
  async function saveAddChild(p, form) {
    const vals = readEditValues(form);
    if (!vals.full_name || !String(vals.full_name).trim()) {
      toast('Full name is required.');
      const nf = document.getElementById('ef_full_name');
      if (nf) { nf.focus(); nf.style.borderColor = 'var(--accent)'; }
      return;
    }
    if (!Auth || !Auth.client) {      toast(I18n.t('save.notConnectedAdd')); return; }
    // Build the insert payload. parent_id is required (editor insert policy).
    const payload = { parent_id: S.editForm.parentId };
    for (const [key, , type] of EDIT_FIELDS) {
      let v = vals[key];
      if (v === '') {
        if (key === 'dob' || key === 'dod') payload[key] = null;
        else payload[key] = '';
      } else {
        if (key === 'gender') {
          if (!GENDER_OPTIONS.some(([o]) => o === v)) { toast('Gender must be Male or Female.'); return; }
          payload[key] = v;
        } else if (key === 'dob' || key === 'dod') {
          const d = parseDate(v);
          payload[key] = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
          if (!payload[key]) { toast('“' + key + '“ is not a valid date.'); return; }
        } else {
          payload[key] = v;
        }
      }
    }
    // gender is required for insert? The DB allows NULL but the check constraint...
    // Actually gender has check (gender in ('Male','Female')) which rejects NULL.
    // So we must send a gender. Default to 'Male' if not specified.
    if (!payload.gender) payload.gender = 'Male';

    const btn = $('#btnSaveEdit', form);
    btn.disabled = true;
    btn.textContent = 'Adding…';
    try {
      const { data, error } = await Auth.client.from('people').insert(payload).select('*');
      if (error) throw error;
      if (!data || !data.length) { toast('Added, but the new person wasn\'t returned. Reload the page.'); S.editing = false; S.editForm = null; renderPanel(); return; }
      const np = mapSupabasePerson(data[0]);
      // Add the new person to the local model so the tree shows it immediately.
      S.people.push(np);
      S.byId.set(np.id, np);
      S.kids.set(np.id, []);
      if (np.parentId && S.byId.has(np.parentId)) S.kids.get(np.parentId).push(np);
      else S.roots.push(np);
      // recompute gen for the new person and descendants
      const walk = (x, d, seen) => {
        if (seen.has(x.id)) return; seen.add(x.id);
        x.gen = d;
        S.kids.get(x.id).forEach(c => walk(c, d + 1, seen));
      };
      walk(np, (np.parent ? np.parent.gen + 1 : 0), new Set());
      // refresh derived fields
      np._initials = initials(np.name);
      np._hay = [np.id, np.name, np.nick, np.spouse, np.dob, np.pob, np.qual, np.dod, np.burial]
        .filter(Boolean).join(' ').toLowerCase();
      Auth.setPersonPath(np.id, (data[0].path && Array.isArray(data[0].path)) ? data[0].path.slice() : []);
      S.editing = false; S.editForm = null;
      // refresh the stats bar (people count / generations) and select the new person
      renderStats();
      select(np.id, { focus: true });
      toast(I18n.fmt('save.added', { name: esc(np.name) }));
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('Only an admin can move a person')
        ? I18n.t('save.moveError')
        : msg.includes('Cannot insert a child row')
        || msg.includes('foreign key')
        || msg.includes('Parent not found')
        ? I18n.t('save.foreignKeyError')
        : msg.includes('permission') || msg.includes('forbids')
        ? I18n.t('save.permError')
        : I18n.fmt('save.addFailed', { msg });
      toast(friendly);
      btn.disabled = false;
      btn.textContent = 'Add child';
    }
  }

  // ---------- Soft delete / restore (admin only) ----------
  async function toggleSoftDelete(p) {
    if (!Auth || !Auth.client) {      toast(I18n.t('save.notConnected')); return; }
    const wantDeleted = !p.is_deleted;
    const bDel = $('#btnSoftDelete', $('#panel'));
    const bRes = $('#btnRestore', $('#panel'));
    if (bDel) bDel.disabled = true;
    if (bRes) bRes.disabled = true;
    try {
      const { error } = await Auth.client.from('people').update({ is_deleted: wantDeleted }).eq('id', p.id);
      if (error) throw error;
      p.is_deleted = wantDeleted;
      if (wantDeleted) { closePanel(); toast(I18n.t('save.deleted')); }
      else { renderPanel(); toast('Person restored.'); }
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('Only an admin can delete or restore')
        ? 'Only an admin can delete or restore people.'
        : 'Couldn\'t update: ' + msg;
      toast(friendly);
      renderPanel();
    }
  }

  // ---------- Audit log tab (admin: all; editor: own branch) ----------
  async function loadAudit(p) {
    const box = $('#auditBox', $('#panel'));
    if (!box) return;
    if (!Auth || !Auth.client) { box.innerHTML = '<div class="p-none">Not connected to Supabase.</div>'; return; }
    box.innerHTML = '<div class="p-none">Loading audit log…</div>';
    try {
      const { data, error } = await Auth.client
        .from('audit_log')
        .select('id, action, changed_by, changed_by_name, old_data, new_data, changed_at')
        .eq('person_id', p.id)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []);
      if (!rows.length) { box.innerHTML = '<div class="p-none">No changes recorded for this person yet.</div>'; return; }
      box.innerHTML = `<div class="p-sec" style="padding-top:14px"><h5 style="margin-bottom:10px">Audit log (${rows.length})</h5>` +
        rows.map(r => {
          const when = r.changed_at ? new Date(r.changed_at).toLocaleString() : '—';
          const who = r.changed_by_name || (r.changed_by ? '#' + r.changed_by.slice(0, 8) : '—');
          const oldTxt = jsonDiff(r.old_data);
          const newTxt = jsonDiff(r.new_data);
          return `<div class="audit-row">
            <div class="audit-meta"><span class="audit-action">${esc(r.action)}</span> · ${esc(who)} · ${esc(when)}</div>
            ${oldTxt ? `<div class="audit-delta"><span class="audit-label">before</span><pre class="audit-json">${esc(oldTxt)}</pre></div>` : ''}
            ${newTxt ? `<div class="audit-delta"><span class="audit-label">after</span><pre class="audit-json">${esc(newTxt)}</pre></div>` : ''}
          </div>`;
        }).join('') + '</div>';
    } catch (err) {
      box.innerHTML = '<div class="p-none">Couldn\'t load the audit log: ' + esc(err?.message || String(err)) + '</div>';
    }
  }

  function jsonDiff(j) {
    if (!j || typeof j !== 'object') return String(j ?? '');
    try {
      const seen = new Set();
      return JSON.stringify(j, (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      }, 2);
    } catch (e) { return String(j); }
  }

  // ---------- Admin panel ----------
  let adminPanelOpen = false;

  function openAdminPanel() {
    adminPanelOpen = true;
    S.selected = null;
    $('#panel').hidden = false;
    renderAdminPanel();
  }

  function closeAdminPanel() {
    adminPanelOpen = false;
    $('#panel').hidden = true;
    S.editing = false;
    S.editForm = null;
  }

  async function renderAdminPanel() {
    const pn = $('#panel');
    if (!pn || !Auth || !Auth.client) { pn.hidden = true; return; }
    if (!Auth.isAdmin()) { closeAdminPanel(); return; }
    pn.innerHTML = `
      <div class="p-head">
        <button class="icon-btn p-close" id="pClose" aria-label="Close">✕</button>
        <div class="avatar p-avatar" style="width:44px;height:44px;font-size:16px">⚙</div>
        <h3>Admin panel</h3>
        <div class="p-nick" style="margin-top:4px">Manage branch access, deletion requests, and profiles.</div>
      </div>
      <div class="admin-section">
        <h5>1. Branch access (who can edit what)</h5>
        <div id="adminBranchBox"></div>
      </div>
      <div class="admin-section">
        <h5>2. Deletion requests</h5>
        <div id="adminDelreqBox"></div>
      </div>
      <div class="admin-section">
        <h5>3. Profiles (users)</h5>
        <div id="adminProfileBox"></div>
      </div>
      <div style="height:16px"></div>`;
    pn.className = 'panel';
    pn.hidden = false;
    pn.scrollTop = 0;
    $('#pClose', pn).onclick = closeAdminPanel;
    await Promise.all([
      renderAdminBranchAccess(pn),
      renderAdminDeletionRequests(pn),
      renderAdminProfiles(pn)
    ]);
  }

  // ---- Branch access management ----
  async function renderAdminBranchAccess(pn) {
    const box = $('#adminBranchBox', pn);
    if (!box) return;
    box.innerHTML = 'Loading…';
    try {
      // Fetch all profiles (admin sees all).
      const { data: profiles, error: pErr } = await Auth.client.from('profiles').select('id, email, full_name, role, active, language').order('full_name')
        .then(r => r);
      if (pErr) throw pErr;
      // Fetch all branch_access rows.
      const { data: ba, error: bErr } = await Auth.client.from('branch_access').select('user_id, person_id').order('user_id');
      if (bErr) throw bErr;
      const byUser = new Map();
      (ba || []).forEach(r => {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
        byUser.get(r.user_id).push(r.person_id);
      });
      // Fetch person names for all branch-access person_ids (one batched select).
      const personIds = [...new Set((ba || []).map(r => r.person_id))];
      let personNames = new Map();
      if (personIds.length) {
        const { data: pnRows, error: nErr } = await Auth.client.from('people').select('id, full_name, gender').in('id', personIds);
        if (nErr) throw nErr;
        (pnRows || []).forEach(r => { if (r.id) personNames.set(r.id, r); });
      }
      // Build per-user view.
      const users = (profiles || []);
      if (!users.length) { box.innerHTML = '<div class="admin-empty">No user accounts yet.</div>'; return; }
      box.innerHTML = users.map(u => {
        const branches = (byUser.get(u.id) || []);
        const activeTag = u.active ? '' : ' <span class="tag tag gray" style="font-size:10px;padding:0 5px">inactive</span>';
        const roleTag = u.role === 'admin' ? ' <span class="tag tag gray" style="font-size:10px;padding:0 5px">admin</span>' : '';
        const chipHtml = branches.length
          ? branches.map(bid => {
              const pp = personNames.get(bid);
              const label = pp ? (pp.full_name || pp.id.slice(0, 8)) : bid.slice(0, 8);
              return `<span class="admin-chip">${esc(label)}
                <span class="admin-chip-remove" data-remove-branch="${esc(u.id)}" data-personid="${esc(bid)}">×</span></span>`;
            }).join('')
          : '<span style="color:var(--ink-2);font-size:12px">No branches assigned — this editor can\'t edit anyone.</span>';
        return `<div class="admin-row">
          <div class="admin-name">${esc(u.full_name || u.email)}</div>
          <div class="admin-email">${esc(u.email)}${activeTag}${roleTag}</div>
          <div class="admin-chips">${chipHtml}</div>
          <div class="admin-action-row">
            <div class="admin-field">
              <label>Assign branch for</label>
              <select data-assign-user="${esc(u.id)}">
                <option value="">Pick a person…</option>
                ${S.people.filter(p => !p.is_deleted).sort((a, b) => a.gen - b.gen || a.name.localeCompare(b.name)).map(p => `<option value="${esc(p.id)}">${'· '.repeat(p.gen)}${esc(p.name)}</option>`).join('')}
              </select>
            </div>
            <button class="btn sm" data-assign-go="${esc(u.id)}">Add</button>
          </div>
        </div>`;
      }).join('');
      // Wire remove buttons
      box.querySelectorAll('[data-remove-branch]').forEach(el => {
        el.onclick = async () => {
          const uid = el.dataset.removeBranch;
          const pid = el.dataset.personid;
          await removeBranchAccess(uid, pid);
        };
      });
      // Wire assign buttons
      box.querySelectorAll('[data-assign-go]').forEach(el => {
        el.onclick = async () => {
          const uid = el.dataset.assignGo;
          const sel = box.querySelector(`[data-assign-user="${esc(uid)}"]`);
          const pid = sel && sel.value ? sel.value : null;
          if (!pid) { toast(I18n.t('admin.pickPerson')); return; }
          await assignBranchAccess(uid, pid);
        };
      });
    } catch (err) {
      box.innerHTML = '<div class="admin-empty">Couldn\'t load branch access: ' + esc(err?.message || String(err)) + '</div>';
    }
  }

  async function assignBranchAccess(uid, personId) {
    if (!Auth || !Auth.client) return;
    // Verify the person exists and isn't deleted.
    const person = S.byId.get(personId);
    if (!person || person.is_deleted) { toast('That person isn\'t in the tree.'); return; }
    try {
      const { error } = await Auth.client.from('branch_access').insert({ user_id: uid, person_id: personId });
      if (error) throw error;
      toast(I18n.t('admin.branchAssigned'));
      renderAdminPanel();
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('duplicate') || msg.includes('unique')
        ? 'That editor already has that branch.'
        : msg.includes('forbids') || msg.includes('permission')
        ? 'You don\'t have permission to change branch access.'
        : 'Couldn\'t assign branch: ' + msg;
      toast(friendly);
    }
  }

  async function removeBranchAccess(uid, personId) {
    if (!Auth || !Auth.client) return;
    try {
      const { error } = await Auth.client.from('branch_access').delete().match({ user_id: uid, person_id: personId });
      if (error) throw error;
      toast(I18n.t('admin.branchRemoved'));
      renderAdminPanel();
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('forbids') || msg.includes('permission')
        ? 'You don\'t have permission to change branch access.'
        : 'Couldn\'t remove branch: ' + msg;
      toast(friendly);
    }
  }

  // ---- Deletion request management ----
  async function renderAdminDeletionRequests(pn) {
    const box = $('#adminDelreqBox', pn);
    if (!box) return;
    box.innerHTML = 'Loading…';
    try {
      const { data, error } = await Auth.client
        .from('deletion_requests')
        .select('id, person_id, requested_by, reason, status, created_at, resolved_by, resolved_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      // Fetch person names for all person_ids (batched).
      const personIds = [...new Set(rows.map(r => r.person_id).filter(Boolean))];
      let personNames = new Map();
      if (personIds.length) {
        const { data: pnRows, error: nErr } = await Auth.client.from('people').select('id, full_name').in('id', personIds);
        if (nErr) throw nErr;
        (pnRows || []).forEach(r => { if (r.id) personNames.set(r.id, r.full_name); });
      }
      if (!rows.length) { box.innerHTML = '<div class="admin-empty">No deletion requests.</div>'; return; }
      box.innerHTML = `<div class="admin-empty" style="font-style:normal;color:var(--ink-2);padding:2px 20px 10px;font-size:12px">${rows.length} request${rows.length > 1 ? 's' : ''} total · showing newest first.</div>` +
        rows.map(r => {
          const personName = personNames.get(r.person_id) || 'Unknown person';
          const when = r.created_at ? new Date(r.created_at).toLocaleString() : '—';
          const resolvedWhen = r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '';
          const isPending = r.status === 'pending';
          return `<div class="delreq-row ${isPending ? 'delreq-pending' : 'delreq-resolved'}">
            <div>
              <div class="delreq-person">${esc(personName)}</div>
              <div class="delreq-meta">Requested by ${esc(r.requested_by ? '#' + r.requested_by.slice(0, 8) : '—')} · ${esc(when)}${resolvedWhen ? ' · Resolved ' + esc(resolvedWhen) : ''}</div>
              <div class="delreq-reason">${esc(r.reason || '(no reason given)')}</div>
            </div>
            <div class="delreq-actions">
              ${isPending
                ? `<button class="btn sm" data-approve="${esc(r.id)}">Approve (delete)</button>
                   <button class="btn sm danger" data-reject="${esc(r.id)}">Reject</button>`
                : `<span style="font-size:11.5px;color:var(--ink-2)">${esc(r.status)}</span>`}
            </div>
          </div>`;
        }).join('');
      box.querySelectorAll('[data-approve]').forEach(el => {
        el.onclick = async () => { await resolveDeletionRequest(el.dataset.approve, 'approved'); };
      });
      box.querySelectorAll('[data-reject]').forEach(el => {
        el.onclick = async () => { await resolveDeletionRequest(el.dataset.reject, 'rejected'); };
      });
    } catch (err) {
      box.innerHTML = '<div class="admin-empty">Couldn\'t load deletion requests: ' + esc(err?.message || String(err)) + '</div>';
    }
  }

  async function resolveDeletionRequest(reqId, status) {
    if (!Auth || !Auth.client) return;
    try {
      // Resolve the request.
      const { error: rErr } = await Auth.client.from('deletion_requests').update({
        status: status,
        resolved_by: Auth.session.user.id,
        resolved_at: new Date().toISOString()
      }).eq('id', reqId);
      if (rErr) throw rErr;
      // If approved, soft-delete the person.
      if (status === 'approved') {
        // Find the person id from the request.
        const { data: req, error: rfErr } = await Auth.client.from('deletion_requests').select('person_id').eq('id', reqId).single();
        if (rfErr && !req) { toast('Couldn\'t find the request.'); return; }
        if (req) {
          const { error: pErr } = await Auth.client.from('people').update({ is_deleted: true }).eq('id', req.person_id);
          if (pErr) throw pErr;
        }
      }
      toast(status === 'approved' ? I18n.t('admin.requestApproved') : I18n.t('admin.requestRejected'));
      renderAdminPanel();
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('Only an admin can delete or restore')
        ? 'Only an admin can delete or restore people.'
        : msg.includes('forbids') || msg.includes('permission')
        ? 'You don\'t have permission to resolve deletion requests.'
        : 'Couldn\'t resolve the request: ' + msg;
      toast(friendly);
    }
  }

  // ---- Profiles management ----
  async function renderAdminProfiles(pn) {
    const box = $('#adminProfileBox', pn);
    if (!box) return;
    box.innerHTML = 'Loading…';
    try {
      const { data, error } = await Auth.client.from('profiles').select('id, email, full_name, role, active, language').order('full_name');
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) { box.innerHTML = '<div class="admin-empty">No user accounts yet.</div>'; return; }
      box.innerHTML = rows.map(u => {
        const activeTag = u.active ? 'Active' : '<span style="color:var(--female)">Inactive (awaiting activation)</span>';
        const roleOpts = [['admin', 'Admin'], ['editor', 'Editor']].map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('');
        const langOpts = [['en', 'English'], ['ur', 'Urdu'], ['hi', 'Hindi']].map(([v, l]) => `<option value="${v}" ${u.language === v ? 'selected' : ''}>${l}</option>`).join('');
        const activeChecked = u.active ? 'checked' : '';
        return `<div class="admin-row">
          <div class="admin-name" style="flex:0 0 200px">${esc(u.full_name || u.email)}</div>
          <div class="admin-email">${esc(u.email)}</div>
          <div class="admin-action-row" style="flex:1 1 280px">
            <div class="admin-field" style="flex:1">
              <label>Role</label>
              <select data-prof-role="${esc(u.id)}">${roleOpts}</select>
            </div>
            <div class="admin-field" style="flex:0 0 120px">
              <label>Lang</label>
              <select data-prof-lang="${esc(u.id)}">${langOpts}</select>
            </div>
            <label class="admin-field" style="flex:0 0 60px;flex-direction:row;align-items:center;gap:4px;label{display:block}">
              <input type="checkbox" data-prof-active="${esc(u.id)}" ${activeChecked}> Active
            </label>
            <button class="btn sm" data-prof-save="${esc(u.id)}">Save</button>
          </div>
        </div>`;
      }).join('');
      box.querySelectorAll('[data-prof-save]').forEach(el => {
        el.onclick = async () => {
          const uid = el.dataset.profSave;
          const role = box.querySelector(`[data-prof-role="${esc(uid)}"]`)?.value;
          const lang = box.querySelector(`[data-prof-lang="${esc(uid)}"]`)?.value;
          const active = !!box.querySelector(`[data-prof-active="${esc(uid)}"]`)?.checked;
          await saveProfile(uid, { role, language: lang, active });
        };
      });
    } catch (err) {
      box.innerHTML = '<div class="admin-empty">Couldn\'t load profiles: ' + esc(err?.message || String(err)) + '</div>';
    }
  }

  async function saveProfile(uid, fields) {
    if (!Auth || !Auth.client) return;
    // Non-admin users cannot change their own role/active via this path — but the
    // DB policy allows a user to update their own profile (id = auth.uid()). To keep
    // the admin panel authoritative, admin-only changes to role/active are enforced
    // by the DB policy (profiles_guard + RLS). We allow the request and let the DB
    // reject forbidden changes.
    try {
      const { error } = await Auth.client.from('profiles').update(fields).eq('id', uid);
      if (error) throw error;
      toast(I18n.t('admin.profileUpdated'));
      renderAdminPanel();
    } catch (err) {
      const msg = err?.message || String(err);
      const friendly = msg.includes('forbids') || msg.includes('permission')
        ? 'You don\'t have permission to change that profile.'
        : 'Couldn\'t update profile: ' + msg;
      toast(friendly);
    }
  }

  function focusPerson(id) {
    // make sure the person is visible: expand ancestors, drop filters that hide them
    for (let c = S.byId.get(id).parent; c; c = c.parent) S.collapsed.delete(c.id);
    if (visible && !visible.has(id)) { resetFilters();      toast(I18n.t('generic.filtersCleared')); }
    if (S.view === 'tree') {
      computeVisibility(); renderTree(false);
      const v = S.pos.get(id); if (!v) return;
      const st = $('#treeView');
      S.scale = Math.max(S.scale, .9);
      S.tx = st.clientWidth / 2 - (PAD + v.x + v.w / 2) * S.scale;
      S.ty = st.clientHeight / 2 - (PAD + v.y + NH / 2) * S.scale;
      const w = $('#world'); w.style.transition = 'transform .45s ease'; applyTransform();
      setTimeout(() => w.style.transition = '', 480);
      const n = $(`.node[data-id="${CSS.escape(id)}"]`); if (n) { n.classList.add('selected', 'pulse'); }
    }
  }

  /* -------------------------------- Table -------------------------------- */
  function renderTable() {
    const t = $('#table');
    const key = S.sort.key, dir = S.sort.dir;
    const rows = S.people.slice().sort((a, b) => {
      const av = a[key] == null ? '' : a[key], bv = b[key] == null ? '' : b[key];
      if (key === 'gen') return (av - bv) * dir || a.id.localeCompare(b.id);
      if (key === 'dob' || key === 'dod') { const x = parseDate(av), y = parseDate(bv); return ((x ? +x : 1e15) - (y ? +y : 1e15)) * dir; }
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
    const active = filterActive();
    const list = active ? rows.filter(p => matchSet.has(p.id)) : rows;
    t.innerHTML = `<thead><tr>${TABLE_COLS.map(([k, l]) => `<th data-k="${k}" data-i18n>${l}</th>`).join('')}</tr></thead>
      <tbody>${list.map(p => `<tr data-id="${esc(p.id)}" class="${active && !matchSet.has(p.id) ? 'nomatch' : ''}${S.selected === p.id ? ' sel' : ''}">
        ${TABLE_COLS.map(([k]) => { const v = p[k]; return v == null || v === '' ? '<td class="dash">—</td>' : `<td title="${esc(v)}">${esc(v)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
    I18n.apply();
    $('thead', t).onclick = e => { const th = e.target.closest('th'); if (!th) return; const k = th.dataset.k; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : 1 }; renderTable(); };
    $('tbody', t).onclick = e => { const tr = e.target.closest('tr'); if (tr) select(tr.dataset.id); };
  }

  /* --------------------------------- Misc --------------------------------- */
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }

  /* ------------------------------ Export to Excel ------------------------------ */
  // Same column order as the original spreadsheet (see COLS at the top of this file) so
  // an exported file can be opened next to the old one. Generation is the depth computed
  // from the tree, which is what the app displays.
  const EXPORT_COLS = [
    ['Individual_ID', p => p.legacy_id || p.id],
    ['Parent_ID', p => p.parent ? (p.parent.legacy_id || p.parent.id) : ''],
    ['Generation', p => p.gen],
    ['Gender', p => p.gender || ''],
    ['Full_Name', p => p.name || ''],
    ['Nick_Name', p => p.nick || ''],
    ['Fathers_Name', p => p.father || ''],
    ['Mothers_Name', p => p.mother || ''],
    ['Spouse_Name', p => p.spouse || ''],
    ['Spouse_Father_Name', p => p.spouseFather || ''],
    ['DOB', p => p.dob_display || p.dob || ''],
    ['Place_of_Birth', p => p.pob || ''],
    ['Qualification', p => p.qual || ''],
    ['Date_of_Death', p => p.dod_display || p.dod || ''],
    ['Place_of_Burial', p => p.burial || ''],
    ['Source_File', p => p.source || '']
  ];

  function exportToExcel() {
    if (!(Auth && Auth.isAdmin())) { toast(I18n.t('export.adminOnly')); return; }
    if (!window.XLSX) { toast(I18n.t('export.noSheetJs')); return; }
    // Deleted people are exported only when the admin is actually looking at them.
    const people = S.people.slice().sort((a, b) => a.gen - b.gen || String(a.name).localeCompare(String(b.name)));
    if (!people.length) { toast(I18n.t('export.empty')); return; }
    const header = EXPORT_COLS.map(c => c[0]);
    const rows = people.map(p => {
      const o = {};
      EXPORT_COLS.forEach(([h, get]) => { const v = get(p); o[h] = v == null ? '' : v; });
      return o;
    });
    try {
      const ws = XLSX.utils.json_to_sheet(rows, { header });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
      XLSX.writeFile(wb, 'Family_Tree_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      toast(I18n.fmt('export.done', { n: rows.length }));
    } catch (e) {
      console.warn('Export failed:', e);
      toast(I18n.fmt('refresh.failed', { msg: (e && e.message) || String(e) }));
    }
  }

  /* ---------------------------- Refresh & live data ---------------------------- */
  let refreshing = false, autoRefreshT = null, pollTimer = null, peopleChannel = null, lastRefreshAt = 0;

  // Pull the tree again, keeping the current selection when that person still exists.
  // `quiet` skips the toast (used by Realtime and the 60s poll).
  async function syncFromServer(quiet) {
    if (refreshing || !(Auth && Auth.client && Auth.isAdminOrActive())) return;
    refreshing = true;
    const keep = S.selected;
    const btn = $('#btnRefresh');
    if (btn && !quiet) btn.classList.add('spin');
    try {
      Auth.clearPersonPaths();
      if (window.Photos && Photos.clearCache) Photos.clearCache();   // photos may have changed
      const rows = await loadData();
      if (rows && rows.length) {
        init(rows);
        if (keep && S.byId.has(keep)) select(keep);
      }
      lastRefreshAt = Date.now();
      if (!quiet) toast(I18n.t('refresh.done'));
    } catch (e) {
      console.warn('Refresh failed:', e);
      if (!quiet) toast(I18n.fmt('refresh.failed', { msg: (e && e.message) || String(e) }));
    } finally {
      refreshing = false;
      if (btn) setTimeout(() => btn.classList.remove('spin'), 400);
    }
  }

  // Several change events can land together; collapse them into one reload.
  function scheduleAutoRefresh() {
    clearTimeout(autoRefreshT);
    autoRefreshT = setTimeout(() => {
      // Never yank the ground out from under a form someone is filling in.
      if ($('#panel').querySelector('form')) { toast(I18n.t('live.updated')); return; }
      syncFromServer(true);
    }, 700);
  }

  // Realtime is the fast path; the 60s poll is a permanent safety net. A Realtime
  // subscription can also fail silently (for example when public.people has not been
  // added to the supabase_realtime publication), so polling always runs rather than
  // only after an explicit error. Polls are skipped when Realtime already refreshed
  // recently, so the two mechanisms don't double up.
  function startLiveUpdates() {
    if (peopleChannel || pollTimer) return;   // already listening
    if (!(Auth && Auth.client && Auth.isAdminOrActive())) return;
    try {
      peopleChannel = Auth.client
        .channel('public:people')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, scheduleAutoRefresh)
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('Realtime unavailable (' + status + ') — falling back to the 60s poll.');
            if (peopleChannel && Auth.client.removeChannel) {
              try { Auth.client.removeChannel(peopleChannel); } catch (e) { /* nothing to do */ }
            }
            peopleChannel = null;
          }
        });
    } catch (e) {
      console.warn('Realtime subscribe failed — continuing with the 60s poll:', e);
      peopleChannel = null;
    }
    startPolling();
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.hidden) return;                          // nobody is looking
      if (Date.now() - lastRefreshAt < 55000) return;        // Realtime just did it
      scheduleAutoRefresh();
    }, 60000);
  }

  function stopLiveUpdates() {
    clearTimeout(autoRefreshT);
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (peopleChannel && Auth && Auth.client && Auth.client.removeChannel) {
      try { Auth.client.removeChannel(peopleChannel); } catch (e) { /* nothing to do */ }
    }
    peopleChannel = null;
  }

  // Loads the tree for the current session and nothing else. Called once from boot()
  // and again whenever the signed-in state or profile changes. Signing out drops the
  // data so a different account can never see the previous user's tree.
  let loadingData = false;
  async function reloadData() {
    if (loadingData) return;
    if (!(Auth && Auth.client && Auth.isAdminOrActive())) { clearTree(); return; }
    if (S.sourceLabel === 'Supabase') return;   // already loaded for this session
    loadingData = true;
    try {
      const rows = await loadData();
      if (rows && rows.length) init(rows);
    } catch (e) {
      console.warn('Could not load the tree after a sign-in change:', e);
    } finally {
      loadingData = false;
    }
  }

  // Drop every trace of the loaded tree (used when signing out).
  function clearTree() {
    if (!S.people.length && !S.sourceLabel) return;
    S.people = []; S.byId = new Map(); S.kids = new Map(); S.roots = [];
    S.pos = new Map(); S.selected = null; S.collapsed.clear(); S.sourceLabel = '';
    S.editing = false; S.editForm = null; S.auditRows = [];
    S._allRows = []; S.showDeleted = false;
    const sd = $('#showDeleted'); if (sd) sd.checked = false;
    stopLiveUpdates();
    if (Auth) Auth.clearPersonPaths();
    const world = $('#world'); if (world) world.innerHTML = '';
    const panel = $('#panel'); if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    const table = $('#table'); if (table) table.innerHTML = '';
    const stats = $('#stats'); if (stats) stats.innerHTML = '';
    const sub = $('#subtitle'); if (sub) sub.textContent = '';
    const rc = $('#resultCount'); if (rc) rc.textContent = '';
  }

  function init(rows) {
    S.selected = null; S.collapsed.clear();
    build(rows);
    buildControls();
    resetFiltersSilently();
    closePanel();
    refresh(true);
  }
  function resetFiltersSilently() {
    Object.assign(S.f, { q: '', status: '', branch: '', pob: '', qual: '', has: '' });
    S.f.gens.clear(); S.f.genders.clear(); $('#search').value = '';
  }

  // ---------- Language picker ----------
  function toggleLangPicker() {
    const existing = document.querySelector('.lang-picker');
    if (existing) { closeLangPicker(); return; }
    const pop = document.createElement('div');
    pop.className = 'lang-picker';
    pop.innerHTML = I18n.languages.map(l => {
      const labels = { en: ['English', 'English'], ur: ['اردو', 'Urdu'], hi: ['हिंदी', 'Hindi'] };
      const [native, english] = labels[l] || [l, l];
      return `<button data-lang="${l}" ${l === I18n.currentLang() ? 'class="on"' : ''}>
        <span class="lang-name">${esc(native)}</span>
        <span class="lang-native"> · ${esc(english)}</span>
      </button>`;
    }).join('');
    document.body.appendChild(pop);
    // position below the lang button
    const btn = $('#btnLang');
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.right = (innerWidth - r.right) + 'px';
    pop.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
      const lang = b.dataset.lang;
      I18n.setLanguage(lang);
      // persist in localStorage for anonymous users
      try { localStorage.setItem('ft-lang', lang); } catch (e) { /* ignore */ }
      // update the user's profile language if signed in
      if (Auth && Auth.client && Auth.session) {
        Auth.client.from('profiles').update({ language: lang }).eq('id', Auth.session.user.id)
          .then(({ error }) => {
            if (!error) Auth._ensureProfile();
          }).catch(() => { /* non-fatal — the UI already switched */ });
      }
      closeLangPicker();
    });
  }
  function closeLangPicker() { const p = document.querySelector('.lang-picker'); if (p) p.remove(); }

  let booted = false;
  async function boot() {
    try { const t = localStorage.getItem('ft-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    // Initialise the Supabase auth client (async). Auth.init() must be called
    // before any Supabase data source or edit UI is used.
    if (Auth) { try { await Auth.init(); } catch (e) { console.warn('Auth.init failed:', e); } }
    if (!booted) { bindControls(); bindStage(); booted = true; }
    if (Auth && Auth._failureReason) {
      // The client could not be created (bad config / missing CDN). There is no static
      // tree to fall back to any more; the gate shows the reason.
      toast(I18n.fmt('auth.supabaseUnavailable', { msg: Auth._failureReason }));
      return;
    }
    // Phase 1: nothing loads until an active user is signed in. The auth callbacks call
    // reloadData() again as soon as the session and profile are known.
    reloadData();
  }
  boot();
})();
