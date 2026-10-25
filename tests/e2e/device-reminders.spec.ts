import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed, fromKey } from "../../src/lib/data";

const storageKey = "kinfolk-planner-v1";
const preferencesKey = "kinfolk-device-reminders:alex";

test.beforeEach(async ({ page }) => {
  const seed = createSeed(fromKey("2026-10-25"));
  seed.events = [];
  seed.tasks = [];
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [storageKey, JSON.stringify(seed)],
  );
});

async function mockNotifications(
  page: Page,
  initial: NotificationPermission = "default",
  answer: NotificationPermission = "granted",
) {
  await page.addInitScript(
    ({ initial, answer }) => {
      const state = window as typeof window & {
        shownNotifications: { title: string; options?: NotificationOptions }[];
        permissionRequests: number;
      };
      state.shownNotifications = [];
      state.permissionRequests = 0;
      let permission = initial;
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => permission,
      });
      Notification.requestPermission = async () => {
        state.permissionRequests++;
        permission = answer;
        return permission;
      };
      ServiceWorkerRegistration.prototype.showNotification = async function (
        title,
        options,
      ) {
        state.shownNotifications.push({ title, options });
      };
    },
    { initial, answer },
  );
}

async function shown(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          shownNotifications: {
            title: string;
            options?: NotificationOptions;
          }[];
        }
      ).shownNotifications,
  );
}

test("device reminders can be enabled, tested, persisted and turned off", async ({
  page,
}) => {
  await mockNotifications(page);
  await page.goto("/#overview");
  await page.getByRole("button", { name: "See today’s reminders" }).click();
  await page
    .getByRole("button", { name: "Notification settings", exact: true })
    .click();
  const settings = page.getByRole("region", { name: "Device notifications" });
  await expect(
    settings.getByRole("heading", { name: "Device reminders" }),
  ).toBeVisible();
  await expect(settings).toContainText("while the planner is open");
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(0);
  await settings.getByLabel("Before an event").selectOption("30");
  await settings.getByLabel("Remind me about").selectOption("family");
  await settings.getByLabel("Chore reminder time").fill("10:15");
  await settings.getByLabel("Reminder time zone").fill("Pacific/Auckland");
  await settings.getByRole("button", { name: "Enable on this device" }).click();
  await expect(
    settings.getByRole("button", { name: "Save reminder settings" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(1);
  await settings
    .getByRole("button", { name: "Send test notification" })
    .click();
  await expect.poll(() => shown(page)).toHaveLength(1);
  expect((await shown(page))[0].title).toBe("Kinfolk reminders are working");
  await expect(page.locator(".toast")).toContainText(
    "Test notification sent",
  );
  const axe = await new AxeBuilder({ page })
    .include("#phone-reminders")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.reload();
  await expect(settings.getByLabel("Before an event")).toHaveValue("30");
  await expect(settings.getByLabel("Remind me about")).toHaveValue("family");
  await expect(settings.getByLabel("Chore reminder time")).toHaveValue("10:15");
  await expect(settings.getByLabel("Reminder time zone")).toHaveValue(
    "Pacific/Auckland",
  );
  await settings.getByLabel("Reminder time zone").fill("Invalid/Zone");
  await settings.getByRole("button", { name: "Turn off reminders" }).click();
  await expect(
    settings.getByRole("button", { name: "Enable on this device" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).enabled,
      preferencesKey,
    ),
  ).toBe(false);
});

test("due events and chores notify once, including after reloading", async ({
  page,
}) => {
  await mockNotifications(page, "granted");
  await page.clock.setFixedTime(new Date("2026-10-25T08:44:00Z"));
  await page.addInitScript((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    data.events = [
      {
        id: "reminder-event",
        title: "Morning appointment",
        date: "2026-10-25",
        start: "09:00",
        end: "09:30",
        memberIds: ["alex"],
        repeat: "none",
        category: "Appointment",
        location: "Town clinic",
        notes: "",
      },
    ];
    data.tasks = [
      {
        id: "reminder-chore",
        title: "Pack school bags",
        due: "2026-10-25",
        memberId: "alex",
        done: false,
        priority: "normal",
      },
    ];
    localStorage.setItem(key, JSON.stringify(data));
  }, storageKey);
  await page.goto("/#settings");
  const settings = page.getByRole("region", { name: "Device notifications" });
  await settings.getByLabel("Reminder time zone").fill("UTC");
  await settings.getByLabel("Chore reminder time").fill("08:45");
  await settings.getByRole("button", { name: "Enable on this device" }).click();
  await expect(
    settings.getByRole("button", { name: "Save reminder settings" }),
  ).toBeVisible();
  expect(await shown(page)).toHaveLength(0);
  await page.clock.setFixedTime(new Date("2026-10-25T08:45:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => shown(page)).toHaveLength(2);
  expect((await shown(page)).map((item) => item.title)).toEqual([
    "Morning appointment",
    "1 chore to do",
  ]);
  expect((await shown(page))[0].options?.data.url).toBe("/#calendar");
  await page.reload();
  await expect(
    settings.getByRole("button", { name: "Save reminder settings" }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Send test notification" })
    .click();
  // The test arrives after the same service-worker delivery path has finished;
  // the due event and chore must not be sent again on this reload.
  await expect.poll(() => shown(page)).toHaveLength(1);
  expect((await shown(page))[0].title).toBe("Kinfolk reminders are working");
});

test("denied permission explains the problem without enabling reminders", async ({
  page,
}) => {
  await mockNotifications(page, "default", "denied");
  await page.goto("/#settings");
  const settings = page.getByRole("region", { name: "Device notifications" });
  await settings.getByRole("button", { name: "Enable on this device" }).click();
  await expect(settings.getByRole("alert")).toContainText(
    "Notifications were not allowed",
  );
  await expect(
    settings.getByRole("button", { name: "Enable on this device" }),
  ).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preferencesKey),
  ).toBeNull();
  expect(await shown(page)).toHaveLength(0);
});
