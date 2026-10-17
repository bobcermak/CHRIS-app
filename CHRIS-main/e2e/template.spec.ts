import { expect, test, type Page } from '@playwright/test'
import { toTeams } from './helpers'

const PDF = { name: 'vyzva-2027.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo\n') }

/** 03 Týmy → step 1 of the application, scrolled to "Jiný grant". */
async function toPicker(page: Page) {
  await toTeams(page)
  await page.getByRole('button', { name: 'Vytvořit přihlášku' }).first().click()
  await expect(page.getByRole('heading', { name: 'Vyberte šablonu přihlášky' })).toBeVisible()
}

const upload = (page: Page, file: typeof PDF) => page.locator('input[type="file"]').setInputFiles(file)

test.describe('grant without a template: outline from its documentation', () => {
  test('uploaded documentation → sections cite their page → confirm → application', async ({ page }) => {
    await toPicker(page)
    await upload(page, PDF)

    await expect(page.getByRole('heading', { name: 'Z dokumentace, k potvrzení' })).toBeVisible({ timeout: 15_000 })
    // Every section shows where in the documentation it stands.
    const sections = page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Potvrzeno' }) })
    await expect(sections).toHaveCount(5)
    await expect(sections.first().getByText('vyzva-2027.pdf, str. 4')).toBeVisible()
    await expect(page.getByText('0 / 5 potvrzeno')).toBeVisible()
    await expect(page.getByText('Co nevím a musíte doplnit')).toBeVisible()

    await page.getByRole('button', { name: 'Potvrdit vše' }).click()
    await expect(page.getByText('povinných bodů hotovo')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cíle projektu' }).first()).toBeVisible()
  })

  test('DOCX is accepted too', async ({ page }) => {
    await toPicker(page)
    await upload(page, {
      name: 'sablona.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK\u0003\u0004demo'),
    })
    await expect(page.getByRole('heading', { name: 'Z dokumentace, k potvrzení' })).toBeVisible({ timeout: 15_000 })
  })

  test('unsupported or oversized files are refused before anything is sent', async ({ page }) => {
    await toPicker(page)
    await upload(page, { name: 'poznamky.txt', mimeType: 'text/plain', buffer: Buffer.from('ahoj') })
    await expect(page.getByRole('alert')).toHaveText('Nahrajte PDF nebo DOCX se zadávací dokumentací.')

    await upload(page, { ...PDF, buffer: Buffer.alloc(15 * 1024 * 1024 + 1) })
    await expect(page.getByRole('alert')).toHaveText('Soubor je větší než 15 MB.')
    await expect(page.getByRole('heading', { name: 'Vyberte šablonu přihlášky' })).toBeVisible()
  })

  test('a link that is not a web address is refused', async ({ page }) => {
    await toPicker(page)
    await page.getByLabel('Odkaz na zadávací dokumentaci').fill('ftp://example.org/vyzva.pdf')
    await page.getByRole('button', { name: 'Načíst šablonu' }).click()
    await expect(page.getByRole('alert')).toHaveText('Zadejte celou adresu včetně https://')
  })

  test('no outline in the documentation → generic outline says why', async ({ page }) => {
    await toPicker(page)
    await page.getByLabel('Odkaz na zadávací dokumentaci').fill('https://example.org/vyzva-2027')
    await page.getByRole('button', { name: 'Načíst šablonu' }).click()
    await expect(page.getByRole('heading', { name: 'Obecná osnova' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('status').filter({ hasText: 'nenašel osnovu přihlášky' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Dokumentace výzvy/ })).toHaveAttribute('href', 'https://example.org/vyzva-2027')
  })
})

test('thinking always opens with "Chrisuji…", then moves on to the stage verbs', async ({ page }) => {
  await toPicker(page)
  // Slow the demo stream down (2 s × 4) so the verb rotation is observable.
  await page.evaluate(() => localStorage.setItem('chris:demo-speed', '4'))
  await upload(page, PDF)

  await expect(page.getByText('Chrisuji…')).toBeVisible()
  await expect(page.getByText(/Preparuji osnovu…|Porovnávám se známými výzvami…|Měřím limity…|Značkuji sekce…/)).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.getByText(/Přemýšl|Načítám/)).toHaveCount(0)
})

test('recommended grant without a template: "Načíst šablonu" reads its call page right away', async ({ page }) => {
  await toTeams(page)
  // Demo grants all have a library template; take it away from the recommended one.
  await page.evaluate(() => {
    const key = 'chris:demo-db:v1'
    const db = JSON.parse(localStorage.getItem(key) ?? '{}')
    for (const match of Object.values<{ variants: { grants: { call: { template_id?: string } }[] }[] }>(db.matches ?? {}))
      for (const v of match.variants) delete v.grants[0]?.call.template_id
    localStorage.setItem(key, JSON.stringify(db))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Vytvořit přihlášku' }).first().click()

  const featured = page.getByRole('region', { name: /Program na podporu zdravotnického/ })
  await expect(featured.getByText('Pro tuto výzvu ještě nemám ověřenou šablonu.', { exact: false })).toBeVisible()
  await featured.getByRole('button', { name: 'Načíst šablonu' }).click()
  // Straight to confirming the sections — no detour through the link field.
  await expect(page.getByText('Přihláška · potvrzení šablony')).toBeVisible({ timeout: 15_000 })
})
