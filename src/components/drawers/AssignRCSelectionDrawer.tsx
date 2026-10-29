'use client';

import { useState, useMemo, useTransition } from 'react';
import { X, BookOpen, Loader2, ExternalLink } from 'lucide-react';
import { changeCubRCSession } from '@/lib/actions/reading-circle';
import { formatDate } from '@/lib/utils/date';
import { toast } from 'sonner';
import CubProfileDrawer from '@/components/drawers/CubProfileDrawer';

const DEFAULT_RC_SESSION_OPTIONS = [
  'Tuesday 5:00 pm – 5:45 pm',
  'Wednesday 5:00 pm – 5:45 pm',
  'Saturday 8:00 am – 8:45 am',
  'Saturday 9:00 am – 9:45 am',
  'Saturday 10:00 am – 10:45 am',
  'Sunday 3:00 pm – 3:45 pm',
];

interface PendingRCRecord {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_phone: string | null;
  date_onboarded: string | null;
  orientation_stage: string | null;
  orientation_completion_date: string | null;
  relationship_owner: string;
}

interface AssignRCSelectionDrawerProps {
  isOpen: boolean;
  cub: PendingRCRecord | null;
  availableSessions?: string[];
  onClose: () => void;
  onAssigned: (cubId: string, session: string) => void;
  readOnly?: boolean;
}

export default function AssignRCSelectionDrawer({
  isOpen,
  cub,
  availableSessions = [],
  onClose,
  onAssigned,
  readOnly = false,
}: AssignRCSelectionDrawerProps) {
  const [showCubProfile, setShowCubProfile] = useState(false);
  const sessionOptions = useMemo(() => {
    return availableSessions.length > 0 ? availableSessions : DEFAULT_RC_SESSION_OPTIONS;
  }, [availableSessions]);

  const [session, setSession] = useState(sessionOptions[0] || '');
  const [isPending, startTransition] = useTransition();

  if (!isOpen || !cub) return null;

  const handleSubmit = () => {
    if (!session) return;
    startTransition(async () => {
      const res = await changeCubRCSession({
        cub_id: cub.cub_id,
        new_session: session,
      });
      if (res.error) {
        toast.error('Error assigning session: ' + res.error);
        return;
      }
      toast.success(`Assigned ${cub.cub_first_name} to ${session} (${res.newCategory || ''})`);
      onAssigned(cub.cub_id, session);
      onClose();
    });
  };

  return (
    <>
      {/* Overlay backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 999,
        }}
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          maxWidth: 480,
          background: 'var(--bg-card, #ffffff)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow, 0 10px 25px -5px rgba(0,0,0,0.2))',
          zIndex: 1000,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-card, #ffffff)',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--primary-dim, rgba(168,85,247,0.1))',
                color: 'var(--primary, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-1)' }}>
                Assign Reading Circle Session
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {cub.cub_id && (
              <button
                type="button"
                onClick={() => setShowCubProfile(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-3)',
                  padding: '0.35rem',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
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
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-3)',
                padding: '0.35rem',
                borderRadius: 6,
              }}
              title="Close drawer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
          {/* Cub Info Card */}
          <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '0.875rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-1)' }}>
              {cub.cub_first_name} {cub.cub_last_name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>
              ID: {cub.cub_id} • Onboarded: {cub.date_onboarded ? formatDate(cub.date_onboarded) : '—'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 4 }}>
              Parent: {cub.parent_first_name} {cub.parent_last_name} ({cub.parent_phone || 'No phone'})
            </div>
          </div>

          {/* Session Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Select Reading Circle Session
            </label>
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-1)',
                fontSize: '0.85rem',
              }}
            >
              {sessionOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card, #ffffff)',
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-2)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            style={{
              padding: '9px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--primary, #a855f7)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <BookOpen size={15} />}
            {isPending ? 'Assigning…' : 'Assign Session'}
          </button>
        </div>
      </div>

      {showCubProfile && cub.cub_id && (
        <CubProfileDrawer
          cubId={cub.cub_id}
          readOnly={readOnly}
          onClose={() => setShowCubProfile(false)}
        />
      )}
    </>
  );
}