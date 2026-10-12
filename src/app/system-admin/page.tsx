import { redirect } from 'next/navigation';
import { getSystemOverview } from '@/lib/actions/system-admin';
import { loadFormsConfig } from '@/lib/actions/forms';
import SystemAdminClient from './SystemAdminClient';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';

export const instant = false;

export default async function SystemAdminPage() {
  const session = await getSystemAdminSession();
  if (!session) redirect('/system-admin/login');

  const [overviewResult, formsConfig] = await Promise.all([
    getSystemOverview(),
    loadFormsConfig().catch(() => null),
  ]);

  const overview = overviewResult as any;

  // Handle error case from getSystemOverview
  if (overview && typeof overview === 'object' && 'error' in overview) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--red)', marginBottom: '1rem' }}>System Overview Unavailable</h1>
        <p style={{ color: 'var(--text-2)' }}>{overview.error}</p>
        <p style={{ color: 'var(--text-3)', marginTop: '1rem', fontSize: '0.875rem' }}>
          The system overview could not be loaded. This may be due to missing configuration tables.
        </p>
      </div>
    );
  }

  return <SystemAdminClient overview={overview} formsConfig={formsConfig} />;
}
