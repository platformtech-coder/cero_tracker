'use client';

import { X, Loader2 } from 'lucide-react';
import sharedStyles from './dashboard.module.css';

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  backdropFilter: 'blur(2px)',
  zIndex: 30000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const modalContainerStyle: React.CSSProperties = {
  background: 'var(--bg-card, #ffffff)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
  width: '100%',
  maxWidth: '420px',
  zIndex: 30001,
  opacity: 1,
  transform: 'translateY(0) scale(1)',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1.25rem 1.5rem',
  borderBottom: '1px solid var(--border)',
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--text-1)',
  margin: 0,
};

const modalCloseStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-3)',
  cursor: 'pointer',
  padding: '0.25rem',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  transition: 'color 0.15s, background 0.15s',
};

const modalBodyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 24px',
};

const modalMessageStyle: React.CSSProperties = {
  color: 'var(--text-1)',
  fontSize: '15px',
  lineHeight: 1.6,
  marginBottom: '24px',
};

const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'center',
};

const cancelButtonStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: '140px',
  padding: '12px',
  borderRadius: '10px',
  background: 'var(--bg-input)',
  color: 'var(--text-1)',
  fontWeight: 600,
  fontSize: '14px',
  border: '1px solid var(--border)',
  cursor: 'pointer',
};

const confirmButtonStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: '140px',
  padding: '12px',
  borderRadius: '10px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div style={modalOverlayStyle} onClick={onClose} />
      <div style={modalContainerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>{title}</h2>
          <button style={modalCloseStyle} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={modalBodyStyle}>
          <p style={modalMessageStyle}>{message}</p>
          <div style={buttonGroupStyle}>
            <button
              onClick={onClose}
              disabled={isLoading}
              style={{ ...cancelButtonStyle, opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              style={{
                ...confirmButtonStyle,
                background: variant === 'danger' ? 'var(--red)' : 'var(--primary)',
                color: 'white',
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer',
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

export interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  confirmText = 'OK',
}: AlertModalProps) {
  if (!isOpen) return null;

  const confirmBtnStyle: React.CSSProperties = {
    flex: 1,
    maxWidth: '140px',
    padding: '12px',
    borderRadius: '10px',
    background: 'var(--primary)',
    color: 'white',
    fontWeight: 600,
    fontSize: '14px',
    border: 'none',
    cursor: 'pointer',
  };

  return (
    <>
      <div style={modalOverlayStyle} onClick={onClose} />
      <div style={modalContainerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>{title}</h2>
          <button style={modalCloseStyle} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={modalBodyStyle}>
          <p style={modalMessageStyle}>{message}</p>
          <div style={buttonGroupStyle}>
            <button onClick={onClose} style={confirmBtnStyle}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}