import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

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

// Google OAuth2 Client Setup
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/auth/callback`
);

// Email transporter setup
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'judeserafica@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'qfqyrdkwxpryeoap',
  },
});

// In-memory storage for verification codes (use Redis in production)
const verificationCodes = new Map();

// Generate random 6-digit verification code
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

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
    // Google OAuth signup
    if (req.method === 'POST' && pathname === '/api/auth/google/signup') {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Generate authorization URL
      const authUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ],
        state: JSON.stringify({ email, action: 'signup' }),
        prompt: 'consent',
        redirect_uri: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/auth/callback`
      });

      res.status(200).json({
        message: 'Redirect to Google for authorization',
        authUrl,
        email
      });
    }

    // Google OAuth callback
    else if (req.method === 'POST' && pathname === '/api/auth/google/callback') {
      const { code, state } = req.body;

      if (!code || !state) {
        return res.status(400).json({
          error: 'Missing authorization code or state'
        });
      }

      // Parse state
      let parsedState;
      try {
        parsedState = JSON.parse(state);
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid state parameter'
        });
      }

      const { email: originalEmail, action } = parsedState;

      if (!originalEmail) {
        return res.status(400).json({
          error: 'Invalid state: missing email'
        });
      }

      // Exchange authorization code for tokens
      let tokens;
      try {
        const tokenResponse = await googleClient.getToken({
          code,
          redirect_uri: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/auth/callback`
        });
        tokens = tokenResponse.tokens;
      } catch (tokenError) {
        return res.status(400).json({
          error: 'Failed to exchange authorization code'
        });
      }

      googleClient.setCredentials(tokens);

      // Get user info from Google
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
      } catch (fetchError) {
        return res.status(500).json({
          error: 'Failed to fetch user info from Google'
        });
      }

      // Verify the email matches
      if (googleUserInfo.email !== originalEmail) {
        return res.status(400).json({
          error: 'Email mismatch'
        });
      }

      if (!googleUserInfo.verified_email) {
        return res.status(400).json({
          error: 'Google email is not verified'
        });
      }

      // Generate verification code
      const verificationCode = generateVerificationCode();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Store verification data temporarily
      verificationCodes.set(originalEmail, {
        code: verificationCode,
        expiresAt,
        googleUserInfo,
        action
      });

      // Send verification email
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
          from: `"EduRetrieve" <${process.env.GMAIL_USER || 'judeserafica@gmail.com'}>`,
          to: originalEmail,
          subject: 'Complete Your EduRetrieve Registration',
          html: emailHtml,
        });
      } catch (emailError) {
        console.warn('Email sending failed:', emailError);
      }

      // Clean up expired codes
      setTimeout(() => {
        if (verificationCodes.has(originalEmail)) {
          verificationCodes.delete(originalEmail);
        }
      }, 10 * 60 * 1000);

      res.status(200).json({
        message: 'Google verification successful. Check your email for the final verification code.',
        email: originalEmail,
        name: googleUserInfo.name,
        googleVerified: true,
        codeExpires: new Date(expiresAt).toISOString()
      });
    }

    // Verify signup code
    else if (req.method === 'POST' && pathname === '/api/auth/verify-signup-code') {
      const { email, code, password } = req.body;

      if (!email || !code || !password) {
        return res.status(400).json({
          error: 'Email, verification code, and password are required'
        });
      }

      const verificationData = verificationCodes.get(email);

      if (!verificationData) {
        return res.status(400).json({
          error: 'Verification code expired or not found'
        });
      }

      if (Date.now() > verificationData.expiresAt) {
        verificationCodes.delete(email);
        return res.status(400).json({
          error: 'Verification code has expired'
        });
      }

      if (verificationData.code !== code) {
        return res.status(400).json({
          error: 'Invalid verification code'
        });
      }

      const userMeta = verificationData.googleUserInfo || {};

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: userMeta.name || '',
          first_name: userMeta.given_name || '',
          last_name: userMeta.family_name || '',
          avatar_url: userMeta.picture || '',
          google_verified: true,
          google_id: userMeta.id || ''
        }
      });

      if (authError) {
        if (authError.message.includes('duplicate key value')) {
          return res.status(400).json({
            error: 'User already exists. Please log in instead.'
          });
        }
        return res.status(400).json({ error: authError.message });
      }

      // Insert into profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email,
          username: userMeta.given_name || email.split('@')[0],
          fullName: userMeta.name || '',
          pfpUrl: userMeta.picture || '',
          google_verified: true,
          google_id: userMeta.id || '',
          created_at: new Date().toISOString()
        }]);

      if (profileError) {
        return res.status(400).json({ error: profileError.message });
      }

      // Create a session for the new user
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        return res.status(400).json({ error: signInError.message });
      }

      verificationCodes.delete(email);

      res.status(200).json({
        message: 'Signup completed successfully!',
        user: {
          id: authData.user.id,
          email: authData.user.email,
          fullName: userMeta.name || '',
          avatar: userMeta.picture || '',
          googleVerified: true
        },
        session: signInData.session
      });
    }

    // Check verification status
    else if (req.method === 'POST' && pathname === '/api/auth/check-verification-status') {
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
    }

    else {
      res.status(404).json({ error: 'Endpoint not found' });
    }

  } catch (error) {
    console.error('Auth API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}