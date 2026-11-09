import { defineConfig, devices } from '@playwright/test'

const FRONTEND_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const BACKEND_URL = process.env.E2E_API_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  // The golden path drives one shared backend; one worker keeps runs isolated.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Both servers are the real ones. The backend wrapper wipes a dedicated
  // SQLite database before starting, so every run begins from an empty schema.
  webServer: [
    {
      command: 'node scripts/playwright-backend.mjs',
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter frontend dev --port 5173 --strictPort',
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
