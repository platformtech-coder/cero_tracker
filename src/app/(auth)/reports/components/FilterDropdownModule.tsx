'use client';

import { useState, useMemo, useEffect } from 'react';
import { Calendar, Filter } from 'lucide-react';
import { formatDate } from '@/lib/utils/date';
import { getSundayWeek } from './shared';

export function FilterDropdownModule({
  activeTab,
  startDate,
  endDate,
  onApplyRange,
  allPurposes = [],
  selectedPurpose = '',
  onSelectPurpose,
}: {
  activeTab: string;
  startDate: string;
  endDate: string;
  onApplyRange: (s: string, e: string) => void;
  allPurposes?: string[];
  selectedPurpose?: string;
  onSelectPurpose?: (purpose: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const last7Str = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const last30Str = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const thisMonth = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: toYMD(s), end: toYMD(e) };
  }, []);
  const thisWeek = useMemo(() => getSundayWeek(new Date(), 0), []);
  const lastWeek = useMemo(() => getSundayWeek(new Date(), -1), []);

  const isRC = activeTab === 'rc';
  const isGeneralTab = activeTab === 'orientation' || activeTab === 'expiry';

  // Sync custom inputs whenever activeTab or props change
  useEffect(() => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
    setShowCustom(false);
  }, [activeTab, startDate, endDate]);

  const currentPreset = useMemo(() => {
    if (showCustom) return 'custom';
    if (isGeneralTab && (!startDate || startDate === 'all' || (!startDate && !endDate))) return 'all';
    if (isRC && startDate === thisWeek.start && endDate === thisWeek.end) return 'thisWeek';
    if (isRC && startDate === lastWeek.start && endDate === lastWeek.end) return 'lastWeek';
    if (startDate === todayStr && endDate === todayStr) return 'today';
    if (startDate === yesterdayStr && endDate === yesterdayStr) return 'yesterday';
    if (startDate === last7Str && endDate === todayStr) return 'last7';
    if (startDate === last30Str && endDate === todayStr) return 'last30';
    if (startDate === thisMonth.start && endDate === thisMonth.end) return 'thisMonth';
    if (!startDate && !endDate) {
      if (isGeneralTab) return 'all';
      if (isRC) return 'thisWeek';
      return 'today';
    }
    return 'custom';
  }, [startDate, endDate, todayStr, yesterdayStr, last7Str, last30Str, thisMonth, thisWeek, lastWeek, showCustom, isGeneralTab, isRC]);

  const handleSelectChange = (val: string) => {
    if (val === 'all') {
      setShowCustom(false);
      onApplyRange('', '');
    } else if (val === 'today') {
      setShowCustom(false);
      onApplyRange(todayStr, todayStr);
    } else if (val === 'yesterday') {
      setShowCustom(false);
      onApplyRange(yesterdayStr, yesterdayStr);
    } else if (val === 'last7') {
      setShowCustom(false);
      onApplyRange(last7Str, todayStr);
    } else if (val === 'last30') {
      setShowCustom(false);
      onApplyRange(last30Str, todayStr);
    } else if (val === 'thisMonth') {
      setShowCustom(false);
      onApplyRange(thisMonth.start, thisMonth.end);
    } else if (val === 'thisWeek') {
      setShowCustom(false);
      const w = getSundayWeek(new Date(), 0);
      onApplyRange(w.start, w.end);
    } else if (val === 'lastWeek') {
      setShowCustom(false);
      const w = getSundayWeek(new Date(), -1);
      onApplyRange(w.start, w.end);
    } else if (val === 'custom') {
      setShowCustom(true);
    }
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd) {
      onApplyRange(customStart, customEnd);
    }
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: '1.25rem',
      padding: '8px 14px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      width: 'fit-content',
      maxWidth: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} color="var(--primary)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Filter:</span>
          <select
            value={currentPreset}
            onChange={e => handleSelectChange(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-1)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {isGeneralTab && <option value="all">Overall (All Time)</option>}
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            {isRC && (
              <>
                <option value="thisWeek">This Week (Sun–Sat)</option>
                <option value="lastWeek">Last Week (Sun–Sat)</option>
              </>
            )}
            <option value="custom">Custom Range...</option>
          </select>
        </div>

        {/* Purpose Dropdown — next to Date Filter when on Daily Activity tab */}
        {activeTab === 'daily' && allPurposes.length > 0 && onSelectPurpose && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderLeft: '1px solid var(--border)',
            paddingLeft: 10,
          }}>
            <Filter size={14} color="var(--primary)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Purpose:</span>
            <select
              value={selectedPurpose}
              onChange={e => onSelectPurpose(e.target.value)}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: selectedPurpose ? 700 : 600,
                color: selectedPurpose ? 'var(--primary)' : 'var(--text-1)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">All Purposes</option>
              {allPurposes.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        {/* Custom Range Inputs */}
        {(showCustom || currentPreset === 'custom') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text-1)',
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text-1)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleApplyCustom}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        )}

        {/* Formatted Date Range Display */}
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-2)',
          background: 'var(--bg-hover)',
          padding: '4px 10px',
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {isGeneralTab && (!startDate || currentPreset === 'all')
            ? 'Overall (All Time)'
            : !startDate
            ? 'All Time'
            : `${formatDate(startDate)}${startDate !== endDate ? ` – ${formatDate(endDate)}` : ''}`}
        </span>
      </div>
    </div>
  );
}
