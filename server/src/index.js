import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

// Import chat routes
import chatRoutes from './routes/chatRoutes.js';

const app = express();
const upload = multer();
const PORT = process.env.PORT || 5000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/auth/callback'
);

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount chat routes
app.use('/api/chat', chatRoutes);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'judeserafica@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'qfqyrdkwxpryeoap',
  },
  tls: {
    rejectUnauthorized: false
  }
});

const verificationCodes = new Map();

const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const generateContent = async (prompt, retries = 3) => {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant", // Fast and free model
    });

    return chatCompletion.choices[0]?.message?.content || "";
  } catch (error) {
    throw new Error("Failed to generate content from AI.");
  }
};

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
    return res.status(401).json({ error: 'Unauthorized' });
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

    const { data: moduleExists, error: checkError } = await supabase
      .from('modules')
      .select('id, title')
      .eq('id', module_id)
      .single();

    if (checkError || !moduleExists) {
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
      if (error.code === '23505') {
        return res.status(200).json({
          message: 'Module already saved by this user',
          data: null
        });
      }

      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      message: 'Module saved successfully',
      data: data[0]
    });

  } catch (error) {
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

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', authenticatedUserId)
      .eq('module_id', module_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      message: 'Module unsaved successfully'
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to unsave module: ' + error.message });
  }
});

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

    res.status(200).json({
      message: 'Redirect to Google for authorization',
      authUrl,
      email
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Google auth URL' });
  }
});

app.post('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.body;

  if (!code || !state) {
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
      return res.status(400).json({
        error: 'Invalid state parameter',
        details: 'Could not parse state JSON'
      });
    }

    const { email: originalEmail, action } = parsedState;

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
    } catch (tokenError) {
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
    } catch (fetchError) {
      return res.status(500).json({
        error: 'Failed to fetch user info from Google',
        details: fetchError.message
      });
    }

    if (googleUserInfo.email !== originalEmail) {
      return res.status(400).json({
        error: 'Email mismatch. Please use the same email address.',
        details: `Expected ${originalEmail}, got ${googleUserInfo.email}`
      });
    }

    if (!googleUserInfo.verified_email) {
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
            <li>Verified: Yes</li>
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
    }

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

  } catch (error) {
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

    const userMeta = verificationData.googleUserInfo || {};

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
      console.error('Auth Error Details:', {
        code: authError.code,
        message: authError.message,
        details: authError.details
      });

      if (authError.message.includes('duplicate key value') ||
          authError.message.includes('already registered') ||
          authError.code === 'user_already_exists') {
        return res.status(400).json({
          error: 'User already exists. Please log in instead.'
        });
      }

      return res.status(500).json({ error: 'Database error creating new user' });
    }

    // ✅ FIXED: Changed fullName to fullname, pfpUrl to pfpurl
    const profileData = {
      id: authData.user.id,
      email,
      username: userMeta.given_name || email.split('@')[0],
      fullname: userMeta.name || '',
      pfpurl: userMeta.picture || '',
      google_verified: true,
      google_id: userMeta.id || '',
      created_at: new Date().toISOString()
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .insert([profileData]);

    if (profileError) {
      console.error('Profile Error Details:', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details
      });

      if (profileError.code === '23505' || profileError.message.includes('duplicate key')) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            email,
            username: userMeta.given_name || email.split('@')[0],
            fullname: userMeta.name || '',
            pfpurl: userMeta.picture || '',
            google_verified: true,
            google_id: userMeta.id || '',
            updated_at: new Date().toISOString()
          })
          .eq('id', authData.user.id);

        if (updateError) {
          console.error('Profile Update Error:', updateError);
          return res.status(500).json({ error: 'Database error creating new user' });
        }
      } else {
        return res.status(500).json({ error: 'Database error creating new user' });
      }
    }

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
        fullName: userMeta.name || '', // This is just response data, not database
        avatar: userMeta.picture || '',
        googleVerified: true
      },
      session: signInData.session
    });

  } catch (error) {
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
    res.status(500).json({ error: 'Failed to check user status' });
  }
});

app.post('/api/auth/sync-profile-on-login', async (req, res) => {
  const { userId, email, userData } = req.body;

  if (!userId || !email) {
    return res.status(400).json({ error: 'User ID and email are required' });
  }

  try {
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

    // ✅ FIXED: Changed existingProfile?.fullName to existingProfile?.fullname
    const fullname = userMetadata.full_name ||
                    userData?.full_name ||
                    userData?.name ||
                    existingProfile?.fullname ||
                    email.split('@')[0].split('.').map(part =>
                      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                    ).join(' ');

    const username = userMetadata.first_name ||
                    userData?.first_name ||
                    fullname.split(' ')[0] ||
                    email.split('@')[0];

    // ✅ FIXED: Changed existingProfile?.pfpUrl to existingProfile?.pfpurl
    const pfpurl = userMetadata.avatar_url ||
                  userData?.avatar_url ||
                  userData?.picture ||
                  existingProfile?.pfpurl ||
                  '';

    // ✅ FIXED: Changed fullName to fullname, pfpUrl to pfpurl
    const profileData = {
      id: userId,
      email: email,
      username: username,
      fullname: fullname,
      pfpurl: pfpurl,
      google_verified: userMetadata.google_verified || userData?.google_verified || false,
      google_id: userMetadata.google_id || userData?.google_id || null,
      updated_at: new Date().toISOString()
    };

    if (!existingProfile) {
      profileData.created_at = new Date().toISOString();
    }

    const { data: upsertedProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert([profileData])
      .select()
      .single();

    if (upsertError) {
      throw upsertError;
    }

    res.status(200).json({
      message: existingProfile ? 'Profile updated successfully' : 'Profile created successfully',
      profile: upsertedProfile
    });

  } catch (error) {
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
  console.log('Server: /api/generate-content received request body:', {
    prompt: req.body.prompt?.substring(0, 50) + '...' || 'MISSING',
    userId: req.body.userId || 'MISSING',
    conversationId: req.body.conversationId || 'MISSING',
    hasPrompt: !!req.body.prompt,
    hasUserId: !!req.body.userId,
    hasConversationId: !!req.body.conversationId
  });

  const { prompt, userId, conversationId } = req.body;

  if (!prompt || !userId || !conversationId) {
    console.log('Server: Validation failed - missing required fields');
    return res.status(400).json({ error: 'Prompt, userId, and conversationId are required.' });
  }

  try {
    console.log('🚀 API Request received:', { prompt: prompt.substring(0, 50) + '...', userId, conversationId });

    console.log('🔑 GROQ_API_KEY status:', {
      exists: !!process.env.GROQ_API_KEY,
      length: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.length : 0,
      startsWith: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 10) + '...' : 'N/A'
    });

    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY is not configured');
      throw new Error('Groq API key is not configured');
    }

    console.log('🔧 Using Groq model: llama-3.1-8b-instant');

    console.log('📡 Calling generateContent function...');
    const response = await generateContent(prompt);

    console.log('✅ AI Response received:', response ? 'Length: ' + response.length : 'EMPTY RESPONSE!');
    console.log('📝 Response preview:', response ? response.substring(0, 100) + '...' : 'N/A');

    if (!response || response.trim().length === 0) {
      console.error('❌ Empty response from Gemini API');
      throw new Error('Empty response from AI');
    }

    console.log('📤 Sending response back to client:', { contentLength: response ? response.length : 0 });

    res.status(200).json({ generatedContent: response });
  } catch (error) {
    console.error('❌ API Error:', error.message);
    console.error('❌ Error details:', {
      name: error.name,
      code: error.code,
      status: error.status,
      response: error.response?.data || 'No response data',
      stack: error.stack
    });
    res.status(503).json({ error: 'Failed to generate content. Please try again later.', details: error.message });
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

    if (req.file && !file_url) {
      try {
        const fileExt = req.file.originalname.split('.').pop();
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `modules/${req.user.id}/${uniqueFileName}`;

        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const moduleFilesBucket = buckets.find(bucket => bucket.name === 'module-files');

          if (!moduleFilesBucket) {
            await supabase.storage.createBucket('module-files', {
              public: true,
              allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
              fileSizeLimit: 10485760
            });
          }
        } catch (bucketError) {
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('module-files')
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`File upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('module-files')
          .getPublicUrl(filePath);

        file_url = publicUrl;
        file_name = req.file.originalname;

      } catch (fileError) {
        file_url = null;
        file_name = null;
      }
    }

    // ✅ FIXED: Changed 'fullName' to 'fullname' in SELECT query
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, fullname')
      .eq('id', req.user.id)
      .single();

    let uploaderName = 'Anonymous';

    // ✅ FIXED: Changed profileData?.fullName to profileData?.fullname
    if (profileData?.fullname) {
      uploaderName = profileData.fullname;
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
    }

    const { data, error } = await supabase
      .from('modules')
      .insert([insertData])
      .select();

    if (error) {
      if (file_url && file_url.includes('module-files')) {
        try {
          const filePath = file_url.split('/module-files/')[1];
          await supabase.storage.from('module-files').remove([filePath]);
        } catch (cleanupError) {
        }
      }

      throw error;
    }

    res.status(200).json({
      message: 'Module uploaded successfully',
      data: {
        ...data[0],
        uploadedBy: uploaderName,
        uploadedAt: data[0].created_at
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Upload failed: ' + error.message,
      details: error.stack
    });
  }
});

app.get('/get-modules', authenticateToken, async (req, res) => {
  try {
    const { show_all } = req.query;

    let query = supabase.from('modules').select('*');

    if (!show_all || show_all !== 'true') {
      query = query.eq('user_id', req.user.id);
    }

    const { data: modulesData, error: modulesError } = await query
      .order('created_at', { ascending: false });

    if (modulesError) {
      throw modulesError;
    }

    const userIds = [...new Set(modulesData.map(m => m.user_id))];

    // ✅ FIXED: Changed 'fullName' to 'fullname' in SELECT query
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, fullname')
      .in('id', userIds);

    const profilesMap = new Map();
    profilesData?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    const modules = modulesData.map(module => {
      const profile = profilesMap.get(module.user_id);

      let uploaderName = 'Unknown User';
      if (module.user_id === req.user.id) {
        uploaderName = 'You';
      } else if (module.uploaded_by) {
        uploaderName = module.uploaded_by;
      } else if (profile?.fullname) { // ✅ FIXED: Changed fullName to fullname
        uploaderName = profile.fullname;
      } else if (profile?.username) {
        uploaderName = profile.username;
      }

      return {
        ...module,
        uploadedAt: module.created_at,
        uploadedBy: uploaderName,
        isOwn: module.user_id === req.user.id
      };
    });

    res.status(200).json({
      modules,
      showingAll: show_all === 'true',
      totalCount: modules.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get modules: ' + error.message });
  }
});

// ✅ Get user profile
app.get('/get-user-profile', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.status(200).json({
      profile: data
        ? {
            id: data.id,
            email: data.email,
            username: data.username,
            fullName: data.fullname, // map snake_case → camelCase
            pfpUrl: data.pfpurl      // map snake_case → camelCase
          }
        : {
            id: req.user.id,
            email: req.user.email,
            username: '',
            fullName: '',
            pfpUrl: ''
          }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});


// ✅ Sync user profile
app.post('/sync-user-profile', authenticateToken, async (req, res) => {
  try {
    const { username, fullName, pfpUrl } = req.body; // camelCase from frontend

    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: req.user.id,
        email: req.user.email,
        username: username || '',
        fullname: fullName || '', // save to DB as snake_case
        pfpurl: pfpUrl || '',     // save to DB as snake_case
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) throw error;

    // return camelCase to frontend
    res.status(200).json({
      message: 'Profile updated successfully',
      profile: {
        id: data[0].id,
        email: data[0].email,
        username: data[0].username,
        fullName: data[0].fullname,
        pfpUrl: data[0].pfpurl
      }
    });
  } catch (error) {
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
      } catch (fileError) {
      }
    }

    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (error) {
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
    res.status(500).json({ error: 'Failed to get your modules' });
  }
});

app.get('/get-saved-modules', authenticateToken, async (req, res) => {
  try {
    const { data: savedData, error: savedError } = await supabase
      .from('save_modules')
      .select('module_id, saved_at')
      .eq('user_id', req.user.id)
      .order('saved_at', { ascending: false });

    if (savedError) {
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
      throw modulesError;
    }

    const userIds = [...new Set(modulesData.map(m => m.user_id))];
    // ✅ FIXED: Changed 'fullName' to 'fullname' in SELECT query
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, fullname')
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
        } else if (profile?.fullname) { // ✅ FIXED: Changed fullName to fullname
          uploaderName = profile.fullname;
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

    res.status(200).json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get saved modules: ' + error.message });
  }
});

app.post('/save-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({ error: 'Module ID is required' });
    }

    const { data: moduleExists, error: checkError } = await supabase
      .from('modules')
      .select('id, title')
      .eq('id', module_id)
      .single();

    if (checkError || !moduleExists) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const { data: alreadySaved, error: savedCheckError } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', req.user.id)
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
        user_id: req.user.id,
        module_id: module_id,
        saved_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Module saved successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save module: ' + error.message });
  }
});

app.post('/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({ error: 'Module ID is required' });
    }

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
      return res.status(200).json({ message: 'Module was not saved' });
    }

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', req.user.id)
      .eq('module_id', module_id);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'Module unsaved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unsave module: ' + error.message });
  }
});

app.get('/api/analytics/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [uploadedRes, savedRes] = await Promise.all([
      supabase.from('modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);

    if (uploadedRes.error || savedRes.error) {
      throw new Error(uploadedRes.error?.message || savedRes.error?.message);
    }

    res.status(200).json({
      modulesUploaded: uploadedRes.count || 0,
      modulesSaved: savedRes.count || 0
    });
  } catch (error) {
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
    res.status(500).json({
      error: 'Failed to get debug info',
      details: error.message
    });
  }
});

app.post('/api/fix-null-profiles', async (req, res) => {
  try {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    // ✅ FIXED: Changed 'fullName.is.null,fullName.eq.' to 'fullname.is.null,fullname.eq.'
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .or('fullname.is.null,fullname.eq.');

    if (profilesError) throw profilesError;

    let fixedCount = 0;

    for (const profile of profiles) {
      const authUser = users.find(u => u.id === profile.id);

      if (authUser) {
        const userMetadata = authUser.user_metadata || {};

        let fullname = userMetadata.full_name ||
                      userMetadata.name;

        if (!fullname && authUser.email) {
          const emailPart = authUser.email.split('@')[0];
          fullname = emailPart.split('.').map(part =>
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          ).join(' ');
        }

        const username = userMetadata.first_name ||
                        fullname?.split(' ')[0] ||
                        authUser.email?.split('@')[0];

        if (fullname) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              fullname: fullname,   // ✅ FIXED: Changed from fullName
              username: username,
              pfpurl: userMetadata.avatar_url || profile.pfpurl || '', // ✅ FIXED: Changed from pfpUrl
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id);

          if (!updateError) {
            fixedCount++;
          }
        }
      }
    }

    res.status(200).json({
      message: `Successfully fixed ${fixedCount} NULL profiles`,
      fixedCount,
      totalProfiles: profiles.length
    });

  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'EduRetrieve backend is running!',
    version: '2.3.1-column-names-fixed',
    timestamp: new Date().toISOString(),
    status: 'Column name mismatches resolved - fullName->fullname, pfpUrl->pfpurl',
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
      'GET /get-modules - Get user\'s own modules (use ?show_all=true for all)',
      'GET /browse-all-modules - Browse all public modules',
      'GET /get-my-modules - Get user\'s own modules (dedicated endpoint)',
      'GET /get-saved-modules - Get saved modules',
      'POST /api/save-module - Save a module',
      'POST /api/unsave-module - Unsave a module',
      'POST /save-module - Save a module (legacy endpoint)',
      'POST /unsave-module - Unsave a module (legacy endpoint)',
      'GET /get-user-profile - Get user profile',
      'POST /sync-user-profile - Update user profile',
      'DELETE /delete-module/:id - Delete module',
      'GET /api/analytics/:userId - Get user analytics',
      'GET /debug/table-structure - Debug table structure'
    ],
    fixes_applied: [
      'All fullName references changed to fullname',
      'All pfpUrl references changed to pfpurl',
      'Database column names now match code references',
      'Profile creation and updates should work correctly'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Google OAuth Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`Gmail configured: ${process.env.GMAIL_USER || 'judeserafica@gmail.com'}`);
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'}`);
  console.log('');
  console.log('FIXES APPLIED:');
  console.log('   ✅ All fullName references changed to fullname');
  console.log('   ✅ All pfpUrl references changed to pfpurl');
  console.log('   ✅ Database column names now match code references');
  console.log('   ✅ Profile creation and updates should work correctly');
  console.log('   ✅ SELECT queries use correct column names');
  console.log('   ✅ INSERT and UPDATE operations use correct column names');
  console.log('');
  console.log('Available endpoints:');
  console.log('   Authentication:');
  console.log('     POST /api/auth/google/signup');
  console.log('     POST /api/auth/google/callback');
  console.log('     POST /api/auth/verify-signup-code');
  console.log('');
  console.log('   Modules:');
  console.log('     POST /upload-module');
  console.log('     GET  /get-modules');
  console.log('     GET  /get-my-modules');
  console.log('     GET  /get-saved-modules');
  console.log('     POST /api/save-module (new)');
  console.log('     POST /api/unsave-module (new)');
  console.log('     POST /save-module (legacy)');
  console.log('     POST /unsave-module (legacy)');
  console.log('');
  console.log('   Analytics & Profile:');
  console.log('     GET  /api/analytics/:userId');
  console.log('     GET  /get-user-profile');
  console.log('     POST /sync-user-profile');
});