'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Compass,
  BookOpenCheck,
  ShieldCheck,
  FileText,
  Settings,
  Terminal,
  LogOut,
  BarChart2,
} from 'lucide-react';
import { logout } from '@/app/(auth)/actions';
import type { Profile } from '@/lib/types';
import styles from './Sidebar.module.css';

interface CustomNavItem {
  id: string;
  label: string;
  icon: any;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Directory', href: '/directory', icon: Users },
  { label: 'Orientation', href: '/orientation', icon: Compass },
  { label: 'Reading Circle', href: '/reading-circle', icon: BookOpenCheck },
  { label: 'Engagements', href: '/engagements', icon: MessageSquare },
  { label: 'Shift Actions', href: '/shift-actions', icon: ShieldCheck },
  { label: 'Handover', href: '/handover', icon: FileText },
  { label: 'Reports', href: '/reports', icon: BarChart2 },
];

const VIEWER_NAV_ITEMS = [
  { label: 'Directory', href: '/directory', icon: Users },
  { label: 'Orientation', href: '/orientation', icon: Compass },
  { label: 'Reading Circle', href: '/reading-circle', icon: BookOpenCheck },
];

const ADMIN_ITEMS = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  profile: Profile;
  pendingCounts?: { rc: number; orientation: number };
  customNavItems?: CustomNavItem[];
  activeCustomNavId?: string;
  onCustomNavClick?: (id: string) => void;
  customLogout?: () => void;
}

export function Sidebar({ profile, pendingCounts, customNavItems, activeCustomNavId, onCustomNavClick, customLogout }: SidebarProps) {
  const pathname = usePathname();
  const isViewer = profile?.role === 'viewer';
  const navItems = isViewer ? VIEWER_NAV_ITEMS : NAV_ITEMS;

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <img src="/logo.png" alt="CERO Tracker" className={styles.logoImg} />
        <div>
          <div className={styles.logoText}>CER Dashboard</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {customNavItems ? (
          <>
            <span className={styles.navSection}>System Admin</span>
            {customNavItems.map(({ id, label, icon: Icon }) => {
              const isActive = activeCustomNavId === id;
              return (
                <button
                  key={id}
                  onClick={() => onCustomNavClick?.(id)}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <span className={styles.navSection}>{isViewer ? 'Navigation' : 'Main'}</span>
            {navItems.map(({ label, href, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/');
              const badge =
                label === 'Orientation' && (pendingCounts?.orientation ?? 0) > 0
                  ? pendingCounts!.orientation
                  : label === 'Reading Circle' && (pendingCounts?.rc ?? 0) > 0
                  ? pendingCounts!.rc
                  : null;
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={true}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                >
                  <Icon size={16} strokeWidth={2} />
                  {label}
                  {badge ? <span className={styles.navBadge}>{badge}</span> : null}
                </Link>
              );
            })}

            {!isViewer && profile?.role === 'admin' && (
              <>
                <span className={styles.navSection}>Admin</span>
                {ADMIN_ITEMS.map(({ label, href, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + '/');
                  return (
                    <Link
                      key={href}
                      href={href}
                      prefetch={true}
                      className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    >
                      <Icon size={16} strokeWidth={2} />
                      {label}
                    </Link>
                  );
                })}
              </>
            )}
          </>
        )}
      </nav>

      {/* Bottom - User info + Logout */}
      <div className={styles.sidebarBottom}>
        <form action={logout}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.userName}>{profile?.full_name || 'Unknown User'}</div>
              <div className={styles.userRole}>{profile?.role || 'admin'}</div>
            </div>
            <button type="submit" className={styles.logoutIconBtn} aria-label="Sign out">
              <LogOut size={16} strokeWidth={2} />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
