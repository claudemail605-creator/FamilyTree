/* =====================================================================
   i18n scaffolding (Phase 8)
   - Provides a translation dictionary for en / ur / hi.
   - I18n.t(key) returns the current-language string (falls back to English).
   - I18n.setLanguage(lang) changes the language and re-applies [data-i18n]
     attributes across the page.
   - I18n.apply() updates all elements with a data-i18n attribute (text content)
     or data-i18n-attr attribute (sets an attribute) to the current language.
   - The dictionary is a starting point — cover the most visible strings.
     Add keys as needed; missing keys fall back to the English value (the key
     itself is returned if no English entry exists, so you can spot gaps).
   ===================================================================== */

(function () {
  'use strict';

  const I18N = {
    en: {
      // top bar
      'brand.title': 'Family Tree',
      'brand.subtitle': '{n} members · {g} generations · from {source}',
      'btnSignIn': 'Sign in',
      'btnSignUp': 'Create account',
      'btnSignOut': 'Sign out',
      'btnProfile': 'Profile',
      'btnTheme': 'Toggle dark mode',
      'btnFilters': 'Toggle filters',
      'btnAdmin': 'Admin panel',
      'btnReset': 'Reset all',
      'btnOpenExcel': 'Open Excel',
      // view switch
      'view.tree': 'Tree',
      'view.table': 'Table',
      // sidebar
      'sidebar.filters': 'Filters',
      'label.generation': 'Generation',
      'label.gender': 'Gender',
      'label.status': 'Status',
      'status.everyone': 'Everyone',
      'status.living': 'Living / no death recorded',
      'status.deceased': 'Deceased',
      'label.branch': 'Branch (descendants of…)',
      'label.pob': 'Place of birth',
      'label.qual': 'Qualification',
      'label.has': 'Record has',
      'has.anything': 'Anything',
      'has.dob': 'Date of birth',
      'has.spouse': 'Spouse',
      'has.children': 'Children',
      'has.nochildren': 'No children recorded',
      // chips
      'chip.gen': 'Gen {g}',
      'chip.male': 'Male',
      'chip.female': 'Female',
      // tree stage
      'legend.male': 'Male',
      'legend.female': 'Female',
      'legend.deceased': 'Deceased',
      'legend.hint': 'Drag to pan · scroll to zoom · hover or click a person for details',
      'empty.msg': 'No one matches these filters.',
      // controls
      'zoom.in': 'Zoom in',
      'zoom.out': 'Zoom out',
      'zoom.fit': 'Fit to screen',
      'expand.all': 'Expand all',
      'collapse.all': 'Collapse all',
      'tg.expand': 'Expand',
      'tg.collapse': 'Collapse',
      // tooltip
      'tooltip.more': 'Click for full details',
      'tooltip.spouseMore': 'Click for {name}’s full details',
      // panel
      'panel.close': 'Close',
      'panel.edit': 'Edit',
      'panel.editTitle': 'Edit {name}',
      'panel.editSub': 'Generation {gen} · {gender}',
      'panel.addChild': 'Add child',
      'panel.addChildTitle': 'Add child of {name}',
      'panel.addChildSub': 'The new person\'s generation is calculated from the tree.',
      'panel.addChildOf': 'Adding a child under {name} (Generation {gen}). Children are inserted immediately — there is no approval step.',
      'panel.cancel': 'Cancel',
      'panel.save': 'Save changes',
      'panel.addGo': 'Add child',
      'panel.requestDeletion': 'Request deletion',
      'panel.requestDeletionTitle': 'Request deletion of {name}',
      'panel.requestDeletionSub': 'This request goes to an admin for approval. You cannot delete people directly — only admins can soft-delete.',
      'panel.requestDeletionNote': 'Your request will be reviewed by an admin. You\'ll be able to see its status in the admin panel.',
      'panel.deletionReason': 'Reason',
      'panel.deletionReasonPlaceholder': 'e.g. Duplicate record, outdated information, or this person shouldn\'t be in the tree.',
      'panel.submitRequest': 'Submit request',
      'panel.softDelete': 'Soft-delete this person',
      'panel.restore': 'Restore (undo deletion)',
      'panel.viewAudit': 'View audit log',
      'panel.personal': 'Personal',
      'panel.family': 'Family',
      'panel.passing': 'Passing',
      'panel.relatives': 'Relatives',
      'panel.record': 'Record',
      'panel.noDetails': 'No further details recorded.',
      'panel.parent': 'Parent',
      'panel.siblings': 'Siblings ({n})',
      'panel.children': 'Children ({n})',
      'panel.nick': '“{nick}”',
      'panel.genderUnknown': 'Gender unknown',
      'panel.deceased': 'Deceased',
      'panel.deleted': 'Deleted',
      'panel.legacy': 'legacy {id}',
      'panel.nameUr': 'Name (Urdu)',
      'panel.nameHi': 'Name (Hindi)',
      // edit form
      'edit.fullName': 'Full name',
      'edit.nickname': 'Nickname',
      'edit.gender': 'Gender',
      'edit.father': 'Father\'s name',
      'edit.mother': 'Mother\'s name',
      'edit.spouse': 'Spouse',
      'edit.spouseFather': 'Spouse\'s father',
      'edit.dob': 'Date of birth',
      'edit.dobText': 'DOB (original text)',
      'edit.pob': 'Place of birth',
      'edit.qual': 'Qualification',
      'edit.dod': 'Date of death',
      'edit.dodText': 'DOD (original text)',
      'edit.burial': 'Place of burial',
      'edit.nameUr': 'Name (Urdu script)',
      'edit.nameHi': 'Name (Hindi / Devanagari)',
      'edit.notes': 'Notes',
      'edit.required': '*',
      'edit.datePlaceholder': 'YYYY-MM-DD (or leave blank)',
      'edit.textareaPlaceholder': 'Optional — free text.',
      'edit.genderRequired': 'Gender must be Male or Female.',
      'edit.fullNameRequired': 'Full name is required.',
      'edit.invalidDate': '"{field}" is not a valid date.',
      // save / submit feedback
      'save.changesSaved': 'Changes saved.',
      'save.added': 'Added {name}.',
      'save.requestSubmitted': 'Deletion request submitted. An admin will review it.',
      'save.deleted': 'Person soft-deleted.',
      'save.restored': 'Person restored.',
      'save.permError': 'You don\'t have permission to edit this person.',
      'save.notConnected': 'Not connected to Supabase — can\'t save.',
      'save.notConnectedAdd': 'Not connected to Supabase — can\'t add a child.',
      'save.notConnectedDelete': 'Not connected to Supabase.',
      'save.moveError': 'You can\'t change a person\'s parent here — only an admin can move people.',
      'save.deleteRestoreError': 'Only an admin can delete or restore people.',
      'save.foreignKeyError': 'That change would break the family links — check the parent ID.',
      'save.saveFailed': 'Couldn\'t save: {msg}',
      'save.addFailed': 'Couldn\'t add the child: {msg}',
      'save.deleteRequestFailed': 'Couldn\'t submit the request: {msg}',
      'save.expiredSession': 'Your sign-in expired — please sign in again.',
      'save.tableNotFound': 'The people table wasn\'t found — check your Supabase project.',
      'save.supabaseFailed': 'Couldn\'t load the tree from Supabase: {msg}',
      // admin panel
      'admin.title': 'Admin panel',
      'admin.subtitle': 'Manage branch access, deletion requests, and profiles.',
      'admin.branchAccess': '1. Branch access (who can edit what)',
      'admin.deletionRequests': '2. Deletion requests',
      'admin.profiles': '3. Profiles (users)',
      'admin.noUsers': 'No user accounts yet.',
      'admin.noBranches': 'No branches assigned — this editor can\'t edit anyone.',
      'admin.assignBranch': 'Assign branch for',
      'admin.pickPerson': 'Pick a person…',
      'admin.add': 'Add',
      'admin.remove': 'Remove',
      'admin.branchAssigned': 'Branch assigned.',
      'admin.branchRemoved': 'Branch removed.',
      'admin.duplicateBranch': 'That editor already has that branch.',
      'admin.permError': 'You don\'t have permission to change branch access.',
      'admin.loadFailed': 'Couldn\'t load branch access: {msg}',
      'admin.noRequests': 'No deletion requests.',
      'admin.requestsTotal': '{n} request{s} total · showing newest first.',
      'admin.requestPerson': 'Requested by {by} · {when}',
      'admin.requestResolved': 'Resolved {when}',
      'admin.approve': 'Approve (delete)',
      'admin.reject': 'Reject',
      'admin.requestPending': 'pending',
      'admin.requestApproved': 'Deletion request approved — person soft-deleted.',
      'admin.requestRejected': 'Deletion request rejected.',
      'admin.resolveFailed': 'Couldn\'t resolve the request: {msg}',
      'admin.noProfiles': 'No user accounts yet.',
      'admin.profileRole': 'Role',
      'admin.profileLang': 'Lang',
      'admin.profileActive': 'Active',
      'admin.profileSave': 'Save',
      'admin.profileUpdated': 'Profile updated.',
      'admin.profilePermError': 'You don\'t have permission to change that profile.',
      'admin.profileFailed': 'Couldn\'t update profile: {msg}',
      'admin.inactiveTag': 'inactive',
      'admin.adminTag': 'admin',
      'admin.pendingActivationTag': 'pending activation',
      'admin.editUsersNote': 'You are an admin. You can also edit users in the Admin panel.',
      'admin.editUsersNoteNonAdmin': 'An admin can also edit your role and active status from the Admin panel.',
      'admin.accountInactive': 'Your account hasn\'t been activated by an admin yet. You can sign in, but you won\'t be able to edit the tree until an admin activates you.',
      // profile edit
      'profile.title': 'Your profile',
      'profile.nameLabel': 'Your full name',
      'profile.langLabel': 'Language',
      'profile.lang.en': 'English',
      'profile.lang.ur': 'Urdu',
      'profile.lang.hi': 'Hindi',
      'profile.save': 'Save',
      'profile.cancel': 'Cancel',
      'profile.updated': 'Profile updated.',
      'profile.nameRequired': 'Enter your full name.',
      // table
      'table.col.id': 'ID',
      'table.col.legacyId': 'Legacy ID',
      'table.col.name': 'Full name',
      'table.col.nick': 'Nickname',
      'table.col.gen': 'Gen',
      'table.col.gender': 'Gender',
      'table.col.father': 'Father',
      'table.col.mother': 'Mother',
      'table.col.spouse': 'Spouse',
      'table.col.spouseFather': 'Spouse\'s father',
      'table.col.dob': 'Date of birth',
      'table.col.dobText': 'DOB (original text)',
      'table.col.pob': 'Place of birth',
      'table.col.qual': 'Qualification',
      'table.col.dod': 'Date of death',
      'table.col.dodText': 'DOD (original text)',
      'table.col.burial': 'Place of burial',
      'table.col.nameUr': 'Name (Urdu)',
      'table.col.nameHi': 'Name (Hindi)',
      'table.col.notes': 'Notes',
      'table.col.photo': 'Photo',
      'table.col.source': 'Source file',
      'table.col.deleted': 'Deleted?',
      'table.resultCount.all': 'Showing all {n} people',
      'table.resultCount.filtered': 'Showing {shown} of {n} people',
      // stats
      'stats.people': 'People',
      'stats.generations': 'Generations',
      'stats.deceased': 'Deceased',
      // sign-in modal
      'signin.title': 'Sign in',
      'signin.subtitle': 'Use the email + password you were given.',
      'signin.email': 'Email',
      'signin.password': 'Password',
      'signin.cancel': 'Cancel',
      'signin.go': 'Sign in',
      'signin.signingIn': 'Signing in…',
      'signin.msg.empty': 'Enter your email and password.',
      'signin.msg.invalid': 'That email and password didn\'t work.',
      'signin.msg.notConfirmed': 'Check your email for a confirmation link before signing in.',
      'signin.msg.notActive': 'Your account hasn\'t been activated by an admin yet.',
      'signin.msg.failed': 'Sign-in failed: {msg}',
      // sign-up modal
      'signup.title': 'Create account',
      'signup.subtitle': 'An admin will need to activate your account before you can edit.',
      'signup.email': 'Email',
      'signup.name': 'Your full name (optional)',
      'signup.password': 'Password (at least 6 characters)',
      'signup.cancel': 'Cancel',
      'signup.go': 'Create account',
      'signup.creating': 'Creating account…',
      'signup.msg.empty': 'Enter your email and a password (at least 6 characters).',
      'signup.msg.short': 'Password must be at least 6 characters.',
      'signup.msg.taken': 'That email is already in use.',
      'signup.msg.weak': 'Choose a stronger password.',
      'signup.msg.failed': 'Account creation failed: {msg}',
      'signup.done': 'Account created. Look for a confirmation email, then sign in. An admin must activate your account before you can edit.',
      // generic
      'generic.loading': 'Loading…',
      'generic.notConnected': 'Not connected to Supabase.',
      'generic.loadFailed': 'Couldn\'t load: {msg}',
      'generic.noData': 'No data found – use “Open Excel”',
      'generic.noDataToast': 'No data found. Click “Open Excel” to load your file.',
      'generic.supabaseUnavailable': 'Supabase not available: {msg} — showing the static tree.',
      'generic.supabaseUnavailableToast': 'Supabase tree unavailable — showing the Excel tree instead.',
      'generic.emptyTree': 'The Supabase tree is empty.',
      'generic.filtersCleared': 'Filters cleared to show that person',
      'search.placeholder': 'Search name, nickname, spouse, place…',
      'generic.closePanel': 'Close',
    },

    ur: {
      'brand.title': 'خاندان کا درخت',
      'btnSignIn': 'لاگ ان',
      'btnSignUp': 'اکاؤنٹ بنائیں',
      'btnSignOut': 'لاگ آUT',
      'btnProfile': 'پروفائل',
      'btnTheme': 'ڈارک موڈ',
      'btnFilters': 'فلٹر',
      'btnAdmin': 'ایڈمین پینل',
      'btnReset': 'سب反映 임기만료',
      // Keep a few obvious ones; rest fall back to English. This is scaffolding.
      'sidebar.filters': 'فلٹر',
      'label.generation': 'نسل',
      'label.gender': 'جنس',
      'label.status': 'สถานะ',
      'status.everyone': 'सभी',
      'panel.edit': 'ترمیم',
      'panel.save': 'ب 기후',
      'panel.cancel': 'رद्द',
      'panel.close': 'بند کریں',
      'panel.personal': 'شخصی',
      'panel.family': 'خاندانی',
      'panel.passing': 'وفات',
      'panel.relatives': 'رشتہ دار',
      'panel.record': 'ریکارڈ',
      'profile.lang.en': 'انگریزی',
      'profile.lang.ur': 'اردو',
      'profile.lang.hi': 'ہندی',
      'search.placeholder': 'نام، لقب، شوہر، جگہ تلاش کریں…',
    },

    hi: {
      'brand.title': 'पारिवारिक वृत्त',
      'btnSignIn': 'साइन इन',
      'btnSignUp': 'अकाउंट बनाएं',
      'btnSignOut': 'साइन आउट',
      'btnProfile': 'प्रोफ़ाइल',
      'btnTheme': 'डार्क मोड',
      'btnFilters': 'फ़िल्टर',
      'btnAdmin': 'एडमिन पैनल',
      'btnReset': 'हरा د edilmiştir',
      // scaffolding — partial; rest falls back to English.
      'sidebar.filters': 'फ़िल्टर',
      'label.generation': 'पीढ़ी',
      'label.gender': 'लिंग',
      'label.status': 'स्थिति',
      'status.everyone': 'सभी',
      'panel.edit': 'संपादित करें',
      'panel.save': 'सहेजें',
      'panel.cancel': 'रद्द',
      'panel.close': 'बंद करें',
      'panel.personal': 'व्यक्तिगत',
      'panel.family': 'पारिवारिक',
      'panel.passing': 'निधन',
      'panel.relatives': 'रिश्तेदार',
      'panel.record': 'रिकॉर्ड',
      'profile.lang.en': 'अंग्रेज़ी',
      'profile.lang.ur': 'उर्दू',
      'profile.lang.hi': 'हिंदी',
      'search.placeholder': 'नाम, उपनाम, पति, स्थान खोजें…',
    }
  };

  let currentLang = 'en';

  // Try to pick up the user's stored language preference from Auth (profile.language)
  // if Auth is available at module load time. app.js / auth.js call setLanguage later
  // when the profile is known.
  function detectLanguage() {
    if (typeof window.Auth === 'object' && window.Auth && window.Auth.profile) {
      const l = window.Auth.profile.language;
      if (l && I18N[l]) return l;
    }
    return null;
  }

  if (detectLanguage()) currentLang = detectLanguage();

  function t(key) {
    const dict = I18N[currentLang] || I18N.en;
    if (dict[key] != null) return dict[key];
    if (I18N.en[key] != null) return I18N.en[key];
    return key;
  }

  // Interpolation helper used by app.js/auth.js for messages with placeholders.
  function fmt(key, params) {
    let v = t(key);
    if (params) {
      for (const k in params) {
        v = v.replace('{' + k + '}', params[k] != null ? String(params[k]) : '');
      }
    }
    return v;
  }

  function setLanguage(lang) {
    if (!I18N[lang]) lang = 'en';
    currentLang = lang;
    apply();
    // persist so a reload keeps the choice (optional)
    try { localStorage.setItem('ft-lang', lang); } catch (e) { /* ignore */ }
  }

  function apply() {
    // Update text content of elements with data-i18n (use the key as the attribute value).
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const v = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('data-i18n-placeholder')) el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        else el.value = v;
      } else {
        el.textContent = v;
      }
    });
    // Update attributes named in data-i18n-attr (e.g. data-i18n-attr="title" with data-i18n="key").
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const attr = el.getAttribute('data-i18n-attr');
      const key = el.getAttribute('data-i18n');
      const v = t(key);
      if (attr && key) el.setAttribute(attr, v);
    });
    // Update the document lang attribute for accessibility / CSS.
    document.documentElement.lang = currentLang;
  }

  // Expose a small API.
  window.I18n = {
    t,
    fmt,
    setLanguage,
    apply,
    currentLang: () => currentLang,
    languages: ['en', 'ur', 'hi']
  };
})();
