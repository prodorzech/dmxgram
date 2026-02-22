import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ablmfqqlpbvppviwozxa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibG1mcXFscGJ2cHB2aXdvenhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYwMjQ0OSwiZXhwIjoyMDg3MTc4NDQ5fQ._pQagB_5-qVN6Wz13DAROhL1BbDTiMNedfwJSixM03E',
  { auth: { persistSession: false } }
);

const sql = `CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
)`;

// Try supabase.sql tagged template literal (v2.46+)
try {
  const result = await supabase.sql`CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id UUID NOT NULL,
    blocked_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
  )`;
  if (result.error) {
    console.log('sql tag error:', result.error.message);
  } else {
    console.log('✅ user_blocks table created via supabase.sql');
  }
} catch(e) {
  console.log('sql tag exception:', e.message);
  
  // Fallback: try inserting a dummy row to see if table exists
  const { error: checkErr } = await supabase.from('user_blocks').select('blocker_id').limit(1);
  if (checkErr) {
    console.log('Table does not exist:', checkErr.message);
    console.log('Please create manually in Supabase dashboard SQL editor:');
    console.log(sql);
  } else {
    console.log('✅ user_blocks table already exists');
  }
}
