'use client';

import React from 'react';
import {
  BarChart3,
  Compass,
  Baby,
  CalendarCheck,
  Calendar,
  Users,
  BookOpen,
  ListChecks,
  MessageCircle,
  Sun,
  AlertTriangle,
  List,
  BarChart2,
  Flag,
  BookOpenCheck,
  TrendingDown,
} from 'lucide-react';
import sharedStyles from '@/components/ui/dashboard.module.css';
import tabStyles from '@/app/(auth)/engagements/engagements.module.css';

// ─── Base Primitive Skeleton ──────────────────────────────────────────────────
export function Skeleton({
  width,
  height,
  borderRadius = '8px',
  style,
  className = '',
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${sharedStyles.skeleton} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? '1rem',
        borderRadius,
        display: 'inline-block',
        ...style,
      }}
    />
  );
}

// ─── Stat Card Skeleton ───────────────────────────────────────────────────────
export function SkeletonStatCard() {
  return (
    <div className={sharedStyles.statCard} style={{ pointerEvents: 'none' }} aria-hidden="true">
      <div className={sharedStyles.statHeader}>
        <Skeleton width="55%" height={12} borderRadius={4} />
        <Skeleton width={32} height={32} borderRadius={8} />
      </div>
      <Skeleton width="40%" height={30} borderRadius={6} style={{ marginTop: 6 }} />
      <Skeleton width="70%" height={11} borderRadius={4} style={{ marginTop: 6 }} />
    </div>
  );
}

// ─── Scorecard Mini Card Skeleton ─────────────────────────────────────────────
export function SkeletonScorecard({ count = 4, title = '7-Day Orientation Scorecard (Gen. Comm)' }: { count?: number; title?: string }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', fontWeight: 600 }}>
        {title}
      </div>
      <div className={sharedStyles.statsGrid} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Tab Navigation Skeleton ─────────────────────────────────────────────────
// Tab LABELS and ICONS are always real UI elements; only badge count numbers use skeleton placeholders.
export interface SkeletonTabItem {
  label: string;
  icon?: React.ReactNode;
  /** When true the badge count is still loading — render an authentic badge pill with a skeleton number. */
  hasBadge?: boolean;
  badgeVariant?: 'primary' | 'orange' | 'red';
  /** For inline count patterns like "Today (3)" where only the number inside parentheses is skeletonized */
  inlineCount?: boolean;
  isActive?: boolean;
}

export function SkeletonTabs({
  tabs,
}: {
  tabs: SkeletonTabItem[];
}) {
  return (
    <div className={tabStyles.tabs} style={{ marginBottom: '1.25rem' }}>
      {tabs.map((t, i) => {
        const isActive = t.isActive ?? (i === 0);
        return (
          <button
            key={i}
            className={`${tabStyles.tabBtn} ${isActive ? tabStyles.tabBtnActive : ''}`}
            disabled
            style={{ pointerEvents: 'none' }}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.inlineCount && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                marginLeft: 4,
                color: t.badgeVariant === 'red' ? 'var(--red)' : undefined,
                fontWeight: t.badgeVariant === 'red' ? 'bold' : undefined,
              }}>
                <span>(</span>
                <span
                  className={sharedStyles.skeleton}
                  style={{
                    width: 14,
                    height: 12,
                    borderRadius: 3,
                    display: 'inline-block',
                    background: t.badgeVariant === 'red' ? 'rgba(253, 107, 86, 0.35)' : undefined,
                  }}
                />
                <span>)</span>
              </span>
            )}
            {t.hasBadge && (
              <span
                className={tabStyles.tabBadge}
                style={{
                  background: t.badgeVariant === 'orange' ? 'var(--orange)' : 'var(--primary)',
                  minWidth: 18,
                  height: 18,
                  padding: '0 4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 6,
                }}
              >
                <span
                  className={sharedStyles.skeleton}
                  style={{
                    width: 12,
                    height: 8,
                    borderRadius: 2,
                    background: 'rgba(255, 255, 255, 0.55)',
                    display: 'inline-block',
                  }}
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Table Skeleton ───────────────────────────────────────────────────────────
export interface SkeletonColumn {
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export function SkeletonTable({
  rows = 10,
  columns,
  showSearch = true,
  showFilters = true,
  rightAction,
  banner,
}: {
  rows?: number;
  columns: SkeletonColumn[];
  showSearch?: boolean;
  showFilters?: boolean;
  rightAction?: boolean | React.ReactNode;
  banner?: React.ReactNode;
}) {
  return (
    <div className={sharedStyles.tableWrap} style={{ pointerEvents: 'none' }}>
      {/* Table controls toolbar */}
      <div className={sharedStyles.tableControls}>
        <div className={sharedStyles.tableControlsLeft} style={{ gap: 8, flexWrap: 'wrap' }}>
          {showSearch && (
            <Skeleton width={220} height={34} borderRadius={8} />
          )}
          {showFilters && (
            <>
              <Skeleton width={110} height={34} borderRadius={8} />
              <Skeleton width={130} height={34} borderRadius={8} />
            </>
          )}
        </div>
        <div className={sharedStyles.tableControlsRight} style={{ gap: 8 }}>
          {rightAction === true ? (
            <Skeleton width={100} height={34} borderRadius={8} />
          ) : rightAction ? (
            rightAction
          ) : null}
          <Skeleton width={80} height={14} borderRadius={4} />
        </div>
      </div>

      {/* Optional Filter Indicator Banner */}
      {banner}

      {/* Table Header and Body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <table className={sharedStyles.table} style={{ width: '100%' }}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    width: col.width,
                    padding: '12px 14px',
                    textAlign: col.align || 'left',
                  }}
                >
                  <Skeleton
                    width={col.align === 'center' ? '50%' : '70%'}
                    height={11}
                    borderRadius={4}
                    style={col.align === 'center' ? { margin: '0 auto' } : col.align === 'right' ? { marginLeft: 'auto' } : undefined}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rIdx) => (
              <tr key={rIdx}>
                {columns.map((col, cIdx) => {
                  const widths = ['85%', '60%', '45%', '70%', '55%', '40%', '65%'];
                  const w = widths[(rIdx + cIdx) % widths.length];
                  return (
                    <td
                      key={cIdx}
                      style={{
                        padding: '12px 14px',
                        textAlign: col.align || 'left',
                      }}
                    >
                      <Skeleton
                        width={col.align === 'center' ? '50%' : col.align === 'right' ? '30%' : w}
                        height={13}
                        borderRadius={4}
                        style={col.align === 'center' ? { margin: '0 auto' } : col.align === 'right' ? { marginLeft: 'auto' } : undefined}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className={sharedStyles.pagination} style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
        <Skeleton width={160} height={12} borderRadius={4} />
        <div style={{ display: 'flex', gap: 6 }}>
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={28} height={28} borderRadius={6} />
        </div>
      </div>
    </div>
  );
}

// ─── Activity Timeline Item Skeleton (for Drawers) ───────────────────────────
export function SkeletonActivityTimeline({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 12,
            padding: '12px',
            borderRadius: 10,
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
          }}
        >
          <Skeleton width={36} height={36} borderRadius={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width="40%" height={13} borderRadius={4} />
              <Skeleton width="25%" height={10} borderRadius={4} />
            </div>
            <Skeleton width="85%" height={11} borderRadius={4} />
            <Skeleton width="60%" height={10} borderRadius={4} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE CONTENT SKELETONS (Accurately mirroring each page & tab layout)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 1. Dashboard Skeleton:
 * Real order: StatsGrid (8 cards) → 7-Day Orientation Scorecard (4 cards)
 *             → Actions table (6 cols: Cub, Parent, Action, Deadline, Status, Handled By)
 */
export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-hidden="true">
      {/* 8 Core Stats Grid */}
      <div className={sharedStyles.statsGrid}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* 7-Day Orientation Scorecard (4 cards) */}
      <SkeletonScorecard count={4} title="7-Day Orientation Scorecard (Gen. Comm)" />

      {/* Assigned Actions Table (6 columns) */}
      <div style={{ marginTop: '0.5rem' }}>
        <div className={sharedStyles.sectionHeader} style={{ marginBottom: '0.75rem' }}>
          <Skeleton width={140} height={16} borderRadius={4} />
          <Skeleton width={60} height={14} borderRadius={4} />
        </div>
        <SkeletonTable
          rows={7}
          columns={[
            { header: 'Cub', width: '18%' },
            { header: 'Parent', width: '17%' },
            { header: 'Action', width: '28%' },
            { header: 'Deadline', width: '13%' },
            { header: 'Status', width: '12%' },
            { header: 'Handled By', width: '12%' },
          ]}
          showSearch={true}
          showFilters={true}
        />
      </div>
    </div>
  );
}

/**
 * 2. Directory Skeleton:
 * Tabs: Cubs (active) | Families
 * Table: 9 cols matching DirectoryClient.tsx
 */
export function DirectorySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} aria-hidden="true">
      <SkeletonTabs
        tabs={[
          { label: 'Cubs', icon: <Baby size={14} style={{ marginRight: 6 }} />, isActive: true },
          { label: 'Families', icon: <Users size={14} style={{ marginRight: 6 }} /> },
        ]}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SkeletonTable
          rows={12}
          columns={[
            { header: 'Last Engagement', width: '13%' },
            { header: 'Cub Name', width: '18%' },
            { header: 'Grade', width: '7%' },
            { header: 'Stream', width: '7%' },
            { header: 'Segment', width: '10%' },
            { header: 'Sub Status', width: '10%' },
            { header: 'Stage', width: '12%' },
            { header: 'Stage Status', width: '11%' },
            { header: 'Flag', width: '12%' },
          ]}
          showSearch={true}
          showFilters={true}
        />
      </div>
    </div>
  );
}

/**
 * 3. Orientation Skeleton — Stats tab (default):
 * Tabs: Stats (active with BarChart3) | Master Journey (Compass) | New Cubs (Baby) | Booking Confirmation (CalendarCheck) | Upcoming Sessions (Calendar)
 * Tab names and icons are REAL; only the count numbers are skeleton pills.
 * Stats tab content: Right-aligned filter toolbar → 5 KPI cards → Journey Volume Totals mini cards → 8-col table with centered columns
 */
export function OrientationSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-hidden="true">
      {/* Tab navigation — real names & icons; skeleton badge numbers */}
      <SkeletonTabs
        tabs={[
          { label: 'Stats', icon: <BarChart3 size={13} style={{ marginRight: 4 }} />, isActive: true },
          { label: 'Master Journey', icon: <Compass size={13} style={{ marginRight: 4 }} />, hasBadge: true },
          { label: 'New Cubs', icon: <Baby size={13} style={{ marginRight: 4 }} />, hasBadge: true, badgeVariant: 'orange' },
          { label: 'Booking Confirmation', icon: <CalendarCheck size={13} style={{ marginRight: 4 }} />, hasBadge: true },
          { label: 'Upcoming Sessions', icon: <Calendar size={13} style={{ marginRight: 4 }} />, hasBadge: true },
        ]}
      />

      {/* Cubs Date Filter toolbar — right-aligned selects matching OrientationStatsDashboard */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '0.25rem',
      }}>
        <Skeleton width={150} height={34} borderRadius={8} />
        <Skeleton width={140} height={34} borderRadius={8} />
      </div>

      {/* Primary Performance KPIs — 5 stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem',
      }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '1.1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width="60%" height={11} borderRadius={4} />
              <Skeleton width={26} height={26} borderRadius={6} />
            </div>
            <Skeleton width="45%" height={32} borderRadius={6} style={{ marginTop: 2 }} />
            <Skeleton width="75%" height={11} borderRadius={4} style={{ marginTop: 2 }} />
          </div>
        ))}
      </div>

      {/* Journey Volume Totals */}
      <div>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 700 }}>
            Journey Volume Totals
          </span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
            }}>
              <Skeleton width={32} height={32} borderRadius={8} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Skeleton width="60%" height={18} borderRadius={4} />
                <Skeleton width="80%" height={10} borderRadius={3} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Queue & Cubs Directory Table (8 cols matching OrientationStatsDashboard) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SkeletonTable
          rows={8}
          columns={[
            { header: 'Cub', width: '18%' },
            { header: 'Parent', width: '15%' },
            { header: 'Onboarded', width: '12%', align: 'center' },
            { header: 'Status Alert', width: '14%', align: 'center' },
            { header: 'Stage', width: '13%', align: 'center' },
            { header: 'Cum. Term Points', width: '10%', align: 'center' },
            { header: 'Rep', width: '14%', align: 'center' },
            { header: '', width: '6%', align: 'right' },
          ]}
          showSearch={true}
          showFilters={true}
          rightAction={true}
          banner={(
            <div style={{
              background: 'var(--bg-input)',
              borderBottom: '1px solid var(--border)',
              padding: '0.5rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <Skeleton width={200} height={12} borderRadius={4} />
              <Skeleton width={60} height={12} borderRadius={4} />
            </div>
          )}
        />
      </div>
    </div>
  );
}

/**
 * 4. Reading Circle Skeleton — Stats tab (default):
 * Tabs: Stats (BarChart3) | Booking Confirmation (CalendarCheck) | RC Roster (BookOpen)
 * Tab names and icons are REAL; only badge numbers are skeleton placeholders.
 * Stats tab content: 3 RC stat cards + 5-col Pending RC Selection Table
 */
export function ReadingCircleSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-hidden="true">
      <SkeletonTabs
        tabs={[
          { label: 'Stats', icon: <BarChart3 size={14} style={{ marginRight: 6 }} />, hasBadge: true, isActive: true },
          { label: 'Booking Confirmation', icon: <CalendarCheck size={14} style={{ marginRight: 6 }} />, hasBadge: true },
          { label: 'RC Roster', icon: <BookOpen size={14} style={{ marginRight: 6 }} />, hasBadge: true },
        ]}
      />

      {/* 3 RC Stats cards matching ReadingCircleClient.tsx Stats tab */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.25rem' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '0.875rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <Skeleton width={32} height={32} borderRadius={8} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Skeleton width="50%" height={18} borderRadius={4} />
              <Skeleton width="85%" height={10} borderRadius={3} />
            </div>
          </div>
        ))}
      </div>

      {/* Pending RC Selection Table (5 cols) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SkeletonTable
          rows={10}
          columns={[
            { header: 'Cub', width: '24%' },
            { header: 'Parent', width: '22%' },
            { header: 'Onboarded', width: '16%' },
            { header: 'Orientation Stage', width: '20%' },
            { header: 'Rep', width: '18%' },
          ]}
          showSearch={true}
          showFilters={false}
        />
      </div>
    </div>
  );
}

/**
 * 5. Engagements Skeleton — Actions tab (default):
 * Tabs: Actions [badge number] (active) | Interactions Log
 * Tab names and icons are REAL; only badge count is a skeleton placeholder.
 * Actions tab: 6-col table (Deadline, Cub, Parent, Handled By, Status, Action)
 */
export function EngagementsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} aria-hidden="true">
      <SkeletonTabs
        tabs={[
          { label: 'Actions', icon: <ListChecks size={14} style={{ marginRight: 6 }} />, hasBadge: true, isActive: true },
          { label: 'Interactions Log', icon: <MessageCircle size={14} style={{ marginRight: 6 }} /> },
        ]}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SkeletonTable
          rows={10}
          columns={[
            { header: 'Deadline', width: '13%' },
            { header: 'Cub', width: '18%' },
            { header: 'Parent', width: '16%' },
            { header: 'Handled By', width: '14%' },
            { header: 'Status', width: '12%' },
            { header: 'Action', width: '27%' },
          ]}
          showSearch={true}
          showFilters={true}
        />
      </div>
    </div>
  );
}

/**
 * 6. Shift Actions Skeleton — Today tab (default):
 * Tabs: Today (count) | Overdue (count) | Upcoming (count)
 * Tab names, icons, and parentheses are REAL; only the count numbers are skeleton placeholders.
 * Table: 5 cols (Cub, Action Details, Deadline, Handled By, Actions) — no search/filter toolbar
 */
export function ShiftActionsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} aria-hidden="true">
      <SkeletonTabs
        tabs={[
          { label: 'Today', icon: <Sun size={14} style={{ marginRight: 6 }} />, inlineCount: true, isActive: true },
          { label: 'Overdue', icon: <AlertTriangle size={14} style={{ marginRight: 6 }} />, inlineCount: true, badgeVariant: 'red' },
          { label: 'Upcoming', icon: <Calendar size={14} style={{ marginRight: 6 }} />, inlineCount: true },
        ]}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SkeletonTable
          rows={8}
          columns={[
            { header: 'Cub', width: '25%' },
            { header: 'Action Details', width: '35%' },
            { header: 'Deadline', width: '18%' },
            { header: 'Handled By', width: '14%' },
            { header: 'Actions', width: '8%' },
          ]}
          showSearch={false}
          showFilters={false}
        />
      </div>
    </div>
  );
}

/**
 * 7. Handover Notes Skeleton:
 * No tabs — single-view page.
 * Table: 5 cols (Date & Time, Logged By, Summary, Pending Issues, Actions)
 * Toolbar: search + rep filter select + "New Note" button (rightAction)
 */
export function HandoverSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} aria-hidden="true">
      <SkeletonTable
        rows={8}
        columns={[
          { header: 'Date & Time', width: '15%' },
          { header: 'Logged By', width: '15%' },
          { header: 'Summary', width: '35%' },
          { header: 'Pending Issues', width: '28%' },
          { header: 'Actions', width: '7%' },
        ]}
        showSearch={true}
        showFilters={true}
        rightAction={true}
      />
    </div>
  );
}

/**
 * 8. Settings Skeleton — User Management tab (default):
 * Tabs: User Management (active) | Interactions Dropdown | RC & Ori Sessions
 * User Management tab: table card with "Add User" action button + 4-col users table
 */
export function SettingsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-hidden="true">
      <SkeletonTabs
        tabs={[
          { label: 'User Management', icon: <Users size={14} style={{ marginRight: 6 }} />, isActive: true },
          { label: 'Interactions Dropdown', icon: <List size={14} style={{ marginRight: 6 }} /> },
          {
            label: 'RC & Ori Sessions',
            icon: (
              <>
                <BookOpen size={14} style={{ marginRight: 4 }} />
                <Calendar size={14} style={{ marginRight: 4 }} />
              </>
            ),
          },
        ]}
      />

      {/* User Management card — toolbar + users table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
      }}>
        {/* Toolbar — "Add User" button only on the right */}
        <div className={sharedStyles.tableControls}>
          <div className={sharedStyles.tableControlsLeft} />
          <div className={sharedStyles.tableControlsRight}>
            <Skeleton width={100} height={34} borderRadius={8} />
          </div>
        </div>
        {/* Users table (4 cols: Name, Email, Role, Actions) */}
        <table className={sharedStyles.table} style={{ width: '100%' }}>
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Actions'].map((_, i) => (
                <th key={i} style={{ padding: '12px 14px' }}>
                  <Skeleton width="70%" height={11} borderRadius={4} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, rIdx) => (
              <tr key={rIdx}>
                {['75%', '85%', '50%', '40%'].map((w, cIdx) => (
                  <td key={cIdx} style={{ padding: '12px 14px' }}>
                    <Skeleton width={w} height={13} borderRadius={4} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 9. Exact Tab Skeletons for Reports:
 * Perfectly mirrors each tab's unique stat card layout, button toolbar, and table structure.
 */

// ─── 9a. Flags (Call Parents) Skeleton ───────────────────────────
export function FlagsReportSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }} aria-hidden="true">
      {/* 4 Stat Boxes (matching consolidated structure) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem',
      }}>
        {/* Card 1: Families Due */}
        <div className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className={sharedStyles.statHeader}>
              <Skeleton width={80} height={12} borderRadius={4} />
              <Skeleton width={28} height={28} borderRadius={8} />
            </div>
            <Skeleton width={55} height={28} borderRadius={6} style={{ marginTop: 6 }} />
          </div>
          <Skeleton width={120} height={11} borderRadius={4} style={{ marginTop: 8 }} />
        </div>

        {/* Card 2: Families Called (Split: Called vs Not Called) */}
        <div className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className={sharedStyles.statHeader} style={{ marginBottom: 6 }}>
            <Skeleton width={90} height={12} borderRadius={4} />
            <Skeleton width={55} height={18} borderRadius={10} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <Skeleton width={40} height={10} borderRadius={3} />
              <Skeleton width={45} height={24} borderRadius={5} style={{ marginTop: 4 }} />
              <Skeleton width={50} height={10} borderRadius={3} style={{ marginTop: 4 }} />
            </div>
            <div style={{ width: 1, height: 38, background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <Skeleton width={55} height={10} borderRadius={3} />
              <Skeleton width={45} height={24} borderRadius={5} style={{ marginTop: 4 }} />
              <Skeleton width={50} height={10} borderRadius={3} style={{ marginTop: 4 }} />
            </div>
          </div>
          <Skeleton width={130} height={10} borderRadius={4} style={{ marginTop: 8 }} />
        </div>

        {/* Card 3: Families Reached */}
        <div className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className={sharedStyles.statHeader}>
              <Skeleton width={100} height={12} borderRadius={4} />
              <Skeleton width={75} height={18} borderRadius={10} />
            </div>
            <Skeleton width={50} height={28} borderRadius={6} style={{ marginTop: 6 }} />
          </div>
          <Skeleton width={115} height={11} borderRadius={4} style={{ marginTop: 8 }} />
        </div>

        {/* Card 4: Not Reached */}
        <div className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className={sharedStyles.statHeader}>
              <Skeleton width={80} height={12} borderRadius={4} />
              <Skeleton width={28} height={28} borderRadius={8} />
            </div>
            <Skeleton width={45} height={28} borderRadius={6} style={{ marginTop: 6 }} />
          </div>
          <Skeleton width={135} height={11} borderRadius={4} style={{ marginTop: 8 }} />
        </div>
      </div>

      {/* Export Button Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Skeleton width={105} height={30} borderRadius={7} />
      </div>

      {/* Flags 10-Column Centered Table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              {['Date', 'Rep', 'Families Due', 'Cubs Due', 'Called', 'Reached', 'Not Reached', 'Not Called', 'Cubs Covered', 'Call Rate'].map((col, i) => (
                <th key={col} style={{ padding: '10px 14px', textAlign: i < 2 ? 'left' : 'center' }}>
                  <Skeleton width={i < 2 ? 60 : 45} height={11} borderRadius={4} style={{ display: 'inline-block' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
                {Array.from({ length: 10 }).map((_, c) => (
                  <td key={c} style={{ padding: '10px 14px', textAlign: c < 2 ? 'left' : 'center' }}>
                    <Skeleton width={c < 2 ? 70 : 35} height={12} borderRadius={4} style={{ display: 'inline-block' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 9b. Daily Activity Skeleton ────────────────────────────────
export function DailyActivitySkeleton() {
  const cards = [
    { label: 'Total Calls', width: 75 },
    { label: 'Successful (Reached)', width: 120 },
    { label: 'Unsuccessful', width: 85 },
    { label: 'Messages Sent', width: 95 },
    { label: 'Total Interactions Logged', width: 145 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }} aria-hidden="true">
      {/* 5 KPI Stat Cards Grid */}
      <div className={sharedStyles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        {cards.map((c, i) => (
          <div key={i} className={sharedStyles.statCard}>
            <div className={sharedStyles.statHeader}>
              <Skeleton width={c.width} height={12} borderRadius={4} />
              <Skeleton width={28} height={28} borderRadius={8} />
            </div>
            <Skeleton width={50} height={28} borderRadius={6} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>

      {/* Export CSV Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Skeleton width={105} height={30} borderRadius={7} />
      </div>

      {/* 6-Column Table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              {['Rep', 'Total Calls', 'Reached', 'Not Reached', 'Messages Sent', 'Total Interactions'].map((col, i) => (
                <th key={col} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'center' }}>
                  <Skeleton width={i === 0 ? 55 : 65} height={11} borderRadius={4} style={{ display: 'inline-block' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
                {Array.from({ length: 6 }).map((_, c) => (
                  <td key={c} style={{ padding: '10px 14px', textAlign: c === 0 ? 'left' : 'center' }}>
                    <Skeleton width={c === 0 ? 80 : 40} height={12} borderRadius={4} style={{ display: 'inline-block' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 9c. Reading Circle Skeleton ────────────────────────────────
export function RCReportSkeleton() {
  const cards = [
    { label: 'Expected in Sessions', labelW: 120, valW: 50, subW: 100 },
    { label: 'Present (Attended)', labelW: 110, valW: 50, subW: 120 },
    { label: 'Absent', labelW: 55, valW: 45, subW: 105 },
    { label: 'Never Attended', labelW: 95, valW: 40, subW: 130 },
    { label: 'Overall Attendance Rate', labelW: 135, valW: 55, subW: 115 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }} aria-hidden="true">
      {/* 5 KPI Stat Cards Grid */}
      <div className={sharedStyles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        {cards.map((c, i) => (
          <div key={i} className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className={sharedStyles.statHeader}>
                <Skeleton width={c.labelW} height={12} borderRadius={4} />
                <Skeleton width={28} height={28} borderRadius={8} />
              </div>
              <Skeleton width={c.valW} height={28} borderRadius={6} style={{ marginTop: 6 }} />
            </div>
            <Skeleton width={c.subW} height={11} borderRadius={4} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Export CSV Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Skeleton width={105} height={30} borderRadius={7} />
      </div>

      {/* 6-Column Session Table with bottom padding */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: '2.5rem',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              {['Session', 'Expected', 'Marked', 'Present', 'Absent', 'Rate'].map((col, i) => (
                <th key={col} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'center' }}>
                  <Skeleton width={i === 0 ? 75 : 50} height={11} borderRadius={4} style={{ display: 'inline-block' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
                {Array.from({ length: 6 }).map((_, c) => (
                  <td key={c} style={{ padding: '10px 14px', textAlign: c === 0 ? 'left' : 'center' }}>
                    <Skeleton width={c === 0 ? 110 : 35} height={12} borderRadius={4} style={{ display: 'inline-block' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 9d. Orientation Skeleton ───────────────────────────────────
export function OrientationReportSkeleton() {
  const cards = [
    { label: 'Total Gen Comm Cubs', labelW: 125, valW: 50, subW: 95 },
    { label: 'Completed', labelW: 75, valW: 45, subW: 120 },
    { label: 'Left (Not Completed)', labelW: 120, valW: 45, subW: 135 },
    { label: 'In Progress', labelW: 75, valW: 45, subW: 90 },
    { label: 'Not Started', labelW: 75, valW: 40, subW: 125 },
    { label: 'Show Rate', labelW: 70, valW: 50, subW: 120 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }} aria-hidden="true">
      {/* 6 KPI Stat Cards Grid */}
      <div className={sharedStyles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        {cards.map((c, i) => (
          <div key={i} className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className={sharedStyles.statHeader}>
                <Skeleton width={c.labelW} height={12} borderRadius={4} />
                <Skeleton width={28} height={28} borderRadius={8} />
              </div>
              <Skeleton width={c.valW} height={28} borderRadius={6} style={{ marginTop: 6 }} />
            </div>
            <Skeleton width={c.subW} height={11} borderRadius={4} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Title & Action Buttons Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Skeleton width={260} height={14} borderRadius={4} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={155} height={30} borderRadius={7} />
          <Skeleton width={105} height={30} borderRadius={7} />
        </div>
      </div>

      {/* 8-Column Rep Breakdown Table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              {['Rep', 'Total Gen Comm', 'Completed', 'Left (Pending)', 'In Progress', 'Not Started', 'Attended', 'Show Rate'].map((col, i) => (
                <th key={col} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'center' }}>
                  <Skeleton width={i === 0 ? 50 : 60} height={11} borderRadius={4} style={{ display: 'inline-block' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
                {Array.from({ length: 8 }).map((_, c) => (
                  <td key={c} style={{ padding: '10px 14px', textAlign: c === 0 ? 'left' : 'center' }}>
                    <Skeleton width={c === 0 ? 80 : 35} height={12} borderRadius={4} style={{ display: 'inline-block' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 9e. Expiry & Retention Skeleton ────────────────────────────
export function ExpiryReportSkeleton() {
  const cards = [
    { label: 'Total Gen Comm', labelW: 95, valW: 50, subW: 125 },
    { label: 'Active Subscriptions', labelW: 115, valW: 50, subW: 95 },
    { label: 'Expiring in 7 Days', labelW: 110, valW: 40, subW: 120 },
    { label: 'Expiring in 30 Days', labelW: 115, valW: 45, subW: 100 },
    { label: 'Expired', labelW: 60, valW: 45, subW: 130 },
    { label: 'Retention Rate', labelW: 90, valW: 50, subW: 125 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }} aria-hidden="true">
      {/* 6 KPI Stat Cards Grid */}
      <div className={sharedStyles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        {cards.map((c, i) => (
          <div key={i} className={sharedStyles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className={sharedStyles.statHeader}>
                <Skeleton width={c.labelW} height={12} borderRadius={4} />
                <Skeleton width={28} height={28} borderRadius={8} />
              </div>
              <Skeleton width={c.valW} height={28} borderRadius={6} style={{ marginTop: 6 }} />
            </div>
            <Skeleton width={c.subW} height={11} borderRadius={4} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Export CSV Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Skeleton width={105} height={30} borderRadius={7} />
      </div>

      {/* 7-Column Retention Table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              {['Rep', 'Total Gen Comm', 'Active', 'Expiring ≤ 7d', 'Expiring ≤ 30d', 'Expired', 'Retention Rate'].map((col, i) => (
                <th key={col} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'center' }}>
                  <Skeleton width={i === 0 ? 50 : 60} height={11} borderRadius={4} style={{ display: 'inline-block' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
                {Array.from({ length: 7 }).map((_, c) => (
                  <td key={c} style={{ padding: '10px 14px', textAlign: c === 0 ? 'left' : 'center' }}>
                    <Skeleton width={c === 0 ? 80 : 35} height={12} borderRadius={4} style={{ display: 'inline-block' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────
export function ReportsTabContentSkeleton({ tab }: { tab: string }) {
  switch (tab) {
    case 'flags':
      return <FlagsReportSkeleton />;
    case 'rc':
      return <RCReportSkeleton />;
    case 'orientation':
      return <OrientationReportSkeleton />;
    case 'expiry':
      return <ExpiryReportSkeleton />;
    case 'daily':
    default:
      return <DailyActivitySkeleton />;
  }
}

// ─── Main Reports Skeleton (Full Page or Tab Content) ────────────
export function ReportsSkeleton({
  activeTab = 'daily',
  hideHeader = false,
}: {
  activeTab?: string;
  hideHeader?: boolean;
}) {
  const tabs = [
    { label: 'Daily Activity', icon: <BarChart2 size={13} style={{ marginRight: 6 }} />, isActive: activeTab === 'daily' },
    { label: 'Flags', icon: <Flag size={13} style={{ marginRight: 6 }} />, isActive: activeTab === 'flags' },
    { label: 'Reading Circle', icon: <BookOpenCheck size={13} style={{ marginRight: 6 }} />, isActive: activeTab === 'rc' },
    { label: 'Orientation', icon: <Compass size={13} style={{ marginRight: 6 }} />, isActive: activeTab === 'orientation' },
    { label: 'Expiry & Retention', icon: <TrendingDown size={13} style={{ marginRight: 6 }} />, isActive: activeTab === 'expiry' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }} aria-hidden="true">
      {!hideHeader && (
        <>
          {/* Navigation Tabs */}
          <SkeletonTabs tabs={tabs} />

          {/* Filter Toolbar Placeholder (inline-flex, fit-content) */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: '1.25rem',
            padding: '8px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            width: 'fit-content',
          }}>
            <Skeleton width={140} height={30} borderRadius={6} />
            <Skeleton width={110} height={24} borderRadius={6} />
          </div>
        </>
      )}

      {/* Exact Tab-Specific Content Skeleton */}
      <ReportsTabContentSkeleton tab={activeTab} />
    </div>
  );
}
