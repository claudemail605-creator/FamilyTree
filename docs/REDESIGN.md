# Whole-site redesign — "The family register"

Status: approved 2026-11-18 and shipped to production.
Scope: every screen. Data layer, auth rules, i18n mechanics and the branch-edit
RPC are untouched.

## Why

The `＋` menu in My view is the only part of the site that explains itself: one
row per choice, a plain-language line saying what will happen, and a reason
when a choice is unavailable. Everything else assumes the user knows what a
"record has" filter is, which icon means export, or what the seven admin tabs
do.

The people who use this tree are relatives, not operators. The redesign makes
the whole site speak the way that menu speaks.

## Principles

1. **Name the consequence.** A control says what it will do, or why it cannot.
2. **One obvious next step per screen.** Primary action is filled and singular;
   everything else is quiet.
3. **Fewer, larger targets.** Nothing important is icon-only, 11px, or hidden
   until hover.
4. **Warm, not clinical.** Paper tones, a serif for names and headings, and
   portraits where the data has them. This is a family record, not a dashboard.
5. **Nothing is removed that cannot be reached another way.** Secondary tools
   move into a labelled menu, they do not disappear.

## What changes

### Top bar
- Brand keeps the live "36 people · 8 generations" subtitle.
- Search stays the widest element.
- Tree / Table stays as the one view switch.
- "My view / Full tree" stays as a labelled pill.
- Export, Tools, Refresh, Admin, Language, Theme, Profile and Sign out move into
  one account menu opened by the avatar. The menu uses the same row language as
  the relationship menu: icon, label, plain hint.
- Inline SVG icons replace the emoji/glyph mix.

### Sidebar
- Generation and Gender stay visible.
- Status, Branch, Place of birth, Qualification, Record has and Deleted move
  under a native "More ways to narrow" disclosure that opens itself when one of
  them is active and shows a count.
- Stats become one calm card; the result count sticks to the bottom of the
  sidebar.

### Tree
- Paper background, quieter generation bands, softer cards.
- The `＋` is always visible (not hover-only) and opens the same named
  relationship menu everywhere, not just in My view. Spouse cards no longer
  carry a `＋`.
- Zoom controls group into one floating pill.

### Person panel
- Header reads like a person, not a database row: portrait, name in the display
  serif, lifespan, gender and generation chips.
- A new inline "Add a relative" block uses the menu's exact rows and reasons.
- Admin-only destructive actions sit below the everyday actions.

### Person form
- Same fields, same IDs, same validation.
- Clearer section headings, larger inputs, a readable required marker, sticky
  footer, and a short line under the title saying who the new person attaches
  to.
- The profile dialog is rebuilt on the same modal system (no more inline styles).

### Admin
- Tabs become a labelled left rail on desktop, a scrolling row on phones.
- Content sits in cards with plain headings.

### Sign-in
- A brand block above the form, a warmer card, larger fields, one clear button.
- Same auth logic and error messages.

### Table
- Sticky header, comfortable rows, a sticky first column on narrow screens, and
  a no-results row that offers the way out.

## What stays exactly as it is

- `people` schema, RLS, `add_relative`, auth, roles, branch scope rules.
- Tree geometry constants (`NW`, `NH`, `GX`, `GY`, `PAD`, `SG`) and layout maths.
- All element IDs that JS binds, all i18n keys that already exist.
- Service-worker strategy; only the cache name is bumped.

## Risks and mitigation

- **CSS rewrite misses a class.** Every class emitted by JS was inventoried
  first; the audit suites and a visual board cover each screen.
- **New labels without translations.** Only four new keys are added, each in
  en / ur / hi; everything else reuses existing keys.
- **RTL and Urdu line heights.** Existing language overrides are preserved and
  re-checked at 1440, 900, 390 and with `lang=ur`.
- **Behaviour drift.** The tree, auth, admin and form logic are not rewritten;
  only chrome markup and panel/form presentation change.

## Approval gate

The redesign is not deployed until the owner has seen it. Preview is the real
app served locally plus a static board of every major screen.
