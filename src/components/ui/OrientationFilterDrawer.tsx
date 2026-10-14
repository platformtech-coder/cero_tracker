'use client';

import { useState, useMemo } from 'react';
import { X, SlidersHorizontal, ChevronDown, ChevronUp, Check } from 'lucide-react';
import styles from '@/components/ui/dashboard.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────
export const ORIENTATION_FILTER_STAGES = ['Invited', 'Booked', 'Attended', 'RC Selected', 'Completed'] as const;
export const ORIENTATION_FILTER_SESSIONS = ['Tuesday', 'Sunday'] as const;
export const ORIENTATION_FILTER_STATUSES = ['Completed', 'Pending'] as const;
export const ORIENTATION_FILTER_ALERTS = [
  { key: 'suspend_14d',  label: 'To Suspend',     color: 'var(--red)' },
  { key: 'at_risk_8_14', label: 'At Risk (0 Pts)', color: 'var(--orange)' },
  { key: 'overdue_1on1', label: '1-on-1 Needed',  color: 'var(--orange)' },
  { key: 'unbooked',     label: 'Not Booked',     color: 'var(--blue)' },
  { key: 'pending_rc',   label: 'Pending RC',     color: 'var(--primary)' },
] as const;

export const SLA_WINDOW_OPTIONS = [
  { key: 'on_track', label: 'On Track (≤7d)',  color: 'var(--green)' },
  { key: 'overdue',  label: 'Overdue (>7d)',   color: 'var(--red)' },
] as const;

// ─── Filter state ─────────────────────────────────────────────────────────────
export interface OrientationFilterState {
  reps: Set<string>;
  sessions: Set<string>;
  stages: Set<string>;
  statuses: Set<string>;
  alerts: Set<string>;
  slaWindows: Set<string>;
}

export function emptyOrientationFilterState(): OrientationFilterState {
  return {
    reps: new Set(),
    sessions: new Set(),
    stages: new Set(),
    statuses: new Set(),
    alerts: new Set(),
    slaWindows: new Set(),
  };
}

export function countOrientationFilters(f: OrientationFilterState): number {
  return f.reps.size + f.sessions.size + f.stages.size + f.statuses.size + f.alerts.size + f.slaWindows.size;
}

// ─── SLA days helper ─────────────────────────────────────────────────────────
function getDaysSinceOnboarded(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const parts = dateStr.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  const today = new Date();
  const target = new Date(y, m - 1, d);
  return Math.max(0, Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─── Apply filter to orientation master items ─────────────────────────────────
export function applyOrientationFilters<T extends {
  stage?: string | null;
  stage_status?: string | null;
  session?: string | null;
  cubs: {
    relationship_owner?: string | null;
    sub_status?: string | null;
    orientation_stage?: string | null;
    orientation_stage_status?: string | null;
    date_onboarded?: string | null;
  };
}>(items: T[], f: OrientationFilterState, getAlert?: (item: T) => { key: string } | null): T[] {
  return items.filter(m => {
    // Rep filter
    if (f.reps.size > 0) {
      if (!m.cubs.relationship_owner || !f.reps.has(m.cubs.relationship_owner)) return false;
    }

    // Session filter
    if (f.sessions.size > 0) {
      if (!m.session || !f.sessions.has(m.session)) return false;
    }

    // Stage filter
    if (f.stages.size > 0) {
      const stage = (m.stage ?? '').trim().toLowerCase().replace('reading circle', 'rc');
      const matches = Array.from(f.stages).some(s =>
        s.trim().toLowerCase().replace('reading circle', 'rc') === stage
      );
      if (!matches) return false;
    }

    // Status filter (Completed / Pending)
    if (f.statuses.size > 0) {
      const isCompleted =
        (m.stage_status ?? '').trim().toLowerCase() === 'completed' ||
        (m.stage ?? '').toLowerCase().includes('completed');
      const effectiveStatus = isCompleted ? 'Completed' : 'Pending';
      if (!f.statuses.has(effectiveStatus)) return false;
    }

    // Status alert filter
    if (f.alerts.size > 0 && getAlert) {
      const alert = getAlert(m);
      if (!alert || !f.alerts.has(alert.key)) return false;
    }

    // SLA Window filter
    if (f.slaWindows.size > 0) {
      const days = getDaysSinceOnboarded(m.cubs.date_onboarded);
      let slaMatch = false;
      if (f.slaWindows.has('on_track') && days !== null && days <= 7) slaMatch = true;
      if (f.slaWindows.has('overdue') && days !== null && days > 7) slaMatch = true;
      if (!slaMatch) return false;
    }

    return true;
  });
}

// ─── Pill button ──────────────────────────────────────────────────────────────
function Pill({ label, selected, onClick, accent }: {
  label: string;
  selected: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        background: selected ? (accent ?? 'var(--primary)') : 'var(--bg-input)',
        color: selected ? '#fff' : 'var(--text-2)',
        border: `1.5px solid ${selected ? (accent ?? 'var(--primary)') : 'var(--border)'}`,
      }}
    >
      {selected && <Check size={11} strokeWidth={3} />}
      {label}
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 9px',
          color: 'var(--text-1)', fontWeight: 700, fontSize: 11.5,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {title}
          {!!count && count > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: '#fff',
              borderRadius: 100, padding: '1px 6px', lineHeight: 1.6,
            }}>
              {count}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─── Main Drawer Component ────────────────────────────────────────────────────
interface OrientationFilterDrawerProps {
  allReps?: string[];
  extraSessions?: string[];
  value: OrientationFilterState;
  onChange: (next: OrientationFilterState) => void;
  onReset: () => void;
  totalActive: number;
}

export function OrientationFilterDrawer({
  allReps = [],
  extraSessions = [],
  value,
  onChange,
  onReset,
  totalActive,
}: OrientationFilterDrawerProps) {
  const [open, setOpen] = useState(false);

  const allSessions = useMemo(() => {
    const s = new Set([...ORIENTATION_FILTER_SESSIONS, ...extraSessions]);
    return Array.from(s).sort();
  }, [extraSessions]);

  const set = (patch: Partial<OrientationFilterState>) => onChange({ ...value, ...patch });

  const toggleSet = (
    key: keyof OrientationFilterState,
    val: string
  ) => {
    const next = new Set(value[key]);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    set({ [key]: next });
  };

  const activePills = useMemo(() => {
    const pills: { label: string; remove: () => void }[] = [];
    value.reps.forEach(r => pills.push({ label: `Rep: ${r}`, remove: () => toggleSet('reps', r) }));
    value.sessions.forEach(s => pills.push({ label: `Session: ${s}`, remove: () => toggleSet('sessions', s) }));
    value.stages.forEach(s => pills.push({ label: `Stage: ${s}`, remove: () => toggleSet('stages', s) }));
    value.statuses.forEach(s => pills.push({ label: `Status: ${s}`, remove: () => toggleSet('statuses', s) }));
    value.alerts.forEach(a => {
      const meta = ORIENTATION_FILTER_ALERTS.find(m => m.key === a);
      pills.push({ label: meta?.label ?? a, remove: () => toggleSet('alerts', a) });
    });
    value.slaWindows.forEach(s => {
      const meta = SLA_WINDOW_OPTIONS.find(o => o.key === s);
      pills.push({ label: `SLA: ${meta?.label ?? s}`, remove: () => toggleSet('slaWindows', s) });
    });
    return pills;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.2s',
          background: totalActive > 0 ? 'var(--primary-dim)' : 'var(--bg-input)',
          color: totalActive > 0 ? 'var(--primary)' : 'var(--text-2)',
          border: `1.5px solid ${totalActive > 0 ? 'var(--primary)' : 'var(--border)'}`,
          flexShrink: 0,
        }}
      >
        <SlidersHorizontal size={14} />
        Filters
        {totalActive > 0 && (
          <span style={{
            background: 'var(--primary)', color: '#fff',
            borderRadius: 100, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.6,
          }}>
            {totalActive}
          </span>
        )}
      </button>

      {/* Active pill row */}
      {activePills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {activePills.map((pill, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: 'var(--primary-dim)', color: 'var(--primary)',
              border: '1.5px solid var(--border)',
            }}>
              {pill.label}
              <button
                type="button"
                onClick={pill.remove}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--primary)', opacity: 0.7 }}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Drawer overlay + panel */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 19998, backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, width: '100%', maxWidth: 400, height: '100vh',
            background: 'var(--bg-2)', zIndex: 19999,
            boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            animation: 'orientationFilterSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}>

            {/* Header */}
            <div style={{
              padding: '20px 20px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={16} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>Orientation Filters</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {totalActive > 0 && (
                  <button
                    type="button"
                    onClick={onReset}
                    style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                    }}
                  >
                    Reset all
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className={styles.drawerClose}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {/* Relationship Owner */}
              {allReps.length > 0 && (
                <Section title="Relationship Owner" count={value.reps.size}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allReps.map(r => (
                      <Pill key={r} label={r} selected={value.reps.has(r)} onClick={() => toggleSet('reps', r)} />
                    ))}
                  </div>
                </Section>
              )}

              {/* Session Day */}
              <Section title="Session Day" count={value.sessions.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allSessions.map(s => (
                    <Pill key={s} label={s} selected={value.sessions.has(s)} onClick={() => toggleSet('sessions', s)} />
                  ))}
                </div>
              </Section>

              {/* Orientation Stage */}
              <Section title="Orientation Stage" count={value.stages.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ORIENTATION_FILTER_STAGES.map(stage => (
                    <Pill key={stage} label={stage} selected={value.stages.has(stage)} onClick={() => toggleSet('stages', stage)} />
                  ))}
                </div>
              </Section>

              {/* Orientation Status */}
              <Section title="Orientation Status" count={value.statuses.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ORIENTATION_FILTER_STATUSES.map(status => (
                    <Pill key={status} label={status} selected={value.statuses.has(status)} onClick={() => toggleSet('statuses', status)} />
                  ))}
                </div>
              </Section>

              {/* SLA Window */}
              <Section title="SLA Window" count={value.slaWindows.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SLA_WINDOW_OPTIONS.map(opt => (
                    <Pill
                      key={opt.key}
                      label={opt.label}
                      selected={value.slaWindows.has(opt.key)}
                      onClick={() => toggleSet('slaWindows', opt.key)}
                      accent={opt.color}
                    />
                  ))}
                </div>
              </Section>

              {/* Status Alert */}
              <Section title="Status Alert" count={value.alerts.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ORIENTATION_FILTER_ALERTS.map(alert => (
                    <Pill
                      key={alert.key}
                      label={alert.label}
                      selected={value.alerts.has(alert.key)}
                      onClick={() => toggleSet('alerts', alert.key)}
                      accent={alert.color}
                    />
                  ))}
                </div>
              </Section>

            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, background: 'var(--primary)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                Apply{totalActive > 0 ? ` (${totalActive} active)` : ''}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes orientationFilterSlideIn {
              from { transform: translateX(100%); }
              to   { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}
