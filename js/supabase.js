/* =====================================================================
   Supabase client (Phase 1)
   Creates ONE client for the whole app from js/config.js and exposes it as
   window.SupabaseClient. Only the Project URL and the anon/publishable key are
   used here — the service_role key must never appear in website code.

   Session handling is explicitly enabled:
     persistSession      keep the session across page reloads (localStorage)
     autoRefreshToken    refresh the access token in the background
     detectSessionInUrl  parse invite / password-recovery links on load

   It also captures the auth-link parameters BEFORE supabase-js consumes and
   strips them from the URL, so the UI can still show the "Set your password"
   form after the hash is gone.
   ===================================================================== */

(function () {
  'use strict';

  // Read the auth-link type from the address bar. Supabase puts it in the hash
  // (#access_token=…&type=invite) or, with PKCE, in the query (?type=recovery&code=…).
  function readAuthParams() {
    const raw = (location.hash || '').replace(/^#/, '') || (location.search || '').replace(/^\?/, '');
    const p = new URLSearchParams(raw || '');
    return {
      type: (p.get('type') || '').toLowerCase() || null,
      error: p.get('error_code') || p.get('error') || null
    };
  }

  window.AUTH_LINK = readAuthParams();

  function create() {
    const cfg = window.APP_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('js/config.js must define window.APP_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY }.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('The Supabase JS UMD did not load (window.supabase.createClient is missing). Check the CDN script in index.html.');
    }
    if (/supabase\.com\/dashboard/.test(cfg.SUPABASE_URL)) {
      throw new Error('SUPABASE_URL points at a dashboard page. Use the Project URL — https://<project-ref>.supabase.co');
    }
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  try {
    window.SupabaseClient = create();
  } catch (e) {
    window.SupabaseClient = null;
    window.SUPABASE_INIT_ERROR = e.message;
    console.warn('Supabase client could not be created:', e.message);
  }
})();
