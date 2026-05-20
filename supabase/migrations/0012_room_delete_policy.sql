-- ============================================================================
-- 0012_room_delete_policy.sql
-- Add a DELETE RLS policy on conversation_rooms — owner only.
--
-- Without this policy, even a room's creator cannot delete via the API;
-- the only path to deletion is direct SQL in the Supabase dashboard.
-- The dependent tables (room_participants, room_documents, room_messages,
-- and the schedule_meeting_rooms join) all declare ON DELETE CASCADE on
-- room_id, so removing the conversation_rooms row collects its children
-- automatically. Storage objects in the room-documents bucket are NOT
-- cascaded — the app should clear those separately if it cares; the
-- seeded public rooms don't have any.
-- ============================================================================

DROP POLICY IF EXISTS rooms_delete_owner ON public.conversation_rooms;

CREATE POLICY rooms_delete_owner
  ON public.conversation_rooms
  FOR DELETE
  USING (created_by = auth.uid());
