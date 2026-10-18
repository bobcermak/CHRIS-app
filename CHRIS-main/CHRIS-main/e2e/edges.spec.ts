import { expect, test } from '@playwright/test'
import { FAST, startProject, toApplication, toTeams } from './helpers'

test('too short prompt is rejected with a clear message', async ({ page }) => {
  await page.goto(`/${FAST}`)
  await page.getByLabel('Popište svůj výzkumný projekt').fill('rakovina')
  await page.getByRole('button', { name: 'Hledat', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('alespoň jednou větou')
  await expect(page).toHaveURL(/\/\?demoSpeed/)
})

test('Enter submits, Shift+Enter adds a new line', async ({ page }) => {
  await page.goto(`/${FAST}`)
  const field = page.getByLabel('Popište svůj výzkumný projekt')
  await field.fill('Chceme studovat nádorové mikroprostředí mozkových metastáz')
  await field.press('Shift+Enter')
  await expect(field).toHaveValue(/\n$/)
  await field.press('Enter')
  await expect(page).toHaveURL(/upresneni/)
})

test('"Přeskočit a hledat hned" goes straight to teams', async ({ page }) => {
  await toTeams(page)
  await expect(page.getByRole('button', { name: /otevřít profil skupiny/ })).toHaveCount(5)
})

test('Ctrl+Enter = Hledej teď on the questions', async ({ page }) => {
  await startProject(page)
  await expect(page.getByRole('heading', { name: /upřesněme/ })).toBeVisible()
  await page.keyboard.press('Control+Enter')
  await expect(page).toHaveURL(/tymy$/, { timeout: 20_000 })
})

test('no match: the AI does not pick a team at any cost', async ({ page }) => {
  await toTeams(page, 'Hledáme tým pro výzkum, ve kterém v NÚVR nikdo nepracuje, a chceme to ověřit.')
  await expect(page.getByText('Žádná skupina nedosahuje požadované shody', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hledat znovu' })).toBeVisible()
})

test('stream error shows a factual message and recovers on retry', async ({ page }) => {
  await startProject(page, 'Nádorové mikroprostředí mozkových metastáz [chyba] pro test chybového stavu.')
  await page.getByRole('button', { name: 'Přeskočit a hledat hned' }).click()
  await expect(page.getByRole('alert')).toContainText('Spojení s katalogem se přerušilo')
  await page.getByRole('button', { name: 'Zkusit znovu' }).click()
  await expect(page).toHaveURL(/tymy$/, { timeout: 20_000 })
})

test('refresh mid-flow keeps the project and teams', async ({ page }) => {
  await toTeams(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tým', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /otevřít profil skupiny/ })).toHaveCount(5)
})

test('deep link to teams of an unknown project shows 404', async ({ page }) => {
  await page.goto('/projekt/neexistuje/tymy')
  await expect(page.getByRole('heading', { name: 'Tato stránka neexistuje' })).toBeVisible()
})

test('unknown URL shows 404 with a way back', async ({ page }) => {
  await page.goto('/tohle-neni')
  await expect(page.getByRole('heading', { name: 'Tato stránka neexistuje' })).toBeVisible()
  await page.getByRole('link', { name: 'Založit nový projekt' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('character limit turns the counter into a risk state', async ({ page }) => {
  await toApplication(page)
  const title = page.locator('#section-title-text')
  await title.fill('x'.repeat(260))
  await expect(title).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('260 / 250 znaků')).toBeVisible()
})

test('unknown call resolves to a template that must be confirmed', async ({ page }) => {
  await toTeams(page)
  await page.getByRole('button', { name: 'Vytvořit přihlášku' }).first().click()
  await page.getByLabel('Odkaz na zadávací dokumentaci').fill('https://example.org/azv-2027-vyzva.pdf')
  await page.getByRole('button', { name: 'Načíst šablonu' }).click()
  await expect(page.getByRole('heading', { name: /Odvozená z/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('V čem se výzva může lišit')).toBeVisible()
  await page.getByRole('button', { name: 'Pokračovat k přihlášce' }).click()
  await expect(page.getByText('Sekce není potvrzená proti dokumentaci výzvy.').first()).toBeVisible()
})

test('switching template keeps text that has no home', async ({ page }) => {
  await toApplication(page)
  await page.getByRole('button', { name: 'Změnit šablonu' }).click()
  await page.getByRole('button', { name: /Horizon Europe/ }).click()
  await expect(page.getByText('Nezařazený text z předchozí šablony')).toBeVisible()
})

test.describe(() => {
  // Narrow layout: the map has its own height there (on wide screens it fills what the card has left).
  test.use({ viewport: { width: 412, height: 915 } })

  test('editing the team folds the map away; Hotovo and ✕ bring it back', async ({ page }) => {
    await toTeams(page)
    // Leaders on the map are the "…, shoda N %" buttons.
    const seats = page.getByRole('button', { name: /, shoda \d+ %$/ })
    await expect(seats.first()).toBeVisible()
  
    await page.getByRole('button', { name: 'Upravit tým' }).click()
    await expect(seats).toHaveCount(0)
    await page.getByRole('button', { name: 'Hotovo' }).click()
    await expect(seats.first()).toBeVisible()
  
    await page.getByRole('button', { name: 'Upravit tým' }).click()
    await expect(seats).toHaveCount(0)
    await page.getByRole('button', { name: 'Zrušit úpravy' }).click()
    await expect(seats.first()).toBeVisible()
  })
})
