import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed, fromKey } from "../../src/lib/data";
const storage = "kinfolk-planner-v1";
test.beforeEach(async ({ page }) => {
  const data = createSeed(fromKey("2026-10-26"));
  data.meals = [
    {
      id: "last-week",
      date: "2026-10-19",
      slot: "Dinner",
      recipeId: "pancakes",
    },
  ];
  await page.clock.setFixedTime(new Date("2026-10-26T12:00:00"));
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.addInitScript(
    ({ storage, data }) => {
      if (!localStorage.getItem(storage))
        localStorage.setItem(storage, JSON.stringify(data));
    },
    { storage, data },
  );
});
const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storage);
test("favourite recipes persist, cooking servings scale and meal weeks can be reused", async ({
  page,
}) => {
  await page.goto("/#meals");
  await page.getByLabel("Search recipes").fill("fluffy weekend pancakes");
  const card = page.locator(".recipe-card");
  await card.getByRole("button", { name: /^Favourite/ }).click();
  await expect(
    card.getByRole("button", { name: /^Favourite/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Favourites", exact: true }).click();
  await expect(card).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Favourites", exact: true }).click();
  await expect(card).toHaveCount(1);
  await card.locator(".recipe-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Servings", { exact: true }).fill("8");
  await expect(dialog.locator(".ingredient-list")).toContainText("400 g");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Copy previous week", exact: true })
    .click();
  await expect(dialog).toContainText("Fluffy weekend pancakes");
  await dialog.getByRole("button", { name: "Copy 1 meals" }).click();
  expect((await saved(page)).meals).toContainEqual(
    expect.objectContaining({ date: "2026-10-26", recipeId: "pancakes" }),
  );
  await page.getByRole("button", { name: "Save week as template" }).click();
  await dialog.getByLabel("Template name").fill("School favourites");
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  expect((await saved(page)).mealTemplates[0].name).toBe("School favourites");
  await page.getByRole("button", { name: "Shop this week" }).click();
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog).toContainText("Check your cupboards");
  await dialog.getByRole("button", { name: /Save \d+ ingredients/ }).click();
  await expect(dialog).not.toBeVisible();
});
test("family recipes, pantry and household spending save and survive reload", async ({
  page,
}) => {
  await page.goto("/#meals");
  await page.getByRole("button", { name: "Add family recipe" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Recipe name").fill("Our family rice");
  await dialog
    .getByLabel("Ingredients", { exact: true })
    .fill("Rice | 300 g | Pantry\nTomatoes | 4 | Produce");
  await dialog
    .getByLabel("Method", { exact: true })
    .fill("Wash rice.\nCook rice and tomatoes.");
  await dialog
    .getByRole("button", { name: "Save recipe", exact: true })
    .click();
  await page.getByLabel("Search recipes").fill("family rice");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.goto("/#tools");
  await page.getByRole("button", { name: "Pantry", exact: true }).click();
  await page.getByRole("button", { name: "Add pantry item" }).click();
  await dialog.getByLabel("Item name").fill("Rice");
  await dialog.getByLabel("Amount at home").fill("1 kg");
  await dialog.getByRole("button", { name: "Save pantry item" }).click();
  await expect(page.locator(".tool-card")).toContainText("Rice");
  await page.getByRole("button", { name: "Spending", exact: true }).click();
  await page.getByRole("button", { name: "Add expense" }).click();
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Weekly groceries");
  await dialog.getByLabel("Amount (NZD)").fill("45.90");
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await expect(page.locator(".tool-card")).toContainText("$45.90");
  await page.reload();
  await page.getByRole("button", { name: "Spending", exact: true }).click();
  await expect(page.locator(".tool-card")).toContainText("Weekly groceries");
  expect((await saved(page)).expenses[0].cents).toBe(4590);
  expect((await saved(page)).customRecipes[0].name).toBe("Our family rice");
});
test("event preparation, comments, links and a single moved repeat stay connected", async ({
  page,
}) => {
  await page.goto("/#calendar?event=e2&day=2026-10-26");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("What's happening?")).toHaveValue(
    "Football practice",
  );
  await dialog.getByLabel("Drop-off adult").selectOption("alex");
  await dialog.getByLabel("Pickup adult").selectOption("jamie");
  await dialog.getByLabel("Bring-along checklist").fill("Boots\nWater bottle");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.goto("/#calendar?event=e2&day=2026-10-26");
  await expect(
    dialog.getByText("Drop-off: Alex · Pickup: Jamie"),
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Boots", exact: true }).check();
  await dialog
    .getByLabel("Message", { exact: true })
    .fill("I will bring snacks.");
  await dialog.getByRole("button", { name: "Post comment" }).click();
  await expect(dialog.locator(".event-comments")).toContainText(
    "I will bring snacks.",
  );
  await dialog.getByLabel("Document name").fill("School notice");
  await dialog
    .getByLabel("Document URL")
    .fill("https://example.com/notice.pdf");
  await dialog.getByRole("button", { name: "Attach document link" }).click();
  await expect(
    dialog.getByRole("link", { name: "School notice" }),
  ).toHaveAttribute("href", "https://example.com/notice.pdf");
  await dialog.getByRole("button", { name: "Move this occurrence" }).click();
  await dialog.getByLabel("Date", { exact: true }).fill("2026-10-27");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  const data = await saved(page);
  expect(
    data.events.find((e: { id: string }) => e.id === "e2").excludedDates,
  ).toContain("2026-10-26");
  expect(data.events).toContainEqual(
    expect.objectContaining({
      date: "2026-10-27",
      repeat: "none",
      title: "Football practice",
    }),
  );
});
test("school-day routines support a child view and rewards without duplicate credit", async ({
  page,
}) => {
  await page.goto("/#tools");
  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await page.getByRole("button", { name: "Add routine", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Routine name").fill("Ready for school");
  await dialog.getByLabel("Person", { exact: true }).selectOption("alex");
  await dialog
    .getByLabel("Steps", { exact: true })
    .fill("Brush teeth\nPack lunch");
  await dialog.getByRole("button", { name: "Save routine" }).click();
  await page.getByRole("button", { name: "Shared tablet child view" }).click();
  await page.getByRole("checkbox", { name: "1. Brush teeth" }).check();
  await page.getByRole("checkbox", { name: "2. Pack lunch" }).check();
  await expect(page.locator(".kid-view")).toContainText("one star earned");
  await page.getByRole("button", { name: "Back to family view" }).click();
  await page.getByLabel("Reward", { exact: true }).fill("Choose a movie");
  await page.getByLabel("Stars needed").fill("1");
  await page.getByRole("button", { name: "Add reward goal" }).click();
  await page.getByRole("button", { name: "Request reward" }).click();
  await expect(
    page.getByRole("button", { name: "Waiting for approval" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approved", exact: true }),
  ).toBeDisabled();
  expect((await saved(page)).routineChecks).toHaveLength(1);
  expect((await saved(page)).rewardClaims).toHaveLength(1);
  expect(
    (
      await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
});
test("smart search finds misspellings and event notes, and notice imports require review", async ({
  page,
}) => {
  await page.goto("/#calendar");
  await page.getByRole("button", { name: "Search family planner" }).click();
  await page.getByLabel("Search your family planner").fill("jolof");
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".search-results")).toContainText("jollof");
  await page.getByLabel("Search your family planner").fill("boots");
  await expect(dialog.locator(".search-results")).toContainText(
    "Football practice",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Import school notice" }).click();
  await dialog
    .getByLabel("Notice text")
    .fill("School assembly 5 November 2026 9am–10am");
  await dialog.getByRole("button", { name: "Review proposed events" }).click();
  await expect(dialog.getByLabel("Event date")).toHaveValue("2026-11-05");
  expect(
    (await saved(page)).events.some(
      (e: { date: string }) => e.date === "2026-11-05",
    ),
  ).toBe(false);
  await dialog.getByRole("button", { name: "Save reviewed events" }).click();
  expect((await saved(page)).events).toContainEqual(
    expect.objectContaining({
      title: "School assembly",
      date: "2026-11-05",
      start: "09:00",
      end: "10:00",
    }),
  );
});

test("family tools fit both themes and custom recipe edits preserve planned dates", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/#tools");
  await page.evaluate((storage) => {
    const data = JSON.parse(localStorage.getItem(storage)!);
    data.routines = [
      {
        id: "morning",
        title: "School morning",
        memberId: "oliver",
        period: "Morning",
        days: [1, 2, 3, 4, 5],
        steps: [{ id: "bag", title: "Pack school bag" }],
      },
    ];
    data.pantry = [
      { id: "rice", name: "Rice", quantity: "1 kg", category: "Pantry" },
    ];
    localStorage.setItem(storage, JSON.stringify(data));
  }, storage);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => localStorage.setItem("kinfolk-theme", theme),
      theme,
    );
    await page.reload();
    for (const tab of [
      "Review",
      "Routines",
      "Pantry",
      "Spending",
      "Activity",
    ]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      expect(
        await page.evaluate(() => document.body.scrollWidth <= innerWidth),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .include("main")
            .withTags(["wcag2a", "wcag2aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
  }
  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("family-tools-dark.png"),
    fullPage: true,
  });
  await page.goto("/#meals");
  await page.getByRole("button", { name: "Add family recipe" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Recipe name").fill("Rice at home");
  await dialog
    .getByLabel("Ingredients", { exact: true })
    .fill("Rice | 200 g | Pantry");
  await dialog.getByLabel("Method", { exact: true }).fill("Simmer the rice.");
  await dialog
    .getByRole("button", { name: "Save recipe", exact: true })
    .click();
  await page.getByLabel("Search recipes").fill("rice at home");
  await page
    .locator(".recipe-card")
    .filter({
      has: page.getByRole("heading", { name: "Rice at home", exact: true }),
    })
    .locator(".recipe-open")
    .click();
  await dialog.getByRole("button", { name: "Edit family recipe" }).click();
  dialog = page.getByRole("dialog").last();
  await dialog.getByLabel("Recipe name").fill("Rice for school nights");
  await dialog
    .getByRole("button", { name: "Save recipe", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", {
      name: "Rice for school nights",
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByLabel("Which day?").fill("2026-11-02");
  await dialog
    .getByRole("button", { name: "Add to meal plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Next meal week" }).click();
  await page
    .getByRole("button", { name: /Rice for school nights/ })
    .first()
    .click();
  await expect(page.getByRole("dialog").getByLabel("Which day?")).toHaveValue(
    "2026-11-02",
  );
});
