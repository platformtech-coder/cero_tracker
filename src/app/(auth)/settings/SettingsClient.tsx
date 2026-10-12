'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';
import { 
  updateProfileRole, 
  saveConfigValue, 
  deleteConfigValue, 
  createUser,
  deleteUser,
  updateUserProfile
} from '@/lib/actions/settings';
import { toast } from 'sonner';
import { Loader2, PlusCircle, Save, Edit2, Trash2, X, User, Mail, Lock, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import sharedStyles from '@/components/ui/dashboard.module.css';
import styles from '../engagements/engagements.module.css';

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
}

const INTERACTION_CATEGORIES = [
  { key: 'type', label: 'Interaction Types' },
  { key: 'purpose', label: 'Interaction Purposes' },
  { key: 'status', label: 'Interaction Status' },
] as const;

// ─── Confirmation Modal ───────────────────────────────────────────
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  variant = 'danger',
  isLoading = false 
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div 
        className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`} 
        onClick={onClose} 
      />
      <div className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`} style={{ maxWidth: '420px', zIndex: 30000 }}>
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>{title}</h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div className={sharedStyles.drawerBody} style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ color: 'var(--text-1)', fontSize: '15px', lineHeight: 1.6, marginBottom: '24px' }}>{message}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button 
              onClick={onClose}
              disabled={isLoading}
              style={{ 
                flex: 1, maxWidth: '140px', padding: '12px', borderRadius: '10px',
                background: 'var(--bg-input)', color: 'var(--text-1)', fontWeight: 600, fontSize: '14px',
                border: '1px solid var(--border)', cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              Cancel
            </button>
            <button 
              onClick={onConfirm}
              disabled={isLoading}
              style={{ 
                flex: 1, maxWidth: '140px', padding: '12px', borderRadius: '10px',
                background: variant === 'danger' ? 'var(--red)' : 'var(--primary)', color: 'white', 
                fontWeight: 600, fontSize: '14px', cursor: isLoading ? 'not-allowed' : 'pointer',
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function SettingsClient({ profiles, config, profile, repNames }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get('tab');
  const tab: 'users' | 'config' = rawTab === 'config' ? 'config' : 'users';
  const setTab = useCallback((t: 'users' | 'config') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

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
  const [newRole, setNewRole] = useState<'admin' | 'rep'>('rep');
  const [newSheetRepName, setNewSheetRepName] = useState<string>('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

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
    setNewPassword(''); // Don't prefill password
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

  return (
    <div>
      <div className={styles.tabs}>
        <button 
          className={`${styles.tabBtn} ${tab === 'users' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('users')}
        >
          User Management
        </button>
        <button 
          className={`${styles.tabBtn} ${tab === 'config' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('config')}
        >
          Interactions Dropdown Config
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
                      <span className={`${sharedStyles.badge} ${user.role === 'admin' ? sharedStyles.badgeOrange : sharedStyles.badgeGreen}`}>
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
                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                  </label>
                  <input 
                    type="password" 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    placeholder={editingUser ? 'Leave blank to keep current' : 'Min. 6 characters'} 
                    className={sharedStyles.formInput} 
                    minLength={editingUser ? 0 : 6}
                    required={!editingUser}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase' }}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value as any)} className={sharedStyles.formInput} style={{ appearance: 'none' }}>
                    <option value="rep">CER Rep (Limited access)</option>
                    <option value="admin">Admin (Full access)</option>
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