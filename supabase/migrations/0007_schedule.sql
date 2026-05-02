-- 0007_schedule.sql
-- Block 13 — Meetings, invitations, and scheduling.
-- ------------------------------------------------------------------
-- Two tables:
--   meetings              — one row per scheduled meeting. Optional
--                           room_id links it to a Conversation Room.
--   meeting_participants  — invitation list per meeting, with the
--                           invitee's accept/decline status.
--
-- A trigger auto-adds the creator as an accepted participant so they
-- show up on their own meeting list.
--
-- RLS uses SECURITY DEFINER helpers (is_meeting_creator,
-- is_meeting_participant) to avoid the cross-table policy recursion
-- you'd otherwise hit when meetings policies refer to participants
-- and vice-versa.
-- ------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. meetings
-- ============================================================
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  created_by uuid not null references public.profiles(id) on delete cascade,
  note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  room_id uuid references public.conversation_rooms(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meetings_scheduled_at_idx on public.meetings (scheduled_at);
create index if not exists meetings_created_by_idx  on public.meetings (created_by);
create index if not exists meetings_room_id_idx     on public.meetings (room_id);

-- ============================================================
-- 2. meeting_participants
-- ============================================================
create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, profile_id)
);

create index if not exists meeting_participants_profile_id_idx on public.meeting_participants (profile_id);
create index if not exists meeting_participants_meeting_id_idx on public.meeting_participants (meeting_id);

-- ============================================================
-- 3. Auto-add creator as accepted participant on insert
-- ============================================================
create or replace function public.handle_new_meeting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.meeting_participants (meeting_id, profile_id, status, joined_at)
  values (new.id, new.created_by, 'accepted', now())
  on conflict (meeting_id, profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_meeting_created on public.meetings;
create trigger on_meeting_created
  after insert on public.meetings
  for each row execute function public.handle_new_meeting();

-- ============================================================
-- 4. Helpers (security definer to avoid recursive policy lookups)
-- ============================================================
create or replace function public.is_meeting_creator(_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings
    where id = _meeting_id and created_by = auth.uid()
  );
$$;

create or replace function public.is_meeting_participant(_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meeting_participants
    where meeting_id = _meeting_id and profile_id = auth.uid()
  );
$$;

-- ============================================================
-- 5. Row Level Security
-- ============================================================
alter table public.meetings              enable row level security;
alter table public.meeting_participants  enable row level security;

-- ---------- meetings ----------
create policy "meetings_select_visible"
  on public.meetings for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_meeting_participant(id)
  );

create policy "meetings_insert_self"
  on public.meetings for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "meetings_update_creator"
  on public.meetings for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "meetings_delete_creator"
  on public.meetings for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------- meeting_participants ----------
-- Visible to: the participant themselves OR the meeting creator.
create policy "meeting_participants_select"
  on public.meeting_participants for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_meeting_creator(meeting_id)
  );

-- Only the meeting creator can invite (insert) participants.
create policy "meeting_participants_insert_creator"
  on public.meeting_participants for insert
  to authenticated
  with check (public.is_meeting_creator(meeting_id));

-- Each invitee can update their own status (accept/decline).
create policy "meeting_participants_update_own"
  on public.meeting_participants for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Only the meeting creator can uninvite (delete) participants.
create policy "meeting_participants_delete_creator"
  on public.meeting_participants for delete
  to authenticated
  using (public.is_meeting_creator(meeting_id));
