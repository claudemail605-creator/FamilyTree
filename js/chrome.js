/* =====================================================================
   Chrome — the parts of the shell that are not the tree.

   Two jobs, both presentation only:
     1. The account menu (#appMenu). Every secondary action that used to be an
        icon-only button in the top bar is now a named row inside it.
     2. The "More ways to narrow" disclosure in the sidebar: it opens itself
        when one of its filters is doing something, and the summary carries a
        count so a narrowed tree can never look unexplained.

   No data access, no auth decisions. If this file fails to load, every control
   still exists and still has its own handler; only the menu would stay hidden.
   ===================================================================== */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ------------------------------ account menu ------------------------------ */

  function menu() { return $('#appMenu'); }
  function chip() { return $('#btnMenu'); }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  // The menu header is only visible while the menu is open, so it is filled at
  // open time from the profile that is already in memory.
  function refreshIdentity() {
    const p = (window.Auth && window.Auth.profile) || null;
    const nameEl = $('#menuName');
    const mailEl = $('#menuEmail');
    const avEl = $('#menuAvatar');
    const name = p ? (p.full_name || p.email || '') : '';
    if (nameEl) nameEl.textContent = name;
    if (mailEl) mailEl.textContent = p && p.email ? p.email : '';
    if (avEl) avEl.textContent = initials(name);
  }

  function items() {
    const m = menu();
    if (!m) return [];
    return $$('[role="menuitem"]', m).filter(el => !el.hidden && el.offsetParent !== null);
  }

  function setExpanded(on) {
    const c = chip();
    if (c) c.setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  function openMenu() {
    const m = menu();
    const c = chip();
    if (!m || !c || m.hidden === false) return;
    refreshIdentity();
    m.hidden = false;
    setExpanded(true);
    const first = items()[0];
    if (first) first.focus();
  }

  function closeMenu(refocus) {
    const m = menu();
    if (!m || m.hidden) return;
    m.hidden = true;
    setExpanded(false);
    if (refocus) {
      const c = chip();
      if (c) c.focus();
    }
  }

  function isOpen() {
    const m = menu();
    return !!m && !m.hidden;
  }

  function wireMenu() {
    // The chip is rendered by auth.js after sign-in, so the click is delegated.
    document.addEventListener('click', e => {
      const c = e.target.closest('#btnMenu');
      if (c) {
        e.preventDefault();
        if (isOpen()) closeMenu(true); else openMenu();
        return;
      }
      // A row was chosen: run its own handler, then put the menu away.
      if (e.target.closest('#appMenu .menu-item')) {
        closeMenu();
        return;
      }
      if (isOpen() && !e.target.closest('#appMenu')) closeMenu();
    });

    document.addEventListener('keydown', e => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
      const list = items();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        list[(at + 1 + list.length) % list.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        list[(at - 1 + list.length) % list.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        list[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        list[list.length - 1].focus();
      }
    });

    // Signing out empties #authArea; a menu floating with no owner must go too.
    const area = $('#authArea');
    if (area && 'MutationObserver' in window) {
      new MutationObserver(() => { if (!chip()) closeMenu(); }).observe(area, { childList: true });
    }
    window.addEventListener('resize', () => closeMenu());
  }

  /* --------------------------- filter disclosure --------------------------- */

  const FILTERS = ['#fStatus', '#fBranch', '#fPob', '#fQual', '#fHas'];

  function activeFilterCount() {
    let n = 0;
    FILTERS.forEach(sel => {
      const el = $(sel);
      if (el && el.value) n += 1;
    });
    const del = $('#showDeleted');
    if (del && del.checked && !(del.closest('[hidden]'))) n += 1;
    return n;
  }

  function refreshFilterCount() {
    const box = $('#moreFilters');
    if (!box) return;
    const n = activeFilterCount();
    const badge = $('#moreCount');
    if (badge) {
      badge.textContent = n ? String(n) : '';
      badge.hidden = !n;
    }
    box.classList.toggle('narrowed', n > 0);
    if (n > 0 && !box.open) box.open = true;
  }

  function wireFilters() {
    const side = $('#sidebar');
    if (!side) return;
    side.addEventListener('change', refreshFilterCount);
    // Reset and the generation/gender chips do not fire "change" on the selects.
    side.addEventListener('click', () => setTimeout(refreshFilterCount, 0));
    refreshFilterCount();
  }

  /* -------------------------------- boot -------------------------------- */

  function boot() {
    wireMenu();
    wireFilters();
    // app.js binds its handlers during its own init; one tick later the selects
    // hold whatever the saved state restored.
    setTimeout(refreshFilterCount, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Chrome = {
    openMenu: openMenu,
    closeMenu: closeMenu,
    refreshIdentity: refreshIdentity,
    refreshFilterCount: refreshFilterCount
  };
})();
