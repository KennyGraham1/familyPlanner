import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const cloudConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && publicKey,
);
export function getCloud() {
  if (!cloudConfigured) return null;
  if (!client)
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publicKey!);
  return client;
}
