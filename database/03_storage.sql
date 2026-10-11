-- =====================================================================
--  Photo storage (optional but recommended). Run after 01_schema.sql.
--  Photos live in a PRIVATE bucket called "photos", one folder per person:
--      photos/<person-uuid>/<file>.jpg
--  Everyone logged in can view; only people who may edit that person can upload/replace/remove.
-- =====================================================================
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using ( bucket_id = 'photos' and public.is_active_user() );

create policy photos_insert on storage.objects for insert to authenticated
  with check ( bucket_id = 'photos'
               and public.can_edit_person(((storage.foldername(name))[1])::uuid) );

create policy photos_update on storage.objects for update to authenticated
  using ( bucket_id = 'photos'
          and public.can_edit_person(((storage.foldername(name))[1])::uuid) );

create policy photos_delete on storage.objects for delete to authenticated
  using ( bucket_id = 'photos'
          and public.can_edit_person(((storage.foldername(name))[1])::uuid) );
