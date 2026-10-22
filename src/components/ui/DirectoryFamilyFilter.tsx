'use client';

import { useState, useMemo, useRef } from 'react';
import { X, SlidersHorizontal, ChevronDown, ChevronUp, Check, Search } from 'lucide-react';
import styles from '@/components/ui/dashboard.module.css';

// ─── Filter state ─────────────────────────────────────────────────────────────
export interface FamilyFilterState {
  segments: Set<string>;
  subStatuses: Set<string>;
  schools: Set<string>;
  reps: Set<string>;
  minCubs: string;
  maxCubs: string;
}

export function emptyFamilyFilterState(): FamilyFilterState {
  return {
    segments: new Set(),
    subStatuses: new Set(),
    schools: new Set(),
    reps: new Set(),
    minCubs: '',
    maxCubs: '',
  };
}

export function countFamilyFilters(f: FamilyFilterState): number {
  let n = f.segments.size + f.subStatuses.size + f.schools.size + f.reps.size;
  if (f.minCubs !== '') n += 1;
  if (f.maxCubs !== '') n += 1;
  return n;
}

// ─── Apply filters ────────────────────────────────────────────────────────────
export function applyFamilyFilters<T extends {
  segments?: string[] | null;
  sub_statuses?: string[] | null;
  schools?: string[] | null;
  relationship_owner?: string | null;
  no_cubs?: number;
}>(families: T[], f: FamilyFilterState): T[] {
  return families.filter(fam => {
    if (f.segments.size > 0) {
      const famSegs = fam.segments ?? [];
      if (!famSegs.some(s => f.segments.has(s))) return false;
    }
    if (f.subStatuses.size > 0) {
      const famSubs = fam.sub_statuses ?? [];
      if (!famSubs.some(s => f.subStatuses.has(s))) return false;
    }
    if (f.schools.size > 0) {
      const famSchools = fam.schools ?? [];
      if (!famSchools.some(s => f.schools.has(s))) return false;
    }
    if (f.reps.size > 0) {
      if (!fam.relationship_owner || !f.reps.has(fam.relationship_owner)) return false;
    }
    const cubCount = fam.no_cubs ?? 0;
    if (f.minCubs !== '' && cubCount < Number(f.minCubs)) return false;
    if (f.maxCubs !== '' && cubCount > Number(f.maxCubs)) return false;
    return true;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtStatus(s: string) {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const SUB_STATUSES = ['active', 'almost expiring', 'expired', 'suspended'] as const;

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

// ─── Searchable school section ────────────────────────────────────────────────
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
            color: 'var(--text-1)', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>
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
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0', textAlign: 'center' }}>No schools found</div>
        )}
        {!query && allSchools.length > 10 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 10px' }}>Type to search {allSchools.length} schools…</div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface DirectoryFamilyFilterProps {
  allSchools?: string[];
  allSegments?: string[];
  allReps?: string[];
  value: FamilyFilterState;
  onChange: (next: FamilyFilterState) => void;
  onReset: () => void;
  totalActive: number;
}

export function DirectoryFamilyFilter({
  allSchools = [],
  allSegments = ['Gen. Comm', 'CDLS', 'RCS'],
  allReps = [],
  value,
  onChange,
  onReset,
  totalActive,
}: DirectoryFamilyFilterProps) {
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<FamilyFilterState>) => onChange({ ...value, ...patch });

  const toggleSet = (
    key: keyof Pick<FamilyFilterState, 'segments' | 'subStatuses' | 'schools' | 'reps'>,
    val: string
  ) => {
    const next = new Set(value[key]);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    set({ [key]: next });
  };

  const activePills: { label: string; remove: () => void }[] = useMemo(() => {
    const pills: { label: string; remove: () => void }[] = [];
    value.segments.forEach(s => pills.push({ label: `Seg: ${s}`, remove: () => toggleSet('segments', s) }));
    value.subStatuses.forEach(s => pills.push({ label: `Sub: ${fmtStatus(s)}`, remove: () => toggleSet('subStatuses', s) }));
    value.schools.forEach(s => pills.push({ label: `School: ${s}`, remove: () => toggleSet('schools', s) }));
    value.reps.forEach(r => pills.push({ label: `Rep: ${r}`, remove: () => toggleSet('reps', r) }));
    if (value.minCubs !== '') pills.push({ label: `Min Cubs: ${value.minCubs}`, remove: () => set({ minCubs: '' }) });
    if (value.maxCubs !== '') pills.push({ label: `Max Cubs: ${value.maxCubs}`, remove: () => set({ maxCubs: '' }) });
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
          <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 100, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.6 }}>
            {totalActive}
          </span>
        )}
      </button>

      {/* Active pills row */}
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

      {/* Slide-in drawer */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 19998, backdropFilter: 'blur(2px)' }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, width: '100%', maxWidth: 400, height: '100vh',
            background: 'var(--bg-2)', zIndex: 19999,
            boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            animation: 'famFilterSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={16} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>Family Filters</span>
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

              {/* Rep */}
              {allReps.length > 0 && (
                <Section title="Relationship Owner (Rep)" count={value.reps.size}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allReps.map(r => (
                      <Pill key={r} label={r} selected={value.reps.has(r)} onClick={() => toggleSet('reps', r)} />
                    ))}
                  </div>
                </Section>
              )}

              {/* Segment */}
              {allSegments.length > 0 && (
                <Section title="Segment (any cub)" count={value.segments.size}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allSegments.map(s => (
                      <Pill key={s} label={s} selected={value.segments.has(s)} onClick={() => toggleSet('segments', s)} />
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    Families with at least one cub in the selected segment(s).
                  </div>
                </Section>
              )}

              {/* Sub Status */}
              <Section title="Sub Status (any cub)" count={value.subStatuses.size}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUB_STATUSES.map(s => (
                    <Pill key={s} label={fmtStatus(s)} selected={value.subStatuses.has(s)} onClick={() => toggleSet('subStatuses', s)} />
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Families with at least one cub with the selected sub-status.
                </div>
              </Section>

              {/* No. of Cubs */}
              <Section title="No. of Cubs Enrolled" count={(value.minCubs !== '' ? 1 : 0) + (value.maxCubs !== '' ? 1 : 0)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Min</label>
                    <input
                      type="number" min="1" placeholder="e.g. 2"
                      value={value.minCubs}
                      onChange={e => set({ minCubs: e.target.value })}
                      style={{
                        padding: '7px 10px', borderRadius: 8, fontSize: 13,
                        border: '1px solid var(--border)', background: 'var(--bg-input)',
                        color: 'var(--text-1)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 18, color: 'var(--text-3)', fontWeight: 600, fontSize: 14 }}>–</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Max</label>
                    <input
                      type="number" min="1" placeholder="e.g. 5"
                      value={value.maxCubs}
                      onChange={e => set({ maxCubs: e.target.value })}
                      style={{
                        padding: '7px 10px', borderRadius: 8, fontSize: 13,
                        border: '1px solid var(--border)', background: 'var(--bg-input)',
                        color: 'var(--text-1)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </Section>

              {/* Schools */}
              <Section title="School (any cub)" count={value.schools.size}>
                <SchoolFilterSection
                  allSchools={allSchools}
                  selected={value.schools}
                  onToggle={s => toggleSet('schools', s)}
                />
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Families with at least one cub at the selected school(s).
                </div>
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
            @keyframes famFilterSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}
