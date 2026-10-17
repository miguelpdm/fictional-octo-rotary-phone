import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  projects: [{ name: "webkit", use: { ...devices["iPhone 13"] } }],
});
