import { readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { expect, test } from "playwright/test"

async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Expected an ephemeral HTTP port")
  return address.port
}

async function stop(server: Server) {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
}

test("installed-site navigation gives an offline notice without storing electoral data", async ({ page }) => {
  // Verify the actual application installs and controls navigations with this worker.
  await page.goto("/sobre")
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/offline-worker\.js$/)

  // A refused connection exercises fetch rejection in both browsers. WebKit's
  // setOffline emulation reports an internal navigation error in this scenario.
  // Serve the exact production worker, with no mocked fetch or cached responses.
  const worker = readFileSync("public/offline-worker.js", "utf8")
  const installedWorker = await page.request.get("/offline-worker.js")
  expect(installedWorker.ok()).toBe(true)
  expect(await installedWorker.text()).toBe(worker)
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store")
    if (request.url === "/offline-worker.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8")
      response.end(worker)
      return
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head>
      <body><h1>Conexão restabelecida</h1><script>
        navigator.serviceWorker.register('/offline-worker.js', { scope: '/', updateViaCache: 'none' });
      </script></body></html>`)
  })
  const port = await listen(server)
  const origin = `http://127.0.0.1:${port}`
  try {
    await page.goto(origin)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload()
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/offline-worker.js`)
    await stop(server)

    const offlineResponse = await page.goto(`${origin}/candidato/offline-test`, { waitUntil: "domcontentloaded" })
    expect(offlineResponse?.status()).toBe(503)
    expect(offlineResponse?.headers()["cache-control"]).toBe("no-store")
    await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Tentar novamente" })).toBeVisible()
    expect(await page.evaluate(() => caches.keys())).toEqual([])

    await listen(server, port)
    const [onlineResponse] = await Promise.all([
      page.waitForResponse((response) => response.url() === `${origin}/candidato/offline-test` && response.request().isNavigationRequest()),
      page.getByRole("link", { name: "Tentar novamente" }).click(),
    ])
    expect(onlineResponse.status()).toBe(200)
    await expect(page.getByRole("heading", { name: "Conexão restabelecida" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Sem conexão" })).toHaveCount(0)
    expect(await page.evaluate(() => caches.keys())).toEqual([])
  } finally {
    await stop(server)
  }
  await page.goto("/sobre")
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toHaveCount(0)
})
