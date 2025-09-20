import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dcepfndjsmktrfcelvgs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

async function testDatabase() {
  console.log('Testing database structure...');

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'test@example.com',
      password: 'testpassword123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Test User',
        first_name: 'Test',
        last_name: 'User'
      }
    });

    if (authError) {
      console.error('Auth Error:', authError);
      return;
    }

    console.log('✅ Auth user created:', authData.user.id);

    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{
        id: authData.user.id,
        email: 'test@example.com',
        username: 'test',
        fullName: 'Test User',
        pfpUrl: '',
        google_verified: false,
        created_at: new Date().toISOString()
      }]);

    if (profileError) {
      console.error('Profile Error:', profileError);
    } else {
      console.log('✅ Profile created successfully');
    }

    await supabase.auth.admin.deleteUser(authData.user.id);
    console.log('✅ Test user cleaned up');

  } catch (error) {
    console.error('Test Error:', error);
  }
}

testDatabase();