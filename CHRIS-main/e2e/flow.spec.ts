import { expect, test } from '@playwright/test'
import { clarifyToTeams, startProject } from './helpers'

test('full flow: zadání → upřesnění → týmy → změna týmu → profil → e-mail → přihláška → export', async ({ page }) => {
  test.setTimeout(120_000) // the whole product in one test; Firefox/WebKit are slower

  // 01 Zadání
  await startProject(page)

  // 02 Upřesnění — thinking folds into a summary, never "Přemýšlím"
  await clarifyToTeams(page)
  await expect(page.getByText(/Přemýšl|Načítám|Thinking/)).toHaveCount(0)

  // 03 Týmy — five groups with match %, two strategies
  const people = page.getByRole('button', { name: /otevřít profil skupiny/ })
  await expect(people).toHaveCount(5)
  await expect(page.getByRole('tab', { name: 'Intelligence-first' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Grant-first' }).click()
  await expect(page.getByRole('tab', { name: 'Grant-first' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Intelligence-first' }).click()

  // Edit mode: ↻ / ✕ appear only after "Upravit"
  const rows = page.getByRole('group', { name: /Volba pro skupinu/ })
  await expect(rows).toHaveCount(0)
  await page.getByRole('button', { name: 'Upravit tým' }).click()
  await expect(rows).toHaveCount(5)

  // Replace one → recompute → diff → undo
  await rows.nth(3).getByRole('button', { name: 'Vyměnit za jinou skupinu' }).click()
  await expect(page.getByRole('button', { name: 'Vrátit změnu' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Nová v týmu')).toBeVisible()
  await page.getByRole('button', { name: 'Vrátit změnu' }).click()
  await expect(people).toHaveCount(5)

  // Remove one right away, then cancel the edit → the team is back as it was
  await rows.nth(4).getByRole('button', { name: 'Odebrat z týmu' }).click()
  await expect(people).toHaveCount(4)
  await page.getByRole('button', { name: 'Zrušit úpravy' }).click()
  await expect(people).toHaveCount(5)
  await expect(rows).toHaveCount(0)

  // Group profile → sources → deep research → e-mail draft (copy only, nothing is sent)
  await page.getByRole('button', { name: /RNDr. Petr Dvořák.*otevřít profil skupiny/ }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByText('Proč se hodí')).toBeVisible()
  await expect(panel.getByRole('link', { name: /Zdroj/ }).first()).toHaveAttribute('rel', /noopener/)
  await panel.getByRole('button', { name: 'Spustit deep research' }).click()
  await expect(panel.getByText('Klíčové publikace')).toBeVisible({ timeout: 15_000 })
  await panel.getByRole('button', { name: 'Napsat vedoucímu skupiny' }).click()
  await expect(panel.getByLabel('Text e-mailu')).not.toHaveValue('')
  await expect(panel.getByRole('button', { name: 'Kopírovat' })).toBeVisible()
  await expect(panel.getByRole('link', { name: /e-mailu/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  // Technology panel
  await page.getByRole('region', { name: 'Technologie' }).getByRole('button', { name: /Prostorová transkriptomika/ }).first().click()
  await expect(page.getByRole('dialog').getByText('Kde to jde dělat')).toBeVisible()
  await page.keyboard.press('Escape')

  // 04 Přihláška — template library → oppose-first copilot → write → export checklist
  await page.getByRole('button', { name: 'Vytvořit přihlášku' }).first().click()
  await expect(page.getByText('Doporučeno')).toBeVisible()
  await page.getByRole('button', { name: /AZV ČR · standardní projekt/ }).click()
  await expect(page.getByText('povinných bodů hotovo')).toBeVisible()

  const copilot = page.getByRole('complementary', { name: 'Copilot' })
  await expect(copilot.getByText('Odhad panelu')).toBeVisible({ timeout: 15_000 })
  await expect(copilot.getByText(/Zásadní výtka/).first()).toBeVisible()
  // No flattery (§9.4.1)
  await expect(copilot.getByText(/skvěl|výborn|gratul/i)).toHaveCount(0)

  await copilot.getByRole('button', { name: 'Intelligence-first' }).click()
  await expect(page.locator('#section-team-text')).toHaveValue(/Řešitelský tým tvoří/, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Exportovat PDF' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Před exportem zkontrolujte')).toBeVisible()
  await expect(dialog.getByText(/AI-assisted draft/)).toBeVisible()
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute('data-printed', 'true')
  })
  await dialog.getByRole('button', { name: /Exportovat/ }).click()
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true')

  // The print version always carries the AI-draft footer
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('article.print-only').getByText(/AI-assisted draft/)).toBeVisible()
})
