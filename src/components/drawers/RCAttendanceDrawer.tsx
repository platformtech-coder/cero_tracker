'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import {
  X, Calendar, CheckCircle2, Clock, Save, RefreshCw,
  Users, Check, AlertCircle, Sparkles, RotateCcw
} from 'lucide-react';
import type { ReadingCircle } from '@/lib/types';
import { submitRCAttendance, getRCAttendance } from '@/lib/actions/reading-circle';
import {
  sortRCSessions,
  sortRCSessionsFromDay,
  getSmartRCSession,
  getLocalDateString,
  parseLocalDate,
  INDEX_TO_DAY_NAME,
  extractSessionDay,
  isBareDaySession,
  normalizeSessionName,
} from '@/lib/utils/rc';
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
      sub_status?: string | null;
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

  // Deduplicated list of all available sessions normalized
  const baseSessions = useMemo(() => {
    const list = Array.from(new Set([
      ...availableSessions,
      ...roster.map(r => r.selected_session),
    ])).filter(s => s && !isBareDaySession(s));

    if (list.length === 0) {
      return DEFAULT_RC_SESSION_OPTIONS;
    }
    return sortRCSessions(list);
  }, [availableSessions, roster]);

  // Attendance Date defaults to local today YYYY-MM-DD
  const [attendanceDate, setAttendanceDate] = useState(() => getLocalDateString());

  // Day index for current attendance date
  const targetDayIdx = useMemo(() => {
    return parseLocalDate(attendanceDate).getDay();
  }, [attendanceDate]);

  // Smart ordered session list starting from attendanceDate's day
  const sessionsList = useMemo(() => {
    return sortRCSessionsFromDay(baseSessions, targetDayIdx);
  }, [baseSessions, targetDayIdx]);

  // Selected session state
  const [selectedSession, setSelectedSession] = useState<string>(() => {
    if (initialSession && baseSessions.includes(initialSession)) return initialSession;
    return getSmartRCSession(baseSessions, parseLocalDate(attendanceDate), new Date());
  });

  // Whenever the drawer opens or initialSession changes, sync smart initial session
  useEffect(() => {
    if (!isOpen) return;

    const todayStr = getLocalDateString();
    setAttendanceDate(todayStr);

    if (initialSession && baseSessions.includes(initialSession)) {
      setSelectedSession(initialSession);
    } else {
      const smart = getSmartRCSession(baseSessions, parseLocalDate(todayStr), new Date());
      setSelectedSession(smart || baseSessions[0] || '');
    }
  }, [isOpen, initialSession, baseSessions]);

  // Handle date change: if day of week changes, smartly suggest that day's session
  const handleDateChange = (newDate: string) => {
    setAttendanceDate(newDate);
    if (!newDate) return;

    const prevDay = extractSessionDay(selectedSession).toLowerCase();
    const newDateObj = parseLocalDate(newDate);
    const newDay = INDEX_TO_DAY_NAME[newDateObj.getDay()].toLowerCase();

    // If day changed (e.g. Wednesday to Tuesday), switch to that day's upcoming session
    if (prevDay !== newDay) {
      const smartForNewDay = getSmartRCSession(baseSessions, newDateObj, new Date());
      if (smartForNewDay) {
        setSelectedSession(smartForNewDay);
      }
    }
  };

  // Filter roster by selected session and active subscription
  const sessionCubs = useMemo(() => {
    const normSelected = normalizeSessionName(selectedSession);
    return roster.filter(r => {
      const subStatus = (r.cubs?.sub_status || '').toLowerCase().trim();
      const isActive = !subStatus || subStatus === 'active' || subStatus === 'almost expiring';
      if (!isActive) return false;

      const normCub = normalizeSessionName(r.selected_session);
      if (normCub === normSelected) return true;
      if (r.selected_session && selectedSession.startsWith(r.selected_session + ' ')) return true;
      if (normCub && normSelected.startsWith(normCub + ' ')) return true;
      return false;
    });
  }, [roster, selectedSession]);

  // Key to identify cubs set in current session
  const cubIdsKey = useMemo(() => {
    return sessionCubs.map(c => c.cub_id).sort().join(',');
  }, [sessionCubs]);

  // Statuses map: cub_id -> status ('Present' | 'Absent' | 'Rescheduled')
  // Note: Unmarked cubs will NOT have an entry in statuses
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [hasExistingAttendance, setHasExistingAttendance] = useState(false);

  // Fetch existing attendance whenever selectedSession, attendanceDate, or cubs change
  useEffect(() => {
    if (!isOpen || !selectedSession || !attendanceDate) {
      setStatuses({});
      setHasExistingAttendance(false);
      return;
    }

    let cancelled = false;
    setIsLoadingAttendance(true);

    const cubIds = sessionCubs.map(c => c.cub_id);

    getRCAttendance(attendanceDate, selectedSession, cubIds)
      .then(records => {
        if (cancelled) return;
        const loaded: Record<string, AttendanceStatus> = {};
        let count = 0;
        records.forEach(r => {
          if (r.status === 'Present' || r.status === 'Absent' || r.status === 'Rescheduled') {
            loaded[r.cub_id] = r.status as AttendanceStatus;
            count++;
          }
        });
        setStatuses(loaded);
        setHasExistingAttendance(count > 0);
        setIsLoadingAttendance(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load attendance:', err);
        setStatuses({});
        setHasExistingAttendance(false);
        setIsLoadingAttendance(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedSession, attendanceDate, cubIdsKey]);

  if (!isOpen) return null;

  // Toggle status for a single cub: clicking the already-selected status unmarks the cub
  const toggleStatus = (cubId: string, status: AttendanceStatus) => {
    setStatuses(prev => {
      const next = { ...prev };
      if (next[cubId] === status) {
        delete next[cubId];
      } else {
        next[cubId] = status;
      }
      return next;
    });
  };

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    sessionCubs.forEach(c => {
      next[c.cub_id] = status;
    });
    setStatuses(next);
  };

  const clearAll = () => {
    setStatuses({});
  };

  const handleSave = () => {
    if (sessionCubs.length === 0) {
      toast.error('No cubs found in this session.');
      return;
    }

    const markedRecords = sessionCubs
      .filter(c => statuses[c.cub_id])
      .map(c => ({
        cub_id: c.cub_id,
        status: statuses[c.cub_id] as AttendanceStatus,
      }));

    if (markedRecords.length === 0) {
      toast.error('Please mark attendance for at least one cub before saving.');
      return;
    }

    startTransition(async () => {
      const res = await submitRCAttendance({
        attendance_date: attendanceDate,
        session: selectedSession,
        records: markedRecords,
        allSessionCubIds: sessionCubs.map(c => c.cub_id),
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(`Attendance ${hasExistingAttendance ? 'updated' : 'saved'} for ${res.count} cubs!`);
      onSuccess();
      onClose();
    });
  };

  const presentCount = sessionCubs.filter(c => statuses[c.cub_id] === 'Present').length;
  const absentCount = sessionCubs.filter(c => statuses[c.cub_id] === 'Absent').length;
  const rescheduledCount = sessionCubs.filter(c => statuses[c.cub_id] === 'Rescheduled').length;
  const markedCount = presentCount + absentCount + rescheduledCount;
  const unmarkedCount = Math.max(0, sessionCubs.length - markedCount);

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
          borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr',
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
                const normS = normalizeSessionName(s);
                const count = roster.filter(r => {
                  const normCub = normalizeSessionName(r.selected_session);
                  return normCub === normS || (r.selected_session && s.startsWith(r.selected_session + ' '));
                }).length;

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
              onChange={e => handleDateChange(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: '13px',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Attendance Status Banner (Loaded / Not Yet Taken) */}
        <div style={{
          padding: '0.6rem 1.5rem',
          background: hasExistingAttendance
            ? 'rgba(59, 130, 246, 0.08)'
            : 'rgba(234, 179, 8, 0.08)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: hasExistingAttendance ? 'var(--blue, #2563eb)' : 'var(--orange, #d97706)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {isLoadingAttendance ? (
              <>
                <RefreshCw size={13} className="spin" />
                <span>Checking attendance records for this date...</span>
              </>
            ) : hasExistingAttendance ? (
              <>
                <CheckCircle2 size={14} style={{ color: 'var(--green, #16a34a)' }} />
                <span>
                  <strong>Saved attendance loaded</strong> ({presentCount} Present{absentCount > 0 ? `, ${absentCount} Absent` : ''}). Edit below to remark and save.
                </span>
              </>
            ) : (
              <>
                <Clock size={14} />
                <span>
                  No attendance saved yet for this session on {attendanceDate}. Mark cubs below.
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick Bulk Action Strip */}
        <div style={{
          padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-card)', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text-1)' }}>{sessionCubs.length}</strong> cubs in circle
            {' · '}
            <span style={{ color: 'var(--green, #16a34a)', fontWeight: 600 }}>{presentCount} Present</span>
            {absentCount > 0 && (
              <span style={{ color: 'var(--red, #dc2626)', fontWeight: 600 }}> · {absentCount} Absent</span>
            )}
            {rescheduledCount > 0 && (
              <span style={{ color: 'var(--orange, #d97706)', fontWeight: 600 }}> · {rescheduledCount} Rescheduled</span>
            )}
            {unmarkedCount > 0 && (
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> · {unmarkedCount} Unmarked</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              disabled={isLoadingAttendance || sessionCubs.length === 0}
              onClick={() => markAll('Present')}
              style={{
                padding: '3px 8px', borderRadius: 6, border: '1px solid var(--green, #22c55e)',
                background: 'var(--green-dim, rgba(34,197,94,0.1))', color: 'var(--green, #22c55e)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                opacity: isLoadingAttendance || sessionCubs.length === 0 ? 0.5 : 1,
              }}
            >
              All Present
            </button>
            <button
              type="button"
              disabled={isLoadingAttendance || sessionCubs.length === 0}
              onClick={() => markAll('Absent')}
              style={{
                padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)',
                background: 'rgba(239,68,68,0.1)', color: 'var(--red, #dc2626)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                opacity: isLoadingAttendance || sessionCubs.length === 0 ? 0.5 : 1,
              }}
            >
              All Absent
            </button>
            {markedCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                style={{
                  padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-2)', color: 'var(--text-3)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
                title="Clear all marked statuses"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Cubs Attendance List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {isLoadingAttendance ? (
            <div style={{
              padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-3)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
            }}>
              <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)' }} />
              <div style={{ fontSize: '0.85rem' }}>Loading attendance records...</div>
            </div>
          ) : sessionCubs.length === 0 ? (
            <div style={{
              padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-3)',
              background: 'var(--bg-2, rgba(0,0,0,0.02))', borderRadius: 10, border: '1px dashed var(--border)'
            }}>
              <Users size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)' }}>
                No cubs enrolled in {selectedSession}
              </div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Select a different session or change cub sessions to populate this circle.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {sessionCubs.map(c => {
                const cubName = `${c.cubs?.cub_first_name || ''} ${c.cubs?.cub_last_name || ''}`.trim() || 'Cub Profile';
                const currentStatus = statuses[c.cub_id]; // undefined if not marked

                return (
                  <div
                    key={c.cub_id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--bg-card)',
                      border: currentStatus ? (
                        currentStatus === 'Present' ? '1px solid rgba(34,197,94,0.4)' :
                        currentStatus === 'Absent' ? '1px solid rgba(239,68,68,0.4)' :
                        '1px solid rgba(245,158,11,0.4)'
                      ) : '1px solid var(--border)',
                      borderRadius: 10, padding: '0.75rem 1rem', gap: '0.75rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'border-color 0.15s, background-color 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)' }}>
                          {cubName}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                          ({c.cub_id})
                        </span>
                        {!currentStatus && (
                          <span style={{
                            fontSize: '10px', fontWeight: 600, color: 'var(--text-3)',
                            background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 4,
                          }}>
                            Unmarked
                          </span>
                        )}
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
                            onClick={() => toggleStatus(c.cub_id, st)}
                            style={{
                              padding: '4px 9px', borderRadius: 6, fontSize: '11px', fontWeight: 600,
                              border: active ? `1px solid ${activeColor}` : '1px solid var(--border)',
                              background: active ? activeBg : 'var(--bg-2)',
                              color: active ? activeColor : 'var(--text-3)',
                              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                            }}
                            title={active ? `Click to unmark ${st}` : `Mark ${st}`}
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
            disabled={isPending || isLoadingAttendance || sessionCubs.length === 0 || markedCount === 0}
            style={{
              flex: 2, padding: '10px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              opacity: isPending || isLoadingAttendance || sessionCubs.length === 0 || markedCount === 0 ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
            title={markedCount === 0 ? 'Mark attendance for at least one cub' : ''}
          >
            {isPending ? (
              <>
                <RefreshCw size={15} className="spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>
                  {hasExistingAttendance ? 'Update Attendance' : 'Save Attendance'} ({markedCount})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
