'use client';

import { useState, useMemo, useRef } from 'react';
import { X, SlidersHorizontal, ChevronDown, ChevronUp, Check, Search } from 'lucide-react';
import styles from '@/components/ui/dashboard.module.css';

// ─── Orientation config ───────────────────────────────────────────────────────
export const ORIENTATION_STAGES = ['Invited', 'Booked', 'Attended', 'RC Selected', 'Completed'] as const;
export type OrientationStage = typeof ORIENTATION_STAGES[number];

export const ORIENTATION_STATUSES = ['Completed', 'Pending'] as const;
export type OrientationStatus = typeof ORIENTATION_STATUSES[number];

// ─── Sub-status config ────────────────────────────────────────────────────────
const SUB_STATUSES = ['active', 'almost expiring', 'expired', 'suspended'] as const;
const EXPIRY_RANGES = [
  { key: 'this_week',   label: 'This Week' },
  { key: 'next_week',   label: 'Next Week' },
  { key: 'this_month',  label: 'This Month' },
] as const;
type ExpiryRange = typeof EXPIRY_RANGES[number]['key'];

// ─── Flag config ──────────────────────────────────────────────────────────────
const FLAG_ORDER = [
  '📞 Call Parent',
  '⚠️ 5-Day Break',
  '⚠️ 6-Day Break',
  '⚠️ 7-Day Break',
  '🚨 8-Day Break',
  '🚨 9-Day Break',
  '🚨 10-Day Break',
] as const;

// ─── Filter state type ────────────────────────────────────────────────────────
export interface CubFilterState {
  subStatuses: Set<string>;                               // 'active' | 'almost expiring' | 'expired' | 'suspended'
  expiryRange: ExpiryRange | '';                          // only active when 'almost expiring' is in subStatuses
  orientationStages: Set<string>;                         // 'Invited' | 'Booked' | 'Attended' | 'RC Selected' | 'Completed'
  orientationStatuses: Set<string>;                       // 'Completed' | 'Pending'
  schools: Set<string>;
  flags: Set<string>;
  segments: Set<string>;
  reps?: Set<string>;
}

export function emptyCubFilterState(): CubFilterState {
  return {
    subStatuses: new Set(),
    expiryRange: '',
    orientationStages: new Set(),
    orientationStatuses: new Set(),
    schools: new Set(),
    flags: new Set(),
    segments: new Set(),
    reps: new Set(),
  };
}

export function countCubFilters(f: CubFilterState): number {
  let n = f.subStatuses.size;
  if (f.expiryRange) n += 1;
  n += f.orientationStages.size + f.orientationStatuses.size;
  n += f.schools.size + f.flags.size + f.segments.size;
  if (f.reps) n += f.reps.size;
  return n;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtStatus(s: string) {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── Date-range helpers (week starts Sunday) ─────────────────────────────────
function getWeekBounds(offsetWeeks = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + offsetWeeks * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  return { start: sunday, end: saturday };
}

function matchesExpiryRange(subEndDate: string | null | undefined, range: ExpiryRange | ''): boolean {
  if (!range || !subEndDate) return true;
  const d = new Date(subEndDate);
  if (range === 'this_week') {
    const { start, end } = getWeekBounds(0);
    return d >= start && d <= end;
  }
  if (range === 'next_week') {
    const { start, end } = getWeekBounds(1);
    return d >= start && d <= end;
  }
  if (range === 'this_month') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return true;
}

// ─── Apply filter to cub list ─────────────────────────────────────────────────
export function applyCubFilters<T extends {
  sub_status?: string | null;
  sub_end_date?: string | null;
  orientation_stage?: string | null;
  orientation_stage_status?: string | null;
  school_name?: string | null;
  flag?: string | null;
  segment?: string | null;
}>(cubs: T[], f: CubFilterState): T[] {
  return cubs.filter(c => {
    // Sub-status
    if (f.subStatuses.size > 0) {
      if (!c.sub_status || !f.subStatuses.has(c.sub_status)) return false;
      // Extra date range sub-filter for "almost expiring"
      if (f.subStatuses.has('almost expiring') && c.sub_status === 'almost expiring') {
        if (!matchesExpiryRange(c.sub_end_date, f.expiryRange)) return false;
      }
    }

    // Orientation stages & statuses (pending covers any not completed)
    if (f.orientationStages.size > 0 || f.orientationStatuses.size > 0) {
      const cubStage = c.orientation_stage ?? '';
      const isCompleted = (c.orientation_stage_status ?? '').trim().toLowerCase() === 'completed';
      const effectiveStatus = isCompleted ? 'Completed' : 'Pending';

      if (f.orientationStages.size > 0) {
        const matchesStage = Array.from(f.orientationStages).some(st => {
          const s1 = st.trim().toLowerCase().replace('reading circle', 'rc');
          const s2 = cubStage.trim().toLowerCase().replace('reading circle', 'rc');
          return s1 === s2;
        });
        if (!matchesStage) return false;
      }

      if (f.orientationStatuses.size > 0) {
        if (!f.orientationStatuses.has(effectiveStatus)) return false;
      }
    }

    // Schools
    if (f.schools.size > 0) {
      if (!c.school_name || !f.schools.has(c.school_name)) return false;
    }

    // Flags
    if (f.flags.size > 0) {
      if (!c.flag || !f.flags.has(c.flag)) return false;
    }

    // Segments
    if (f.segments.size > 0) {
      if (!c.segment || !f.segments.has(c.segment)) return false;
    }

    // Reps
    if (f.reps && f.reps.size > 0) {
      const rep = (c as any).relationship_owner;
      if (!rep || !f.reps.has(rep)) return false;
    }

    return true;
  });
}

// ─── Apply filter to orientation master items ────────────────────────────────
export function applyOrientationMasterFilters<T extends {
  stage?: string | null;
  stage_status?: string | null;
  cubs: {
    relationship_owner?: string | null;
    segment?: string | null;
    sub_status?: string | null;
    sub_end_date?: string | null;
    school_name?: string | null;
    flag?: string | null;
    orientation_stage?: string | null;
    orientation_stage_status?: string | null;
  };
}>(items: T[], f: CubFilterState): T[] {
  return items.filter(m => {
    // Sub-status
    if (f.subStatuses.size > 0) {
      if (!m.cubs.sub_status || !f.subStatuses.has(m.cubs.sub_status)) return false;
      if (f.subStatuses.has('almost expiring') && m.cubs.sub_status === 'almost expiring') {
        if (!matchesExpiryRange(m.cubs.sub_end_date, f.expiryRange)) return false;
      }
    }

    // Orientation stages & statuses
    if (f.orientationStages.size > 0 || f.orientationStatuses.size > 0) {
      const stage = m.stage ?? m.cubs.orientation_stage ?? '';
      const isCompleted = (m.stage_status ?? m.cubs.orientation_stage_status ?? '').trim().toLowerCase() === 'completed';
      const effectiveStatus = isCompleted ? 'Completed' : 'Pending';

      if (f.orientationStages.size > 0) {
        const matchesStage = Array.from(f.orientationStages).some(st => {
          const s1 = st.trim().toLowerCase().replace('reading circle', 'rc');
          const s2 = stage.trim().toLowerCase().replace('reading circle', 'rc');
          return s1 === s2;
        });
        if (!matchesStage) return false;
      }

      if (f.orientationStatuses.size > 0) {
        if (!f.orientationStatuses.has(effectiveStatus)) return false;
      }
    }

    // Schools
    if (f.schools.size > 0) {
      if (!m.cubs.school_name || !f.schools.has(m.cubs.school_name)) return false;
    }

    // Flags
    if (f.flags.size > 0) {
      if (!m.cubs.flag || !f.flags.has(m.cubs.flag)) return false;
    }

    // Segments
    if (f.segments.size > 0) {
      if (!m.cubs.segment || !f.segments.has(m.cubs.segment)) return false;
    }

    // Reps
    if (f.reps && f.reps.size > 0) {
      if (!m.cubs.relationship_owner || !f.reps.has(m.cubs.relationship_owner)) return false;
    }

    return true;
  });
}

// ─── Pill toggle button ───────────────────────────────────────────────────────
function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        background: selected ? 'var(--primary)' : 'var(--bg-input)',
        color: selected ? '#fff' : 'var(--text-2)',
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
      }}
    >
      {selected && <Check size={11} strokeWidth={3} />}
      {label}
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
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
          color: 'var(--text-1)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {title}
          {!!count && count > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: '#fff', borderRadius: 100, padding: '1px 6px', lineHeight: 1.6 }}>
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

// ─── School search section ────────────────────────────────────────────────────
function SchoolFilterSection({ allSchools, selected, onToggle }: {
  allSchools: string[];
  selected: Set<string>;
  onToggle: (school: string) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allSchools.slice(0, 10);
    return allSchools.filter(s => s.toLowerCase().includes(q)).slice(0, 15);
  }, [query, allSchools]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Selected tags */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
          {Array.from(selected).map(school => (
            <span key={school} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: 'var(--primary)', color: '#fff',
            }}>
              {school}
              <button
                type="button"
                onClick={() => onToggle(school)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#fff', opacity: 0.8 }}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search school name..."
          style={{
            width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, fontSize: 12,
            border: '1px solid var(--border)', background: 'var(--bg-input)',
            color: 'var(--text-1)', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Suggestions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
        {filtered.map(school => {
          const isSelected = selected.has(school);
          return (
            <button
              key={school}
              type="button"
              onClick={() => { onToggle(school); setQuery(''); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', transition: 'background 0.12s', textAlign: 'left',
                background: isSelected ? 'var(--primary-dim)' : 'transparent',
                color: isSelected ? 'var(--primary)' : 'var(--text-1)',
                border: 'none',
              }}
            >
              {school}
              {isSelected && <Check size={12} strokeWidth={2.5} color="var(--primary)" />}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0', textAlign: 'center' }}>
            No schools found
          </div>
        )}
        {!query && allSchools.length > 10 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 10px' }}>
            Type to search {allSchools.length} schools…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main drawer component ────────────────────────────────────────────────────
interface DirectoryCubFilterProps {
  allSchools?: string[];
  allSegments?: string[];
  allReps?: string[];
  value: CubFilterState;
  onChange: (next: CubFilterState) => void;
  onReset: () => void;
  totalActive: number;
}

export function DirectoryCubFilter({
  allSchools = [], allSegments = ['Gen. Comm', 'CDLS', 'RCS'], allReps = [], value, onChange, onReset, totalActive,
}: DirectoryCubFilterProps) {
  const [open, setOpen] = useState(false);

  // helpers
  const set = (patch: Partial<CubFilterState>) => onChange({ ...value, ...patch });

  const toggleSet = (
    key: keyof Pick<CubFilterState, 'subStatuses' | 'schools' | 'flags' | 'segments' | 'orientationStages' | 'orientationStatuses' | 'reps'>,
    val: string
  ) => {
    const next = new Set(value[key]);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    set({ [key]: next });
  };

  // Active pills for the toolbar row
  const activePills: { label: string; remove: () => void }[] = useMemo(() => {
    const pills: { label: string; remove: () => void }[] = [];
    value.subStatuses.forEach(s => pills.push({ label: `Sub: ${fmtStatus(s)}`, remove: () => toggleSet('subStatuses', s) }));
    if (value.expiryRange && value.subStatuses.has('almost expiring')) {
      const rl = EXPIRY_RANGES.find(r => r.key === value.expiryRange)?.label ?? value.expiryRange;
      pills.push({ label: `Expiry: ${rl}`, remove: () => set({ expiryRange: '' }) });
    }
    value.orientationStages.forEach(stage => {
      pills.push({ label: `Stage: ${stage}`, remove: () => toggleSet('orientationStages', stage) });
    });
    value.orientationStatuses.forEach(status => {
      pills.push({ label: `Status: ${status}`, remove: () => toggleSet('orientationStatuses', status) });
    });
    value.schools.forEach(s => pills.push({ label: `School: ${s}`, remove: () => toggleSet('schools', s) }));
    value.flags.forEach(f => pills.push({ label: f, remove: () => toggleSet('flags', f) }));
    value.segments.forEach(s => pills.push({ label: `Seg: ${s}`, remove: () => toggleSet('segments', s) }));
    value.reps?.forEach(r => pills.push({ label: `Rep: ${r}`, remove: () => toggleSet('reps', r) }));
    return pills;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      {/* ── Trigger ── */}
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
          <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 100, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.6 }}>
            {totalActive}
          </span>
        )}
      </button>

      {/* ── Active pills row ── */}
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
              <button type="button" onClick={pill.remove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--primary)', opacity: 0.7 }}>
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button" onClick={onReset}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Drawer ── */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 19998, backdropFilter: 'blur(2px)' }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, width: '100%', maxWidth: 400, height: '100vh',
            background: 'var(--bg-2)', zIndex: 19999,
            boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            animation: 'cubFilterSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}>

            {/* Header */}
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={16} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>Advanced Filters</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {totalActive > 0 && (
                  <button type="button" onClick={onReset} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
                    Reset all
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className={styles.drawerClose}><X size={18} /></button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {/* ── Relationship Owner (Rep) ── */}
              {allReps.length > 0 && (
                <Section title="Relationship Owner (Rep)" count={value.reps?.size || 0}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allReps.map(r => (
                      <Pill key={r} label={r} selected={value.reps?.has(r) || false} onClick={() => toggleSet('reps', r)} />
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Segment ── */}
              {allSegments.length > 0 && (
                <Section title="Segment" count={value.segments.size}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allSegments.map(s => (
                      <Pill key={s} label={s} selected={value.segments.has(s)} onClick={() => toggleSet('segments', s)} />
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Sub Status ── */}
              <Section title="Sub Status" count={value.subStatuses.size + (value.expiryRange ? 1 : 0)}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUB_STATUSES.map(s => (
                    <Pill key={s} label={fmtStatus(s)} selected={value.subStatuses.has(s)} onClick={() => toggleSet('subStatuses', s)} />
                  ))}
                </div>
                {/* Sub-option: date range when "almost expiring" is selected */}
                {value.subStatuses.has('almost expiring') && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 8 }}>
                      Expiry window
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Pill label="Any time" selected={!value.expiryRange} onClick={() => set({ expiryRange: '' })} />
                      {EXPIRY_RANGES.map(r => (
                        <Pill key={r.key} label={r.label} selected={value.expiryRange === r.key} onClick={() => set({ expiryRange: r.key })} />
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* ── Orientation ── */}
              <Section title="Orientation" count={value.orientationStages.size + value.orientationStatuses.size}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 6 }}>
                      Stage
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ORIENTATION_STAGES.map(stage => (
                        <Pill
                          key={stage}
                          label={stage}
                          selected={value.orientationStages.has(stage)}
                          onClick={() => toggleSet('orientationStages', stage)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 6 }}>
                      Status
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ORIENTATION_STATUSES.map(status => (
                        <Pill
                          key={status}
                          label={status}
                          selected={value.orientationStatuses.has(status)}
                          onClick={() => toggleSet('orientationStatuses', status)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              {/* ── Flags ── */}
              <Section title="Flag" count={value.flags.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {FLAG_ORDER.map(f => (
                    <Pill key={f} label={f} selected={value.flags.has(f)} onClick={() => toggleSet('flags', f)} />
                  ))}
                </div>
              </Section>

              {/* ── Schools ── */}
              <Section title="School" count={value.schools.size}>
                <SchoolFilterSection
                  allSchools={allSchools}
                  selected={value.schools}
                  onToggle={s => toggleSet('schools', s)}
                />
              </Section>

            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ width: '100%', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Apply{totalActive > 0 ? ` (${totalActive} active)` : ''}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes cubFilterSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}
