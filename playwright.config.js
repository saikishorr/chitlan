import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 2,
  timeout: 180_000,
  expect: {
    timeout: 45_000
  }, 
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:8080/app.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
 