const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];
  const fullName = process.argv[4] || 'Admin User';

  if (!email || !password) {
    console.log('Usage: node scripts/create-admin.js <email> <password> [full_name]');
    process.exit(1);
  }

  console.log(`Creating admin user: ${email}`);

  // 1. Create the user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) {
    console.error('Error creating user:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log('User created successfully in auth.users:', userId);

  // 2. The trigger `handle_new_user` will automatically create a profile with role='rep'.
  // We need to update it to 'admin'.
  
  // Wait a brief moment to ensure the trigger has finished
  await new Promise((resolve) => setTimeout(resolve, 500));

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating user role to admin in profiles table:', profileError.message);
    process.exit(1);
  }

  console.log('Successfully set user role to admin in profiles table.');
}

createAdmin();
