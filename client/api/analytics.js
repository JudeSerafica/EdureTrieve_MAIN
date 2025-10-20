import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

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
    // Get user analytics
    if (req.method === 'GET' && pathname.startsWith('/api/analytics/')) {
      const userId = pathname.split('/api/analytics/')[1];

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
      }

      const [
        { count: modulesUploaded },
        { count: modulesSaved }
      ] = await Promise.all([
        supabase.from('modules').select('*', { count: 'exact', head: true }).eq('uploadedBy', userId),
        supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      ]);

      res.status(200).json({
        modulesUploaded: modulesUploaded || 0,
        modulesSaved: modulesSaved || 0
      });
    }

    else {
      res.status(404).json({ error: 'Analytics endpoint not found' });
    }

  } catch (error) {
    console.error('Analytics API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}