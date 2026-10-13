# Family Tree website

An interactive, private family tree. Relatives sign in, browse the tree in English, Urdu
or Hindi, and edit the branches they have been given. Everything is stored in Supabase —
there is no bundled copy of the family data in the website any more.

## Run it

The site needs a real origin (`http://…`), not `file://`: sign-in, invitation links, photo
uploads and the service worker all require one.

```bash
node tools/serve.cjs          # http://localhost:5173
node tools/serve.cjs 8080     # a different port
```

Then open the printed address and sign in with an account that exists in the database.
Without a session the page shows only the sign-in screen — that is deliberate, and the
database enforces it too (a signed-out `select` is refused with `42501`).

`js/config.js` holds the Supabase Project URL and the publishable (anon) key. Nothing
else belongs in there: the service-role key lives only in the `admin-users` Edge
Function's server-side environment.

## What is in the app

| Area | Where |
| --- | --- |
| Tree / table view, filters, pan & zoom, search, tooltips | `js/app.js`, `css/style.css` |
| Sign-in, invitation and password screens, branch permissions | `js/auth.js` |
| English / Urdu / Hindi, right-to-left layout, fonts | `js/i18n.js` |
| Add / edit a person, history and restore | `js/personform.js` |
| Admin screen: users, deletion requests, recently deleted, activity, import & backup | `js/admin.js` |
| Tools: how are we related, upcoming dates, statistics, print / PNG | `js/extras.js` |
| Photos (private Storage bucket, client-side resize) | `js/photos.js` |
| Installable web app | `manifest.webmanifest`, `sw.js`, `icons/` |

Languages: **English**, **اردو** (right-to-left) and **हिन्दी**. The tree canvas itself stays
left-to-right in every language so cards and connector lines never move. Gender and dates
are translated; digits stay Western (0-9). Several sample strings in the Urdu and Hindi
dictionaries should still be reviewed by a native speaker — the files say so at the top.

The person search matches the English, Urdu **and** Hindi spellings of a name
(`name_ur` / `name_hi`), so a relative can type in whichever script they think in.

## The database

Run these once in Supabase → SQL Editor, in order:

| File | What it does |
| --- | --- |
| `database/01_schema.sql` | tables, triggers, functions and every row level security policy |
| `database/02_seed.sql` | a small starter seed (safe to skip once your own data is in) |
| `database/03_storage.sql` | the private `photos` bucket and its policies |
| `database/04_seed_from_excel.sql` | the family imported from a spreadsheet, upserted by `legacy_id` — **check it is the right spreadsheet before running it** |
| `database/04_privacy.sql` | optional: hide the exact date of birth of living people. A **proposal**, not applied — see `docs/PHASE7_SECURITY_REVIEW.md` |
| `database/99_data_maintenance.sql` | maintenance queries: what is empty, dangling parents, duplicate names, hard-delete a test row |

**Important:** the live database holds the 32-person tree starting at *Syed Mazharuddin
Nahri*, while `data/Master_Family_Tree_Database.xlsx` and `database/04_seed_from_excel.sql`
describe a different 38-person set starting at *Syed Azeemuddin Nahri*. Importing the
spreadsheet as it stands would add a second family beside the first. Confirm which source
is authoritative first (details in `docs/PHASE7_SECURITY_REVIEW.md`, §8.3).

Who may do what is decided by the database, not by the page:

* **active user** — read the whole tree, use the tools, request a deletion;
* **editor of a branch** — add and edit people inside their branch only, nothing else;
* **admin** — everything, including accounts, the import and restoring deleted people.

## Accounts and the admin screen

The ⚙ button appears for admins: users and branch access, the deletion-request queue,
recently deleted people, a 100-entry activity feed, Excel import with a problem preview,
Excel export and a full JSON backup.

Creating accounts needs the `admin-users` Edge Function, which is the only place the
service-role key is used:

```bash
npm install -g supabase
supabase login
supabase link --project-ref quszbgvdurbbotrnbuii
supabase secrets set SITE_URL="https://your-site.example.com"
supabase functions deploy admin-users
```

`supabase/functions/admin-users/README.md` documents the actions, the safety rules and how
the page calls it. Until it is deployed the Accounts buttons report "not deployed yet" —
everything else in the admin screen works without it.

## Import the spreadsheet (admin screen)

Admin → *Import and backup* → choose an `.xlsx` with the original column layout
(`Individual_ID`, `Parent_ID`, `Generation`, `Gender`, `Full_Name`, `Nick_Name`,
`Fathers_Name`, `Mothers_Name`, `Spouse_Name`, `Spouse_Father_Name`, `DOB`,
`Place_of_Birth`, `Qualification`, `Date_of_Death`, `Place_of_Burial`, `Source_File`, and
optionally `Name_Urdu` / `Name_Hindi`). Sheet name `Family_Data` (the first sheet is used
if it is missing).

Nothing is written until you confirm: the preview lists duplicate IDs, unknown parent IDs,
dates that are not dates, unknown genders and rows with no name. Parents are inserted
before their children. Existing people are only touched if you tick *Update people that
already exist*.

`database/04_seed_from_excel.sql` is the same import as SQL; it is generated from the
spreadsheet with:

```bash
node tools/build_seed_sql.cjs              # full upsert script
node tools/build_seed_sql.cjs --insert-only
```

## Checks

```bash
for f in js/*.js sw.js tools/*.cjs; do node --check "$f"; done
node tools/scan_security.cjs        # secrets, escaping, database writes
node tools/scan_i18n_quality.cjs    # translation key parity
node tools/i18n_review.cjs brand. panel.   # look up keys in all three languages
node tools/make_icons.cjs           # regenerate the PWA icons
```

## Files that are not shipped to the browser

`data/` (the original spreadsheet), `database/`, `docs/`, `supabase/` and `tools/` are for
the admin and the developer; the page only loads `index.html`, `css/`, `js/` and `icons/`.

## Security review

`docs/PHASE7_SECURITY_REVIEW.md` lists what was checked, the exact evidence (including the
permission matrix for admin / editor / inactive / signed-out users), the bugs found and
fixed, and the open items.
