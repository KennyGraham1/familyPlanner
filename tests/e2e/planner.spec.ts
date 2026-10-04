import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed } from "../../src/lib/data";

const storage = "kinfolk-planner-v1";
// New visitors start with an empty family; these tests use the sample family as a fixture.
// Only seed when nothing is stored, so reloads keep the changes a test made.
test.beforeEach(async ({ page }) => {
  // Keep tests offline: no place search results or map tiles unless a test adds them.
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.route("https://www.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
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
      (m: { date: string; slot: string }) =>
        m.date === "2026-10-09" && m.slot === "Dinner",
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

test("removing a family member hands their chores to someone else", async ({
  page,
}) => {
  await go(page, "settings");
  const before = await saved(page);
  const olivers = before.tasks
    .filter((t: { memberId: string }) => t.memberId === "oliver")
    .map((t: { id: string }) => t.id);
  expect(olivers.length).toBeGreaterThan(0);
  await page
    .locator(".settings-members")
    .getByRole("button", { name: /Oliver/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await dialog.getByLabel("Who takes over from Oliver?").selectOption("sophie");
  await dialog.getByRole("button", { name: "Remove Oliver" }).click();
  await expect(dialog).not.toBeVisible();
  const after = await saved(page);
  expect(after.members.map((m: { id: string }) => m.id)).not.toContain(
    "oliver",
  );
  for (const id of olivers)
    expect(after.tasks.find((t: { id: string }) => t.id === id)?.memberId).toBe(
      "sophie",
    );
  await expect(
    page.locator(".settings-members").getByRole("button", { name: /Oliver/ }),
  ).toHaveCount(0);
});

test("yearly and multi-day events show across years", async ({ page }) => {
  await go(page, "calendar");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  await dialog.getByLabel("What's happening?").fill("Gran’s birthday");
  await dialog.getByLabel("All day").check();
  await dialog.getByLabel("Date", { exact: true }).fill("2026-10-20");
  await dialog.getByLabel("Repeat", { exact: true }).selectOption("yearly");
  await dialog.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  await dialog.getByLabel("What's happening?").fill("Beach trip");
  await dialog.getByLabel("Several days").check();
  await dialog.getByLabel("Date", { exact: true }).fill("2026-12-30");
  await dialog.getByLabel("End date").fill("2027-01-02");
  await dialog.getByLabel("Starts at").fill("18:00");
  await dialog.getByLabel("Ends at").fill("14:00");
  await dialog.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  const events = (await saved(page)).events;
  expect(
    events.find((e: { title: string }) => e.title === "Gran’s birthday"),
  ).toMatchObject({ allDay: true, repeat: "yearly", date: "2026-10-20" });
  expect(
    events.find((e: { title: string }) => e.title === "Beach trip"),
  ).toMatchObject({ date: "2026-12-30", endDate: "2027-01-02" });

  await page.getByRole("button", { name: "Year", exact: true }).click();
  await page.getByRole("button", { name: "Next year" }).click();
  await expect(page.locator(".year-grid")).toHaveAttribute(
    "aria-label",
    "2027 at a glance",
  );
  await expect(page.locator('.year-day[title*="Gran’s birthday"]')).toHaveCount(
    1,
  );
  await expect(page.locator('.year-day[title*="Beach trip"]')).toHaveCount(2);

  const jump = page.getByRole("button", { name: /Jump to a month/ });
  await jump.click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Jump to a month" }),
  ).toHaveCount(0);
  await jump.click();
  await page.getByRole("button", { name: "Jan", exact: true }).click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const trip = page.locator(".calendar-event", { hasText: "Beach trip" });
  await expect(trip).toHaveCount(4);
  await expect(trip.nth(0)).toContainText("From 6 pm");
  await expect(trip.nth(2)).toContainText("Day 3 of 4");
  await expect(trip.nth(3)).toContainText("Until 2 pm");
});

test("changes made elsewhere appear without reloading", async ({
  context,
  page,
}) => {
  await go(page, "settings");
  const other = await context.newPage();
  await go(other, "settings");
  const name = (p: Page) => p.getByLabel("Your family space", { exact: true });

  await name(page).fill("The Live family");
  await page.getByRole("button", { name: "Save preferences" }).click();
  // The open form follows the change instead of keeping the old name.
  await expect(name(other)).toHaveValue("The Live family");
  await expect(other.locator(".family-switcher")).toContainText(
    "The Live family",
  );

  await other.evaluate(() => (window.location.hash = "shopping"));
  await go(page, "shopping");
  await page.getByLabel("New shopping item").fill("Live sync milk");
  await page
    .locator(".quick-add-form")
    .getByRole("button", { name: "Add item" })
    .click();
  await expect(
    other.getByRole("checkbox", { name: "Bought Live sync milk" }),
  ).toBeVisible();
});

test("unsaved preference edits are kept while other fields stay live", async ({
  context,
  page,
}) => {
  await go(page, "settings");
  const other = await context.newPage();
  await go(other, "settings");
  // Unsaved change in the second tab.
  await other
    .getByLabel("Your family space", { exact: true })
    .fill("Our draft name");
  await page.getByLabel("Start the week on").selectOption("sunday");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(other.getByLabel("Start the week on")).toHaveValue("sunday");
  await expect(
    other.getByLabel("Your family space", { exact: true }),
  ).toHaveValue("Our draft name");
});

test("event locations can be searched and shown on a map", async ({ page }) => {
  const searches: string[] = [];
  await page.route("https://photon.komoot.io/**", (route) => {
    searches.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [174.7448, -36.8695] },
            properties: {
              osm_type: "W",
              osm_id: 1,
              name: "Oakwood Primary School",
              district: "Kingsland",
              city: "Auckland",
              country: "New Zealand",
            },
          },
          {
            geometry: { coordinates: [174.75, -36.86] },
            properties: {
              osm_type: "N",
              osm_id: 2,
              name: "Oakwood Park",
              city: "Auckland",
              country: "New Zealand",
            },
          },
        ],
      },
    });
  });
  await go(page, "calendar");
  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What's happening?").fill("Assembly");
  const where = dialog.getByRole("combobox", { name: "Where?" });
  await where.pressSequentially("Oakw");
  await expect(
    dialog.getByRole("option", { name: /Oakwood Primary School/ }),
  ).toBeVisible();
  expect(searches.at(-1)).toBe("Oakw");

  // Escape closes the suggestions, not the dialog.
  await where.press("Escape");
  await expect(dialog.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await where.pressSequentially("o");
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(2);
  await where.press("ArrowDown");
  await where.press("Enter");
  await expect(where).toHaveValue(
    "Oakwood Primary School, Kingsland, Auckland",
  );
  await expect(dialog.locator("iframe.place-map")).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open in Maps" }),
  ).toHaveAttribute("href", /destination=-36\.8695%2C174\.7448$/);
  await dialog.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const assembly = (await saved(page)).events.find(
    (e: { title: string }) => e.title === "Assembly",
  );
  expect(assembly).toMatchObject({
    location: "Oakwood Primary School, Kingsland, Auckland",
    place: { lat: -36.8695, lon: 174.7448 },
  });

  // Editing the text afterwards drops the old map position.
  await page.getByRole("button", { name: "Search family planner" }).click();
  await page.getByLabel("Search your family planner").fill("Assembly");
  await dialog.getByRole("button", { name: /Assembly/ }).click();
  await expect(dialog.locator("iframe.place-map")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Where?" }).fill("Gym hall");
  await expect(dialog.locator("iframe.place-map")).toHaveCount(0);
});

test("multi-day dates stay in order while editing", async ({ page }) => {
  await go(page, "calendar");
  await page.getByRole("button", { name: "Add an event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What's happening?").fill("School camp");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-11-10");
  await dialog.getByLabel("Several days").check();
  await expect(dialog.getByLabel("End date")).toHaveValue("2026-11-11");
  await dialog.getByLabel("End date").fill("2026-11-13");
  // Moving the start keeps the camp three days long.
  await dialog.getByLabel("Date", { exact: true }).fill("2026-11-17");
  await expect(dialog.getByLabel("End date")).toHaveValue("2026-11-20");
  await expect(dialog.getByLabel("End date")).toHaveAttribute(
    "min",
    "2026-11-17",
  );
  await dialog.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await saved(page)).events.find(
      (e: { title: string }) => e.title === "School camp",
    ),
  ).toMatchObject({ date: "2026-11-17", endDate: "2026-11-20" });
});
