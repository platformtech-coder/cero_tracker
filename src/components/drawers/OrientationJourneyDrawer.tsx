'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  X, ChevronDown, ChevronUp, Save, RefreshCw, Calendar,
  User, Phone, Sparkles, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import type { Orientation } from '@/lib/types';
import { updateCubJourney } from '@/lib/actions/orientation';
import { getNearestDateForDay } from '@/lib/utils/orientation';
import sharedStyles from '@/components/ui/dashboard.module.css';
import { formatDate } from '@/lib/utils/date';
import { toast } from 'sonner';

type StageKey = 'booked' | 'attended' | 'rc_selected' | 'first_win';


interface OrientationJourneyDrawerProps {
  record: Orientation & {
    cubs: {
      cub_first_name?: string;
      cub_last_name?: string;
      parent_first_name?: string;
      parent_last_name?: string;
      parent_phone?: string;
      parent_email?: string;
      relationship_owner?: string;
      segment?: string;
    };
  };
  availableSessions?: string[];
  onClose: () => void;
  onUpdated: (updates: Partial<Orientation>) => void;
}

export default function OrientationJourneyDrawer({
  record,
  availableSessions = [],
  onClose,
  onUpdated,
}: OrientationJourneyDrawerProps) {
  const [isPending, startTransition] = useTransition();

  // Form state initialized directly from record
  const [form, setForm] = useState({
    session: record.session ?? '',
    rc_session: (record as any).cubs?.reading_circle_category ? '' : '',
    invited_status: record.invited_status ?? 'Yes',
    booked_status: record.booked_status ?? '',
    booked_date: record.booked_date ?? '',
    attended_status: record.attended_status ?? '',
    attended_date: record.attended_date ?? '',
    attended_feedback: record.attended_feedback ?? '',
    rc_selected_status: record.rc_selected_status ?? '',
    rc_selected_date: record.rc_selected_date ?? '',
    rc_selected_feedback: record.rc_selected_feedback ?? '',
    first_win_status: record.first_win_status ?? '',
    first_win_date: record.first_win_date ?? '',
    first_win_feedback: record.first_win_feedback ?? '',
  });

  // Determine default open stage based on current progression
  const defaultOpenStage = useMemo<StageKey>(() => {
    if (record.first_win_status === 'Yes') return 'first_win';
    if (record.rc_selected_status === 'Completed') return 'first_win';
    if (record.attended_status === 'Present') return 'rc_selected';
    if (record.booked_status === 'Completed' || record.session) return 'attended';
    return 'booked';
  }, [record]);

  // Exactly one stage open by default, collapsible
  const [openStage, setOpenStage] = useState<StageKey | null>(defaultOpenStage);

  const toggleStage = (stage: StageKey) => {
    setOpenStage(prev => (prev === stage ? null : stage));
  };

  const updateField = (key: keyof typeof form, val: string) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };

      // If session is changed, auto-calculate booked_date to the nearest upcoming date of that session day
      if (key === 'session') {
        if (val) {
          next.booked_status = 'Completed';
          next.booked_date = getNearestDateForDay(val);
        } else {
          next.booked_status = '';
          next.booked_date = '';
        }
      }

      // Auto-set date to today if a status is selected and date is empty
      const today = new Date().toISOString().slice(0, 10);
      if (key === 'booked_status' && val && !next.booked_date) {
        next.booked_date = prev.session ? getNearestDateForDay(prev.session) : today;
      }
      if (key === 'attended_status' && val && !prev.attended_date) next.attended_date = today;
      if (key === 'rc_selected_status' && val && !prev.rc_selected_date) next.rc_selected_date = today;
      if (key === 'first_win_status' && val && !prev.first_win_date) next.first_win_date = today;

      return next;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const updates = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v || null])
      ) as any;

      const res = await updateCubJourney({
        cub_id: record.cub_id,
        version_ts: record.version_ts,
        updates,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success('Orientation journey updated successfully!');
      const { rc_session: _, ...orientationFields } = updates;
      onUpdated({ ...orientationFields, stage: res.stage?.stage, stage_status: res.stage?.stage_status, next_stage: res.stage?.next_stage });
      onClose();
    });
  };

  const sessionsList = useMemo(() => {
    const list = ['Tuesday', 'Sunday'];
    return Array.from(new Set([...list, ...availableSessions])).filter(Boolean);
  }, [availableSessions]);

  const stagesConfig: {
    key: StageKey;
    label: string;
    statusKey: 'booked_status' | 'attended_status' | 'rc_selected_status' | 'first_win_status';
    statusOptions: string[];
    dateKey: 'booked_date' | 'attended_date' | 'rc_selected_date' | 'first_win_date';
    feedbackKey?: 'attended_feedback' | 'rc_selected_feedback' | 'first_win_feedback';
    feedbackPlaceholder?: string;
  }[] = [
    {
      key: 'booked',
      label: '1. Booked',
      statusKey: 'booked_status',
      statusOptions: ['Completed', 'Pending'],
      dateKey: 'booked_date',
    },
    {
      key: 'attended',
      label: '2. Attended',
      statusKey: 'attended_status',
      statusOptions: ['Present', 'Absent', 'Rescheduled'],
      dateKey: 'attended_date',
      feedbackKey: 'attended_feedback',
      feedbackPlaceholder: 'Session feedback, attendance notes...',
    },
    {
      key: 'rc_selected',
      label: '3. Reading Circle Selected',
      statusKey: 'rc_selected_status',
      statusOptions: ['Completed', 'Pending'],
      dateKey: 'rc_selected_date',
      feedbackKey: 'rc_selected_feedback',
      feedbackPlaceholder: 'Selected circle, day/time preferences...',
    },
    {
      key: 'first_win',
      label: '4. First Win',
      statusKey: 'first_win_status',
      statusOptions: ['Yes', 'No'],
      dateKey: 'first_win_date',
      feedbackKey: 'first_win_feedback',
      feedbackPlaceholder: 'Details on first book milestone, engagement feedback...',
    },
  ];

  const getStatusBadge = (status: string) => {
    if (!status) {
      return (
        <span style={{
          fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
          background: 'var(--bg-2, rgba(0,0,0,0.03))', color: 'var(--text-3)',
          border: '1px dashed var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em',
          display: 'inline-flex', alignItems: 'center', lineHeight: 1.2,
        }}>
          Not Set
        </span>
      );
    }
    const isSuccess = ['Completed', 'Present', 'Yes'].includes(status);
    const isPendingStatus = ['Pending', 'Rescheduled'].includes(status);
    const color = isSuccess ? 'var(--green)' : isPendingStatus ? 'var(--orange)' : 'var(--text-3)';
    const bg = isSuccess ? 'var(--green-dim, rgba(34,197,94,0.12))' : isPendingStatus ? 'var(--orange-dim, rgba(234,179,8,0.12))' : 'var(--bg-2)';

    return (
      <span style={{
        fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
        background: bg, color: color, textTransform: 'uppercase', letterSpacing: '0.04em',
        display: 'inline-flex', alignItems: 'center', lineHeight: 1.2,
      }}>
        {status}
      </span>
    );
  };

  const cubName = `${record.cubs?.cub_first_name || ''} ${record.cubs?.cub_last_name || ''}`.trim() || 'Cub Profile';
  const parentName = `${record.cubs?.parent_first_name || ''} ${record.cubs?.parent_last_name || ''}`.trim() || '—';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
          backdropFilter: 'blur(2px)', transition: 'opacity 0.2s',
        }}
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 560,
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow, -4px 0 24px rgba(0,0,0,0.15))', zIndex: 1000,
        display: 'flex', flexDirection: 'column', height: '100vh',
        animation: 'slideInRight 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                {cubName}
              </h2>
              <span style={{
                fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600,
                padding: '2px 6px', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-2)'
              }}>
                {record.cub_id}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 4 }}>
              Orientation Journey Management
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

        {/* Info Strip */}
        <div style={{
          padding: '1rem 1.5rem', background: 'var(--bg-2, rgba(0,0,0,0.02))',
          borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem 1.25rem', fontSize: '0.82rem', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Parent
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)', marginTop: 2 }}>{parentName}</div>
            {record.cubs?.parent_phone && (
              <a
                href={`tel:${record.cubs.parent_phone}`}
                style={{ fontSize: '0.76rem', color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}
              >
                <Phone size={11} /> {record.cubs.parent_phone}
              </a>
            )}
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Relationship Owner
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)', marginTop: 2 }}>
              {record.cubs?.relationship_owner || 'Unassigned'}
            </div>
            {record.cubs?.segment && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{record.cubs.segment}</span>
            )}
          </div>
        </div>

        {/* Status & Session Bar */}
        <div style={{
          padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-card)', flexWrap: 'wrap', gap: '0.75rem', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>Current Stage:</span>
            <span className={`${sharedStyles.badge} ${record.stage_status === 'Completed' ? sharedStyles.badgeGreen : sharedStyles.badgeBlue}`}>
              {record.stage || 'Booked'}
            </span>
            {record.next_stage && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>→ {record.next_stage}</span>
            )}
          </div>

          {/* Session Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>Session:</label>
            <select
              value={form.session}
              onChange={e => updateField('session', e.target.value)}
              className={sharedStyles.filterSelect}
              style={{ padding: '3px 8px', fontSize: '0.78rem', fontWeight: 600 }}
            >
              <option value="">— Not Booked —</option>
              {sessionsList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Scrollable Stage Accordion Blocks */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '1.25rem 1.5rem 1.75rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.875rem',
        }}>
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--text-3)',
            padding: '0.6rem 0.85rem',
            background: 'var(--bg-2, rgba(0,0,0,0.02))',
            borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
            marginBottom: '0.2rem',
          }}>
            <Sparkles size={13} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span>Click any stage below to expand and edit progression details.</span>
          </div>

          {stagesConfig.map(cfg => {
            const isOpen = openStage === cfg.key;
            const currentStatus = form[cfg.statusKey];
            const currentDate = form[cfg.dateKey];
            const currentFeedback = cfg.feedbackKey ? form[cfg.feedbackKey] : '';

            return (
              <div
                key={cfg.key}
                style={{
                  flexShrink: 0,
                  border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'var(--bg-card)',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: isOpen ? '0 4px 14px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleStage(cfg.key)}
                  style={{
                    minHeight: '52px',
                    padding: '0.85rem 1.15rem',
                    background: isOpen ? 'var(--primary-dim, rgba(59,130,246,0.06))' : 'var(--bg-2, rgba(0,0,0,0.02))',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: isOpen ? 'var(--primary)' : 'var(--bg-card)',
                      border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
                      color: isOpen ? '#fff' : 'var(--text-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      color: isOpen ? 'var(--primary)' : 'var(--text-1)',
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {getStatusBadge(currentStatus)}
                  </div>
                </div>

                {/* Accordion Body */}
                {isOpen && (
                  <div style={{
                    padding: '1.15rem 1.25rem 1.35rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.95rem',
                    background: 'var(--bg-card)',
                  }}>
                    {/* Status Dropdown */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--text-3)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 5,
                      }}>
                        Status
                      </label>
                      <select
                        value={currentStatus}
                        onChange={e => updateField(cfg.statusKey, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 11px',
                          borderRadius: 7,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-1)',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="">— Select Status —</option>
                        {cfg.statusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    {/* Stage 1: Booked session picker */}
                    {cfg.key === 'booked' && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: 'var(--text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 5,
                        }}>
                          Book Orientation Session
                        </label>
                        <select
                          value={form.session}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(prev => ({
                              ...prev,
                              session: val,
                              booked_status: val ? 'Completed' : '',
                              booked_date: val ? getNearestDateForDay(val) : '',
                            }));
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-1)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="">— Select Session Day —</option>
                          <option value="Tuesday">Tuesday Session (7:00 pm – 8:00 pm)</option>
                          <option value="Sunday">Sunday Session (5:00 pm – 6:00 pm)</option>
                        </select>
                      </div>
                    )}

                    {/* Stage 3: Reading Circle session assignment */}
                    {cfg.key === 'rc_selected' && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: 'var(--text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 5,
                        }}>
                          Assign Reading Circle Session
                        </label>
                        <select
                          value={form.rc_session}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(prev => ({
                              ...prev,
                              rc_session: val,
                              rc_selected_status: val ? 'Completed' : prev.rc_selected_status,
                              rc_selected_date: val && !prev.rc_selected_date ? new Date().toISOString().slice(0, 10) : prev.rc_selected_date,
                            }));
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-1)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="">— Select Reading Circle Session —</option>
                          <optgroup label="Lower Grades (Word Astronauts)">
                            <option value="Saturday 8:00 am – 8:45 am">Saturday 8:00 am – 8:45 am</option>
                            <option value="Saturday 9:00 am – 9:45 am">Saturday 9:00 am – 9:45 am</option>
                            <option value="Tuesday 5:00 pm – 5:45 pm">Tuesday 5:00 pm – 5:45 pm</option>
                            <option value="Wednesday 5:00 pm – 5:45 pm">Wednesday 5:00 pm – 5:45 pm</option>
                            <option value="Sunday 3:00 pm – 4:45 pm">Sunday 3:00 pm – 4:45 pm</option>
                          </optgroup>
                          <optgroup label="Upper Grades (Word Miners)">
                            <option value="Saturday 10:00 am – 10:45 am">Saturday 10:00 am – 10:45 am</option>
                            <option value="Tuesday 6:00 pm – 6:45 pm">Tuesday 6:00 pm – 6:45 pm</option>
                            <option value="Wednesday 6:00 pm – 6:45 pm">Wednesday 6:00 pm – 6:45 pm</option>
                            <option value="Sunday 4:00 pm – 4:45 pm">Sunday 4:00 pm – 4:45 pm</option>
                          </optgroup>
                        </select>
                        {form.rc_session && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--green)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} /> Will assign cub to {form.rc_session} upon save
                          </div>
                        )}
                      </div>
                    )}

                    {/* Date Field - omitted for Reading Circle selection because RC is recurring */}
                    {cfg.key !== 'rc_selected' && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: 'var(--text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 5,
                        }}>
                          Date
                        </label>
                        <input
                          type="date"
                          value={currentDate}
                          onChange={e => updateField(cfg.dateKey, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-1)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    )}

                    {/* Optional Feedback */}
                    {cfg.feedbackKey && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: 'var(--text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 5,
                        }}>
                          Notes / Feedback
                        </label>
                        <textarea
                          rows={2}
                          value={currentFeedback}
                          placeholder={cfg.feedbackPlaceholder}
                          onChange={e => updateField(cfg.feedbackKey!, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 11px',
                            borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-1)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            outline: 'none',
                            lineHeight: 1.45,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer with Save Action */}
        <div style={{
          padding: '1.1rem 1.5rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          gap: '0.75rem',
          flexShrink: 0,
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
            disabled={isPending}
            style={{
              flex: 2, padding: '10px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              opacity: isPending ? 0.7 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            {isPending ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
