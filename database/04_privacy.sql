-- =====================================================================
--  OPTIONAL PRIVACY — hide the exact date of birth of living people
--                       from people who cannot edit them
--
--  >>> PROPOSAL. DO NOT RUN THIS UNTIL YOU HAVE DECIDED YOU WANT IT. <<<
--  Nothing in the website changes until the last step is uncommented AND the app
--  has been pointed at the function below (see "WHAT STILL HAS TO CHANGE"). It is
--  a NEW file on purpose: database/01_schema.sql is not touched.
--
--  What "hidden" means here. Row level security hides ROWS; it cannot hide one
--  COLUMN of a row. The only real protection is to take the column away:
--
--     1. revoke the table-wide SELECT and grant it back column by column, leaving
--        out dob and dod, so PostgREST refuses `select dob` for `authenticated`;
--     2. hand the dates out through public.person_dates_all(), a SECURITY DEFINER
--        function that decides per caller and per person:
--           * an admin, or somebody who may edit that person -> the exact date
--           * everybody else                                   -> the YEAR only
--        for people who are still living, and the exact date for everybody who has
--        died (a death date is a matter of record, not of privacy).
--
--  Two traps this file avoids on purpose, because both look right and are not:
--
--   * `revoke select (dob, dod) on public.people from authenticated` does NOTHING
--     while a table-wide SELECT grant exists — column revokes do not override it.
--     The table-wide grant has to go first, then every other column comes back.
--
--   * A view such as `select ... person_dates(id).dob ... from people` is owned by
--     the role that created it, so its SELECT runs as the OWNER and the row level
--     security policies on public.people are bypassed for every reader (the owner
--     bypasses RLS). A plain view here would leak every row — including
--     soft-deleted people and branches the reader may not touch. There is no view
--     in this file for that reason: the function below re-applies the same
--     visibility rules that the RLS policies express.
--
--  Every helper used here already exists in database/01_schema.sql:
--  public.is_active_user(), public.is_admin(), public.can_edit_person(uuid).
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1 — the setting. One row, one switch.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id                  boolean primary key default true check (id),   -- single row
  hide_living_dob     boolean not null default false,
  updated_at          timestamptz not null default now()
);
insert into public.app_settings (id, hide_living_dob) values (true, false)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
-- everyone signed in may READ the switch; only an admin may flip it
grant select, update on public.app_settings to authenticated;
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated
  using ( public.is_active_user() );
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- Are birth dates being hidden right now?
create or replace function public.dob_is_private() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select hide_living_dob from public.app_settings where id), false)
$$;

-- ---------------------------------------------------------------------
-- STEP 2 — the way dates are handed out.
-- ---------------------------------------------------------------------
-- One person, by id. Returns nothing at all for an inactive account, and nothing
-- for an id that does not exist.
create or replace function public.person_dates(pid uuid)
returns table (dob date, dod date, precise boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  p public.people;
  may_see boolean;
begin
  if not public.is_active_user() then return; end if;
  select * into p from public.people where id = pid;
  if not found then return; end if;
  may_see := public.can_edit_person(pid)
             or not public.dob_is_private()
             or p.dod is not null
             or p.dob is null;
  if may_see then
    return query select p.dob, p.dod, true;
  else
    -- The 1st of January of the birth year: the year stays visible, the day does not.
    return query select date_trunc('year', p.dob)::date, p.dod, false;
  end if;
end $$;
revoke all on function public.person_dates(uuid) from public;
grant execute on function public.person_dates(uuid) to authenticated;

-- All of them at once, for the tree and the Upcoming panel: one round trip instead
-- of one per person. This function owns the row rules, because inside a SECURITY
-- DEFINER function the owner bypasses RLS: active accounts only, and soft-deleted
-- people only for an admin.
create or replace function public.person_dates_all()
returns table (id uuid, dob date, dod date, precise boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when public.can_edit_person(p.id)
                or not public.dob_is_private()
                or p.dod is not null
                or p.dob is null
              then p.dob
              else date_trunc('year', p.dob)::date end as dob,
         p.dod,
         case when public.can_edit_person(p.id)
                or not public.dob_is_private()
                or p.dod is not null
                or p.dob is null
              then true
              else false end as precise
  from public.people p
  where public.is_active_user()
    and (p.is_deleted = false or public.is_admin())
$$;
revoke all on function public.person_dates_all() from public;
grant execute on function public.person_dates_all() to authenticated;

-- ---------------------------------------------------------------------
-- STEP 3 — turn the protection on in the database (the only real enforcement).
-- Uncomment when the app has been pointed at the function (see below).
--
-- The column list is the whole table minus dob and dod. Keep it in step with
-- database/01_schema.sql if you ever add a column.
-- ---------------------------------------------------------------------
-- revoke select on public.people from authenticated;
-- grant select (
--   id, legacy_id, parent_id, gender, full_name, nick_name, fathers_name,
--   mothers_name, spouse_name, spouse_father_name, dob_text, place_of_birth,
--   qualification, dod_text, place_of_burial, name_ur, name_hi, notes,
--   photo_path, source, path, is_deleted, created_by, updated_by,
--   created_at, updated_at
-- ) on public.people to authenticated;
-- update public.app_settings set hide_living_dob = true, updated_at = now() where id;
--
-- What this covers, and what it does not:
--   * READ — dob and dod are gone from SELECT for `authenticated`. The two
--     functions above are the only way to a date, and they decide per caller.
--   * WRITE — UPDATE still allows dob and dod for whoever the update policy lets
--     through (an admin, or the editor of that branch), because the edit dialog has
--     to be able to save a date. Anybody who may edit a person is also allowed to
--     see that person's dates, so this is the intended boundary, not a gap.

-- To undo everything above:
--   grant select on public.people to authenticated;
--   drop function if exists public.person_dates_all();
--   drop function if exists public.person_dates(uuid);
--   drop function if exists public.dob_is_private();
--   drop table if exists public.app_settings;

-- ---------------------------------------------------------------------
-- WHAT STILL HAS TO CHANGE IN THE APP (not done yet — say the word)
-- ---------------------------------------------------------------------
-- The tree only needs a year for display, but three places use the exact date:
--   * js/app.js      fetchAllPeople()    — selects '*' and orders by dob
--   * js/app.js      loadFromSupabase()  — formats dob/dod
--   * js/extras.js   the Upcoming (birthday) panel
-- Switching them over means:
--   1. select the columns by name (no dob/dod) and sort client-side by dob instead
--      of `.order('dob')`;
--   2. call public.person_dates_all() once after signing in and merge the dates in;
--   3. when `precise` is false, show the year only and leave that person out of the
--      birthday list.
-- That is a real change to those files plus a re-test, which is why it is not
-- bundled into this proposal.
