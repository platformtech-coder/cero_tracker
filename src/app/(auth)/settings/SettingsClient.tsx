'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Profile, Role } from '@/lib/types';
import { 
  updateProfileRole, 
  saveConfigValue, 
  deleteConfigValue, 
  createUser,
  deleteUser,
  updateUserProfile,
} from '@/lib/actions/settings';
import { saveFormsConfig, saveFormsPartialConfig, rebuildForms, type FormRebuildTarget } from '@/lib/actions/forms';
import type { FormsConfig, SessionConfig, GradeMappingEntry } from '@/lib/constants/forms';
import {
  KNOWN_ORI_SESSION_ITEM_ID,
  KNOWN_RC_LOWER_ITEM_IDS,
  KNOWN_RC_UPPER_ITEM_IDS,
  DEFAULT_ORI_SESSIONS,
  DEFAULT_RC_SESSIONS_LOWER,
  DEFAULT_RC_SESSIONS_UPPER,
} from '@/lib/constants/forms';
import { extractSessionDay } from '@/lib/utils/rc';
import { toast } from 'sonner';
import {
  Loader2, PlusCircle, Save, Edit2, Trash2, X, User, Mail, Lock,
  Shield, ChevronLeft, ChevronRight, Plus, Wrench, ChevronDown, CheckCircle2,
  Users, List, BookOpen, Calendar, Eye, EyeOff,
} from 'lucide-react';
import sharedStyles from '@/components/ui/dashboard.module.css';
import styles from '../engagements/engagements.module.css';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface ConfigItem {
  id: number;
  category: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

interface Props {
  profiles: Profile[];
  config: ConfigItem[];
  profile: Profile;
  repNames: string[];
  formsConfig: FormsConfig | null;
}

const INTERACTION_CATEGORIES = [
  { key: 'type', label: 'Interaction Types' },
  { key: 'purpose', label: 'Interaction Purposes' },
  { key: 'status', label: 'Interaction Status' },
] as const;

// ─── Session Constants ──────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8'];

// ─── Session Sub-components ────────────────────────────────────

function SessionTextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13,
        fontFamily: mono ? 'monospace' : 'inherit', boxSizing: 'border-box',
      }}
    />
  );
}

function SessionDaySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 32px 8px 10px', border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13,
          appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
    </div>
  );
}

function SessionBuilder({
  sessions,
  onChange,
  addLabel,
  hint,
}: {
  sessions: SessionConfig[];
  onChange: (s: SessionConfig[]) => void;
  addLabel: string;
  hint?: string;
}) {
  const update = (idx: number, field: keyof SessionConfig, val: string) => {
    onChange(sessions.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };
  const remove = (idx: number) => onChange(sessions.filter((_, i) => i !== idx));
  const add = () => onChange([...sessions, { day: 'Saturday', startTime: '9:00 am', endTime: '9:45 am' }]);

  return (
    <div>
      {hint && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px 0' }}>{hint}</p>}
      {sessions.length === 0 && (
        <div style={{
          padding: '12px 16px', background: 'var(--bg)', border: '1px dashed var(--border)',
          borderRadius: 8, fontSize: 12, color: 'var(--text-3)', marginBottom: 12,
        }}>
          No sessions added yet. Click &quot;{addLabel}&quot; to add one.
        </div>
      )}
      {sessions.map((s, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
          <div>
            {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Day</div>}
            <SessionDaySelect value={s.day} onChange={v => update(i, 'day', v)} />
          </div>
          <div>
            {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Start Time</div>}
            <SessionTextInput value={s.startTime} onChange={v => update(i, 'startTime', v)} placeholder="7:00 pm" />
          </div>
          <div>
            {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>End Time</div>}
            <SessionTextInput value={s.endTime} onChange={v => update(i, 'endTime', v)} placeholder="8:00 pm" />
          </div>
          <button
            onClick={() => remove(i)}
            style={{ padding: '8px 10px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', marginTop: i === 0 ? 20 : 0 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={add}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: 'var(--primary-dim)', border: '1px solid var(--primary)', borderRadius: 8,
            color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={13} /> {addLabel}
        </button>
      </div>
    </div>
  );
}

function GradeMappingSessionSelect({
  value, onChange, lowerOptions, upperOptions,
}: { value: string; onChange: (v: string) => void; lowerOptions: string[]; upperOptions: string[] }) {
  const allKnown = [...lowerOptions, ...upperOptions];
  const isCustom = value && !allKnown.includes(value);
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 32px 8px 10px', border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13,
          appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        {isCustom && <option value={value}>{value} (Current / Legacy)</option>}
        {lowerOptions.length > 0 && (
          <optgroup label="Grades 1–4 Sessions (Lower)">
            {lowerOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </optgroup>
        )}
        {upperOptions.length > 0 && (
          <optgroup label="Grades 5–8 Sessions (Upper)">
            {upperOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </optgroup>
        )}
        {lowerOptions.length === 0 && upperOptions.length === 0 && (
          <option value="">No sessions configured yet</option>
        )}
      </select>
      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
    </div>
  );
}

function GradeMappingBuilder({
  mapping, onChange, lowerSessions, upperSessions,
}: {
  mapping: GradeMappingEntry[];
  onChange: (m: GradeMappingEntry[]) => void;
  lowerSessions: SessionConfig[];
  upperSessions: SessionConfig[];
}) {
  const fmt = (s: SessionConfig) => `${s.day} ${s.startTime} – ${s.endTime}`.trim();
  const lowerOpts = lowerSessions.filter(s => s.day && s.startTime && s.endTime).map(fmt);
  const upperOpts = upperSessions.filter(s => s.day && s.startTime && s.endTime).map(fmt);
  const defaultSession = lowerOpts[0] || upperOpts[0] || 'Tuesday 5:00 pm – 5:45 pm';

  const update = (idx: number, field: keyof GradeMappingEntry, val: string) => {
    onChange(mapping.map((m, i) => {
      if (i !== idx) return m;
      const next = { ...m, [field]: val };
      if (field === 'session') next.sessionDay = extractSessionDay(val);
      return next;
    }));
  };
  const remove = (idx: number) => onChange(mapping.filter((_, i) => i !== idx));
  const add = () => onChange([...mapping, { grade: '1', session: defaultSession, sessionDay: extractSessionDay(defaultSession) }]);

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px 0' }}>
        Force a specific grade to a designated session, overriding whatever they choose on the form.
      </p>
      {mapping.length === 0 && (
        <div style={{ padding: '12px 16px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
          No grade mappings set. Cubs will use their chosen session.
        </div>
      )}
      {mapping.map((m, i) => {
        const currentSession = m.session || m.sessionDay || defaultSession;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div>
              {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Grade</div>}
              <div style={{ position: 'relative' }}>
                <select
                  value={m.grade}
                  onChange={e => update(i, 'grade', e.target.value)}
                  style={{ width: '100%', padding: '8px 32px 8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13, appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                >
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              </div>
            </div>
            <div>
              {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>Force to Session (Day & Time)</div>}
              <GradeMappingSessionSelect
                value={currentSession}
                onChange={v => update(i, 'session', v)}
                lowerOptions={lowerOpts}
                upperOptions={upperOpts}
              />
            </div>
            <button
              onClick={() => remove(i)}
              style={{ padding: '8px 10px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', marginTop: i === 0 ? 20 : 0 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={add}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--primary-dim)', border: '1px solid var(--primary)', borderRadius: 8, color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={13} /> Add Grade Mapping
        </button>
      </div>
    </div>
  );
}

// ─── RC & Ori Sessions Tab ──────────────────────────────────────
function SessionsTab({ initialConfig }: { initialConfig: FormsConfig }) {
  const [, startTransition] = useTransition();

  // Saving states
  const [isSavingOri, setIsSavingOri] = useState(false);
  const [isSavingRC, setIsSavingRC] = useState(false);

  // Rebuilding states
  const [isRebuildingOri, setIsRebuildingOri] = useState(false);
  const [isRebuildingRC, setIsRebuildingRC] = useState(false);
  const [isRebuildingAll, setIsRebuildingAll] = useState(false);

  // Rebuild modal target ('orientation' | 'reading-circle' | 'all' | null)
  const [rebuildTarget, setRebuildTarget] = useState<FormRebuildTarget | null>(null);

  // Sessions state
  const [oriSessions, setOriSessions] = useState<SessionConfig[]>(initialConfig.oriSessions);
  const [rcSessionsLower, setRcSessionsLower] = useState<SessionConfig[]>(initialConfig.rcSessionsLower);
  const [rcSessionsUpper, setRcSessionsUpper] = useState<SessionConfig[]>(initialConfig.rcSessionsUpper);
  const [rcCategoryLower, setRcCategoryLower] = useState(initialConfig.rcCategoryLower);
  const [rcCategoryUpper, setRcCategoryUpper] = useState(initialConfig.rcCategoryUpper);
  const [gradeMapping, setGradeMapping] = useState<GradeMappingEntry[]>(initialConfig.rcGradeMapping);

  // Payload builders
  const getOriPayload = (): Partial<FormsConfig> => ({
    oriSessions,
  });

  const getRCPayload = (): Partial<FormsConfig> => ({
    rcSessionsLower,
    rcSessionsUpper,
    rcCategoryLower: rcCategoryLower.trim(),
    rcCategoryUpper: rcCategoryUpper.trim(),
    rcGradeMapping: gradeMapping.map(m => {
      const sess = m.session || m.sessionDay || 'Tuesday 5:00 pm – 5:45 pm';
      return { grade: m.grade, session: sess, sessionDay: extractSessionDay(sess) };
    }),
  });

  // Save Orientation Only
  const handleSaveOri = () => {
    setIsSavingOri(true);
    startTransition(async () => {
      try {
        const res = await saveFormsPartialConfig(getOriPayload());
        if (res.success) toast.success('Orientation session settings saved!');
        else toast.error('Save failed: ' + res.error);
      } catch (e: any) {
        toast.error('Error saving: ' + e.message);
      } finally {
        setIsSavingOri(false);
      }
    });
  };

  // Save Reading Circle Only
  const handleSaveRC = () => {
    setIsSavingRC(true);
    startTransition(async () => {
      try {
        const res = await saveFormsPartialConfig(getRCPayload());
        if (res.success) toast.success('Reading Circle session settings saved!');
        else toast.error('Save failed: ' + res.error);
      } catch (e: any) {
        toast.error('Error saving: ' + e.message);
      } finally {
        setIsSavingRC(false);
      }
    });
  };

  // Confirm Rebuild Handler (Targeted)
  const handleRebuildConfirm = async () => {
    if (!rebuildTarget) return;

    if (rebuildTarget === 'orientation') {
      setIsRebuildingOri(true);
    } else if (rebuildTarget === 'reading-circle') {
      setIsRebuildingRC(true);
    } else {
      setIsRebuildingAll(true);
    }

    try {
      // 1. Auto-save corresponding form settings before rebuilding
      if (rebuildTarget === 'orientation') {
        await saveFormsPartialConfig(getOriPayload());
      } else if (rebuildTarget === 'reading-circle') {
        await saveFormsPartialConfig(getRCPayload());
      } else {
        await saveFormsPartialConfig({
          ...getOriPayload(),
          ...getRCPayload(),
        });
      }

      // 2. Rebuild the targeted form only
      const res = await rebuildForms(rebuildTarget);
      if (res.success) {
        const label =
          rebuildTarget === 'orientation'
            ? 'Orientation Google Form rebuilt successfully!'
            : rebuildTarget === 'reading-circle'
            ? 'Reading Circle Google Form rebuilt successfully!'
            : 'Both Google Forms rebuilt successfully!';
        toast.success(label);
      } else {
        toast.error('Rebuild failed: ' + res.error);
      }
    } catch (e: any) {
      toast.error('Error rebuilding form: ' + e.message);
    } finally {
      setIsRebuildingOri(false);
      setIsRebuildingRC(false);
      setIsRebuildingAll(false);
      setRebuildTarget(null);
    }
  };

  const getModalDetails = () => {
    if (rebuildTarget === 'orientation') {
      return {
        title: 'Rebuild Orientation Google Form?',
        message: 'This will save the current Orientation sessions and overwrite the session options on the live Google Form with the rolling next upcoming dates. Reading Circle form will NOT be touched. Continue?',
      };
    }
    if (rebuildTarget === 'reading-circle') {
      return {
        title: 'Rebuild Reading Circle Google Form?',
        message: 'This will save the current Reading Circle sessions and grade mappings, and overwrite the dropdown options on the live Reading Circle Google Form. Orientation form will NOT be touched. Continue?',
      };
    }
    return {
      title: 'Rebuild Both Google Forms?',
      message: 'This will connect to Google and overwrite the dropdown options on BOTH Orientation and Reading Circle forms with the current sessions. Continue?',
    };
  };

  const sectionCard = (
    title: string,
    subtitle: string | undefined,
    children: React.ReactNode,
    headerActions?: React.ReactNode
  ) => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {headerActions && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {headerActions}
          </div>
        )}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );

  const isAnyActionPending = isSavingOri || isSavingRC || isRebuildingOri || isRebuildingRC || isRebuildingAll;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner with Secondary Global Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Manage session schedules. Each form has its own independent <strong>Save</strong> and <strong>Rebuild</strong> buttons below.
        </div>
        <button
          onClick={() => setRebuildTarget('all')}
          disabled={isAnyActionPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: isRebuildingAll ? 0.7 : 1 }}
        >
          <Wrench size={13} /> {isRebuildingAll ? 'Rebuilding Both…' : 'Rebuild Both Forms'}
        </button>
      </div>

      {/* ── Orientation Sessions ── */}
      {sectionCard(
        '🎓 Orientation Sessions',
        'Each session calculates its single next upcoming date automatically on rebuild',
        <SessionBuilder
          sessions={oriSessions}
          onChange={setOriSessions}
          addLabel="Add Orientation Session"
          hint={`Example output on rebuild: "Tuesday (13-Oct) 7:00 pm – 8:00 pm"`}
        />,
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSaveOri}
            disabled={isSavingOri || isRebuildingOri}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              color: 'var(--text-1)', opacity: isSavingOri ? 0.7 : 1
            }}
          >
            <Save size={13} /> {isSavingOri ? 'Saving…' : 'Save Orientation'}
          </button>
          <button
            onClick={() => setRebuildTarget('orientation')}
            disabled={isRebuildingOri || isSavingOri}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', background: 'var(--primary)',
              color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              opacity: isRebuildingOri ? 0.7 : 1
            }}
          >
            <Wrench size={13} /> {isRebuildingOri ? 'Rebuilding…' : 'Rebuild Orientation Form'}
          </button>
        </div>
      )}

      {/* ── Reading Circle Sessions ── */}
      {sectionCard(
        '📖 Reading Circle Sessions',
        'Sessions are published as recurring weekly options (no dates) on rebuild',
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Lower Grades */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Grades 1–4 Sessions</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Category name applied to these cubs</div>
              </div>
              <input
                value={rcCategoryLower}
                onChange={e => setRcCategoryLower(e.target.value)}
                placeholder="Word Astronauts"
                style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--primary)', fontSize: 12, fontWeight: 700, width: 160 }}
              />
            </div>
            <SessionBuilder sessions={rcSessionsLower} onChange={setRcSessionsLower} addLabel="Add Session (Lower)" />
          </div>

          {/* Upper Grades */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Grades 5–8 Sessions</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Category name applied to these cubs</div>
              </div>
              <input
                value={rcCategoryUpper}
                onChange={e => setRcCategoryUpper(e.target.value)}
                placeholder="Word Miners"
                style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--green)', fontSize: 12, fontWeight: 700, width: 160 }}
              />
            </div>
            <SessionBuilder sessions={rcSessionsUpper} onChange={setRcSessionsUpper} addLabel="Add Session (Upper)" />
          </div>
        </div>,
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSaveRC}
            disabled={isSavingRC || isRebuildingRC}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              color: 'var(--text-1)', opacity: isSavingRC ? 0.7 : 1
            }}
          >
            <Save size={13} /> {isSavingRC ? 'Saving…' : 'Save Reading Circle'}
          </button>
          <button
            onClick={() => setRebuildTarget('reading-circle')}
            disabled={isRebuildingRC || isSavingRC}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', background: 'var(--primary)',
              color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              opacity: isRebuildingRC ? 0.7 : 1
            }}
          >
            <Wrench size={13} /> {isRebuildingRC ? 'Rebuilding…' : 'Rebuild Reading Circle Form'}
          </button>
        </div>
      )}

      {/* ── Grade Mapping ── */}
      {sectionCard(
        '🔀 Grade-to-Session Mapping',
        'Force a specific grade to a designated session, overriding their form choice (saved and applied with Reading Circle)',
        <GradeMappingBuilder
          mapping={gradeMapping}
          onChange={setGradeMapping}
          lowerSessions={rcSessionsLower}
          upperSessions={rcSessionsUpper}
        />
      )}

      {/* Rebuild Confirmation Modal */}
      <ConfirmModal
        isOpen={rebuildTarget !== null}
        onClose={() => setRebuildTarget(null)}
        onConfirm={handleRebuildConfirm}
        title={getModalDetails().title}
        message={getModalDetails().message}
        confirmText="Rebuild Now"
        variant="primary"
        isLoading={isRebuildingOri || isRebuildingRC || isRebuildingAll}
      />
    </div>
  );
}

export default function SettingsClient({ profiles, config, profile, repNames, formsConfig }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get('tab');
  const [tab, setTabState] = useState<'users' | 'config' | 'sessions'>(() => {
    return rawTab === 'config' ? 'config' : rawTab === 'sessions' ? 'sessions' : 'users';
  });

  useEffect(() => {
    if (rawTab && ['users', 'config', 'sessions'].includes(rawTab)) {
      setTabState(rawTab as 'users' | 'config' | 'sessions');
    }
  }, [rawTab]);

  const setTab = useCallback((t: 'users' | 'config' | 'sessions') => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const [userList, setUserList] = useState(profiles);
  const [configList, setConfigList] = useState(config);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addValues, setAddValues] = useState<Record<string, string>>({});
  const [configPages, setConfigPages] = useState<Record<string, number>>({});

  // Add/Edit User Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<Role>('rep');
  const [newSheetRepName, setNewSheetRepName] = useState<string>('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Confirmation modals
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary';
    confirmText?: string;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void, variant: 'danger' | 'primary' = 'danger', confirmText = 'Confirm') => {
    setConfirmState({ isOpen: true, title, message, onConfirm, variant, confirmText });
  };

  const hideConfirm = () => setConfirmState(null);

  const resetUserForm = () => {
    setNewEmail('');
    setNewPassword('');
    setNewFullName('');
    setNewRole('rep');
    setNewSheetRepName('');
    setEditingUser(null);
    setIsDrawerOpen(false);
    setShowPassword(false);
  };

  const openAddUserDrawer = () => {
    resetUserForm();
    setIsDrawerOpen(true);
  };

  const openEditUserDrawer = (user: Profile) => {
    setEditingUser(user);
    setNewEmail(user.email);
    setNewFullName(user.full_name);
    setNewRole(user.role);
    setNewSheetRepName(user.sheet_rep_name ?? '');
    setNewPassword(''); // Blank by default; entering a value updates the password
    setShowPassword(false);
    setIsDrawerOpen(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUser(true);
    const res = await createUser({
      email: newEmail,
      password: newPassword,
      fullName: newFullName,
      role: newRole,
      sheetRepName: newRole === 'rep' ? newSheetRepName : undefined,
    });
    setIsSubmittingUser(false);
    
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('User created successfully');
      resetUserForm();
      window.location.reload();
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    if (!editingUser) return;
    e.preventDefault();
    setIsSubmittingUser(true);
    const res = await updateUserProfile({
      userId: editingUser.id,
      fullName: newFullName,
      email: newEmail,
      role: newRole,
      password: newPassword || undefined,
      sheetRepName: newRole === 'rep' ? newSheetRepName : null,
    });
    setIsSubmittingUser(false);
    
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('User updated successfully');
      resetUserForm();
      window.location.reload();
    }
  };

  const handleRoleChange = async (id: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'rep' : 'admin';
    showConfirm(
      'Change Role',
      `Are you sure you want to change this user's role to ${newRole}?`,
      async () => {
        const res = await updateProfileRole(id, newRole);
        if (res.success) {
          toast.success(`Role updated to ${newRole}`);
          setUserList(userList.map(u => u.id === id ? { ...u, role: newRole } : u));
        } else {
          toast.error(res.error || 'Failed to update role');
        }
      },
      'primary',
      'Change Role'
    );
  };

  const handleDeleteUser = (user: Profile) => {
    if (user.id === profile.id) return;
    showConfirm(
      'Delete User',
      `Are you sure you want to delete "${user.full_name}" (${user.email})? This action cannot be undone.`,
      async () => {
        const res = await deleteUser(user.id);
        if (res.success) {
          toast.success('User deleted');
          setUserList(userList.filter(u => u.id !== user.id));
        } else {
          toast.error(res.error || 'Failed to delete user');
        }
      },
      'danger',
      'Delete'
    );
  };

  const handleAddConfig = async (category: string) => {
    const value = addValues[category]?.trim();
    if (!value) return;
    
    const res = await saveConfigValue({ category, value, sort_order: 0, is_active: true });
    if (res.success) {
      toast.success('Config item added');
      setAddValues(prev => ({ ...prev, [category]: '' }));
      window.location.reload();
    } else {
      toast.error(res.error || 'Failed to add config');
    }
  };

  const handleAddChange = (category: string, value: string) => {
    setAddValues(prev => ({ ...prev, [category]: value }));
  };

  const handleEditStart = (item: ConfigItem) => {
    setEditingId(item.id);
    setEditValue(item.value);
  };

  const handleEditSave = async (item: ConfigItem) => {
    if (!editValue.trim()) return;
    
    const res = await saveConfigValue({ 
      id: item.id, 
      category: item.category, 
      value: editValue.trim(), 
      sort_order: item.sort_order, 
      is_active: item.is_active 
    });
    if (res.success) {
      toast.success('Config item updated');
      setConfigList(configList.map(c => c.id === item.id ? { ...c, value: editValue.trim() } : c));
      setEditingId(null);
      setEditValue('');
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  const handleDeleteConfig = (item: ConfigItem) => {
    showConfirm(
      'Delete Config Item',
      `Are you sure you want to delete "${item.value}"?`,
      async () => {
        const res = await deleteConfigValue(item.id);
        if (res.success) {
          toast.success('Config item deleted');
          setConfigList(configList.filter(c => c.id !== item.id));
        } else {
          toast.error('Error: ' + res.error);
        }
      },
      'danger',
      'Delete'
    );
  };

  const toggleConfigActive = async (item: ConfigItem) => {
    const res = await saveConfigValue({ 
      id: item.id, 
      category: item.category, 
      value: item.value, 
      sort_order: item.sort_order, 
      is_active: !item.is_active 
    });
    if (res.success) {
      toast.success(item.is_active ? 'Item deactivated' : 'Item activated');
      setConfigList(configList.map(c => c.id === item.id ? { ...c, is_active: !item.is_active } : c));
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  const getFilteredConfig = (category: string) => 
    configList.filter(c => c.category === category).sort((a, b) => a.sort_order - b.sort_order);

  if (profile.role !== 'admin') {
    return (
      <div className={sharedStyles.emptyState}>
        <div className={sharedStyles.emptyStateTitle}>Access Denied</div>
        <div className={sharedStyles.emptyStateSub}>Only administrators can access Settings.</div>
      </div>
    );
  }

  // Build a fallback formsConfig if not loaded
  const resolvedFormsConfig: FormsConfig = formsConfig ?? {
    oriFormId: '1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU',
    oriSessionItemId: KNOWN_ORI_SESSION_ITEM_ID,
    oriSessions: DEFAULT_ORI_SESSIONS,
    rcFormId: '1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls',
    rcSessionsLower: DEFAULT_RC_SESSIONS_LOWER,
    rcSessionsUpper: DEFAULT_RC_SESSIONS_UPPER,
    rcCategoryLower: 'Word Astronauts',
    rcCategoryUpper: 'Word Miners',
    rcGradeMapping: [],
    rcLowerItemIds: KNOWN_RC_LOWER_ITEM_IDS,
    rcUpperItemIds: KNOWN_RC_UPPER_ITEM_IDS,
  };

  return (
    <div>
      <div className={styles.tabs}>
        <button 
          className={`${styles.tabBtn} ${tab === 'users' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('users')}
        >
          <Users size={14} style={{ marginRight: 6 }} /> User Management
        </button>
        <button 
          className={`${styles.tabBtn} ${tab === 'config' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('config')}
        >
          <List size={14} style={{ marginRight: 6 }} /> Interactions Dropdown
        </button>
        <button 
          className={`${styles.tabBtn} ${tab === 'sessions' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('sessions')}
        >
          <BookOpen size={14} style={{ marginRight: 4 }} /> <Calendar size={14} style={{ marginRight: 4 }} /> RC & Ori Sessions
        </button>
      </div>

      {tab === 'users' && (
        <div className={sharedStyles.tableWrap}>
          <div className={sharedStyles.tableControls}>
            <div className={sharedStyles.tableControlsLeft} />
            <div className={sharedStyles.tableControlsRight}>
              <button className={styles.primaryBtn} onClick={openAddUserDrawer}>
                <PlusCircle size={16} /> Add User
              </button>
            </div>
          </div>
          
          <div className={sharedStyles.tableScrollBody}>
            <table className={sharedStyles.table}>
              <thead>
                              <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Linked Rep</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userList.map(user => (
                  <tr 
                    key={user.id} 
                    onClick={() => openEditUserDrawer(user)}
                    style={{ cursor: 'pointer' }}
                    className={sharedStyles.tableRowHover}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{user.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{user.email}</div>
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`${sharedStyles.badge} ${user.role === 'admin' ? sharedStyles.badgeOrange : user.role === 'viewer' ? sharedStyles.badgeBlue : sharedStyles.badgeGreen}`}>
                        {user.role.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {user.role === 'rep' ? (
                        user.sheet_rep_name
                          ? <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{user.sheet_rep_name}</span>
                          : <span style={{ fontSize: '0.75rem', color: 'var(--orange)' }}>⚠ Not linked</span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditUserDrawer(user); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '0.5rem', borderRadius: '6px' }}
                          title="Edit user"
                        >
                          <Edit2 size={16} />
                        </button>
                        {user.id !== profile.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteUser(user); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0.5rem', borderRadius: '6px' }}
                            title="Delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
          {INTERACTION_CATEGORIES.map(({ key, label }) => {
            const items = getFilteredConfig(key);
            const page = configPages[key] || 1;
            const pageSize = 10;
            const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
            const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

            return (
              <div key={key} className={sharedStyles.statCard} style={{ minHeight: '320px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1)' }}>{label}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                      type="text"
                      value={addValues[key] || ''}
                      onChange={e => handleAddChange(key, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddConfig(key)}
                      placeholder="Add new value..."
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        color: 'var(--text-1)',
                        fontSize: '0.875rem',
                        fontFamily: 'inherit'
                      }}
                    />
                    <button 
                      className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`}
                      onClick={() => handleAddConfig(key)}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                    >
                      <PlusCircle size={16} style={{ marginRight: 6 }} /> Add
                    </button>
                  </div>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table className={sharedStyles.table} style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '100%', textAlign: 'left' }}>Value</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>Status</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map(item => (
                        <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.5 }}>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            {editingId === item.id ? (
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleEditSave(item)}
                                  onBlur={() => handleEditSave(item)}
                                  autoFocus
                                  style={{ 
                                    flex: 1, 
                                    padding: '0.25rem 0.5rem', 
                                    border: '1px solid var(--primary)', 
                                    borderRadius: '4px',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text-1)',
                                    fontSize: '0.8rem'
                                  }}
                                />
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.875rem' }}>{item.value}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>
                            <button 
                              onClick={() => toggleConfigActive(item)}
                              style={{ 
                                border: 'none', cursor: 'pointer',
                                fontSize: '0.7rem', color: item.is_active ? 'var(--red)' : 'var(--green)',
                                fontWeight: 600, padding: '0.15rem 0.4rem',
                                borderRadius: '9999px',
                                background: item.is_active ? 'var(--red-dim)' : 'var(--green-dim)'
                              }}
                            >
                              {item.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>
                            {editingId === item.id ? (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => handleEditSave(item)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', padding: '0.25rem' }}
                                  title="Save"
                                >
                                  <Save size={14} />
                                </button>
                                <button 
                                  onClick={() => { setEditingId(null); setEditValue(''); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0.25rem' }}
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => handleEditStart(item)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '0.25rem' }}
                                  title="Edit"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteConfig(item)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0.25rem' }}
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '2rem' }}>No items</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    <span>Page {page} of {totalPages}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => setConfigPages(p => ({ ...p, [key]: Math.max(1, page - 1) }))}
                        disabled={page === 1}
                        className={sharedStyles.pageBtn}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button 
                        onClick={() => setConfigPages(p => ({ ...p, [key]: Math.min(totalPages, page + 1) }))}
                        disabled={page === totalPages}
                        className={sharedStyles.pageBtn}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'sessions' && (
        <SessionsTab initialConfig={resolvedFormsConfig} />
      )}

      {/* Add/Edit User Drawer */}
      {isDrawerOpen && (
        <>
          <div 
            className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`} 
            onClick={resetUserForm} 
            style={{ zIndex: 20000 }} 
          />
          <div 
            className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`} 
            style={{ zIndex: 20001, maxWidth: '420px' }}
          >
            <div className={sharedStyles.drawerHeader}>
              <h2 className={sharedStyles.drawerTitle}>{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button className={sharedStyles.drawerClose} onClick={resetUserForm}><X size={18} /></button>
            </div>
            
            <div className={sharedStyles.drawerBody}>
              <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase' }}>Full Name *</label>
                  <input required type="text" value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="e.g. Jane Doe" className={sharedStyles.formInput} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase' }}>Email Address *</label>
                  <input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="jane@example.com" className={sharedStyles.formInput} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    {editingUser ? 'Password (leave blank to keep unchanged)' : 'Password *'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)} 
                      placeholder={editingUser ? 'Leave blank to keep unchanged' : 'Min. 6 characters'} 
                      className={sharedStyles.formInput}
                      style={{ paddingRight: '2.75rem' }}
                      minLength={editingUser ? 0 : 6}
                      required={!editingUser}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute', right: '0.6rem', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-3)', padding: '0.2rem',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {editingUser && (
                    <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                      Leave blank to keep current password, or enter a new one to update.
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase' }}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value as any)} className={sharedStyles.formInput} style={{ appearance: 'none' }}>
                    <option value="rep">CER Rep (Limited access)</option>
                    <option value="admin">Admin (Full access)</option>
                    <option value="viewer">Community Viewer (Read-only Gen. Comm)</option>
                  </select>
                </div>

                {newRole === 'rep' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Link to Rep (Sheet Name)
                    </label>
                    <select
                      value={newSheetRepName}
                      onChange={e => setNewSheetRepName(e.target.value)}
                      className={sharedStyles.formInput}
                      style={{ appearance: 'none' }}
                    >
                      <option value="">— Select rep to link —</option>
                      {repNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                      Linking a rep ensures this user only sees contacts assigned to that name in the Google Sheet.
                    </p>
                  </div>
                )}

                <button 
                  type="submit" 
                  style={{ 
                    width: '100%', padding: '12px', borderRadius: '10px', marginTop: '16px',
                    background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '14px',
                    cursor: isSubmittingUser ? 'not-allowed' : 'pointer', opacity: isSubmittingUser ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    border: 'none', transition: 'opacity 0.2s'
                  }} 
                  disabled={isSubmittingUser}
                >
                  {isSubmittingUser ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : (editingUser ? 'Save Changes' : 'Create User')}
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      {confirmState && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          onClose={hideConfirm}
          onConfirm={() => { confirmState.onConfirm(); hideConfirm(); }}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          variant={confirmState.variant}
        />
      )}
    </div>
  );
}