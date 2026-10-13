/* =====================================================================
   Extras — the Phase 6 tools.

     1. How are we related?  picks two people, walks the tree to their nearest
                             common ancestor and names the relationship
                             (Chacha/Taya, Phupho, Mamu, Khala, Bhatija …)
     2. Upcoming             birthdays and remembrance dates in the next 30 days
     3. Print / PNG          the tree exactly as it is on screen, with a title
     4. Statistics           people per generation, gender split, oldest,
                             youngest, common birthplaces, most children

   Everything is read-only and works off the model app.js already loaded, so
   nothing here needs extra database permissions.
   ===================================================================== */

(function () {
  'use strict';

  const T = (key, params) => (params ? I18n.fmt(key, params) : I18n.t(key));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FT = () => window.FT || {};

  const state = { open: false, tab: 'related', a: '', b: '', result: null, upcoming: null };
  let overlay = null;

  function isOpen() { return state.open; }

  const TABS = [
    ['related', 'extra.tab.related'],
    ['birthdays', 'extra.tab.birthdays'],
    ['stats', 'extra.tab.stats']
  ];

  function open(tab) {
    if (!FT().people || !FT().people().length) { FT().toast(T('generic.emptyTree')); return; }
    state.open = true;
    if (tab) state.tab = tab;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal';
      overlay.id = 'extrasModal';
      document.body.appendChild(overlay);
      document.documentElement.classList.add('modal-open');
      overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
      window.addEventListener('keydown', onKeydown, true);
    }
    overlay.hidden = false;
    render();
  }

  function close() {
    state.open = false;
    if (overlay) { overlay.hidden = true; overlay.innerHTML = ''; }
    document.documentElement.classList.remove('modal-open');
  }

  function onKeydown(e) {
    if (!state.open || e.key !== 'Escape') return;
    if (document.querySelector('.modal-sub-dialog')) return;
    e.preventDefault();
    close();
  }

  function peopleSorted() {
    return (FT().people ? FT().people() : []).slice()
      .sort((a, b) => a.gen - b.gen || String(a.name).localeCompare(String(b.name)));
  }

  function personOptions(sel) {
    return '<option value="">' + esc(T('extra.relatedPick')) + '</option>' +
      peopleSorted().map(p => '<option value="' + esc(p.id) + '"' + (sel === p.id ? ' selected' : '') + '>' +
        esc(FT().dispName(p)) + ' · Gen ' + p.gen + (p.parent ? ' · ' + esc(p.parent.name) : '') + '</option>').join('');
  }

  function render() {
    overlay.innerHTML =
      '<div class="modal-card extras-card" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
      '<div><h3>' + esc(T('extra.tools')) + '</h3><p class="modal-sub">' + esc(T('extra.printTitle')) + '</p></div>' +
      '<div class="modal-head-actions">' +
      '<button type="button" class="btn sm" id="ex_print">' + esc(T('extra.printPage')) + '</button>' +
      '<button type="button" class="btn sm" id="ex_png">' + esc(T('extra.printPng')) + '</button>' +
      '<button type="button" class="icon-btn" id="ex_close" aria-label="' + esc(T('extra.close')) + '">✕</button>' +
      '</div></div>' +
      '<div class="admin-tabs" role="tablist">' +
      TABS.map(([k, label]) => '<button type="button" role="tab" data-tab="' + k + '" class="' + (state.tab === k ? 'on' : '') + '">' + esc(T(label)) + '</button>').join('') +
      '</div>' +
      '<div class="modal-body" id="ex_body"></div>' +
      '</div>';

    overlay.querySelector('#ex_close').onclick = close;
    overlay.querySelector('#ex_print').onclick = printTree;
    overlay.querySelector('#ex_png').onclick = exportPng;
    overlay.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => {
        state.tab = b.dataset.tab;
        overlay.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
        renderBody();
      };
    });
    renderBody();
  }

  function body() { return overlay.querySelector('#ex_body'); }

  function renderBody() {
    if (state.tab === 'related') return renderRelated();
    if (state.tab === 'birthdays') return renderUpcoming();
    return renderStats();
  }

  /* ============================ 1. relationship ============================ */
  function renderRelated() {
    const r = state.result;
    body().innerHTML =
      '<h5 class="hist-title">' + esc(T('extra.relatedTitle')) + '</h5>' +
      '<p class="admin-hint">' + esc(T('extra.relatedSub')) + '</p>' +
      '<div class="panel-grid">' +
      '<div class="edit-field"><label class="edit-label" for="ex_a">' + esc(T('extra.relatedFrom')) + '</label>' +
      '<select class="edit-input" id="ex_a">' + personOptions(state.a) + '</select></div>' +
      '<div class="edit-field"><label class="edit-label" for="ex_b">' + esc(T('extra.relatedTo')) + '</label>' +
      '<select class="edit-input" id="ex_b">' + personOptions(state.b) + '</select></div>' +
      '</div>' +
      '<div class="admin-bar"><button type="button" class="btn primary sm" id="ex_go">' + esc(T('extra.relatedGo')) + '</button></div>' +
      (r ? r.html : '') +
      '<p class="admin-hint" style="margin-top:14px">' + esc(T('extra.relatedNote')) + '</p>';

    body().querySelector('#ex_a').onchange = e => { state.a = e.target.value; };
    body().querySelector('#ex_b').onchange = e => { state.b = e.target.value; };
    body().querySelector('#ex_go').onclick = () => {
      state.a = body().querySelector('#ex_a').value;
      state.b = body().querySelector('#ex_b').value;
      state.result = computeRelation(state.a, state.b);
      renderRelated();
      if (state.result && state.result.focus === 'result') {
        const box = body().querySelector('.rel-result');
        if (box) box.scrollIntoView({ block: 'center' });
      }
    };
  }

  // The ancestor chain of a person, root first, from the path column the database
  // maintains. Falls back to walking parent links when path is unavailable.
  function chainOf(p) {
    if (p.path && p.path.length) {
      const chain = p.path.map(id => FT().personById(id)).filter(Boolean);
      if (chain.length) return chain;
    }
    const out = [];
    for (let c = p; c; c = c.parent) out.unshift(c);
    return out;
  }

  function computeRelation(aId, bId) {
    if (!aId || !bId) return { html: '' };
    const A = FT().personById(aId), B = FT().personById(bId);
    if (!A || !B) return { html: '' };
    if (A.id === B.id) {
      return { html: '<div class="rel-result">' + esc(T('extra.relatedSame')) + '</div>' };
    }
    const ca = chainOf(A), cb = chainOf(B);
    // nearest common ancestor = the last shared element
    let i = 0;
    while (i < ca.length && i < cb.length && ca[i].id === cb[i].id) i++;
    if (i === 0) return { html: '<div class="rel-result">' + esc(T('extra.relatedNoPath')) + '</div>' };
    const nca = ca[i - 1];
    const up = ca.length - 1 - (i - 1);     // steps from A up to the common ancestor
    const down = cb.length - 1 - (i - 1);   // steps from the ancestor down to B
    const branchA = ca[i] || null;          // the common ancestor's child leading to A
    const branchB = cb[i] || null;          // … and to B
    const term = kinTerm(A, B, up, down, ca, cb, i);

    // Read the path out loud in the order it is walked: A up to the common ancestor,
    // then down to B. (Building it any other way prints the two sides interleaved.)
    const chain = ca.slice(i).reverse().map(p => FT().dispName(p))
      .concat([FT().dispName(nca)])
      .concat(cb.slice(i).map(p => FT().dispName(p)));
    const html =
      '<div class="rel-result">' +
      '<span class="rel-term">' + esc(term.approx ? T('extra.relatedUnknownTerm') : T(term.key)) + '</span>' +
      esc(T('extra.relatedCommon', { name: FT().dispName(nca) })) + ' ' +
      // When one of the two IS the common ancestor there is only one distance to state;
      // "0 generation(s) below themselves" is not a sentence anybody wants to read.
      esc(up === 0 ? T('extra.relatedBelow', { name: FT().dispName(B), n: down, root: FT().dispName(nca) })
        : down === 0 ? T('extra.relatedBelow', { name: FT().dispName(A), n: up, root: FT().dispName(nca) })
          : T('extra.relatedThrough', { a: FT().dispName(A), up: up, b: FT().dispName(B), down: down, root: FT().dispName(nca) })) +
      '<div class="rel-chain">' + chain.map(x => esc(x)).join(' → ') + '</div>' +
      '</div>';
    return { html: html };
  }

  // Kinship terms. `up`/`down` are the generation distances to the common ancestor;
  // the intermediate people decide which side of the family is meant, which is what
  // separates chacha from mamu, and dada from nana.
  function kinTerm(A, B, up, down, ca, cb, i) {
    const g = p => (p && /^m/i.test(p.gender || '')) ? 'm' : (p && /^f/i.test(p.gender || '')) ? 'f' : 'u';
    const sex = p => g(p) === 'm' ? 'Male' : g(p) === 'f' ? 'Female' : 'Unknown';

    // Direct line: one of them is an ancestor of the other.
    if (up === 0) {
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.descendant', approx: true };
      if (down === 1) return { key: s === 'Male' ? 'kin.son' : 'kin.daughter' };
      if (down === 2) return { key: s === 'Male' ? 'kin.grandson' : 'kin.granddaughter' };
      if (down === 3) return { key: s === 'Male' ? 'kin.greatGrandson' : 'kin.greatGranddaughter' };
      return { key: 'kin.descendant', approx: true };
    }
    if (down === 0) {
      const s = sex(A);
      if (s === 'Unknown') return { key: 'kin.ancestor', approx: true };
      if (up === 1) return { key: s === 'Male' ? 'kin.father' : 'kin.mother' };
      if (up === 2) {
        // Paternal grandparent (dada/dadi) when the chain goes through the father,
        // maternal (nana/nani) when it goes through the mother.
        const via = ca[ca.length - 2];
        const paternal = g(via) === 'm';
        if (s === 'Male') return { key: paternal ? 'kin.grandfatherPaternal' : 'kin.grandfatherMaternal' };
        return { key: paternal ? 'kin.grandmotherPaternal' : 'kin.grandmotherMaternal' };
      }
      if (up === 3) return { key: s === 'Male' ? 'kin.greatGrandfather' : 'kin.greatGrandmother' };
      return { key: 'kin.ancestor', approx: true };
    }
    // Siblings.
    if (up === 1 && down === 1) {
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.sibling', approx: true };
      return { key: s === 'Male' ? 'kin.brother' : 'kin.sister' };
    }
    // Uncle / aunt: B is a sibling of A's parent (or the mirror image).
    if (up === 2 && down === 1) {
      const via = ca[ca.length - 2];         // A's parent
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.uncleAunt', approx: true };
      if (g(via) === 'm') return { key: s === 'Male' ? 'kin.fathersBrother' : 'kin.fathersSister' };
      if (g(via) === 'f') return { key: s === 'Male' ? 'kin.mothersBrother' : 'kin.mothersSister' };
      return { key: 'kin.uncleAunt', approx: true };
    }
    if (down === 2 && up === 1) {
      const via = cb[cb.length - 2];         // B's parent = A's sibling
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.nephewNiece', approx: true };
      if (g(via) === 'm') return { key: s === 'Male' ? 'kin.brotherSon' : 'kin.brotherDaughter' };
      if (g(via) === 'f') return { key: s === 'Male' ? 'kin.sisterSon' : 'kin.sisterDaughter' };
      return { key: 'kin.nephewNiece', approx: true };
    }
    // Cousins.
    if (up === 2 && down === 2) {
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.cousin', approx: true };
      return { key: s === 'Male' ? 'kin.cousinMale' : 'kin.cousinFemale' };
    }
    // Great-uncles / great-aunts.
    if (up === 3 && down === 1) {
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.uncleAunt', approx: true };
      return { key: s === 'Male' ? 'kin.grandUncle' : 'kin.grandAunt', approx: true };
    }
    if (down === 3 && up === 1) {
      const s = sex(B);
      if (s === 'Unknown') return { key: 'kin.nephewNiece', approx: true };
      return { key: s === 'Male' ? 'kin.grandNephew' : 'kin.grandNiece', approx: true };
    }
    // Anything further away: the tree cannot name it reliably, so say so plainly
    // instead of inventing a term.
    return { key: 'kin.distant', approx: true };
  }

  /* ========================== 2. upcoming dates ========================== */
  const DAYS = 30;

  function renderUpcoming() {
    const list = state.upcoming || (state.upcoming = buildUpcoming());
    body().innerHTML =
      '<h5 class="hist-title">' + esc(T('extra.birthdaysTitle')) + '</h5>' +
      '<p class="admin-hint">' + esc(T('extra.birthdaysSub', { days: DAYS })) + '</p>' +
      (list.length
        ? '<div class="upcoming-list">' + list.map(row => row.html).join('') + '</div>'
        : '<div class="admin-empty">' + esc(T('extra.birthdaysNone', { days: DAYS })) + '</div>');
    // Clicking a name closes the panel and selects that person on the tree.
    body().querySelectorAll('[data-goto-person]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.gotoPerson;
        close();
        if (FT().select) FT().select(id);
      };
    });
  }

  function buildUpcoming() {
    const today = new Date();
    const base = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const out = [];
    const add = (p, kind, thisYear) => {
      const d = FT().parseDate(kind === 'birth' ? p.dob : p.dod);
      if (!d) return;
      // A year-only date ("1970") has no day or month, so it can't be listed.
      if (String(kind === 'birth' ? p.dob : p.dod).length <= 4) return;
      let when = new Date(Date.UTC(base.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      if (when.getTime() < base.getTime()) when = new Date(Date.UTC(base.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
      const days = Math.round((when.getTime() - base.getTime()) / 86400000);
      if (days > DAYS) return;
      if (kind === 'birth' && p.dod) return;      // not living
      out.push({ days: days, kind: kind, p: p, years: thisYear - d.getUTCFullYear(), when: when });
    };
    (FT().people ? FT().people() : []).forEach(p => {
      if (p.is_deleted) return;
      if (p.dob) add(p, 'birth', base.getUTCFullYear() + 1);
      if (p.dod) add(p, 'death', base.getUTCFullYear() + 1);
    });
    out.sort((a, b) => a.days - b.days || String(a.p.name).localeCompare(String(b.p.name)));
    return out.map(row => {
      const when = row.days === 0 ? T('extra.today') : T('extra.inDays', { n: row.days });
      const extra = row.kind === 'birth'
        ? T('extra.birthdayTurns', { age: row.years })
        : T('extra.remembranceYears', { n: row.years });
      return {
        raw: row,
        html: '<div class="upcoming-row ' + (row.kind === 'birth' ? 'birthday' : 'mourning') + '">' +
          '<span class="upcoming-when">' + esc(when) + '</span>' +
          '<button type="button" class="upcoming-who" data-goto-person="' + esc(row.p.id) + '" style="border:0;background:none;padding:0;cursor:pointer;font:inherit;color:inherit">' +
          esc(FT().dispName(row.p)) + '</button>' +
          '<span class="upcoming-extra">' + esc(extra) + ' · ' +
          esc(String(row.when.getUTCDate()).padStart(2, '0') + '/' + String(row.when.getUTCMonth() + 1).padStart(2, '0')) + '</span>' +
          '</div>'
      };
    });
  }

  /* ============================ 4. statistics ============================ */
  function renderStats() {
    const people = (FT().people ? FT().people() : []).filter(p => !p.is_deleted);
    const n = people.length;
    if (!n) { body().innerHTML = '<div class="admin-empty">' + esc(T('extra.statsNone')) + '</div>'; return; }

    const byGen = new Map();
    people.forEach(p => byGen.set(p.gen, (byGen.get(p.gen) || 0) + 1));
    const gens = [...byGen.keys()].sort((a, b) => a - b);

    const men = people.filter(p => /^m/i.test(p.gender || '')).length;
    const women = people.filter(p => /^f/i.test(p.gender || '')).length;
    const unknown = n - men - women;

    const withDob = people.map(p => ({ p: p, d: FT().parseDate(p.dob) })).filter(x => x.d && String(x.p.dob).length > 4);
    const alive = withDob.filter(x => !x.p.dod);
    const ageOf = x => Math.floor((Date.now() - x.d.getTime()) / (365.2425 * 86400000));
    alive.sort((a, b) => a.d - b.d);
    const oldest = alive[0], youngest = alive[alive.length - 1];

    const places = topBy(people.map(p => p.pob).filter(Boolean), 5);
    const childCounts = people.map(p => ({ p: p, k: (FT().kidsOf(p.id) || []).length }))
      .filter(x => x.k > 0).sort((a, b) => b.k - a.k).slice(0, 5);

    const maxGen = Math.max(...[...byGen.values()]);
    const genderMax = Math.max(men, women, unknown, 1);

    const bar = (label, value, max, cls) =>
      '<div class="bar-row"><span>' + esc(label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill ' + cls + '" style="width:' + Math.round(value / max * 100) + '%"></span></span>' +
      '<span class="bar-value">' + value + '</span></div>';

    body().innerHTML =
      '<h5 class="hist-title">' + esc(T('extra.statsTitle')) + '</h5>' +
      '<div class="stat-block"><h5>' + esc(T('extra.statsByGen')) + '</h5><div class="bars">' +
      gens.map(g => bar(T('panel.generation', { n: g }), byGen.get(g), maxGen, '')).join('') +
      '</div></div>' +
      '<div class="stat-block"><h5>' + esc(T('extra.statsGender')) + '</h5><div class="bars">' +
      bar(T('chip.male'), men, genderMax, 'male') +
      bar(T('chip.female'), women, genderMax, 'female') +
      (unknown ? bar(T('panel.genderUnknown'), unknown, genderMax, 'unknown') : '') +
      '</div></div>' +
      '<div class="stat-block"><h5>' + esc(T('extra.statsOldest')) + ' / ' + esc(T('extra.statsYoungest')) + '</h5>' +
      (oldest ? '<div class="upcoming-row"><span class="upcoming-who">' + esc(FT().dispName(oldest.p)) + '</span>' +
        '<span class="upcoming-extra">' + esc(T('extra.statsAge', { n: ageOf(oldest) })) + '</span></div>' : '') +
      (youngest && youngest !== oldest ? '<div class="upcoming-row"><span class="upcoming-who">' + esc(FT().dispName(youngest.p)) + '</span>' +
        '<span class="upcoming-extra">' + esc(T('extra.statsAge', { n: ageOf(youngest) })) + '</span></div>' : '') +
      (!oldest ? '<div class="admin-empty">' + esc(T('extra.statsNone')) + '</div>' : '') +
      '</div>' +
      '<div class="stat-block"><h5>' + esc(T('extra.statsPlaces')) + '</h5>' +
      (places.length ? '<div class="bars">' + places.map(([place, count]) => bar(place, count, places[0][1], '')).join('') + '</div>'
        : '<div class="admin-empty">' + esc(T('extra.statsNone')) + '</div>') +
      '</div>' +
      '<div class="stat-block"><h5>' + esc(T('extra.statsChildren')) + '</h5>' +
      (childCounts.length
        ? '<div class="upcoming-list">' + childCounts.map(x =>
          '<div class="upcoming-row"><span class="upcoming-who">' + esc(FT().dispName(x.p)) + '</span>' +
          '<span class="upcoming-extra">' + esc(I18n.fmt('panel.children', { n: x.k })) + '</span></div>').join('') + '</div>'
        : '<div class="admin-empty">' + esc(T('extra.statsNone')) + '</div>') +
      '</div>';
  }

  function topBy(list, max) {
    const counts = new Map();
    list.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, max);
  }

  /* ========================== 3. print and PNG ========================== */
  function printTree() {
    const src = document.querySelector('#treeView');
    if (!src || !src.querySelector('.node')) { FT().toast(T('extra.printNothing')); return; }
    const head = document.querySelector('#printHead');
    if (head) {
      head.textContent = I18n.t('brand.title') + ' — ' + new Date().toLocaleDateString() +
        ' · ' + I18n.fmt('brand.subtitle', {
          n: (FT().people() || []).length,
          g: new Set((FT().people() || []).map(p => p.gen)).size,
          // Same wording as the subtitle, so the printed page says where the data came from
          // in the reader's own language.
          source: I18n.t('source.supabase')
        });
    }
    close();
    // Let the dialog disappear before the print dialog measures the page.
    setTimeout(() => window.print(), 60);
  }

  // Draw the visible tree onto a canvas and download it. The geometry comes from the
  // same numbers the DOM layout uses, so the picture matches what is on screen.
  function exportPng() {
    const people = FT().people() || [];
    if (!people.length) { FT().toast(T('extra.printNothing')); return; }
    const S = FT().state ? FT().state() : null;
    if (!S || !S.pos || !S.pos.size) { FT().toast(T('extra.printNothing')); return; }
    const NW = 180, NH = 72, GX = 16, GY = 66, PAD = 90, SG = 26;
    const scale = 2;                       // export at 2x for a crisp image
    const clipW = 4000;
    let maxX = 0, maxY = 0;
    S.pos.forEach(v => { maxX = Math.max(maxX, v.x + v.w); maxY = Math.max(maxY, v.y + NH); });
    const W = Math.min(clipW, maxX + PAD * 2), H = maxY + PAD * 2 + 46;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) { FT().toast(T('extra.printFailed', { msg: 'canvas unavailable' })); return; }
    ctx.scale(scale, scale);
    const css = getComputedStyle(document.documentElement);
    const v = n => (css.getPropertyValue(n) || '#888').trim();
    ctx.fillStyle = v('--bg'); ctx.fillRect(0, 0, W, H);

    // title
    ctx.fillStyle = v('--ink');
    ctx.font = '600 18px ' + (css.getPropertyValue('--ui-font') || 'sans-serif');
    ctx.fillText(I18n.t('brand.title'), 18, 28);
    ctx.font = '12px ' + (css.getPropertyValue('--ui-font') || 'sans-serif');
    ctx.fillStyle = v('--ink-2');
    ctx.fillText(new Date().toLocaleDateString(), 18, 44);
    const oy = 46;

    // edges
    ctx.strokeStyle = v('--edge'); ctx.lineWidth = 1.6;
    S.pos.forEach((p, id) => {
      const node = FT().personById(id);
      if (!node || (S.collapsed && S.collapsed.has(id))) return;
      (FT().kidsOf(id) || []).forEach(c => {
        const q = S.pos.get(c.id); if (!q) return;
        const x1 = PAD + p.x + p.w / 2, y1 = oy + PAD + p.y + NH;
        const x2 = PAD + q.x + q.w / 2, y2 = oy + PAD + q.y;
        const my = y1 + (y2 - y1) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1, my, x2, my, x2, y2);
        ctx.stroke();
      });
    });

    // cards
    const font = css.getPropertyValue('--ui-font') || 'sans-serif';
    S.pos.forEach((p, id) => {
      const node = FT().personById(id); if (!node) return;
      const x = PAD + p.x, y = oy + PAD + p.y;
      const colour = /^m/i.test(node.gender || '') ? v('--male') : /^f/i.test(node.gender || '') ? v('--female') : v('--unknown');
      roundRect(ctx, x, y, NW, NH, 12);
      ctx.fillStyle = v('--surface'); ctx.fill();
      ctx.strokeStyle = v('--line'); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colour;
      roundRect(ctx, x, y + 1, 4, NH - 2, 2); ctx.fill();
      // initials disc
      ctx.beginPath(); ctx.arc(x + 25, y + NH / 2, 15, 0, Math.PI * 2);
      ctx.fillStyle = /^m/i.test(node.gender || '') ? v('--male-soft') : /^f/i.test(node.gender || '') ? v('--female-soft') : v('--unknown-soft');
      ctx.fill();
      ctx.fillStyle = colour; ctx.font = '700 12px ' + font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(node._initials || '').slice(0, 2), x + 25, y + NH / 2);
      // name (+ spouse name on the right of the card)
      ctx.textAlign = 'start';
      ctx.fillStyle = v('--ink'); ctx.font = '600 12.5px ' + font;
      ctx.fillText(ellipsis(ctx, FT().dispName(node), NW - 46), x + 44, y + NH / 2 - 8);
      ctx.fillStyle = v('--ink-2'); ctx.font = '11.5px ' + font;
      if (node.nick) ctx.fillText(ellipsis(ctx, '“' + node.nick + '”', NW - 46), x + 44, y + NH / 2 + 8);
      else if (node.spouse) ctx.fillText(ellipsis(ctx, node.spouse, NW - 46), x + 44, y + NH / 2 + 8);
      if (node.dod) { ctx.fillStyle = v('--ink-2'); ctx.fillText('†', x + NW - 14, y + 12); }
    });

    try {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'Family_Tree_' + new Date().toISOString().slice(0, 10) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      close();
    } catch (err) {
      FT().toast(T('extra.printFailed', { msg: (err && err.message) || String(err) }));
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Shorten text to fit a pixel width, with an ellipsis.
  function ellipsis(ctx, text, maxWidth) {
    const s = String(text == null ? '' : text);
    if (ctx.measureText(s).width <= maxWidth) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(s.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, lo) + '…';
  }

  window.Extras = { open: open, close: close, isOpen: isOpen };
})();
