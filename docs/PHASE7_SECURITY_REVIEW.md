# Phase 7 — security and quality review

**Project:** Family Tree website (`index.html` + `js/` + `css/`), Supabase project `quszbgvdurbbotrnbuii`
**Reviewed:** 13 October 2026, against the live database (32 people, 1 admin account)
**Reviewed by:** automated review run from this workspace — every claim below is either a
command whose output is quoted or a browser action that was actually performed.

Re-run the two repeatable checks any time:

```bash
node tools/scan_security.cjs        # secrets, escaping, what the browser writes
node tools/scan_i18n_quality.cjs    # translation key parity and leftovers
for f in js/*.js sw.js; do node --check "$f"; done
```

The database tests were run as SQL inside `begin; … rollback;` blocks, so none of them
left a trace. `database/01_schema.sql` was **not** modified by this review.

---

## 1. Secrets

| Check | Result |
| --- | --- |
| `tools/scan_security.cjs` — secret patterns in `js/*.js`, `index.html`, `sw.js`, `manifest.webmanifest` | nothing flagged |
| `js/config.js` contents | `SUPABASE_URL` and `SUPABASE_ANON_KEY` only (the URL + the publishable key, which is meant to be public) |
| service-role key anywhere in the website | not present. It appears only in comments and inside `supabase/functions/admin-users/index.ts`, which reads it from its own server-side environment |
| personal data hard-coded in the shipped files | none. The tree is read from the database; the old embedded copy (`js/data.js`) is gone, and the browser never loads `data/Master_Family_Tree_Database.xlsx` |
| passwords in the repo | none |

`SITE_URL` (used for invitation and reset links) is a function secret, not a file.

## 2. What the browser writes

18 write call sites, all through `supabase-js` with the signed-in user's token:

| File | Table | Columns |
| --- | --- | --- |
| `js/personform.js` | `people` | the whitelist in `ALL_FIELDS` + `parent_id` on insert; on update only the fields that changed |
| `js/app.js` | `people` | `is_deleted` (admin soft-delete / restore) |
| `js/app.js` | `deletion_requests` | `person_id`, `reason` (an editor asking) |
| `js/app.js` | `profiles` | `language` (the user's own row) |
| `js/auth.js` | `profiles` | `full_name` (the user's own row) |
| `js/photos.js` | `people` | `photo_path`, then the Storage object |
| `js/admin.js` | `profiles` | `full_name`, `role`, `active` (admin editing another account) |
| `js/admin.js` | `branch_access` | `user_id`, `person_id` (admin) |
| `js/admin.js` | `people` | `is_deleted` (approve a deletion request), and the import's insert/update |
| `js/admin.js` | `deletion_requests` | `status`, `resolved_by`, `resolved_at` (admin) |

**Never sent by the app:** `path`, `created_by`, `updated_by`, `legacy_id` (except the
admin import, which matches rows by it), `role`/`active` (except the admin screen, where
the database only allows it for an admin).

What the database does with a tampered client, verified by sending the forbidden columns
directly from the browser console on the signed-in session:

* `path` — **ignored and recomputed.** The row came back with its true path
  (`[root, parent, self]`), not the forged one.
* `created_by` — accepted (an admin is trusted), so the audit row shows the change.
* `legacy_id` — accepted for an **admin** (the guard preserves it only for non-admins).
  The probe proved it: the row was temporarily changed and then restored from the
  `old_data` in `audit_log` (the full original row is available there for exactly this).

> **Recommendation (not applied):** widen the `people_guard` trigger so `legacy_id`,
> `created_by` and `created_at` are preserved for everyone, admin included, and let the
> import write them through a `security definer` function instead. Today an admin (and
> only an admin) can rename a legacy ID from a tampered page.

## 3. Escaping

* `tools/scan_security.cjs` found **10 interpolations inside HTML sinks and 0 without an
  obvious `esc()`** — and that count is after tightening the check to accept `esc(…)`
  anywhere inside the expression.
* Names, nicknames, places, notes, error messages, audit values and search text all go
  through `esc()` (or `textContent`/`dataset`, which cannot be parsed as HTML).
* The tooltip, the table, the detail panel, the audit history and the admin screens were
  re-rendered with the real family data (Urdu and Hindi names included, which contain
  text that would break naive quoting) and displayed correctly.

## 4. Permissions — proved, not assumed

The database-level test acted as a **one-branch editor** (the admin account with
`role='editor'` and `branch_access` = `B001` only), inside a rolled-back transaction:

| # | Attempt | Result | Wanted |
| --- | --- | --- | --- |
| A | read the tree | 32 rows | yes — reading is open to every active user |
| B | edit a person outside the branch (`B021-001`) | **0 rows** | 0 |
| C | edit a person inside the branch (`B011-001`) | **1 row** | 1 |
| D | move a person to a different parent | `BLOCKED: Only an admin can move a person to a different parent` | blocked |
| E | soft-delete a person | `BLOCKED: Only an admin can delete or restore people — use a deletion request` | blocked |
| F | add a child under their own branch | **1 row** | 1 |
| G | add a child under another branch | `new row violates row-level security policy` | blocked |
| H | create a root person | `new row violates row-level security policy` | blocked |
| I | promote themselves to admin | row updated, but the stored role came back **`editor`** — `profiles_guard` reverted it | no change |
| J | hard-delete a person | **0 rows** | 0 |
| K | read the tree with an **inactive** account | **0 rows** | 0 |

From the browser console, with the public key and **no session** (what a signed-out
visitor has): `select` on `people` and `profiles` both fail with
`42501 permission denied for table …`. There is no anonymous read path at all.

Summary: an active user can read; an editor can add and edit only inside their branch and
cannot move, delete or promote; an admin can do everything the app needs; an inactive or
signed-out user sees nothing.

## 5. Sign-in, invitations and sign-out

* Sign-in, "forgot password", and the invite/set-password screens are present, translated
  and reachable; the auth gate hides the whole app until an **active** profile exists.
* `AUTH_LINK` captures the `type=invite|recovery` parameters before `supabase-js` strips
  them, so the "set your password" form still appears after the redirect; an expired or
  reused link shows the "this link has expired" message.
* Sign-out calls `clearTree()`, which drops the people, the detail panel, the table, the
  filters, the realtime channel and the photo cache, so a second account cannot inherit
  the first one's data.
* **Not yet exercisable:** the invitation / resend / temporary-password buttons, because
  the `admin-users` Edge Function is not deployed (see §8).

## 6. Keyboard, focus, mobile, RTL and fonts

* Focus: every input/select shows a ring (`border-color` + `box-shadow` on `:focus`); a
  global `:focus-visible { outline: 2px solid var(--accent) }` was added during this
  review so buttons and cards also show one. A `Tab` from the page start lands on the
  mobile menu button; the language picker closes on `Escape` and on an outside click.
* 360 px width: the layout collapses to the tree plus a 300 px filter drawer that the ☰
  button slides in (verified), and the detail panel moves under the tree. The top bar
  wraps into three rows at that width — cosmetic, not broken.
* RTL: with Urdu active, `<html dir="rtl">` mirrors the sidebar (right), panel (left),
  table direction and tooltips; the tree canvas keeps `direction: ltr` so cards and
  connector lines do not move. Verified by screenshot at 1440 px and 360 px.
* Fonts: Noto Naskh Arabic for Urdu and Noto Sans Devanagari for Hindi are loaded **only**
  when that language is active (`document.fonts` shows them loaded, and the computed
  `font-family` of `h1`/`body` switches accordingly).
* Dark mode toggle works and is remembered in `localStorage`.

## 7. Bugs found in this review and fixed

| Where | Bug | Fix |
| --- | --- | --- |
| `js/personform.js` | clicking **Edit** threw `TypeError: Cannot read properties of null (reading 'mode')` — the dialog never opened | `render()` no longer calls `close()` (which cleared the state it was about to read) |
| `js/personform.js` | the form read the tree model's short field names as if they were column names, so Full name, Nickname, father/mother, spouse, place of birth, qualification, burial and the dates opened **empty** — and saving would have written the blanks back over the family's data | a model-key → column-name map, plus `dob_iso` / `dod_iso` for the date inputs |
| `js/personform.js` | typing into the form never reached `state.values`, so Save sent the values the dialog opened with | `collect()` on `input`/`change`, and once more at the start of `save()` |
| `js/personform.js` | an existing photo could not be removed: the Remove button stayed hidden, and clearing a picked file did not delete the stored object | `state.removePhoto` + `Photos.remove()` on save, button visible for a stored photo, "nothing changed" early-return fixed |
| `js/app.js` | the date of birth was passed to the dialog in display form (`01/03/1970`), which an `<input type=date>` rejects | `dob_iso` / `dod_iso` kept alongside the display value |
| `js/app.js` | filter controls built in JavaScript were never translated (`Gen 0`, `Male`/`Female`, `Whole family`, `Any place`, `Any qualification`) — visible in Urdu | they now use the i18n keys, including a new `filter.*` group |
| `js/app.js` | a failed or empty load left a blank screen with a 3-second toast | a persistent banner with the reason and a **Try again** button, plus a clearer `source.supabase` subtitle ("from your live database (Supabase)") |
| `js/i18n.js` | the search box kept its English placeholder in every language (`data-i18n-placeholder` on an element with no `data-i18n` was never visited) | a dedicated placeholder pass in `apply()` |
| `js/i18n.js` | ~82 Urdu/Hindi strings were machine-ish or wrong (transliterated "ایڈمین" for admin, "رکنات" for people, "ایگے"/"نیچے" for zoom in/out, `نکالنے ک nothing.`, `یہ لنک ... ایک نیا ون مانگیں`, a Hindi sentence containing the English word "outdated"), and the old "Open Excel / static tree" fallback text was still shown | all rewritten by hand and re-scanned; `scan_i18n_quality.cjs` now reports **577 keys in each language, 0 missing** |
| `js/extras.js` | the "how are we related" path printed the two branches interleaved (`A → … → root → … → B` came out as `root → A → B-reversed`) | the chain is now walked A → up → common ancestor → down → B, tested on siblings, cousins and a grandparent |
| `js/extras.js` | the printed header said "from Supabase" in every language | uses the same translated source label as the subtitle |
| `js/admin.js` | `isoDate()` accepted `1985-13-45` (bad month and day) as a real date | day/month validated before it is used; 9 date cases unit-checked |
| `js/admin.js` | every partial date in the spreadsheet ("1970", "1965 (approx)") was reported as a **problem** in the import preview | only a value *shaped* like a full date that is not one is flagged |
| `js/admin.js` | the Users table showed "Last sign-in: **never**" for everyone when the admin function is not deployed — a lie, since the browser cannot read `auth.users` | shows "unknown" unless the function answered |
| `css/style.css` | no global keyboard focus ring | `:focus-visible` added |
| `sw.js` | the service-worker shell list was missing `icons/icon-maskable-512.png` | added, cache version bumped to `family-tree-shell-v3` |
| `tools/build_seed_sql.cjs` | read `js/data.js`, which was deleted when the tree moved to Supabase, so the documented `node tools/build_seed_sql.cjs` failed outright — the spreadsheet could not be turned back into SQL at all | the script now reads the `.xlsx` itself (a small zip + XML reader, Node only, no dependencies) and reproduces the checked-in `database/04_seed_from_excel.sql` byte for byte; verified stable across repeated runs, and it gained `--out`, `--sheet` and `FT_XLSX` |
| `index.html` | a comment claimed the Excel import had been removed while the admin screen still has it | comment corrected |

Nothing in this list weakened a check, skipped a test or suppressed an error.

## 8. Open items

1. **The `admin-users` Edge Function is not deployed.** Until it is, the Admin → Users tab
   can list accounts and change roles, branches and the active flag (the database allows
   an admin to do that), but *Add family member account*, *Resend invite* and *Set
   temporary password* answer "not deployed yet". The function itself was reviewed: it
   verifies the caller's JWT, requires `role='admin' AND active=true`, keeps the
   service-role key server-side, never returns it, refuses to let an admin remove their
   own admin role, deactivate themselves or set their own password, and answers with
   codes only (401/403/400/500). Deploy commands are in its README.
   *Minor notes:* when `SITE_URL` is unset the CORS fallback becomes `*` (the endpoint is
   JWT-authenticated, so this is not a data leak, but setting `SITE_URL` is recommended),
   and `temporaryPassword()` uses a modulo over the alphabet, which is very slightly
   biased — use rejection sampling if you care.
2. **The privacy option is a proposal, not applied.** `database/04_privacy.sql` was
   rewritten during this review because the first version could not have worked:
   `revoke select (dob, dod) …` has no effect while a table-wide `SELECT` grant exists
   (the table grant has to go first, and every other column has to be granted back), and
   the `people_visible` view it proposed would have **bypassed row level security**
   entirely, because a view is executed as its owner and the owner bypasses RLS — every
   reader would have seen every row, deleted people included. The replacement keeps RLS
   intact and hands dates out through two `security definer` functions that re-apply the
   visibility rules themselves. It still needs (a) your go-ahead and (b) the app changes
   listed at the bottom of that file.
3. **The spreadsheet and the live database describe two different families.**
   The database currently holds 32 people starting at **Syed Mazharuddin Nahri**
   (`source` column: `Setup sheet (anchor placeholder)`, `A011_Familytree.xlsx`,
   `B0xx_Familytree.xlsx`) — and the website shows exactly those 32.
   `data/Master_Family_Tree_Database.xlsx`, `database/04_seed_from_excel.sql` and the old
   `Shijrah` site describe a different set of **38** people starting at **Syed Azeemuddin
   Nahri**. Running that seed now would add a second family tree next to the first one.
   **Decide which spreadsheet is authoritative before importing anything.**
4. **Not verified** (and not claimed): invitation and password-reset emails end-to-end
   (needs the function deployed), a real second account signing in through the UI (the
   permission rules were proved at the database level instead), and iOS Safari behaviour.
5. **No test dataset was found anywhere** — not in the repository, the database, Storage,
   the deployed site, or any file on this machine — matching the "2500 people" that was
   reported on screen. The live database has held 32 people since 11 October, and the
   shipped `js/data.js` (deleted) contained 32. If it appears again, the URL and a
   screenshot will identify it immediately.

## 9. Admin checklist

**Add a new family member account** — Admin (⚙) → *Users* → *Add family member account* →
email, full name, role (*editor*), tick the branches they may edit (type a name in the
box; each candidate is labelled "name · generation · parent"), then *Send invitation*.
They get the email, choose a password, and can edit only those branches.
*(Needs the Edge Function from §8.1; until then, add the account in the Supabase
dashboard and set the profile row by hand.)*

**Assign or change a branch** — Admin → *Users* → *Edit* on the account → the branch
picker → *Save*. Removing every branch leaves them able to read but not edit.

**Restore a deleted person** — Admin → *Recently deleted* → *Restore*. The person returns
to their original place in the tree. (Editors cannot delete at all: they file a *Deletion
request*, which appears in Admin → *Deletion requests* for approval.)

**Take a backup** — Admin → *Import and backup* → *Download full backup (JSON)* writes one
file containing people, profiles, branch access, deletion requests and the whole audit
log. *Export to Excel* writes the family in the original spreadsheet column order.
Store the backups outside the repository.

**Deploy an update** — commit and push the repository, then let the host serve it.
The service worker is network-first, so a browser picks up a new deployment on the next
load; bump `CACHE` in `sw.js` when the file list changes (done here: v3). Database changes
are run once in Supabase → SQL Editor. If the site is served from `file://`, invitations
and the service worker cannot work — use `node tools/serve.cjs` or a real host.

## 10. Follow-up pass (same day)

* **The import path was exercised through the real interface.** Signed in as the admin,
  Admin → *Import and backup* → choosing `data/Master_Family_Tree_Database.xlsx` reads
  **38 rows**, reports **0 problems**, orders them parents-first (A001, A002, A011, …) and
  shows the **"Import 38 people"** button. The import itself was **not** run — the
  database holds the other family (§8.3) — so the preview is verified, and the write path
  was read rather than executed.
* **Housekeeping.** `README.md` was rewritten to describe the app as it now is (Supabase,
  sign-in, languages, admin, import, the checks, the database files, the spreadsheet
  discrepancy). `tools/build_data.py` (which generated the deleted `js/data.js`) and nine
  scratch files (`.parse_*.cjs`, `.report_i18n.md`, …) were removed. `js/data.js` is gone,
  and nothing in the shipped files references it any more (checked).
* **One stray file left alone:** `js/New Text Document.txt` — a tracked, empty file that
  predates this work. Delete it if you want; nothing reads it.
