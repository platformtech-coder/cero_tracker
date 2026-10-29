'use client';

import { Sun, Moon, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import type { Profile } from '@/lib/types';
import styles from './AppShell.module.css';
import sharedStyles from '@/components/ui/dashboard.module.css';
import { LogInteractionDrawer } from '@/components/ui/LogInteractionDrawer';
import { useInteractionStore } from '@/lib/store';
import { RepFilterBar } from '@/components/ui/RepFilterBar';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { NotificationBell } from '@/components/ui/NotificationBell';

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/directory': 'Directory',
  '/orientation': 'Orientation',
  '/reading-circle': 'Reading Circle',
  '/engagements': 'Engagements',
  '/shift-actions': 'Shift Actions',
  '/handover': 'Handover Notes',
  '/settings': 'Settings',
};

interface AppShellProps {
  profile: Profile;
  pageTitle?: string;
  pendingCounts?: { rc: number; orientation: number };
  children: React.ReactNode;
  
  // Custom Sidebar Props
  customNavItems?: { id: string; label: string; icon: any }[];
  activeCustomNavId?: string;
  onCustomNavClick?: (id: string) => void;
  customLogout?: () => void;
  
  // Header options
  hideHeaderActions?: boolean;
  onRefresh?: () => void;
}

export function AppShell({ 
  profile, pageTitle, pendingCounts, children,
  customNavItems, activeCustomNavId, onCustomNavClick, customLogout, hideHeaderActions, onRefresh 
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  useRealtimeSync();

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const openInteractionDrawer = useInteractionStore(state => state.openDrawer);

  const activeTitle = pageTitle || ROUTE_TITLES[pathname] || (pathname.slice(1).charAt(0).toUpperCase() + pathname.slice(2));

  // Use provided onRefresh or fall back to router.refresh()
  const handleRefresh = onRefresh ?? (() => router.refresh());

  useEffect(() => {
    const saved = localStorage.getItem('cero-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('cero-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <div className={styles.layout}>
      <Sidebar 
        profile={profile} 
        pendingCounts={pendingCounts} 
        customNavItems={customNavItems}
        activeCustomNavId={activeCustomNavId}
        onCustomNavClick={onCustomNavClick}
        customLogout={customLogout}
      />
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {activeTitle && <h1 className={styles.pageTitle}>{activeTitle}</h1>}
          </div>
          <div className={styles.headerRight} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!hideHeaderActions && (
              <>
                <RepFilterBar profile={profile} />
                {profile?.role !== 'viewer' && (
                  <button 
                    className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`} 
                    style={{ padding: '8px 12px', fontSize: 12 }}
                    onClick={() => openInteractionDrawer()}
                  >
                    <Plus size={14} style={{ marginRight: 6 }}/> Log Interaction
                  </button>
                )}
              </>
            )}
            <NotificationBell profileRole={profile.role} isSystemAdminPortal={Boolean(customNavItems)} />
            <button
                onClick={handleRefresh}
                className={styles.themeToggle}
                aria-label="Refresh data"
                style={{ width: 36, height: 36 }}
              >
                <RefreshCw size={16} />
              </button>
            <button
              className={styles.themeToggle}
              onClick={toggleTheme}
              id="theme-toggle-btn"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </header>
        <main className={styles.content}>
          <div key={pathname} className={styles.pageTransition}>
            {children}
          </div>
        </main>
      </div>
      {profile?.role !== 'viewer' && <LogInteractionDrawer profile={profile} />}
    </div>
  );
}
