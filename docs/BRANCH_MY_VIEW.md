# My view — a scoped tree for invited branch editors

Status: approved and implemented. The database function in
`database/05_branch_editing.sql` is the one step that must be applied in Supabase
before the client change is deployed.

## 1. The problem

An invited editor lands in `#branchView` (`js/branch.js`): a grid of completeness
tiles. It answers "what data is missing" but never shows structure, so it cannot
answer the two questions the editor actually has:

- where does a person I add go, and
- under whom are they attached?

The main tree already answers both, and it is the same renderer used everywhere.
The fix is to show the editor *their* part of that tree instead of inventing a
second way of drawing a family.

## 2. Shape (approved: A)

`#branchView` and its tile UI are removed. "My view" becomes a **mode of the real
tree**:

- the same canvas, cards, edges, pan/zoom, details panel and person form;
- scoped to the editor's branch;
- centred on a "This is you" card;
- every card carries the add actions that apply to *that* person, in place;
- one button switches to the full tree with the same person still selected.

Result: nothing new to learn. What they see while adding is literally what the
main tree will show afterwards, because it is the same drawing code over the same
rows. No syncing exists to go wrong.

## 3. What the editor sees

Scope is computed from the anchor (the person in `branch_access`). Exactly one
rule set:

| included | why |
|---|---|
| the anchor | "you" |
| every descendant of the anchor | children, grandchildren, … |
| the anchor's parent | so the attachment point is visible |
| every child of that parent | siblings — including the anchor |
| **not** included | spouses as separate nodes (see below), siblings' descendants, cousins |

Spouses need no rule: a spouse is already drawn as the card beside their partner
from `spouse_name`. Adding the spouse *record* to the visible set would draw the
same person twice — once inline, once as a root (their `parent_id` is null). So
spouses stay out of the visible set and remain reachable by clicking their inline
card, which opens their own record.

Consequences, all deliberate:

- No parent recorded → the scope is the anchor plus descendants. An editor with
  nobody else in their branch sees **one card**, which is the case you described.
- Parent recorded → parents and siblings appear, so the editor can see that a
  brother they add is a child of the same father, and where.
- Siblings' children are out of scope. They are not part of "my branch" and the
  editor has no write access to them.

The anchor card gets a `.me` class and a "You" badge. Any card the editor cannot
edit — the parent, the siblings, and spouses whose record they do not own — is
drawn read-only: dashed border, slightly muted (opacity .72, not the unused
`.context` class's .55, which is too faint to read comfortably), no `＋`, and a
`title` saying why. The renderer already gates every action on `can_edit_person`,
so this is styling plus one `title`, not a new permission check.

### Add actions

One `＋` per card, as today, but in this mode it opens a small menu instead of
going straight to the child form. The menu names the relationship **and the
person** it attaches to:

```
Add to Syed Yusuf
  ＋  Child                 goes under Syed Yusuf
  ♥  Spouse                married to Syed Yusuf
  ─────────────────────────────────────────────
  ⇄  Brother or sister     child of Syed Bilal
```

Rules:

| row | offered when | creates |
|---|---|---|
| Child | `canEditPerson(person)` | a child of that person |
| Spouse | `canEditPerson(person)`, no spouse recorded | a spouse of that person |
| Brother or sister | `canEditPerson(person)` and the person has a parent | another child of that parent |

Unavailable rows are shown **disabled with the reason** ("already married to
Ayesha Noor", "needs a parent on record first") rather than hidden, so the
editor learns the rule instead of wondering where the option went.

In this mode the `＋` is always visible (55% opacity, full on hover). The
hover-only reveal is fine when you already know the tree; it is exactly the
"not obvious at first glance" problem being fixed.

The menu is a stage-level layer positioned from the button's bounding box, not a
child of `#world` — inside the world it would inherit the pan/zoom transform
(shrinking at low zoom) and could not paint above sibling cards. It is registered
with the stage's existing "chrome is clickable, not draggable" check.

The full tree keeps today's behaviour exactly: one `＋` per card = add child.

### After saving

`FT.refreshAndSelect(newId)` already reloads from the database. Two additions:

- a short highlight on the new card (`flash(id)`), so the eye finds it;
- if the card lands off-screen, pan it into view before the highlight.

The record is now in the same table the main tree reads, so "reflected in the main
tree" needs no code — the switch-to-full-tree button proves it in one click.

## 4. Permissions (approved: P2)

`people_insert` is:

```sql
with check (public.is_admin()
            or (parent_id is not null and public.can_edit_person(parent_id)))
```

So today an invited editor **cannot** add:

- a spouse — the row has no parent, so the policy rejects it (this is already
  broken in production, not just missing);
- a sibling — the row's parent is the editor's parent, which they may not edit.

Adding a child works and keeps working.

Granting access one generation higher would fix both, but hands the editor every
sibling's and cousin's line. Instead: one narrow, reviewed function.

### `database/05_branch_editing.sql`

```sql
create or replace function public.add_relative(
  p_kind   text,        -- 'child' | 'spouse' | 'sibling'
  p_anchor uuid,        -- the person the new record relates to
  p_row    jsonb        -- form values; only known person columns are read
) returns public.people
language plpgsql security definer set search_path = public
as $$ ... $$;

revoke all on function public.add_relative(text, uuid, jsonb) from public, anon;
grant execute on function public.add_relative(text, uuid, jsonb) to authenticated;
```

Rules inside:

1. `is_active_user()` or raise `42501`.
2. Anchor must exist and `can_edit_person(p_anchor)` must be true, else `42501`.
3. `parent_id` is derived, never taken from the client:
   - `child` → the anchor;
   - `sibling` → the anchor's `parent_id` (raise if null);
   - `spouse` → null.
4. The row is assembled with `jsonb_populate_record(null::public.people, p_row)`
   and then these are **forced**, because a `security definer` function runs as
   its owner and therefore skips `people_guard` (`is_client()` is false):
   `id = gen_random_uuid()`, `legacy_id = null`, `is_deleted = false`,
   `path = '{}'` (the trigger rebuilds it), `created_by = updated_by = auth.uid()`,
   `created_at = updated_at = now()`.
5. For `spouse`, `spouse_name` is forced to the anchor's `full_name` (English),
   because spouse linkage in `build()` matches `spouse_name` against `name`
   exactly. Writing a localised name there would break the link in Urdu/Hindi.
6. Return the inserted row.

Nothing else changes. `people_insert` stays untouched, so no other write path
widens. `people` is still the only source of truth; `path`, `gen`, audit and the
fix-descendants trigger all still run.

### Client change

`js/personform.js` currently inserts directly. For `addchild`, `addspouse` and
the new `addsibling` it calls `client.rpc('add_relative', …)` and uses the
returned row. Admin `addroot` keeps the direct insert. One path for all three
kinds from both the main tree and My view, which also fixes the silent
spouse-insert failure.

### Ordering hazard

The client build assumes the function exists. Sequence is: implement and test
locally against a stubbed RPC → hand over the SQL → user applies it in Supabase →
only then deploy. If the function is missing, the form shows a plain error
("Adding relatives is not enabled yet — ask the admin") rather than a raw 404.

### Known limits, stated rather than hidden

- A sibling the editor adds is **read-only** to them afterwards: no edit, no
  photo, no children. That follows from P2 keeping access at the anchor. An admin
  can anchor access at the parent if a whole sibling line needs filling.
- Spouse add on a person who already has a `spouse_name` stays available (as
  today), but the back-link still refuses to overwrite a different partner.

## 5. Files touched

| file | change |
|---|---|
| `js/branch.js` | rewritten as the scope controller: landing, remembered view, scope bar, nav toggle. Branch maths (`branchPeople`, `myPeople`, `completeness`) kept for the admin screen. |
| `js/app.js` | `S.scope`/`S.meId`; `computeVisibility()` intersects scope; `.me` badge; read-only styling; the `＋` menu; `flash`/`reveal`; `FT.setScope`, `FT.focus`. |
| `js/personform.js` | `addsibling` mode; `add_relative` RPC for the three create modes; sibling subtitle. |
| `index.html` | remove `#branchView` body usage, relabel the two nav buttons to "My view", add the scope header strip. |
| `css/style.css` | delete `.branch-*` and `.person-tile`; add `.node.me`, `.me-badge`, `.node.readonly`, `.rel-menu`, scope header. |
| `js/i18n.js` | ~18 new keys × en/ur/hi; remove the ~87 dead `branch.*` keys. |
| `database/05_branch_editing.sql` | new. |
| `sw.js` | bump `CACHE` (file list unchanged, but CSS/JS content changes). |
| `docs/BRANCH_MY_VIEW.md`, `docs/preview-my-view.html` | this design and the approved preview. |

## 6. Verification

Browser harness (`%TEMP%\ft-audit`), `my-view-tests.js` plus the four existing
suites, with a fixture editor whose `branch_access` points at the middle
generation:

1. editor signs in → scoped drawing, not the tile grid;
2. only in-scope people are drawn; a cousin in the fixture is absent;
3. anchor has the "You" badge; parent and siblings are drawn above/beside it;
4. sibling button appears only where a parent exists; spouse button becomes a
   disabled row with the reason once a spouse is recorded; child button only on
   editable cards;
5. clicking each button opens the form in the right mode with the right anchor;
6. with `Auth.client.rpc` stubbed, saving calls `add_relative('child'|'spouse'|
   'sibling', anchor, …)` — not `insert`;
7. the new card is selected and flashed;
8. "Full tree" leaves the mode and keeps the selection;
9. an editor with no parent, no spouse and no children sees exactly one card;
10. regression: all existing suites still pass (desktop 15, phone 9, wide 32,
    drag 7) plus the live-URL run after deploy.

Not verifiable from this machine: the SQL itself. There are no database
credentials here, so applying it and exercising the real RLS path is the user's
step. I will provide the file plus the exact click-path to confirm each of the
three adds, and the `drop function` rollback.

## 7. Rollback

Revert the commit and redeploy; the scoped view disappears and the tree is
unscoped again. The database function is additive and can stay, or be removed
with `drop function public.add_relative(text, uuid, jsonb)`.
