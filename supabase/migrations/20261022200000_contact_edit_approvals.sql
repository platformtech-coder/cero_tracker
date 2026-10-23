-- ─── Contact Edit Approvals System ──────────────────────────────────
-- Adds a verification & approval queue for contact edits by Relationship Officers.

CREATE TABLE IF NOT EXISTS public.contact_edit_requests (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('cub', 'family')),
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  requester_id UUID REFERENCES auth.users(id),
  requester_name TEXT NOT NULL,
  requester_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  current_data JSONB NOT NULL,
  proposed_data JSONB NOT NULL,
  changed_fields JSONB NOT NULL,
  admin_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  is_read_by_requester BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_requests_status ON public.contact_edit_requests(status);
CREATE INDEX IF NOT EXISTS idx_edit_requests_entity ON public.contact_edit_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_edit_requests_requester ON public.contact_edit_requests(requester_id, is_read_by_requester);
CREATE INDEX IF NOT EXISTS idx_edit_requests_created ON public.contact_edit_requests(created_at DESC);

ALTER TABLE public.contact_edit_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_edit_requests' AND policyname = 'Users can create edit requests'
  ) THEN
    CREATE POLICY "Users can create edit requests" ON public.contact_edit_requests
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_edit_requests' AND policyname = 'Users can view own or admin all edit requests'
  ) THEN
    CREATE POLICY "Users can view own or admin all edit requests" ON public.contact_edit_requests
      FOR SELECT TO authenticated USING (
        auth.uid() = requester_id 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_edit_requests' AND policyname = 'Admins can update edit requests'
  ) THEN
    CREATE POLICY "Admins can update edit requests" ON public.contact_edit_requests
      FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
