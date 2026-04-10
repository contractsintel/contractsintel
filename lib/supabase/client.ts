import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// CRITICAL: Cache the browser client as a module-level singleton.
// Callers write `const supabase = createClient()` at component top level and
// then put `supabase` into useCallback/useEffect deps. If this function
// returned a NEW client on every call, every render would produce a new
// reference, loadData would be recreated, the effect would refire, setState
// would trigger a re-render — an infinite loop that manifests as the
// dashboard getting stuck on "Loading..." forever.
let cached: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  cached = createBrowserClient(url, key);
  return cached;
}
