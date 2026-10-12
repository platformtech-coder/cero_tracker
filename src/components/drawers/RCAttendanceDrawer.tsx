'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import {
  X, Calendar, CheckCircle2, Clock, Save, RefreshCw,
  Users, Check, AlertCircle, Sparkles
} from 'lucide-react';
import type { ReadingCircle } from '@/lib/types';
import { submitRCAttendance } from '@/lib/actions/reading-circle';
import { sortRCSessions, isBareDaySession } from '@/lib/utils/rc';
import { DEFAULT_RC_SESSION_OPTIONS } from '@/lib/constants/forms';
import sharedStyles from '@/components/ui/dashboard.module.css';
import { toast } from 'sonner';

type AttendanceStatus = 'Present' | 'Absent' | 'Rescheduled';

interface RCAttendanceDrawerProps {
  isOpen: boolean;
  initialSession?: string;
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
  onSuccess: () => void;
}

export default function RCAttendanceDrawer({
  isOpen,
  initialSession,
  roster,
  availableSessions = [],
  onClose,
  onSuccess,
}: RCAttendanceDrawerProps) {
  const [isPending, startTransition] = useTransition();

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

  const [selectedSession, setSelectedSession] = useState<string>(() => {
    if (initialSession && sessionsList.includes(initialSession)) return initialSession;
    const firstWithCubs = roster.find(r => r.selected_session && sessionsList.includes(r.selected_session))?.selected_session;
    return firstWithCubs || sessionsList[0] || '';
  });

  useEffect(() => {
    if (initialSession && sessionsList.includes(initialSession)) {
      setSelectedSession(initialSession);
    } else if (!selectedSession || !sessionsList.includes(selectedSession)) {
      const firstWithCubs = roster.find(r => r.selected_session && sessionsList.includes(r.selected_session))?.selected_session;
      setSelectedSession(firstWithCubs || sessionsList[0] || '');
    }
  }, [initialSession, sessionsList]);

  const today = new Date().toISOString().slice(0, 10);
  const [attendanceDate, setAttendanceDate] = useState(today);

  // Filter roster by selected session
  const sessionCubs = useMemo(() => {
    return roster.filter(r => {
      if (r.selected_session === selectedSession) return true;
      if (r.selected_session && selectedSession.startsWith(r.selected_session + ' ')) return true;
      return false;
    });
  }, [roster, selectedSession]);

  // Initial statuses map
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  // When session changes or drawer opens, sync default statuses
  useEffect(() => {
    const init: Record<string, AttendanceStatus> = {};
    sessionCubs.forEach(c => {
      init[c.cub_id] = statuses[c.cub_id] || 'Present';
    });
    setStatuses(init);
  }, [sessionCubs]);

  if (!isOpen) return null;

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    sessionCubs.forEach(c => { next[c.cub_id] = status; });
    setStatuses(next);
  };

  const handleSave = () => {
    if (sessionCubs.length === 0) {
      toast.error('No cubs found in this session.');
      return;
    }

    startTransition(async () => {
      const records = sessionCubs.map(c => ({
        cub_id: c.cub_id,
        status: statuses[c.cub_id] || 'Present',
      }));

      const res = await submitRCAttendance({
        attendance_date: attendanceDate,
        session: selectedSession,
        records,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(`Attendance saved for ${res.count} cubs!`);
      onSuccess();
      onClose();
    });
  };

  const presentCount = sessionCubs.filter(c => (statuses[c.cub_id] || 'Present') === 'Present').length;
  const absentCount = sessionCubs.filter(c => statuses[c.cub_id] === 'Absent').length;

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
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 540,
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
              Mark RC Attendance
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>
              Reading Circle Session Attendance
            </div>
          </div>
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

        {/* Session & Date Controls */}
        <div style={{
          padding: '1.1rem 1.5rem', background: 'var(--bg-2, rgba(0,0,0,0.02))',
          borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
              Session
            </label>
            <select
              value={selectedSession}
              onChange={e => setSelectedSession(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: '13px', fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {sessionsList.map(s => {
                const count = roster.filter(r => r.selected_session === s || (r.selected_session && s.startsWith(r.selected_session + ' '))).length;
                return (
                  <option key={s} value={s}>
                    {s} {count > 0 ? `(${count} cub${count === 1 ? '' : 's'})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
              Attendance Date
            </label>
            <input
              type="date"
              value={attendanceDate}
              onChange={e => setAttendanceDate(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Quick Bulk Action Strip */}
        <div style={{
          padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-card)', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text-1)' }}>{sessionCubs.length}</strong> cubs in this session
            {' · '}
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>{presentCount} Present</span>
            {absentCount > 0 && (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {absentCount} Absent</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={() => markAll('Present')}
              style={{
                padding: '3px 8px', borderRadius: 6, border: '1px solid var(--green, #22c55e)',
                background: 'var(--green-dim, rgba(34,197,94,0.1))', color: 'var(--green, #22c55e)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              All Present
            </button>
            <button
              type="button"
              onClick={() => markAll('Absent')}
              style={{
                padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-2)', color: 'var(--text-2)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              All Absent
            </button>
          </div>
        </div>

        {/* Cubs Attendance List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {sessionCubs.length === 0 ? (
            <div style={{
              padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-3)',
              background: 'var(--bg-2, rgba(0,0,0,0.02))', borderRadius: 10, border: '1px dashed var(--border)'
            }}>
              <Users size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)' }}>
                No cubs in {selectedSession}
              </div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Select a different session or change cub sessions to populate this circle.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {sessionCubs.map(c => {
                const cubName = `${c.cubs?.cub_first_name || ''} ${c.cubs?.cub_last_name || ''}`.trim() || 'Cub Profile';
                const currentStatus = statuses[c.cub_id] || 'Present';

                return (
                  <div
                    key={c.cub_id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '0.75rem 1rem', gap: '0.75rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)' }}>
                          {cubName}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                          ({c.cub_id})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-3)', marginTop: 2 }}>
                        {c.rc_category || 'Circle Member'} · Attended: <strong>{c.no_present || 0}x</strong>
                      </div>
                    </div>

                    {/* Status Pill Toggle */}
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      {(['Present', 'Absent', 'Rescheduled'] as AttendanceStatus[]).map(st => {
                        const active = currentStatus === st;
                        const activeColor = st === 'Present' ? '#16a34a' : st === 'Absent' ? '#dc2626' : '#d97706';
                        const activeBg = st === 'Present' ? 'rgba(34,197,94,0.15)' : st === 'Absent' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)';

                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setStatuses(prev => ({ ...prev, [c.cub_id]: st }))}
                            style={{
                              padding: '4px 9px', borderRadius: 6, fontSize: '11px', fontWeight: 600,
                              border: active ? `1px solid ${activeColor}` : '1px solid var(--border)',
                              background: active ? activeBg : 'var(--bg-2)',
                              color: active ? activeColor : 'var(--text-3)',
                              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                            }}
                          >
                            {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || sessionCubs.length === 0}
            style={{
              flex: 2, padding: '10px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              opacity: isPending || sessionCubs.length === 0 ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            {isPending ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
            {isPending ? 'Saving...' : `Save Attendance (${sessionCubs.length})`}
          </button>
        </div>
      </div>
    </>
  );
}
