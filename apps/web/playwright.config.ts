import { defineConfig, devices } from "@playwright/test";

// Browser tests: the real site and the real API, clicked through like a person would.
//   npm run build -w api && npm run build -w web   (once, then after changes)
//   npm run test:browser -w web
// The API runs with RUN_WORKER=true (the worker inside it) against DATABASE_URL / REDIS_URL from the
// environment or apps/api/.env - a test database, never a real one. Without Cloudinary, Meta and Gemini
// keys those parts are off, so the tests stay on what works without them.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // one database: the flows run one after another
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure", // a failed test leaves a step-by-step recording in test-results/
    locale: "ar",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node dist/main",
      cwd: "../api",
      url: "http://localhost:4000/api/health/ping",
      env: { RUN_WORKER: "true", PORT: "4000", WEB_ORIGIN: "http://localhost:3000" },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: "npx next start --port 3000",
      url: "http://localhost:3000/ar/login",
      env: { API_URL: "http://localhost:4000", NEXT_TELEMETRY_DISABLED: "1" },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
