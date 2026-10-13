/* =====================================================================
   Family tree — authentication (Phase 1)

   - Uses the single client created by js/supabase.js (window.SupabaseClient).
   - Nothing in the app is usable until an ACTIVE user is signed in: while signed
     out the whole layout is hidden behind a full-screen sign-in gate.
   - Accounts are created by the family admin only — there is no sign-up link.
   - Supports admin invite links and "forgot password" recovery links: both open a
     "Set your password" form (minimum 8 characters) that calls
     supabase.auth.updateUser({ password }).
   - A signed-in user whose profile row is missing, or has active = false, is signed
     out with a "not active yet" message.

   The permission helpers below (isAdmin / canEditPerson) only decide which buttons
   are shown. The database enforces the real rules.
   ===================================================================== */

(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function initials(name) {
    if (!name) return '?';
    const w = name.replace(/^(syed|syeda|mohammed|md|mohd)\s+/i, '').split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }

  // The page URL to return to after an email link (reset / invite).
  function currentPageUrl() {
    return (location.origin && location.origin !== 'null')
      ? location.origin + location.pathname
      : location.href.split(/[?#]/)[0];
  }

  // Drop ?type=…/#access_token=… from the address bar so a refresh does not re-open
  // the set-password form.
  function stripAuthParams() {
    if (!location.hash && !location.search) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }

  function getClient() {
    if (window.SupabaseClient) return window.SupabaseClient;
    throw new Error(window.SUPABASE_INIT_ERROR || 'js/supabase.js did not create a client (window.SupabaseClient missing).');
  }

  // A labelled password input with a Show/Hide toggle.
  function passwordField(o) {
    return `<label class="edit-label" for="${o.id}" data-i18n>${o.labelKey}</label>
      <div class="pw-field">
        <input class="edit-input" id="${o.id}" type="password" autocomplete="${o.autocomplete || 'current-password'}" required>
        <button type="button" class="pw-toggle" data-pw-toggle="${o.id}" aria-pressed="false">${esc(I18n.t('auth.showPassword'))}</button>
      </div>`;
  }

  function wirePasswordToggles(root) {
    root.querySelectorAll('[data-pw-toggle]').forEach(btn => {
      const input = root.querySelector('#' + btn.getAttribute('data-pw-toggle'));
      if (!input) return;
      btn.onclick = () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = I18n.t(show ? 'auth.hidePassword' : 'auth.showPassword');
        btn.setAttribute('aria-pressed', String(show));
      };
    });
  }

  // supabase-js / GoTrue error strings -> friendly, translated messages.
  function friendlySignInError(err) {
    const msg = (err && (err.message || err.error_description)) || String(err);
    if (/invalid login credentials|invalid_grant|invalid password/i.test(msg)) return I18n.t('auth.signInFailed');
    if (/email not confirmed|not confirmed/i.test(msg)) return I18n.t('auth.notConfirmed');
    if (/too many requests|rate limit|over_email_send_rate/i.test(msg)) return I18n.t('auth.tooMany');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return I18n.t('auth.network');
    if (/not active/i.test(msg)) return I18n.t('auth.notActive');
    return I18n.fmt('auth.signInError', { msg: msg });
  }

  const Auth = {
    client: null,
    loaded: false,
    initializing: false,

    session: null,          // { user, access_token, … }
    profile: null,          // { id, email, full_name, role, active, language }
    branchAccess: [],       // person_id list for the current editor

    signInLoading: false,
    signUpLoading: false,
    _callbacks: { onAuthChange: null, onProfileChange: null },

    // --- Phase 1 gate state ---
    _pendingLink: null,     // 'invite' | 'recovery' | 'signup' while a link form is open
    _gateNotice: null,      // i18n key shown above the sign-in form
    _getSessionTimer: null,
    _failureReason: null,
    _personPath: null,

    /* ------------------------- lifecycle ------------------------- */
    init(cb) {
      if (this.loaded) { if (cb) cb(this); return; }

      // Read the invite/recovery state captured by js/supabase.js before supabase-js
      // consumed the URL. An expired link lands here as error_code=otp_expired.
      const link = window.AUTH_LINK || {};
      if (link.error && /otp|token|expired|invalid/i.test(link.error)) {
        this._gateNotice = 'auth.linkExpired';
      } else if (link.type && ['invite', 'recovery', 'signup'].indexOf(link.type) >= 0) {
        this._pendingLink = link.type;
      }

      try {
        this.client = getClient();
      } catch (e) {
        console.warn('Auth init failed:', e.message);
        this._fail(e.message);
        return;
      }

      this.initializing = true;
      this._render();

      // getSession() can hang on some projects (the session endpoint can answer with
      // text/plain that the client mishandles), so guard it with a timeout.
      const getSessionDone = (s) => {
        if (this._getSessionTimer) { clearTimeout(this._getSessionTimer); this._getSessionTimer = null; }
        this.initializing = false;
        this.session = (s && s.data && s.data.session) || null;
        this._sessionFresh = false;
        this._afterSession();
      };
      this.client.auth.getSession()
        .then(s => getSessionDone(s))
        .catch(e => { console.warn('getSession error:', e); getSessionDone(null); });
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
        if (ev === 'PASSWORD_RECOVERY' && !this._pendingLink) this._pendingLink = 'recovery';
        this.session = sess || null;
        this._sessionFresh = false;
        this._afterSession();
        if (this._callbacks.onAuthChange) this._callbacks.onAuthChange(ev, sess);
      });

      this.loaded = true;
      if (cb) cb(this);
    },

    _afterSession() {
      if (!this.session || !this.client) { this._clearProfile(); this._render(); return; }
      this._ensureProfile();
    },

    _ensureProfile() {
      if (this.profile && this.branchAccess && this._sessionFresh) return;
      if (!this.client) return;
      const uid = this.session && this.session.user ? this.session.user.id : null;
      if (!uid) { this._clearProfile(); this._render(); return; }

      // profiles: a user sees their own row; an admin sees all (we only need our own).
      // supabase-js resolves { data, error } — read data, not the wrapper.
      this.client.from('profiles').select('*').eq('id', uid).single()
        .then(({ data: row, error }) => {
          if (error) console.warn('profile read error:', error.message || error);
          const prof = (row && row.id) ? row : null;

          // Phase 1 rule: no profile row, or active = false, means no access at all —
          // sign out and explain. An invite/recovery link is the exception: they must
          // be allowed to set a password first.
          if (!prof || !prof.active) {
            this._clearProfile();
            if (this._pendingLink) { this._render(); return; }
            this._gateNotice = 'auth.notActive';
            this._signOutQuietly();
            this._render();
            return;
          }

          this.profile = prof;
          this._sessionFresh = true;
          this._gateNotice = null;
          this._render();

          // branch_access is only needed by editors (an admin may edit everything).
          if (prof.role === 'editor') {
            this.client.from('branch_access').select('person_id').eq('user_id', uid)
              .then(({ data, error: bErr }) => {
                if (bErr) console.warn('branch_access read error:', bErr.message || bErr);
                this.branchAccess = (data || []).map(x => x.person_id);
                this._render();
                if (this._callbacks.onProfileChange) this._callbacks.onProfileChange(prof);
              })
              .catch(e => {
                console.warn('branch_access read error:', e);
                this.branchAccess = [];
                if (this._callbacks.onProfileChange) this._callbacks.onProfileChange(prof);
              });
          } else {
            this.branchAccess = [];
            if (this._callbacks.onProfileChange) this._callbacks.onProfileChange(prof);
          }
        })
        .catch(e => {
          console.warn('profile read error:', e);
          this.profile = null;
          this._render();
        });
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
      this._failureReason = reason;
      this._render();
    },

    // Sign out without caring about the result (used when an account is not active).
    _signOutQuietly() {
      if (!this.client) return;
      try {
        this.client.auth.signOut()
          .then(({ error }) => { if (error) console.warn('sign-out failed:', error.message || error); })
          .catch(e => console.warn('sign-out failed:', e));
      } catch (e) { console.warn('sign-out failed:', e); }
    },

    /* ------------------------- sign in / out ------------------------- */
    // supabase-js RESOLVES with { data, error } — it does not reject — so each call here
    // has to turn a returned error into a rejection. We also deliberately do NOT re-render
    // while a request is in flight: that would replace the form (and the message element
    // the caller writes into) out from under the caller.
    signInWithPassword(email, password) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      this.signInLoading = true;
      return this.client.auth.signInWithPassword({ email, password })
        .then(({ data, error }) => {
          this.signInLoading = false;
          if (error) throw error;
          // A successful sign-in must surface the new session to the gate, otherwise
          // the app can stay stuck on the sign-in screen until onAuthStateChange fires
          // (which is not guaranteed in the same tick and may not fire on some flows).
          try { this.client.auth.getSession().then(s => {
            if (this._getSessionTimer) { clearTimeout(this._getSessionTimer); this._getSessionTimer = null; }
            this.initializing = false;
            this.session = (s && s.data && s.data.session) || null;
            this._sessionFresh = false;
            this._afterSession();
          }).catch(e => { console.warn('post-signIn getSession error:', e); }); } catch (e) { console.warn('post-signIn getSession call failed:', e); }
          return data;
        })
        .catch(err => {
          this.signInLoading = false;
          return Promise.reject(err);
        });
    },

    sendResetEmail(email) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      return this.client.auth.resetPasswordForEmail(email, { redirectTo: currentPageUrl() })
        .then(({ data, error }) => {
          if (error) throw error;
          return data;
        });
    },

    // Set a password from an invite / recovery link, then continue into the app.
    setNewPassword(pw, pw2) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      if (!pw || String(pw).length < 8) return Promise.reject(new Error('PASSWORD_TOO_SHORT'));
      if (pw !== pw2) return Promise.reject(new Error('PASSWORD_MISMATCH'));
      return this.client.auth.updateUser({ password: pw })
        .then(({ error }) => {
          if (error) throw error;
          this._pendingLink = null;
          stripAuthParams();
          this._clearProfile();
          // Re-read the profile: an invited account is usually still inactive, so this
          // is where the "not active yet" message comes from.
          return this._ensureProfile();
        });
    },

    signOut() {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      return this.client.auth.signOut()
        .then(({ error }) => {
          if (error) console.warn('signOut error:', error.message || error);
          this._clearProfile();
          this._render();
        });
    },

    // Kept for completeness; sign-up is admin-only now, so nothing in the UI calls it.
    signUpWithPassword(email, password, fullName) {
      if (!this.client) return Promise.reject(new Error('Auth not initialized.'));
      return this.client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email } }
      }).then(({ data, error }) => {
        if (error) throw error;
        return data;
      });
    },

    /* ------------------------- permissions (UI only) ------------------------- */
    isAdmin() {
      return !!(this.profile && this.profile.role === 'admin' && this.profile.active);
    },
    isActiveEditor() {
      return !!(this.profile && this.profile.role === 'editor' && this.profile.active);
    },
    isAdminOrActive() {
      return !!(this.profile && this.profile.active);
    },
    // Mirrors public.can_edit_person(): admin always; an editor may edit a person when
    // any branch_access entry appears in that person's ancestor-or-self chain (the
    // database stores that chain as people.path).
    canEditPerson(personId) {
      if (this.isAdmin()) return true;
      if (!this.isActiveEditor()) return false;
      if (!personId) return false;
      const path = (this._personPath && this._personPath.get) ? this._personPath.get(personId) : null;
      if (!path) return false;
      const br = new Set(this.branchAccess || []);
      return path.some(pid => br.has(pid));
    },
    setPersonPath(personId, path) {
      if (!this._personPath) this._personPath = new Map();
      this._personPath.set(personId, path || []);
    },
    clearPersonPaths() {
      this._personPath = new Map();
    },

    /* ------------------------------ UI ------------------------------ */
    _render() {
      const area = $('#authArea');
      const gate = $('#authGate');
      const ready = this.loaded && !this.initializing && !this._failureReason;
      // An invite/recovery link keeps the gate up even though the link itself signed the
      // user in — they must choose a password before they reach the app.
      const on = !!(ready && this.session && this.profile && this.profile.active && !this._pendingLink);

      // Everything outside the gate is hidden until an active user is signed in.
      if (document.body) document.body.classList.toggle('gated', !on);
      if (gate) {
        gate.hidden = on;
        if (on) gate.innerHTML = '';
        else this._renderGate();
      }

      if (!area) return;
      if (!ready) {
        area.innerHTML = '<div class="auth-spinner" title="' + esc(I18n.t('generic.loading')) + '"></div>';
        return;
      }
      if (!on) { area.innerHTML = ''; return; }

      const p = this.profile;
      const name = p.full_name || p.email || I18n.t('auth.signedIn');
      const adminBadge = this.isAdmin()
        ? ' <span class="tag gray" style="font-size:10.5px;padding:1px 6px">' + esc(I18n.t('admin.adminTag')) + '</span>'
        : '';
      area.innerHTML = `
        <div class="auth-avatar">${esc(initials(name))}</div>
        <span class="auth-name" title="${esc(name)}">${esc(name)}${adminBadge}</span>
        <button class="auth-btn" id="btnProfile" title="${esc(I18n.t('profile.title'))}" data-i18n>btnProfile</button>
        <button class="auth-btn auth-signout" id="btnSignOut" title="${esc(I18n.t('btnSignOut'))}" data-i18n>btnSignOut</button>`;
      $('#btnProfile').onclick = () => this._showProfileEdit();
      $('#btnSignOut').onclick = () => this.signOut();
      I18n.apply();
    },

    _renderGate() {
      const gate = $('#authGate');
      if (!gate) return;
      if (this._failureReason) {
        gate.innerHTML = `<div class="gate-card">
          <h2 class="gate-title">${esc(I18n.t('auth.unavailableTitle'))}</h2>
          <p class="gate-sub">${esc(I18n.fmt('auth.supabaseUnavailable', { msg: this._failureReason }))}</p>
        </div>`;
        return;
      }
      if (!this.loaded || this.initializing) { this._renderLoading('generic.loading'); return; }
      if (this._pendingLink) { this._renderSetPassword(); return; }
      if (this.session && !this.profile) { this._renderLoading('auth.verifying'); return; }
      this._renderSignIn();
    },

    _renderLoading(key) {
      const gate = $('#authGate');
      if (!gate) return;
      gate.innerHTML = `<div class="gate-card gate-center">
        <div class="auth-spinner"></div>
        <p class="gate-sub" style="margin:14px 0 0">${esc(I18n.t(key))}</p>
      </div>`;
    },

    // Sign in: email + password, show/hide, loading state, friendly errors, no sign-up.
    _renderSignIn() {
      const gate = $('#authGate');
      if (!gate) return;
      gate.innerHTML = `
        <form class="gate-card" id="signInForm" novalidate>
          <h2 class="gate-title" data-i18n>auth.signIn</h2>
          <p class="gate-sub" data-i18n>auth.signInSub</p>
          ${this._gateNotice ? `<div class="gate-notice" role="status" data-i18n>${esc(this._gateNotice)}</div>` : ''}
          <label class="edit-label" for="siEmail" data-i18n>auth.email</label>
          <input class="edit-input" id="siEmail" type="email" autocomplete="username" required>
          ${passwordField({ id: 'siPassword', labelKey: 'auth.password', autocomplete: 'current-password' })}
          <p class="gate-msg" id="gateMsg" role="alert"></p>
          <button type="submit" class="btn gate-go" id="siGo" data-i18n>auth.signIn</button>
          <button type="button" class="link gate-link" id="siForgot" data-i18n>auth.forgot</button>
        </form>`;
      I18n.apply();
      wirePasswordToggles(gate);

      const form = $('#signInForm', gate);
      const msg = $('#gateMsg', gate);
      const go = $('#siGo', gate);
      form.onsubmit = (e) => {
        e.preventDefault();
        const email = $('#siEmail', gate).value.trim();
        const password = $('#siPassword', gate).value;
        msg.className = 'gate-msg';
        msg.textContent = '';
        if (!email) { msg.className = 'gate-msg error'; msg.textContent = I18n.t('auth.emailRequired'); $('#siEmail', gate).focus(); return; }
        if (!password) { msg.className = 'gate-msg error'; msg.textContent = I18n.t('auth.passwordRequired'); $('#siPassword', gate).focus(); return; }
        go.disabled = true;
        go.textContent = I18n.t('auth.signingIn');
        this.signInWithPassword(email, password)
          .then(() => { /* the auth state change re-renders */ })
          .catch(err => {
            msg.className = 'gate-msg error';
            msg.textContent = friendlySignInError(err);
            go.disabled = false;
            go.textContent = I18n.t('auth.signIn');
          });
      };
      $('#siForgot', gate).onclick = () => this._renderForgot();
      const em = $('#siEmail', gate);
      if (em) em.focus();
    },

    // Forgot password: email a reset link back to this page.
    _renderForgot() {
      const gate = $('#authGate');
      if (!gate) return;
      this._gateNotice = null;
      gate.innerHTML = `
        <form class="gate-card" id="forgotForm" novalidate>
          <h2 class="gate-title" data-i18n>auth.forgotTitle</h2>
          <p class="gate-sub" data-i18n>auth.forgotSub</p>
          <label class="edit-label" for="fpEmail" data-i18n>auth.email</label>
          <input class="edit-input" id="fpEmail" type="email" autocomplete="username" required>
          <p class="gate-msg" id="gateMsg" role="alert"></p>
          <button type="submit" class="btn gate-go" id="fpGo" data-i18n>auth.sendReset</button>
          <button type="button" class="link gate-link" id="fpBack" data-i18n>auth.backToSignIn</button>
        </form>`;
      I18n.apply();

      const form = $('#forgotForm', gate);
      const msg = $('#gateMsg', gate);
      const go = $('#fpGo', gate);
      form.onsubmit = (e) => {
        e.preventDefault();
        const email = $('#fpEmail', gate).value.trim();
        msg.className = 'gate-msg';
        msg.textContent = '';
        if (!email) { msg.className = 'gate-msg error'; msg.textContent = I18n.t('auth.emailRequired'); return; }
        go.disabled = true;
        go.textContent = I18n.t('auth.sending');
        this.sendResetEmail(email)
          .then(() => {
            msg.className = 'gate-msg ok';
            msg.textContent = I18n.t('auth.resetSent');
            go.disabled = false;
            go.textContent = I18n.t('auth.sendReset');
          })
          .catch(err => {
            msg.className = 'gate-msg error';
            msg.textContent = friendlySignInError(err);
            go.disabled = false;
            go.textContent = I18n.t('auth.sendReset');
          });
      };
      $('#fpBack', gate).onclick = () => this._renderSignIn();
      const em = $('#fpEmail', gate);
      if (em) em.focus();
    },

    // Invite / password-recovery: choose a password, then continue into the app.
    _renderSetPassword() {
      const gate = $('#authGate');
      if (!gate) return;
      const invited = this._pendingLink === 'invite';
      gate.innerHTML = `
        <form class="gate-card" id="setPwForm" novalidate>
          <h2 class="gate-title" data-i18n>${invited ? 'auth.setPasswordInvite' : 'auth.setPassword'}</h2>
          <p class="gate-sub" data-i18n>${invited ? 'auth.setPasswordInviteSub' : 'auth.setPasswordSub'}</p>
          ${passwordField({ id: 'npPassword', labelKey: 'auth.newPassword', autocomplete: 'new-password' })}
          ${passwordField({ id: 'npConfirm', labelKey: 'auth.confirmPassword', autocomplete: 'new-password' })}
          <p class="gate-hint" data-i18n>auth.minChars</p>
          <p class="gate-msg" id="gateMsg" role="alert"></p>
          <button type="submit" class="btn gate-go" id="npGo" data-i18n>auth.savePassword</button>
        </form>`;
      I18n.apply();
      wirePasswordToggles(gate);

      const form = $('#setPwForm', gate);
      const msg = $('#gateMsg', gate);
      const go = $('#npGo', gate);
      form.onsubmit = (e) => {
        e.preventDefault();
        const pw = $('#npPassword', gate).value;
        const pw2 = $('#npConfirm', gate).value;
        msg.className = 'gate-msg';
        msg.textContent = '';
        if (!pw || pw.length < 8) { msg.className = 'gate-msg error'; msg.textContent = I18n.t('auth.pwTooShort'); return; }
        if (pw !== pw2) { msg.className = 'gate-msg error'; msg.textContent = I18n.t('auth.pwMismatch'); return; }
        go.disabled = true;
        go.textContent = I18n.t('auth.saving');
        this.setNewPassword(pw, pw2)
          .then(() => {
            msg.className = 'gate-msg ok';
            msg.textContent = I18n.t('auth.pwSaved');
          })
          .catch(err => {
            const raw = (err && err.message) || String(err);
            msg.className = 'gate-msg error';
            msg.textContent = raw === 'PASSWORD_TOO_SHORT' ? I18n.t('auth.pwTooShort')
              : raw === 'PASSWORD_MISMATCH' ? I18n.t('auth.pwMismatch')
              : I18n.fmt('auth.pwFailed', { msg: raw });
            go.disabled = false;
            go.textContent = I18n.t('auth.savePassword');
          });
      };
      const first = $('#npPassword', gate);
      if (first) first.focus();
    },

    /* ---------- Profile edit (own name + language) ---------- */
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
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--ink-2)" data-i18n>${
            isAdmin ? 'admin.editUsersNote' : 'admin.editUsersNoteNonAdmin'}</p>
          ${!isActive ? `<div style="margin:0 0 12px;padding:8px 12px;background:var(--female-soft);color:var(--female);border-radius:8px;font-size:12.5px" data-i18n>admin.accountInactive</div>` : ''}
          <div class="auth-field">
            <label class="edit-label" for="peName" data-i18n>profile.nameLabel</label>
            <input id="peName" type="text" value="${esc(currentName)}" class="edit-input">
          </div>
          <div class="auth-field" style="margin-top:8px">
            <label class="edit-label" for="peLang" data-i18n>profile.langLabel</label>
            <select id="peLang" class="edit-input">
              <option value="en" ${currentLang === 'en' ? 'selected' : ''} data-i18n>profile.lang.en</option>
              <option value="ur" ${currentLang === 'ur' ? 'selected' : ''} data-i18n>profile.lang.ur</option>
              <option value="hi" ${currentLang === 'hi' ? 'selected' : ''} data-i18n>profile.lang.hi</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn" id="peCancel" style="flex:1" data-i18n>profile.cancel</button>
            <button class="btn" id="peGo" style="flex:2;background:var(--accent);color:#fff;border-color:var(--accent)" data-i18n>profile.save</button>
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
            const msg = (err && err.message) || String(err);
            panel.querySelector('#peMsg').textContent = /forbids|permission/i.test(msg)
              ? I18n.t('admin.profilePermError')
              : I18n.fmt('admin.profileFailed', { msg: msg });
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
      const uid = this.session && this.session.user ? this.session.user.id : null;
      if (!uid) return Promise.reject(new Error('Not signed in.'));
      return this.client.from('profiles').update(fields).eq('id', uid)
        .then(({ error }) => {
          if (error) throw error;
          this._sessionFresh = false;
          return this._ensureProfile();
        });
    }
  };

  // exposed for app.js
  window.Auth = Auth;

  // small inline styles for the profile modal (hoisted once)
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
