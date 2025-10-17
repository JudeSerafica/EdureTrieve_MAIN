import { supabase } from './server/src/config/supabaseClient.js';

async function testDatabase() {
  try {
    console.log('Testing chat_history table structure...');

    // Test if table exists and check columns
    const { data: tableInfo, error: tableError } = await supabase
      .from('chat_history')
      .select('*')
      .limit(1);

    if (tableError) {
      console.log('Table error:', tableError);
    } else {
      console.log('Table exists, columns:', Object.keys(tableInfo[0] || {}));
      console.log('Sample data:', tableInfo);
    }

    // Try to insert test data
    console.log('Testing insert operation...');
    const { data, error } = await supabase
      .from('chat_history')
      .insert({
        user_id: 'test-user-id',
        prompt: 'test prompt',
        response: 'test response',
        conversationId: 'test_conv_123',
        timestamp: new Date().toISOString(),
      })
      .select();

    console.log('Insert result:', { data, error });

  } catch (e) {
    console.log('Exception:', e.message);
  }
}

testDatabase();
