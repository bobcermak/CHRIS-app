import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const CI = Boolean(process.env.CI)

/**
 * E2E suite against the production build in demo mode (no backend needed).
 * `?demoSpeed=` in tests makes the simulated streams near-instant.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Firefox gets very slow under heavy parallel load on Windows; keep the pool small.
  workers: CI ? 2 : 3,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', timeout: 90_000, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-reduced-motion',
      use: { ...devices['Pixel 7'], contextOptions: { reducedMotion: 'reduce' } },
    },
  ],
  webServer: {
    // `env` instead of a `VITE_DEMO=true …` prefix: the command runs in cmd.exe on Windows.
    command: `pnpm build:e2e && pnpm exec vite preview --port ${PORT} --strictPort`,
    env: { VITE_DEMO: 'true' },
    url: `http://localhost:${PORT}`,
    // Always test a fresh build — a reused preview server would serve stale code.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
