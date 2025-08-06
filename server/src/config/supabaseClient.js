const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  'https://zjlxodaineyvdsgpjbxo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqbHhvZGFpbmV5dmRzZ3BqYnhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQ0OTk0NCwiZXhwIjoyMDcwMDI1OTQ0fQ.a3B1TbI1iGBLDZSNggOeYgE4PAdROPRVkB7JIixQudI'
);

module.exports = { supabase };
