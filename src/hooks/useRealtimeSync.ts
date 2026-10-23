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
  const lastRefreshTimeRef = useRef<number>(0);
  const pendingRefreshRef = useRef<boolean>(false);

  useEffect(() => {
    const supabase = createClient();
    const DEBOUNCE_MS = 1500;
    const MIN_INTERVAL_MS = 3000;

    const executeRefresh = () => {
      // If the document is hidden (background tab), defer refresh until visible
      if (typeof document !== 'undefined' && document.hidden) {
        pendingRefreshRef.current = true;
        return;
      }

      const now = Date.now();
      const timeSinceLast = now - lastRefreshTimeRef.current;

      if (timeSinceLast < MIN_INTERVAL_MS) {
        // Schedule trailing refresh after the minimum interval passes
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(() => {
          lastRefreshTimeRef.current = Date.now();
          pendingRefreshRef.current = false;
          router.refresh();
        }, MIN_INTERVAL_MS - timeSinceLast);
        return;
      }

      lastRefreshTimeRef.current = now;
      pendingRefreshRef.current = false;
      router.refresh();
    };

    const triggerRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(executeRefresh, DEBOUNCE_MS);
    };

    // When the user focuses back on the tab, perform deferred refresh if pending
    const handleVisibilityChange = () => {
      if (!document.hidden && pendingRefreshRef.current) {
        executeRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_edit_requests' }, () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('cero:refresh-notifications'));
        }
        triggerRefresh();
      })
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [router]);
}
