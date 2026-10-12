-- Drop overly strict status check constraint
ALTER TABLE public.sync_state DROP CONSTRAINT IF EXISTS sync_state_status_check;

-- Dedicated key-value config table for sheet IDs, tab names, form URLs
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.app_config
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
