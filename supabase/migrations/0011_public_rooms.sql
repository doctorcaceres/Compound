-- ============================================================================
-- 0011_public_rooms.sql
-- Add public/private split to conversation_rooms + relax RLS so any
-- authenticated user can read public rooms and join themselves.
--
-- Schema notes:
--   - conversation_rooms.description already exists (added in 0001), so we
--     only add is_public here. We do widen the column comment for clarity.
--   - The room_participants self-join is already allowed by the existing
--     room_participants_insert WITH CHECK clause (profile_id = auth.uid()),
--     so a public-room "Join" works without a new policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Column
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversation_rooms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.conversation_rooms.is_public IS
  'When true the room is browsable and joinable by any authenticated user. When false only the creator and explicit participants can see or join.';

COMMENT ON COLUMN public.conversation_rooms.description IS
  'Public summary shown on the Public Rooms list. Required by application when is_public = true; optional for private rooms.';

-- Partial index — most queries either want "only the public ones" or "rooms
-- I'm in." A partial index keeps this lightweight as the table grows.
CREATE INDEX IF NOT EXISTS idx_conversation_rooms_is_public
  ON public.conversation_rooms (created_at DESC)
  WHERE is_public = true;

-- ----------------------------------------------------------------------------
-- 2. RLS — conversation_rooms
-- ----------------------------------------------------------------------------

-- SELECT: replace participant-only policy with one that also allows
-- everyone to read public rooms.
DROP POLICY IF EXISTS rooms_select_participant ON public.conversation_rooms;
DROP POLICY IF EXISTS rooms_select_participant_or_public ON public.conversation_rooms;

CREATE POLICY rooms_select_participant_or_public
  ON public.conversation_rooms
  FOR SELECT
  USING (
    is_public = true
    OR created_by = auth.uid()
    OR public.is_room_participant(id)
  );

-- INSERT: keep self-as-creator, but additionally require the creator to be a
-- verified company account when is_public = true. This enforces the UI
-- rule server-side so a non-company user can't bypass it via the API.
DROP POLICY IF EXISTS rooms_insert_self ON public.conversation_rooms;

CREATE POLICY rooms_insert_self
  ON public.conversation_rooms
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      is_public = false
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.account_type = 'company'
          AND (p.is_verified = true OR p.domain IS NOT NULL)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. RLS — room_participants
-- ----------------------------------------------------------------------------
-- The existing select policy only lets you see participants of rooms you're
-- a participant of. That hides the participant count on Public Rooms cards
-- for non-participants. Relax it so anyone can see the participant list of
-- any public room (read-only). Private rooms still require participation.
DROP POLICY IF EXISTS room_participants_select_participant ON public.room_participants;
DROP POLICY IF EXISTS room_participants_select_participant_or_public ON public.room_participants;

CREATE POLICY room_participants_select_participant_or_public
  ON public.room_participants
  FOR SELECT
  USING (
    public.is_room_participant(room_id)
    OR EXISTS (
      SELECT 1
      FROM public.conversation_rooms cr
      WHERE cr.id = room_participants.room_id
        AND cr.is_public = true
    )
  );

-- INSERT / DELETE policies stay as-is. The existing INSERT permits
-- profile_id = auth.uid() (so self-join works for public rooms). The
-- existing DELETE permits profile_id = auth.uid() (so self-leave works).

-- ----------------------------------------------------------------------------
-- 4. Seed — 5 starter public rooms
-- ----------------------------------------------------------------------------
-- Each seed room needs a real creator (created_by FK + the on_room_created
-- trigger that inserts the creator as participant). We pick the best
-- available existing profile in priority order:
--   1. verified company  2. any company  3. any profile
-- If the database has zero profiles, the inserts are no-ops and the seeds
-- can be re-run safely after the first user signs up.
--
-- The WHERE NOT EXISTS guards against duplicate seeds on re-run since there
-- is no unique constraint on (name, is_public).
INSERT INTO public.conversation_rooms (name, description, sector, status, created_by, is_public)
SELECT
  v.name, v.description, v.sector, 'active', creator.id, true
FROM (VALUES
  (
    'Energy & Power Hub',
    'Open forum for the energy transition — grid modernization, renewables deployment, storage economics, and the operational realities of running power infrastructure at scale.',
    'energy'
  ),
  (
    'Biotech & Life Sciences Forum',
    'A public space for biotech founders, researchers, and operators to discuss clinical trial design, regulatory pathways (FDA / EMA), platform technologies, and translational science.',
    'biotech'
  ),
  (
    'Climate & Sustainability Discussion',
    'Public conversation on climate strategy across industries — carbon markets, scope-3 emissions accounting, sustainable supply chains, and credible corporate decarbonization plans.',
    'climate'
  ),
  (
    'Technology & AI Trends',
    'Discussion of emerging technology and applied AI — model capabilities, deployment patterns, infrastructure economics, evals, and industry-specific applications.',
    'tech'
  ),
  (
    'Healthcare Innovation',
    'Forum for healthcare providers, digital health builders, and payors to discuss innovation in care delivery, value-based payment models, and measurable patient outcomes.',
    'healthcare'
  )
) AS v(name, description, sector)
CROSS JOIN LATERAL (
  SELECT id
  FROM public.profiles
  ORDER BY
    CASE
      WHEN account_type = 'company' AND (is_verified = true OR domain IS NOT NULL) THEN 0
      WHEN account_type = 'company' THEN 1
      ELSE 2
    END,
    created_at ASC
  LIMIT 1
) AS creator
WHERE NOT EXISTS (
  SELECT 1
  FROM public.conversation_rooms cr
  WHERE cr.name = v.name AND cr.is_public = true
);
