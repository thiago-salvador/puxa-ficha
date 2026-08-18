import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import {
  executeRevalidateRequest,
  extractRevalidateSecret,
  isAllowedRevalidateTag,
  parseRevalidateRequestBody,
  REVALIDATE_ALLOWED_TAGS,
  verifyRevalidateSecret,
} from "../src/lib/revalidate-cache"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Fonte sem comentario, para as asserções que proíbem uma CHAMADA. Sem isto, a
 * própria explicação de por que uma API foi descartada faria o teste que a
 * proíbe falhar, e o incentivo passaria a ser apagar a explicação.
 */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "")
}

function makeHeaders(map: Record<string, string>): Pick<Headers, "get"> {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v
  return { get: (name: string) => lower[name.toLowerCase()] ?? null }
}

describe("revalidate-cache helper", () => {
  it("isAllowedRevalidateTag aceita exatamente as tags da whitelist", () => {
    for (const tag of REVALIDATE_ALLOWED_TAGS) {
      assert.equal(isAllowedRevalidateTag(tag), true, `whitelist deveria conter ${tag}`)
    }
    assert.equal(isAllowedRevalidateTag("arbitrary"), false)
    assert.equal(isAllowedRevalidateTag(""), false)
    assert.equal(isAllowedRevalidateTag(null), false)
    assert.equal(isAllowedRevalidateTag(undefined), false)
    assert.equal(isAllowedRevalidateTag(42), false)
    // Wildcard nao e tag valida.
    assert.equal(isAllowedRevalidateTag("*"), false)
    // Path traversal / strings suspeitas devem cair na whitelist.
    assert.equal(isAllowedRevalidateTag("../public-candidatos"), false)
    assert.equal(isAllowedRevalidateTag("public-candidatos/../etc"), false)
  })

  it("whitelist cobre todas as tags realmente registradas em src/lib/api.ts e doador-reverse.ts", () => {
    const apiSrc = readFileSync(join(root, "src/lib/api.ts"), "utf8")
    const doadorSrc = readFileSync(join(root, "src/lib/doador-reverse.ts"), "utf8")
    const allTags = new Set<string>()
    const tagPattern = /tags:\s*\[\s*"([^"]+)"/g
    for (const src of [apiSrc, doadorSrc]) {
      let match: RegExpExecArray | null
      while ((match = tagPattern.exec(src)) !== null) {
        allTags.add(match[1])
      }
    }
    assert.ok(allTags.size > 0, "regex nao casou nenhuma tag; revisar pattern")
    for (const tag of allTags) {
      assert.ok(
        REVALIDATE_ALLOWED_TAGS.includes(tag as (typeof REVALIDATE_ALLOWED_TAGS)[number]),
        `tag ${tag} usada em unstable_cache mas ausente da whitelist`,
      )
    }
  })

  it("parseRevalidateRequestBody aceita { tag } e { tags } e rejeita variantes invalidas", () => {
    assert.deepEqual(parseRevalidateRequestBody({ tag: "public-candidatos" }), {
      ok: true,
      tags: ["public-candidatos"],
    })
    assert.deepEqual(
      parseRevalidateRequestBody({ tags: ["public-candidatos", "public-candidato-ficha"] }),
      { ok: true, tags: ["public-candidatos", "public-candidato-ficha"] },
    )
    // Dedup
    assert.deepEqual(parseRevalidateRequestBody({ tags: ["a", "a", "b"] }), {
      ok: true,
      tags: ["a", "b"],
    })

    const invalidCases: Array<[unknown, string]> = [
      [null, "body_not_object"],
      [undefined, "body_not_object"],
      ["string", "body_not_object"],
      [[], "body_not_object"],
      [{}, "missing_tag"],
      [{ tag: "x", tags: ["x"] }, "tag_and_tags_both_present"],
      [{ tag: "" }, "tag_not_string"],
      [{ tag: "   " }, "tag_not_string"],
      [{ tag: 42 }, "tag_not_string"],
      [{ tags: [] }, "tags_not_nonempty_array"],
      [{ tags: "x" }, "tags_not_nonempty_array"],
      [{ tags: [42] }, "tags_entry_not_string"],
      [{ tags: [""] }, "tags_entry_not_string"],
    ]
    for (const [body, reason] of invalidCases) {
      const result = parseRevalidateRequestBody(body)
      assert.equal(result.ok, false, `body ${JSON.stringify(body)} deveria falhar`)
      if (!result.ok) assert.equal(result.reason, reason)
    }
  })

  it("verifyRevalidateSecret falha fechada quando env vazio e usa comparacao constante", () => {
    assert.deepEqual(verifyRevalidateSecret("anything", undefined), {
      ok: false,
      reason: "env_missing",
    })
    assert.deepEqual(verifyRevalidateSecret("anything", ""), { ok: false, reason: "env_missing" })
    assert.deepEqual(verifyRevalidateSecret("anything", "   "), {
      ok: false,
      reason: "env_missing",
    })

    assert.deepEqual(verifyRevalidateSecret(null, "expected"), {
      ok: false,
      reason: "secret_missing",
    })
    assert.deepEqual(verifyRevalidateSecret("", "expected"), {
      ok: false,
      reason: "secret_missing",
    })
    assert.deepEqual(verifyRevalidateSecret("   ", "expected"), {
      ok: false,
      reason: "secret_missing",
    })

    // Diferenca de tamanho => secret_invalid (nao expoe info).
    assert.deepEqual(verifyRevalidateSecret("short", "expected-secret-longer"), {
      ok: false,
      reason: "secret_invalid",
    })
    assert.deepEqual(verifyRevalidateSecret("expected-wrong", "expected-right"), {
      ok: false,
      reason: "secret_invalid",
    })
    assert.deepEqual(verifyRevalidateSecret("expected", "expected"), { ok: true })
    // Trim aplicado ao provided.
    assert.deepEqual(verifyRevalidateSecret("  expected  ", "expected"), { ok: true })
  })

  it("extractRevalidateSecret prefere x-pf-revalidate-secret e cai pra Bearer", () => {
    assert.equal(
      extractRevalidateSecret(makeHeaders({ "x-pf-revalidate-secret": "abc" })),
      "abc",
    )
    assert.equal(
      extractRevalidateSecret(makeHeaders({ Authorization: "Bearer xyz" })),
      "xyz",
    )
    assert.equal(
      extractRevalidateSecret(
        makeHeaders({ "x-pf-revalidate-secret": "abc", Authorization: "Bearer xyz" }),
      ),
      "abc",
      "x-pf-revalidate-secret deve prevalecer sobre Bearer",
    )
    assert.equal(extractRevalidateSecret(makeHeaders({})), null)
    assert.equal(extractRevalidateSecret(makeHeaders({ Authorization: "" })), null)
    assert.equal(
      extractRevalidateSecret(makeHeaders({ Authorization: "Basic notbearer" })),
      null,
    )
    assert.equal(extractRevalidateSecret(makeHeaders({ "x-pf-revalidate-secret": "" })), null)
  })

  it("executeRevalidateRequest revalida quando secret OK + tag whitelist", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tag: "public-candidatos" },
      providedSecret: "expected",
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.deepEqual(result, {
      ok: true,
      status: 200,
      revalidated: ["public-candidatos"],
      rejected: [],
    })
    assert.deepEqual(calls, ["public-candidatos"])
  })

  it("executeRevalidateRequest aceita array de tags whitelist", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tags: ["public-candidatos", "public-candidato-ficha"] },
      providedSecret: "expected",
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.deepEqual(result.revalidated, ["public-candidatos", "public-candidato-ficha"])
    assert.deepEqual(calls, ["public-candidatos", "public-candidato-ficha"])
  })

  it("executeRevalidateRequest retorna 401 quando secret ausente e nao revalida", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tag: "public-candidatos" },
      providedSecret: null,
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
    assert.equal(result.reason, "secret_missing")
    assert.deepEqual(calls, [])
  })

  it("executeRevalidateRequest retorna 401 quando secret invalido e nao revalida", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tag: "public-candidatos" },
      providedSecret: "wrong",
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.status, 401)
    assert.equal(result.reason, "secret_invalid")
    assert.deepEqual(calls, [])
  })

  it("executeRevalidateRequest retorna 400 quando tag fora da whitelist e nao revalida", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tag: "arbitrary-tag" },
      providedSecret: "expected",
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.status, 400)
    assert.equal(result.reason, "tag_not_allowed")
    assert.deepEqual(result.rejected, ["arbitrary-tag"])
    assert.deepEqual(calls, [])
  })

  it("executeRevalidateRequest e all-or-nothing em array misto (rejeita tudo se uma tag for invalida)", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tags: ["public-candidatos", "arbitrary-tag"] },
      providedSecret: "expected",
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.status, 400)
    assert.equal(result.reason, "tag_not_allowed")
    assert.deepEqual(result.rejected, ["arbitrary-tag"])
    assert.deepEqual(calls, [], "all-or-nothing: nem a tag valida pode ser revalidada")
  })

  it("executeRevalidateRequest retorna 400 quando body invalido e nao revalida", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: null,
      providedSecret: "expected",
      envSecret: "expected",
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.status, 400)
    assert.equal(result.reason, "body_not_object")
    assert.deepEqual(calls, [])
  })

  it("executeRevalidateRequest falha fechada com 503 quando env ausente, mesmo com secret no request", () => {
    const calls: string[] = []
    const result = executeRevalidateRequest({
      body: { tag: "public-candidatos" },
      providedSecret: "anything",
      envSecret: undefined,
      revalidateFn: (tag) => calls.push(tag),
    })
    assert.equal(result.status, 503)
    assert.equal(result.reason, "env_missing")
    assert.deepEqual(calls, [])
  })
})

describe("revalidate route contract", () => {
  const routePath = join(root, "src/app/api/revalidate/route.ts")

  it("rota usa runtime nodejs e dynamic force-dynamic", () => {
    const src = readFileSync(routePath, "utf8")
    assert.match(src, /export const runtime = "nodejs"/)
    assert.match(src, /export const dynamic = "force-dynamic"/)
  })

  it("rota le secret apenas via header, nunca via query string", () => {
    const src = readFileSync(routePath, "utf8")
    assert.match(src, /extractRevalidateSecret\(req\.headers\)/)
    assert.doesNotMatch(
      src,
      /searchParams\.get\(\s*["'][^"']*secret/i,
      "secret nao pode vir de query string",
    )
    assert.doesNotMatch(
      src,
      /req\.nextUrl\.searchParams\.get\(\s*["'](secret|token|key)["']/i,
      "secret nao pode vir de query string (variantes)",
    )
  })

  it("rota nao loga o secret e nao ecoa em response body", () => {
    const src = readFileSync(routePath, "utf8")
    assert.doesNotMatch(
      src,
      /console\.(log|warn|error)\([^)]*providedSecret/i,
      "providedSecret nao pode aparecer em log",
    )
    assert.doesNotMatch(
      src,
      /console\.(log|warn|error)\([^)]*PF_REVALIDATE_SECRET/i,
      "valor do secret env nao pode aparecer em log",
    )
    assert.doesNotMatch(
      src,
      /\bsecret\b\s*:\s*(providedSecret|process\.env\.PF_REVALIDATE_SECRET)/,
      "secret nao pode entrar em payload de response",
    )
  })

  it("rota expoe POST e GET como handlers (GET retorna 405)", () => {
    const src = readFileSync(routePath, "utf8")
    assert.match(src, /export async function POST\(req: NextRequest\)/)
    assert.match(src, /export async function GET\(\)/)
    assert.match(src, /status:\s*405/, "GET deve retornar 405")
  })

  it("rota expira de imediato, nao marca como stale", () => {
    // A diferenca decide se a correcao de um erro factual aparece agora ou so na
    // requisicao seguinte. Com o profile "max", a proxima requisicao apos o
    // revalidate ainda serve a versao ANTIGA, o que tornava este endpoint inutil
    // como ferramenta de verificacao. Verificado em next@16.2.12: o ramo que
    // marca `pathWasRevalidated` e `if (!profile || cacheLife?.expire === 0)`.
    const src = readFileSync(routePath, "utf8")
    assert.match(src, /import\s*\{\s*revalidateTag\s*\}\s*from\s*"next\/cache"/)
    assert.match(
      src,
      /revalidateFn:\s*\(tag\)\s*=>\s*revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/,
      'POST deve passar revalidateTag(tag, { expire: 0 }) pra executeRevalidateRequest',
    )
    // As proibicoes abaixo sao sobre a CHAMADA, nao sobre a prosa: o comentario
    // da rota explica por que "max" e updateTag ficaram de fora, e citar os dois
    // e o que torna a decisao legivel para quem vier depois.
    assert.doesNotMatch(
      semComentarios(src),
      /revalidateTag\(tag,\s*"max"\)/,
      'o profile "max" nao pode voltar: ele serve a versao errada mais uma vez',
    )
  })

  it("nao usa updateTag, que lanca E872 fora de Server Action", () => {
    // `updateTag` seria a API nova para expiracao imediata, mas o proprio Next
    // checa `workStore.page.endsWith("/route")` e lanca. Esta rota e um Route
    // Handler, entao trocar por ela derrubaria o endpoint em runtime, num
    // caminho que nenhum teste de unidade pega.
    assert.doesNotMatch(semComentarios(readFileSync(routePath, "utf8")), /\bupdateTag\b/)
  })

  it("response 200 contem revalidated: [...] e nao contem secret nem allowedTags", () => {
    const src = readFileSync(routePath, "utf8")
    // OK path: { ok: true, revalidated }
    assert.match(src, /\{\s*ok:\s*true,\s*revalidated:\s*result\.revalidated\s*\}/)
    // Allowed tags so aparecem na resposta de erro 400 (pra onboarding do operador).
    assert.match(src, /allowedTags:\s*REVALIDATE_ALLOWED_TAGS/)
  })

  it("production-env exige PF_REVALIDATE_SECRET (fail-fast em deploy)", () => {
    const src = readFileSync(join(root, "src/lib/production-env.ts"), "utf8")
    assert.match(src, /process\.env\.PF_REVALIDATE_SECRET/)
    assert.match(src, /missing\.push\("PF_REVALIDATE_SECRET"\)/)
  })
})
