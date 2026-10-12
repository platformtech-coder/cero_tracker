'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Loader2 } from 'lucide-react';
import { useInteractionStore } from '@/lib/store';
import { getDropdowns } from '@/lib/actions/dashboard';
import { searchCubs, submitInteraction } from '@/lib/actions/engagements';
import { getCubActivity } from '@/lib/actions/directory';
import { toast } from 'sonner';
import styles from '@/components/ui/dashboard.module.css';
import { AlertModal } from '@/components/ui/ConfirmModal';

export function LogInteractionDrawer() {
  const { 
    isOpen, 
    selectedCubId, 
    selectedCubFirstName, 
    selectedCubLastName, 
    selectedParentFirstName,
    selectedParentLastName,
    closeDrawer 
  } = useInteractionStore();

  const [dropdowns, setDropdowns] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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
  const [feedback, setFeedback] = useState('');
  const [actionRequired, setActionRequired] = useState<'Yes' | 'No'>('No');
  const [actionDesc, setActionDesc] = useState('');
  const [actionDeadline, setActionDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Initialize
  useEffect(() => {
    if (isOpen) {
      getDropdowns().then(res => setDropdowns(res));
      if (selectedCubId) {
        setCubId(selectedCubId);
        setCubFirstName(selectedCubFirstName);
        setCubLastName(selectedCubLastName);
        setParentFirstName(selectedParentFirstName);
        setParentLastName(selectedParentLastName);
        fetchHistory(selectedCubId);
      } else {
        resetForm();
      }
    }
  }, [isOpen, selectedCubId]);

  const resetForm = () => {
    setSearchQuery('');
    setCubId('');
    setCubFirstName('');
    setCubLastName('');
    setParentFirstName('');
    setParentLastName('');
    setHandledBy('');
    setType('');
    setPurpose('');
    setStatus('');
    setFeedback('');
    setActionRequired('No');
    setActionDesc('');
    setActionDeadline('');
    setHistory([]);
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
    setShowResults(false);
    setSearchQuery('');
    fetchHistory(cub.cubId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cubId) {
      setAlertMessage('Please select a cub first.');
      setShowAlert(true);
      return;
    }
    setIsSubmitting(true);
    const payload = {
      cub_id: cubId,
      cub_first_name: cubFirstName,
      cub_last_name: cubLastName,
      parent_first_name: parentFirstName,
      parent_last_name: parentLastName,
      handled_by: handledBy,
      type,
      purpose,
      status,
      feedback,
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
          <button className={styles.drawerClose} onClick={handleClose}><X size={18} /></button>
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
                            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)' }}>{r.cubFirstName} {r.cubLastName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Parent: {r.parentFirstName} {r.parentLastName} · {r.parentPhone}</div>
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
              <select required value={handledBy} onChange={e => setHandledBy(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                <option value="">Select...</option>
                {dropdowns['handled_by']?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
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
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                <option value="">Select...</option>
                {dropdowns['status']?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

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
              {isSubmitting ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : 'Save Interaction'}
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
