import { defineConfig, devices } from "@playwright/test";

// Optional settings for the signed-in tests (see e2e/auth-live.spec.ts).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the tests that need Supabase are skipped.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    // Tests run against a production build, the same code that would be deployed.
    command: `npm run build && npm run start -- --port ${PORT} --hostname 127.0.0.1`,
    url: baseURL,
    // Never attach to whatever already listens on the port: if it is taken, fail
    // instead of testing (or writing to) an application we did not start.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
