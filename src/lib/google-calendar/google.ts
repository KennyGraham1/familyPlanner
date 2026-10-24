import type { GoogleEvent } from "./events";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];
export type GoogleCalendar = {
  id: string;
  summary: string;
  timeZone: string;
  accessRole: string;
  primary?: boolean;
};
export class GoogleError extends Error {
  constructor(public status: number) {
    super(`Google Calendar request failed (${status})`);
  }
}
export async function googleJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new GoogleError(response.status);
  return response.status === 204 ? null : response.json();
}
export interface CalendarApi {
  listEvents(calendar: string): Promise<GoogleEvent[]>;
  getEvent(calendar: string, id: string): Promise<GoogleEvent | null>;
  insertEvent(
    calendar: string,
    event: Record<string, unknown>,
  ): Promise<GoogleEvent>;
  patchEvent(
    calendar: string,
    id: string,
    event: Record<string, unknown>,
    etag: string,
  ): Promise<GoogleEvent>;
  deleteEvent(calendar: string, id: string, etag: string): Promise<void>;
}
export class GoogleApi implements CalendarApi {
  constructor(private accessToken: string) {}
  private request(path: string, init: RequestInit = {}) {
    return googleJson(`https://www.googleapis.com/calendar/v3/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  }
  async calendars(): Promise<GoogleCalendar[]> {
    const result: GoogleCalendar[] = [];
    let page = "";
    do {
      const params = new URLSearchParams({
        minAccessRole: "writer",
        maxResults: "250",
      });
      if (page) params.set("pageToken", page);
      const data = await this.request(`users/me/calendarList?${params}`);
      result.push(...(data.items ?? []));
      if (result.length > 1000) throw new Error("Too many calendars");
      page = data.nextPageToken ?? "";
    } while (page);
    return result;
  }
  async calendar(id: string): Promise<GoogleCalendar> {
    return this.request(`users/me/calendarList/${encodeURIComponent(id)}`);
  }
  private eventsPath(calendar: string) {
    return `calendars/${encodeURIComponent(calendar)}/events`;
  }
  async listEvents(calendar: string): Promise<GoogleEvent[]> {
    const result: GoogleEvent[] = [];
    let page = "";
    // Complete snapshots avoid treating a partial page or expired cursor as deletions.
    do {
      const params = new URLSearchParams({
        maxResults: "2500",
        showDeleted: "true",
        singleEvents: "false",
      });
      if (page) params.set("pageToken", page);
      const data = await this.request(`${this.eventsPath(calendar)}?${params}`);
      result.push(...(data.items ?? []));
      if (result.length > 10000)
        throw new Error(
          "This calendar is too large. Choose a smaller family calendar.",
        );
      page = data.nextPageToken ?? "";
    } while (page);
    return result;
  }
  async getEvent(calendar: string, id: string): Promise<GoogleEvent | null> {
    try {
      return await this.request(
        `${this.eventsPath(calendar)}/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      if (error instanceof GoogleError && [404, 410].includes(error.status))
        return null;
      throw error;
    }
  }
  insertEvent(
    calendar: string,
    event: Record<string, unknown>,
  ): Promise<GoogleEvent> {
    return this.request(`${this.eventsPath(calendar)}?sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify(event),
    });
  }
  patchEvent(
    calendar: string,
    id: string,
    event: Record<string, unknown>,
    etag: string,
  ): Promise<GoogleEvent> {
    return this.request(
      `${this.eventsPath(calendar)}/${encodeURIComponent(id)}?sendUpdates=none`,
      {
        method: "PATCH",
        headers: { "If-Match": etag },
        body: JSON.stringify(event),
      },
    );
  }
  async deleteEvent(calendar: string, id: string, etag: string) {
    try {
      await this.request(
        `${this.eventsPath(calendar)}/${encodeURIComponent(id)}?sendUpdates=none`,
        {
          method: "DELETE",
          headers: { "If-Match": etag },
        },
      );
    } catch (error) {
      if (!(error instanceof GoogleError && [404, 410].includes(error.status)))
        throw error;
    }
  }
}
