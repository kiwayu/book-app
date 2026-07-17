import { defineConfig, devices } from "@playwright/test";

/*
 * E2E smoke suite against the Expo web build.
 * Native-only flows (device import picker, file:// reader, RSVP on device)
 * are out of scope here — they need a device; see e2e/smoke.spec.ts header.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:8090",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx expo start --web --port 8090",
    url: "http://localhost:8090",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000, // first web bundle is slow
  },
});
