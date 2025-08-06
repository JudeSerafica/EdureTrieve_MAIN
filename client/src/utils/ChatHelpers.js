import { supabase } from '../supabaseClient';

// ------------------------
// 📅 Format Timestamp
// ------------------------

/**
 * Converts various timestamp formats into a human-readable string.
 */
export const formatFirebaseTimestamp = (timestamp) => {
  try {
    let seconds, nanoseconds;

    if (timestamp?._seconds) {
      seconds = timestamp._seconds;
      nanoseconds = timestamp._nanoseconds || 0;
    } else if (timestamp?.seconds) {
      seconds = timestamp.seconds;
      nanoseconds = timestamp.nanoseconds || 0;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else {
      return 'Invalid Date';
    }

    const millis = seconds * 1000 + nanoseconds / 1_000_000;
    return new Date(millis).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
};

// ------------------------
// 🆔 Unique ID Generator
// ------------------------

export const generateUniqueId = () =>
  `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// ------------------------
// 💾 LocalStorage Constants
// ------------------------

const CHAT_KEY = 'eduretrieve_chat_sessions';

// ------------------------
// 📂 Load Chat Sessions
// ------------------------

/**
 * Loads chat history sessions from localStorage.
 */
export const fetchChatHistoryApi = async () => {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((s) => ({ ...s, messages: s.messages || [] }))
      : [];
  } catch (err) {
    console.warn('⚠️ Failed to parse chat history from localStorage:', err);
    return [];
  }
};

// ------------------------
// 💬 Save Chat Entry
// ------------------------

/**
 * Saves a new prompt-response pair to localStorage under the given session.
 */
export const saveChatEntryApi = async (user, { prompt, response, conversationId, timestamp }) => {
  let sessions = await fetchChatHistoryApi();

  const newMessages = [
    { type: 'user', text: prompt, timestamp },
    { type: 'ai', text: response, timestamp },
  ];

  const existing = sessions.find((s) => s.id === conversationId);

  if (existing) {
    existing.messages.push(...newMessages);
  } else {
    sessions.unshift({
      id: conversationId,
      title: `Chat from ${formatFirebaseTimestamp(timestamp).split(',')[0]}`,
      messages: newMessages,
    });
  }

  localStorage.setItem(CHAT_KEY, JSON.stringify(sessions));
};

// ------------------------
// ❌ Delete Chat Session
// ------------------------

/**
 * Deletes a chat session by its ID from localStorage.
 */
export const deleteChatSessionApi = async (user, sessionId) => {
  const sessions = await fetchChatHistoryApi();
  const updated = sessions.filter((s) => s.id !== sessionId);
  localStorage.setItem(CHAT_KEY, JSON.stringify(updated));
  return { message: 'Session deleted locally' };
};

// ------------------------
// 🧠 Call AI Backend
// ------------------------

/**
 * Sends a prompt to the backend AI API and returns the generated response.
 */
export const generateContentApi = async (user, prompt) => {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Invalid prompt');
  }

  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (error || !token) {
    throw new Error('Missing or invalid Supabase token');
  }

  const res = await fetch('http://localhost:5000/api/generate-content', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    let errorMessage = 'Something went wrong generating content.';
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      console.warn('⚠️ Could not parse error JSON from /generate-content');
    }
    throw new Error(errorMessage);
  }

  return await res.json(); // Expects: { generatedContent: "..." }
};
