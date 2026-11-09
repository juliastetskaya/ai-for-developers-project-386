import { defineConfig, devices } from '@playwright/test'

// Dedicated ports keep the golden path independent from `mise run dev:*`
// and `mise daemons start`, so `mise run check` can run while dev servers
// are still up.
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '5273'
const BACKEND_PORT = process.env.E2E_API_PORT ?? '3100'
const FRONTEND_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`
const BACKEND_URL =
  process.env.E2E_API_URL ?? `http://localhost:${BACKEND_PORT}`

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
      command: `PORT=${BACKEND_PORT} node scripts/playwright-backend.mjs`,
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `VITE_API_URL=${BACKEND_URL} pnpm --filter frontend dev --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
