'use client';

import { useState } from 'react';
import { Eye, EyeOff, Terminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function SystemAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/system-admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'System Admin credentials invalid');
        setSubmitting(false);
        return;
      }

      window.location.href = '/system-admin';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 12px 48px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Terminal size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>System Center</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Super Admin Access Only</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Email Address</label>
            <input
              type="email"
              required
              placeholder="admin@perbicubs.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 38px 10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 14, boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{ width: '100%', padding: '12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: submitting ? 'default' : 'pointer', marginTop: 8, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
