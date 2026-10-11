/* =====================================================================
   Supabase auth + user profile helper (Phase 1)
   - Loads the pinned Supabase JS v2 UMD (window.supabase).
   - Reads config from js/config.js (window.APP_CONFIG).
   - Provides a small Auth object: current session, profile, sign-in/out.
   - Sign-in UI lives in #authArea (top bar). When anonymous: "Sign in".
     When signed in: avatar + name + sign-out.
   - Profiles are auto-created by the database trigger on signup; they start
     INACTIVE until an admin activates them. We show that state clearly.
   ===================================================================== */

(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));

  function initials(name) {
    if (!name) return '?';
    const w = name.replace(/^(syed|syeda|mohammed|md|mohd)\s+/i, '').split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }

  // The Supabase JS v2 UMD build (dist/umd/supabase.min.js) exposes
  //   window.supabase = { createClient, ... }
  // so the client factory is window.supabase.createClient(url, key).
  function getSupabase() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase;
    throw new Error('Supabase JS UMD did not load (window.supabase missing or createClient absent). Check the CDN script in index.html.');
  }

  function buildClient() {
    const cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('js/config.js must define window.APP_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY }.');
    }
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  const Auth = {
    client: null,
    loaded: false,
    initializing: false,

    session: null,          // { user, accessToken }
    profile: null,          // { id, email, full_name, role, active, language }
    branchAccess: [],       // [{ personId }] for the current editor

    signInLoading: false,
    signUpLoading: false,
    _callbacks: { onAuthChange: null, onProfileChange: null },

    init(cb) {
      if (this.loaded) { if (cb) cb(this); return; }
      try {
        this.client = buildClient();
      } catch (e) {
        console.warn('Auth init failed:', e.message);
        this._fail(e.message);
        return;
      }
      this.initializing = true;
      this._render();
      // getSession() can hang on some Supabase projects when there is no session
      // cookie (the /auth/v1/session endpoint returns 404 text/plain which the client
      // may not handle well). Guard it with a timeout so the page never stays stuck.
      const getSessionDone = (s) => {
        if (this._getSessionTimer) { clearTimeout(this._getSessionTimer); this._getSessionTimer = null; }
        this.initializing = false;
        this.session = s?.data?.session || null;
        this._sessionFresh = false;
        this._afterSession();
      };
      this.client.auth.getSession()
        .then(s => getSessionDone(s))
        .catch(e => { console.warn('getSession error:', e); getSessionDone(null); });
      // Fallback: if getSession() has not settled within 6s, treat it as "no session"
      // and move on so the page is never stuck in a loading spinner.
      this._getSessionTimer = setTimeout(() => {
        if (this.session === undefined) {
          console.warn('getSession() did not settle within 6s — assuming no session.');
          this.session = null;
          this._sessionFresh = false;
          this.initializing = false;
          this._afterSession();
        }
      }, 6000);
      this.client.auth.onAuthStateChange((ev, sess) => {
        this.session = sess;
        this._sessionFresh = false;
        this._afterSession();
        if (this._callbacks.onAuthChange) this._callbacks.onAuthChange(ev, sess);
      });
      this.loaded = true;
      if (cb) cb(this);
    },

    // clear the getSession fallback timer when the session settles (so we don't
    // double-resolve). Called implicitly via the timer's own check.
    _getSessionTimer: null,

    // refresh profile + branch access whenever we have a session but stale data
    _afterSession() {
      if (!this.session || !this.client) { this._clearProfile(); this._render(); return; }
      this._ensureProfile();
    },

    _ensureProfile() {
      if (this.profile && this.branchAccess && this._sessionFresh) return;
      if (!this.client) return;
      const uid = this.session.user?.id;
      if (!uid) { this._clearProfile(); this._render(); return; }
      // profiles: user sees own row; admin sees all (we only need own here)
      this.client.from('profiles').select('*').eq('id', uid).single()
        .then(row => {
          this.profile = (row && row.id) ? row : null;
          this._sessionFresh = true;
          this._render();
          if (this._callbacks.onProfileChange) this._callbacks.onProfileChange(row);
        })
        .catch(e => {
          console.warn('profile read error:', e);
          this.profile = null;
          this._render();
        });

      // branch_access for editors (admin doesn't need it; admin can edit everything)
      if (this.profile && this.profile.role === 'editor') {
        this.client.from('branch_access').select('person_id').eq('user_id', uid)
          .then(r => { this.branchAccess = (r.data || []).map(x => x.person_id); })
          .catch(e => { console.warn('branch_access read error:', e); this.branchAccess = []; });
      } else {
        this.branchAccess = [];
      }
    },

    _clearProfile() {
      this.profile = null;
      this.branchAccess = [];
      this._sessionFresh = false;
    },

    _fail(reason) {
      this.loaded = true;
      this.initializing = false;
      this.session = null;
      this.profile = null;
      this.branchAccess = [];
      this._render();
      // expose reason so app.js can show a friendly message
      this._failureReason = reason;
    },

    // ---- sign-in / sign-up (email+password) ----
    signInWithPassword(email, password) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      this.signInLoading = true;
      this._render();
      return this.client.auth.signInWithPassword({ email, password })
        .then(() => { this.signInLoading = false; this._render(); })
        .catch(err => {
          this.signInLoading = false;
          this._render();
          return Promise.reject(err);
        });
    },

    signUpWithPassword(email, password, fullName) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      this.signUpLoading = true;
      this._render();
      return this.client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email } }
      }).then(() => {
        this.signUpLoading = false;
        this._render();
        // account created but profile is inactive until admin approves
      }).catch(err => {
        this.signUpLoading = false;
        this._render();
        return Promise.reject(err);
      });
    },

    signOut() {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      return this.client.auth.signOut().then(() => {
        this._clearProfile();
        this._render();
      }).catch(err => {
        console.warn('signOut error:', err);
        this._clearProfile();
        this._render();
        return Promise.reject(err);
      });
    },

    // ---- permissions helpers (mirror DB rules, for UI only) ----
    // These do NOT enforce security — the database does. They just decide which
    // buttons to show. Always handle DB permission errors gracefully.
    isAdmin() {
      return !!(this.profile && this.profile.role === 'admin' && this.profile.active);
    },
    isActiveEditor() {
      // logged in, active, editor (may have branch access)
      return !!(this.profile && this.profile.role === 'editor' && this.profile.active);
    },
    isAdminOrActive() {
      return !!(this.profile && this.profile.active);
    },
    canEditPerson(personId) {
      // admin: always. editor: person is this person or a descendant of one of the
      // people in branch_access. The DB function can_edit_person does exactly this;
      // we replicate it client-side for button visibility only.
      if (this.isAdmin()) return true;
      if (!this.isActiveEditor()) return false;
      if (!personId) return false;
      // build ancestor chain for the person by walking the stored path
      const path = (this._personPath && this._personPath.get && this._personPath.get(personId));
      if (!path) return false;
      const br = new Set(this.branchAccess);
      // editor can edit person P if P is in their branch_access, OR P is a descendant
      // of someone in branch_access (i.e. one of the branch roots appears in P's path).
      return path.some(pid => br.has(pid));
    },

    // store a person's path (uuid[]) for canEditPerson; set by app.js when loading data
    setPersonPath(personId, path) {
      if (!this._personPath) this._personPath = new Map();
      this._personPath.set(personId, path || []);
    },
    _personPath: null,

    // ---- UI ----
    _render() {
      const area = $('#authArea');
      if (!area) return;
      if (!this.loaded || this.initializing) {
        area.innerHTML = '<div class="auth-spinner" title="Loading…"></div>';
        return;
      }
      if (this._failureReason) {
        area.innerHTML = `<span class="auth-name" style="color:var(--ink-2)">Supabase unavailable: ${esc(this._failureReason)}</span>`;
        return;
      }
      if (!this.session) {
        area.innerHTML = `
          <button class="auth-btn primary" id="btnSignIn">Sign in</button>
          <button class="auth-btn" id="btnSignUp">Create account</button>`;
        $('#btnSignIn').onclick = () => this._showSignIn();
        $('#btnSignUp').onclick = () => this._showSignUp();
        return;
      }
      // signed in
      const p = this.profile;
      const name = p && p.full_name ? p.full_name : (p && p.email ? p.email : 'Signed in');
      const initialsStr = initials(name);
      const adminBadge = this.isAdmin() ? ' <span class="tag tag gray" style="font-size:10.5px;padding:1px 6px">admin</span>' : '';
      const inactiveBadge = (!p || !p.active) ? ' <span class="tag tag gray" style="font-size:10px;padding:0 5px">pending activation</span>' : '';
      area.innerHTML = `
        <div class="auth-avatar">${esc(initialsStr)}</div>
        <span class="auth-name" title="${esc(name)}">${esc(name)}${adminBadge}${inactiveBadge}</span>
        <button class="auth-btn" id="btnProfile" title="Edit your profile">Profile</button>
        <button class="auth-btn auth-signout" id="btnSignOut" title="Sign out">Sign out</button>`;
      $('#btnProfile').onclick = () => this._showProfileEdit();
      $('#btnSignOut').onclick = () => this.signOut();
    },

    _showSignIn() {
      if (this.signInLoading) return;
      const panel = document.createElement('div');
      panel.className = 'auth-modal';
      panel.innerHTML = `
        <div class="auth-modal-box">
          <h3 style="margin:0 0 10px;font-size:15px" data-i18n>signin.title</h3>
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--ink-2)" data-i18n>signin.subtitle</p>
          <div class="auth-field">
            <label class="edit-label" for="siEmail" data-i18n>signin.email</label>
            <input id="siEmail" type="email" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
          </div>
          <div class="auth-field" style="margin-top:8px">
            <label class="edit-label" for="siPassword" data-i18n>signin.password</label>
            <input id="siPassword" type="password" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn" id="siCancel" style="flex:1" data-i18n>signin.cancel</button>
            <button class="btn primary" id="siGo" style="flex:2;background:var(--accent);color:#fff;border-color:var(--accent)" data-i18n>signin.go</button>
          </div>
          <p id="siMsg" style="margin-top:10px;font-size:12px;color:var(--ink-2);min-height:14px"></p>
        </div>`;
      document.body.appendChild(panel);
      I18n.apply();
      panel.querySelector('#siGo').onclick = () => {
        const email = panel.querySelector('#siEmail').value.trim();
        const password = panel.querySelector('#siPassword').value;
        panel.querySelector('#siMsg').textContent = '';
        if (!email || !password) { panel.querySelector('#siMsg').textContent = I18n.t('signin.msg.empty'); return; }
        panel.querySelector('#siGo').disabled = true;
        panel.querySelector('#siGo').textContent = I18n.t('signin.signingIn');
        this.signInWithPassword(email, password)
          .then(() => { /* auth state change will re-render */ })
          .catch(err => {
            const msg = err?.message || String(err);
            const friendly = msg.includes('Invalid login credentials')
              ? I18n.t('signin.msg.invalid')
              : msg.includes('Email') && msg.includes('not confirmed')
              ? I18n.t('signin.msg.notConfirmed')
              : msg.includes('not authorized') || msg.includes('not active')
              ? I18n.t('signin.msg.notActive')
              : I18n.fmt('signin.msg.failed', { msg });
            panel.querySelector('#siMsg').textContent = friendly;
            panel.querySelector('#siGo').disabled = false;
            panel.querySelector('#siGo').textContent = I18n.t('signin.go');
          });
      };
      panel.querySelector('#siCancel').onclick = () => panel.remove();
      panel.querySelector('#siEmail').focus();
      const escHandler = (e) => { if (e.key === 'Escape') { panel.remove(); window.removeEventListener('keydown', escHandler); } };
      window.addEventListener('keydown', escHandler);
      panel.addEventListener('click', (e) => { if (e.target === panel) { panel.remove(); window.removeEventListener('keydown', escHandler); } });
    },

    // ---------- Profile edit (own name + language) ----------
    _showProfileEdit() {
      if (!this.profile) return;
      const panel = document.createElement('div');
      panel.className = 'auth-modal';
      const currentName = this.profile.full_name || '';
      const currentLang = this.profile.language || 'en';
      const isActive = !!this.profile.active;
      const isAdmin = this.isAdmin();
      panel.innerHTML = `
        <div class="auth-modal-box">
          <h3 style="margin:0 0 10px;font-size:15px" data-i18n>profile.title</h3>
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--ink-2)" data-i18n>${isAdmin ? 'admin.editUsersNote' : 'admin.editUsersNoteNonAdmin'}</p>
          ${!isActive ? `<div style="margin:0 0 12px;padding:8px 12px;background:var(--female-soft);color:var(--female);border-radius:8px;font-size:12.5px" data-i18n>admin.accountInactive</div>` : ''}
          <div class="auth-field">
            <label class="edit-label" for="peName" data-i18n>profile.nameLabel</label>
            <input id="peName" type="text" value="${esc(currentName)}" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
          </div>
          <div class="auth-field" style="margin-top:8px">
            <label class="edit-label" for="peLang" data-i18n>profile.langLabel</label>
            <select id="peLang" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
              <option value="en" ${currentLang === 'en' ? 'selected' : ''} data-i18n>profile.lang.en</option>
              <option value="ur" ${currentLang === 'ur' ? 'selected' : ''} data-i18n>profile.lang.ur</option>
              <option value="hi" ${currentLang === 'hi' ? 'selected' : ''} data-i18n>profile.lang.hi</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn" id="peCancel" style="flex:1" data-i18n>profile.cancel</button>
            <button class="btn primary" id="peGo" style="flex:2;background:var(--accent);color:#fff;border-color:var(--accent)" data-i18n>profile.save</button>
          </div>
          <p id="peMsg" style="margin-top:10px;font-size:12px;color:var(--ink-2);min-height:14px"></p>
        </div>`;
      document.body.appendChild(panel);
      I18n.apply();
      panel.querySelector('#peGo').onclick = () => {
        const name = panel.querySelector('#peName').value.trim();
        const lang = panel.querySelector('#peLang').value;
        panel.querySelector('#peMsg').textContent = '';
        if (!name) { panel.querySelector('#peMsg').textContent = I18n.t('profile.nameRequired'); return; }
        panel.querySelector('#peGo').disabled = true;
        panel.querySelector('#peGo').textContent = I18n.t('profile.save') + '…';
        this.updateProfile({ full_name: name, language: lang })
          .then(() => {
            panel.querySelector('#peMsg').textContent = I18n.t('profile.updated');
            panel.querySelector('#peGo').disabled = false;
            panel.querySelector('#peGo').textContent = I18n.t('profile.save');
            this._render();
          })
          .catch(err => {
            const msg = err?.message || String(err);
            const friendly = msg.includes('forbids') || msg.includes('permission')
              ? I18n.t('admin.profilePermError')
              : I18n.fmt('admin.profileFailed', { msg });
            panel.querySelector('#peMsg').textContent = friendly;
            panel.querySelector('#peGo').disabled = false;
            panel.querySelector('#peGo').textContent = I18n.t('profile.save');
          });
      };
      panel.querySelector('#peCancel').onclick = () => panel.remove();
      panel.querySelector('#peName').focus();
      const escHandler = (e) => { if (e.key === 'Escape') { panel.remove(); window.removeEventListener('keydown', escHandler); } };
      window.addEventListener('keydown', escHandler);
      panel.addEventListener('click', (e) => { if (e.target === panel) { panel.remove(); window.removeEventListener('keydown', escHandler); } });
    },

    updateProfile(fields) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      const uid = this.session?.user?.id;
      if (!uid) return Promise.reject(new Error('Not signed in.'));
      return this.client.from('profiles').update(fields).eq('id', uid)
        .then(({ error }) => {
          if (error) throw error;
          // refresh the local profile so the cache is current
          return this._ensureProfile();
        });
    },

    _showSignUp() {
      if (this.signUpLoading) return;
      const panel = document.createElement('div');
      panel.className = 'auth-modal';
      panel.innerHTML = `
        <div class="auth-modal-box">
          <h3 style="margin:0 0 10px;font-size:15px" data-i18n>signup.title</h3>
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--ink-2)" data-i18n>signup.subtitle</p>
          <div class="auth-field">
            <label class="edit-label" for="suEmail" data-i18n>signup.email</label>
            <input id="suEmail" type="email" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
          </div>
          <div class="auth-field" style="margin-top:8px">
            <label class="edit-label" for="suName" data-i18n>signup.name</label>
            <input id="suName" type="text" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
          </div>
          <div class="auth-field" style="margin-top:8px">
            <label class="edit-label" for="suPassword" data-i18n>signup.password</label>
            <input id="suPassword" type="password" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);outline:none">
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn" id="suCancel" style="flex:1" data-i18n>signup.cancel</button>
            <button class="btn primary" id="suGo" style="flex:2;background:var(--accent);color:#fff;border-color:var(--accent)" data-i18n>signup.go</button>
          </div>
          <p id="suMsg" style="margin-top:10px;font-size:12px;color:var(--ink-2);min-height:14px"></p>
        </div>`;
      document.body.appendChild(panel);
      I18n.apply();
      panel.querySelector('#suGo').onclick = () => {
        const email = panel.querySelector('#suEmail').value.trim();
        const name = panel.querySelector('#suName').value.trim();
        const password = panel.querySelector('#suPassword').value;
        panel.querySelector('#suMsg').textContent = '';
        if (!email || !password) { panel.querySelector('#suMsg').textContent = I18n.t('signup.msg.empty'); return; }
        if (password.length < 6) { panel.querySelector('#suMsg').textContent = I18n.t('signup.msg.short'); return; }
        panel.querySelector('#suGo').disabled = true;
        panel.querySelector('#suGo').textContent = I18n.t('signup.creating');
        this.signUpWithPassword(email, password, name)
          .then(() => {
            panel.querySelector('#suMsg').textContent = I18n.t('signup.done');
            panel.querySelector('#suGo').disabled = false;
            panel.querySelector('#suGo').textContent = I18n.t('signup.go');
          })
          .catch(err => {
            const msg = err?.message || String(err);
            const friendly = msg.includes('already been taken')
              ? I18n.t('signup.msg.taken')
              : msg.includes('weak password')
              ? I18n.t('signup.msg.weak')
              : I18n.fmt('signup.msg.failed', { msg });
            panel.querySelector('#suMsg').textContent = friendly;
            panel.querySelector('#suGo').disabled = false;
            panel.querySelector('#suGo').textContent = I18n.t('signup.go');
          });
      };
      panel.querySelector('#suCancel').onclick = () => panel.remove();
      panel.querySelector('#suEmail').focus();
      const escHandler = (e) => { if (e.key === 'Escape') { panel.remove(); window.removeEventListener('keydown', escHandler); } };
      window.addEventListener('keydown', escHandler);
      panel.addEventListener('click', (e) => { if (e.target === panel) { panel.remove(); window.removeEventListener('keydown', escHandler); } });
    }
  };

  // exposed for app.js
  window.Auth = Auth;

  // small inline auth-modal styles (hoisted once)
  if (!document.getElementById('auth-modal-style')) {
    const s = document.createElement('style');
    s.id = 'auth-modal-style';
    s.textContent = `
      .auth-modal { position: fixed; inset: 0; background: rgba(20,30,35,.45); display: grid; place-items: center; z-index: 100; }
      .auth-modal-box { width: 360px; max-width: 92vw; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-lg); padding: 20px; }
      .auth-field { display: block; }
      @media (max-width: 640px) { .auth-modal-box { padding: 16px; } }
    `;
    document.head.appendChild(s);
  }
})();
