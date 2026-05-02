-- 0005_linked_accounts.sql
-- Block 9 — Optional account linking + session hot-swap.
-- ------------------------------------------------------------------
-- Records the connection between two accounts that a single user
-- controls. Each link is stored bidirectionally as two rows so that
-- both ends can see and switch to the other from their perspective.
--
--   (A, B)  → A's settings show B as a linked account
--   (B, A)  → B's settings show A as a linked account
--
-- Inserts are scoped to "your own primary" (each side authenticates
-- independently during the linking flow). Deletes are broadened so
-- either party can fully unlink — that wipes both rows in one shot.
-- ------------------------------------------------------------------

create table if not exists public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references auth.users(id) on delete cascade,
  linked_user_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (primary_user_id, linked_user_id),
  check (primary_user_id <> linked_user_id)
);

alter table public.linked_accounts enable row level security;

create policy "linked_accounts_select_own"
  on public.linked_accounts for select
  to authenticated
  using (primary_user_id = auth.uid());

create policy "linked_accounts_insert_own"
  on public.linked_accounts for insert
  to authenticated
  with check (primary_user_id = auth.uid());

-- Allow either side of the link to delete a row — when a user unlinks,
-- they can clean up both directions without needing to re-auth as the
-- other account.
create policy "linked_accounts_delete_either_side"
  on public.linked_accounts for delete
  to authenticated
  using (primary_user_id = auth.uid() or linked_user_id = auth.uid());
