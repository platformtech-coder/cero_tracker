-- ============================================================
-- MIGRATION: pg_cron scheduled jobs
-- ============================================================
-- Schedules the daily sync Edge Function at 6:00 AM Africa/Accra (UTC+0, same timezone)
-- Requires: pg_cron extension enabled in Supabase dashboard

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Daily sync: 6:00 AM UTC (= 6:00 AM Africa/Accra, which is UTC+0) ─────
SELECT cron.schedule(
  'daily-master-sync',     -- job name
  '0 6 * * *',             -- cron expression: 6:00 AM every day
  $$
    SELECT net.http_post(
      url := 'https://dpvgnzqioqihrihabeje.supabase.co/functions/v1/sync-master-cubs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdmduenFpb3FpaHJpaGFiZWplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQxODUxNCwiZXhwIjoyMTA2OTk0NTE0fQ.IQoC4FYJPUWa5HGYg51Y2DUNR2XadOykUBjTUDzlnds'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ─── Initialise sync_state rows ─────────────────────────────────
INSERT INTO public.sync_state (sync_type, status, last_processed_row, processed_count)
VALUES
  ('master', 'idle', 0, 0),
  ('registry', 'idle', 0, 0),
  ('score_calendar', 'idle', 0, 0)
ON CONFLICT (sync_type) DO NOTHING;
