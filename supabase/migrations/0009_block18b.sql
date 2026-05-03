-- Block 18b — Major feature upgrades
--   1. posts.image_url            (image attachments on feed posts)
--   2. meetings.timezone          (time zone selector on schedule)
--   3. conversation_rooms.requires_nda  (vision-signal NDA toggle)
--   4. Storage bucket: post-images (public read; users write to their own folder)
--   5. Storage bucket: room-documents (only room participants read/write)

-- ============================================================
-- 1. Schema additions
-- ============================================================
alter table public.posts
  add column if not exists image_url text;

alter table public.meetings
  add column if not exists timezone text;

alter table public.conversation_rooms
  add column if not exists requires_nda boolean not null default false;

-- ============================================================
-- 2. Storage buckets
-- ============================================================

-- Public bucket for post images. Anyone can read; only the author can write
-- to their own user-id folder.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Private bucket for room documents. Only room participants can read/write,
-- via the policies below.
insert into storage.buckets (id, name, public)
values ('room-documents', 'room-documents', false)
on conflict (id) do nothing;

-- ============================================================
-- 3. Storage policies — post-images
-- The convention is that files live at <user_id>/<filename>.
-- ============================================================
drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read"
  on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "post_images_owner_write" on storage.objects;
create policy "post_images_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "post_images_owner_update" on storage.objects;
create policy "post_images_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "post_images_owner_delete" on storage.objects;
create policy "post_images_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 4. Storage policies — room-documents
-- Convention: files live at <room_id>/<filename>. A user must be a
-- participant of <room_id> to read/write.
-- ============================================================
drop policy if exists "room_docs_participant_select" on storage.objects;
create policy "room_docs_participant_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'room-documents'
    and exists (
      select 1
      from public.room_participants rp
      where rp.room_id::text = (storage.foldername(name))[1]
        and rp.profile_id = auth.uid()
    )
  );

drop policy if exists "room_docs_participant_insert" on storage.objects;
create policy "room_docs_participant_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-documents'
    and exists (
      select 1
      from public.room_participants rp
      where rp.room_id::text = (storage.foldername(name))[1]
        and rp.profile_id = auth.uid()
    )
  );

drop policy if exists "room_docs_participant_update" on storage.objects;
create policy "room_docs_participant_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'room-documents'
    and exists (
      select 1
      from public.room_participants rp
      where rp.room_id::text = (storage.foldername(name))[1]
        and rp.profile_id = auth.uid()
    )
  );

drop policy if exists "room_docs_participant_delete" on storage.objects;
create policy "room_docs_participant_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-documents'
    and exists (
      select 1
      from public.room_participants rp
      where rp.room_id::text = (storage.foldername(name))[1]
        and rp.profile_id = auth.uid()
    )
  );

-- ============================================================
-- 5. Make sure room_documents has the storage_path column we need
-- to construct download URLs after the file is uploaded.
-- ============================================================
alter table public.room_documents
  add column if not exists storage_path text;
