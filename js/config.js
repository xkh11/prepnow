/* ============================================
   PrepNow Configuration

   The Supabase URL and anon key below are SAFE to expose in the browser —
   the database is protected by Row Level Security, so the anon key can only
   do what your RLS policies allow. They must be present for the app to work.

   The OpenAI API key is intentionally NOT here. It lives as a server-side
   secret inside the Supabase Edge Function "openai-proxy"
   (see supabase/functions/openai-proxy and the README). The browser calls
   that function and never sees the key.
   ============================================ */

const CONFIG = {
    // ── Supabase (public — protected by Row Level Security) ──
    SUPABASE_URL: 'https://zkqqynjslsxdfsocgfvb.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprcXF5bmpzbHN4ZGZzb2NnZnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzM2MDUsImV4cCI6MjA5MDE0OTYwNX0.2k0HjHn-h1vXpgae7ZYcItb_CEnc8bVwJSfcxF2ates'
};
