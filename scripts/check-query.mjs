import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkKeziah() {
  const profile = { role: 'rep', full_name: 'CER Kezia', sheet_rep_name: 'Keziah' };
  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  
  const repFilter = undefined;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilterByRep = !isAdmin || isFilteredRep;
  
  console.log("effectiveName:", effectiveName);
  console.log("shouldFilterByRep:", shouldFilterByRep);
  
  let cubsQuery = supabase.from('cubs').select('sub_status, flag, sub_end_date', { count: 'exact' });
  if (shouldFilterByRep) cubsQuery = cubsQuery.eq('relationship_owner', effectiveName);
  const { data: cubsData, count: totalCubs, error } = await cubsQuery;
  
  console.log("totalCubs:", totalCubs);
  console.log("error:", error);
}

checkKeziah();
