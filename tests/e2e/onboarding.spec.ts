import { test, expect } from "@playwright/test";

const storage = "kinfolk-planner-v1";

test("a new visitor sets up their own family instead of seeing sample data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Set up your family" }),
  ).toBeVisible();
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Family name").fill("The Lee family");
  await page.getByRole("button", { name: "Start planning" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: /, Sam\b/ }),
  ).toBeVisible();
  const sidebar = page.locator(".sidebar-family");
  await expect(sidebar.locator(".sidebar-member")).toHaveCount(1);
  await expect(sidebar).toContainText("Sam");
  await expect(page.getByText("Jamie")).toHaveCount(0);

  await page.goto("/#settings");
  await page.getByRole("button", { name: "Add a member", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Riley");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add family member", exact: true })
    .click();
  await page.reload();
  await expect(sidebar.locator(".sidebar-member")).toHaveCount(2);
  await expect(sidebar).toContainText("Riley");

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    storage,
  );
  expect(saved.settings.familyName).toBe("The Lee family");
  expect(saved.events).toEqual([]);
});

test("starting over removes everything and returns to family setup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Family name").fill("The Lee family");
  await page.getByRole("button", { name: "Start planning" }).click();
  await page.goto("/#settings");
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your family" }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storage),
  ).toBeNull();
});
