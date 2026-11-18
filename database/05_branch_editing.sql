-- =====================================================================
--  BRANCH EDITING  -  one narrow write path for invited branch editors
--  Run this ONCE (after 01_schema.sql) in:
--    Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--  Run it as the project owner (the SQL Editor's default role), so the function
--  is owned by the same role that owns public.people and can bypass RLS.
--
--  Why it exists
--  -------------
--  people_insert allows an editor to add a row only when the row has a
--  parent_id they may edit. That covers "add a child" and nothing else:
--
--    * a spouse has no parent, so the policy rejects the row;
--    * a sibling's parent is the editor's parent, which the editor may not
--      edit, so the policy rejects that row too.
--
--  Widening branch_access one generation up would fix both, but it would hand
--  the editor every sibling's and cousin's line. Instead this function does
--  exactly three things, each derived from a person the caller can already
--  edit, and keeps people_insert untouched for every other write.
--
--  Rules (also see docs/BRANCH_MY_VIEW.md section 4)
--  -------------------------------------------------
--    1. caller must be signed in and active                       (42501)
--    2. p_kind is child | spouse | sibling                        (22023)
--    3. p_anchor must exist, not be deleted, and the caller must
--       pass public.can_edit_person(p_anchor)                     (42501)
--    4. parent is DERIVED, never taken from p_row:
--         child   -> the anchor
--         sibling -> the anchor's parent_id (refused when there is none)
--         spouse  -> null (a spouse is a top-level person)
--    5. id / legacy_id / is_deleted / path / created_by / updated_by /
--       created_at / updated_at are forced. p_row may only supply data.
--    6. a spouse's spouse_name is forced to the anchor's English full_name,
--       because js/app.js links spouses by exact name match.
--
--  SECURITY
--  --------
--  security definer means RLS is bypassed inside the body, so checks 1 and 3
--  are the gate. The function is not executable by anon or by PUBLIC; only
--  the `authenticated` role (i.e. a signed-in website user) can call it.
--  people_set_path(), people_stamp(), people_audit() and the descendant
--  fix-up still run, and auth.uid() still records the real caller in
--  audit_log.
--
--  Rollback:  drop function public.add_relative(text, uuid, jsonb);
-- =====================================================================

create or replace function public.add_relative(
  p_kind   text,        -- 'child' | 'spouse' | 'sibling'
  p_anchor uuid,        -- the person the new record relates to
  p_row    jsonb        -- form values; only known person columns are read
) returns public.people
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind   text := lower(btrim(coalesce(p_kind, '')));
  v_anchor public.people;
  v_parent uuid;
  v_row    public.people;
begin
  -- 1. A signed-in, active account. auth.uid() reads the caller's JWT, so it is
  --    correct even though this body runs as the function owner.
  if not public.is_active_user() then
    raise exception 'Sign in with an active account to add a relative.'
      using errcode = '42501';
  end if;

  -- 2. Only the three relationships the form offers.
  if v_kind not in ('child', 'spouse', 'sibling') then
    raise exception 'Unknown relationship type: %', coalesce(p_kind, '(none)')
      using errcode = '22023';
  end if;

  -- 3. The anchor must be a live person inside the caller's assigned branch.
  --    This mirrors the RLS helper exactly, so the function can never grant more
  --    than the policies already do - it only derives what a client cannot.
  select * into v_anchor
    from public.people
   where id = p_anchor
     and not is_deleted;

  if not found then
    raise exception 'That person no longer exists.'
      using errcode = '42501';
  end if;

  if not public.can_edit_person(p_anchor) then
    raise exception 'You can only add relatives to people inside your assigned branch.'
      using errcode = '42501';
  end if;

  -- 4. Derive the parent from the relationship. A parent_id sent by the client
  --    is ignored on purpose: it is the one field that decides what the new row
  --    is allowed to become.
  if v_kind = 'child' then
    v_parent := v_anchor.id;

  elsif v_kind = 'sibling' then
    v_parent := v_anchor.parent_id;
    if v_parent is null then
      raise exception 'A brother or sister needs a parent on record first. Ask an administrator to record a parent for %.', v_anchor.full_name
        using errcode = '23514';
    end if;

  else
    v_parent := null;                       -- spouse: a top-level person
  end if;

  -- 5. Read the form values through the table type (unknown keys are ignored),
  --    then force everything that gives the row an identity or a privilege.
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'The person details are missing.' using errcode = '22023';
  end if;

  v_row := jsonb_populate_record(null::public.people, p_row);

  v_row.id         := gen_random_uuid();
  v_row.parent_id  := v_parent;
  v_row.legacy_id  := null;                 -- an old spreadsheet id is never reused
  v_row.is_deleted := false;
  v_row.path       := '{}'::uuid[];         -- people_set_path() rebuilds it
  v_row.created_by := auth.uid();
  v_row.updated_by := auth.uid();
  v_row.created_at := now();
  v_row.updated_at := now();

  -- 6. Required text, checked here so the form gets a sentence rather than a
  --    raw constraint name.
  v_row.full_name := nullif(btrim(coalesce(v_row.full_name, '')), '');
  if v_row.full_name is null then
    raise exception 'A name is required.' using errcode = '23514';
  end if;

  -- 7. A spouse links back to the anchor BY NAME: js/app.js matches
  --    spouse_name against full_name exactly. Write the English full name even
  --    when the caller is using Urdu or Hindi, or the pair would not join.
  if v_kind = 'spouse' then
    v_row.spouse_name := v_anchor.full_name;
  end if;

  -- 8. Write. The column list is explicit so a later column can never be
  --    populated invisibly through a `select *`.
  insert into public.people (
    id, legacy_id, parent_id, gender, full_name, nick_name, fathers_name,
    mothers_name, spouse_name, spouse_father_name, dob, dob_text,
    place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur,
    name_hi, notes, photo_path, source, path, is_deleted, created_by,
    updated_by, created_at, updated_at
  ) values (
    v_row.id, v_row.legacy_id, v_row.parent_id, v_row.gender, v_row.full_name,
    v_row.nick_name, v_row.fathers_name, v_row.mothers_name, v_row.spouse_name,
    v_row.spouse_father_name, v_row.dob, v_row.dob_text, v_row.place_of_birth,
    v_row.qualification, v_row.dod, v_row.dod_text, v_row.place_of_burial,
    v_row.name_ur, v_row.name_hi, v_row.notes, v_row.photo_path, v_row.source,
    v_row.path, v_row.is_deleted, v_row.created_by, v_row.updated_by,
    v_row.created_at, v_row.updated_at
  )
  returning * into v_row;

  return v_row;
end $$;

-- Only signed-in website users. Postgres grants EXECUTE to PUBLIC by default,
-- so revoking from PUBLIC is the line that matters; anon is named for clarity.
revoke all on function public.add_relative(text, uuid, jsonb) from public, anon;
grant execute on function public.add_relative(text, uuid, jsonb) to authenticated;

comment on function public.add_relative(text, uuid, jsonb) is
  'Adds a child, spouse or sibling of a person the caller may edit. Derives parent_id, forces identity/audit fields, returns the new row.';

-- PostgREST caches the function list; ask it to reload so client.rpc() sees the
-- new function immediately instead of waiting for the next schema event.
notify pgrst, 'reload schema';

-- =====================================================================
--  Verification
-- =====================================================================
--
-- a) The function exists, is owned by the database owner, and its ACL lists
--    `authenticated` but neither `anon` nor PUBLIC:
--
--      select proname, prosecdef, proacl
--        from pg_proc
--       where proname = 'add_relative';
--
--    Expected: prosecdef = true, and proacl contains authenticated=X/... but no
--    `=X/...` (PUBLIC) and no anon=X/...
--
-- b) A real add is best checked from the website (My view -> a card -> the +
--    menu), because auth.uid() must be a signed-in editor. If you prefer SQL,
--    the block below simulates a signed-in user and rolls everything back.
--    Replace the two uuids: one editor from `profiles`, one person from that
--    editor's branch_access.
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<EDITOR-UUID>","role":"authenticated"}';
--      select id, full_name, parent_id, path
--        from public.add_relative(
--          'child', '<ANCHOR-UUID>',
--          '{"full_name":"Test Child","gender":"Male"}'::jsonb);
--      rollback;
--
--    Repeat with 'sibling' (needs an anchor that has a parent) and 'spouse'
--    (check that the returned spouse_name equals the anchor's full_name).
--
-- c) Confirm nothing else widened:
--
--      select polname, pg_get_expr(polqual, polrelid) as using_expr,
--             pg_get_expr(polwithcheck, polrelid) as with_check
--        from pg_policy
--       where polrelid = 'public.people'::regclass;
--
--    people_insert must still be: is_admin() or (parent_id is not null and
--    can_edit_person(parent_id)).
