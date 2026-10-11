-- =====================================================================
--  FAMILY TREE  -  database schema + security rules for Supabase
--  Run this ONCE in:  Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--  Then run 02_seed.sql (your existing data), then 03_storage.sql (photos).
--
--  Security model (enforced INSIDE the database, not in the website):
--    * Only logged-in, active users can read the tree (everyone sees everyone).
--    * admin  : can do everything.
--    * editor : can add / edit people ONLY inside the branches the admin
--               assigned in branch_access (the person + all descendants).
--               Cannot move people, cannot delete (can only REQUEST deletion).
--    * every change is written to audit_log (who, when, old + new values).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'editor' check (role in ('admin','editor')),
  active      boolean not null default false,          -- admin must activate
  language    text not null default 'en' check (language in ('en','ur','hi')),
  created_at  timestamptz not null default now()
);

create table public.people (
  id                  uuid primary key default gen_random_uuid(),
  legacy_id           text unique,                      -- old Excel Individual_ID, e.g. B013-001
  parent_id           uuid references public.people(id) on delete restrict,
  gender              text check (gender in ('Male','Female')),
  full_name           text not null,
  nick_name           text,
  fathers_name        text,
  mothers_name        text,
  spouse_name         text,
  spouse_father_name  text,
  dob                 date,                             -- real date when known
  dob_text            text,                             -- original text / partial dates ("1970")
  place_of_birth      text,
  qualification       text,
  dod                 date,
  dod_text            text,
  place_of_burial     text,
  name_ur             text,                             -- optional full name in Urdu script
  name_hi             text,                             -- optional full name in Hindi (Devanagari)
  notes               text,
  photo_path          text,                             -- path inside the 'photos' storage bucket
  source              text,                             -- old Source_File column
  path                uuid[] not null default '{}',     -- ancestors root..self, maintained by trigger
  is_deleted          boolean not null default false,   -- soft delete (admin can restore)
  created_by          uuid,
  updated_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint dod_after_dob check (dod is null or dob is null or dod >= dob)
);
create index people_parent_idx on public.people(parent_id);
create index people_path_idx   on public.people using gin(path);

create table public.branch_access (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  person_id  uuid not null references public.people(id)   on delete cascade,
  primary key (user_id, person_id)
);

create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles(id),
  reason       text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  resolved_by  uuid references public.profiles(id),
  resolved_at  timestamptz
);

create table public.audit_log (
  id              bigint generated always as identity primary key,
  person_id       uuid,                                 -- no FK so history survives hard deletes
  action          text not null,                        -- insert | update | delete | restore | hard_delete
  changed_by      uuid,
  changed_by_name text,
  old_data        jsonb,
  new_data        jsonb,
  changed_at      timestamptz not null default now()
);
create index audit_person_idx on public.audit_log(person_id, changed_at desc);

-- ---------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------
-- true when the caller is a logged-in website user (not the SQL editor / service key)
create or replace function public.is_client() returns boolean
language sql stable as $$ select current_user in ('anon','authenticated') $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

-- may the caller edit this person?  admin: yes.  editor: only if the person is
-- (or is below) one of the people assigned to them in branch_access.
create or replace function public.can_edit_person(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or ( public.is_active_user()
           and exists (select 1
                       from public.people p
                       join public.branch_access b on b.person_id = any (p.path)
                       where p.id = pid and b.user_id = auth.uid()) )
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers on people
-- ---------------------------------------------------------------------
-- a) guard: stops editors changing things they must not (runs first)
create or replace function public.people_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;                                   -- id can never change
    if public.is_client() and not public.is_admin() then
      if new.parent_id is distinct from old.parent_id then
        raise exception 'Only an admin can move a person to a different parent';
      end if;
      if new.is_deleted is distinct from old.is_deleted then
        raise exception 'Only an admin can delete or restore people - use a deletion request';
      end if;
      new.legacy_id  := old.legacy_id;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  else  -- INSERT
    if public.is_client() and not public.is_admin() then
      new.legacy_id  := null;
      new.is_deleted := false;
    end if;
  end if;
  return new;
end $$;

-- b) path: always recomputed from the parent, so it can never be forged
create or replace function public.people_set_path() returns trigger
language plpgsql security definer set search_path = public as $$
declare ppath uuid[];
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then   -- cascade from people_fix_descendants
    return new;
  end if;
  if new.parent_id is null then
    new.path := array[new.id];
  else
    select path into ppath from public.people where id = new.parent_id;
    if ppath is null then raise exception 'Parent not found'; end if;
    if new.id = any (ppath) then
      raise exception 'A person cannot be placed under their own descendant';
    end if;
    new.path := ppath || new.id;
  end if;
  return new;
end $$;

-- c) stamps who/when
create or replace function public.people_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client() then new.created_by := auth.uid(); end if;
  end if;
  new.updated_at := now();
  if public.is_client() then new.updated_by := auth.uid(); end if;
  return new;
end $$;

-- d) after a person is moved, fix the stored path of everyone below them
create or replace function public.people_fix_descendants() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.path is distinct from old.path then
    update public.people
       set path = new.path || path[array_position(path, new.id) + 1 :]
     where new.id = any (path) and id <> new.id;
  end if;
  return null;
end $$;

-- e) audit log
create or replace function public.people_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text; act text;
begin
  select coalesce(full_name, email) into nm from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.audit_log(person_id, action, changed_by, changed_by_name, new_data)
    values (new.id, 'insert', auth.uid(), nm, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'path' - 'updated_at' - 'updated_by')
       = (to_jsonb(old) - 'path' - 'updated_at' - 'updated_by') then
      return null;                                      -- only path changed: not interesting
    end if;
    act := case when new.is_deleted and not old.is_deleted then 'delete'
                when old.is_deleted and not new.is_deleted then 'restore'
                else 'update' end;
    insert into public.audit_log(person_id, action, changed_by, changed_by_name, old_data, new_data)
    values (new.id, act, auth.uid(), nm, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log(person_id, action, changed_by, changed_by_name, old_data)
    values (old.id, 'hard_delete', auth.uid(), nm, to_jsonb(old));
  end if;
  return null;
end $$;

create trigger trg_a_guard  before insert or update on public.people
  for each row execute function public.people_guard();
create trigger trg_b_path   before insert or update on public.people
  for each row execute function public.people_set_path();
create trigger trg_c_stamp  before insert or update on public.people
  for each row execute function public.people_stamp();
create trigger trg_fix_desc after update on public.people
  for each row execute function public.people_fix_descendants();
create trigger trg_audit    after insert or update or delete on public.people
  for each row execute function public.people_audit();

-- ---------------------------------------------------------------------
-- 4. Profiles: auto-create on signup (inactive until an admin activates)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if public.is_client() and not public.is_admin() then
    new.id := old.id; new.email := old.email; new.role := old.role; new.active := old.active;
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.people            enable row level security;
alter table public.branch_access     enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_log         enable row level security;

-- remove Supabase's broad default grants, then grant only what the website needs
revoke all on all tables    in schema public from anon, authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.people            to authenticated;
grant select, insert, update, delete on public.branch_access     to authenticated;
grant select, insert, update, delete on public.deletion_requests to authenticated;
grant select                         on public.audit_log         to authenticated;

-- people
create policy people_select on public.people for select to authenticated
  using ( public.is_active_user() and (not is_deleted or public.is_admin()) );
create policy people_insert on public.people for insert to authenticated
  with check ( public.is_admin()
               or (parent_id is not null and public.can_edit_person(parent_id)) );
create policy people_update on public.people for update to authenticated
  using ( public.can_edit_person(id) )
  with check ( public.can_edit_person(id) );
create policy people_delete on public.people for delete to authenticated
  using ( public.is_admin() );

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using ( id = auth.uid() or public.is_admin() );
create policy profiles_update on public.profiles for update to authenticated
  using ( id = auth.uid() or public.is_admin() )
  with check ( id = auth.uid() or public.is_admin() );

-- branch_access: users see their own rows, only admins change them
create policy branch_select on public.branch_access for select to authenticated
  using ( user_id = auth.uid() or public.is_admin() );
create policy branch_insert on public.branch_access for insert to authenticated
  with check ( public.is_admin() );
create policy branch_update on public.branch_access for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );
create policy branch_delete on public.branch_access for delete to authenticated
  using ( public.is_admin() );

-- deletion requests: editors may request for people in their branch; admin resolves
create policy delreq_select on public.deletion_requests for select to authenticated
  using ( requested_by = auth.uid() or public.is_admin() );
create policy delreq_insert on public.deletion_requests for insert to authenticated
  with check ( requested_by = auth.uid() and public.can_edit_person(person_id) );
create policy delreq_update on public.deletion_requests for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );
create policy delreq_delete on public.deletion_requests for delete to authenticated
  using ( public.is_admin() );

-- audit log: read-only. admin sees all; editors see history of their own branch
create policy audit_select on public.audit_log for select to authenticated
  using ( public.is_admin() or public.can_edit_person(person_id) );

-- ---------------------------------------------------------------------
-- 6. MAKE YOURSELF THE FIRST ADMIN  (do this after you sign up once)
-- ---------------------------------------------------------------------
--   1. Supabase dashboard -> Authentication -> Users -> Add user -> create your own
--      account (your real email + a strong password, tick "Auto Confirm User").
--   2. Run (replace the email):
--
--   update public.profiles set role = 'admin', active = true
--   where email = 'you@example.com';
