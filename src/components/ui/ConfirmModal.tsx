'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
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
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
  width: '100%',
  maxWidth: '420px',
  zIndex: 30001,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  animation: 'confirmModalFadeIn 0.15s ease-out',
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
  padding: '28px 24px 24px',
};

const modalMessageStyle: React.CSSProperties = {
  color: 'var(--text-1)',
  fontSize: '15px',
  lineHeight: 1.6,
  margin: '0 0 24px 0',
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
  background: 'var(--bg-input, #f1f5f9)',
  color: 'var(--text-1, #0f172a)',
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
  cancelText?: string;
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
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent background scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen || !mounted) return null;

  const content = (
    <div
      style={modalOverlayStyle}
      onClick={(e) => {
        e.stopPropagation();
        if (!isLoading) onClose();
      }}
    >
      <div
        style={modalContainerStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div style={modalHeaderStyle}>
          <h2 id="confirm-modal-title" style={modalTitleStyle}>{title}</h2>
          <button
            type="button"
            style={modalCloseStyle}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLoading) onClose();
            }}
            disabled={isLoading}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div style={modalBodyStyle}>
          <p style={modalMessageStyle}>{message}</p>
          <div style={buttonGroupStyle}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!isLoading) onClose();
              }}
              disabled={isLoading}
              style={{
                ...cancelButtonStyle,
                opacity: isLoading ? 0.6 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!isLoading) onConfirm();
              }}
              disabled={isLoading}
              style={{
                ...confirmButtonStyle,
                background: variant === 'danger' ? 'var(--red, #ef4444)' : 'var(--primary, #0d9488)',
                color: 'white',
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Processing...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent background scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const confirmBtnStyle: React.CSSProperties = {
    flex: 1,
    maxWidth: '140px',
    padding: '12px',
    borderRadius: '10px',
    background: 'var(--primary, #0d9488)',
    color: 'white',
    fontWeight: 600,
    fontSize: '14px',
    border: 'none',
    cursor: 'pointer',
  };

  const content = (
    <div
      style={modalOverlayStyle}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        style={modalContainerStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
      >
        <div style={modalHeaderStyle}>
          <h2 id="alert-modal-title" style={modalTitleStyle}>{title}</h2>
          <button
            type="button"
            style={modalCloseStyle}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div style={modalBodyStyle}>
          <p style={modalMessageStyle}>{message}</p>
          <div style={buttonGroupStyle}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              style={confirmBtnStyle}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}