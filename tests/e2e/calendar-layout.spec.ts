import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed, fromKey } from "../../src/lib/data";

for (const theme of ["light", "dark"] as const) {
  test(`weekly calendar keeps long plans compact in ${theme} appearance`, async ({
    page,
    isMobile,
  }, testInfo) => {
    const data = createSeed(fromKey("2026-10-21"));
    const base = data.events[0];
    data.events = [
      {
        ...base,
        id: "leave",
        title: "Parental leave",
        date: "2026-06-22",
        endDate: "2026-10-31",
        allDay: true,
        memberIds: ["alex"],
      },
      {
        ...base,
        id: "trip",
        title: "Family trip",
        date: "2026-10-21",
        endDate: "2026-10-25",
        allDay: true,
        memberIds: ["alex"],
      },
      {
        ...base,
        id: "day-off",
        title: "School holiday",
        date: "2026-10-22",
        allDay: true,
        memberIds: ["alex"],
      },
      {
        ...base,
        id: "lesson",
        title: "Swimming lesson",
        date: "2026-10-21",
        start: "17:00",
        end: "17:45",
        memberIds: ["alex"],
        location: "Community pool",
      },
      {
        ...base,
        id: "party",
        title: "Birthday party",
        date: "2026-10-23",
        start: "10:30",
        end: "12:00",
        memberIds: ["alex"],
        location: "",
      },
    ];
    await page.clock.setFixedTime(new Date("2026-10-21T12:00:00"));
    await page.addInitScript(
      ({ data, theme }) => {
        localStorage.setItem("kinfolk-planner-v1", JSON.stringify(data));
        localStorage.setItem("kinfolk-theme", theme);
        document.documentElement.dataset.theme = theme;
      },
      { data, theme },
    );
    await page.goto("/#calendar");
    const calendar = page.getByRole("region", { name: "Week calendar" });
    const spans = calendar.getByRole("group", {
      name: "All-day and multi-day events",
    });
    await expect(spans.getByRole("button")).toHaveCount(3);
    const leave = spans.getByRole("button", { name: /^Parental leave/ });
    await expect(leave).toHaveCount(1);
    await expect(leave).toHaveCSS("grid-column-start", "1");
    await expect(leave).toHaveCSS("grid-column-end", "8");
    await expect(calendar).not.toContainText("Day 12");
    await expect(calendar.locator(".avatar")).toHaveCount(0);
    await expect(
      calendar.getByRole("button", { name: /Swimming lesson/ }),
    ).toBeVisible();
    if (!isMobile) expect((await leave.boundingBox())!.height).toBeLessThan(45);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .include('[aria-label="Week calendar"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("calendar.png"),
      fullPage: true,
    });
    await leave.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("What's happening?")).toHaveValue(
      "Parental leave",
    );
    await expect(dialog.getByLabel("End date")).toHaveValue("2026-10-31");
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Jamie", exact: true }).click();
    await expect(spans).toHaveCount(0);
    await page
      .getByRole("button", { name: "The whole family", exact: true })
      .click();
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(
      calendar.getByRole("button", { name: /^Parental leave/ }),
    ).toHaveCount(1);
    await expect(
      calendar.getByRole("button", { name: /^Family trip/ }),
    ).toHaveCount(0);
  });
}
