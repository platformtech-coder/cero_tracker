'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  User,
  Phone,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Filter,
  FileSpreadsheet,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getContactEditRequests,
  approveContactEditRequest,
  declineContactEditRequest,
} from '@/lib/actions/edit-requests';
import type { ContactEditRequest } from '@/lib/types';

const FIELD_LABELS: Record<string, string> = {
  cub_first_name: 'Cub First Name',
  cub_last_name: 'Cub Last Name',
  grade: 'Grade',
  stream: 'Stream',
  school_name: 'School Name',
  parent_first_name: 'Parent First Name',
  parent_last_name: 'Parent Last Name',
  parent_phone: 'Parent Phone Number',
  parent_email: 'Parent Email',
  preferred_language: 'Preferred Mode of Language',
  alternative_contact_name: 'Alternative Contact Name',
  alternative_contact_phone: 'Alternative Number',
};

export default function ApprovalsTab({ onRefreshOverview }: { onRefreshOverview?: () => void }) {
  const [requests, setRequests] = useState<ContactEditRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'pending' | 'approved' | 'declined' | 'all'>('pending');

  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Decline modal state
  const [declineTarget, setDeclineTarget] = useState<ContactEditRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await getContactEditRequests(filter);
      setRequests(res.requests);
      setPendingCount(res.pendingCount);
    } catch (err: any) {
      toast.error('Failed to load edit requests: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const handleApprove = (req: ContactEditRequest) => {
    setProcessingId(req.id);
    startTransition(async () => {
      try {
        toast.loading(`Approving edit for ${req.entity_name}...`, { id: `approve-${req.id}` });
        const res = await approveContactEditRequest(req.id);
        if (res.success) {
          const sheetMsg = res.sheetSynced ? ' ✓ Synced to Google Sheet Master tab.' : res.sheetError ? ` (Sheet: ${res.sheetError})` : '';
          toast.success(`Approved contact update for ${req.entity_name}.${sheetMsg}`, { id: `approve-${req.id}` });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('cero:refresh-notifications'));
          }
          fetchRequests();
          if (onRefreshOverview) onRefreshOverview();
        } else {
          toast.error(res.error || 'Failed to approve request', { id: `approve-${req.id}` });
        }
      } catch (e: any) {
        toast.error(e.message || 'Error approving request', { id: `approve-${req.id}` });
      } finally {
        setProcessingId(null);
      }
    });
  };

  const handleDeclineConfirm = () => {
    if (!declineTarget) return;
    const req = declineTarget;
    setProcessingId(req.id);
    startTransition(async () => {
      try {
        toast.loading(`Declining edit for ${req.entity_name}...`, { id: `decline-${req.id}` });
        const res = await declineContactEditRequest(req.id, declineReason);
        if (res.success) {
          toast.success(`Declined contact update for ${req.entity_name}`, { id: `decline-${req.id}` });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('cero:refresh-notifications'));
          }
          setDeclineTarget(null);
          setDeclineReason('');
          fetchRequests();
          if (onRefreshOverview) onRefreshOverview();
        } else {
          toast.error(res.error || 'Failed to decline request', { id: `decline-${req.id}` });
        }
      } catch (e: any) {
        toast.error(e.message || 'Error declining request', { id: `decline-${req.id}` });
      } finally {
        setProcessingId(null);
      }
    });
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.entity_name.toLowerCase().includes(s) ||
      r.entity_id.toLowerCase().includes(s) ||
      r.requester_name.toLowerCase().includes(s) ||
      (r.requester_email && r.requester_email.toLowerCase().includes(s))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header & Stats Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(234, 179, 8, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yellow, #eab308)' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>{pendingCount}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginTop: 4 }}>Pending Approval</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(34, 197, 94, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green, #22c55e)' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
              {requests.filter(r => r.status === 'approved').length}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginTop: 4 }}>Approved in View</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red, #ef4444)' }}>
            <XCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
              {requests.filter(r => r.status === 'declined').length}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginTop: 4 }}>Declined in View</div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFilter('pending')}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filter === 'pending' ? '1px solid var(--yellow, #eab308)' : '1px solid var(--border)',
              background: filter === 'pending' ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
              color: filter === 'pending' ? 'var(--yellow, #eab308)' : 'var(--text-2)'
            }}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('approved')}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filter === 'approved' ? '1px solid var(--green, #22c55e)' : '1px solid var(--border)',
              background: filter === 'approved' ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
              color: filter === 'approved' ? 'var(--green, #22c55e)' : 'var(--text-2)'
            }}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setFilter('declined')}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filter === 'declined' ? '1px solid var(--red, #ef4444)' : '1px solid var(--border)',
              background: filter === 'declined' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
              color: filter === 'declined' ? 'var(--red, #ef4444)' : 'var(--text-2)'
            }}
          >
            Declined
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filter === 'all' ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: filter === 'all' ? 'var(--primary-dim, rgba(99, 102, 241, 0.1))' : 'transparent',
              color: filter === 'all' ? 'var(--primary)' : 'var(--text-2)'
            }}
          >
            All Requests
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              type="text"
              placeholder="Search by name, ID, or rep..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 12px 7px 32px', fontSize: 12,
                borderRadius: 8, background: 'var(--bg-input, var(--bg))',
                border: '1px solid var(--border)', color: 'var(--text-1)'
              }}
            />
          </div>
          <button
            type="button"
            onClick={fetchRequests}
            title="Refresh requests"
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px auto' }} />
          <div>Loading contact edit requests...</div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div style={{ padding: '64px 20px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <ShieldCheck size={36} style={{ color: 'var(--green, #22c55e)', opacity: 0.8, marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
            {filter === 'pending' ? 'No Pending Contact Edit Requests' : 'No requests found'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {filter === 'pending' ? 'All contact updates have been reviewed and processed.' : 'Try adjusting your search query or filter criteria.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredRequests.map((req) => {
            const isTargetProcessing = processingId === req.id;
            return (
              <div
                key={req.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: req.entity_type === 'cub' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        color: req.entity_type === 'cub' ? 'var(--primary)' : 'var(--green, #10b981)',
                      }}
                    >
                      {req.entity_type}
                    </span>
                    <strong style={{ fontSize: 15, color: 'var(--text-1)' }}>{req.entity_name}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>ID: {req.entity_id}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background:
                          req.status === 'approved' ? 'rgba(34, 197, 94, 0.12)' :
                          req.status === 'declined' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                        color:
                          req.status === 'approved' ? 'var(--green, #22c55e)' :
                          req.status === 'declined' ? 'var(--red, #ef4444)' : 'var(--yellow, #eab308)',
                      }}
                    >
                      {req.status === 'approved' ? <CheckCircle2 size={12} /> : req.status === 'declined' ? <XCircle size={12} /> : <Clock size={12} />}
                      <span style={{ textTransform: 'capitalize' }}>{req.status}</span>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDate(req.created_at)}</span>
                  </div>
                </div>

                {/* Requester banner */}
                <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface-hover, rgba(255,255,255,0.03))', borderRadius: 8 }}>
                  <User size={13} style={{ color: 'var(--primary)' }} />
                  <span>Submitted by <strong>{req.requester_name}</strong> {req.requester_email ? `(${req.requester_email})` : ''}</span>
                </div>

                {/* Changed Fields Diff Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)' }}>
                    Proposed Changes ({req.changed_fields.length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
                    {req.changed_fields.map((field) => {
                      const oldVal = req.current_data[field] || '—';
                      const newVal = req.proposed_data[field] || '—';
                      return (
                        <div
                          key={field}
                          style={{
                            padding: '10px 14px',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
                            {FIELD_LABELS[field] || field}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{String(oldVal)}</span>
                            <ArrowRight size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span style={{ color: 'var(--green, #22c55e)', fontWeight: 700 }}>{String(newVal)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reviewer / Admin Result notes if already resolved */}
                {req.status === 'approved' && (
                  <div style={{ fontSize: 12, color: 'var(--green, #22c55e)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} />
                    <span>Approved by <strong>{req.reviewed_by}</strong> on {formatDate(req.reviewed_at!)} · Synced to Google Sheet Master tab</span>
                  </div>
                )}
                {req.status === 'declined' && (
                  <div style={{ fontSize: 12, color: 'var(--red, #ef4444)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <XCircle size={14} />
                    <span>Declined by <strong>{req.reviewed_by}</strong> on {formatDate(req.reviewed_at!)} · Reason: {req.admin_notes || 'No reason specified'}</span>
                  </div>
                )}

                {/* Action buttons if Pending */}
                {req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      disabled={isTargetProcessing}
                      onClick={() => setDeclineTarget(req)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: 'transparent',
                        border: '1px solid var(--red, #ef4444)',
                        color: 'var(--red, #ef4444)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <X size={13} />
                      <span>Decline</span>
                    </button>

                    <button
                      type="button"
                      disabled={isTargetProcessing}
                      onClick={() => handleApprove(req)}
                      style={{
                        padding: '7px 18px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: 'var(--green, #22c55e)',
                        border: 'none',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isTargetProcessing ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                      <span>Approve & Sync to Sheet</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Decline Reason Modal */}
      {declineTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setDeclineTarget(null)}
        >
          <div
            style={{
              background: 'var(--surface, #1e293b)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              width: '100%',
              maxWidth: 450,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <strong style={{ fontSize: 16, color: 'var(--text-1)' }}>Decline Contact Edit</strong>
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Are you sure you want to decline the contact edit for <strong>{declineTarget.entity_name}</strong>?
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>
                Reason for declining (optional, will be notified to the rep):
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Phone number format invalid, parent confirmed other contact, etc."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-1)',
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingId === declineTarget.id}
                onClick={handleDeclineConfirm}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: 'var(--red, #ef4444)',
                  border: 'none',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {processingId === declineTarget.id ? <Loader2 size={13} className="spin" /> : <X size={13} />}
                <span>Confirm Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
