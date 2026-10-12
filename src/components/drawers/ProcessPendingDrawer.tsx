'use client';

'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import {
  X, Search, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Users, BookOpen, Compass
} from 'lucide-react';
import type { PendingSignup } from '@/lib/types';
import {
  searchCubsForLinking,
  getLinkedCubDetails,
  type LinkedCubCandidate
} from '@/lib/actions/pending-signups';
import { processOrientationSignup } from '@/lib/actions/orientation';
import { processRCSignup } from '@/lib/actions/reading-circle';
import { formatDate, formatTime } from '@/lib/utils/date';
import { computeRCCategory } from '@/lib/utils/rc';
import { toast } from 'sonner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface ProcessPendingDrawerProps {
  pending: PendingSignup;
  type: 'orientation' | 'reading-circle';
  availableSessions?: string[];
  onClose: () => void;
  onSuccess: (id: number, status: 'Confirmed' | 'Rejected', updatedFields?: { matched_cub_id?: string; selected_session?: string; grade?: string }) => void;
}

export default function ProcessPendingDrawer({
  pending,
  type,
  availableSessions = [],
  onClose,
  onSuccess,
}: ProcessPendingDrawerProps) {
  const [selectedCub, setSelectedCub] = useState<LinkedCubCandidate | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LinkedCubCandidate[]>([]);
  const [siblingSuggestions, setSiblingSuggestions] = useState<LinkedCubCandidate[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const [isPendingAction, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: fetch existing matched cub details and sibling suggestions
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setLoadingInitial(true);
      try {
        if (pending.matched_cub_id) {
          const cub = await getLinkedCubDetails(pending.matched_cub_id);
          if (isMounted && cub) setSelectedCub(cub);
        }
        if (pending.parent_phone) {
          const siblings = await searchCubsForLinking({ parentPhone: pending.parent_phone });
          if (isMounted) setSiblingSuggestions(siblings);
        } else if (pending.cub_name && pending.cub_name.trim().length >= 3) {
          const nameMatches = await searchCubsForLinking({ query: pending.cub_name.trim(), limit: 5 });
          if (isMounted) setSiblingSuggestions(nameMatches);
        }
      } catch (err: any) {
        console.error('Error loading cub details:', err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }

    loadInitialData();
    return () => { isMounted = false; };
  }, [pending.matched_cub_id, pending.parent_phone, pending.cub_name]);

  // Debounced live search — fires 200ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchCubsForLinking({ query: q });
        setSearchResults(results);
      } catch (err: any) {
        toast.error('Search failed: ' + err.message);
      } finally {
        setIsSearching(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Select a Cub Candidate
  const handleSelectCub = (cub: LinkedCubCandidate) => {
    setSelectedCub(cub);
    setShowSearch(false);
    toast.success(`Linked to ${cub.cub_first_name} ${cub.cub_last_name} (${cub.cub_id})`);
  };

  // Unlink Cub
  const handleUnlink = () => {
    setSelectedCub(null);
    setShowSearch(true);
  };

  // Confirm / Accept
  const handleConfirm = () => {
    if (!selectedCub?.cub_id) {
      toast.error('Please link this signup to a cub from the directory before confirming.');
      return;
    }

    startTransition(async () => {
      const payload = {
        id: pending.id,
        status: 'Confirmed' as const,
        matched_cub_id: selectedCub.cub_id,
        selected_session: pending.selected_session || null,
        grade: pending.grade || null,
      };

      const res = type === 'orientation'
        ? await processOrientationSignup(payload)
        : await processRCSignup(payload);

      if (res.success) {
        toast.success(`Signup confirmed and linked to ${selectedCub.cub_first_name} ${selectedCub.cub_last_name}!`);
        onSuccess(pending.id, 'Confirmed', {
          matched_cub_id: selectedCub.cub_id,
          selected_session: pending.selected_session ?? undefined,
          grade: pending.grade ?? undefined,
        });
        onClose();
      } else {
        toast.error('Confirmation failed: ' + res.error);
      }
    });
  };

  // Reject
  const handleReject = () => {
    setShowRejectConfirm(true);
  };

  const handleRejectConfirm = () => {
    setShowRejectConfirm(false);
    startTransition(async () => {
      const payload = {
        id: pending.id,
        status: 'Rejected' as const,
      };

      const res = type === 'orientation'
        ? await processOrientationSignup(payload)
        : await processRCSignup(payload);

      if (res.success) {
        toast.info('Signup marked as Rejected');
        onSuccess(pending.id, 'Rejected');
        onClose();
      } else {
        toast.error('Rejection failed: ' + res.error);
      }
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
          maxWidth: 540,
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
                background: type === 'orientation' ? 'var(--blue-dim, rgba(59,130,246,0.1))' : 'var(--primary-dim, rgba(168,85,247,0.1))',
                color: type === 'orientation' ? 'var(--blue, #3b82f6)' : 'var(--primary, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {type === 'orientation' ? <Compass size={18} /> : <BookOpen size={18} />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-1)' }}>
                Process Booking Confirmation
              </div>
              
            </div>
          </div>

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
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>

          {/* 1. Submitted Info Card */}
          <div
            style={{
              background: 'var(--bg, #f8fafc)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '1.1rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', marginBottom: 8 }}>
              Form Submission Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', display: 'block' }}>Parent Name</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{pending.parent_name || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', display: 'block' }}>Parent Phone</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{pending.parent_phone || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', display: 'block' }}>Registered Cub Name</span>
                <span style={{ fontWeight: 700, color: 'var(--primary, #3b82f6)' }}>{pending.cub_name}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', display: 'block' }}>Submitted Date</span>
                <span style={{ color: 'var(--text-2)' }}>{formatDate(pending.timestamp)} {formatTime(pending.timestamp)}</span>
              </div>
            </div>

            {/* RC-specific: session, grade, computed category preview */}
            {type === 'reading-circle' && (
              <div style={{ marginTop: 10, borderTop: '1px dashed var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', display: 'block' }}>Selected Session</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{pending.selected_session || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', display: 'block' }}>Grade / Class</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{pending.grade || '—'}</span>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', display: 'block', marginBottom: 3 }}>Category (Preview)</span>
                    {pending.selected_session && pending.grade ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 6,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: 'var(--primary-dim, rgba(168,85,247,0.12))',
                        color: 'var(--primary, #a855f7)',
                        border: '1px solid var(--primary-dim, rgba(168,85,247,0.25))',
                      }}>
                        {computeRCCategory(pending.grade, pending.selected_session)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>Will be computed on confirmation</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Linked Cub Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)' }}>
                Target Cub (Directory Profile)
              </label>
              {selectedCub && !showSearch && (
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Search size={13} /> Change Cub
                </button>
              )}
            </div>

            {loadingInitial ? (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
                <RefreshCw size={16} className="spin" style={{ display: 'inline', marginRight: 6 }} /> Checking directory profile...
              </div>
            ) : selectedCub && !showSearch ? (
              /* High-confidence Linked Card */
              <div
                style={{
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  borderRadius: 12,
                  padding: '1.1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)' }}>
                      {selectedCub.cub_first_name} {selectedCub.cub_last_name}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                      background: 'rgba(34,197,94,0.15)', color: 'var(--green, #22c55e)'
                    }}>
                      Linked ✓
                    </span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: 6 }}>
                    ID: {selectedCub.cub_id}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>Parent: {selectedCub.parent_first_name} {selectedCub.parent_last_name} · {selectedCub.parent_phone}</div>
                    {selectedCub.relationship_owner && <div>Relationship Owner: <strong>{selectedCub.relationship_owner}</strong></div>}
                    {selectedCub.grade && <div>Grade: {selectedCub.grade}</div>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleUnlink}
                  title="Unlink and choose another cub"
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Unlink
                </button>
              </div>
            ) : (
              /* Unlinked Warning */
              <div
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 12,
                  padding: '1.1rem',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red, #ef4444)', fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>
                  <AlertTriangle size={16} /> No Cub Linked Yet
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  This signup must be linked to a cub profile before it can be confirmed. Choose a suggested sibling below or search by Cub ID / name.
                </div>
              </div>
            )}
          </div>

          {/* 3. Sibling / Parent Quick Suggestions */}
          {(!selectedCub || showSearch) && siblingSuggestions.length > 0 && (
            <div style={{ background: 'var(--bg, #f8fafc)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>
                <Users size={14} style={{ color: 'var(--primary)' }} />
                <span>Cubs found under this parent ({siblingSuggestions.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {siblingSuggestions.map(sib => {
                  const isSelected = selectedCub?.cub_id === sib.cub_id;
                  return (
                    <div
                      key={sib.cub_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '9px 12px',
                        background: isSelected ? 'var(--primary-dim, rgba(168,85,247,0.1))' : 'var(--bg-card, #ffffff)',
                        border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-1)' }}>
                          {sib.cub_first_name} {sib.cub_last_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                          ID: {sib.cub_id} {sib.grade ? `· Grade ${sib.grade}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectCub(sib)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: isSelected ? 'var(--primary)' : 'var(--bg)',
                          color: isSelected ? '#ffffff' : 'var(--primary)',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? 'Selected' : 'Link This Cub'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Directory Search Box */}
          {(!selectedCub || showSearch) && (
            <div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                {isSearching && (
                  <RefreshCw size={13} className="spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                )}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Type Cub ID, child name, or phone to search…"
                  style={{
                    width: '100%',
                    padding: '8px 36px 8px 32px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input, #ffffff)',
                    color: 'var(--text-1)',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {searchResults.map(c => (
                    <div
                      key={c.cub_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'var(--bg-card, #ffffff)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.cub_first_name} {c.cub_last_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                          {c.cub_id} · Parent: {c.parent_first_name} {c.parent_last_name} ({c.parent_phone})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCub(c)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--primary)',
                          background: 'var(--primary-dim, rgba(59,130,246,0.1))',
                          color: 'var(--primary)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}



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
            onClick={handleReject}
            disabled={isPendingAction}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)',
              color: 'var(--red, #ef4444)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <XCircle size={15} /> Reject
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPendingAction}
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
              onClick={handleConfirm}
              disabled={isPendingAction || !selectedCub}
              title={!selectedCub ? 'Link a cub before accepting' : 'Confirm and add to roster'}
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--green, #22c55e)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: selectedCub ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: selectedCub && !isPendingAction ? 1 : 0.6,
              }}
            >
              {isPendingAction ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
              {isPendingAction ? 'Confirming…' : 'Accept / Update'}
            </button>
          </div>
        </div>

      </div>

      {/* Reject Confirmation Modal */}
      <ConfirmModal
        isOpen={showRejectConfirm}
        onClose={() => setShowRejectConfirm(false)}
        onConfirm={handleRejectConfirm}
        title="Reject Signup?"
        message="Are you sure you want to reject this signup? This will mark it as Rejected."
        confirmText="Reject"
        variant="danger"
      />
    </>
  );
}
