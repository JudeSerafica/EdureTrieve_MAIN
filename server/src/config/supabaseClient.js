const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  'https://qzlczoeipplpojxpbsll.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6bGN6b2VpcHBscG9qeHBic2xsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQzMDg4NCwiZXhwIjoyMDcwMDA2ODg0fQ.YxhYqccHYEc9FP1AdcaHXTUDg9jD1kOcQSmoaPaTWXw'
);

module.exports = { supabase };
