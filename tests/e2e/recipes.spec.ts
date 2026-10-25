import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed, recipes } from "../../src/lib/data";

const storage = "kinfolk-planner-v1";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [storage, JSON.stringify(createSeed())],
  );
  await page.goto("/#meals");
  await expect(page.locator("main h1")).toBeVisible();
});

test("browse all recipes and filter the broad West African collection", async ({
  page,
}) => {
  const cards = page.locator(".recipe-card");
  await expect(page.locator(".recipe-result-count")).toHaveText(
    "Showing 12 of 68 recipes",
  );
  for (let count = 12; count < recipes.length; count += 12) {
    const next = Math.min(12, recipes.length - count);
    await page
      .getByRole("button", { name: `Show ${next} more recipes` })
      .click();
    await expect(cards).toHaveCount(count + next);
  }
  await expect(
    page.getByRole("button", { name: "Show 12 more recipes" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "West African", exact: true }).click();
  await expect(page.locator(".recipe-result-count")).toHaveText(
    "Showing 12 of 32 recipes",
  );
  await page.getByLabel("Search recipes").fill("cote ivoire");
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "Kedjenou" })).toBeVisible();
  await page.getByLabel("Search recipes").fill("peanut");
  await expect(cards).toHaveCount(5);
  await page.getByRole("button", { name: "Meat-free", exact: true }).click();
  await expect(cards.filter({ hasText: "Chicken" })).toHaveCount(0);
  await page.getByLabel("Search recipes").fill("nothing-matches-this");
  await expect(
    page.getByText("No recipes found. Try another search."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Ghanaian and lighter meals can be found, cooked, shopped and planned", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ghanaian", exact: true }).click();
  await expect(page.locator(".recipe-result-count")).toHaveText(
    "Showing 12 of 14 recipes",
  );
  await page.getByLabel("Search recipes").fill("tuna cabbage");
  const card = page.locator(".recipe-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Ghana");
  await expect(card).toContainText("Lighter meal");
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".recipe-modal-photo")).toHaveAttribute(
    "src",
    "/images/recipes/ghana-tuna-cabbage.webp",
  );
  await expect
    .poll(() =>
      dialog
        .locator(".recipe-modal-photo")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await dialog
    .getByRole("button", { name: "Add missing ingredients to shopping list" })
    .click();
  await expect(page.locator(".toast")).toContainText("ingredients added");
  await dialog.getByLabel("Which day?").fill("2026-11-06");
  await dialog.getByRole("button", { name: "Add to meal plan" }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kinfolk-planner-v1")!),
  );
  expect(saved.shopping).toContainEqual(
    expect.objectContaining({ name: "Cabbage" }),
  );
  expect(saved.meals).toContainEqual(
    expect.objectContaining({
      recipeId: "ghana-tuna-cabbage",
      date: "2026-11-06",
    }),
  );
  await page.getByLabel("Search recipes").fill("");
  await page
    .getByRole("button", { name: "Lighter meals", exact: true })
    .click();
  await expect(page.locator(".recipe-result-count")).toHaveText(
    "Showing 12 of 13 recipes",
  );
  await expect(page.locator(".lighter-meals-note")).toContainText(
    "practical serving suggestions",
  );
  await page.getByLabel("Search recipes").fill("Ghana");
  await expect(page.locator(".recipe-card")).toHaveCount(5);
  await expect(
    page.locator(".recipe-card", { hasText: "Kelewele" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".recipe-card img")
        .evaluateAll((images) =>
          images.every(
            (el) =>
              (el as HTMLImageElement).complete &&
              (el as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("cook a West African recipe, add its shopping and keep the meal after reload", async ({
  page,
}) => {
  await page.getByLabel("Search recipes").fill("egusi");
  await page.locator(".recipe-card").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".recipe-modal-photo")).toHaveAttribute(
    "src",
    "/images/recipes/egusi-soup.webp",
  );
  await expect
    .poll(() =>
      dialog
        .locator(".recipe-modal-photo")
        .evaluate(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect(
    dialog.getByText("Ground egusi seeds", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".recipe-timing")).toContainText("Prep 20 min");
  await dialog.getByRole("button", { name: "Let’s make it" }).click();
  await expect(dialog.locator(".method-list li")).toHaveCount(6);
  await expect(
    dialog.getByRole("heading", { name: "Cooking tips & substitutions" }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Chef Lola/ })).toHaveAttribute(
    "href",
    "https://cheflolaskitchen.com/egusi-soup-recipe/",
  );
  expect(
    (
      await new AxeBuilder({ page })
        // The app's pop-ups are native <dialog> elements (no role attribute).
        .include("dialog[open]")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Ingredients", exact: true })
    .click();
  const add = dialog.getByRole("button", {
    name: "Add missing ingredients to shopping list",
  });
  await add.click();
  await expect(page.locator(".toast")).toContainText("ingredients added");
  const read = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storage);
  const first = await read();
  expect(
    first.shopping.some(
      (i: { name: string }) => i.name === "Ground egusi seeds",
    ),
  ).toBe(true);
  await add.click();
  await expect(page.locator(".toast")).toContainText("already have");
  expect((await read()).shopping.length).toBe(first.shopping.length);
  await dialog.getByLabel("Which day?").fill("2026-11-20");
  await dialog.getByRole("button", { name: "Add to meal plan" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  expect((await read()).meals).toContainEqual(
    expect.objectContaining({ date: "2026-11-20", recipeId: "egusi-soup" }),
  );
  await page.getByRole("button", { name: "Breakfast", exact: true }).click();
  await page
    .getByRole("button", { name: "Add a meal", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Search meals for this day").fill("Senegal yassa");
  await expect(dialog.locator(".recipe-picker button")).toHaveCount(1);
  await dialog.getByRole("button", { name: /Chicken yassa/ }).click();
  await expect(
    dialog.getByRole("heading", { name: "Chicken yassa", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Which meal?")).toHaveValue("Breakfast");
});
