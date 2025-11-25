import { supabase } from '../config/supabaseClient.js';

// ✅ Utility to format timestamp into YYYY-MM-DD
function formatDate(date, format = 'daily') {
  const d = new Date(date);
  if (format === 'monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  } else if (format === 'weekly') {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`; // e.g. 2025-W29
  } else {
    return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
  }
}

// ✅ Get user profile by Supabase user ID
async function getUserById(userId) {
  if (!userId) throw new Error('User ID is required');

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('[getUserById] ❌', error.message);
    throw new Error('Could not fetch user profile.');
  }

  return data;
}

// ✅ Update user profile by user ID
async function updateUserProfile(userId, userData) {
  if (!userId) throw new Error('User ID is required');
  if (!userData || typeof userData !== 'object') throw new Error('Invalid user data');

  const { error } = await supabase
    .from('users')
    .update(userData)
    .eq('user_id', userId);

  if (error) {
    console.error('[updateUserProfile] ❌', error.message);
    throw new Error('Could not update user profile.');
  }
}

// ✅ Get analytics data: uploads, saves, upload timeline, and time spent
async function getUserAnalytics(userId) {
  if (!userId) throw new Error('User ID is required');

  const [
    { count: uploadedCount, error: uploadError },
    { count: savedCount, error: savedError },
    { data: uploadedData, error: uploadedDataError },
    { data: timeData, error: timeError },
  ] = await Promise.all([
    supabase.from('modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('modules').select('created_at').eq('user_id', userId),
    supabase.from('usage_time').select('seconds_spent, date').eq('user_id', userId),
  ]);

  if (uploadError || savedError || uploadedDataError || timeError) {
    throw new Error('Failed to fetch analytics.');
  }

  const groupBy = (format) => {
    const map = {};
    uploadedData.forEach(item => {
      const key = formatDate(item.created_at, format);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([date, activity]) => ({ date, activity }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Calculate time spent periods
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalTime = 0, dailyTime = 0, weeklyTime = 0, monthlyTime = 0;

  timeData.forEach(row => {
    const seconds = row.seconds_spent || 0;
    totalTime += seconds;

    const rowDate = new Date(row.date);
    if (rowDate.toDateString() === today.toDateString()) dailyTime += seconds;
    if (rowDate >= startOfWeek) weeklyTime += seconds;
    if (rowDate >= startOfMonth) monthlyTime += seconds;
  });

  return {
    modulesUploaded: uploadedCount || 0,
    modulesSaved: savedCount || 0,
    activityTimeline: {
      daily: groupBy('daily'),
      weekly: groupBy('weekly'),
      monthly: groupBy('monthly'),
    },
    timeSpent: {
      total: totalTime,
      daily: dailyTime,
      weekly: weeklyTime,
      monthly: monthlyTime,
    },
  };
}

// ✅ Save a single chat entry
async function saveChatEntry(userId, prompt, response, conversationId, clientTimestamp) {
  if (!userId || !prompt || !response || !conversationId || !clientTimestamp) {
    throw new Error('Missing required chat entry fields.');
  }

  const timestamp = new Date(
    clientTimestamp._seconds * 1000 + Math.floor(clientTimestamp._nanoseconds / 1_000_000)
  );

  console.log('[saveChatEntry] 📝 Attempting to save:', {
    user_id: userId,
    prompt: prompt.substring(0, 50) + '...',
    response: response.substring(0, 50) + '...',
    conversationId,
    timestamp
  });

  // Check if chat_history table exists and what its structure is
  const { data: tableInfo, error: tableError } = await supabase
    .from('chat_history')
    .select('*')
    .limit(1);

  if (tableError) {
    console.error('[saveChatEntry] ❌ Table check failed:', tableError);
    // If table doesn't exist, let's see what the error is
    if (tableError.code === 'PGRST116') {
      console.error('[saveChatEntry] ❌ chat_history table does not exist');
      throw new Error('chat_history table does not exist');
    }
  } else {
    console.log('[saveChatEntry] ✅ Table exists, sample data:', tableInfo);

    // Check what columns actually exist in the table
    if (tableInfo && tableInfo.length > 0) {
      const existingColumns = Object.keys(tableInfo[0]);
      console.log('[saveChatEntry] 📋 Existing columns:', existingColumns);

      // Check if conversationId exists, if not, find alternative
      let conversationColumn = 'conversationId';
      if (!existingColumns.includes('conversationId')) {
        console.error('[saveChatEntry] ❌ conversationId column does not exist in table');

        // Try different possible column names
        const possibleColumns = ['conversation_id', 'conv_id', 'session_id', 'chat_session_id', 'conversationid'];
        const foundColumn = possibleColumns.find(col => existingColumns.includes(col));

        if (foundColumn) {
          conversationColumn = foundColumn;
          console.log(`[saveChatEntry] 🔄 Using ${foundColumn} instead of conversationId`);
        } else {
          console.error('[saveChatEntry] ❌ Available columns:', existingColumns);
          throw new Error(`conversationId column not found. Available columns: ${existingColumns.join(', ')}`);
        }
      }

      // Build the insert object dynamically based on existing columns
      const insertData = {
        user_id: userId,
        prompt,
        response,
        timestamp,
      };

      // Add conversation ID with the correct column name
      insertData[conversationColumn] = conversationId;

      console.log('[saveChatEntry] 📝 Inserting with data:', insertData);

      const { data, error } = await supabase
        .from('chat_history')
        .insert(insertData)
        .select();

      console.log('[saveChatEntry] 📊 Insert result:', { data, error });

      if (error) {
        console.error('[saveChatEntry] ❌', error.message);
        console.error('[saveChatEntry] ❌ Full error object:', JSON.stringify(error, null, 2));
        throw new Error('Failed to save chat entry.');
      }

      return; // Success, exit early
    }
  }

  // Fallback to original approach if we couldn't determine columns
  console.log('[saveChatEntry] 🔄 Falling back to original insert approach');
  const { data, error } = await supabase
    .from('chat_history')
    .insert({
      user_id: userId,
      prompt,
      response,
      conversationId,
      timestamp,
    })
    .select();

  console.log('[saveChatEntry] 📊 Insert result:', { data, error });

  if (error) {
    console.error('[saveChatEntry] ❌', error.message);
    console.error('[saveChatEntry] ❌ Full error object:', JSON.stringify(error, null, 2));
    throw new Error('Failed to save chat entry.');
  }
}

// ✅ Get all chat entries for a user
async function getChatHistory(userId) {
  if (!userId) throw new Error('User ID is required');

  const { data, error } = await supabase
    .from('chat_history')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('[getChatHistory] ❌', error.message);
    throw new Error('Failed to retrieve chat history.');
  }

  // Map the data to ensure consistent field names for the client
  return data.map(entry => {
    // Find the correct conversation ID column name and map it to conversationId
    let conversationId = entry.conversationId;
    if (!conversationId) {
      // Try different possible column names
      const possibleColumns = ['conversation_id', 'conv_id', 'session_id', 'chat_session_id', 'conversationid'];
      for (const col of possibleColumns) {
        if (entry[col]) {
          conversationId = entry[col];
          break;
        }
      }
    }

    return {
      ...entry,
      conversationId, // Ensure this field exists for the client
      timestamp: {
        _seconds: Math.floor(new Date(entry.timestamp).getTime() / 1000),
        _nanoseconds: (new Date(entry.timestamp).getTime() % 1000) * 1_000_000,
      },
    };
  });
}

// ✅ Delete chat entries by conversation ID
async function deleteChatEntriesByConversationId(userId, conversationId) {
  if (!userId || !conversationId) {
    throw new Error('User ID and conversation ID are required.');
  }

  // First, let's check what columns exist in the table to find the correct conversation ID column
  const { data: tableInfo, error: tableError } = await supabase
    .from('chat_history')
    .select('*')
    .limit(1);

  let conversationColumn = 'conversationId'; // default

  if (!tableError && tableInfo && tableInfo.length > 0) {
    const existingColumns = Object.keys(tableInfo[0]);

    // Find the correct column name for conversation ID
    if (!existingColumns.includes('conversationId')) {
      const possibleColumns = ['conversation_id', 'conv_id', 'session_id', 'chat_session_id', 'conversationid'];
      const foundColumn = possibleColumns.find(col => existingColumns.includes(col));
      if (foundColumn) {
        conversationColumn = foundColumn;
      }
    }
  }

  // Build the query dynamically
  let query = supabase.from('chat_history').delete().eq('user_id', userId);

  // Add the conversation ID filter with the correct column name
  query = query.eq(conversationColumn, conversationId);

  const { error } = await query;

  if (error) {
    console.error('[deleteChatEntriesByConversationId] ❌', error.message);
    throw new Error('Failed to delete chat entries.');
  }
}

// ✅ Check if a user email exists
async function checkEmail(email) {
  if (!email) throw new Error('Email is required');

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('[checkEmail] ❌', error.message);
    throw new Error('Failed to check email.');
  }

  return !!data;
}

export {
  getUserById,
  updateUserProfile,
  getUserAnalytics,
  saveChatEntry,
  getChatHistory,
  deleteChatEntriesByConversationId,
  checkEmail,
};
