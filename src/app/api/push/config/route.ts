import { pushConfiguration } from "@/lib/push-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = pushConfiguration();
  return Response.json(
    { configured: Boolean(config), publicKey: config?.publicKey ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
