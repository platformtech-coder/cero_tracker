'use client';

import React from 'react';
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
// Modularized into ./skeletons/PageSkeletons to enable code-splitting
// ══════════════════════════════════════════════════════════════════════════════
export * from './skeletons/PageSkeletons';

