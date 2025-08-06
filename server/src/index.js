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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy-key');

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/auth/callback'
);

console.log('🔐 OAuth Configuration:');
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
console.log('Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
console.log('Redirect URI: http://localhost:3000/auth/callback');

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qzlczoeipplpojxpbsll.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6bGN6b2VpcHBscG9qeHBic2xsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQzMDg4NCwiZXhwIjoyMDcwMDA2ODg0fQ.YxhYqccHYEc9FP1AdcaHXTUDg9jD1kOcQSmoaPaTWXw'
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'sample123@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'etadabxzphtzckzd',
  },
});

const verificationCodes = new Map();

const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

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

const saveModule = async (userId, moduleId) => {
  try {
    console.log('💾 Saving module:', { userId, moduleId });
    
    const response = await fetch('/api/save-module', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify({
        user_id: userId,
        module_id: moduleId
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save module');
    }
    
    const result = await response.json();
    console.log('✅ Module saved successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Error saving module:', error);
    throw error;
  }
};

const unsaveModule = async (userId, moduleId) => {
  try {
    console.log('🗑️ Unsaving module:', { userId, moduleId });
    
    const response = await fetch('/api/unsave-module', {
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        user_id: userId,
        module_id: moduleId
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to unsave module');
    }
    
    const result = await response.json();
    console.log('✅ Module unsaved successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Error unsaving module:', error);
    throw error;
  }
};


app.post('/api/save-module', authenticateToken, async (req, res) => {
  try {
    const { user_id, module_id } = req.body;
    
    const authenticatedUserId = req.user.id;
    
    if (!module_id) {
      return res.status(400).json({ 
        error: 'module_id is required' 
      });
    }
    
    console.log('💾 Saving module:', { 
      user_id: authenticatedUserId, 
      module_id 
    });

    const { data: moduleExists, error: checkError } = await supabase
      .from('modules')
      .select('id, title')
      .eq('id', module_id)
      .single();

    if (checkError || !moduleExists) {
      console.error('❌ Module not found:', checkError?.message);
      return res.status(404).json({ error: 'Module not found' });
    }

    const { data: alreadySaved } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', authenticatedUserId)
      .eq('module_id', module_id)
      .single();

    if (alreadySaved) {
      return res.status(200).json({ 
        message: 'Module already saved',
        data: alreadySaved
      });
    }
    
    const { data, error } = await supabase
      .from('save_modules')
      .insert([{
        user_id: authenticatedUserId,
        module_id: module_id,
        saved_at: new Date().toISOString()
      }])
      .select();
    
    if (error) {
      console.error('❌ Save module error:', error);
      
      if (error.code === '23505') {
        return res.status(200).json({ 
          message: 'Module already saved by this user',
          data: null
        });
      }
      
      return res.status(500).json({ error: error.message });
    }
    
    console.log('✅ Module saved successfully:', data[0]);
    res.json({ 
      success: true, 
      message: 'Module saved successfully',
      data: data[0]
    });
    
  } catch (error) {
    console.error('❌ Save module error:', error);
    res.status(500).json({ error: 'Failed to save module: ' + error.message });
  }
});

app.post('/api/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;
    const authenticatedUserId = req.user.id;
    
    if (!module_id) {
      return res.status(400).json({ 
        error: 'module_id is required' 
      });
    }

    console.log('🗑️ Unsaving module:', { 
      user_id: authenticatedUserId, 
      module_id 
    });
    
    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', authenticatedUserId)
      .eq('module_id', module_id);
    
    if (error) {
      console.error('❌ Unsave module error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('✅ Module unsaved successfully');
    res.json({ 
      success: true, 
      message: 'Module unsaved successfully' 
    });
    
  } catch (error) {
    console.error('❌ Unsave module error:', error);
    res.status(500).json({ error: 'Failed to unsave module: ' + error.message });
  }
});

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

app.post('/api/auth/google/signup', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: JSON.stringify({ email, action: 'signup' }),
      prompt: 'consent'
    });

    console.log('🔗 Generated auth URL for:', email);
    
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

    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; 

    verificationCodes.set(originalEmail, {
      code: verificationCode,
      expiresAt,
      googleUserInfo,
      action
    });

    console.log('🔐 Verification code generated and stored for:', originalEmail);

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
      console.warn('⚠️ Continuing despite email failure');
    }

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

app.post('/api/auth/verify-signup-code', async (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ 
      error: 'Email, verification code, and password are required' 
    });
  }

  try {
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

    console.log('📧 Creating user with Google info:', {
      email,
      name: verificationData.googleUserInfo.name,
      given_name: verificationData.googleUserInfo.given_name,
      family_name: verificationData.googleUserInfo.family_name
    });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: verificationData.googleUserInfo.name,
        first_name: verificationData.googleUserInfo.given_name,
        last_name: verificationData.googleUserInfo.family_name,
        avatar_url: verificationData.googleUserInfo.picture,
        google_verified: true,
        google_id: verificationData.googleUserInfo.id
      }
    });

    if (authError) {
      console.error('❌ Supabase signup error:', authError.message);
      return res.status(400).json({ error: authError.message });
    }

    console.log('✅ User created successfully:', authData.user.id);

    if (authData.user) {
      const fullName = verificationData.googleUserInfo.name || 
                      `${verificationData.googleUserInfo.given_name || ''} ${verificationData.googleUserInfo.family_name || ''}`.trim() ||
                      email.split('@')[0].split('.').map(part => 
                        part.charAt(0).toUpperCase() + part.slice(1)
                      ).join(' ');

      const username = verificationData.googleUserInfo.given_name || 
                      fullName.split(' ')[0] || 
                      email.split('@')[0];

      console.log('📝 Creating profile with:', {
        fullName,
        username,
        email
      });

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email: email,
          username: username,
          fullName: fullName,
          pfpUrl: verificationData.googleUserInfo.picture || '',
          google_verified: true,
          google_id: verificationData.googleUserInfo.id,
          created_at: new Date().toISOString()
        }]);

      if (profileError) {
        console.error('❌ Profile creation error:', profileError);
        console.warn('⚠️ Profile creation failed, but user account created successfully');
      } else {
        console.log('✅ Profile created successfully for user:', authData.user.id);
      }
    }

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

app.post('/api/auth/check-user-status', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error('❌ Error checking users:', error);
      return res.status(500).json({ error: 'Failed to check user status' });
    }

    const user = users.find(u => u.email === email.trim().toLowerCase());
    
    if (!user) {
      return res.status(404).json({ 
        exists: false,
        message: 'No account found with this email' 
      });
    }

    const isEmailConfirmed = !!user.email_confirmed_at;
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    res.status(200).json({
      exists: true,
      emailConfirmed: isEmailConfirmed,
      hasProfile: !!profile,
      user: {
        id: user.id,
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at
      }
    });

  } catch (error) {
    console.error('❌ Check user status error:', error);
    res.status(500).json({ error: 'Failed to check user status' });
  }
});

app.post('/api/auth/sync-profile-on-login', async (req, res) => {
  const { userId, email, userData } = req.body;

  if (!userId || !email) {
    return res.status(400).json({ error: 'User ID and email are required' });
  }

  try {
    console.log('🔄 Syncing profile for user:', userId);

    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    const authUser = users.find(u => u.id === userId);
    const userMetadata = authUser?.user_metadata || {};

    const { data: existingProfile, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    const fullName = userMetadata.full_name || 
                    userData?.full_name || 
                    userData?.name ||
                    existingProfile?.fullName ||
                    email.split('@')[0].split('.').map(part => 
                      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                    ).join(' ');

    const username = userMetadata.first_name ||
                    userData?.first_name ||
                    fullName.split(' ')[0] || 
                    email.split('@')[0];

    const pfpUrl = userMetadata.avatar_url || 
                  userData?.avatar_url || 
                  userData?.picture || 
                  existingProfile?.pfpUrl || 
                  '';

    const profileData = {
      id: userId,
      email: email,
      username: username,
      fullName: fullName,
      pfpUrl: pfpUrl,
      google_verified: userMetadata.google_verified || userData?.google_verified || false,
      google_id: userMetadata.google_id || userData?.google_id || null,
      updated_at: new Date().toISOString()
    };

    if (!existingProfile) {
      profileData.created_at = new Date().toISOString();
    }

    console.log('📝 Profile data to upsert:', {
      fullName,
      username,
      email,
      hasAvatar: !!pfpUrl
    });

    const { data: upsertedProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert([profileData])
      .select()
      .single();

    if (upsertError) {
      throw upsertError;
    }

    console.log('✅ Profile synced successfully for:', email);

    res.status(200).json({
      message: existingProfile ? 'Profile updated successfully' : 'Profile created successfully',
      profile: upsertedProfile
    });

  } catch (error) {
    console.error('❌ Profile sync error:', error);
    res.status(500).json({ 
      error: 'Failed to sync profile',
      details: error.message 
    });
  }
});

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

app.get('/api/protected-data', authenticateToken, (req, res) => {
  res.status(200).json({
    message: 'Welcome to the protected area!',
    userEmail: req.user.email,
    userId: req.user.id,
  });
});

app.post('/upload-module', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;
    let { file_url, file_name } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    console.log('📤 Starting module upload:', { 
      title, 
      hasBodyFile: !!file_url,
      hasMulterFile: !!req.file 
    });

    if (req.file && !file_url) {
      console.log('📁 Processing uploaded file:', req.file.originalname);
      
      try {
        const fileExt = req.file.originalname.split('.').pop();
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `modules/${req.user.id}/${uniqueFileName}`;

        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const moduleFilesBucket = buckets.find(bucket => bucket.name === 'module-files');
          
          if (!moduleFilesBucket) {
            console.log('🗄️ Creating module-files bucket...');
            await supabase.storage.createBucket('module-files', { 
              public: true,
              allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
              fileSizeLimit: 10485760
            });
          }
        } catch (bucketError) {
          console.warn('⚠️ Bucket creation warning (might already exist):', bucketError.message);
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('module-files')
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('❌ File upload error:', uploadError);
          throw new Error(`File upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('module-files')
          .getPublicUrl(filePath);

        file_url = publicUrl;
        file_name = req.file.originalname;
        
        console.log('✅ File uploaded successfully:', {
          path: filePath,
          url: file_url,
          name: file_name
        });

      } catch (fileError) {
        console.error('❌ File processing error:', fileError);
        console.warn('⚠️ Continuing without file due to upload error');
        file_url = null;
        file_name = null;
      }
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, fullName')
      .eq('id', req.user.id)
      .single();

    let uploaderName = 'Anonymous';
    
    if (profileData?.fullName) {
      uploaderName = profileData.fullName;
    } else if (profileData?.username) {
      uploaderName = profileData.username;
    } else if (req.user.email) {
      const emailPart = req.user.email.split('@')[0];
      uploaderName = emailPart.split('.').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
    }

    let insertData = {
      title,
      description,
      user_id: req.user.id,
      uploaded_by: uploaderName,
      created_at: new Date().toISOString()
    };

    if (file_url) {
      insertData.file_url = file_url;
      insertData.file_name = file_name;
      console.log('📎 Including file data in module:', { file_url, file_name });
    }

    const { data, error } = await supabase
      .from('modules')
      .insert([insertData])
      .select();

    if (error) {
      console.error('❌ Database insert error:', error);
      
      if (file_url && file_url.includes('module-files')) {
        try {
          const filePath = file_url.split('/module-files/')[1];
          await supabase.storage.from('module-files').remove([filePath]);
          console.log('🧹 Cleaned up uploaded file after DB error');
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup file:', cleanupError.message);
        }
      }
      
      throw error;
    }

    console.log('✅ Module created successfully:', {
      id: data[0].id,
      title: data[0].title,
      hasFile: !!data[0].file_url,
      uploaderName
    });

    res.status(200).json({ 
      message: 'Module uploaded successfully',
      data: {
        ...data[0],
        uploadedBy: uploaderName,
        uploadedAt: data[0].created_at
      }
    });

  } catch (error) {
    console.error('❌ Upload module error:', error);
    res.status(500).json({ 
      error: 'Upload failed: ' + error.message,
      details: error.stack
    });
  }
});

app.get('/get-modules', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching all modules...');

    const { data: modulesData, error: modulesError } = await supabase
      .from('modules')
      .select('*')
      .order('created_at', { ascending: false });

    if (modulesError) {
      console.error('❌ Get modules error:', modulesError);
      throw modulesError;
    }

    const userIds = [...new Set(modulesData.map(m => m.user_id))];
    
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, fullName')
      .in('id', userIds);

    const profilesMap = new Map();
    profilesData?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    const modules = modulesData.map(module => {
      const profile = profilesMap.get(module.user_id);
      
      let uploaderName = 'Unknown User';
      if (module.uploaded_by) {
        uploaderName = module.uploaded_by;
      } else if (profile?.fullName) {
        uploaderName = profile.fullName;
      } else if (profile?.username) {
        uploaderName = profile.username;
      }

      return {
        ...module,
        uploadedAt: module.created_at,
        uploadedBy: uploaderName
      };
    });

    console.log('✅ Retrieved modules:', modules.length);

    res.status(200).json({ modules });
  } catch (error) {
    console.error('❌ Get modules error:', error);
    res.status(500).json({ error: 'Failed to get modules: ' + error.message });
  }
});

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

app.delete('/delete-module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const { moduleId } = req.params;

    const { data: moduleData, error: selectError } = await supabase
      .from('modules')
      .select('*')
      .eq('id', moduleId)
      .eq('user_id', req.user.id)
      .single();

    if (selectError || !moduleData) {
      return res.status(404).json({ error: 'Module not found or access denied' });
    }

    const { error: deleteError } = await supabase
      .from('modules')
      .delete()
      .eq('id', moduleId)
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    if (moduleData.file_url && moduleData.file_url.includes('module-files')) {
      try {
        const filePath = moduleData.file_url.split('/module-files/')[1];
        await supabase.storage.from('module-files').remove([filePath]);
        console.log('🧹 Cleaned up file for deleted module:', filePath);
      } catch (fileError) {
        console.warn('⚠️ Failed to cleanup file:', fileError.message);
      }
    }

    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('❌ Delete module error:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

app.get('/get-my-modules', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const modules = data.map(module => ({
      ...module,
      uploadedAt: module.created_at,
      uploadedBy: 'You'
    }));

    res.status(200).json({ modules });
  } catch (error) {
    console.error('❌ Get my modules error:', error);
    res.status(500).json({ error: 'Failed to get your modules' });
  }
});

app.get('/get-saved-modules', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching saved modules for user:', req.user.id);

    const { data: savedData, error: savedError } = await supabase
      .from('save_modules')
      .select('module_id, saved_at')
      .eq('user_id', req.user.id)
      .order('saved_at', { ascending: false });

    if (savedError) {
      console.error('❌ Get saved modules error:', savedError);
      throw savedError;
    }

    if (!savedData || savedData.length === 0) {
      return res.status(200).json({ modules: [] });
    }

    const moduleIds = savedData.map(item => item.module_id);
    const { data: modulesData, error: modulesError } = await supabase
      .from('modules')
      .select('*')
      .in('id', moduleIds);

    if (modulesError) {
      console.error('❌ Get modules data error:', modulesError);
      throw modulesError;
    }

    const userIds = [...new Set(modulesData.map(m => m.user_id))];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, fullName')
      .in('id', userIds);

    const profilesMap = new Map();
    profilesData?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    const savedDatesMap = new Map();
    savedData.forEach(item => {
      savedDatesMap.set(item.module_id, item.saved_at);
    });

    const modules = modulesData
      .filter(module => module) 
      .map(module => {
        const profile = profilesMap.get(module.user_id);
        
        let uploaderName = 'Unknown User';
        if (module.uploaded_by) {
          uploaderName = module.uploaded_by;
        } else if (profile?.fullName) {
          uploaderName = profile.fullName;
        } else if (profile?.username) {
          uploaderName = profile.username;
        }

        return {
          ...module,
          uploadedAt: module.created_at,
          uploadedBy: uploaderName,
          savedAt: savedDatesMap.get(module.id)
        };
      });

    console.log('✅ Retrieved saved modules:', modules.length);

    res.status(200).json({ modules });
  } catch (error) {
    console.error('❌ Get saved modules error:', error);
    res.status(500).json({ error: 'Failed to get saved modules: ' + error.message });
  }
});

app.post('/save-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({ error: 'Module ID is required' });
    }

    console.log('💾 Saving module:', { module_id, user_id: req.user.id });

    const { data: moduleExists, error: checkError } = await supabase
      .from('modules')
      .select('id, title')
      .eq('id', module_id)
      .single();

    if (checkError || !moduleExists) {
      console.error('❌ Module not found:', checkError?.message);
      return res.status(404).json({ error: 'Module not found' });
    }

    const { data: alreadySaved, error: savedCheckError } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('module_id', module_id)
      .single();

    if (alreadySaved) {
      console.log('⚠️ Module already saved by user');
      return res.status(200).json({ 
        message: 'Module already saved',
        data: alreadySaved
      });
    }

    const { data, error } = await supabase
      .from('save_modules')
      .insert([{
        user_id: req.user.id,
        module_id: module_id,
        saved_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('❌ Save module database error:', error);
      throw error;
    }

    console.log('✅ Module saved successfully:', data[0]);

    res.status(200).json({ 
      message: 'Module saved successfully',
      data: data[0]
    });
  } catch (error) {
    console.error('❌ Save module error:', error);
    res.status(500).json({ error: 'Failed to save module: ' + error.message });
  }
});

app.post('/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({ error: 'Module ID is required' });
    }

    console.log('🗑️ Unsaving module:', { module_id, user_id: req.user.id });

    const { data: savedModule, error: checkError } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('module_id', module_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (!savedModule) {
      console.log('⚠️ Module was not saved by user');
      return res.status(200).json({ message: 'Module was not saved' });
    }

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', req.user.id)
      .eq('module_id', module_id);

    if (error) {
      console.error('❌ Unsave module error:', error);
      throw error;
    }

    console.log('✅ Module unsaved successfully');

    res.status(200).json({ message: 'Module unsaved successfully' });
  } catch (error) {
    console.error('❌ Unsave module error:', error);
    res.status(500).json({ error: 'Failed to unsave module: ' + error.message });
  }
});

app.get('/api/analytics/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
    res.status(500).json({ error: 'Failed to get analytics: ' + error.message });
  }
});

app.post('/api/debug/user-info', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      throw usersError;
    }

    const user = users.find(u => u.email === email.trim().toLowerCase());
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found in auth',
        searchedEmail: email.trim().toLowerCase(),
        totalUsers: users.length
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const { count: modulesCount } = await supabase
      .from('modules')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    res.status(200).json({
      auth: {
        id: user.id,
        email: user.email,
        emailConfirmed: !!user.email_confirmed_at,
        emailConfirmedAt: user.email_confirmed_at,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        userMetadata: user.user_metadata,
        appMetadata: user.app_metadata
      },
      profile: profile || null,
      profileError: profileError?.message || null,
      modulesCount: modulesCount || 0,
      debug: {
        hasProfile: !!profile,
        profileCreatedAt: profile?.created_at,
        googleVerified: profile?.google_verified || false
      }
    });

  } catch (error) {
    console.error('❌ Debug user info error:', error);
    res.status(500).json({ 
      error: 'Failed to get debug info',
      details: error.message 
    });
  }
});

app.post('/api/fix-null-profiles', async (req, res) => {
  try {
    console.log('🔧 Starting to fix NULL profiles...');
    
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .or('fullName.is.null,fullName.eq.');
    
    if (profilesError) throw profilesError;

    let fixedCount = 0;

    for (const profile of profiles) {
      const authUser = users.find(u => u.id === profile.id);
      
      if (authUser) {
        const userMetadata = authUser.user_metadata || {};
        
        let fullName = userMetadata.full_name || 
                      userMetadata.name;
        
        if (!fullName && authUser.email) {
          const emailPart = authUser.email.split('@')[0];
          fullName = emailPart.split('.').map(part => 
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          ).join(' ');
        }

        const username = userMetadata.first_name || 
                        fullName?.split(' ')[0] || 
                        authUser.email?.split('@')[0];

        if (fullName) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              fullName: fullName,
              username: username,
              pfpUrl: userMetadata.avatar_url || profile.pfpUrl || '',
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id);

          if (!updateError) {
            fixedCount++;
            console.log(`✅ Fixed profile for ${authUser.email}: ${fullName}`);
          } else {
            console.error(`❌ Failed to fix profile for ${authUser.email}:`, updateError);
          }
        }
      }
    }

    console.log(`🎉 Successfully fixed ${fixedCount} profiles`);

    res.status(200).json({
      message: `Successfully fixed ${fixedCount} NULL profiles`,
      fixedCount,
      totalProfiles: profiles.length
    });

  } catch (error) {
    console.error('❌ Fix NULL profiles error:', error);
    res.status(500).json({ 
      error: 'Failed to fix NULL profiles',
      details: error.message 
    });
  }
});

app.get('/debug/table-structure', authenticateToken, async (req, res) => {
  try {
    const { data: sampleModule } = await supabase
      .from('modules')
      .select('*')
      .limit(1);

    const { data: sampleProfile } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    const { data: sampleSave } = await supabase
      .from('save_modules')
      .select('*')
      .limit(1);

    const [
      { count: modulesCount },
      { count: profilesCount },
      { count: savesCount }
    ] = await Promise.all([
      supabase.from('modules').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('save_modules').select('*', { count: 'exact', head: true })
    ]);

    res.status(200).json({
      tables: {
        modules: {
          count: modulesCount,
          sample: sampleModule?.[0] || null,
          fields: sampleModule?.[0] ? Object.keys(sampleModule[0]) : []
        },
        profiles: {
          count: profilesCount,
          sample: sampleProfile?.[0] || null,
          fields: sampleProfile?.[0] ? Object.keys(sampleProfile[0]) : []
        },
        save_modules: {
          count: savesCount,
          sample: sampleSave?.[0] || null,
          fields: sampleSave?.[0] ? Object.keys(sampleSave[0]) : []
        }
      }
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '✅ EduRetrieve backend is running!',
    version: '2.1.0-fixed',
    timestamp: new Date().toISOString(),
    status: 'Database JOIN issues resolved',
    endpoints: [
      'POST /api/auth/google/signup - Initiate Google OAuth signup',
      'POST /api/auth/google/callback - Handle Google OAuth callback', 
      'POST /api/auth/verify-signup-code - Complete signup with verification code',
      'POST /api/auth/check-verification-status - Check verification status',
      'POST /api/auth/check-user-status - Check user status',
      'POST /api/auth/sync-profile-on-login - Sync profile on login',
      'POST /api/generate-content - Generate AI content',
      'GET /api/protected-data - Test protected route',
      'POST /upload-module - Upload module',
      'GET /get-modules - Get all modules (FIXED)',
      'GET /get-my-modules - Get user\'s own modules',
      'GET /get-saved-modules - Get saved modules (FIXED)',
      'POST /save-module - Save a module',
      'POST /unsave-module - Unsave a module',
      'GET /get-user-profile - Get user profile',
      'POST /sync-user-profile - Update user profile',
      'DELETE /delete-module/:id - Delete module',
      'GET /api/analytics/:userId - Get user analytics',
      'GET /debug/table-structure - Debug table structure'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔐 Google OAuth Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`📧 Gmail configured: ${process.env.GMAIL_USER || 'sample123@gmail.com'}`);
  console.log(`🗄️ Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'}`);
  console.log('');
  console.log('🔧 FIXES APPLIED:');
  console.log('   ✅ Removed problematic JOIN queries from /get-modules');
  console.log('   ✅ Fixed /get-saved-modules with separate queries');
  console.log('   ✅ Added proper error handling for missing relationships');
  console.log('   ✅ Improved uploader name resolution');
  console.log('');
  console.log('📍 Available endpoints:');
  console.log('   POST /api/auth/google/signup');
  console.log('   POST /api/auth/google/callback');
  console.log('   POST /api/auth/verify-signup-code');
  console.log('   POST /api/auth/check-verification-status');
  console.log('   POST /api/generate-content');
  console.log('   GET  /api/protected-data');
  console.log('   POST /upload-module');
  console.log('   GET  /get-modules (FIXED)');
  console.log('   GET  /get-my-modules');
  console.log('   GET  /get-saved-modules (FIXED)');
  console.log('   POST /save-module');
  console.log('   POST /unsave-module');
  console.log('   GET  /get-user-profile');
  console.log('   POST /sync-user-profile');
  console.log('   DELETE /delete-module/:id');
  console.log('   GET  /api/analytics/:userId');
  console.log('   GET  /debug/table-structure');
});