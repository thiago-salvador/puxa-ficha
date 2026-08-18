import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyMatch,
  extractCamaraIdentity,
  extractSenadoIdentity,
  namesLookCompatible,
  parseCliArgs,
} from "../scripts/check-ids-cohort"

// Fase 2.3 (2026-04-16): unit tests para o health check remoto de IDs.
// Exercitam extractors puros (a partir de fixtures JSON), classifier
// (seed+remote -> ok|mismatch) e o parser de CLI. Nenhum teste faz
// chamada HTTP real.

// ── namesLookCompatible ────────────────────────────────────────────

test("namesLookCompatible: nomes identicos pos-normalize", () => {
  assert.equal(namesLookCompatible(["Lula"], ["Lula"]), true)
  assert.equal(namesLookCompatible(["Ciro Gomes"], ["CIRO GOMES"]), true)
  assert.equal(namesLookCompatible(["Tarcísio"], ["Tarcisio"]), true)
})

test("namesLookCompatible: nome observado contem expected", () => {
  assert.equal(
    namesLookCompatible(["Andre Figueiredo"], ["Andre Figueiredo Patricio"]),
    true,
    "Camara pode retornar nome civil mais longo que o seed",
  )
})

test("namesLookCompatible: nome expected contem observed", () => {
  // Seed registra nome completo longo; Camara retorna nome mais curto que
  // e subsequencia contigua apos normalize. Caso real: seed tem nomeCivil
  // composto e API expoe nome eleitoral reduzido.
  assert.equal(
    namesLookCompatible(
      ["Andre Figueiredo Patricio Junior"],
      ["Andre Figueiredo Patricio"],
    ),
    true,
  )
})

test("namesLookCompatible: aceita tokens intermediarios no nome observado", () => {
  assert.equal(
    namesLookCompatible(["Paulo Martins"], ["PAULO EDUARDO LIMA MARTINS"]),
    true,
    "Camara pode retornar nome civil com tokens intermediarios entre nome e sobrenome eleitoral",
  )
  assert.equal(namesLookCompatible(["Paulo Martins"], ["Paulo Eduardo Martins"]), true)
})

test("namesLookCompatible: nomes distintos retornam false", () => {
  assert.equal(namesLookCompatible(["Lula"], ["Bolsonaro"]), false)
  assert.equal(namesLookCompatible(["Maria Carmo"], ["Jose Silva"]), false)
})

test("namesLookCompatible: expected vazio e tolerante (true)", () => {
  // Semantica igual ao ingest-camara: se nao ha nada pra comparar, nao
  // penaliza. Evita falso positivo por seed incompleto.
  assert.equal(namesLookCompatible([], ["Alguem"]), true)
  assert.equal(namesLookCompatible(["Alguem"], []), true)
  assert.equal(namesLookCompatible([null, undefined, ""], ["Alguem"]), true)
})

// ── extractCamaraIdentity ──────────────────────────────────────────

test("extractCamaraIdentity: payload completo com ultimoStatus.nome", () => {
  const raw = {
    dados: {
      id: 141406,
      nomeCivil: "CIRO FERREIRA GOMES",
      ultimoStatus: {
        nome: "CIRO GOMES",
        nomeEleitoral: "CIRO GOMES",
        siglaUf: "CE",
        siglaPartido: "PDT",
      },
    },
  }
  const got = extractCamaraIdentity(raw)
  assert.ok(got)
  assert.equal(got.name, "CIRO GOMES")
  assert.equal(got.uf, "CE")
  assert.ok(got.aliases.includes("CIRO FERREIRA GOMES"), "nome civil entra em aliases")
})

test("extractCamaraIdentity: fallback para nomeEleitoral quando nome ausente", () => {
  const raw = {
    dados: {
      nomeCivil: "NOME CIVIL",
      ultimoStatus: {
        nomeEleitoral: "NOME ELEITORAL",
        siglaUf: "SP",
      },
    },
  }
  const got = extractCamaraIdentity(raw)
  assert.ok(got)
  assert.equal(got.name, "NOME ELEITORAL")
  assert.equal(got.uf, "SP")
})

test("extractCamaraIdentity: fallback para nomeCivil quando ultimoStatus vazio", () => {
  const raw = { dados: { nomeCivil: "SO TEM NOME CIVIL", ultimoStatus: null } }
  const got = extractCamaraIdentity(raw)
  assert.ok(got)
  assert.equal(got.name, "SO TEM NOME CIVIL")
  assert.equal(got.uf, undefined, "UF opcional quando ultimoStatus nao tem")
})

test("extractCamaraIdentity: shape invalido retorna null", () => {
  assert.equal(extractCamaraIdentity(null), null)
  assert.equal(extractCamaraIdentity(undefined), null)
  assert.equal(extractCamaraIdentity({}), null)
  assert.equal(extractCamaraIdentity({ dados: null }), null)
  assert.equal(
    extractCamaraIdentity({ dados: { ultimoStatus: { siglaUf: "SP" } } }),
    null,
    "sem nenhum campo de nome e invalido",
  )
})

// ── extractSenadoIdentity ──────────────────────────────────────────

test("extractSenadoIdentity: shape DetalheParlamentar canonico", () => {
  const raw = {
    DetalheParlamentar: {
      Parlamentar: {
        IdentificacaoParlamentar: {
          CodigoParlamentar: "4077",
          NomeParlamentar: "EDUARDO BRAGA",
          NomeCompletoParlamentar: "EDUARDO BRAGA DA SILVA",
          SiglaPartidoParlamentar: "MDB",
          UfParlamentar: "AM",
        },
      },
    },
  }
  const got = extractSenadoIdentity(raw)
  assert.ok(got)
  assert.equal(got.name, "EDUARDO BRAGA")
  assert.equal(got.uf, "AM")
  assert.ok(got.aliases.includes("EDUARDO BRAGA DA SILVA"))
})

test("extractSenadoIdentity: shape flat com IdentificacaoParlamentar no topo", () => {
  const raw = {
    IdentificacaoParlamentar: {
      NomeParlamentar: "FLAVIO BOLSONARO",
      NomeCompletoParlamentar: "FLAVIO NANTES BOLSONARO",
      UfParlamentar: "RJ",
    },
  }
  const got = extractSenadoIdentity(raw)
  assert.ok(got)
  assert.equal(got.name, "FLAVIO BOLSONARO")
  assert.equal(got.uf, "RJ")
})

test("extractSenadoIdentity: shape invalido retorna null", () => {
  assert.equal(extractSenadoIdentity(null), null)
  assert.equal(extractSenadoIdentity({}), null)
  assert.equal(extractSenadoIdentity({ DetalheParlamentar: {} }), null)
  assert.equal(
    extractSenadoIdentity({
      DetalheParlamentar: { Parlamentar: { IdentificacaoParlamentar: { UfParlamentar: "SP" } } },
    }),
    null,
    "sem nome nao extrai",
  )
})

// ── classifyMatch ──────────────────────────────────────────────────

test("classifyMatch: nome + UF batem, ok sem reasons efetivos", () => {
  const got = classifyMatch(
    { nome_completo: "CIRO FERREIRA GOMES", nome_urna: "CIRO GOMES", estado: "CE" },
    { name: "CIRO GOMES", aliases: ["CIRO FERREIRA GOMES"], uf: "CE" },
  )
  assert.equal(got.status, "ok")
  assert.deepEqual(got.reasons, [])
})

test("classifyMatch: nome diverge e vira mismatch com reason name_mismatch", () => {
  const got = classifyMatch(
    { nome_completo: "LULA DA SILVA", nome_urna: "LULA", estado: null },
    { name: "JAIR BOLSONARO", aliases: [], uf: undefined },
  )
  assert.equal(got.status, "mismatch")
  assert.ok(got.reasons.some((r) => r.startsWith("name_mismatch:")))
})

test("classifyMatch: UF diverge e vira mismatch com reason uf_mismatch", () => {
  const got = classifyMatch(
    { nome_completo: "MARIA DO CARMO", nome_urna: "MARIA DO CARMO", estado: "AM" },
    { name: "MARIA DO CARMO", aliases: [], uf: "SE" },
  )
  assert.equal(got.status, "mismatch")
  assert.ok(got.reasons.some((r) => r.startsWith("uf_mismatch:")))
})

test("classifyMatch: UF divergencia so conta se seed tem estado", () => {
  // Presidente (sem estado) e UF do deputado federal nao importa.
  const got = classifyMatch(
    { nome_completo: "LULA DA SILVA", nome_urna: "LULA", estado: null },
    { name: "LULA DA SILVA", aliases: [], uf: "PE" },
  )
  assert.equal(got.status, "ok")
  assert.deepEqual(got.reasons, [])
})

test("classifyMatch: seed tem estado e remote nao, reason uf_unknown nao e mismatch", () => {
  const got = classifyMatch(
    { nome_completo: "JOAO ROMA", nome_urna: "JOAO ROMA", estado: "BA" },
    { name: "JOAO ROMA", aliases: [], uf: undefined },
  )
  assert.equal(got.status, "ok", "uf_unknown nao penaliza")
  assert.ok(got.reasons.some((r) => r.startsWith("uf_unknown_on_remote:")))
})

test("classifyMatch: UF case-insensitive / acento ignorado", () => {
  const got = classifyMatch(
    { nome_completo: "X", nome_urna: "X", estado: "sp" },
    { name: "X", aliases: [], uf: "SP" },
  )
  assert.equal(got.status, "ok")
})

test("classifyMatch: name mismatch + uf mismatch acumula 2 reasons", () => {
  const got = classifyMatch(
    { nome_completo: "A", nome_urna: "A", estado: "SP" },
    { name: "B", aliases: [], uf: "RJ" },
  )
  assert.equal(got.status, "mismatch")
  assert.equal(got.reasons.filter((r) => r.startsWith("name_mismatch:")).length, 1)
  assert.equal(got.reasons.filter((r) => r.startsWith("uf_mismatch:")).length, 1)
})

// ── parseCliArgs ───────────────────────────────────────────────────

test("parseCliArgs: defaults razoaveis", () => {
  const opts = parseCliArgs([])
  assert.equal(opts.json, false)
  assert.equal(opts.outputPath, null)
  assert.equal(opts.slugFilter, null)
  assert.equal(opts.only, null)
  assert.equal(opts.skipRemote, false)
  assert.equal(opts.timeoutMs, 15000)
  assert.equal(opts.maxRetries, 2)
  assert.equal(opts.failOnMismatch, false)
})

test("parseCliArgs: flags booleanas", () => {
  const opts = parseCliArgs(["--json", "--skip-remote", "--fail-on-mismatch"])
  assert.equal(opts.json, true)
  assert.equal(opts.skipRemote, true)
  assert.equal(opts.failOnMismatch, true)
})

test("parseCliArgs: --output e --slug com lista", () => {
  const opts = parseCliArgs(["--output=out/x.json", "--slug=a,b, c "])
  assert.equal(opts.outputPath, "out/x.json")
  assert.ok(opts.slugFilter)
  assert.deepEqual([...opts.slugFilter], ["a", "b", "c"])
})

test("parseCliArgs: --only=camara|senado valida", () => {
  assert.equal(parseCliArgs(["--only=camara"]).only, "camara")
  assert.equal(parseCliArgs(["--only=senado"]).only, "senado")
  assert.equal(parseCliArgs(["--only=bogus"]).only, null, "valor invalido eh ignorado")
})

test("parseCliArgs: timeouts e retries numericos", () => {
  const opts = parseCliArgs(["--timeout-ms=5000", "--max-retries=0"])
  assert.equal(opts.timeoutMs, 5000)
  assert.equal(opts.maxRetries, 0)
})
