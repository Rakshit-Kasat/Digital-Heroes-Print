/**
 * Supabase clients. Which one to use:
 *  - serverClient(): acts AS THE SIGNED-IN USER (reads the auth cookie), so
 *    Row Level Security decides what it can see. Default for pages/actions.
 *  - adminClient(): service role, BYPASSES RLS. Server-only, used for
 *    trusted work after we have checked permissions ourselves (payments,
 *    file generation, emails). Never imported by client components.
 *  - publicClient(): anonymous, no cookies. Safe inside 'use cache' for the
 *    public catalogue (cache entries must not depend on who is asking).
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function serverClient() {
  const store = await cookies();
  return createServerClient(URL_, PUBLIC_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component (read-only cookies): proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  admin ??= createClient(URL_, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export function publicClient(): SupabaseClient {
  return createClient(URL_, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
