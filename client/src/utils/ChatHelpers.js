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

const getUserChatKey = (userId) => `eduretrieve_chat_sessions_${userId}`;

// ------------------------
// 📂 Load Chat Sessions
// ------------------------

/**
 * Loads chat history sessions from localStorage.
 */
export const fetchChatHistoryApi = async (user) => {
  try {
    const raw = localStorage.getItem(getUserChatKey(user.id));
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
  let sessions = await fetchChatHistoryApi(user);

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

  localStorage.setItem(getUserChatKey(user.id), JSON.stringify(sessions));
};

// ------------------------
// ❌ Delete Chat Session
// ------------------------

/**
 * Deletes a chat session by its ID from localStorage.
 */
export const deleteChatSessionApi = async (user, sessionId) => {
  const sessions = await fetchChatHistoryApi(user);
  const updated = sessions.filter((s) => s.id !== sessionId);
  localStorage.setItem(getUserChatKey(user.id), JSON.stringify(updated));
  return { message: 'Session deleted locally' };
};

// ------------------------
// 🧠 Call AI Backend
// ------------------------

/**
 * Sends a prompt to the backend AI API and returns the generated response.
 */
export const generateContentApi = async (user, prompt, conversationId) => {
  console.log('ChatHelpers.js: generateContentApi called with:', {
    userId: user?.id,
    prompt: prompt?.substring(0, 50) + '...',
    conversationId
  });

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Invalid prompt');
  }

  if (!conversationId) {
    throw new Error('conversationId is required');
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
    body: JSON.stringify({
      prompt,
      userId: user.id,
      conversationId,
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error || 'Failed to generate content');
  }

  return result;
};

/**
 * Processes an uploaded image through OCR and AI analysis, then saves to localStorage
 */
export const processChatImageApi = async (user, imageFile, conversationId, customPrompt = null) => {
  console.log('ChatHelpers.js: processChatImageApi called with:', {
    userId: user?.id,
    imageFileName: imageFile?.name,
    imageFileSize: imageFile?.size,
    conversationId
  });

  if (!imageFile) {
    throw new Error('No image file provided');
  }

  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('conversationId', conversationId);
  if (customPrompt) {
    formData.append('prompt', customPrompt);
  }

  const res = await fetch('http://localhost:5000/api/chat/process-image', {
    method: 'POST',
    body: formData,
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error || 'Failed to process image');
  }

  // Create image preview URL for display
  const imagePreview = URL.createObjectURL(imageFile);

  // Create message objects
  const imageMessage = {
    type: 'user',
    text: `[Image uploaded] ${result.extractedText}`,
    timestamp: {
      _seconds: Math.floor(Date.now() / 1000),
      _nanoseconds: (Date.now() % 1000) * 1_000_000
    },
    conversationId,
    imagePreview
  };

  const aiMessage = {
    type: 'ai',
    text: result.aiResponse,
    timestamp: {
      _seconds: Math.floor(Date.now() / 1000),
      _nanoseconds: (Date.now() % 1000) * 1_000_000
    },
    conversationId
  };

  // Save to localStorage like regular chat messages
  await saveChatEntryApi(user, {
    prompt: imageMessage.text,
    response: aiMessage.text,
    timestamp: imageMessage.timestamp,
    conversationId,
  });

  return result;
};
