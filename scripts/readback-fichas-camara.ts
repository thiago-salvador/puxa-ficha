/**
 * Readback público das fichas do backfill da Câmara (issue #138, item f).
 *
 * Rodada 3 da vistoria dos PRs #141/#142: o loop anterior no STATUS só
 * procurava um rótulo no HTML e o ramo de fallback do echo convertia toda
 * falha em sucesso (duas fichas falhando terminavam com RC=0). Este script é
 * fail-closed: QUALQUER ficha reprovando derruba o processo com código 1, e
 * "não consegui verificar" também é reprovação, nunca aprovação.
 *
 * O que ele prova, por ficha:
 *   1. A API pública expõe o total, a composição por natureza
 *      (`projetos_lei_natureza_projetos_total`) e a contagem POR FONTE
 *      (`projetos_lei_camara_total`), os campos que o DTO público omitia.
 *   2. Os números são coerentes entre si (0 <= projetosLei <= total, e
 *      camara <= total).
 *   3. A contagem de fonte Câmara saiu da assinatura do corte. Rodada 4 da
 *      vistoria: comparar o TOTAL global com 100 repetia o erro da régua da
 *      rodada 1, porque sete das dez fichas já passam de 100 no total somando
 *      Senado e curadoria, com as 100 da Câmara intactas. A dimensão é a mesma
 *      `projetosCamara` da régua.
 *   4. O CARD do DOM (ancorado por `data-pf-overview-legislacao`) exibe
 *      exatamente o total da API e o rótulo coerente com a composição, no
 *      mesmo card. `includes` no HTML inteiro aprovava um card errado com o
 *      texto certo no rodapé.
 *
 * O que ele NÃO substitui: `npm run audit:cobertura`, que compara o banco com a
 * cardinalidade declarada pela fonte. Os dois juntos fecham o ciclo
 * banco -> API -> DOM.
 *
 * Uso:
 *   npx tsx scripts/readback-fichas-camara.ts                    # produção
 *   npx tsx scripts/readback-fichas-camara.ts --base http://localhost:3000
 */

import { loadCandidatos } from "./lib/helpers"
import { parseDeclaredCountFromLinks } from "./lib/ingest-camara"

const SLUGS = [
  "alan-rick",
  "cabo-daciolo",
  "dr-daniel",
  "efraim-filho",
  "marconi-perillo",
  "marcos-rogerio",
  "professora-dorinha",
  "renan-filho",
  "ronaldo-caiado",
  "wellington-fagundes",
]

/**
 * Cardinalidade que a Câmara declara para o candidato, em 1 request. O
 * invariante do readback é "contagem pública == declarada pela fonte", nunca
 * um limiar: o backfill real provou que `renan-filho` tem exatamente 100
 * declaradas (completo, não truncado), e um check `> 100` reprovaria acervo
 * completo por coincidir com a assinatura do corte.
 */
async function declaradoNaCamara(idCamara: number): Promise<number | null> {
  const params = new URLSearchParams({
    idDeputadoAutor: String(idCamara),
    ordem: "DESC",
    ordenarPor: "id",
    itens: "1",
    pagina: "1",
  })
  let r: Response
  try {
    r = await fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(45_000),
    })
  } catch {
    return null
  }
  if (!r.ok) return null
  const json = (await r.json()) as {
    dados?: unknown[]
    links?: { rel: string; href: string }[]
  }
  return parseDeclaredCountFromLinks(json.links, (json.dados ?? []).length)
}

interface Veredicto {
  slug: string
  ok: boolean
  detalhe: string
}

import type { Browser } from "playwright"

let browserCompartilhado: Browser | null = null

async function obterBrowser(): Promise<Browser> {
  if (!browserCompartilhado) {
    const { chromium } = await import("playwright")
    browserCompartilhado = await chromium.launch({ headless: true })
  }
  return browserCompartilhado
}

/**
 * Renderiza a ficha num Chromium headless e devolve o DOM serializado depois
 * que o card ancorado montar. Viewport desktop de propósito: o defer da ficha
 * monta via requestAnimationFrame acima de 640px, sem exigir scroll.
 */
async function renderizarFicha(url: string): Promise<string | null> {
  const browser = await obterBrowser()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 })
    await page.waitForSelector("[data-pf-overview-legislacao-card]", { timeout: 45_000 })
    return await page.content()
  } catch {
    // Sem o card no DOM renderizado, devolve o que houver: o veredito reprova
    // com a mensagem de card ausente, que é o diagnóstico verdadeiro.
    try {
      return await page.content()
    } catch {
      return null
    }
  } finally {
    await page.close()
  }
}

function baseUrl(): string {
  const i = process.argv.indexOf("--base")
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].replace(/\/$/, "")
  return "https://www.puxaficha.com.br"
}

async function verificarFicha(
  base: string,
  slug: string,
  idCamara: number | null
): Promise<Veredicto> {
  let resposta: Response
  try {
    resposta = await fetch(`${base}/api/candidato-profile/${slug}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(45_000),
    })
  } catch {
    return { slug, ok: false, detalhe: "API pública indisponível ou excedeu 45s" }
  }
  if (!resposta.ok) {
    return { slug, ok: false, detalhe: `API respondeu ${resposta.status}` }
  }
  // A rota embrulha o DTO em `{ data, sourceStatus, sourceMessage }`.
  const corpo = (await resposta.json()) as {
    data?: {
      projetos_lei_total?: number
      projetos_lei_natureza_projetos_total?: number | null
      projetos_lei_camara_total?: number | null
    }
  }
  const dto = corpo.data
  if (!dto) {
    return { slug, ok: false, detalhe: "resposta da API sem o envelope data" }
  }

  const total = dto.projetos_lei_total
  const projetosLei = dto.projetos_lei_natureza_projetos_total
  const camara = dto.projetos_lei_camara_total
  if (typeof total !== "number") {
    return { slug, ok: false, detalhe: "API sem projetos_lei_total" }
  }
  if (typeof projetosLei !== "number") {
    return {
      slug,
      ok: false,
      detalhe: "API sem projetos_lei_natureza_projetos_total: a composição não é verificável",
    }
  }
  if (typeof camara !== "number") {
    return {
      slug,
      ok: false,
      detalhe: "API sem projetos_lei_camara_total: a assinatura do corte não é verificável",
    }
  }
  if (projetosLei < 0 || projetosLei > total || camara < 0 || camara > total) {
    return {
      slug,
      ok: false,
      detalhe: `números incoerentes: projetosLei=${projetosLei}, camara=${camara}, total=${total}`,
    }
  }
  // O invariante do backfill compara a superfície pública com o que a FONTE
  // declara, na dimensão por fonte (rodada 4). Limiar fixo não serve: o
  // backfill real provou renan-filho completo com exatamente 100 declaradas.
  let notaCamara: string
  if (idCamara == null) {
    // Sem id da Câmara não há acervo de ingest a conferir (caso dr-daniel: as
    // linhas fonte='Camara' dele vieram de curadoria nominal). A ressalva é
    // declarada no veredito, nunca engolida.
    notaCamara = `sem id da Câmara no seed; invariante de backfill não se aplica (${camara} linhas de curadoria)`
  } else {
    const declarado = await declaradoNaCamara(idCamara)
    if (declarado == null) {
      return {
        slug,
        ok: false,
        detalhe: "a Câmara não respondeu a cardinalidade declarada; sem denominador não há aprovação",
      }
    }
    if (camara !== declarado) {
      return {
        slug,
        ok: false,
        detalhe: `fonte Câmara declara ${declarado} e a API pública tem ${camara}`,
      }
    }
    notaCamara = `camara ${camara} == declarado ${declarado}`
  }

  // O perfil monta no CLIENTE (DeferredCandidatoProfileClient adia o mount e
  // busca a ficha em /api/candidato-profile): o card nunca existe no HTML que
  // um fetch devolve. A perna DOM só é verificável em browser real; o DOM
  // renderizado serializado alimenta a MESMA função pura do veredito.
  const html = await renderizarFicha(`${base}/candidato/${slug}`)
  if (html == null) {
    return { slug, ok: false, detalhe: "o browser não conseguiu renderizar a ficha" }
  }
  const misto = projetosLei < total
  const rotuloEsperado = misto ? "Proposições de autoria" : "Projetos de lei"

  const cartao = avaliarCardNoHtml(html, total, rotuloEsperado)
  if (!cartao.ok) {
    return { slug, ok: false, detalhe: cartao.detalhe }
  }

  return {
    slug,
    ok: true,
    detalhe: `${notaCamara}, total ${total}, projetos de lei ${projetosLei}, ${cartao.detalhe}`,
  }
}

/**
 * Veredito sobre o CARD de legislação num HTML de ficha.
 *
 * Rodada 5 da vistoria: a versão anterior procurava o rótulo numa janela de
 * 600 caracteres depois da âncora, que é proxy de proximidade, não prova de
 * pertencimento. O mock dela (número certo no card, rótulo errado dentro dele
 * e rótulo certo só no rodapé) passava, porque o rótulo errado não casava a
 * alternância e o regex avançava até o rodapé.
 *
 * Agora o card serializa número e rótulo no MESMO atributo do MESMO elemento
 * (`data-pf-overview-legislacao-card="<total>::<rótulo>"`, carimbado pelo
 * próprio render do StatCard), e o veredito compara os dois por igualdade
 * exata. Não há janela: ou o card afirma o par certo, ou reprova.
 *
 * Exportada pura de propósito: `tests/readback-card.test.ts` roda o mock da
 * vistoria como regressão, sem rede.
 */
export function avaliarCardNoHtml(
  html: string,
  totalEsperado: number,
  rotuloEsperado: string
): { ok: boolean; detalhe: string } {
  const m = html.match(/data-pf-overview-legislacao-card="([^"]*)"/)
  if (!m) {
    return {
      ok: false,
      detalhe: "DOM sem o card ancorado (data-pf-overview-legislacao-card)",
    }
  }
  const separador = m[1].indexOf("::")
  if (separador < 0) {
    return { ok: false, detalhe: `âncora do card malformada: "${m[1]}"` }
  }
  const totalNoCard = Number(m[1].slice(0, separador))
  const rotuloNoCard = m[1].slice(separador + 2)

  if (!Number.isInteger(totalNoCard)) {
    return { ok: false, detalhe: `âncora do card sem número: "${m[1]}"` }
  }
  if (totalNoCard !== totalEsperado) {
    return { ok: false, detalhe: `card exibe ${totalNoCard}, API diz ${totalEsperado}` }
  }
  if (rotuloNoCard !== rotuloEsperado) {
    return {
      ok: false,
      detalhe: `card rotula "${rotuloNoCard}", a composição exige "${rotuloEsperado}"`,
    }
  }
  return { ok: true, detalhe: `card ${totalNoCard} "${rotuloNoCard}"` }
}

async function main() {
  const base = baseUrl()
  console.log(`readback contra ${base}, ${SLUGS.length} fichas, fail-closed\n`)

  // Ids da Câmara vêm do seed canônico (data/candidatos.json), a mesma fonte
  // que o ingest usa. É o denominador do invariante fonte -> API pública.
  const idsPorSlug = new Map(
    loadCandidatos().map((c) => [c.slug, c.ids?.camara ?? null])
  )

  const vereditos: Veredicto[] = []
  try {
    for (const slug of SLUGS) {
      if (!idsPorSlug.has(slug)) {
        vereditos.push({
          slug,
          ok: false,
          detalhe: "slug ausente do seed carregado; confira PF_INGEST_SLUGS",
        })
        continue
      }
      try {
        vereditos.push(await verificarFicha(base, slug, idsPorSlug.get(slug) ?? null))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        vereditos.push({ slug, ok: false, detalhe: `exceção: ${msg}` })
      }
    }

    for (const v of vereditos) {
      console.log(`${v.ok ? "PASS" : "FAIL"}  ${v.slug.padEnd(22)} ${v.detalhe}`)
    }

    const falhas = vereditos.filter((v) => !v.ok)
    console.log(`\n${vereditos.length - falhas.length}/${vereditos.length} fichas aprovadas`)
    if (falhas.length > 0) {
      console.error(`readback REPROVADO: ${falhas.length} ficha(s) falharam; nenhuma exceção permitida`)
      process.exitCode = 1
    }
  } finally {
    if (browserCompartilhado) await browserCompartilhado.close()
  }
}

// Guard de execução: sem ele, importar `avaliarCardNoHtml` num teste
// dispararia o readback inteiro contra produção.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("readback abortou:", err)
    process.exitCode = 1
  })
}
