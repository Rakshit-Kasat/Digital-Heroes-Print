/** Browser Supabase client (public key + the user's session cookie). Used for direct-to-storage uploads. */
import { createBrowserClient } from "@supabase/ssr";

export function browserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
