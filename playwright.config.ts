import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
