const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://dcepfndjsmktrfcelvgs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

// 🔐 Middleware to verify Supabase Auth token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData?.user) {
      console.warn('🚫 Invalid token:', error?.message || 'No user found');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Extract basic info
    const { id, email, role, user_metadata } = userData.user;

    req.user = {
      id,
      email,
      role,
      ...(user_metadata || {}),
    };

    console.log('✅ Authenticated user:', req.user);

    next();
  } catch (err) {
    console.error('❌ Token verification crashed:', err);
    return res.status(500).json({ error: 'Internal token verification error' });
  }
};

module.exports = authenticateToken;
