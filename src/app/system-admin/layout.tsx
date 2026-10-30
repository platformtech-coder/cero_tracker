'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Shield, LogOut } from 'lucide-react';
import { Toaster } from 'sonner';

export default function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ email: string; name: string } | null>(null);

  const isLoginPage = pathname === '/system-admin/login';

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }
    
    async function checkAuth() {
      try {
        const res = await fetch('/api/system-admin/auth');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.session) {
            setSession(data.session);
            setLoading(false);
            return;
          }
        }
        router.push('/system-admin/login');
      } catch {
        router.push('/system-admin/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [pathname, router, isLoginPage]);

  const handleLogout = async () => {
    await fetch('/api/system-admin/auth', { method: 'DELETE' });
    router.push('/system-admin/login');
  };

  if (isLoginPage) {
    return (
      <>
        {children}
<Toaster position="top-center" richColors />
      </>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Image src="/logo.png" alt="PerbiCubs Logo" width={56} height={56} priority style={{ objectFit: 'contain' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>Verifying System Access...</div>
        </div>
      </div>
    );
  }

  if (!session) return null; // Will redirect in useEffect

  return (
    <>
      {children}
      <Toaster position="top-center" richColors />
    </>
  );
}
