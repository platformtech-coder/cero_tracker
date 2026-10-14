'use client';

import { useState, useMemo } from 'react';
import { X, SlidersHorizontal, ChevronDown, ChevronUp, Check } from 'lucide-react';
import styles from '@/components/ui/dashboard.module.css';

// ─── Types ─────────────────────────────────────────────────────────────────
export interface FilterField {
  key: string;
  label: string;
  options: string[];
  formatLabel?: (v: string) => string;
}

/** Record of fieldKey → Set of selected values */
export type FilterState = Record<string, Set<string>>;

export function countFilters(s: FilterState): number {
  return Object.values(s).reduce((sum, set) => sum + (set?.size || 0), 0);
}

interface AdvancedFilterDrawerProps {
  fields: FilterField[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onReset: () => void;
  totalActive: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtLabel(raw: string, formatter?: (v: string) => string) {
  if (formatter) return formatter(raw);
  return raw.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── Single collapsible filter section ──────────────────────────────────────
function FilterSection({ field, selected, onToggle }: {
  field: FilterField;
  selected: Set<string>;
  onToggle: (val: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 8px',
          color: 'var(--text-1)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {field.label}
          {selected.size > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: '#fff',
              borderRadius: 100, padding: '1px 6px', lineHeight: 1.6,
            }}>
              {selected.size}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {field.options.map(opt => {
            const isSelected = selected.has(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: isSelected ? 'var(--primary)' : 'var(--bg-input)',
                  color: isSelected ? '#fff' : 'var(--text-2)',
                  border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {isSelected && <Check size={11} strokeWidth={3} />}
                {fmtLabel(opt, field.formatLabel)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Drawer ─────────────────────────────────────────────────────────────
export function AdvancedFilterDrawer({ fields, value, onChange, onReset, totalActive }: AdvancedFilterDrawerProps) {
  const [open, setOpen] = useState(false);

  const toggle = (fieldKey: string, opt: string) => {
    const next: FilterState = {};
    for (const k in value) next[k] = new Set(value[k]);
    if (!next[fieldKey]) next[fieldKey] = new Set();
    if (next[fieldKey].has(opt)) next[fieldKey].delete(opt);
    else next[fieldKey].add(opt);
    onChange(next);
  };

  const activePills = useMemo(() => {
    const pills: { fieldKey: string; fieldLabel: string; opt: string }[] = [];
    for (const f of fields) {
      const sel = value[f.key] ?? new Set();
      for (const opt of sel) {
        pills.push({ fieldKey: f.key, fieldLabel: f.label, opt });
      }
    }
    return pills;
  }, [fields, value]);

  return (
    <>
      {/* ── Trigger button ── */}
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
        title="Advanced filters"
      >
        <SlidersHorizontal size={14} />
        Filters
        {totalActive > 0 && (
          <span style={{
            background: 'var(--primary)', color: '#fff', borderRadius: 100,
            fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.6,
          }}>
            {totalActive}
          </span>
        )}
      </button>

      {/* ── Active filter pills in toolbar ── */}
      {activePills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {activePills.map(pill => (
            <span key={`${pill.fieldKey}-${pill.opt}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: 'var(--primary-dim)', color: 'var(--primary)',
              border: '1.5px solid var(--border)',
            }}>
              <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{pill.fieldLabel}:</span>
              {fmtLabel(pill.opt)}
              <button
                type="button"
                onClick={() => toggle(pill.fieldKey, pill.opt)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--primary)', opacity: 0.7 }}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Drawer overlay ── */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
              zIndex: 19998, backdropFilter: 'blur(2px)',
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, width: '100%', maxWidth: 380, height: '100vh',
            background: 'var(--bg-2)', zIndex: 19999,
            boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            animation: 'advFilterSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 20px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={16} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>Advanced Filters</span>
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
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={styles.drawerClose}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {fields.map(field => (
                <FilterSection
                  key={field.key}
                  field={field}
                  selected={value[field.key] ?? new Set()}
                  onToggle={opt => toggle(field.key, opt)}
                />
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px', borderTop: '1px solid var(--border)', flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                Apply{totalActive > 0 ? ` (${totalActive} active)` : ''}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes advFilterSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}

// ─── Hook: apply multi-value filter state to a list of records ──────────────
export function useAdvancedFilter<T extends Record<string, unknown>>(
  data: T[],
  filterState: FilterState
): T[] {
  return useMemo(() => {
    const activeFilters = Object.entries(filterState).filter(([, set]) => set.size > 0);
    if (activeFilters.length === 0) return data;
    return data.filter(item =>
      activeFilters.every(([key, set]) => {
        const val = item[key];
        return val != null && set.has(String(val));
      })
    );
  }, [data, filterState]);
}

// ─── Helper: build an empty FilterState from field config ────────────────────
export function emptyFilterState(fields: FilterField[]): FilterState {
  return Object.fromEntries(fields.map(f => [f.key, new Set<string>()]));
}

// ─── Helper: count total active selections ────────────────────────────────────
export function countActiveFilters(state: FilterState): number {
  return Object.values(state).reduce((sum, set) => sum + set.size, 0);
}

// ─── Helper: derive sorted unique option values from data ─────────────────────
export function deriveOptions<T extends Record<string, unknown>>(data: T[], key: string): string[] {
  const vals = new Set<string>();
  for (const item of data) {
    const v = item[key];
    if (v != null && String(v).trim()) vals.add(String(v));
  }
  return Array.from(vals).sort();
}
