import { createClient } from "@supabase/supabase-js";

// Server-side client with service role key — bypasses RLS
// ONLY use this in API routes, never expose to the client
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
