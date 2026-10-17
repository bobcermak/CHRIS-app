import { expect, test, type Page } from '@playwright/test'
import { FAST, toTeams } from './helpers'

/** Fire a real drag & drop sequence of a synthetic file on the window. */
async function dropFile(page: Page, name: string, type: string, sizeBytes = 2048, target = 'body') {
  await page.evaluate(
    ({ name, type, sizeBytes, target }) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(sizeBytes)], name, { type }))
      const el = document.querySelector(target) ?? document.body
      for (const kind of ['dragenter', 'dragover']) el.dispatchEvent(new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: dt }))
      ;(window as unknown as { __dt: DataTransfer }).__dt = dt
    },
    { name, type, sizeBytes, target },
  )
}

async function release(page: Page, target = 'body') {
  await page.evaluate((target) => {
    const dt = (window as unknown as { __dt: DataTransfer }).__dt
    const el = document.querySelector(target) ?? document.body
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, target)
}

test.describe('home', () => {
  test('no demo content, no technical output, no user badge', async ({ page }) => {
    await page.goto(`/${FAST}`)
    await expect(page.getByText(/demo/i)).toHaveCount(0)
    await expect(page.getByText(/api\/health|stream\/ping|status/i)).toHaveCount(0)
  })

  test('drag & drop anywhere shows the drop zone and adds a chip', async ({ page }) => {
    await page.goto(`/${FAST}`)
    await dropFile(page, 'abstrakt.pdf', 'application/pdf', 300_000)
    await expect(page.getByText('Pusťte soubor, přidám ho k zadání')).toBeVisible()
    await release(page)
    await expect(page.getByText('Pusťte soubor, přidám ho k zadání')).toBeHidden()
    const chips = page.getByRole('list', { name: 'Přílohy' })
    await expect(chips.getByText('abstrakt.pdf')).toBeVisible()
    await expect(chips.getByText(/293 kB/)).toBeVisible()
    await chips.getByRole('button', { name: 'Odebrat přílohu abstrakt.pdf' }).click()
    await expect(chips.getByText('abstrakt.pdf')).toHaveCount(0)
  })

  test('drop directly on the input works too', async ({ page }) => {
    await page.goto(`/${FAST}`)
    await dropFile(page, 'poznamky.txt', 'text/plain', 512, '#prompt')
    await release(page, '#prompt')
    await expect(page.getByRole('list', { name: 'Přílohy' }).getByText('poznamky.txt')).toBeVisible()
  })

  test('unsupported type and >10 MB are rejected with a clear message', async ({ page }) => {
    await page.goto(`/${FAST}`)
    await dropFile(page, 'data.zip', 'application/zip')
    await release(page)
    await expect(page.getByRole('alert')).toContainText('Podporované jsou PDF, DOCX, TXT, Markdown (.md) a obrázky')
    await dropFile(page, 'velky.pdf', 'application/pdf', 11 * 1024 * 1024)
    await release(page)
    await expect(page.getByRole('alert')).toContainText('víc než 10 MB')
  })

  test('pasting an image attaches it', async ({ page, browserName }) => {
    // Firefox ignores clipboardData on synthetic ClipboardEvents; real paste works there too.
    test.skip(browserName === 'firefox', 'synthetic paste unsupported in Firefox')
    await page.goto(`/${FAST}`)
    await page.getByLabel('Popište svůj výzkumný projekt').focus()
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(1000)], 'image.png', { type: 'image/png' }))
      document.querySelector('#prompt')!.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
    })
    await expect(page.getByRole('list', { name: 'Přílohy' }).getByText('vlozeny-obrazek-1.png')).toBeVisible()
  })

  test('session survives going home and F5, and reopens the exact step', async ({ page }) => {
    await toTeams(page)
    await page.getByRole('tab', { name: 'Grant-first' }).click()
    const url = page.url()

    await page.getByRole('link', { name: 'CHRIS – úvod' }).click()
    await expect(page).toHaveURL(/\/$/)
    const recent = page.getByRole('region', { name: 'Rozpracované projekty' })
    await expect(recent.getByText('Nádorové mikroprostředí mozkových metastáz')).toBeVisible()
    await expect(recent.getByText(/Týmy · dnes/)).toBeVisible()

    await page.reload()
    await recent.getByRole('button', { name: /^Nádorové mikroprostředí/ }).click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('tab', { name: 'Grant-first' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: /otevřít profil skupiny/ })).toHaveCount(4)

    await page.reload()
    await expect(page.getByRole('tab', { name: 'Grant-first' })).toHaveAttribute('aria-selected', 'true')
  })

  test('open clarification round is restored exactly', async ({ page }) => {
    await page.goto(`/${FAST}`)
    await page.getByLabel('Popište svůj výzkumný projekt').fill('Nádorové mikroprostředí mozkových metastáz a prostorová transkriptomika.')
    await page.getByRole('button', { name: 'Hledat', exact: true }).click()
    await expect(page.getByRole('heading', { name: /upřesněme/ })).toBeVisible()
    await page.getByLabel('Odpověď na otázku 1').fill('Máme kohortu.')
    await page.getByRole('button', { name: 'Pokračovat' }).click()
    await expect(page.getByRole('heading', { name: /Ještě pár upřesnění/ })).toBeVisible()

    await page.goto('/')
    await page.getByRole('region', { name: 'Rozpracované projekty' }).getByRole('button', { name: /^Nádorové/ }).click()
    await expect(page.getByRole('heading', { name: /Ještě pár upřesnění/ })).toBeVisible()
    await expect(page.getByText('Máme kohortu.')).toBeVisible()
    await expect(page.getByText(/Analyzováno za/)).toBeVisible()
  })

  test('a project can be removed from the list', async ({ page }) => {
    await toTeams(page)
    await page.goto('/')
    const recent = page.getByRole('region', { name: 'Rozpracované projekty' })
    await recent.getByRole('button', { name: /Smazat projekt/ }).click()
    await expect(recent).toHaveCount(0)
  })
})
