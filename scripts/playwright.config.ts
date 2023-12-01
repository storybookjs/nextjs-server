import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  retries: process.env.CI ? 2 : 0,
});
