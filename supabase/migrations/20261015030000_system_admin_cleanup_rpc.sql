-- Migration: 20261015030000_system_admin_cleanup_rpc.sql
-- Description: Adds secure RPC clear_table_data and updates purge_database to support comprehensive individual and bulk table cleanup.

CREATE OR REPLACE FUNCTION public.clear_table_data(p_table text, p_cascade boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Restrict to known public tables
  IF p_table NOT IN (
    'cubs', 'master_cubs', 'families', 'email_history',
    'interactions', 'actions', 'orientation', 'reading_circle',
    'rc_attendance', 'pending_signups', 'handover_notes',
    'audit_log', 'sync_state', 'config_dropdowns', 'app_config', 'profiles'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not permitted for cleanup: ' || p_table);
  END IF;

  -- Count existing rows
  EXECUTE format('SELECT count(*)::integer FROM public.%I', p_table) INTO v_count;

  -- Handle dependencies if master_cubs
  IF p_table = 'master_cubs' THEN
    IF p_cascade THEN
      DELETE FROM public.actions;
      DELETE FROM public.interactions;
      UPDATE public.pending_signups SET matched_cub_id = NULL WHERE matched_cub_id IS NOT NULL;
      DELETE FROM public.master_cubs;
    ELSE
      DELETE FROM public.master_cubs;
    END IF;
  ELSIF p_cascade THEN
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', p_table);
  ELSE
    EXECUTE format('DELETE FROM public.%I WHERE true', p_table);
  END IF;

  RETURN jsonb_build_object('success', true, 'rows_cleared', v_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_table_data(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_table_data(text, boolean) TO authenticated;

-- Update purge_database to include email_history and handover_notes
CREATE OR REPLACE FUNCTION public.purge_database()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.actions WHERE true;
  DELETE FROM public.interactions WHERE true;
  DELETE FROM public.orientation WHERE true;
  DELETE FROM public.rc_attendance WHERE true;
  DELETE FROM public.reading_circle WHERE true;
  DELETE FROM public.pending_signups WHERE true;
  DELETE FROM public.email_history WHERE true;
  DELETE FROM public.handover_notes WHERE true;
  DELETE FROM public.cubs WHERE true;
  DELETE FROM public.master_cubs WHERE true;
  DELETE FROM public.families WHERE true;
  DELETE FROM public.audit_log WHERE true;
  DELETE FROM public.sync_state WHERE true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_database() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_database() TO authenticated;
