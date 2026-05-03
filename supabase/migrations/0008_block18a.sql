-- Block 18a — UX fixes
--   1. ai_conversations: persist AI chatbox history per user.
--   2. conversation_rooms.sector_other: free-text custom sector when 'Other'
--      is picked at room creation.

-- ============================================================
-- 1. ai_conversations
-- ============================================================
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

-- Owners can read their own conversations.
create policy ai_conversations_select_own
  on public.ai_conversations
  for select
  using (auth.uid() = user_id);

-- Owners can insert conversations as themselves.
create policy ai_conversations_insert_own
  on public.ai_conversations
  for insert
  with check (auth.uid() = user_id);

-- Owners can update their own conversations (used to append messages).
create policy ai_conversations_update_own
  on public.ai_conversations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Owners can delete their own conversations.
create policy ai_conversations_delete_own
  on public.ai_conversations
  for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh on any update.
create or replace function public.touch_ai_conversations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.touch_ai_conversations_updated_at();

-- ============================================================
-- 2. conversation_rooms.sector_other
-- ============================================================
alter table public.conversation_rooms
  add column if not exists sector_other text;
