import { expect, test, type Page } from "playwright/test"

// Candidato sintético usado somente nas respostas interceptadas deste teste.
const PICKED = "990001"
const CANDIDATE = {
  ano: 2026,
  sq_candidato: PICKED,
  uf: "BR",
  cargo: "presidente",
  nome_urna: "Candidato de teste local",
  numero_urna: "13",
  partido_sigla: "ZZZ",
  situacao_registro: "DEFERIDO",
  foto_path: null,
  slug: null,
  resumo: null,
  fase_eleitoral_2026: { fase_eleitoral: "segundo_turno", fase_turno: 1 },
}
const DEPUTY = {
  ...CANDIDATE,
  sq_candidato: "990003",
  uf: "SP",
  cargo: "deputado_federal",
  nome_urna: "Candidato de teste local para deputado",
  numero_urna: "1234",
}
const ROUND = {
  status: "ready",
  hasOfficialPhase: true,
  availableSlots: ["p"],
  presidentFinalistSlugs: [],
  governorFinalistSlugs: [],
  presidentFinalistSqs: [PICKED, "990002"],
  governorFinalistSqs: [],
  governorOutcome: "unknown",
  message: "Mock local de disputa em segundo turno.",
}

type ColinhaAction = "round" | "selection" | "search"
type AnalyticsEnvelope = { eventName: string; payload: unknown }
type AnalyticsRequest = { path: string; query: string; referer: string; method: string; contentType: string; envelope?: AnalyticsEnvelope }
type AnalyticsBeacon = { url: string; accepted: boolean; body: string }

async function installColinhaMocks(page: Page, options: { deferRound?: boolean } = {}) {
  const actions: ColinhaAction[] = []
  const analytics: AnalyticsRequest[] = []
  let requestLimitExceeded = false
  let releaseRound!: () => void
  const roundGate = new Promise<void>(resolve => { releaseRound = resolve })

  await page.addInitScript(() => {
    type BeaconCapture = { url: string; accepted: boolean; body: string }
    const pageWindow = window as Window & { __colinhaAnalyticsBeacons?: BeaconCapture[] }
    pageWindow.__colinhaAnalyticsBeacons = []
    const nativeSendBeacon = navigator.sendBeacon.bind(navigator)
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string | URL, data?: BodyInit | null) => {
        if (String(url) !== "/api/analytics/event") return nativeSendBeacon(url, data)
        const body = data instanceof Blob ? data.text() : Promise.resolve(typeof data === "string" ? data : "")
        const accepted = nativeSendBeacon(url, data)
        void body.then((text) => pageWindow.__colinhaAnalyticsBeacons?.push({ url: String(url), accepted, body: text }))
        return accepted
      },
    })
  })

  await page.route("**/api/colinha/candidatos", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      action?: ColinhaAction
      state?: { p?: string | null; turno?: number }
      slot?: string
    }
    const action = body.action ?? "search"
    actions.push(action)
    // Contém eventual regressão de ciclo sem permitir tráfego ilimitado no teste.
    if (actions.length > 8) {
      requestLimitExceeded = true
      await route.fulfill({ status: 429, contentType: "application/json", body: "{}" })
      return
    }

    if (action === "round" && options.deferRound) await roundGate
    const response = action === "round"
      ? { round: ROUND }
      : action === "selection"
        ? {
            candidates: [CANDIDATE, DEPUTY], snapshot: null, unavailable: false,
            ...(body.state?.turno === 2 ? { round: ROUND } : {}),
          }
        : { candidates: body.slot === "df" ? [DEPUTY] : body.slot === "p" ? [CANDIDATE] : [], snapshot: null, unavailable: false }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) })
  })

  await page.route("**/api/analytics/event", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const referer = request.headers().referer ?? ""
    let envelope: AnalyticsEnvelope | undefined
    const postData = request.postData()
    if (postData) {
      try {
        const candidate = JSON.parse(postData) as Partial<AnalyticsEnvelope>
        if (typeof candidate.eventName === "string" && candidate.payload && typeof candidate.payload === "object") {
          envelope = candidate as AnalyticsEnvelope
        }
      } catch {
        // Um Beacon pode chegar ao route hook sem body legível no WebKit.
      }
    }
    analytics.push({
      path: url.pathname,
      query: url.search,
      referer,
      method: request.method(),
      contentType: request.headers()["content-type"] ?? "",
      ...(envelope ? { envelope } : {}),
    })
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  })
  await page.route("**/api/colinha/card**", route => route.fulfill({ status: 200, contentType: "text/plain", body: "mock card" }))

  return {
    actions,
    analytics,
    beacons: () => page.evaluate(() => {
      const pageWindow = window as Window & { __colinhaAnalyticsBeacons?: AnalyticsBeacon[] }
      return pageWindow.__colinhaAnalyticsBeacons ?? []
    }),
    releaseRound,
    requestLimitExceeded: () => requestLimitExceeded,
  }
}

function counts(actions: ColinhaAction[]) {
  return {
    round: actions.filter(action => action === "round").length,
    selection: actions.filter(action => action === "selection").length,
    search: actions.filter(action => action === "search").length,
  }
}

test("link de turno 1 preserva escolha, mostra aviso e analytics envia só o formato", async ({ page }) => {
  const mock = await installColinhaMocks(page)
  await page.goto(`/colinha?uf=SP&p=${PICKED}`)
  await expect(page.getByRole("heading", { name: "Sua colinha" })).toBeVisible()

  const url = new URL(page.url())
  expect(url.searchParams.get("p")).toBe(PICKED)
  await expect(page.getByText(CANDIDATE.nome_urna, { exact: true })).toBeVisible()
  await expect(page.getByText(/Esta colinha é do 1º turno/)).toBeVisible()
  await expect.poll(() => counts(mock.actions)).toEqual({ round: 1, selection: 1, search: 0 })

  const popupPromise = page.waitForEvent("popup")
  await page.getByRole("link", { name: /Gerar imagem para feed/ }).click()
  const popup = await popupPromise
  await popup.close()

  await expect.poll(() => mock.analytics.length).toBe(1)
  await expect.poll(async () => (await mock.beacons()).length).toBe(1)
  const request = mock.analytics[0]
  const beacon = (await mock.beacons())[0]
  const event = JSON.parse(beacon.body) as AnalyticsEnvelope
  expect(request.path).toBe("/api/analytics/event")
  expect(request.query).toBe("")
  expect(request.referer).not.toContain("/colinha")
  expect(request.method).toBe("POST")
  expect(request.contentType).toBe("application/json")
  expect(beacon.url).toBe("/api/analytics/event")
  expect(beacon.accepted).toBe(true)
  expect(event.eventName).toBe("Colinha Share")
  expect(event.payload).toEqual({ format: "feed" })
  if (request.envelope) expect(request.envelope).toEqual(event)
  expect(JSON.stringify({ request, beacon, event })).not.toContain(PICKED)
  expect(mock.requestLimitExceeded()).toBe(false)
})

test("link de turno 2 com escolha preserva estado e faz uma consulta de seleção", async ({ page }) => {
  const mock = await installColinhaMocks(page)
  await page.goto(`/colinha?uf=SP&turno=2&p=${PICKED}`)
  await expect(page.getByRole("heading", { name: "Sua colinha" })).toBeVisible()

  const url = new URL(page.url())
  expect(url.searchParams.get("turno")).toBe("2")
  expect(url.searchParams.get("p")).toBe(PICKED)
  await expect(page.getByText(CANDIDATE.nome_urna, { exact: true })).toBeVisible()
  await expect.poll(() => counts(mock.actions)).toEqual({ round: 1, selection: 1, search: 0 })
  expect(mock.requestLimitExceeded()).toBe(false)
})

test("só o botão explícito para montar o turno 2 limpa a escolha do turno 1", async ({ page }) => {
  const mock = await installColinhaMocks(page)
  await page.goto(`/colinha?uf=SP&p=${PICKED}`)
  await expect(page.getByText(CANDIDATE.nome_urna, { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Montar colinha do 2º turno" })).toBeVisible()

  const beforeButton = mock.actions.length
  await page.getByRole("button", { name: "Montar colinha do 2º turno" }).click()
  await expect(page).toHaveURL(/turno=2/)
  const url = new URL(page.url())
  expect(url.searchParams.get("p")).toBeNull()
  expect(url.searchParams.get("turno")).toBe("2")
  await expect.poll(() => mock.actions.slice(beforeButton).filter(action => action === "selection").length).toBe(0)
  await expect.poll(() => mock.actions.slice(beforeButton).filter(action => action === "search").length).toBe(1)
  expect(mock.requestLimitExceeded()).toBe(false)
})

test("resposta tardia de segundo turno não apaga escolha feita durante consulta", async ({ page }) => {
  const mock = await installColinhaMocks(page, { deferRound: true })
  await page.goto("/colinha?uf=SP")
  await expect(page.getByRole("heading", { name: "Deputado federal" })).toBeVisible()
  await expect.poll(() => mock.actions.filter(action => action === "round").length).toBe(1)
  await expect(page.getByRole("button", { name: new RegExp(DEPUTY.nome_urna) })).toBeVisible()

  await page.getByRole("button", { name: new RegExp(DEPUTY.nome_urna) }).click()
  await expect(page).toHaveURL(new RegExp(`df=${DEPUTY.sq_candidato}`))
  mock.releaseRound()

  await page.getByRole("button", { name: "Conferir e compartilhar", exact: true }).click()
  await expect(page.getByText(/Esta colinha é do 1º turno/)).toBeVisible()
  await expect(page.getByText(DEPUTY.nome_urna, { exact: true })).toBeVisible()
  const url = new URL(page.url())
  expect(url.searchParams.get("df")).toBe(DEPUTY.sq_candidato)
  expect(url.searchParams.has("turno")).toBe(false)
  await expect.poll(() => counts(mock.actions)).toEqual({ round: 1, selection: 1, search: 2 })
  expect(mock.requestLimitExceeded()).toBe(false)
})

test("turno 2 iniciado na tela permite escolher finalista, conferir e gerar imagem", async ({ page }) => {
  const mock = await installColinhaMocks(page)
  await page.goto(`/colinha?uf=SP&p=${PICKED}`)
  await expect(page.getByRole("navigation", { name: "Progresso da colinha" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Montar colinha do 2º turno" })).toBeVisible()

  await page.getByRole("button", { name: "Montar colinha do 2º turno" }).click()
  await expect(page).toHaveURL(/turno=2/)
  expect(new URL(page.url()).searchParams.has("p")).toBe(false)
  await expect(page.getByRole("button", { name: "Conferir e compartilhar", exact: true })).toBeVisible()
  await test.info().attach("colinha-segundo-turno-cta-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
  await page.getByRole("button", { name: "Conferir e compartilhar", exact: true }).click()
  await expect(page.getByText("Conferência · SP · 2º turno", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Escolher candidato para Presidente" }).click()
  await expect(page.getByRole("button", { name: new RegExp(CANDIDATE.nome_urna) })).toBeVisible()
  await page.getByRole("button", { name: new RegExp(CANDIDATE.nome_urna) }).click()
  await expect(page).toHaveURL(/turno=2/)
  expect(new URL(page.url()).searchParams.get("p")).toBe(PICKED)
  await expect(page.getByText("Conferência · SP · 2º turno", { exact: true })).toBeVisible()
  await expect(page.getByText(CANDIDATE.nome_urna, { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /Gerar imagem para feed/ })).toBeVisible()
  await test.info().attach("colinha-segundo-turno-conferencia", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })

  const popupPromise = page.waitForEvent("popup")
  await page.getByRole("link", { name: /Gerar imagem para feed/ }).click()
  const popup = await popupPromise
  await popup.close()
  await expect.poll(() => mock.analytics.length).toBe(1)
  await expect.poll(async () => (await mock.beacons()).length).toBe(1)
  const request = mock.analytics[0]
  const beacon = (await mock.beacons())[0]
  const event = JSON.parse(beacon.body) as AnalyticsEnvelope
  expect(request.path).toBe("/api/analytics/event")
  expect(request.query).toBe("")
  expect(request.referer).not.toContain("/colinha")
  expect(beacon.accepted).toBe(true)
  expect(event).toEqual({ eventName: "Colinha Share", payload: { format: "feed" } })
  expect(JSON.stringify({ request, beacon, event })).not.toContain(PICKED)
  expect(mock.requestLimitExceeded()).toBe(false)
})
