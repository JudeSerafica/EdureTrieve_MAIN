const { supabase } = require('../config/supabaseClient');

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

// ✅ Get analytics data: uploads, saves, and upload timeline
async function getUserAnalytics(userId) {
  if (!userId) throw new Error('User ID is required');

  const [
    { count: uploadedCount, error: uploadError },
    { count: savedCount, error: savedError },
    { data: uploadedData, error: uploadedDataError },
  ] = await Promise.all([
    supabase.from('modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('modules').select('created_at').eq('user_id', userId),
  ]);

  if (uploadError || savedError || uploadedDataError) {
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

  return {
    modulesUploaded: uploadedCount || 0,
    modulesSaved: savedCount || 0,
    activityTimeline: {
      daily: groupBy('daily'),
      weekly: groupBy('weekly'),
      monthly: groupBy('monthly'),
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

  const { error } = await supabase
    .from('chat_history')
    .insert({
      user_id: userId,
      prompt,
      response,
      conversationId,
      timestamp,
    });

  if (error) {
    console.error('[saveChatEntry] ❌', error.message);
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

  return data.map(entry => ({
    ...entry,
    timestamp: {
      _seconds: Math.floor(new Date(entry.timestamp).getTime() / 1000),
      _nanoseconds: (new Date(entry.timestamp).getTime() % 1000) * 1_000_000,
    },
  }));
}

// ✅ Delete chat entries by conversation ID
async function deleteChatEntriesByConversationId(userId, conversationId) {
  if (!userId || !conversationId) {
    throw new Error('User ID and conversation ID are required.');
  }

  const { error } = await supabase
    .from('chat_history')
    .delete()
    .eq('user_id', userId)
    .eq('conversationId', conversationId);

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

module.exports = {
  getUserById,
  updateUserProfile,
  getUserAnalytics,
  saveChatEntry,
  getChatHistory,
  deleteChatEntriesByConversationId,
  checkEmail,
};
