'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Archive,
  Search,
  RefreshCw,
  RotateCcw,
  Trash2,
  Phone,
  Mail,
  School,
  User,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getArchivedCubs,
  restoreArchivedCubAction,
  deleteArchivedCubPermanently,
  type ArchivedCubItem,
} from '@/lib/actions/system-admin';
import { SkeletonTable } from '@/components/ui/Skeleton';

export default function ArchivedCubsTab({ onRefreshOverview }: { onRefreshOverview?: () => void }) {
  const [cubs, setCubs] = useState<ArchivedCubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<'All' | 'RCS' | 'CDLS' | 'Gen. Comm'>('All');
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ArchivedCubItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchCubs = async () => {
    setLoading(true);
    try {
      const data = await getArchivedCubs({
        search: search.trim() || undefined,
        segment: selectedSegment !== 'All' ? selectedSegment : undefined,
      });
      setCubs(data);
    } catch (err: any) {
      toast.error('Failed to load archived cubs: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCubs();
  }, [selectedSegment]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCubs();
  };

  const handleRestore = async (cub: ArchivedCubItem) => {
    setRestoringId(cub.cub_id);
    startTransition(async () => {
      try {
        const res = await restoreArchivedCubAction(cub.cub_id);
        if (res.success) {
          toast.success(`Restored ${cub.cub_first_name} ${cub.cub_last_name} (${cub.cub_id}) to active Directory`);
          setCubs(prev => prev.filter(c => c.cub_id !== cub.cub_id));
          onRefreshOverview?.();
        } else {
          toast.error(res.error || 'Failed to restore cub');
        }
      } catch (err: any) {
        toast.error(err?.message || 'Error restoring cub');
      } finally {
        setRestoringId(null);
      }
    });
  };

  const handleDeletePermanent = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteArchivedCubPermanently(deleteTarget.cub_id);
      if (res.success) {
        toast.success(`Permanently deleted ${deleteTarget.cub_first_name} ${deleteTarget.cub_last_name}`);
        setCubs(prev => prev.filter(c => c.cub_id !== deleteTarget.cub_id));
        setDeleteTarget(null);
        setDeleteConfirmText('');
        onRefreshOverview?.();
      } else {
        toast.error(res.error || 'Failed to delete cub');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error deleting cub');
    } finally {
      setIsDeleting(false);
    }
  };

  const segmentCounts = {
    all: cubs.length,
    rcs: cubs.filter(c => c.segment === 'RCS').length,
    cdls: cubs.filter(c => c.segment === 'CDLS').length,
    genComm: cubs.filter(c => c.segment === 'Gen. Comm').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Top Header Banner ── */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '24px 28px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(234, 88, 12, 0.15)',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ea580c',
                }}
              >
                <Archive size={20} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>
                Archived Cubs & Disabled Accounts
              </h2>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(234, 88, 12, 0.15)',
                  color: '#fb923c',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                }}
              >
                {cubs.length} Archived
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-2)', maxWidth: 750, lineHeight: 1.5 }}>
              Cubs removed from the Master Google Sheet (e.g. students who moved schools from RCS/CDLS, graduated, or withdrew).
              Their historical interactions, streaks, and contact records are safely preserved here for parental community outreach, but excluded from all active calculations and rep views.
            </p>
          </div>

          <button
            onClick={fetchCubs}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Operational Guidance Callout ── */}
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 12,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            fontSize: 12,
            color: 'var(--text-2)',
            lineHeight: 1.6,
          }}
        >
          <Info size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ color: '#60a5fa' }}>How Archiving & Sync Works:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              <li>
                <strong>Auto-Archiving:</strong> If a cub is deleted or omitted from the master sheet during sync, they are automatically placed in this disabled state. They will <em>not</em> appear in the Directory, Orientation, Reading Circle, or Dashboard counts.
              </li>
              <li>
                <strong>Auto-Restoration:</strong> If an archived cub reappears in the master sheet in a subsequent sync, the system will automatically unarchive them and restore them to the active roster with zero data loss.
              </li>
              <li>
                <strong>Community Outreach:</strong> Use the parent phone & WhatsApp links below to reach out to families who left RCS/CDLS schools and invite them to become paying General Community subscribers.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Search and Segment Filter Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(['All', 'RCS', 'CDLS', 'Gen. Comm'] as const).map(seg => {
            const isActive = selectedSegment === seg;
            return (
              <button
                key={seg}
                onClick={() => setSelectedSegment(seg)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-2)',
                  transition: 'all 0.15s ease',
                }}
              >
                {seg}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 300px', maxWidth: 450 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              type="text"
              placeholder="Search by cub name, ID, parent phone, or school..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: 8,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'var(--primary)',
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* ── Cubs Table / Roster ── */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}
      >
        {loading ? (
          <div style={{ padding: 12 }}>
            <SkeletonTable
              rows={8}
              columns={[
                { header: 'Cub Info', width: '22%' },
                { header: 'Segment & School', width: '16%' },
                { header: 'Parent Contact', width: '20%' },
                { header: 'Rep', width: '12%' },
                { header: 'Archived On & Reason', width: '18%' },
                { header: 'Actions', width: '12%', align: 'right' },
              ]}
              showSearch={false}
              showFilters={false}
            />
          </div>
        ) : cubs.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                background: 'rgba(234, 88, 12, 0.1)',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-1)' }}>
              No Archived Cubs Found
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 460, marginInline: 'auto' }}>
              {search.trim()
                ? `No archived records match "${search}". Try clearing your search query.`
                : 'All synced cubs are currently active in the main directory. When cubs are removed from the Master Sheet, they will appear here.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', color: 'var(--text-3)', fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Cub / Student</th>
                  <th style={{ padding: '12px 16px' }}>Segment & School</th>
                  <th style={{ padding: '12px 16px' }}>Parent Contacts</th>
                  <th style={{ padding: '12px 16px' }}>Last Assigned Rep</th>
                  <th style={{ padding: '12px 16px' }}>Archived On & Reason</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cubs.map(cub => (
                  <tr
                    key={cub.cub_id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Cub Name & ID */}
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>
                        {cub.cub_first_name} {cub.cub_last_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <code style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'monospace' }}>
                          {cub.cub_id}
                        </code>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: cub.sub_status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: cub.sub_status === 'active' ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {cub.sub_status}
                        </span>
                      </div>
                    </td>

                    {/* Segment & School */}
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background:
                            cub.segment === 'RCS'
                              ? 'rgba(168, 85, 247, 0.15)'
                              : cub.segment === 'CDLS'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(34, 197, 94, 0.15)',
                          color:
                            cub.segment === 'RCS'
                              ? '#c084fc'
                              : cub.segment === 'CDLS'
                              ? '#60a5fa'
                              : '#4ade80',
                        }}
                      >
                        {cub.segment}
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <School size={12} style={{ color: 'var(--text-3)' }} />
                        {cub.school_name || 'No school recorded'}
                      </div>
                    </td>

                    {/* Parent Contacts */}
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                        {cub.parent_first_name || cub.parent_last_name
                          ? `${cub.parent_first_name} ${cub.parent_last_name}`
                          : '—'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                        {cub.parent_phone && (
                          <a
                            href={`tel:${cub.parent_phone}`}
                            style={{
                              fontSize: 11,
                              color: 'var(--text-2)',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Phone size={11} style={{ color: '#22c55e' }} />
                            {cub.parent_phone}
                          </a>
                        )}
                        {cub.parent_email && (
                          <a
                            href={`mailto:${cub.parent_email}`}
                            style={{
                              fontSize: 11,
                              color: 'var(--text-3)',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Mail size={11} />
                            {cub.parent_email}
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Last Assigned Rep */}
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-1)', fontWeight: 500 }}>
                        <User size={13} style={{ color: 'var(--text-3)' }} />
                        {cub.relationship_owner || 'Unassigned'}
                      </div>
                    </td>

                    {/* Date Archived & Reason */}
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} style={{ color: 'var(--text-3)' }} />
                        {cub.archived_at ? new Date(cub.archived_at).toLocaleDateString('en-GB') : 'Sync detection'}
                      </div>
                      <div style={{ fontSize: 10, color: '#f97316', marginTop: 4 }}>
                        {cub.archived_reason || 'Removed from Master Sheet'}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          onClick={() => handleRestore(cub)}
                          disabled={restoringId === cub.cub_id || isPending}
                          title="Restore to Active Directory"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 12px',
                            borderRadius: 6,
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            color: '#22c55e',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <RotateCcw size={12} className={restoringId === cub.cub_id ? 'spin' : ''} />
                          Restore
                        </button>

                        <button
                          onClick={() => {
                            setDeleteTarget(cub);
                            setDeleteConfirmText('');
                          }}
                          title="Permanently Delete Cub Records"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#ef4444',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Permanent Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              maxWidth: 480,
              width: '100%',
              padding: 24,
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
                  Permanently Delete Cub?
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Action is irreversible
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 16 }}>
              You are about to permanently purge{' '}
              <strong style={{ color: 'var(--text-1)' }}>
                {deleteTarget.cub_first_name} {deleteTarget.cub_last_name} ({deleteTarget.cub_id})
              </strong>
              . This will delete their master record, operational records, and all historical actions and reading data.
            </p>

            <div
              style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 16,
                fontSize: 12,
                color: '#f87171',
              }}
            >
              ⚠️ If the parent agreed not to subscribe to the general community, this permanently removes their subscription and contact profile.
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
              Type <span style={{ color: '#ef4444' }}>DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-1)',
                fontSize: 13,
                outline: 'none',
                marginBottom: 20,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText('');
                }}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePermanent}
                disabled={deleteConfirmText.trim() !== 'DELETE' || isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: deleteConfirmText.trim() === 'DELETE' ? '#ef4444' : 'var(--border)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: deleteConfirmText.trim() === 'DELETE' ? 'pointer' : 'not-allowed',
                }}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Permanent Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
