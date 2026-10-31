import { defineConfig } from "vitest/config";

// Unit tests for the website's plain logic (time zones, the calendar grid, caption counters).
// Pages and components are checked by typecheck, lint and build; the browser flows come in phase 7.
export default defineConfig({
  resolve: { tsconfigPaths: true }, // "@/lib/..." like the app
  test: {
    include: ["src/**/*.test.ts"],
    // A fixed zone far from every brand zone in the tests: the code must never lean on the machine's zone.
    env: { TZ: "Pacific/Kiritimati" },
  },
});
