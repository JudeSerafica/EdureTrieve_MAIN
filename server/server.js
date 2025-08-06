import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

const app = express();
const upload = multer();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy-key');

// Google OAuth2 Client Setup - FIXED REDIRECT URI
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/auth/callback' // Make sure this matches your Google Console
);

// Add this logging to debug the OAuth configuration
console.log('🔐 OAuth Configuration:');
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
console.log('Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
console.log('Redirect URI: http://localhost:3000/auth/callback');

// =========================
// 🔧 Middleware
// =========================
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// 🧭 SUPABASE INIT  
// =========================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qzlczoeipplpojxpbsll.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6bGN6b2VpcHBscG9qeHBic2xsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQzMDg4NCwiZXhwIjoyMDcwMDA2ODg0fQ.YxhYqccHYEc9FP1AdcaHXTUDg9jD1kOcQSmoaPaTWXw'
);

// =========================
// 📧 EMAIL TRANSPORTER SETUP
// =========================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'sample123@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'etadabxzphtzckzd',
  },
});

// In-memory storage for verification codes (use Redis in production)
const verificationCodes = new Map();

// Generate random 6-digit verification code
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Generate content using Gemini
const generateContent = async (prompt, retries = 3) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("❌ Gemini API error:", error.message || error);
    throw new Error("Failed to generate content from AI.");
  }
};

// =========================
// ✅ AUTH MIDDLEWARE
// =========================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split('Bearer ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// =========================
// 🔐 GOOGLE OAUTH ROUTES
// =========================

// Step 1: Initiate Google OAuth signup
app.post('/api/auth/google/signup', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Generate authorization URL with proper redirect_uri
    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: JSON.stringify({ email, action: 'signup' }),
      prompt: 'consent',
      redirect_uri: 'http://localhost:3000/auth/callback' // Explicit redirect URI
    });

    console.log('🔗 Generated auth URL for:', email);
    console.log('🔗 Full auth URL:', authUrl);
    
    res.status(200).json({
      message: 'Redirect to Google for authorization',
      authUrl,
      email
    });
  } catch (error) {
    console.error('❌ Google OAuth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate Google auth URL' });
  }
});

// Step 2: Handle Google OAuth callback - IMPROVED VERSION
app.post('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.body;

  console.log('🔄 OAuth Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    codeLength: code ? code.length : 0,
    stateContent: state ? state.substring(0, 100) + '...' : 'none'
  });

  if (!code || !state) {
    console.error('❌ Missing parameters:', { code: !!code, state: !!state });
    return res.status(400).json({ 
      error: 'Missing authorization code or state',
      details: 'Both code and state parameters are required'
    });
  }

  try {
    // Parse state to get original email and action
    let parsedState;
    try {
      parsedState = JSON.parse(state);
    } catch (parseError) {
      console.error('❌ State parsing error:', parseError);
      return res.status(400).json({ 
        error: 'Invalid state parameter',
        details: 'Could not parse state JSON'
      });
    }

    const { email: originalEmail, action } = parsedState;
    console.log('📧 Processing callback for email:', originalEmail);

    if (!originalEmail) {
      return res.status(400).json({ 
        error: 'Invalid state: missing email',
        details: 'State parameter must contain email'
      });
    }

    // Exchange authorization code for tokens with explicit redirect_uri
    let tokens;
    try {
      const tokenResponse = await googleClient.getToken({
        code,
        redirect_uri: 'http://localhost:3000/auth/callback'
      });
      tokens = tokenResponse.tokens;
      console.log('🔑 Token exchange successful');
    } catch (tokenError) {
      console.error('❌ Token exchange error:', tokenError);
      return res.status(400).json({ 
        error: 'Failed to exchange authorization code',
        details: tokenError.message
      });
    }

    googleClient.setCredentials(tokens);

    // Get user info from Google with better error handling
    let googleUserInfo;
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Google API responded with status ${response.status}`);
      }

      googleUserInfo = await response.json();
      console.log('👤 Google user info retrieved:', {
        email: googleUserInfo.email,
        name: googleUserInfo.name,
        verified: googleUserInfo.verified_email
      });
    } catch (fetchError) {
      console.error('❌ Failed to fetch user info:', fetchError);
      return res.status(500).json({ 
        error: 'Failed to fetch user info from Google',
        details: fetchError.message
      });
    }
    
    // Verify the email matches
    if (googleUserInfo.email !== originalEmail) {
      console.error('❌ Email mismatch:', {
        expected: originalEmail,
        received: googleUserInfo.email
      });
      return res.status(400).json({
        error: 'Email mismatch. Please use the same email address.',
        details: `Expected ${originalEmail}, got ${googleUserInfo.email}`
      });
    }

    if (!googleUserInfo.verified_email) {
      console.error('❌ Google email not verified');
      return res.status(400).json({
        error: 'Google email is not verified. Please verify your email with Google first.'
      });
    }

    // Generate verification code for our system
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store verification data temporarily
    verificationCodes.set(originalEmail, {
      code: verificationCode,
      expiresAt,
      googleUserInfo,
      action
    });

    console.log('🔐 Verification code generated and stored for:', originalEmail);

    // Send verification email with the code
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
          <h1>EduRetrieve</h1>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2>Complete Your Registration</h2>
          <p>Hi ${googleUserInfo.name}!</p>
          <p>Your Google account has been verified successfully. To complete your EduRetrieve registration, please enter this verification code:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #007bff; color: white; padding: 15px 30px; border-radius: 8px; display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 3px;">
              ${verificationCode}
            </div>
          </div>
          
          <p><strong>This code will expire in 10 minutes.</strong></p>
          <p>Google Account Details:</p>
          <ul>
            <li>Email: ${googleUserInfo.email}</li>
            <li>Name: ${googleUserInfo.name}</li>
            <li>Verified: ✅</li>
          </ul>
        </div>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"EduRetrieve" <${process.env.GMAIL_USER || 'sample123@gmail.com'}>`,
        to: originalEmail,
        subject: 'Complete Your EduRetrieve Registration',
        html: emailHtml,
      });
      console.log('✅ Verification email sent to:', originalEmail);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      // Don't fail the whole request if email fails
      console.warn('⚠️ Continuing despite email failure');
    }

    // Clean up expired codes
    setTimeout(() => {
      if (verificationCodes.has(originalEmail)) {
        verificationCodes.delete(originalEmail);
        console.log('🗑️ Expired verification code cleaned up for:', originalEmail);
      }
    }, 10 * 60 * 1000);

    console.log('✅ OAuth callback processed successfully for:', originalEmail);

    res.status(200).json({
      message: 'Google verification successful. Check your email for the final verification code.',
      email: originalEmail,
      name: googleUserInfo.name,
      googleVerified: true,
      codeExpires: new Date(expiresAt).toISOString()
    });

  } catch (error) {
    console.error('❌ Google OAuth callback error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process Google authentication',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Step 3: Verify the final code and complete signup
app.post('/api/auth/verify-signup-code', async (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ 
      error: 'Email, verification code, and password are required' 
    });
  }

  try {
    // Check if verification code exists and is valid
    const verificationData = verificationCodes.get(email);

    if (!verificationData) {
      return res.status(400).json({ 
        error: 'Verification code expired or not found. Please restart the signup process.' 
      });
    }

    if (Date.now() > verificationData.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({ 
        error: 'Verification code has expired. Please restart the signup process.' 
      });
    }

    if (verificationData.code !== code) {
      return res.status(400).json({ 
        error: 'Invalid verification code. Please check and try again.' 
      });
    }

    // Create Supabase user account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: verificationData.googleUserInfo.name,
          avatar_url: verificationData.googleUserInfo.picture,
          google_verified: true,
          google_id: verificationData.googleUserInfo.id
        }
      }
    });

    if (authError) {
      console.error('❌ Supabase signup error:', authError.message);
      return res.status(400).json({ error: authError.message });
    }

    // Create user profile in profiles table
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email: email,
          username: verificationData.googleUserInfo.given_name || email.split('@')[0],
          fullName: verificationData.googleUserInfo.name,
          pfpUrl: verificationData.googleUserInfo.picture || '',
          google_verified: true,
          google_id: verificationData.googleUserInfo.id,
          created_at: new Date().toISOString()
        }]);

      if (profileError) {
        console.warn('⚠️ Profile creation warning:', profileError.message);
      } else {
        console.log('✅ Profile created for user:', authData.user.id);
      }
    }

    // Clean up verification data
    verificationCodes.delete(email);

    console.log('✅ Signup completed for:', email);

    res.status(200).json({
      message: 'Signup completed successfully!',
      user: {
        id: authData.user?.id,
        email: authData.user?.email,
        fullName: verificationData.googleUserInfo.name,
        avatar: verificationData.googleUserInfo.picture,
        googleVerified: true
      },
      session: authData.session
    });

  } catch (error) {
    console.error('❌ Signup verification error:', error);
    res.status(500).json({ 
      error: 'Failed to complete signup',
      details: error.message 
    });
  }
});

// =========================
// 🔍 VERIFICATION STATUS CHECK
// =========================
app.post('/api/auth/check-verification-status', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const verificationData = verificationCodes.get(email);

  if (!verificationData) {
    return res.status(404).json({ 
      hasVerification: false,
      message: 'No pending verification found' 
    });
  }

  if (Date.now() > verificationData.expiresAt) {
    verificationCodes.delete(email);
    return res.status(410).json({ 
      hasVerification: false,
      message: 'Verification expired' 
    });
  }

  res.status(200).json({
    hasVerification: true,
    email,
    name: verificationData.googleUserInfo?.name,
    expiresAt: new Date(verificationData.expiresAt).toISOString(),
    timeRemaining: Math.max(0, verificationData.expiresAt - Date.now())
  });
});

// =========================
// 📤 EXISTING ROUTES
// =========================

// AI Generation Endpoint
app.post('/api/generate-content', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  try {
    const content = await generateContent(prompt);
    res.status(200).json({ generatedContent: content });
  } catch (error) {
    console.error('❌ Gemini API Error:', error);
    res.status(503).json({ error: 'Failed to generate content. Please try again later.' });
  }
});

// Protected Test Route
app.get('/api/protected-data', authenticateToken, (req, res) => {
  res.status(200).json({
    message: 'Welcome to the protected area!',
    userEmail: req.user.email,
    userId: req.user.id,
  });
});

// Upload Module Route
app.post('/upload-module', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // Insert into modules table
    const { data, error } = await supabase
      .from('modules')
      .insert([{
        title,
        description,
        uploadedBy: req.user.email,
        user_id: req.user.id,
        uploadedAt: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    res.status(200).json({ 
      message: 'Module uploaded successfully',
      data
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get User Profile
app.get('/get-user-profile', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.status(200).json({ 
      profile: data || {
        id: req.user.id,
        email: req.user.email,
        username: '',
        fullName: '',
        pfpUrl: ''
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Sync User Profile
app.post('/sync-user-profile', authenticateToken, async (req, res) => {
  try {
    const { username, fullName, pfpUrl } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: req.user.id,
        email: req.user.email,
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
  } catch (error) {
    console.error('❌ Sync profile error:', error);
    res.status(500).json({ error: 'Failed to sync profile' });
  }
});

// Delete Module
app.delete('/delete-module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const { moduleId } = req.params;

    const { error } = await supabase
      .from('modules')
      .delete()
      .eq('id', moduleId)
      .eq('user_id', req.user.id); // Only allow deletion of own modules

    if (error) throw error;

    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('❌ Delete module error:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

// Get Saved Modules
app.get('/get-saved-modules', authenticateToken, async (req, res) => {
  try {
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
      .eq('user_id', req.user.id);

    if (error) throw error;

    const modules = data.map(item => item.modules);

    res.status(200).json({ modules });
  } catch (error) {
    console.error('❌ Get saved modules error:', error);
    res.status(500).json({ error: 'Failed to get saved modules' });
  }
});

// Unsave Module
app.post('/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', req.user.id)
      .eq('module_id', module_id);

    if (error) throw error;

    res.status(200).json({ message: 'Module unsaved successfully' });
  } catch (error) {
    console.error('❌ Unsave module error:', error);
    res.status(500).json({ error: 'Failed to unsave module' });
  }
});

// Get Analytics
app.get('/api/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [
      { count: modulesUploaded },
      { count: modulesSaved }
    ] = await Promise.all([
      supabase.from('modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);

    res.status(200).json({
      modulesUploaded: modulesUploaded || 0,
      modulesSaved: modulesSaved || 0
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// =========================
// 🏁 ROOT ROUTE
// =========================
app.get('/', (req, res) => {
  res.json({
    message: '✅ EduRetrieve backend with Google OAuth is running!',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/google/signup - Initiate Google OAuth signup',
      'POST /api/auth/google/callback - Handle Google OAuth callback', 
      'POST /api/auth/verify-signup-code - Complete signup with verification code',
      'POST /api/auth/check-verification-status - Check verification status',
      'POST /api/generate-content - Generate AI content',
      'GET /api/protected-data - Test protected route',
      'POST /upload-module - Upload module',
      'GET /get-user-profile - Get user profile',
      'POST /sync-user-profile - Update user profile',
      'DELETE /delete-module/:id - Delete module',
      'GET /get-saved-modules - Get saved modules',
      'POST /unsave-module - Unsave module',
      'GET /api/analytics/:userId - Get user analytics'
    ]
  });
});

// =========================
// 🚀 START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔐 Google OAuth Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`📧 Gmail configured: ${process.env.GMAIL_USER || 'sample123@gmail.com'}`);
  console.log(`🗄️ Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'}`);
  console.log('📍 Available endpoints:');
  console.log('   POST /api/auth/google/signup');
  console.log('   POST /api/auth/google/callback');
  console.log('   POST /api/auth/verify-signup-code');
  console.log('   POST /api/auth/check-verification-status');
  console.log('   POST /api/generate-content');
  console.log('   GET  /api/protected-data');
  console.log('   POST /upload-module');
  console.log('   GET  /get-user-profile');
  console.log('   POST /sync-user-profile');
  console.log('   DELETE /delete-module/:id');
  console.log('   GET  /get-saved-modules');
  console.log('   POST /unsave-module');
  console.log('   GET  /api/analytics/:userId');
});