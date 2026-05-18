-- Block 19 — Newsfeed
-- Curated industry news for each user, surfaced in the right sidebar
-- below Ask Compound. Topics live in profiles.feed_preferences
-- (existing JSONB column — adds newsfeed_topics array + last_fetched
-- timestamp, no schema change to profiles).
--
-- This migration:
--   1. Creates newsfeed_items table to persist fetched news so we
--      don't re-call the AI on every page load.
--   2. Adds RLS so each user only sees their own items.

create table public.newsfeed_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  headline     text not null,
  source_name  text,
  source_url   text not null,
  summary      text,
  fetched_at   timestamptz not null default now()
);

-- Query pattern: load the most recent N items for a given user.
create index newsfeed_items_user_fetched_idx
  on public.newsfeed_items (user_id, fetched_at desc);

alter table public.newsfeed_items enable row level security;

create policy newsfeed_items_select_own
  on public.newsfeed_items
  for select
  using (auth.uid() = user_id);

create policy newsfeed_items_insert_own
  on public.newsfeed_items
  for insert
  with check (auth.uid() = user_id);

create policy newsfeed_items_update_own
  on public.newsfeed_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy newsfeed_items_delete_own
  on public.newsfeed_items
  for delete
  using (auth.uid() = user_id);
