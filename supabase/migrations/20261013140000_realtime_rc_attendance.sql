-- Ensure rc_attendance is also in supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'rc_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rc_attendance;
  END IF;
END $$;
