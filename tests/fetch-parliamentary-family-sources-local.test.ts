import assert from "node:assert/strict"
import test from "node:test"
import { camaraLegislatureForYear, camaraVoteListIsComplete, camaraVoteListUrl, capturePageIsComplete, cotaYearCompleteness, familySource, fetchOfficialWithRetry, filterBundlePages, filterCandidatesBySlugs, jevAllowlistedEnv, JEV_SCRIPT_SHA256_PIN, loadCachedCotaYear, pinnedJevScriptMatches, parseSenadoVoteIds, parseSlugList, senateAuthorshipRows, senateRecordFromRoster, senatorNameFromRoster, senatorNamesFromLegislatureRoster, validateContentLength, validateCotaYearRowCount } from "../scripts/audit/fetch-parliamentary-family-sources-local"

test("lista privada seleciona candidatos e falha em slug desconhecido", () => {
  const candidates = [{ slug: "ana-silva" }, { slug: "bia-souza" }]
  assert.deepEqual(parseSlugList("bia-souza\nana-silva\n"), ["bia-souza", "ana-silva"])
  assert.deepEqual(filterCandidatesBySlugs(candidates, ["bia-souza"]), [candidates[1]])
  assert.throws(() => filterCandidatesBySlugs(candidates, ["nao-existe"]), /slug ausente/)
  assert.throws(() => parseSlugList("ana-silva\nana-silva"), /duplicado/)
})

test("legislatura da Câmara é mapeada pelo ano consultado", () => {
  assert.deepEqual([2008, 2010, 2011, 2014, 2015, 2018, 2019, 2022, 2023, 2026].map(camaraLegislatureForYear), [53, 53, 54, 54, 55, 55, 56, 56, 57, 57])
  assert.throws(() => camaraLegislatureForYear(2007), /sem legislatura/)
})

test("IDs exatos das votações Senado exigem array numérico sem duplicatas", () => {
  assert.deepEqual(parseSenadoVoteIds('["123", "456"]'), ["123", "456"])
  assert.throws(() => parseSenadoVoteIds("[]"), /array não vazio/)
  assert.throws(() => parseSenadoVoteIds('["123", "123"]'), /duplicado/)
  assert.throws(() => parseSenadoVoteIds('["123", "abc"]'), /inválido/)
})

test("autorías do Senado preservam a lista integral em uma resposta e validam envelope e parlamentar", () => {
  const sourceRows = Array.from({ length: 313 }, (_, index) => ({
    IndicadorAutorPrincipal: index % 2 === 0 ? "Sim" : "Não",
    Materia: { Codigo: String(index + 1), Ano: 2020 },
  }))
  const payload = { MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "4529", Autorias: { Autoria: sourceRows } } } }
  const rows = senateAuthorshipRows(payload, "4529")
  assert.equal(rows.length, 313)
  assert.equal((rows.at(-1) as Record<string, unknown>).CodigoParlamentar, "4529")
  assert.equal((rows.at(-1) as Record<string, unknown>).Materia && ((rows.at(-1) as { Materia: { Codigo: string } }).Materia.Codigo), "313")
  assert.throws(() => senateAuthorshipRows(payload, "1234"), /CodigoParlamentar consultado/)
  assert.throws(() => senateAuthorshipRows({ MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "4529", Autorias: { Autoria: null } } } }, "4529"), /lista completa/)
})

test("identidade do roster Senado é limitada ao registro do ID consultado", () => {
  const value = {
    DetalheParlamentar: { Parlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "4529", NomeParlamentar: "Nome Oficial" } } },
    unrelated: { CodigoParlamentar: "4529", NomeParlamentar: "Nome Indevido" },
  }
  assert.equal(senatorNameFromRoster(value, "4529"), "Nome Oficial")
  assert.equal(senatorNameFromRoster(value, "9999"), null)
  assert.equal(senateRecordFromRoster(value, "9999"), null)
  const historical = { ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: [
    { IdentificacaoParlamentar: { CodigoParlamentar: "4529", NomeParlamentar: "Nome Antigo" } },
    { IdentificacaoParlamentar: { CodigoParlamentar: "8", NomeParlamentar: "Outro" } },
  ] } }, unrelated: { IdentificacaoParlamentar: { CodigoParlamentar: "4529", NomeParlamentar: "Falso" } } }
  assert.deepEqual(senatorNamesFromLegislatureRoster(historical, "4529"), ["Nome Antigo"])
})

test("official fetch retries with User-Agent, checks content length, and Cota 2026 remains partial", async () => {
  let attempts = 0
  const response = await fetchOfficialWithRetry("https://example.invalid/data", {}, async (_input, init) => {
    attempts += 1
    assert.equal(new Headers(init?.headers).get("user-agent"), "PuxaFicha-Coletores/1.0")
    return attempts === 1 ? new Response("busy", { status: 503 }) : new Response("ok", { status: 200 })
  }, async () => {})
  assert.equal(response.status, 200)
  assert.equal(attempts, 2)
  assert.throws(() => validateContentLength("99", 3, "https://example.invalid/file"), /Content-Length divergente/)
  assert.doesNotThrow(() => validateContentLength("3", 3, "https://example.invalid/file"))
  assert.deepEqual(cotaYearCompleteness(2025), { complete: true, use_for_absence: true })
  assert.deepEqual(cotaYearCompleteness(2026), { complete: false, use_for_absence: false })
  assert.equal(validateCotaYearRowCount(new Map([ ["123", { rowCount: 2 }], ["456", { rowCount: 3 }] ]), 2025), 5)
  assert.throws(() => validateCotaYearRowCount(new Map(), 2025), /contagem anual de linhas parlamentares inválida/)
})

test("fetch-to-completeness accepts self-only short pages and otherwise requires exhaustion proof", () => {
  const short200 = { dados: Array.from({ length: 3 }, (_, i) => ({ id: i + 1 })), links: [{ rel: "self", href: "?pagina=1" }] }
  assert.equal(capturePageIsComplete(short200, 3, 1, "https://example.invalid/api?itens=100&pagina=1"), true)
  assert.equal(capturePageIsComplete({ ...short200, total: 3 }, 3, 1, "https://example.invalid/api?itens=100&pagina=1"), true)
  assert.equal(capturePageIsComplete({ ...short200, total: 4 }, 3, 1, "https://example.invalid/api?itens=100&pagina=1"), false)
  assert.equal(capturePageIsComplete({ ...short200, dados: Array.from({ length: 100 }) }, 100, 1, "https://example.invalid/api?itens=100&pagina=1"), false)
  const endsHere = { dados: [{ id: 1 }], links: [
    { rel: "self", href: "https://example.invalid/api?itens=100&pagina=2" },
    { rel: "last", href: "https://example.invalid/api?itens=100&pagina=2" },
  ] }
  assert.equal(capturePageIsComplete(endsHere, 1, 2, "https://example.invalid/api?itens=100&pagina=2"), true)
  assert.equal(capturePageIsComplete({ dados: Array.from({ length: 50 }) , totalRegistros: 150 }, 50, 2, "https://example.invalid/api?itens=100&pagina=2"), true)
  assert.equal(capturePageIsComplete({ dados: Array.from({ length: 50 }), totalRegistros: 151 }, 50, 2, "https://example.invalid/api?itens=100&pagina=2"), false)
})

test("Cota ZIP failure is memoized for the remainder of the run", async () => {
  const successful = new Map<number, string>()
  const failures = new Map<number, string>()
  let attempts = 0
  const loader = async () => { attempts += 1; throw new Error("temporary source failure") }
  await assert.rejects(loadCachedCotaYear(2025, successful, failures, loader), /temporary source failure/)
  await assert.rejects(loadCachedCotaYear(2025, successful, failures, loader), /já falhou nesta execução/)
  assert.equal(attempts, 1)
})

test("Jev spawn environment is allowlisted and helper hash pin is explicit", () => {
  assert.deepEqual(jevAllowlistedEnv({ TYPESAFE_API_KEY: "fake-test-key", PATH: "/bin", SUPABASE_SERVICE_ROLE_KEY: "must-not-pass" }), {
    TYPESAFE_API_KEY: "fake-test-key", PATH: "/bin",
  })
  assert.match(JEV_SCRIPT_SHA256_PIN, /^[a-f0-9]{64}$/)
  assert.equal(pinnedJevScriptMatches(Buffer.from("not-the-pinned-helper")), false)
})

test("votos nominais Câmara preservam ausência como lista completa sem linha sintética", () => {
  const empty = filterBundlePages([{
    page: 1, url: "https://dadosabertos.camara.leg.br/api/v2/votacoes/123-4/votos?itens=100&pagina=1",
    path: "/tmp/votos.json", bytes: 2, sha256: "a".repeat(64), rows: 0, complete: true,
    value: { dados: [], links: [] },
  }], "456")
  assert.deepEqual((empty[0]?.value as { dados: unknown[] }).dados, [])
  assert.equal(empty[0]?.complete, true)
  assert.match(familySource("camara", "votos_candidato", "456"), /\/votacoes\/\{votacao_id\}\/votos$/)

  const present = filterBundlePages([{
    page: 1, url: "https://dadosabertos.camara.leg.br/api/v2/votacoes/123-4/votos?itens=100&pagina=1",
    path: "/tmp/votos.json", bytes: 20, sha256: "b".repeat(64), rows: 1, complete: true,
    value: { dados: [{ deputado_: { id: 456 }, voto: "Sim" }], links: [] },
  }], "456")
  assert.deepEqual((present[0]?.value as { dados: Array<Record<string, unknown>> }).dados, [{ deputado_: { id: 456 }, voto: "Sim", vote_id_api: "123-4" }])
})

test("lista nominal Câmara é pedida sem pagina/itens e fechada pela resposta única", () => {
  // Em 30/09/2026 a API respondeu `GET /votacoes/14493-503/votos?itens=100&pagina=1`
  // com HTTP 400 {"detail":"Parâmetro(s) inválido(s).","instance":"pagina, itens"}
  // e `GET /votacoes/14493-503/votos` com HTTP 200, 485 linhas e só o link `self`.
  const url = camaraVoteListUrl("14493-503")
  assert.equal(url, "https://dadosabertos.camara.leg.br/api/v2/votacoes/14493-503/votos")
  assert.equal(new URL(url).searchParams.has("pagina"), false)
  assert.equal(new URL(url).searchParams.has("itens"), false)
  assert.throws(() => camaraVoteListUrl("14493-503/../x"), /ID de votação/)

  const single = { dados: Array.from({ length: 485 }, (_, i) => ({ tipoVoto: "Sim", deputado_: { id: i + 1 } })), links: [{ rel: "self", href: url }] }
  assert.equal(camaraVoteListIsComplete(single, url), true)
  assert.equal(camaraVoteListIsComplete({ dados: [], links: [{ rel: "self", href: url }] }, url), false)
  assert.equal(camaraVoteListIsComplete({ ...single, links: [...single.links, { rel: "next", href: `${url}?pagina=2` }] }, url), false)
  assert.equal(camaraVoteListIsComplete({ ...single, links: [{ rel: "self", href: `${url}?pagina=1` }] }, url), false)
  assert.equal(camaraVoteListIsComplete(single, `${url}?itens=100&pagina=1`), false)
  assert.equal(camaraVoteListIsComplete({ dados: {} }, url), false)
  // O caminho paginado antigo nunca fecharia uma lista de 485 linhas numa página.
  assert.equal(capturePageIsComplete(single, 485, 1, url), false)
})
