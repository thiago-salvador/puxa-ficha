import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, it } from "node:test"
import { config } from "../middleware"
import { puxaFichaNextConfig } from "../next.config"
import canaisVai from "../src/data/canais-vai.json"
import { buildRobotsForDeployment } from "@/lib/preview-indexing"
import { findRouteGuard } from "@/lib/route-guards"

/**
 * Contrato dos links curtos de atribuicao por canal (/vai/<canal>).
 *
 * A medicao deste site e beacon JavaScript do Cloudflare Web Analytics
 * (src/components/CloudflareWebAnalytics.tsx), nao proxy de borda: o dominio
 * responde pela Vercel, sem cf-ray. Beacon so dispara em pagina que renderiza,
 * e 30x nao renderiza. Trocar estes rewrites por redirects, mesmo sem querer,
 * apagaria a contagem inteira em silencio: os links continuariam funcionando
 * para o visitante e sumiriam do relatorio. Este arquivo existe para que essa
 * troca falhe aqui, e nao um mes depois na hora de ler os numeros.
 *
 * As guardas de roteamento usam o MATCHER DO PROPRIO NEXT, e nao comparacao de
 * string. A diferenca importa: `source` literal em next.config nao casa so
 * consigo mesmo. O Next compila custom routes com `caseSensitive: false` por
 * padrao, entao /VAI/AOS-FATOS tambem serve a home. Uma versao anterior deste
 * arquivo inferia o contrario a partir da string e ficava verde enquanto o
 * comportamento real divergia do comentario.
 */

type RewriteRule = {
  source: string
  destination: string
}

type RedirectRule = {
  source: string
  destination: string
  permanent: boolean
}

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

type NextPathMatcher = (pathname: string) => false | Record<string, string | string[]>

/**
 * Requer a partir do package.json do repo: o loader ESM dos testes nao resolve
 * caminho profundo de `next`, mas a resolucao CJS a partir da raiz resolve.
 * Se um upgrade do Next mover este modulo, o require estoura aqui, que e o
 * comportamento desejado: a premissa de casamento precisa ser reconferida.
 */
const requireDoRepo = createRequire(pathToFileURL(join(process.cwd(), "package.json")))

function matcherDoNext(source: string): NextPathMatcher {
  const modulo = requireDoRepo("next/dist/shared/lib/router/utils/path-match") as {
    getPathMatch: (
      source: string,
      options: { strict: boolean; removeUnnamedParams: boolean; sensitive: boolean },
    ) => NextPathMatcher
  }

  // Mesmas opcoes que next/dist/server/lib/router-utils/filesystem.js usa ao
  // compilar rewrite, com `sensitive` vindo de experimental.caseSensitiveRoutes.
  return modulo.getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    sensitive: false,
  })
}

function casa(matcher: NextPathMatcher, pathname: string): boolean {
  return matcher(pathname) !== false
}

/** Paths que NENHUMA regra de /vai pode servir. */
const PATHS_SEM_CANAL = [
  "/vai/canal-inexistente",
  "/vai/aos-fatos-2",
  "/vai/lupa/extra",
  "/vai",
  // `/vai/` nao entra aqui: o Next normaliza barra final com 308 para `/vai`,
  // que ai sim e 404. Nao e a regra de rewrite que o resolve.
]

async function rewrites(): Promise<RewriteRule[]> {
  assert.ok(puxaFichaNextConfig.rewrites, "next.config precisa declarar rewrites()")
  const resultado = await puxaFichaNextConfig.rewrites()
  // rewrites() aceita array ou { beforeFiles, afterFiles, fallback }. Aqui a
  // forma esperada e o array simples (afterFiles), que e o que deixa o 404
  // natural valer para canal fora da lista.
  assert.ok(Array.isArray(resultado), "rewrites() deve devolver array simples (afterFiles)")
  return resultado as RewriteRule[]
}

describe("contrato dos links /vai/<canal>", () => {
  it("cada canal da lista vira uma regra de rewrite com destino /", async () => {
    const regras = await rewrites()

    assert.ok(canaisVai.length >= 3, `so ${canaisVai.length} canais na lista`)

    for (const canal of canaisVai) {
      const regra = regras.find((r) => r.source === canal.source)
      assert.ok(regra, `canal ${canal.source} sem regra de rewrite`)
      assert.equal(regra.destination, "/", `${canal.source} nao aponta para a home`)
      // E a regra casa mesmo o path que ela promete servir.
      assert.equal(casa(matcherDoNext(regra.source), canal.source), true, canal.source)
    }

    // Nenhuma regra sobrando: rewrites() so publica o que esta no JSON.
    assert.equal(regras.length, canaisVai.length)
  })

  it("os tres canais de lancamento estao publicados", () => {
    const sources = new Set(canaisVai.map((canal) => canal.source))

    for (const canal of ["aos-fatos", "lupa", "comprova"]) {
      assert.equal(sources.has(`/vai/${canal}`), true, `canal ${canal} ausente`)
    }
  })

  it("o JSON nao tem source duplicado, nem colisao por caixa", () => {
    const sources = canaisVai.map((canal) => canal.source)
    assert.equal(new Set(sources).size, sources.length, `duplicata em ${sources.join(", ")}`)

    // Como o Next casa sem distinguir caixa, dois canais que so diferem nisso
    // seriam a MESMA rota: o segundo nunca seria alcancado e as contagens dos
    // dois se misturariam no relatorio. Duplicata exata nao pega esse caso.
    const porCaixa = sources.map((source) => source.toLowerCase())
    assert.equal(new Set(porCaixa).size, porCaixa.length, `colisao por caixa em ${sources.join(", ")}`)
  })

  it("todo source e um path literal /vai/<slug> minusculo, sem parametro nem curinga", async () => {
    // Esta e a guarda que sustenta o 404 natural. Um unico ":canal" ou "*"
    // aqui transformaria QUALQUER /vai/qualquer-coisa em home, e o relatorio
    // passaria a contar paths que ninguem publicou. O recorte minusculo existe
    // porque o path publicado e o path que o Cloudflare agrupa: source com
    // maiuscula divergiria do link divulgado sem nenhum erro visivel.
    const literal = /^\/vai\/[a-z0-9]+(?:-[a-z0-9]+)*$/

    for (const { source } of canaisVai) {
      assert.match(source, literal, `${source} nao e um path literal minusculo`)
      assert.equal(source.includes(":"), false, `${source} usa parametro`)
      assert.equal(source.includes("*"), false, `${source} usa curinga`)
      assert.equal(source.includes("("), false, `${source} usa grupo de regex`)
    }

    // E o mesmo vale depois de passar por rewrites(), nao so no JSON.
    for (const { source } of await rewrites()) {
      assert.match(source, literal, `${source} nao e um path literal minusculo`)
    }
  })

  it("path sem canal correspondente nao casa com nenhuma regra de rewrite", async () => {
    // Casamento de rota de verdade, pelo matcher do Next: e isso que prova o
    // 404 natural. Comparar string de `source` nao provaria nada, porque uma
    // regra generica casaria paths cuja string nunca aparece na config.
    const matchers = (await rewrites()).map((regra) => ({
      source: regra.source,
      matcher: matcherDoNext(regra.source),
    }))

    for (const pathname of PATHS_SEM_CANAL) {
      for (const { source, matcher } of matchers) {
        assert.equal(casa(matcher, pathname), false, `${pathname} casou com a regra ${source}`)
      }
    }
  })

  it("o casamento ignora caixa, e isso esta escolhido e nao herdado por acidente", async () => {
    // Comportamento real e verificado: o Next compila custom routes com
    // `caseSensitive: false` por padrao, entao /VAI/AOS-FATOS serve a home
    // igual a /vai/aos-fatos. Ficamos com o default porque liga-lo mudaria o
    // casamento de TODAS as rotas do site, os 37 redirects da Onda P inclusive.
    // O custo aceito e conhecido: batida em caixa diferente aparece como outra
    // string de path no Cloudflare. Por isso o link divulgado vai minusculo.
    assert.equal(
      (puxaFichaNextConfig.experimental as { caseSensitiveRoutes?: boolean } | undefined)
        ?.caseSensitiveRoutes,
      undefined,
      "caseSensitiveRoutes deixou de ser o default: reconferir as guardas de caixa deste arquivo",
    )

    const [primeiro] = await rewrites()
    assert.ok(primeiro)
    const matcher = matcherDoNext(primeiro.source)
    assert.equal(casa(matcher, primeiro.source.toUpperCase()), true)
    assert.equal(casa(matcher, primeiro.source), true)
  })

  it("as opcoes do matcher batem com o que o Next compilou de fato", async () => {
    // Cross-check das opcoes escolhidas em matcherDoNext contra a saida real do
    // build. Sem isso, as guardas acima provariam o meu modelo do Next, nao o
    // Next. So roda depois de `npm run build`, que e quando o manifest existe.
    const manifestPath = join(process.cwd(), ".next", "routes-manifest.json")
    if (!existsSync(manifestPath)) return

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      caseSensitive?: boolean
      rewrites: { afterFiles: Array<{ source: string; destination: string; regex: string }> }
    }

    assert.equal(
      manifest.caseSensitive ?? false,
      false,
      "o build passou a compilar rotas case-sensitive: reconferir as guardas de caixa",
    )

    for (const { source, destination } of await rewrites()) {
      const compilada = manifest.rewrites.afterFiles.find((regra) => regra.source === source)
      assert.ok(compilada, `${source} nao entrou em rewrites.afterFiles do build`)
      assert.equal(compilada.destination, destination)

      // A regex compilada pelo Next e o matcher deste teste concordam nos dois
      // sentidos, para o path publicado e para um path que nao existe.
      const doBuild = new RegExp(compilada.regex, "i")
      const doTeste = matcherDoNext(source)
      for (const pathname of [source, source.toUpperCase(), "/vai/canal-inexistente"]) {
        assert.equal(
          doBuild.test(pathname),
          casa(doTeste, pathname),
          `divergencia entre build e matcher do teste em ${pathname}`,
        )
      }
    }
  })

  it("os canais sao rewrite, nunca redirect", async () => {
    // O ponto inteiro da solucao. Redirect responde 30x, nao renderiza pagina,
    // nao dispara o beacon e some do relatorio do Cloudflare.
    const regras = await rewrites()
    for (const regra of regras) {
      assert.equal(
        "permanent" in regra,
        false,
        `${regra.source} carrega "permanent": isso e forma de redirect`,
      )
    }

    assert.ok(puxaFichaNextConfig.redirects)
    const redirects = (await puxaFichaNextConfig.redirects()) as RedirectRule[]
    for (const redirect of redirects) {
      assert.equal(
        redirect.source.startsWith("/vai/"),
        false,
        `${redirect.source} virou redirect e deixa de ser contavel`,
      )
    }
  })

  it("o path /vai/ sai com X-Robots-Tag noindex", async () => {
    // O rewrite serve a home, entao a metadata da resposta e a da home e nao ha
    // como pendurar noindex por pagina sem duplicar a home. O header casa a
    // requisicao pelo path original, antes do rewrite.
    assert.ok(puxaFichaNextConfig.headers)
    const rules = (await puxaFichaNextConfig.headers()) as HeaderRule[]
    const vaiRule = rules.find((rule) => rule.source === "/vai/:path*")

    assert.ok(vaiRule, "falta a regra de header para /vai/:path*")
    const robots = vaiRule.headers.find((header) => header.key.toLowerCase() === "x-robots-tag")
    assert.ok(robots, "regra de /vai/ sem X-Robots-Tag")
    assert.equal(robots.value, "noindex, nofollow")

    // A regra de header cobre TODO canal publicado, nao so os de hoje, e cobre
    // a variante em caixa alta que o rewrite tambem aceita.
    const headerMatcher = matcherDoNext(vaiRule.source)
    for (const { source } of await rewrites()) {
      assert.equal(casa(headerMatcher, source), true, `${source} fora do header de noindex`)
      assert.equal(casa(headerMatcher, source.toUpperCase()), true, source.toUpperCase())
    }

    // A regra global de seguranca continua valendo no mesmo path: as duas se
    // somam, e nenhuma delas carrega CSP (que e dinamica, no middleware).
    const globalRule = rules.find((rule) => rule.source === "/((?!embed/).*)")
    assert.ok(globalRule)
    assert.equal(new RegExp(`^${globalRule.source}$`).test("/vai/aos-fatos"), true)
    assert.equal(
      vaiRule.headers.some((header) => header.key.toLowerCase() === "content-security-policy"),
      false,
    )
  })

  it("robots.txt de producao bloqueia /vai/", () => {
    const robots = buildRobotsForDeployment("production")
    const rules = Array.isArray(robots.rules) ? robots.rules : robots.rules ? [robots.rules] : []
    const [rule] = rules

    assert.ok(rule)
    const disallow = Array.isArray(rule.disallow)
      ? rule.disallow
      : rule.disallow
        ? [rule.disallow]
        : []

    assert.equal(disallow.includes("/vai/"), true, `/vai/ ausente em ${disallow.join(", ")}`)

    // E a rota que serve robots.txt continua sendo a que le esse helper.
    const robotsRoute = readFileSync(join(process.cwd(), "src/app/robots.ts"), "utf8")
    assert.match(robotsRoute, /buildRobotsForDeployment/)
  })

  it("o middleware continua servindo CSP e nonce em /vai/<canal>", () => {
    // /vai/ nao tem matcher proprio: quem o pega e o catch-all no fim da lista.
    // Se ele parar de casar, a pagina servida pelo rewrite perde a CSP e o
    // nonce, e o proprio beacon do Cloudflare deixa de carregar.
    const catchAll = config.matcher.at(-1)
    assert.ok(catchAll)
    const matcher = new RegExp(`^${catchAll}$`)

    for (const { source } of canaisVai) {
      assert.equal(matcher.test(source), true, `${source} fora do matcher do middleware`)
      // Sem guard casando, o middleware cai em nextWithContentSecurityPolicy,
      // que e o ramo que injeta x-nonce no request e CSP na resposta.
      assert.equal(findRouteGuard(source), null, `${source} caiu num route guard`)
    }
  })
})
