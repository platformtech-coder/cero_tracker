'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import {
  X, Search, RefreshCw, CheckCircle2, User, Phone,
  Sparkles, Calendar, BookOpen, ExternalLink
} from 'lucide-react';
import type { ReadingCircle } from '@/lib/types';
import { changeCubRCSession } from '@/lib/actions/reading-circle';
import { sortRCSessions, isBareDaySession } from '@/lib/utils/rc';
import { DEFAULT_RC_SESSION_OPTIONS } from '@/lib/constants/forms';
import sharedStyles from '@/components/ui/dashboard.module.css';
import { toast } from 'sonner';
import CubProfileDrawer from '@/components/drawers/CubProfileDrawer';

interface RCChangeSessionDrawerProps {
  isOpen: boolean;
  selectedCub?: (ReadingCircle & {
    cubs: {
      cub_first_name?: string;
      cub_last_name?: string;
      parent_first_name?: string;
      parent_last_name?: string;
      parent_phone?: string;
      relationship_owner?: string;
      segment?: string;
    };
  }) | null;
  roster: (ReadingCircle & {
    cubs: {
      cub_first_name?: string;
      cub_last_name?: string;
      parent_first_name?: string;
      parent_last_name?: string;
      parent_phone?: string;
      relationship_owner?: string;
      segment?: string;
    };
  })[];
  availableSessions?: string[];
  onClose: () => void;
  onSuccess: (cubId: string, newSession: string, newCategory?: string) => void;
  readOnly?: boolean;
}

export default function RCChangeSessionDrawer({
  isOpen,
  selectedCub,
  roster,
  availableSessions = [],
  onClose,
  onSuccess,
  readOnly = false,
}: RCChangeSessionDrawerProps) {
  const [showCubProfile, setShowCubProfile] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [activeCubId, setActiveCubId] = useState<string>(selectedCub?.cub_id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSession, setNewSession] = useState<string>('');

  // Sync when selectedCub changes
  useEffect(() => {
    if (selectedCub) {
      setActiveCubId(selectedCub.cub_id);
      setNewSession('');
    } else {
      setActiveCubId('');
      setNewSession('');
    }
  }, [selectedCub]);

  const sessionsList = useMemo(() => {
    const list = Array.from(new Set([
      ...availableSessions,
      ...roster.map(r => r.selected_session),
    ])).filter(s => s && !isBareDaySession(s));

    if (list.length === 0) {
      return DEFAULT_RC_SESSION_OPTIONS;
    }
    return sortRCSessions(list);
  }, [availableSessions, roster]);

  const activeCub = useMemo(() => {
    if (!activeCubId) return null;
    return roster.find(r => r.cub_id === activeCubId) || null;
  }, [roster, activeCubId]);

  const filteredCubs = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return roster.filter(r =>
      r.cub_id.toLowerCase().includes(q) ||
      `${r.cubs?.cub_first_name || ''} ${r.cubs?.cub_last_name || ''}`.toLowerCase().includes(q) ||
      `${r.cubs?.parent_first_name || ''} ${r.cubs?.parent_last_name || ''}`.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [roster, searchQuery]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!activeCub) {
      toast.error('Please select a cub first.');
      return;
    }
    if (!newSession) {
      toast.error('Please select a new session.');
      return;
    }
    if (newSession === activeCub.selected_session) {
      toast.error('Cub is already assigned to this session.');
      return;
    }

    startTransition(async () => {
      const res = await changeCubRCSession({
        cub_id: activeCub.cub_id,
        new_session: newSession,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(`Session changed to ${newSession}!`);
      onSuccess(activeCub.cub_id, newSession, res.newCategory);
      onClose();
    });
  };

  const cubName = activeCub ? `${activeCub.cubs?.cub_first_name || ''} ${activeCub.cubs?.cub_last_name || ''}`.trim() : '';
  const parentName = activeCub ? `${activeCub.cubs?.parent_first_name || ''} ${activeCub.cubs?.parent_last_name || ''}`.trim() : '';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
          backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 480,
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow, -4px 0 24px rgba(0,0,0,0.15))', zIndex: 1000,
        display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 2,
        }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Change RC Session
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>
              Reassign cub to a different Reading Circle session
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {activeCub?.cub_id && (
              <button
                type="button"
                onClick={() => setShowCubProfile(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                  padding: '0.25rem', borderRadius: 6, display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                title="View Cub Profile"
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
              >
                <ExternalLink size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                padding: '0.25rem', borderRadius: 6, display: 'flex', alignItems: 'center',
              }}
              title="Close drawer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Search cub if none preselected or wants to switch */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
              Select Cub
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                type="text"
                placeholder="Search cub by name or ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-1)', fontSize: '13px', fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Quick search results dropdown */}
            {filteredCubs.length > 0 && (
              <div style={{
                marginTop: 6, border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                overflow: 'hidden',
              }}>
                {filteredCubs.map(c => {
                  const name = `${c.cubs?.cub_first_name || ''} ${c.cubs?.cub_last_name || ''}`.trim() || c.cub_id;
                  return (
                    <div
                      key={c.cub_id}
                      onClick={() => {
                        setActiveCubId(c.cub_id);
                        setSearchQuery('');
                      }}
                      style={{
                        padding: '8px 12px', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', background: activeCubId === c.cub_id ? 'var(--primary-dim)' : 'transparent',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-1)' }}>{name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Current: {c.selected_session}</div>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-3)' }}>{c.cub_id}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Cub Profile Card */}
          {activeCub ? (
            <div style={{
              background: 'var(--bg-2, rgba(0,0,0,0.02))', border: '1px solid var(--border)',
              borderRadius: 12, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: 'var(--primary)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '1.1rem', flexShrink: 0
                }}>
                  {cubName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)' }}>
                    {cubName}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 1 }}>
                    ID: {activeCub.cub_id}
                  </div>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
                borderTop: '1px solid var(--border)', paddingTop: '0.875rem', fontSize: '0.82rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Parent
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)', marginTop: 2 }}>{parentName || '—'}</div>
                  {activeCub.cubs?.parent_phone && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{activeCub.cubs.parent_phone}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Current Session
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginTop: 2 }}>
                    {activeCub.selected_session}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>
                    {activeCub.rc_category || 'Circle Member'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-3)',
              background: 'var(--bg-2, rgba(0,0,0,0.02))', borderRadius: 10, border: '1px dashed var(--border)',
              fontSize: '0.82rem'
            }}>
              Search and select a cub above or click any row in the roster table to change session.
            </div>
          )}

          {/* New Session Picker */}
          {activeCub && (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
                New Session
              </label>
              <select
                value={newSession}
                onChange={e => setNewSession(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-1)', fontSize: '13px', fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                <option value="">— Select New Session —</option>
                {sessionsList.map(s => (
                  <option key={s} value={s} disabled={s === activeCub.selected_session}>
                    {s} {s === activeCub.selected_session ? '(Current)' : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 6 }}>
                Category will be automatically recalculated according to the cub&apos;s grade.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1.1rem 1.5rem', borderTop: '1px solid var(--border)',
          background: 'var(--bg-card)', display: 'flex', gap: '0.75rem',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text-1)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 500,
            }}
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !activeCub || !newSession || newSession === activeCub?.selected_session}
              style={{
                flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '14px', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                opacity: isPending || !activeCub || !newSession || newSession === activeCub?.selected_session ? 0.6 : 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {isPending ? <RefreshCw size={15} className="spin" /> : <RefreshCw size={15} />}
              {isPending ? 'Updating...' : 'Change Session'}
            </button>
          )}
        </div>
      </div>

      {showCubProfile && activeCub?.cub_id && (
        <CubProfileDrawer
          cubId={activeCub.cub_id}
          readOnly={readOnly}
          onClose={() => setShowCubProfile(false)}
        />
      )}
    </>
  );
}
