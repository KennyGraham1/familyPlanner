import { createHash } from "node:crypto";
import { dataSchema } from "./data";
import { calendarFile } from "./ics";

/** Hash stored for a calendar link; matches encode(digest(token, 'sha256'), 'hex'). */
export const feedHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/**
 * The calendar file behind a private link, for Apple Calendar and other apps.
 * `lookup` returns the family's plans for a link hash, or null if it's off.
 */
export async function feedResponse(
  token: string,
  lookup: (hash: string) => Promise<unknown>,
) {
  const headers = { "Cache-Control": "private, max-age=300" };
  const id = token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{64}$/.test(id))
    return new Response("Calendar link not found.", { status: 404, headers });
  const found = await lookup(feedHash(id));
  if (!found)
    return new Response("This calendar link was turned off.", {
      status: 404,
      headers,
    });
  const data = dataSchema.safeParse(found);
  if (!data.success)
    return new Response("This calendar can't be read right now.", {
      status: 503,
      headers,
    });
  return new Response(
    calendarFile(data.data.events, {
      name: `Kinfolk · ${data.data.settings.familyName}`,
    }),
    {
      headers: {
        ...headers,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="kinfolk.ics"',
      },
    },
  );
}
