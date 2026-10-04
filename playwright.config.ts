import { defineConfig, devices } from "@playwright/test";

// The signed-in tests use a second dev server set up for a Supabase project whose
// requests the tests answer themselves (see tests/e2e/cloud.spec.ts).
export const CLOUD_URL = "http://localhost:3100";
export const CLOUD_SUPABASE = "https://kinfolktest.supabase.co";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: "cloud.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      testIgnore: "cloud.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "signed-in",
      testMatch: "cloud.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: CLOUD_URL },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "npx next dev -p 3100",
      url: CLOUD_URL,
      reuseExistingServer: true,
      timeout: 90000,
      env: {
        NEXT_DIST_DIR: ".next-cloud",
        NEXT_PUBLIC_SUPABASE_URL: CLOUD_SUPABASE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
    },
  ],
});
