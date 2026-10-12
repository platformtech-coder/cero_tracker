-- ============================================================
-- MIGRATION: pg_cron scheduled jobs
-- ============================================================
-- Schedules the daily sync Edge Function at 6:00 AM Africa/Accra (UTC+0, same timezone)
-- Requires: pg_cron extension enabled in Supabase dashboard

-- Enable pg_cron extension (if not already enabled via dashboard)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Daily sync: 6:00 AM UTC (= 6:00 AM Africa/Accra, which is UTC+0) ─────
SELECT cron.schedule(
  'daily-master-sync',     -- job name
  '0 6 * * *',             -- cron expression: 6:00 AM every day
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/sync-master-cubs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
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
