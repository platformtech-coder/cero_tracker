'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getAllReps } from '@/lib/actions/dashboard';
import type { Profile } from '@/lib/types';
import { Users } from 'lucide-react';

export function RepFilterBar({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  const [allReps, setAllReps] = useState<string[]>([]);
  
  useEffect(() => {
    if (profile?.role === 'admin') {
      getAllReps().then(res => setAllReps(res));
    }
  }, [profile?.role]);

  if (profile?.role !== 'admin' || allReps.length === 0) return null;

  const currentRep = searchParams.get('rep') || '';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rep = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (rep) {
      params.set('rep', rep);
    } else {
      params.delete('rep');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px' }}>
      <Users size={14} color="var(--text-3)" />
      <select 
        value={currentRep}
        onChange={handleChange}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-1)',
          cursor: 'pointer',
        }}
      >
        <option value="">All Reps</option>
        {allReps.map(rep => (
          <option key={rep} value={rep}>{rep}</option>
        ))}
      </select>
    </div>
  );
}
