/**
 * One-time backfill script to populate the `email` column on `user_profiles`
 * from `auth.users` so that admin search works on emails.
 *
 * Usage:  node scripts/backfill-profile-emails.mjs
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAllAuthUsers() {
  const allUsers = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error(`Error fetching auth users (page ${page}):`, error.message);
      process.exit(1);
    }

    allUsers.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }
    page++;
  }

  return allUsers;
}

async function main() {
  console.log('Fetching all auth users...');
  const authUsers = await fetchAllAuthUsers();
  console.log(`Found ${authUsers.length} total auth users.`);

  let updated = 0;
  let skipped = 0;
  let noEmail = 0;

  for (const user of authUsers) {
    if (!user.email) {
      noEmail++;
      continue;
    }

    // Only update rows where email is currently null
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ email: user.email })
      .eq('id', user.id)
      .is('email', null)
      .select('id');

    if (error) {
      console.error(`Error updating profile for user ${user.id}:`, error.message);
      continue;
    }

    if (data && data.length > 0) {
      updated++;
    } else {
      skipped++;
    }
  }

  console.log('\n--- Backfill Complete ---');
  console.log(`Auth users total:             ${authUsers.length}`);
  console.log(`Profiles updated (email set): ${updated}`);
  console.log(`Profiles skipped (had email): ${skipped}`);
  console.log(`Auth users without email:     ${noEmail}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
