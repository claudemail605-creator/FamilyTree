-- =====================================================================
--  DATA MAINTENANCE  —  inspect and clean the people table
--  Supabase dashboard -> SQL Editor -> New query.
--
--  Each STEP below is meant to be run ON ITS OWN: select the lines of the
--  step you want (or paste one step at a time) and press Run. STEP 1 only
--  reads; STEP 2 and STEP 3 delete data, so they are commented out until
--  you have read the report from STEP 1.
--
--  Why this file exists: the tree in the website is READ FROM SUPABASE ONLY.
--  Rows in this table are what you see on screen — the spreadsheet in the
--  project folder is not read by the deployed site. So "I can't see my family"
--  always means "my family is not in this table".
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1 — LOOK.  Read-only. Run this first and read the output.
-- ---------------------------------------------------------------------

-- 1a. How many rows, how many are soft-deleted.
select count(*)                                        as total_rows,
       count(*) filter (where is_deleted)              as soft_deleted,
       count(*) filter (where legacy_id is null)       as rows_without_legacy_id,
       min(created_at)::date                           as first_created,
       max(created_at)::date                           as last_created
from public.people;

-- 1b. Where did the rows come from? 'source' is the old Source_File column for
--     spreadsheet rows, and is usually NULL for rows added in the website or by
--     a test script. A big group here is the fastest way to spot test data.
select coalesce(source, '(none)') as source,
       count(*)                   as rows,
       min(created_at)::date      as first_seen,
       max(created_at)::date      as last_seen
from public.people
group by 1
order by rows desc;

-- 1c. A sample of the newest rows — usually enough to recognise test data.
select legacy_id, full_name, gender, source, created_at
from public.people
order by created_at desc
limit 25;

-- 1d. Do your spreadsheet people exist? These are the legacy_ids from
--     data/Master_Family_Tree_Database.xlsx. Anything "missing" is not in the
--     database yet — run database/04_seed_from_excel.sql to add it.
with sheet(legacy_id) as (
  values ('A001'),('A002'),('A011'),('B001'),('B002'),('B011-001'),('B012-001'),
         ('B013-001'),('B014-001'),('B021-001'),('B021-002'),('B021-003'),
         ('B021-004'),('B021-005'),('B021-006'),('B011-002'),('B011-003'),
         ('B011-004'),('B012-002'),('B012-003'),('B012-004'),('B013-002'),
         ('B013-003'),('B013-004'),('B013-005'),('B013-006'),('B013-007'),
         ('B013-008'),('B013-009'),('B013-011'),('B013-012')
)
select s.legacy_id,
       case when p.id is null then 'missing from database' else 'present' end as status
from sheet s
left join public.people p on p.legacy_id = s.legacy_id
order by status, s.legacy_id;


-- ---------------------------------------------------------------------
-- STEP 2 — DELETE A SET OF ROWS, deepest-first.
--
-- The table uses ON DELETE RESTRICT, so a parent cannot be removed while it
-- still has children. The DO block below expands your filter to include every
-- descendant of a matching row and then deletes bottom-up, so it cannot fail
-- half way. It prints how many rows it removed.
--
-- Preview the set first (2a), then delete it (2b).
-- ---------------------------------------------------------------------

-- 2a. PREVIEW the rows that a filter would remove. Change the WHERE line to
--     whatever identifies your test data — `source`, a name pattern, or a
--     creation date. The recursive part adds descendants automatically.
/*
with recursive target as (
  select id, legacy_id, full_name
    from public.people
   where source is null and created_at >= '2026-10-01'   -- <<< EDIT THIS LINE
  union
  select c.id, c.legacy_id, c.full_name
    from public.people c
    join target t on c.parent_id = t.id
)
select count(*) as rows_that_would_be_deleted from target;
*/

-- 2b. DELETE them. The same filter as 2a, in both places.
/*
do $$
declare
  target_ids uuid[];
  removed int;
  total int := 0;
begin
  with recursive target as (
    select id
      from public.people
     where source is null and created_at >= '2026-10-01'  -- <<< EDIT THIS LINE
    union
    select c.id
      from public.people c
      join target t on c.parent_id = t.id
  )
  select array_agg(id) into target_ids from target;

  if target_ids is null then
    raise notice 'Nothing matched - check the filter.';
    return;
  end if;
  raise notice 'Deleting % rows (deepest first)...', array_length(target_ids, 1);

  loop
    delete from public.people p
     where p.id = any (target_ids)
       and not exists (select 1 from public.people c where c.parent_id = p.id);
    get diagnostics removed = row_count;
    total := total + removed;
    exit when removed = 0;
  end loop;

  raise notice 'Deleted % rows. % deleted people no longer exist.',
               total, total;
end $$;
*/

-- 2c. Optional: drop the branch_access rows that pointed at people you deleted
--     (the foreign key already cascades, so this is only a sanity check).
-- select user_id, count(*) from public.branch_access group by 1 order by 2 desc;


-- ---------------------------------------------------------------------
-- STEP 3 — START OVER.  Wipe the tree completely and re-import from the
-- spreadsheet. Everything below is destructive: it removes every person,
-- every branch assignment, every deletion request and the whole audit log.
-- Accounts (auth.users / profiles) are kept, so nobody has to sign up again.
--
--   1. Uncomment and run block 3a.
--   2. Paste ALL of database/04_seed_from_excel.sql and run it.
--   3. Reload the website.
-- ---------------------------------------------------------------------

/*
-- 3a.
begin;
  delete from public.deletion_requests;
  delete from public.branch_access;
  delete from public.audit_log;
commit;

-- people is self-referencing with ON DELETE RESTRICT, so it has to be emptied
-- deepest-first rather than in one statement.
do $$
declare removed int; total int := 0;
begin
  loop
    delete from public.people p
     where not exists (select 1 from public.people c where c.parent_id = p.id);
    get diagnostics removed = row_count;
    total := total + removed;
    exit when removed = 0;
  end loop;
  raise notice 'Removed % people.', total;
end $$;
*/

-- 3b. Save a copy of everything first (STEP 3 alternative: read this before
--     wiping). Run it BEFORE block 3a and copy the JSON into a file.
-- select jsonb_pretty(jsonb_agg(to_jsonb(p) order by p.path)) from public.people p;
