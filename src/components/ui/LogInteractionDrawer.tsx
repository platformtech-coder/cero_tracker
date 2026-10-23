'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Clock, Loader2, Users, Calendar, AlertCircle, Globe } from 'lucide-react';
import { useInteractionStore } from '@/lib/store';
import { getDropdowns } from '@/lib/actions/dashboard';
import { searchCubs, submitInteraction, submitFamilyInteraction } from '@/lib/actions/engagements';
import { getCubActivity, getSiblingsForCub, type CubSiblingsResponse } from '@/lib/actions/directory';
import { toast } from 'sonner';
import styles from '@/components/ui/dashboard.module.css';
import { AlertModal } from '@/components/ui/ConfirmModal';
import { formatDate } from '@/lib/utils/date';
import { savePreferredLanguage } from '@/lib/actions/update-profile';
import type { Profile } from '@/lib/types';

interface LogInteractionDrawerProps {
  profile?: Profile;
}

export function LogInteractionDrawer({ profile }: LogInteractionDrawerProps) {
  const isAdmin = profile?.role === 'admin';
  const defaultRepName = profile?.sheet_rep_name || profile?.full_name || '';
  const canAutoFill = !isAdmin && !!defaultRepName;

  const { 
    isOpen, 
    selectedCubId, 
    selectedCubFirstName, 
    selectedCubLastName, 
    selectedParentFirstName,
    selectedParentLastName,
    closeDrawer 
  } = useInteractionStore();

  const router = useRouter();
  const [dropdowns, setDropdowns] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Sibling & family state
  const [siblingsData, setSiblingsData] = useState<CubSiblingsResponse | null>(null);
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<Set<string>>(new Set());
  const [isLoadingSiblings, setIsLoadingSiblings] = useState(false);

  // Form state
  const [cubId, setCubId] = useState('');
  const [cubFirstName, setCubFirstName] = useState('');
  const [cubLastName, setCubLastName] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [handledBy, setHandledBy] = useState('');
  const [type, setType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [status, setStatus] = useState('');
  const [messageSent, setMessageSent] = useState('');
  const [feedback, setFeedback] = useState('');
  const [actionRequired, setActionRequired] = useState<'Yes' | 'No'>('No');
  const [actionDesc, setActionDesc] = useState('');
  const [actionDeadline, setActionDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('');

  const fetchSiblings = async (id: string) => {
    setIsLoadingSiblings(true);
    try {
      const data = await getSiblingsForCub(id);
      setSiblingsData(data);
      setSelectedSiblingIds(new Set());
      if (data?.preferred_language) {
        setPreferredLanguage(data.preferred_language);
      }
    } catch {
      setSiblingsData(null);
    } finally {
      setIsLoadingSiblings(false);
    }
  };

  // Initialize
  useEffect(() => {
    if (isOpen) {
      getDropdowns().then(res => setDropdowns(res));
      if (canAutoFill) {
        setHandledBy(defaultRepName);
      }
      if (selectedCubId) {
        setCubId(selectedCubId);
        setCubFirstName(selectedCubFirstName);
        setCubLastName(selectedCubLastName);
        setParentFirstName(selectedParentFirstName);
        setParentLastName(selectedParentLastName);
        fetchHistory(selectedCubId);
        fetchSiblings(selectedCubId);
      } else {
        resetForm();
      }
    }
  }, [isOpen, selectedCubId, canAutoFill, defaultRepName]);

  const resetForm = () => {
    setSearchQuery('');
    setCubId('');
    setCubFirstName('');
    setCubLastName('');
    setParentFirstName('');
    setParentLastName('');
    setHandledBy(canAutoFill ? defaultRepName : '');
    setType('');
    setPurpose('');
    setStatus('');
    setMessageSent('');
    setFeedback('');
    setActionRequired('No');
    setActionDesc('');
    setActionDeadline('');
    setHistory([]);
    setSiblingsData(null);
    setSelectedSiblingIds(new Set());
    setPreferredLanguage('');
  };

  const handleClose = () => {
    resetForm();
    closeDrawer();
  };

  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (searchQuery.length < 2) {
      setShowResults(false);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      setShowResults(true);
      const res = await searchCubs(searchQuery, true);
      setSearchResults(res || []);
      setIsSearching(false);
    }, 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery]);

  const fetchHistory = async (id: string) => {
    setIsLoadingHistory(true);
    const data = await getCubActivity(id);
    setHistory(data.interactions || []);
    setIsLoadingHistory(false);
  };

  const selectCub = (cub: any) => {
    setCubId(cub.cubId);
    setCubFirstName(cub.cubFirstName);
    setCubLastName(cub.cubLastName);
    setParentFirstName(cub.parentFirstName);
    setParentLastName(cub.parentLastName);
    setPreferredLanguage(cub.preferredLanguage || '');
    setShowResults(false);
    setSearchQuery('');
    fetchHistory(cub.cubId);
    fetchSiblings(cub.cubId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cubId) {
      setAlertMessage('Please select a cub first.');
      setShowAlert(true);
      return;
    }
    const finalHandledBy = canAutoFill ? defaultRepName : handledBy;
    if (!finalHandledBy) {
      setAlertMessage('Please select who handled this interaction.');
      setShowAlert(true);
      return;
    }
    setIsSubmitting(true);

    const effectiveMessageSent = (type.toLowerCase().includes('call') && status && status.toLowerCase() !== 'reached' && messageSent)
      ? messageSent
      : undefined;

    // If siblings are selected, use multi-cub family interaction action
    if (selectedSiblingIds.size > 0 && siblingsData?.siblings) {
      const selectedSiblings = siblingsData.siblings.filter(s => selectedSiblingIds.has(s.cub_id));
      const multiCubs = [
        { cub_id: cubId, cub_first_name: cubFirstName, cub_last_name: cubLastName },
        ...selectedSiblings.map(s => ({
          cub_id: s.cub_id,
          cub_first_name: s.cub_first_name,
          cub_last_name: s.cub_last_name,
        })),
      ];

      const res = await submitFamilyInteraction({
        cubs: multiCubs,
        parent_first_name: parentFirstName,
        parent_last_name: parentLastName,
        parent_phone: siblingsData.parent_phone,
        parent_email: siblingsData.parent_email,
        handled_by: finalHandledBy,
        type,
        purpose,
        status,
        feedback,
        message_sent: effectiveMessageSent,
        action_required: actionRequired,
        action: actionRequired === 'Yes' ? actionDesc : undefined,
        action_deadline: actionRequired === 'Yes' ? actionDeadline : undefined,
        action_status: actionRequired === 'Yes' ? 'Pending' : undefined,
      });

      setIsSubmitting(false);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Interaction logged for ${multiCubs.length} cubs successfully!`);
        router.refresh();
        handleClose();
      }
      return;
    }

    const payload = {
      cub_id: cubId,
      cub_first_name: cubFirstName,
      cub_last_name: cubLastName,
      parent_first_name: parentFirstName,
      parent_last_name: parentLastName,
      handled_by: finalHandledBy,
      type,
      purpose,
      status,
      feedback,
      message_sent: effectiveMessageSent,
      action_required: actionRequired,
      action: actionRequired === 'Yes' ? actionDesc : undefined,
      action_deadline: actionRequired === 'Yes' ? actionDeadline : undefined,
      action_status: actionRequired === 'Yes' ? 'Pending' : undefined,
    };
    const res = await submitInteraction(payload);
    setIsSubmitting(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Interaction logged successfully!');
      router.refresh();
      handleClose();
    }
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
    background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: '13.5px', fontFamily: 'inherit'
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em'
  };

  return (
    <>
      <div 
        className={`${styles.drawerOverlay} ${styles.drawerOverlayActive}`} 
        onClick={handleClose} 
        style={{ zIndex: 20000 }} 
      />
      <div 
        className={`${styles.drawer} ${styles.drawerActive}`} 
        style={{ zIndex: 20001, maxWidth: '560px' }}
      >
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>Log Interaction</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {cubId && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '2px 6px', borderRadius: '6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
              }}>
                <Globe size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <select
                  value={preferredLanguage}
                  onChange={async (e) => {
                    const newLang = e.target.value;
                    setPreferredLanguage(newLang);
                    if (newLang && cubId) {
                      const res = await savePreferredLanguage({ cubId, language: newLang });
                      if (res.success) {
                        toast.success(`Language updated to ${newLang}`);
                      }
                    }
                  }}
                  style={{
                    padding: '2px 4px', border: 'none',
                    background: 'transparent', color: 'var(--text-1)', fontSize: '11.5px', fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="">Language...</option>
                  <option value="English">English</option>
                  <option value="Twi">Twi</option>
                  <option value="Ga">Ga</option>
                  <option value="Ewe">Ewe</option>
                </select>
              </div>
            )}
            <button className={styles.drawerClose} onClick={handleClose}><X size={18} /></button>
          </div>
        </div>
        
        <div className={styles.drawerBody}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Search (only if no cub was pre-selected) */}
            {!selectedCubId && (
              <div ref={searchContainerRef} style={{ position: 'relative' }}>
                <label style={labelStyle}>Search Family / Cub</label>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => { if (searchQuery.length >= 2) setShowResults(true); }}
                  placeholder="Type name, phone, or ID..."
                  style={inputStyle}
                />
                {showResults && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto', zIndex: 10, marginTop: '4px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                    {isSearching ? (
                      <div key="searching" style={{ padding: '14px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>Searching...</div>
                    ) : searchResults.length > 0 ? (
                      <>
                        {searchResults.map(r => (
                          <div key={r.cubId} onClick={() => selectCub(r)} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)' }}>
                                {r.cubFirstName} {r.cubLastName}
                              </div>
                              {r.repName && (
                                <span style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: r.isOwnContact ? 'var(--primary-dim)' : 'var(--bg-input)',
                                  color: r.isOwnContact ? 'var(--primary)' : 'var(--text-3)',
                                  fontWeight: 600,
                                }}>
                                  Rep: {r.repName}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                              ID: <span style={{ fontFamily: 'monospace' }}>{r.cubId}</span> · Parent: {r.parentFirstName} {r.parentLastName} {r.parentPhone ? `· ${r.parentPhone}` : ''}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div key="no-results" style={{ padding: '14px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>No results found</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Selected cub display */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Cub Name</label>
                <input type="text" value={cubId ? `${cubFirstName} ${cubLastName}` : ''} disabled style={{ ...inputStyle, opacity: 0.7 }} placeholder="Select from search" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Parent Name</label>
                <input type="text" value={cubId ? `${parentFirstName} ${parentLastName}` : ''} disabled style={{ ...inputStyle, opacity: 0.7 }} placeholder="Select from search" />
              </div>
            </div>


            {/* Siblings Panel */}
            {cubId && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Users size={14} color="var(--primary)" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Siblings / Same Parent
                  </span>
                  {isLoadingSiblings && <Loader2 size={13} color="var(--text-3)" style={{ animation: 'spin 1s linear infinite' }} />}
                </div>

                {isLoadingSiblings ? (
                  /* Skeleton */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[1, 2].map(i => (
                      <div key={i} style={{ height: '40px', borderRadius: '8px', background: 'var(--bg-input)', opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                  </div>
                ) : siblingsData && siblingsData.siblings.length > 0 ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Header row */}
                    <div style={{ padding: '8px 12px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                        {siblingsData.siblings.length} sibling{siblingsData.siblings.length !== 1 ? 's' : ''} found — include in this log?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedSiblingIds.size === siblingsData.siblings.length) {
                            setSelectedSiblingIds(new Set());
                          } else {
                            setSelectedSiblingIds(new Set(siblingsData.siblings.map(s => s.cub_id)));
                          }
                        }}
                        style={{
                          fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer',
                          background: selectedSiblingIds.size === siblingsData.siblings.length ? 'var(--primary-dim)' : 'var(--bg-card)',
                          color: selectedSiblingIds.size === siblingsData.siblings.length ? 'var(--primary)' : 'var(--text-2)',
                          border: '1px solid var(--border)', transition: 'all 0.15s',
                        }}
                      >
                        {selectedSiblingIds.size === siblingsData.siblings.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    {/* Sibling rows */}
                    {siblingsData.siblings.map(sib => {
                      const checked = selectedSiblingIds.has(sib.cub_id);
                      return (
                        <label
                          key={sib.cub_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                            cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            background: checked ? 'var(--primary-dim)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedSiblingIds(prev => {
                                const next = new Set(prev);
                                if (next.has(sib.cub_id)) next.delete(sib.cub_id);
                                else next.add(sib.cub_id);
                                return next;
                              });
                            }}
                            style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: checked ? 'var(--primary)' : 'var(--text-1)' }}>
                              {sib.cub_first_name} {sib.cub_last_name}
                            </div>
                            {(sib.school_name || sib.segment) && (
                              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>
                                {[sib.school_name, sib.segment].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                          {checked && (
                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>✓ Included</span>
                          )}
                        </label>
                      );
                    })}

                    {/* Footer summary */}
                    {selectedSiblingIds.size > 0 && (
                      <div style={{ padding: '8px 14px', background: 'var(--primary-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={13} color="var(--primary)" />
                        <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                          This interaction will be logged for {selectedSiblingIds.size + 1} cubs (primary + {selectedSiblingIds.size} sibling{selectedSiblingIds.size !== 1 ? 's' : ''}).
                        </span>
                      </div>
                    )}
                  </div>
                ) : siblingsData && siblingsData.siblings.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 0' }}>
                    No other cubs share the same parent contact.
                  </div>
                ) : null}
              </div>
            )}

            {/* Recent Interaction History */}
            {cubId && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Clock size={14} color="var(--primary)" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recent Interactions</span>
                  {isLoadingHistory && <Loader2 size={13} color="var(--text-3)" style={{ animation: 'spin 1s linear infinite' }} />}
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '180px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Handled By</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Purpose</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length > 0 ? (
                        history.map((h: any) => (
                          <tr key={h.id}>
                            <td>{new Date(h.date).toLocaleDateString('en-GB')}</td>
                            <td>{h.handled_by || '—'}</td>
                            <td>{h.type || '—'}</td>
                            <td>{h.status || '—'}</td>
                            <td>{h.purpose || '—'}</td>
                            <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.feedback}>{h.feedback || '—'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '16px' }}>No interactions yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Handled By */}
            <div>
              <label style={labelStyle}>Handled By *</label>
              {canAutoFill ? (
                <input
                  type="text"
                  value={defaultRepName}
                  readOnly
                  disabled
                  style={{
                    ...inputStyle,
                    opacity: 0.85,
                    cursor: 'not-allowed',
                    background: 'var(--bg-card)',
                    fontWeight: 600,
                  }}
                  title="Automatically assigned to your rep account"
                />
              ) : (
                <select 
                  required 
                  value={handledBy} 
                  onChange={e => setHandledBy(e.target.value)} 
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  <option value="">Select Rep...</option>
                  {dropdowns['handled_by']?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
            </div>

            {/* Type + Purpose */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Type *</label>
                <select required value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                  <option value="">Select...</option>
                  {dropdowns['type']?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Purpose *</label>
                <select required value={purpose} onChange={e => setPurpose(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                  <option value="">Select...</option>
                  {dropdowns['purpose']?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            {/* Status */}
            <div>
              <label style={labelStyle}>Status</label>
              <select 
                value={status} 
                onChange={e => {
                  setStatus(e.target.value);
                  if (e.target.value.toLowerCase() === 'reached') {
                    setMessageSent('');
                  }
                }} 
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="">Select...</option>
                {dropdowns['status']?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            {/* Message Sent (conditional for unsuccessful calls) */}
            {type.toLowerCase().includes('call') && status && status.toLowerCase() !== 'reached' && (
              <div style={{ background: 'var(--primary-dim)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(13, 148, 136, 0.25)' }}>
                <label style={{ ...labelStyle, color: 'var(--primary)', marginBottom: '4px' }}>
                  Was a message sent?
                </label>
                <select
                  value={messageSent}
                  onChange={e => setMessageSent(e.target.value)}
                  style={{ ...inputStyle, background: 'var(--bg-card)', borderColor: 'var(--primary)' }}
                >
                  <option value="">No message sent</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="Email">Email</option>
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                  Specify if a follow-up WhatsApp, SMS, or Email was sent for this unreached call.
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label style={labelStyle}>Feedback / Notes</label>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} placeholder="Enter notes..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {/* Action Required */}
            <div>
              <label style={labelStyle}>Action Required?</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['No', 'Yes'] as const).map(v => (
                  <button
                    key={v} type="button"
                    onClick={() => setActionRequired(v)}
                    style={{
                      padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.2s',
                      background: actionRequired === v ? 'var(--primary)' : 'var(--bg-input)',
                      color: actionRequired === v ? 'white' : 'var(--text-2)',
                      border: actionRequired === v ? '1px solid var(--primary)' : '1px solid var(--border)',
                    }}
                  >{v}</button>
                ))}
              </div>
            </div>

            {/* Action fields */}
            {actionRequired === 'Yes' && (
              <div style={{ background: 'var(--orange-dim)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(249,115,22,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ ...labelStyle, color: 'var(--orange)' }}>Action Description *</label>
                  <textarea required value={actionDesc} onChange={e => setActionDesc(e.target.value)} rows={2} placeholder="What needs to be done..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: 'var(--orange)' }}>Action Deadline *</label>
                  <input required type="date" value={actionDeadline} onChange={e => setActionDeadline(e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}

            {/* Submit */}
            <button 
              type="submit" 
              style={{ 
                width: '100%', padding: '12px', borderRadius: '10px', marginTop: '8px',
                background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                border: 'none', transition: 'opacity 0.2s'
              }} 
              disabled={isSubmitting}
            >
              {isSubmitting
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                : selectedSiblingIds.size > 0
                  ? `Save for ${selectedSiblingIds.size + 1} Cubs`
                  : 'Save Interaction'
              }
            </button>
          </form>
        </div>
      </div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        title="Missing Information"
        message={alertMessage}
        confirmText="OK"
      />
    </>
  );
}
