import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed } from "../../src/lib/data";

const storage = "kinfolk-planner-v1";
// New visitors start with an empty family; these tests use the sample family as a fixture.
// Only seed when nothing is stored, so reloads keep the changes a test made.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      } catch {
        // Frames without storage access (such as about:blank) have nothing to seed.
      }
    },
    [storage, JSON.stringify(createSeed())],
  );
});
async function go(page: Page, view: string) {
  await page.goto(`/#${view}`);
  await expect(page.locator("main h1")).toBeVisible();
}
async function saved(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    storage,
  );
}

test("dashboard loads its artwork and stays within the viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page, "overview");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^Good (morning|afternoon|evening), /,
    }),
  ).toBeVisible();
  await expect(page.locator(".welcome-art img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (img) =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("create, edit, persist and delete a recurring family event", async ({
  page,
}) => {
  await go(page, "calendar");
  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What's happening?").fill("Swimming with the family");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-10-08");
  await dialog.getByLabel("Starts at").fill("14:00");
  await dialog.getByLabel("Ends at").fill("15:00");
  await dialog.getByLabel("Where?").fill("Community pool");
  await dialog.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await dialog.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  expect(
    (await saved(page)).events.find(
      (e: { title: string }) => e.title === "Swimming with the family",
    )?.repeat,
  ).toBe("weekly");
  await page.getByRole("button", { name: "Search family planner" }).click();
  await page.getByLabel("Search your family planner").fill("Swimming");
  await page.getByRole("button", { name: /Swimming with the family/ }).click();
  await dialog.getByLabel("What's happening?").fill("Swimming lesson");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await saved(page)).events.some(
      (e: { title: string }) => e.title === "Swimming lesson",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Search family planner" }).click();
  await page.getByLabel("Search your family planner").fill("Swimming lesson");
  await page.getByRole("button", { name: /Swimming lesson/ }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await saved(page)).events.some(
      (e: { title: string }) => e.title === "Swimming lesson",
    ),
  ).toBe(false);
});

test("invalid event times are explained and Escape closes the form", async ({
  page,
}) => {
  await go(page, "calendar");
  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  await page.getByLabel("What's happening?").fill("A backwards event");
  await page.getByLabel("Starts at").fill("15:00");
  await page.getByLabel("Ends at").fill("14:00");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(page.locator(".form-error, .toast.error")).toContainText(
    "End time must be after start time",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("shopping items can be added, filtered, completed and cleared", async ({
  page,
}) => {
  await go(page, "shopping");
  await page.getByLabel("New shopping item").fill("Strawberries for dessert");
  await page
    .locator(".quick-add-form")
    .getByRole("button", { name: "Add item" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Bought Strawberries for dessert" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Bought Strawberries for dessert" })
    .click();
  await page.getByRole("button", { name: "In the bag", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Bought Strawberries for dessert" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Clear bought" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Bought Strawberries for dessert" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  expect(
    (await saved(page)).shopping.some(
      (i: { name: string }) => i.name === "Strawberries for dessert",
    ),
  ).toBe(false);
});

test("meal planning connects recipes to dinner and deduplicates shopping ingredients", async ({
  page,
}) => {
  await go(page, "meals");
  await page
    .locator(".recipe-card")
    .filter({ hasText: "Creamy tomato pasta" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Add missing ingredients to shopping list" })
    .click();
  await expect(page.getByRole("status")).toContainText("4 ingredients added");
  const length = (await saved(page)).shopping.length;
  await dialog
    .getByRole("button", { name: "Add missing ingredients to shopping list" })
    .click();
  await expect(page.getByRole("status")).toContainText("already have");
  expect((await saved(page)).shopping.length).toBe(length);
  await dialog.getByLabel("Which day?").fill("2026-10-09");
  await dialog.getByRole("button", { name: "Add to meal plan" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await saved(page)).meals.find(
      (m: { date: string }) => m.date === "2026-10-09",
    )?.recipeId,
  ).toBe("pasta");
});

test("chores use the selected family member and keep completion after reload", async ({
  page,
}) => {
  await go(page, "chores");
  const column = page.locator(".chore-column").filter({
    has: page.getByRole("heading", { name: "Sophie", exact: true }),
  });
  await column.getByRole("button", { name: "Add a chore" }).click();
  await expect(page.getByLabel("Who’s on it?")).toHaveValue("sophie");
  await page.getByLabel("What needs doing?").fill("Tidy the reading corner");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add chore", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Complete Tidy the reading corner" })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Complete Tidy the reading corner" }),
  ).toBeChecked();
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  const task = (await saved(page)).tasks.find(
    (t: { title: string }) => t.title === "Tidy the reading corner",
  );
  expect(task.done).toBe(true);
  expect(task.memberId).toBe("sophie");
});

test("family notes and preferences can be personalised", async ({ page }) => {
  await go(page, "board");
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await page
    .getByLabel("Give your note a title")
    .fill("Our Saturday adventure");
  await page
    .getByLabel("What would you like to share?")
    .fill("Let’s bring a picnic to the park.");
  await page.getByLabel("Pin this to the top of the board").check();
  await page.getByRole("button", { name: "Add family note" }).click();
  await expect(
    page.getByRole("heading", { name: "Our Saturday adventure" }),
  ).toBeVisible();
  await go(page, "settings");
  await page
    .getByLabel("Your family space", { exact: true })
    .fill("The Green family");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.reload();
  await expect(
    page.getByLabel("Your family space", { exact: true }),
  ).toHaveValue("The Green family");
  await page.getByRole("button", { name: "Add a member", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Charlie");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add family member", exact: true })
    .click();
  await expect(
    page.locator(".settings-members").getByRole("button", { name: /Charlie/ }),
  ).toBeVisible();
});

test("backup download, clear and restore preserve family plans", async ({
  page,
}) => {
  await go(page, "settings");
  await page.getByRole("button", { name: "Save preferences" }).click();
  const original = await saved(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^kinfolk-backup-/,
  );
  await page.getByRole("button", { name: "Clear plans", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear all plans", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).events.length).toBe(0);
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(
    page.getByRole("heading", { name: "Restore your family backup?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).events.length).toBe(original.events.length);
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.locator(".form-error, .toast.error")).toContainText(
    "not a valid Kinfolk backup",
  );
  expect((await saved(page)).events.length).toBe(original.events.length);
});

test("all views fit mobile, navigation works, and keyboard focus stays in dialogs", async ({
  page,
  isMobile,
}) => {
  for (const view of [
    "overview",
    "calendar",
    "meals",
    "shopping",
    "chores",
    "board",
    "settings",
  ]) {
    await go(page, view);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
      view,
    ).toBe(true);
  }
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Family calendar" }),
    ).toBeVisible();
    expect(
      await page
        .locator(".sidebar")
        .evaluate((e) => e.classList.contains("mobile-open")),
    ).toBe(false);
  }
  await page.getByRole("button", { name: "Search family planner" }).click();
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("dashboard meets automated WCAG AA accessibility checks", async ({
  page,
}) => {
  await go(page, "overview");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("corrupt local data is preserved until a valid backup is restored", async ({
  page,
}) => {
  await go(page, "settings");
  await page.getByRole("button", { name: "Save preferences" }).click();
  const original = await saved(page);
  await page.evaluate(
    (key) => localStorage.setItem(key, "{broken-data"),
    storage,
  );
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator(".toast.error")).toContainText("needs recovery");
  expect(await page.evaluate((key) => localStorage.getItem(key), storage)).toBe(
    "{broken-data",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page
    .getByLabel("Your family space", { exact: true })
    .fill("Recovered family");
  await page.getByRole("button", { name: "Save preferences" }).click();
  expect((await saved(page)).settings.familyName).toBe("Recovered family");
});
