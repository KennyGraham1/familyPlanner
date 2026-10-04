import { test, expect, type Page, type Route } from "@playwright/test";
import { applyMutation, createSeed, type Mutation } from "../../src/lib/data";
import { CLOUD_SUPABASE } from "../../playwright.config";

// A signed-in family, with these tests playing the part of Supabase.
const user = "00000000-0000-4000-8000-0000000000a1";
const household = "00000000-0000-4000-8000-0000000000f1";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = {
  access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user, exp: expires, role: "authenticated", email: "sam@example.com", aud: "authenticated" })}.signature`,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: expires,
  refresh_token: "refresh",
  user: {
    id: user,
    aud: "authenticated",
    role: "authenticated",
    email: "sam@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};

class FakeSupabase {
  plan = createSeed();
  /** Requests to fail as if the connection dropped; Infinity means it's down. */
  failNext = 0;
  async handle(route: Route) {
    if (this.failNext > 0) {
      this.failNext--;
      return route.abort("failed");
    }
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/planner_get_context"))
      return route.fulfill({
        json: {
          household_id: household,
          owner_id: user,
          member_id: this.plan.settings.currentMemberId,
          updated_at: new Date().toISOString(),
          access: [
            {
              user_id: user,
              member_id: this.plan.settings.currentMemberId,
              name: "Alex",
              is_owner: true,
            },
          ],
          data: this.plan,
        },
      });
    if (path.endsWith("/rpc/planner_apply_changes")) {
      const { changes } = route.request().postDataJSON() as {
        changes: Mutation[];
      };
      this.plan = changes.reduce(applyMutation, this.plan);
      return route.fulfill({ json: this.plan });
    }
    if (path.startsWith("/auth/v1/user"))
      return route.fulfill({ json: session.user });
    return route.fulfill({ json: [] });
  }
}

let supabase: FakeSupabase;
test.beforeEach(async ({ context, page }) => {
  supabase = new FakeSupabase();
  // No live channel here, so the app relies on its regular checks.
  await context.routeWebSocket(/realtime/, () => {});
  await context.route(`${CLOUD_SUPABASE}/**`, (route) =>
    supabase.handle(route),
  );
  await context.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.addInitScript(
    (value) => localStorage.setItem("sb-kinfolktest-auth-token", value),
    JSON.stringify(session),
  );
  await page.goto("/#overview");
  await expect(page.locator("main h1")).toBeVisible();
});
const notice = (page: Page) => page.locator(".connection-notice");
const status = (page: Page) => page.locator(".save-status");
const wakeUp = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("signing out is easy to find", async ({ page }) => {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await expect(page.locator(".signout-nav")).toBeVisible();
});

test("a save on a dropped connection works on the first click", async ({
  page,
}) => {
  await page.goto("/#calendar");
  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What's happening?").fill("Camping");
  await dialog.getByLabel("Several days").check();
  supabase.failNext = 1;
  await dialog.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".toast.error")).toHaveCount(0);
  expect(
    supabase.plan.events.find((e) => e.title === "Camping")?.endDate,
  ).toBeTruthy();
});

test("a brief drop when the phone wakes up shows nothing", async ({ page }) => {
  supabase.failNext = 3; // every attempt of one check
  await wakeUp(page);
  // Watch for a few seconds: the notice must never appear.
  for (let i = 0; i < 12; i++) {
    await expect(notice(page)).toHaveCount(0);
    await page.waitForTimeout(250);
  }
  await expect(status(page)).toContainText("Connected");
});

test("a lasting outage shows a calm notice, which clears by itself", async ({
  page,
}) => {
  test.setTimeout(60000);
  supabase.failNext = Infinity;
  await wakeUp(page);
  await page.waitForTimeout(8000);
  await expect(notice(page)).toHaveCount(0);
  await expect(notice(page)).toContainText("Can’t reach your family space", {
    timeout: 20000,
  });
  await expect(notice(page)).toHaveAttribute("role", "status");
  await expect(notice(page).getByRole("button")).toHaveCount(0);
  await expect(page.locator(".sync-warning")).toHaveCount(0);
  await expect(status(page)).toContainText("Offline");
  supabase.failNext = 0;
  await expect(notice(page)).toHaveCount(0, { timeout: 12000 });
  await expect(status(page)).toContainText("Connected");
});

test("going offline is shown straight away", async ({ context, page }) => {
  await context.setOffline(true);
  await expect(notice(page)).toContainText("You’re offline", { timeout: 2000 });
  await context.setOffline(false);
  await expect(notice(page)).toHaveCount(0, { timeout: 12000 });
});
