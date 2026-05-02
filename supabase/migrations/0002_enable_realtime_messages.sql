-- 0002_enable_realtime_messages.sql
-- Enable Supabase Realtime broadcast for the public.messages table.
-- This adds messages to the supabase_realtime publication so postgres_changes
-- subscriptions on the client can receive INSERT/UPDATE/DELETE events.

alter publication supabase_realtime add table public.messages;
