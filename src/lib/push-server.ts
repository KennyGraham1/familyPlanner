import { timingSafeEqual, createECDH } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export function pushConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const cronSecret = process.env.CRON_SECRET;
  if (
    !url ||
    !key ||
    !publicKey ||
    !privateKey ||
    !subject ||
    !cronSecret ||
    cronSecret.length < 32
  )
    return null;
  if (!/^https:\/\/|^mailto:/.test(subject)) return null;
  try {
    const contact = new URL(subject);
    if (!["https:", "mailto:"].includes(contact.protocol)) return null;
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(privateKey, "base64url"));
    const expected = curve.getPublicKey();
    const actual = Buffer.from(publicKey, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
      return null;
  } catch {
    return null;
  }
  return { url, key, publicKey, privateKey, subject, cronSecret };
}
export function validCronAuthorization(header: string | null, secret: string) {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function pushDatabase(
  config: NonNullable<ReturnType<typeof pushConfiguration>>,
) {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
