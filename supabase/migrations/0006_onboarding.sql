-- 0006_onboarding.sql
-- Block 12 — AI conversational onboarding.
-- ------------------------------------------------------------------
-- Adds two columns to profiles:
--   onboarded         — true after the user finishes the onboarding chat.
--                       Existing rows are backfilled to true so they don't
--                       get bumped through onboarding on next login.
--   feed_preferences  — JSONB blob storing answers from onboarding (topics,
--                       looking_for, etc.) so the feed can be personalized
--                       later. Schema is loose by design.
-- Plus a public `avatars` storage bucket and policies that let an
-- authenticated user upload only into their own folder (path prefix =
-- their user id) while letting anyone read.
-- ------------------------------------------------------------------

-- ============================================================
-- 1. profiles columns
-- ============================================================
alter table public.profiles
  add column if not exists onboarded boolean not null default false;

alter table public.profiles
  add column if not exists feed_preferences jsonb;

-- Backfill: existing accounts (created before this migration) skip onboarding.
update public.profiles
set onboarded = true
where onboarded = false
  and created_at < now();

-- ============================================================
-- 2. avatars storage bucket + policies
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read of any avatar object.
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Authenticated users may write only into their own folder
-- (object name must begin with `<auth.uid()>/`).
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name like (auth.uid()::text || '/%')
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name like (auth.uid()::text || '/%')
  )
  with check (
    bucket_id = 'avatars'
    and name like (auth.uid()::text || '/%')
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name like (auth.uid()::text || '/%')
  );
