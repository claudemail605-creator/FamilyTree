/* =====================================================================
   My view — the real family tree, scoped to an invited editor's branch.

   An invited, branch-limited editor lands here after signing in instead of
   being dropped into the whole family tree. The canvas is the SAME renderer
   the admin sees (js/app.js); this file only decides which branch is in
   scope and draws the bar above it. That means:
     * the cards, the add buttons and the menu are one implementation, not a
       second screen that can drift;
     * a child added in My view lands in the main tree under the same parent,
       because it is the same model and the same database rows;
     * an editor whose branch is only themselves still sees a valid canvas —
       one card, badged "You", with the ＋ menu ready.

   SECURITY MODEL (the database stays the only authority):
     * Which branch an editor may work on comes from branch_access — the same
       table public.can_edit_person() reads. Nothing here grants anything.
     * Every write still goes through PersonForm → the add_relative RPC or the
       RLS-checked insert, so people_guard and the policies answer first.
     * The bar is navigation, never authorisation: hiding it, editing the DOM
       or passing another id in storage changes what is drawn, not what the
       server will accept.

   This module keeps the branch maths that js/admin.js consumes
   (branchPeople / myPeople / completeness), so the admin's branch-progress
   view and the editor's canvas use exactly the same definition of a branch.
   ===================================================================== */

(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (key, params) => (params ? I18n.fmt(key, params) : I18n.t(key));
  const FT = () => window.FT || {};
  const Auth = () => window.Auth || null;

  /* ------------------------------ state ------------------------------ */
  const S = {
    landing: false,       // enter My view as soon as the people arrive
    landedFor: null,      // profile id already auto-landed (once per sign-in)
    dismissed: false      // the "no branch assigned" bar was closed on purpose
  };

  function profile() { const a = Auth(); return a ? a.profile : null; }
  function isEditor() { const p = profile(); return !!(p && p.role === 'editor' && p.active); }
  function myBranchIds() {
    const a = Auth();
    return isEditor() ? ((a && a.branchAccess) || []).filter(Boolean) : [];
  }
  function personById(id) { const f = FT(); return f.personById ? f.personById(id) : null; }
  function dispName(p) { const f = FT(); return p ? (f.dispName ? f.dispName(p) : (p.name || '')) : ''; }

  // Only anchors that exist in the loaded model are usable. A stale branch_access
  // row (the person was deleted) must not pin an empty canvas.
  function anchors() { return myBranchIds().filter(id => personById(id)); }

  function scopeAnchor() {
    const f = FT();
    const info = f.scopeInfo ? f.scopeInfo() : null;
    return info ? info.anchorId : null;
  }

  /* --------------------------- branch maths --------------------------- */
  // Anchor + all descendants, straight from the client model (which RLS lets
  // every active user read). This mirrors what can_edit_person() returns true
  // for, so nothing outside the editor's branches is ever offered for editing.
  function branchPeople(anchorId) {
    const f = FT();
    if (!f.personById || !f.kidsOf) return [];
    const seen = new Set(), out = [];
    const walk = id => {
      if (seen.has(id)) return;
      seen.add(id);
      const p = f.personById(id);
      if (!p) return;
      out.push(p);
      (f.kidsOf(id) || []).forEach(c => walk(c.id));
    };
    walk(anchorId);
    return out;
  }

  // Everything the current editor may edit, across all assigned branches.
  function myPeople() {
    const seen = new Map();
    myBranchIds().forEach(id => branchPeople(id).forEach(p => seen.set(p.id, p)));
    return [...seen.values()];
  }

  /* ------------------------- completeness model ------------------------- */
  // Real fields only (the people table). Nothing invented. Used by the admin's
  // branch-progress view; My view itself shows the real tree, not a score.
  function completeness(p) {
    const f = FT();
    const kids = (f.kidsOf ? f.kidsOf(p.id) : []) || [];
    const items = [
      ['nick', p.nick],
      ['gender', p.gender],
      ['dob', p.dob || p.dob_text],
      ['pob', p.pob],
      ['parents', p.father || p.mother || p.parentId],
      ['spouse', p.spouse],
      ['children', kids.length],
      ['qual', p.qual],
      ['photo', p.photo_path]
    ];
    const missing = items.filter(x => !x[1]).map(x => x[0]);
    const total = items.length;
    const pct = total ? Math.round(((total - missing.length) / total) * 100) : 100;
    return { missing: missing, pct: pct };
  }

  /* --------------------------- remembered choice --------------------------- */
  // Per profile, so two editors sharing a browser do not inherit each other's
  // branch. The value is only a convenience: the server still decides access.
  function prefKey(kind) {
    const p = profile();
    return 'ft-' + kind + (p && p.id ? ':' + p.id : '');
  }
  function readPref(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function writePref(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }

  function rememberAnchor(id) { if (id) writePref(prefKey('scope'), id); }

  /* ------------------------------- view ------------------------------- */
  // Enter My view. Before the rows arrive this only sets intent; the next
  // ft:render lands it. With several assigned branches the remembered one (or
  // the first) is shown, and the bar offers the others.
  function show() {
    if (!isEditor()) return;
    S.dismissed = false;
    const list = anchors();
    const f = FT();
    if (!list.length) {
      // No usable anchor yet: either the tree is still loading or the account
      // genuinely has no branch. Draw the bar now; land when the data arrives.
      S.landing = !(f.people && f.people().length);
      renderBar();
      updateNav();
      return;
    }
    S.landing = false;
    const saved = readPref(prefKey('scope'));
    const anchorId = list.includes(saved) ? saved : list[0];
    writePref(prefKey('view'), 'mine');
    setActive(anchorId);
  }

  function setActive(id) {
    if (!id || !isEditor()) return;
    S.landing = false;
    rememberAnchor(id);
    const f = FT();
    if (f.setScope) f.setScope(id);
    updateNav();
  }

  // Back to the full tree without losing the invitation: the nav button flips
  // to "My view" and the scope bar disappears.
  function goBackToTree() {
    S.landing = false;
    writePref(prefKey('view'), 'tree');
    const f = FT();
    if (f.clearScope) f.clearScope();
    updateNav();
  }

  function isOpen() { return !!scopeAnchor(); }

  /* ------------------------------- bar ------------------------------- */
  function renderBar() {
    const host = $('#scopeBar');
    if (!host) return;
    if (!isEditor() || S.dismissed) { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;

    const list = anchors();
    const info = FT().scopeInfo ? FT().scopeInfo() : null;

    if (!info) {
      if (!list.length) {
        host.innerHTML =
          '<div class="scope-bar">' +
          '<span class="pill">' + esc(T('scope.pill')) + '</span>' +
          '<span class="who">' + esc(T('scope.noBranchTitle')) + '</span>' +
          '<span class="sub">' + esc(T('scope.noBranchSub')) + '</span>' +
          '<span class="grow"></span>' +
          '<button type="button" class="btn ghost sm" id="scopeOpenFull">' + esc(T('scope.openFull')) + '</button>' +
          '</div>';
        return;
      }
      // The editor chose the full tree: no bar at all. My view is a mode, and
      // outside it the canvas must look exactly like everyone else's.
      host.innerHTML = '';
      host.hidden = true;
      return;
    }

    const facts = [];
    if (info.parentName) facts.push(T('scope.childOf', { name: info.parentName }));
    facts.push(info.count === 1 ? T('scope.justYou') : T('scope.people', { n: info.count }));
    host.innerHTML =
      '<div class="scope-bar">' +
      '<span class="pill">' + esc(T('scope.pill')) + '</span>' +
      '<span class="who">' + esc(T('scope.yourBranch')) + '<b> · ' + esc(info.anchorName) + '</b></span>' +
      '<span class="sub">' + esc(facts.join(' · ')) + '</span>' +
      '<span class="grow"></span>' +
      (list.length > 1 ? branchButtons(list) : '') +
      '<button type="button" class="btn ghost sm" id="scopeFull">' + esc(T('scope.showFull')) + '</button>' +
      '</div>';
  }

  function branchButtons(list) {
    return '<span class="scope-branches" role="group" aria-label="' + esc(T('scope.pickBranch')) + '">' + list.map(id => {
      const p = personById(id);
      const on = scopeAnchor() === id;
      return '<button type="button" class="btn sm' + (on ? ' primary' : '') + '" data-anchor="' + esc(id) + '">' +
        esc(dispName(p)) + '</button>';
    }).join('') + '</span>';
  }

  /* ------------------------------- landing ------------------------------- */
  // Called after every draw: this is where a pending My view is finally applied,
  // after the rows (and therefore the anchor) exist.
  function maybeLand() {
    if (!S.landing) return;
    if (!isEditor()) { S.landing = false; return; }
    const f = FT();
    if (!(f.people && f.people().length)) return;   // still loading
    S.landing = false;
    const list = anchors();
    if (!list.length) { renderBar(); updateNav(); return; }
    const saved = readPref(prefKey('scope'));
    setActive(list.includes(saved) ? saved : list[0]);
  }

  /* ------------------------- navigation & nav item ------------------------- */
  function updateNav() {
    const on = isEditor();
    const scoped = isOpen();
    [['#btnBranch'], ['#btnBranchMobile']].forEach(([sel]) => {
      const btn = $(sel);
      if (!btn) return;
      btn.hidden = !on;
      const span = btn.querySelector('span') || btn;
      // The label states the destination: "My view" when the full tree is on
      // screen, "Full tree" once you are already scoped.
      const key = scoped ? 'scope.fullTree' : 'branch.nav';
      span.setAttribute('data-i18n', key);
      span.textContent = T(key);
    });
  }

  // Decide where the user lands after a sign-in / profile (re)load.
  function onProfileReady(prof) {
    updateNav();
    if (!prof || !prof.active || prof.role !== 'editor') {
      S.landing = false;
      S.landedFor = null;
      renderBar();
      return;
    }
    if (S.landedFor === prof.id) { renderBar(); return; }
    S.landedFor = prof.id;
    // First visit lands in My view; an explicit "full tree" choice is honoured
    // on later visits, and an old #branch link always opens My view.
    const wantsHash = location.hash.indexOf('#branch') === 0;
    const chosen = readPref(prefKey('view'));
    if (wantsHash || chosen !== 'tree') show();
    else renderBar();
  }

  /* ------------------------------- wiring ------------------------------- */
  function init() {
    const a = Auth();
    // Old links/bookmarks: clean the hash, then land once the profile is known.
    if (location.hash.indexOf('#branch') === 0) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    }

    // app.js flips the canvas (scope on/off, filters, saves); the bar follows.
    document.addEventListener('ft:render', () => { maybeLand(); renderBar(); updateNav(); });
    // Language switch re-draws every JS-rendered surface; the bar too.
    document.addEventListener('i18n:change', () => { renderBar(); updateNav(); });

    const host = $('#scopeBar');
    if (host) host.addEventListener('click', e => {
      const b = e.target.closest('[data-anchor]');
      if (b) { setActive(b.dataset.anchor); return; }
      if (e.target.closest('#scopeFull')) { goBackToTree(); return; }
      if (e.target.closest('#scopeOpenFull')) { S.dismissed = true; renderBar(); return; }
    });

    const branchBtn = $('#btnBranch');
    if (branchBtn) branchBtn.onclick = () => { if (!isEditor()) return; isOpen() ? goBackToTree() : show(); };
    const mBranchBtn = $('#btnBranchMobile');
    if (mBranchBtn) mBranchBtn.onclick = () => {
      if (!isEditor()) return;
      // Close the filter drawer so the canvas (and the bar) can be seen.
      window.drawer?.close?.() || (() => {
        const sb = $('#sidebar');
        if (sb) sb.classList.remove('open');
        const backdrop = $('#drawerBackdrop');
        if (backdrop) backdrop.hidden = true;
      })();
      isOpen() ? goBackToTree() : show();
    };

    // If the profile is already known by the time this script runs, act on it.
    if (a && a.profile && a.profile.active) onProfileReady(a.profile);
    else updateNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.Branch = {
    isOpen: isOpen,
    show: show,
    goBackToTree: goBackToTree,
    updateNav: updateNav,
    onProfileReady: onProfileReady,
    renderBar: renderBar,
    completeness: completeness,
    branchPeople: branchPeople,
    myPeople: myPeople
  };
})();
