import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const report = [];
page.on("pageerror", (error) => report.push({ error: error.message }));
for (const view of [
  "overview",
  "calendar",
  "meals",
  "shopping",
  "chores",
  "board",
  "settings",
]) {
  await page.goto(`http://localhost:3000/#${view}`, {
    waitUntil: "networkidle",
  });
  await page.locator("main h1").waitFor();
  await page.screenshot({
    path: `artifacts/${view}-desktop.png`,
    fullPage: true,
    animations: "disabled",
  });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const violations = axe.violations.map((v) => ({
    id: v.id,
    count: v.nodes.length,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  report.push({ view, violations });
  console.log(
    view,
    violations.map((v) => `${v.id}: ${v.count}`).join(", ") ||
      "no accessibility violations",
  );
}
await page.setViewportSize({ width: 390, height: 844 });
for (const view of [
  "overview",
  "calendar",
  "meals",
  "shopping",
  "chores",
  "board",
  "settings",
]) {
  await page.goto(`http://localhost:3000/#${view}`, {
    waitUntil: "networkidle",
  });
  await page.locator("main h1").waitFor();
  await page.screenshot({
    path: `artifacts/${view}-mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  const overflow = await page.evaluate(
    () => document.body.scrollWidth > innerWidth,
  );
  if (overflow) console.log("OVERFLOW", view);
  report.push({ view, mobileOverflow: overflow });
}
writeFileSync("artifacts/accessibility.json", JSON.stringify(report, null, 2));
await browser.close();
