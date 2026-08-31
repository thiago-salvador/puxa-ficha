import { pathToFileURL } from "node:url"
import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright"

export function releaseBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== "https:") throw new Error("A URL do smoke deve usar HTTPS")
  const allowed = url.hostname === "puxaficha.com.br" || url.hostname.endsWith(".vercel.app")
  if (!allowed) throw new Error("Host do smoke não permitido")
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("A URL do smoke deve conter somente a origem")
  }
  return url.origin
}

const BASE_URL = releaseBaseUrl(process.env.PF_BASE_URL ?? "https://puxaficha.com.br")
const NAVIGATION_TIMEOUT_MS = 60_000
const ACTION_TIMEOUT_MS = 20_000
const SOCIAL_CARD_MIN_BYTES = 80 * 1024

export const BRAZIL_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const

const MONEY_COLLECTION_KEYS = [
  "patrimonio",
  "patrimonio_eleicoes",
  "financiamento",
  "financiamento_eleicoes",
  "maiores_doadores",
  "gastos_parlamentares",
  "gastos_executivo",
] as const

interface SmokeResult {
  status: "PASS" | "FAIL"
  item: string
  details: string
}

interface ProfileCheck {
  hero: "foto" | "vazio_legitimo"
  money: "presente" | "nao_aplicavel"
  jsonLd: number
}

export class PartialCheckFailure<T = unknown> extends Error {
  constructor(message: string, readonly value: T) {
    super(message)
    this.name = "PartialCheckFailure"
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function candidatePathFromHref(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href, BASE_URL)
    const match = url.pathname.match(/^\/candidato\/([a-z0-9-]+)\/?$/i)
    return match ? `/candidato/${match[1]}` : null
  } catch {
    return null
  }
}

export function hasMoneyData(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile) return false
  const nested = profile.data
  const source = nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : profile
  return MONEY_COLLECTION_KEYS.some((key) => {
    const value = source[key]
    return Array.isArray(value) ? value.length > 0 : Boolean(value)
  })
}

export async function runWithRetry<T>(
  label: string,
  operation: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown
  // Uma PartialCheckFailure carrega resultado parcial (ex.: paths achados na
  // home). Se a tentativa seguinte falhar por transporte, o parcial da
  // anterior ainda é o melhor resultado: guardar separado e priorizar.
  let lastPartial: PartialCheckFailure | null = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (error instanceof PartialCheckFailure) lastPartial = error
    }
  }
  if (lastPartial) {
    throw new PartialCheckFailure(`${label}: ${lastPartial.message}`, lastPartial.value)
  }
  throw new Error(`${label}: ${errorMessage(lastError)}`)
}

export function formatResultLine(result: SmokeResult): string {
  return `${result.status} ${result.item} ${result.details}`.trim()
}

async function candidatePathsIn(root: Locator): Promise<string[]> {
  const hrefs = await root.locator('a[href*="/candidato/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )
  return Array.from(
    new Set(hrefs.map(candidatePathFromHref).filter((path): path is string => Boolean(path))),
  )
}

async function waitForCandidatePaths(
  root: Locator,
  minimum: number,
  timeoutMs = ACTION_TIMEOUT_MS,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  let paths: string[] = []
  while (Date.now() < deadline) {
    paths = await candidatePathsIn(root)
    if (paths.length >= minimum) return paths
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  // Timeout com parte dos cards achada ainda é resultado: preservar os paths
  // para o runner seguir com as fichas e cards descobertos.
  throw new PartialCheckFailure(
    `esperados ao menos ${minimum} links de ficha, encontrados ${paths.length}`,
    paths,
  )
}

async function gotoPublicPage(page: Page, path: string): Promise<void> {
  page.setDefaultTimeout(ACTION_TIMEOUT_MS)
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS)
  const response = await page.goto(new URL(path, BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  })
  invariant(response, `navegacao sem resposta em ${path}`)
  invariant(response.ok(), `${path} respondeu HTTP ${response.status()}`)
}

async function withPage<T>(
  context: BrowserContext,
  path: string,
  check: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await context.newPage()
  try {
    await gotoPublicPage(page, path)
    return await check(page)
  } finally {
    await page.close()
  }
}

async function checkHome(context: BrowserContext): Promise<string[]> {
  return withPage(context, "/", async (page) => {
    const heading = page.getByRole("heading", { name: "Presidenciáveis", exact: true })
    await heading.waitFor({ state: "visible" })
    const gridSection = heading.locator("xpath=ancestor::section[1]/following-sibling::section[1]")
    const paths = await waitForCandidatePaths(gridSection, 13)
    const failures: string[] = []
    if (paths.length !== 13) failures.push(`grade presidencial tem ${paths.length} fichas, esperado 13`)
    if (!paths.includes("/candidato/pablo-marcal")) failures.push("pablo-marcal ausente da grade presidencial")

    // Vocabulário 16/08 vale para TEXTO VISÍVEL. O HTML cru carrega o payload
    // RSC com o token de máquina `status:"pre-candidato"` (valor legado do
    // banco, mapeado por ui-labels) e URLs de matérias citadas; nenhum dos
    // dois é o site dizendo o termo. Auditar innerText, não page.content().
    const visibleText = (await page.locator("body").innerText()).toLocaleLowerCase("pt-BR")
    if (visibleText.includes("pré-candidat")) failures.push('texto visível contém "pré-candidato"')
    if (visibleText.includes("pre-candidat")) failures.push('texto visível contém "pre-candidato"')

    const avatarImages = await page.locator('img[src*="ui-avatars" i]').count()
    if (avatarImages !== 0) failures.push(`${avatarImages} imagens ui-avatars encontradas`)
    if (failures.length > 0) throw new PartialCheckFailure(failures.join("; "), paths)
    return paths
  })
}

async function checkUf(context: BrowserContext, uf: string): Promise<string[]> {
  return withPage(context, `/uf/${uf.toLowerCase()}`, async (page) => {
    const heading = page.getByRole("heading", { name: /^Candidatos em /i })
    await heading.waitFor({ state: "visible" })
    const gridSection = heading.locator("xpath=ancestor::section[1]/following-sibling::section[1]")
    const paths = await waitForCandidatePaths(gridSection, 1)

    // Selo de proveniência da candidatura vive na FICHA, não no card da
    // grade de UF (conferido no DOM real de /uf/ac em 16/08). Aqui o
    // contrato é: página renderiza, tem cards e não vaza vocabulário banido.
    const visibleText = (await page.locator("body").innerText()).toLocaleLowerCase("pt-BR")
    if (visibleText.includes("pré-candidat") || visibleText.includes("pre-candidat")) {
      throw new PartialCheckFailure('texto visível contém "pré-candidato"', paths)
    }
    return paths
  })
}

async function profileHasLegitimateEmptyPhoto(page: Page): Promise<boolean> {
  const explicitMarker = await page.locator([
    "[data-pf-hero-photo-empty]",
    '[data-pf-photo-state="empty"]',
    '[data-pf-profile-photo-state="empty"]',
  ].join(", ")).count()
  if (explicitMarker > 0) return true

  return page.getByText(
    /foto (?:oficial )?(?:ainda )?(?:não|nao) (?:disponível|disponivel|localizada|coletada)/i,
  ).count().then((count) => count > 0)
}

async function checkProfile(context: BrowserContext, candidatePath: string): Promise<ProfileCheck> {
  return withPage(context, candidatePath, async (page) => {
    const heroName = page.locator("[data-pf-hero-name]")
    await heroName.waitFor({ state: "visible" })

    const photo = page.locator('img[alt^="Foto de "]').first()
    const hasPhoto = await photo.isVisible().catch(() => false)
    const hasEmptyState = hasPhoto ? false : await profileHasLegitimateEmptyPhoto(page)
    invariant(hasPhoto || hasEmptyState, "hero sem foto e sem estado vazio legítimo")

    const response = await context.request.get(new URL(`/api/candidato-profile${candidatePath.slice("/candidato".length)}`, BASE_URL).toString(), {
      timeout: NAVIGATION_TIMEOUT_MS,
    })
    invariant(response.ok(), `API da ficha respondeu HTTP ${response.status()}`)
    const profile = await response.json() as Record<string, unknown>
    const moneyExpected = hasMoneyData(profile)
    if (moneyExpected) {
      const moneyTab = page.getByRole("tab", { name: /^Dinheiro(?:\s|\(|$)/i })
      await moneyTab.waitFor({ state: "visible" })
      await moneyTab.click()
      await page.locator('#profile-panel-dinheiro[role="tabpanel"]').waitFor({ state: "visible" })
    }

    const sourcesFooter = page.locator("[data-pf-profile-server-disclosure]")
    invariant(await sourcesFooter.count() > 0, "rodapé de fontes ausente")

    const jsonLdBlocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    invariant(jsonLdBlocks.length > 0, "JSON-LD ausente")
    for (const [index, block] of jsonLdBlocks.entries()) {
      try {
        JSON.parse(block)
      } catch {
        throw new Error(`JSON-LD ${index + 1} inválido`)
      }
    }

    return {
      hero: hasPhoto ? "foto" : "vazio_legitimo",
      money: moneyExpected ? "presente" : "nao_aplicavel",
      jsonLd: jsonLdBlocks.length,
    }
  })
}

async function checkQuiz(context: BrowserContext): Promise<{ questions: number; candidates: number }> {
  const page = await context.newPage()
  const consoleErrors: string[] = []
  try {
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => consoleErrors.push(error.message))
    await gotoPublicPage(page, "/quiz")

    const start = page.getByRole("button", { name: "Começar", exact: true })
    if (await start.count() > 0) {
      await start.click()
    } else {
      await page.getByRole("button", { name: /^Presidente$/i }).click()
    }
    await page.waitForURL(/\/quiz\/perguntas\?cargo=Presidente/i)

    let questions = 0
    while (page.url().includes("/quiz/perguntas") && questions < 50) {
      const radio = page.getByRole("radio", { name: "Neutro ou sem opinião" })
      await radio.waitFor({ state: "visible" })
      const currentQuestion = (await page.locator("h1, h2, legend").first().innerText()).trim()
      await radio.click()
      await page.getByRole("button", { name: /^Continuar$/i }).click()
      questions += 1
      // Sincronizar por sinal de estado, não por delay fixo: ou a URL virou
      // resultado, ou a pergunta visível mudou. Timeout fixo curto deixava a
      // iteração seguinte correr durante a navegação e gerar falso negativo.
      await Promise.race([
        page.waitForURL(/\/quiz\/resultado\?/, { timeout: ACTION_TIMEOUT_MS }).catch(() => undefined),
        page
          .waitForFunction(
            (previous) => {
              const el = document.querySelector("h1, h2, legend")
              const text = el?.textContent?.trim() ?? ""
              return text.length > 0 && text !== previous
            },
            currentQuestion,
            { timeout: ACTION_TIMEOUT_MS },
          )
          .catch(() => undefined),
      ])
    }

    invariant(page.url().includes("/quiz/resultado?"), `quiz não chegou ao resultado após ${questions} perguntas`)
    await page.getByRole("heading", { name: /Sua comparação/i }).waitFor({ state: "visible" })
    const candidates = await page.locator('article a[href^="/candidato/"]').count()
    invariant(candidates > 0, "resultado do quiz sem candidatos")
    invariant(consoleErrors.length === 0, `erros de console: ${consoleErrors.join(" | ")}`)
    return { questions, candidates }
  } finally {
    await page.close()
  }
}

async function checkComparator(context: BrowserContext): Promise<number> {
  return withPage(context, "/comparar", async (page) => {
    const rows = page.locator("[data-pf-comparador-row]")
    await rows.first().waitFor({ state: "visible" })
    invariant(await rows.count() >= 2, "comparador tem menos de dois candidatos")

    await rows.nth(0).getByRole("button", { name: /^Adicionar .* da comparação$/i }).click()
    await rows.nth(1).getByRole("button", { name: /^Adicionar .* da comparação$/i }).click()
    const comparison = page.locator('[data-pf-comparacao-root][data-pf-comparacao-count="2"]')
    await comparison.waitFor({ state: "visible" })
    const compared = await comparison.locator("[data-pf-comparacao-candidato]").count()
    invariant(compared === 2, `comparador renderizou ${compared} candidatos, esperado 2`)
    return compared
  })
}

async function checkGlobalSearch(context: BrowserContext): Promise<string> {
  return withPage(context, "/", async (page) => {
    await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
    const input = page.getByRole("combobox", { name: "Buscar no site" })
    await input.fill("pablo marcal")
    const target = page.getByRole("option").filter({ hasText: /Pablo Marçal/i }).first()
    await target.waitFor({ state: "visible" })
    await target.click()
    await page.waitForURL(/\/candidato\/pablo-marcal\/?$/)
    return "/candidato/pablo-marcal"
  })
}

async function checkSocialCard(context: BrowserContext, candidatePath: string): Promise<number> {
  const slug = candidatePath.split("/").filter(Boolean).at(-1)
  invariant(slug, `slug inválido em ${candidatePath}`)
  const response = await context.request.get(new URL(`/api/card/${slug}`, BASE_URL).toString(), {
    timeout: NAVIGATION_TIMEOUT_MS,
  })
  invariant(response.status() === 200, `HTTP ${response.status()}`)
  const contentType = response.headers()["content-type"] ?? ""
  invariant(contentType.toLowerCase().startsWith("image/png"), `content-type ${contentType || "ausente"}`)
  const body = await response.body()
  invariant(body.byteLength > SOCIAL_CARD_MIN_BYTES, `${body.byteLength} bytes, esperado > ${SOCIAL_CARD_MIN_BYTES}`)
  return body.byteLength
}

async function main(): Promise<number> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: "pt-BR",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  })
  const results: SmokeResult[] = []

  const collect = async <T>(
    item: string,
    operation: () => Promise<T>,
    details: (value: T) => string,
  ): Promise<T | null> => {
    try {
      const value = await runWithRetry(item, () => operation())
      const result: SmokeResult = { status: "PASS", item, details: details(value) }
      results.push(result)
      console.log(formatResultLine(result))
      return value
    } catch (error) {
      const message = errorMessage(error)
      const prefix = `${item}: `
      const result: SmokeResult = {
        status: "FAIL",
        item,
        details: message.startsWith(prefix) ? message.slice(prefix.length) : message,
      }
      results.push(result)
      console.log(formatResultLine(result))
      if (error instanceof PartialCheckFailure) return error.value as T
      return null
    }
  }

  try {
    const presidentialPaths = await collect(
      "home",
      () => checkHome(context),
      (paths) => `cards=${paths.length} pre_candidato=0 ui_avatars=0 pablo_marcal=1`,
    )

    const governorPaths = new Set<string>()
    for (const uf of BRAZIL_UFS) {
      const paths = await collect(
        `uf/${uf}`,
        () => checkUf(context, uf),
        (found) => `cards=${found.length} selo_situacao=presente`,
      )
      for (const path of paths ?? []) {
        if (governorPaths.size < 5) governorPaths.add(path)
      }
    }

    if (presidentialPaths?.length === 13) {
      for (const path of presidentialPaths) {
        await collect(
          `perfil${path}`,
          () => checkProfile(context, path),
          (check) => `hero=${check.hero} dinheiro=${check.money} fontes=presente jsonld=${check.jsonLd}`,
        )
      }
    } else {
      const result: SmokeResult = {
        status: "FAIL",
        item: "perfis/presidencia",
        details: `amostra indisponível, fichas descobertas=${presidentialPaths?.length ?? 0}`,
      }
      results.push(result)
      console.log(formatResultLine(result))
    }

    const governorSample = Array.from(governorPaths).slice(0, 5)
    if (governorSample.length === 5) {
      for (const path of governorSample) {
        await collect(
          `perfil${path}`,
          () => checkProfile(context, path),
          (check) => `hero=${check.hero} dinheiro=${check.money} fontes=presente jsonld=${check.jsonLd}`,
        )
      }
    } else {
      const result: SmokeResult = {
        status: "FAIL",
        item: "perfis/governadores",
        details: `amostra=${governorSample.length}, esperado=5`,
      }
      results.push(result)
      console.log(formatResultLine(result))
    }

    await collect(
      "quiz",
      () => checkQuiz(context),
      (check) => `perguntas=${check.questions} candidatos_resultado=${check.candidates} console_errors=0`,
    )
    await collect(
      "comparador",
      () => checkComparator(context),
      (count) => `candidatos=${count}`,
    )
    await collect(
      "busca-global",
      () => checkGlobalSearch(context),
      (path) => `destino=${path}`,
    )

    const socialCardPaths = presidentialPaths
      ? [
          "/candidato/pablo-marcal",
          ...presidentialPaths.filter((path) => path !== "/candidato/pablo-marcal").slice(0, 2),
        ]
      : []
    if (socialCardPaths.length === 3) {
      for (const path of socialCardPaths) {
        const slug = path.split("/").filter(Boolean).at(-1) ?? "slug-invalido"
        await collect(
          `card/${slug}`,
          () => checkSocialCard(context, path),
          (bytes) => `status=200 content_type=image/png bytes=${bytes}`,
        )
      }
    } else {
      const result: SmokeResult = {
        status: "FAIL",
        item: "cards-sociais",
        details: `alvos=${socialCardPaths.length}, esperado=3`,
      }
      results.push(result)
      console.log(formatResultLine(result))
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const passed = results.filter((result) => result.status === "PASS").length
  const failed = results.length - passed
  console.log(`TOTAL pass=${passed} fail=${failed} items=${results.length}`)
  return failed === 0 ? 0 : 1
}

const executedPath = process.argv[1]
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) {
  void main()
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      console.error(`FAIL fatal ${errorMessage(error)}`)
      process.exitCode = 1
    })
}
