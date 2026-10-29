'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, ChevronLeft, ChevronRight, RefreshCw, X, Edit2, Trash2, AlertCircle, ArrowUpDown } from 'lucide-react';
import type { HandoverNote, Profile } from '@/lib/types';
import { submitHandoverNote, updateHandoverNote, deleteHandoverNote } from '@/lib/actions/handover';
import sharedStyles from '@/components/ui/dashboard.module.css';
import { Pagination } from '@/components/ui/Pagination';
import tabStyles from '../engagements/engagements.module.css';
import { formatDate, formatDateTime, formatTime } from '@/lib/utils/date';
import { toast } from 'sonner';
import { useTableSort } from '@/hooks/useTableSort';

const PAGE_SIZE = 15;

interface Props {
  initialNotes: (HandoverNote & { profile: { full_name: string } })[];
  profile: Profile;
}


// ─── Note Detail / Edit Drawer ───────────────────────────────────────────────
function NoteDrawer({
  note,
  isOwner,
  onClose,
  onSave,
  onDelete,
  initialConfirmDelete,
}: {
  note: HandoverNote & { profile: { full_name: string } };
  isOwner: boolean;
  onClose: () => void;
  onSave: (id: number, summary: string, pendingIssues: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  initialConfirmDelete?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState(note.summary);
  const [pendingIssues, setPendingIssues] = useState(note.pending_issues ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(initialConfirmDelete ?? false);

  const handleSave = async () => {
    if (!summary.trim()) return;
    setIsSaving(true);
    await onSave(note.id, summary, pendingIssues);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(note.id);
    setIsDeleting(false);
  };

  return (
    <>
      <div
        className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`}
        onClick={onClose}
      />
      <div className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`}>
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>Handover Note</h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={sharedStyles.drawerBody}>
          {/* Meta */}
          <div className={sharedStyles.drawerHero}>
            <div className={sharedStyles.drawerHeroTop}>
              <div className={sharedStyles.drawerHeroIdentity}>
                <div className={`${sharedStyles.profileAvatar}`} style={{ background: 'var(--primary)', fontSize: 16 }}>
                  {note.profile.full_name?.[0] ?? '?'}
                </div>
                <div>
                  <div className={sharedStyles.drawerHeroName}>{note.profile.full_name}</div>
                  <div className={sharedStyles.drawerHeroMeta}>
                    <span>{formatDateTime(note.date)}</span>
                  </div>
                </div>
              </div>
              {isOwner && !isEditing && (
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    <Edit2 size={14} /> Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ background: 'var(--red-dim)', color: 'var(--red)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Delete confirm */}
          {confirmDelete && (
            <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--red-dim)', borderRadius: 10, border: '1px solid var(--red)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertCircle size={16} color="var(--red)" />
                <span style={{ fontWeight: 600, color: 'var(--red)', fontSize: '0.875rem' }}>Delete this note?</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0 0 12px' }}>This action cannot be undone.</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isDeleting ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Trash2 size={13} />}
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ background: 'var(--bg-input)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Shift Summary */}
          <div className={sharedStyles.drawerSection}>
            <div className={sharedStyles.drawerSectionTitle}>Shift Summary</div>
            {isEditing ? (
              <textarea
                rows={5}
                value={summary}
                onChange={e => setSummary(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--primary)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: '0.875rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              />
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{note.summary}</p>
            )}
          </div>

          {/* Pending Issues */}
          <div className={sharedStyles.drawerSection}>
            <div className={sharedStyles.drawerSectionTitle}>Pending Issues / Follow-ups</div>
            {isEditing ? (
              <textarea
                rows={4}
                value={pendingIssues}
                onChange={e => setPendingIssues(e.target.value)}
                placeholder="Any pending issues for the next shift..."
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--primary)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: '0.875rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              />
            ) : (
              <p style={{ fontSize: '0.875rem', color: note.pending_issues ? 'var(--orange)' : 'var(--text-3)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {note.pending_issues || 'None logged.'}
              </p>
            )}
          </div>

          {/* Edit save/cancel */}
          {isEditing && (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => { setIsEditing(false); setSummary(note.summary); setPendingIssues(note.pending_issues ?? ''); }}
                style={{ padding: '0.55rem 1.25rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-2)', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !summary.trim()}
                className={tabStyles.submitBtn}
              >
                {isSaving ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function HandoverClient({ initialNotes, profile }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [pendingIssues, setPendingIssues] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);
  const [selectedNote, setSelectedNote] = useState<(HandoverNote & { profile: { full_name: string } }) | null>(null);
  const [repFilter, setRepFilter] = useState<string>('All Reps');
  const [preConfirmDelete, setPreConfirmDelete] = useState<number | null>(null);

  const allReps = useMemo(() => {
    const names = new Set<string>(['All Reps']);
    initialNotes.forEach(n => names.add(n.profile.full_name));
    return Array.from(names).sort();
  }, [initialNotes]);

  const filteredNotes = useMemo(() => {
    if (repFilter === 'All Reps') return notes;
    return notes.filter(n => n.profile.full_name === repFilter);
  }, [notes, repFilter]);

  const { sortedData, handleSort, getSortIndicator } = useTableSort(filteredNotes, {
    sortableKeys: ['date', 'profile.full_name', 'summary', 'pending_issues'],
    getSortValue: (item, key) => {
      if (key === 'profile.full_name') return item.profile.full_name;
      return item[key as keyof typeof item];
    },
  });

  const paginated = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) { setError('Summary is required.'); return; }
    setError('');
    startTransition(async () => {
      const res = await submitHandoverNote({ summary, pending_issues: pendingIssues });
      if (res.success) {
        setIsFormOpen(false);
        setSummary('');
        setPendingIssues('');
        router.refresh();
      } else {
        setError(res.error ?? 'Failed to save note.');
      }
    });
  };

  const handleSave = async (id: number, sum: string, issues: string) => {
    const res = await updateHandoverNote(id, { summary: sum, pending_issues: issues });
    if (res.success) {
      toast.success('Note updated');
      setNotes(prev => prev.map(n => n.id === id ? { ...n, summary: sum, pending_issues: issues } : n));
      setSelectedNote(prev => prev?.id === id ? { ...prev, summary: sum, pending_issues: issues } : prev);
      router.refresh();
    } else {
      toast.error(res.error ?? 'Failed to update note');
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteHandoverNote(id);
    if (res.success) {
      toast.success('Note deleted');
      setNotes(prev => prev.filter(n => n.id !== id));
      setSelectedNote(null);
      router.refresh();
    } else {
      toast.error(res.error ?? 'Failed to delete note');
    }
  };

  return (
    <div>

      {/* Inline form */}
      {isFormOpen && (
        <div style={{
          marginBottom: '1.5rem', padding: '1.5rem',
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)' }}>Log Handover Note</h3>
            <button onClick={() => setIsFormOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                Shift Summary <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <textarea
                required rows={4}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: '0.875rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                placeholder="What happened during your shift? Key highlights, completed tasks..."
                value={summary} onChange={e => setSummary(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                Pending Issues / Follow-ups
              </label>
              <textarea
                rows={3}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: '0.875rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                placeholder="Anything the next shift needs to action or be aware of..."
                value={pendingIssues} onChange={e => setPendingIssues(e.target.value)}
              />
            </div>
            {error && (
              <div style={{ padding: '0.6rem 1rem', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setIsFormOpen(false)} style={{ padding: '0.55rem 1.25rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-2)', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button type="submit" className={tabStyles.submitBtn} disabled={isPending}>
                {isPending ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <PlusCircle size={14} />}
                {isPending ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notes table */}
      <div className={sharedStyles.tableWrap}>
        <div className={sharedStyles.tableControls}>
          <div className={sharedStyles.tableControlsLeft}>
            <select className={sharedStyles.filterSelect} value={repFilter} onChange={e => { setRepFilter(e.target.value); setPage(1); }} style={{ width: '180px' }}>
              {allReps.map(rep => <option key={rep} value={rep}>{rep}</option>)}
            </select>
          </div>
          <div className={sharedStyles.tableControlsRight}>
            <button className={tabStyles.primaryBtn} onClick={() => { setIsFormOpen(true); setError(''); }}>
              <PlusCircle size={15} /> New Note
            </button>
            <span className={sharedStyles.sectionCount}>{filteredNotes.length}</span>
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <div className={sharedStyles.emptyState}>
            <div className={sharedStyles.emptyStateTitle}>No handover notes yet</div>
            <div className={sharedStyles.emptyStateSub}>Click &quot;New Note&quot; to log your first handover.</div>
          </div>
        ) : (
<div className={sharedStyles.tableScrollBody}>
            <table className={sharedStyles.table}>
              <thead>
                <tr>
                  <th
                    style={{ width: '15%', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('date')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Date & Time
                      {getSortIndicator('date') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th
                    style={{ width: '15%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('profile.full_name')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Logged By
                      {getSortIndicator('profile.full_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th
                    style={{ width: '35%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('summary')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Summary
                      {getSortIndicator('summary') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th
                    style={{ width: '28%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('pending_issues')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Pending Issues
                      {getSortIndicator('pending_issues') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ width: '7%', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(note => {
                  const isOwner = note.logged_by === profile.id;
                  return (
                    <tr
                      key={note.id}
                      className={sharedStyles.tableRowHover}
                      onClick={() => setSelectedNote(note)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 600 }}>{formatDate(note.date)}</div>
                        <div style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>{formatTime(note.date)}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{note.profile.full_name}</div>
                        {isOwner && <div style={{ fontSize: '0.72rem', color: 'var(--primary)' }}>You</div>}
                      </td>
                      <td style={{ fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '280px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.summary}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: note.pending_issues ? 'var(--orange)' : 'var(--text-3)', maxWidth: '220px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.pending_issues || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isOwner ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedNote(note); }}
                              title="Edit"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '4px', borderRadius: 6, display: 'flex', alignItems: 'center' }}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedNote(note); setPreConfirmDelete(note.id); }}
                              title="Delete"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px', borderRadius: 6, display: 'flex', alignItems: 'center' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>View</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={filteredNotes.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Note detail/edit drawer */}
      {selectedNote && (
        <NoteDrawer
          note={selectedNote}
          isOwner={selectedNote.logged_by === profile.id}
          onClose={() => { setSelectedNote(null); setPreConfirmDelete(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
          initialConfirmDelete={preConfirmDelete === selectedNote.id}
        />
      )}
    </div>
  );
}
