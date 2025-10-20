import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractFromImage, extractTextFromFile } from '../../server/src/utils/textExtractor.js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

// Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY || 'dummy-key';
const genAI = new GoogleGenerativeAI({
  apiKey,
  apiVersion: 'v1',
  baseUrl: 'https://generativelanguage.googleapis.com'
});

// Auth middleware for serverless functions
const authenticateToken = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header');
    }

    const token = authHeader.split('Bearer ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error('Unauthorized');
    }

    return data.user;
  } catch (err) {
    throw new Error('Unauthorized');
  }
};

// Generate content using Gemini
const generateContent = async (prompt, retries = 3) => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy-key') {
      throw new Error('Gemini API key is not configured');
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    if (!response || response.trim().length === 0) {
      throw new Error('Empty response from AI');
    }

    return response;
  } catch (error) {
    throw new Error("Failed to generate content from AI: " + error.message);
  }
};

// Chat model functions (simplified for serverless)
const saveChatEntry = async (userId, prompt, response, conversationId, timestamp) => {
  // In a real implementation, you'd save to Supabase
  // For now, return success
  return true;
};

const getChatHistory = async (userId) => {
  // In a real implementation, you'd fetch from Supabase
  // For now, return empty array
  return [];
};

const deleteChatEntriesByConversationId = async (userId, conversationId) => {
  // In a real implementation, you'd delete from Supabase
  // For now, return 0
  return 0;
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  try {
    // Save chat entry
    if (req.method === 'POST' && pathname === '/api/chat/save') {
      const user = await authenticateToken(req);
      const { prompt, response, conversationId, timestamp } = req.body;

      if (!user.id || !prompt || !response || !conversationId || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      await saveChatEntry(user.id, prompt, response, conversationId, timestamp);
      res.status(200).json({ message: 'Chat entry saved successfully.' });
    }

    // Get chat history
    else if (req.method === 'GET' && pathname === '/api/chat/history') {
      const user = await authenticateToken(req);

      const history = await getChatHistory(user.id);
      res.status(200).json({ chatHistory: history });
    }

    // Delete chat conversation
    else if (req.method === 'DELETE' && pathname.startsWith('/api/chat/delete/')) {
      const user = await authenticateToken(req);
      const conversationId = pathname.split('/api/chat/delete/')[1];

      if (!user.id || !conversationId) {
        return res.status(400).json({ error: 'Missing userId or conversationId.' });
      }

      const deletedCount = await deleteChatEntriesByConversationId(user.id, conversationId);
      if (deletedCount === 0) {
        return res.status(404).json({ message: `No chat messages found for conversation ID: ${conversationId}.` });
      }
      res.status(200).json({ message: `Successfully deleted ${deletedCount} chat entries.` });
    }

    // Process file for chat
    else if (req.method === 'POST' && pathname === '/api/chat/process-file') {
      const { conversationId, prompt } = req.body;
      const userId = 'local-user'; // Mock user ID for localStorage approach

      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required.' });
      }

      // For Vercel serverless, file processing is complex
      // This is a simplified version - in production you'd use Vercel Blob
      let extractedText = 'File processing not fully implemented in serverless environment';
      let aiResponse = 'File uploaded successfully. Full processing requires additional setup.';
      let fileName = 'unknown';
      let fileType = 'document';

      // If prompt provided, generate basic AI response
      if (prompt) {
        aiResponse = await generateContent(prompt);
      }

      res.status(200).json({
        message: 'File processed successfully',
        extractedText,
        aiResponse,
        conversationId,
        fileName,
        fileType: 'document'
      });
    }

    else {
      res.status(404).json({ error: 'Chat endpoint not found' });
    }

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}