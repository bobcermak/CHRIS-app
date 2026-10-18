import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FAST, startProject, toApplication, toTeams } from './helpers'

async function audit(page: Page, label: string) {
  // Measure the settled UI, not colours halfway through a fade.
  await page.waitForTimeout(450)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), undefined, { timeout: 5_000 }).catch(() => {})
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const detail = serious
    .map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} — ${n.any[0]?.message ?? n.failureSummary ?? ''}`).join(' | ')}`)
    .join('\n')
  expect(serious, `${label}:\n${detail}`).toEqual([])
}

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test('home', async ({ page }) => {
    await page.goto(`/${FAST}`)
    await audit(page, 'home')
  })

  test('clarify', async ({ page }) => {
    await startProject(page)
    await expect(page.getByRole('heading', { name: /upřesněme/ })).toBeVisible()
    await audit(page, 'clarify')
  })

  test('teams + side panel', async ({ page }) => {
    await toTeams(page)
    await audit(page, 'teams')
    await page.getByRole('button', { name: /RNDr. Petr Dvořák.*otevřít profil skupiny/ }).click()
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
    await audit(page, 'group panel')
  })

  test('application', async ({ page }) => {
    await toApplication(page)
    await expect(page.getByText('Odhad panelu')).toBeVisible({ timeout: 15_000 })
    await audit(page, 'application')
  })

  for (const path of ['/o-projektu', '/ochrana-udaju', '/pristupnost']) {
    test(`legal ${path}`, async ({ page }) => {
      await page.goto(path)
      await audit(page, path)
    })
  }
})

test('keyboard only: zadání → týmy → panel → close', async ({ page, browserName }) => {
  await page.goto(`/${FAST}`)
  // Skip link is the first stop (WebKit skips links on Tab by default, like Safari)
  if (browserName !== 'webkit') {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Přeskočit na obsah' })).toBeFocused()
  }

  const field = page.getByLabel('Popište svůj výzkumný projekt')
  await field.focus()
  await page.keyboard.type('Nádorové mikroprostředí mozkových metastáz a prostorová transkriptomika.')
  await page.keyboard.press('Enter')
  // Focus lands on the first new question (ARCHITECTURE §12: focus na novou otázku)
  await expect(page.getByLabel('Odpověď na otázku 1')).toBeFocused({ timeout: 15_000 })
  await page.keyboard.press('Control+Enter')
  await expect(page).toHaveURL(/tymy$/, { timeout: 20_000 })

  // Strategy tabs: arrows move selection
  await page.getByRole('tab', { name: 'Intelligence-first' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Grant-first' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Grant-first' })).toHaveAttribute('aria-selected', 'true')
  // Wait for the new variant to replace the old one before focusing a row.
  await expect(page.getByText(/podle podmínek AZV/)).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)

  // Open a profile with Enter, close with Escape, focus returns
  const name = page.getByRole('button', { name: /doc. MUDr. Jana Veselá.*otevřít profil skupiny/ })
  await name.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(name).toBeFocused()
})
