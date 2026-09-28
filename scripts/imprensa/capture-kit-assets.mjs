import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const base = process.argv[2]
if (!base) throw new Error('Uso: node scripts/imprensa/capture-kit-assets.mjs http://127.0.0.1:PORT')

const output = resolve('public/imprensa')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'celular', width: 375, height: 812 },
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
    const response = await page.goto(new URL('/imprensa', base).href, { waitUntil: 'networkidle', timeout: 90_000 })
    if (response?.status() !== 200) throw new Error(`Sala HTTP ${response?.status()} em ${viewport.name}`)
    await page.locator('h1').getByText('Sala de imprensa').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({ content: 'nextjs-portal, #numeros, header:has(.menu-btn) { display: none !important; }' })
    await page.screenshot({ path: resolve(output, `sala-${viewport.name}.png`), fullPage: true, animations: 'disabled' })
    if (viewport.name === 'desktop') {
      await page.emulateMedia({ media: 'screen' })
      const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
      await page.pdf({ path: resolve(output, 'sala-de-imprensa.pdf'), width: '1440px', height: `${height + 300}px`, printBackground: true, preferCSSPageSize: false })
    }
    await page.close()
  }
  console.log('KIT_ASSETS_OK desktop celular pdf')
} finally {
  await browser.close()
}
