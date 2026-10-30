'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  CheckCheck,
  ArrowRight,
  ShieldAlert,
  Inbox,
  Sparkles,
} from 'lucide-react';
import {
  getUserNotifications,
  markNotificationsAsRead,
  type UserNotificationItem,
} from '@/lib/actions/edit-requests';
import { createClient } from '@/lib/supabase/client';
import styles from './NotificationBell.module.css';

const FIELD_LABELS: Record<string, string> = {
  cub_first_name: 'Cub First Name',
  cub_last_name: 'Cub Last Name',
  grade: 'Grade',
  stream: 'Stream',
  school_name: 'School',
  parent_first_name: 'Parent First Name',
  parent_last_name: 'Parent Last Name',
  parent_phone: 'Phone Number',
  parent_email: 'Email',
  preferred_language: 'Language',
  alternative_contact_name: 'Alt Contact Name',
  alternative_contact_phone: 'Alt Number',
};

interface NotificationBellProps {
  profileRole?: string;
  isSystemAdminPortal?: boolean;
}

export function NotificationBell({ profileRole, isSystemAdminPortal = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');
  const [pendingList, setPendingList] = useState<UserNotificationItem[]>([]);
  const [processedList, setProcessedList] = useState<UserNotificationItem[]>([]);
  const [unreadProcessedCount, setUnreadProcessedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  // isAdmin is STRICTLY false on dashboard; only true if in the system admin portal with confirmed super_admin session
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const fetchNotifs = useCallback(async () => {
    try {
      const scope = isSystemAdminPortal ? 'system-admin' : 'dashboard';
      const res = await getUserNotifications(scope);
      setPendingList(res.pending);
      setProcessedList(res.processed);
      setUnreadProcessedCount(res.unreadProcessedCount);
      setPendingCount(res.pendingCount);
      setIsAdmin(Boolean(isSystemAdminPortal && res.isAdmin));
    } catch {
      // silently fail
    }
  }, [isSystemAdminPortal]);

  useEffect(() => {
    fetchNotifs();
    // 15-second background polling fallback
    const interval = setInterval(fetchNotifs, 15000);

    // In-tab custom event listener
    const handleCustomRefresh = () => fetchNotifs();
    window.addEventListener('cero:refresh-notifications', handleCustomRefresh);

    // Supabase Realtime channel for instant cross-tab / cross-device notifications
    const supabase = createClient();
    const channel = supabase
      .channel('cero_bell_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_edit_requests' },
        () => {
          fetchNotifs();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      window.removeEventListener('cero:refresh-notifications', handleCustomRefresh);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // When opening, if there are unread processed items on the dashboard, switch to 'processed' tab so rep sees them immediately
  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      fetchNotifs();
      if (!isSystemAdminPortal && unreadProcessedCount > 0) {
        setActiveTab('processed');
      }
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      setUnreadProcessedCount(0);
      setProcessedList((prev) => prev.map((item) => ({ ...item, is_read: true })));
      await markNotificationsAsRead();
    });
  };

  const handleItemClick = (item: UserNotificationItem) => {
    if (!isAdmin && !item.is_read) {
      startTransition(async () => {
        setProcessedList((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_read: true } : it))
        );
        setUnreadProcessedCount((prev) => Math.max(0, prev - 1));
        await markNotificationsAsRead(item.id);
      });
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  // Badge count for bell button:
  // - System Admin in /system-admin portal sees total pending requests needing action
  // - Reps & Dashboard users see unread processed items (newly approved/declined submissions)
  const bellBadgeCount = (isSystemAdminPortal && isAdmin) ? pendingCount : unreadProcessedCount;

  return (
    <div className={styles.container} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        className={`${styles.bellBtn} ${open ? styles.bellBtnActive : ''}`}
        onClick={handleToggle}
        aria-label="View notifications"
        aria-expanded={open}
        title={
          bellBadgeCount > 0
            ? `${bellBadgeCount} new notification(s)`
            : 'Notifications'
        }
      >
        <Bell size={17} />
        {bellBadgeCount > 0 && (
          <span className={styles.badge}>
            {bellBadgeCount > 9 ? '9+' : bellBadgeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={styles.dropdown}>
          {/* ─── Header ─── */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <Bell size={15} style={{ color: 'var(--primary)' }} />
              <span>{isAdmin ? 'Admin Approvals & Alerts' : 'My Edit Requests'}</span>
            </div>

            {/* ONLY Admins see the review shortcut */}
            {isAdmin && (
              <a
                href="/system-admin?tab=approvals"
                className={styles.adminLink}
                onClick={() => setOpen(false)}
              >
                Review Approvals →
              </a>
            )}
          </div>

          {/* ─── Tabs Bar ─── */}
          <div className={styles.tabsBar}>
            {/* Tab 1: Pending */}
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'pending' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <span>{isAdmin ? 'Action Required' : 'In Review'}</span>
              <span className={styles.tabPill}>{pendingList.length}</span>
            </button>

            {/* Tab 2: Processed */}
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'processed' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('processed')}
            >
              <span>{isAdmin ? 'Recent Decisions' : 'Processed'}</span>
              {!isAdmin && unreadProcessedCount > 0 ? (
                <span className={`${styles.tabPill} ${styles.tabPillAlert}`}>
                  {unreadProcessedCount} new
                </span>
              ) : (
                <span className={styles.tabPill}>{processedList.length}</span>
              )}
            </button>
          </div>

          {/* ─── Rep Processed Sub-bar: "Mark all as read" ─── */}
          {!isAdmin && activeTab === 'processed' && unreadProcessedCount > 0 && (
            <div className={styles.subBar}>
              <span>{unreadProcessedCount} unread decision{unreadProcessedCount > 1 ? 's' : ''}</span>
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={handleMarkAllRead}
              >
                <CheckCheck size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                Mark all as read
              </button>
            </div>
          )}

          {/* ─── Content List ─── */}
          <div className={styles.list}>
            {/* ════════════ TAB 1: PENDING (IN REVIEW / ACTION REQUIRED) ════════════ */}
            {activeTab === 'pending' && (
              <>
                {pendingList.length === 0 ? (
                  <div className={styles.empty}>
                    <Clock size={32} style={{ opacity: 0.25, color: '#ca8a04' }} />
                    <div className={styles.emptyTitle}>
                      {isAdmin ? 'No Action Required' : 'No Pending Requests'}
                    </div>
                    <div className={styles.emptySub}>
                      {isAdmin
                        ? 'All contact updates have been reviewed and processed.'
                        : 'Any contact edits you submit will appear here until an administrator approves or declines them.'}
                    </div>
                  </div>
                ) : (
                  pendingList.map((item) => (
                    <div key={item.id} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTitle}>
                          <span
                            className={`${styles.typeBadge} ${
                              item.entity_type === 'family' ? styles.typeBadgeFamily : ''
                            }`}
                          >
                            {item.entity_type}
                          </span>
                          <span className={styles.entityName} title={item.entity_name}>
                            {item.entity_name}
                          </span>
                        </div>
                        <span className={styles.statusBadgePending}>
                          <Clock size={10} /> In Review
                        </span>
                      </div>

                      {/* Changed fields preview */}
                      {item.changed_fields && item.changed_fields.length > 0 && (
                        <div className={styles.fieldsRow}>
                          {item.changed_fields.map((f) => (
                            <span key={f} className={styles.fieldTag}>
                              {FIELD_LABELS[f] || f}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className={styles.cardDesc}>
                        {isAdmin ? (
                          <span>
                            Submitted by <strong>{item.requester_name}</strong>
                            {item.requester_email ? ` (${item.requester_email})` : ''}
                          </span>
                        ) : (
                          <span>Your proposed changes are waiting for System Admin review.</span>
                        )}
                      </div>

                      <div className={styles.cardFooter}>
                        <span>Submitted {formatDate(item.created_at)}</span>

                        {isAdmin && (
                          <a
                            href="/system-admin?tab=approvals"
                            className={styles.reviewActionBtn}
                            onClick={() => setOpen(false)}
                          >
                            Review →
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {/* ════════════ TAB 2: PROCESSED (RESOLVED DECISIONS) ════════════ */}
            {activeTab === 'processed' && (
              <>
                {processedList.length === 0 ? (
                  <div className={styles.empty}>
                    <Inbox size={32} style={{ opacity: 0.25 }} />
                    <div className={styles.emptyTitle}>No Processed Requests</div>
                    <div className={styles.emptySub}>
                      {isAdmin
                        ? 'Recent approval decisions across the team will appear here.'
                        : 'Once an administrator works on your request, it will move from In Review to this tab.'}
                    </div>
                  </div>
                ) : (
                  processedList.map((item) => {
                    const isApproved = item.status === 'approved';
                    const isDeclined = item.status === 'declined';
                    const isUnread = !isAdmin && !item.is_read;

                    return (
                      <div
                        key={item.id}
                        className={`${styles.card} ${isUnread ? styles.cardUnread : ''}`}
                        onClick={() => handleItemClick(item)}
                      >
                        <div className={styles.cardHeader}>
                          <div className={styles.cardTitle}>
                            <span
                              className={`${styles.typeBadge} ${
                                item.entity_type === 'family' ? styles.typeBadgeFamily : ''
                              }`}
                            >
                              {item.entity_type}
                            </span>
                            <span className={styles.entityName} title={item.entity_name}>
                              {item.entity_name}
                            </span>
                            {isUnread && <span className={styles.unreadDot} title="Unread" />}
                          </div>

                          {isApproved && (
                            <span className={styles.statusBadgeApproved}>
                              <CheckCircle2 size={10} /> Approved
                            </span>
                          )}

                          {isDeclined && (
                            <span className={styles.statusBadgeDeclined}>
                              <XCircle size={10} /> Declined
                            </span>
                          )}
                        </div>

                        {/* Changed fields */}
                        {item.changed_fields && item.changed_fields.length > 0 && (
                          <div className={styles.fieldsRow}>
                            {item.changed_fields.map((f) => (
                              <span key={f} className={styles.fieldTag}>
                                {FIELD_LABELS[f] || f}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Approved feedback */}
                        {isApproved && (
                          <div className={styles.cardDesc}>
                            {isAdmin ? (
                              <span>
                                Approved by <strong>{item.reviewed_by || 'Admin'}</strong> · Synced to Supabase and Google Sheet.
                              </span>
                            ) : (
                              <span>
                                Your contact update was approved by <strong>{item.reviewed_by || 'Admin'}</strong> and synced to Google Sheets.
                              </span>
                            )}
                          </div>
                        )}

                        {/* Declined feedback with reason */}
                        {isDeclined && (
                          <>
                            <div className={styles.cardDesc}>
                              {isAdmin ? (
                                <span>
                                  Declined by <strong>{item.reviewed_by || 'Admin'}</strong>
                                </span>
                              ) : (
                                <span>
                                  Your edit request was declined by <strong>{item.reviewed_by || 'Admin'}</strong>.
                                </span>
                              )}
                            </div>
                            <div className={styles.declineReasonBox}>
                              <strong>Reason:</strong> {item.admin_notes || 'Declined without notes'}
                            </div>
                          </>
                        )}

                        <div className={styles.cardFooter}>
                          <span>
                            {item.reviewed_at
                              ? `Reviewed ${formatDate(item.reviewed_at)}`
                              : `Updated ${formatDate(item.created_at)}`}
                          </span>

                          {isAdmin && item.requester_name && (
                            <span>By {item.requester_name}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* ─── Footer: Admin shortcut ─── */}
          {isAdmin && (
            <div className={styles.footer}>
              <a
                href="/system-admin?tab=approvals"
                className={styles.footerLink}
                onClick={() => setOpen(false)}
              >
                Go to Approvals Dashboard →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
