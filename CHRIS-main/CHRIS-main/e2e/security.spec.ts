import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toApplication } from './helpers'

const DIST = join(process.cwd(), 'dist')

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listSources(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [join(dir, e.name)] : [],
  )
}

const ALLOWED_HOSTS = ['localhost', 'fonts.googleapis.com', 'fonts.gstatic.com']

test('browser talks only to our origin and Google Fonts; no cookies; storage is ours', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol.startsWith('http')) hosts.add(url.hostname)
  })
  await toApplication(page)
  await expect(page.getByText('Odhad panelu')).toBeVisible({ timeout: 15_000 })

  for (const host of hosts) expect(ALLOWED_HOSTS, `unexpected request to ${host}`).toContain(host)

  expect(await page.context().cookies()).toEqual([])
  const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)])
  for (const key of keys) expect(key).toMatch(/^chris:/)
})

test.describe('build output', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'static checks run once')

  test('no secrets in the bundle', () => {
    const files = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
    const js = files.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n')
    // Report only the matching excerpt, never the whole bundle.
    const secret = js.match(/(api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}/i)
    expect(secret?.[0] ?? null).toBeNull()
  })

  test('our source never uses eval, new Function or raw HTML injection', () => {
    const offenders = listSources(join(process.cwd(), 'src')).filter((file) =>
      /\beval\(|new Function\(|dangerouslySetInnerHTML|\.innerHTML\s*=/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  test('Static Web Apps config ships CSP and security headers', () => {
    const config = JSON.parse(readFileSync(join(DIST, 'staticwebapp.config.json'), 'utf8')) as {
      globalHeaders: Record<string, string>
      navigationFallback: { rewrite: string }
    }
    const h = config.globalHeaders
    expect(h['Content-Security-Policy']).toContain("default-src 'self'")
    expect(h['Content-Security-Policy']).toContain("script-src 'self'")
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    expect(h['Content-Security-Policy']).not.toContain('unsafe-eval')
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d+/)
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBeTruthy()
    expect(h['Permissions-Policy']).toContain('camera=()')
    expect(config.navigationFallback.rewrite).toBe('/index.html')
  })

  test('deploy essentials exist', () => {
    for (const f of ['robots.txt', '.well-known/security.txt', 'site.webmanifest', 'images/favicon.svg', 'images/og.png']) {
      expect(() => readFileSync(join(DIST, f)), f).not.toThrow()
    }
    const html = readFileSync(join(DIST, 'index.html'), 'utf8')
    expect(html).toContain('lang="cs"')
    expect(html).toContain('og:image')
    expect(html).not.toContain('fonts.googleapis.com/css2') // fonts load from CSS, not HTML
  })
})

test('external links open safely', async ({ page }) => {
  await page.goto('/o-projektu')
  const unsafe = await page.locator('a[target="_blank"]:not([rel*="noopener"])').count()
  expect(unsafe).toBe(0)
})
