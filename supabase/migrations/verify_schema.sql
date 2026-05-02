-- Verification queries — run after 0001_initial_schema.sql.
-- Each query returns a result you can eyeball in the SQL Editor.

-- 1) Tables present in public schema, with RLS status.
select
  c.relname            as table_name,
  c.relrowsecurity     as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles', 'follows', 'conversation_rooms', 'room_participants',
    'room_messages', 'room_documents', 'messages', 'posts', 'feedback'
  )
order by c.relname;

-- 2) Policy count per table — should be > 0 for every table above.
select schemaname, tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by schemaname, tablename
order by tablename;

-- 3) Triggers on auth.users and conversation_rooms.
select event_object_schema as schema, event_object_table as table_name, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_name in ('on_auth_user_created', 'on_room_created')
order by table_name;

-- 4) Existing users got backfilled into profiles.
select count(*) as auth_users_count from auth.users;
select count(*) as profiles_count from public.profiles;
