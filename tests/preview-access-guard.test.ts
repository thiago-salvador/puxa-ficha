import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { deriveAccessCookieValue } from "@/lib/access-cookie-digest"
import {
  hasPreviewAccess,
  MIN_DEPLOYED_PREVIEW_TOKEN_LENGTH,
  PREVIEW_COOKIE_NAME,
  resolvePreviewToken,
} from "@/lib/preview-access"
import {
  PREVIEW_COOKIE_NAME as CANONICAL_PREVIEW_COOKIE_NAME,
  ROUTE_GUARDS,
} from "@/lib/route-guards"

/**
 * O middleware tem matcher literal para `/preview`, inclusive paths com ponto.
 * A página também mantém sua própria checagem antes da leitura com service
 * role, como defesa em profundidade caso a configuração do middleware regrida.
 */

const root = process.cwd()
const APP_DIR = join(root, "src/app")

const TOKEN_FORTE = "preview-secret-token-123456"

/** O cookie guarda a derivação, nunca o token cru (fix de 2026-08-04). */
async function cookieDeToken(token: string) {
  return deriveAccessCookieValue(token, "preview")
}

describe("helper de acesso ao preview", () => {
  it("aceita o cookie derivado do token configurado", async () => {
    assert.equal(
      await hasPreviewAccess(
        { cookieToken: await cookieDeToken(TOKEN_FORTE) },
        { VERCEL: "1", PF_PREVIEW_TOKEN: TOKEN_FORTE },
      ),
      true,
    )
  })

  it("recusa o token cru no cookie, que é o valor que vazava antes", async () => {
    assert.equal(
      await hasPreviewAccess(
        { cookieToken: TOKEN_FORTE },
        { VERCEL: "1", PF_PREVIEW_TOKEN: TOKEN_FORTE },
      ),
      false,
    )
  })

  it("aceita o token de bootstrap na query, que é o par do middleware", async () => {
    assert.equal(
      await hasPreviewAccess(
        { queryToken: TOKEN_FORTE },
        { VERCEL: "1", PF_PREVIEW_TOKEN: TOKEN_FORTE },
      ),
      true,
    )
  })

  it("recusa token errado, ausente ou vazio", async () => {
    const env = { VERCEL: "1", PF_PREVIEW_TOKEN: TOKEN_FORTE }
    const derivado = await cookieDeToken(TOKEN_FORTE)

    assert.equal(
      await hasPreviewAccess({ cookieToken: await cookieDeToken("preview-secret-token-123457") }, env),
      false,
    )
    assert.equal(await hasPreviewAccess({ cookieToken: derivado.slice(0, -1) }, env), false)
    assert.equal(await hasPreviewAccess({ cookieToken: "" }, env), false)
    assert.equal(await hasPreviewAccess({ cookieToken: null, queryToken: null }, env), false)
    assert.equal(await hasPreviewAccess({}, env), false)
  })

  it("falha fechado em ambiente deployado sem token forte", async () => {
    const curto = "a".repeat(MIN_DEPLOYED_PREVIEW_TOKEN_LENGTH - 1)

    assert.equal(resolvePreviewToken({ VERCEL: "1" }), null)
    assert.equal(resolvePreviewToken({ VERCEL_ENV: "production" }), null)
    assert.equal(resolvePreviewToken({ VERCEL_ENV: "preview" }), null)
    assert.equal(resolvePreviewToken({ VERCEL: "1", PF_PREVIEW_TOKEN: curto }), null)

    // Sem token esperado nenhum valor entra, nem o fallback de dev local.
    assert.equal(
      await hasPreviewAccess(
        { cookieToken: await cookieDeToken(curto) },
        { VERCEL: "1", PF_PREVIEW_TOKEN: curto },
      ),
      false,
    )
    assert.equal(
      await hasPreviewAccess({ cookieToken: await cookieDeToken("local-preview") }, { VERCEL: "1" }),
      false,
    )
  })

  it("expõe o mesmo cookie canônico consumido pelo middleware", () => {
    assert.equal(PREVIEW_COOKIE_NAME, CANONICAL_PREVIEW_COOKIE_NAME)
  })

  it("mantém o fallback de conveniência só fora da Vercel", async () => {
    assert.equal(resolvePreviewToken({}), "local-preview")
    assert.equal(
      await hasPreviewAccess({ cookieToken: await cookieDeToken("local-preview") }, {}),
      true,
    )
    assert.equal(await hasPreviewAccess({ cookieToken: "qualquer-coisa" }, {}), false)
  })
})

type RotaDePagina = { rota: string; arquivo: string }

function listarRotasDePagina(dir: string, rota = ""): RotaDePagina[] {
  const encontradas: RotaDePagina[] = []

  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)

    if (entrada.isDirectory()) {
      // Route group `(site)` e parallel route `@slot` não entram na URL.
      const segmento =
        entrada.name.startsWith("(") || entrada.name.startsWith("@") ? "" : `/${entrada.name}`
      encontradas.push(...listarRotasDePagina(caminho, `${rota}${segmento}`))
      continue
    }

    if (entrada.name === "page.tsx" || entrada.name === "page.ts") {
      encontradas.push({ rota: rota || "/", arquivo: caminho })
    }
  }

  return encontradas
}

/** Só segmento dinâmico casa com um valor que contém ponto; rota literal não. */
function aceitaPathComPonto(rota: string): boolean {
  return /\[[^\]]+\]/.test(rota)
}

/**
 * Checagens que valem como defesa própria da página, sem depender do middleware.
 * Procuramos a chamada, e não o identificador, para que um import esquecido sem
 * uso não passe por proteção.
 */
const GUARDS_DE_PAGINA = ["requirePreviewAccess("]

describe("superfícies protegidas pelo middleware não dependem só dele", () => {
  const prefixos = ROUTE_GUARDS.filter(
    ({ id }) => id === "preview-access" || id === "internal-access",
  ).flatMap(({ prefixes }) => prefixes)
  const rotas = listarRotasDePagina(APP_DIR)

  it("enumera os prefixos protegidos pelo inventário canônico", () => {
    assert.deepEqual(prefixos, ["/preview", "/internaltest", "/styleguide"])
  })

  for (const prefixo of prefixos) {
    it(`${prefixo}: toda rota alcançável por path com ponto se defende sozinha`, () => {
      const base = prefixo.endsWith("/") ? prefixo.slice(0, -1) : prefixo
      const rotasDoPrefixo = rotas.filter(
        ({ rota }) => rota === base || rota.startsWith(`${base}/`),
      )

      assert.ok(
        rotasDoPrefixo.length > 0,
        `nenhuma página encontrada sob ${prefixo}; a enumeração quebrou`,
      )

      for (const { rota, arquivo } of rotasDoPrefixo) {
        if (!aceitaPathComPonto(rota)) continue

        const fonte = readFileSync(arquivo, "utf8")
        assert.ok(
          GUARDS_DE_PAGINA.some((guard) => fonte.includes(guard)),
          `${rota} tem segmento dinâmico, então um path com ponto escapa do matcher e chega nela; precisa chamar ${GUARDS_DE_PAGINA.join(" ou ")}`,
        )
      }
    })
  }

  it("existe pelo menos uma rota dinâmica protegida, senão a checagem acima é vazia", () => {
    const dinamicasProtegidas = rotas.filter(
      ({ rota }) =>
        aceitaPathComPonto(rota) &&
        prefixos.some((prefixo) => rota.startsWith(prefixo.endsWith("/") ? prefixo : `${prefixo}/`)),
    )

    assert.deepEqual(
      dinamicasProtegidas.map(({ rota }) => rota),
      ["/preview/candidato/[slug]"],
    )
  })

  it("a página de preview checa o token antes de ler com service role", () => {
    const arquivo = join(APP_DIR, "(site)/preview/candidato/[slug]/page.tsx")
    const fonte = readFileSync(arquivo, "utf8")

    const posicaoGuard = fonte.indexOf("await requirePreviewAccess(")
    const posicaoLeitura = fonte.indexOf("await getFichaPreview(")

    assert.ok(posicaoGuard > -1, "a página de preview precisa chamar requirePreviewAccess")
    assert.ok(posicaoLeitura > -1, "a página de preview precisa ler a ficha")
    assert.ok(
      posicaoGuard < posicaoLeitura,
      "a checagem de token precisa vir antes da leitura com service role",
    )
  })
})
