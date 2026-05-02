-- 0001_initial_schema.sql
-- Compound — initial schema (Block 3b)
-- Tables: profiles, follows, conversation_rooms, room_participants,
--         room_messages, room_documents, messages, posts, feedback
-- All tables have RLS enabled with policies per the Block 3b spec.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type text check (account_type in ('individual', 'company')),
  display_name text not null,
  email text,
  headline text,
  sector text,
  avatar_url text,
  bio text,
  location text,
  is_verified boolean not null default false,
  open_to_messages boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile when a user signs up.
-- Pulls name / sector / accountType from auth.users.raw_user_meta_data
-- (set by supabase.auth.signUp options.data on the client).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, account_type, display_name, email, sector)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'accountType', 'individual'),
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    new.email,
    new.raw_user_meta_data->>'sector'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users (e.g. test users created before this migration ran).
insert into public.profiles (id, account_type, display_name, email, sector)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'accountType', 'individual'),
  coalesce(
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(coalesce(u.email, 'user'), '@', 1)
  ),
  u.email,
  u.raw_user_meta_data->>'sector'
from auth.users u
where u.id not in (select id from public.profiles);

-- ============================================================
-- 2. follows
-- ============================================================
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, followed_id),
  check (follower_id <> followed_id)
);

-- ============================================================
-- 3. conversation_rooms
-- ============================================================
create table public.conversation_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sector text,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. room_participants
-- ============================================================
create table public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.conversation_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (room_id, profile_id)
);

-- When a room is created, add the creator as the owning participant.
-- Without this, the creator couldn't read their own room because the
-- conversation_rooms / room_participants policies are participant-based.
create or replace function public.handle_new_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.room_participants (room_id, profile_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

drop trigger if exists on_room_created on public.conversation_rooms;
create trigger on_room_created
  after insert on public.conversation_rooms
  for each row execute function public.handle_new_room();

-- Helper: is the calling user a participant of a given room?
-- security definer so it bypasses RLS on room_participants while evaluating policies.
create or replace function public.is_room_participant(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_participants
    where room_id = _room_id and profile_id = auth.uid()
  );
$$;

-- ============================================================
-- 5. room_messages
-- ============================================================
create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.conversation_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. room_documents
-- ============================================================
create table public.room_documents (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.conversation_rooms(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_url text,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. messages (DMs)
-- ============================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  room_context_id uuid references public.conversation_rooms(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 8. posts
-- ============================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  sector text,
  post_type text not null default 'update' check (post_type in ('update', 'opportunity', 'signal')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 9. feedback
-- ============================================================
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles            enable row level security;
alter table public.follows             enable row level security;
alter table public.conversation_rooms  enable row level security;
alter table public.room_participants   enable row level security;
alter table public.room_messages       enable row level security;
alter table public.room_documents      enable row level security;
alter table public.messages            enable row level security;
alter table public.posts               enable row level security;
alter table public.feedback            enable row level security;

-- ---------- profiles ----------
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- follows ----------
create policy "follows_select_authenticated"
  on public.follows for select
  to authenticated
  using (true);

create policy "follows_insert_self"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

create policy "follows_delete_self"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- ---------- conversation_rooms ----------
-- Creator OR participant can read.
create policy "rooms_select_participant"
  on public.conversation_rooms for select
  to authenticated
  using (created_by = auth.uid() or public.is_room_participant(id));

-- Anyone authenticated can create a room, but only as themselves.
create policy "rooms_insert_self"
  on public.conversation_rooms for insert
  to authenticated
  with check (created_by = auth.uid());

-- Only the creator can update a room.
create policy "rooms_update_creator"
  on public.conversation_rooms for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---------- room_participants ----------
create policy "room_participants_select_participant"
  on public.room_participants for select
  to authenticated
  using (public.is_room_participant(room_id));

-- Allow self-add OR add by an existing participant. (The on_room_created trigger
-- runs as definer so it inserts the owner without RLS, but direct user inserts
-- still use this rule.)
create policy "room_participants_insert"
  on public.room_participants for insert
  to authenticated
  with check (
    profile_id = auth.uid() or public.is_room_participant(room_id)
  );

create policy "room_participants_delete"
  on public.room_participants for delete
  to authenticated
  using (profile_id = auth.uid() or public.is_room_participant(room_id));

-- ---------- room_messages ----------
create policy "room_messages_select_participant"
  on public.room_messages for select
  to authenticated
  using (public.is_room_participant(room_id));

create policy "room_messages_insert_participant"
  on public.room_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid() and public.is_room_participant(room_id)
  );

-- ---------- room_documents ----------
create policy "room_documents_select_participant"
  on public.room_documents for select
  to authenticated
  using (public.is_room_participant(room_id));

create policy "room_documents_insert_participant"
  on public.room_documents for insert
  to authenticated
  with check (
    uploaded_by = auth.uid() and public.is_room_participant(room_id)
  );

create policy "room_documents_delete_uploader"
  on public.room_documents for delete
  to authenticated
  using (uploaded_by = auth.uid());

-- ---------- messages (DMs) ----------
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "messages_insert_as_sender"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid());

-- Recipient can update is_read.
create policy "messages_update_recipient"
  on public.messages for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ---------- posts ----------
create policy "posts_select_authenticated"
  on public.posts for select
  to authenticated
  using (true);

create policy "posts_insert_self"
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "posts_update_self"
  on public.posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "posts_delete_self"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid());

-- ---------- feedback ----------
-- Authenticated users may submit. No SELECT policy, so only the service_role
-- (which bypasses RLS) can read submitted feedback.
create policy "feedback_insert_self"
  on public.feedback for insert
  to authenticated
  with check (user_id = auth.uid());
