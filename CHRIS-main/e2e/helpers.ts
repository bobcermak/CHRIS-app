import { expect, type Page } from '@playwright/test'

export const FAST = '?demoSpeed=0.02'

export const ONCOLOGY =
  'Chceme postavit tým k řešení vztahů v nádorovém mikroprostředí, ideálně s modelem mozkových metastáz a prostorovou transkriptomikou pro společný grant.'

/** Starts a project from a typed prompt or an example, and lands on 02 Upřesnění. */
export async function startProject(page: Page, prompt: string = ONCOLOGY) {
  await page.goto(`/${FAST}`)
  await page.getByLabel('Popište svůj výzkumný projekt').fill(prompt)
  await page.getByRole('button', { name: 'Hledat', exact: true }).click()
  await expect(page).toHaveURL(/\/projekt\/[^/]+\/upresneni/)
}

/** Answers the first round, confirms the assumption and waits for 03 Týmy. */
export async function clarifyToTeams(page: Page) {
  await expect(page.getByRole('heading', { name: /upřesněme/ })).toBeVisible()
  await page.getByLabel('Odpověď na otázku 1').fill('Máme kohortu vzorků, prostorovou transkriptomiku zatím ne.')
  await page.getByRole('button', { name: 'Pokračovat' }).click()
  await expect(page.getByRole('heading', { name: /Ještě pár upřesnění/ })).toBeVisible()
  await page.getByRole('radio', { name: 'Ano' }).click()
  await page.getByRole('button', { name: 'Pokračovat' }).click()
  await expect(page).toHaveURL(/\/tymy$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Tým', exact: true })).toBeVisible()
}

export async function toTeams(page: Page, prompt: string = ONCOLOGY) {
  await startProject(page, prompt)
  await page.getByRole('button', { name: 'Přeskočit a hledat hned' }).click()
  await expect(page).toHaveURL(/\/tymy$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Tým', exact: true })).toBeVisible()
}

export async function toApplication(page: Page) {
  await toTeams(page)
  await page.getByRole('button', { name: 'Vytvořit přihlášku' }).first().click()
  await expect(page.getByRole('heading', { name: 'Vyberte šablonu přihlášky' })).toBeVisible()
  await page.getByRole('button', { name: /AZV ČR · standardní projekt/ }).click()
  await expect(page.getByText('povinných bodů hotovo')).toBeVisible()
}
