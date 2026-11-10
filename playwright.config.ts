import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4182/cashflow/', serviceWorkers: 'block' },
  webServer: { command: 'npx vite preview --port 4182 --strictPort', url: 'http://localhost:4182/cashflow/', reuseExistingServer: false },
  projects: [
    { name: 'iphone-safari-engine', use: { ...devices['iPhone 15'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
  ],
});
