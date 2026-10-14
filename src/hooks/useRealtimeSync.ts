'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Global Realtime Sync hook.
 * Subscribes to Supabase postgres_changes on core application tables
 * and automatically triggers a debounced router.refresh() so the UI stays live
 * across tabs, users, and webhooks without requiring manual browser reload.
 */
export function useRealtimeSync() {
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const triggerRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        router.refresh();
      }, 400);
    };

    const channel = supabase
      .channel('cero_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orientation' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reading_circle' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_signups' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cubs' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_notes' }, triggerRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rc_attendance' }, triggerRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [router]);
}
