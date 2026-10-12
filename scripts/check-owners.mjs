import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase.from('cubs').select('relationship_owner');
  if (error) console.error(error);
  else {
    const uniqueOwners = [...new Set(data.map(d => d.relationship_owner))];
    console.log("Unique owners in cubs table:", uniqueOwners);
  }
}

main();
