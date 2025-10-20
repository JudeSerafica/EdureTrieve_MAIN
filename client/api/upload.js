import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractTextFromFile, extractFromImage } from '../../server/src/utils/textExtractor.js';
import fs from 'fs';
import path from 'path';
import { parse } from 'multer';

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
    // Upload module
    if (req.method === 'POST' && pathname === '/api/upload') {
      const user = await authenticateToken(req);

      // Parse multipart form data
      const form = new FormData();
      const body = await req.arrayBuffer();

      // For Vercel, we need to handle file uploads differently
      // This is a simplified version - in production you'd use Vercel Blob or similar
      const { title, description } = JSON.parse(req.body || '{}');

      if (!title || !description) {
        return res.status(400).json({ error: 'Title and description are required' });
      }

      let extractedContent = description; // Default to description if no file

      // Note: File upload handling in serverless functions is complex
      // For now, we'll skip file processing and use description only
      // In production, you'd integrate with Vercel Blob or similar service

      // Insert into modules table
      const { data, error } = await supabase
        .from('modules')
        .insert([{
          title,
          description: extractedContent,
          uploadedBy: user.id,
          uploadedAt: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      res.status(200).json({
        message: 'Module uploaded successfully',
        data
      });
    }

    // Get user profile
    else if (req.method === 'GET' && pathname === '/api/profile') {
      const user = await authenticateToken(req);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      res.status(200).json({
        profile: data || {
          id: user.id,
          email: user.email,
          username: '',
          fullName: '',
          pfpUrl: ''
        }
      });
    }

    // Sync user profile
    else if (req.method === 'POST' && pathname === '/api/profile') {
      const user = await authenticateToken(req);
      const { username, fullName, pfpUrl } = req.body;

      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          username: username || '',
          fullName: fullName || '',
          pfpUrl: pfpUrl || '',
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) throw error;

      res.status(200).json({
        message: 'Profile updated successfully',
        profile: data[0]
      });
    }

    // Delete module
    else if (req.method === 'DELETE' && pathname.startsWith('/api/modules/')) {
      const user = await authenticateToken(req);
      const moduleId = pathname.split('/api/modules/')[1];

      const { error } = await supabase
        .from('modules')
        .delete()
        .eq('id', moduleId)
        .eq('uploadedBy', user.id); // Only allow deletion of own modules

      if (error) throw error;

      res.status(200).json({ message: 'Module deleted successfully' });
    }

    // Get saved modules
    else if (req.method === 'GET' && pathname === '/api/saved-modules') {
      const user = await authenticateToken(req);

      const { data, error } = await supabase
        .from('save_modules')
        .select(`
          module_id,
          modules:module_id (
            id,
            title,
            description,
            uploadedBy,
            uploadedAt,
            file_url
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const modules = data.map(item => item.modules);

      res.status(200).json({ modules });
    }

    // Unsave module
    else if (req.method === 'POST' && pathname === '/api/unsave-module') {
      const user = await authenticateToken(req);
      const { module_id } = req.body;

      const { error } = await supabase
        .from('save_modules')
        .delete()
        .eq('user_id', user.id)
        .eq('module_id', module_id);

      if (error) throw error;

      res.status(200).json({ message: 'Module unsaved successfully' });
    }

    // Generate content
    else if (req.method === 'POST' && pathname === '/api/generate-content') {
      const { prompt, userId, conversationId } = req.body;

      if (!prompt || !userId || !conversationId) {
        return res.status(400).json({ error: 'Prompt, userId, and conversationId are required.' });
      }

      const content = await generateContent(prompt);

      res.status(200).json({ generatedContent: content });
    }

    // Protected test route
    else if (req.method === 'GET' && pathname === '/api/protected-data') {
      const user = await authenticateToken(req);

      res.status(200).json({
        message: 'Welcome to the protected area!',
        userEmail: user.email,
        userId: user.id,
      });
    }

    else {
      res.status(404).json({ error: 'Endpoint not found' });
    }

  } catch (error) {
    console.error('Upload API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}