import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyMatch,
  extractCamaraIdentity,
  extractSenadoIdentity,
  namesLookCompatible,
  parseCliArgs,
  RemoteFetchClient,
  shouldFailGate,
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
  assert.equal(opts.paceMs, 250)
  assert.equal(opts.circuitFailureThreshold, 4)
  assert.equal(opts.circuitCooldownMs, 30000)
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
  const opts = parseCliArgs([
    "--timeout-ms=5000",
    "--max-retries=0",
    "--pace-ms=75",
    "--circuit-failures=2",
    "--circuit-cooldown-ms=9000",
  ])
  assert.equal(opts.timeoutMs, 5000)
  assert.equal(opts.maxRetries, 0)
  assert.equal(opts.paceMs, 75)
  assert.equal(opts.circuitFailureThreshold, 2)
  assert.equal(opts.circuitCooldownMs, 9000)
})

test("parseCliArgs: rejeita timeout e retries invalidos ou sem limite", () => {
  for (const value of ["NaN", "Infinity", "-1", "1.5", "120001"]) {
    assert.throws(() => parseCliArgs([`--timeout-ms=${value}`]), /--timeout-ms/)
  }
  for (const value of ["NaN", "Infinity", "-1", "1.5", "11"]) {
    assert.throws(() => parseCliArgs([`--max-retries=${value}`]), /--max-retries/)
  }
  assert.equal(parseCliArgs(["--timeout-ms=120000"]).timeoutMs, 120000)
  assert.equal(parseCliArgs(["--max-retries=10"]).maxRetries, 10)
  for (const value of ["0", "-1", "1.5", "Infinity", "60001"]) {
    assert.throws(() => parseCliArgs([`--pace-ms=${value}`]), /--pace-ms/)
  }
  for (const value of ["0", "-1", "1.5", "Infinity", "300001"]) {
    assert.throws(() => parseCliArgs([`--circuit-cooldown-ms=${value}`]), /--circuit-cooldown-ms/)
  }
  for (const value of ["0", "-1", "1.5", "Infinity", "101"]) {
    assert.throws(() => parseCliArgs([`--circuit-failures=${value}`]), /--circuit-failures/)
  }
})

test("RemoteFetchClient: preserva causa sanitizada e faz retry de falha de rede", async () => {
  let calls = 0
  const waits: number[] = []
  const cause = Object.assign(new Error("connect ECONNRESET https://secret.invalid/?token=abc"), {
    code: "ECONNRESET",
  })
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 1,
    paceMs: 0,
    sleep: async (ms) => {
      waits.push(ms)
    },
    fetchImpl: async () => {
      calls++
      if (calls === 1) throw Object.assign(new TypeError("fetch failed"), { cause })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    },
  })

  const result = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  assert.equal(result.status, "ok")
  assert.equal(calls, 2)
  assert.deepEqual(waits, [500])
  assert.equal(result.error_info, undefined)

  const failed = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    fetchImpl: async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause })
    },
  })
  const error = await failed.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  assert.equal(error.status, "error")
  assert.equal(error.error_info?.kind, "network")
  assert.equal(error.error_info?.cause?.code, "ECONNRESET")
  assert.match(error.error ?? "", /ECONNRESET/)
  assert.doesNotMatch(JSON.stringify(error), /secret\.invalid|token=abc/)
})

test("RemoteFetchClient: AbortError durante leitura do body vira timeout e sofre retry", async () => {
  let calls = 0
  const waits: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 1,
    paceMs: 0,
    sleep: async (ms) => {
      waits.push(ms)
    },
    fetchImpl: async () => {
      calls++
      if (calls === 1) {
        return {
          status: 200,
          ok: true,
          json: async () => {
            throw new DOMException("body aborted", "AbortError")
          },
        } as unknown as Response
      }
      return Response.json({ ok: true })
    },
  })

  const result = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  assert.equal(result.status, "ok")
  assert.equal(calls, 2)
  assert.deepEqual(waits, [500])
})

test("RemoteFetchClient: pacing serializa requests concorrentes por host", async () => {
  let now = 0
  const starts: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 100,
    now: () => now,
    sleep: async (ms) => {
      await new Promise<void>((resolveSleep) => setImmediate(resolveSleep))
      now += ms
    },
    fetchImpl: async () => {
      starts.push(now)
      return Response.json({ ok: true })
    },
  })

  await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  await Promise.all([
    client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/2"),
    client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/3"),
    client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/4"),
  ])
  assert.deepEqual(starts, [0, 100, 200, 300])
})

test("RemoteFetchClient: revalida o circuito depois do pacing", async () => {
  let now = 0
  let calls = 0
  const waits: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 100,
    circuitFailureThreshold: 1,
    circuitCooldownMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      await new Promise<void>((resolveSleep) => setImmediate(resolveSleep))
      now += ms
    },
    fetchImpl: async () => {
      calls++
      throw new TypeError("fetch failed")
    },
  })

  const results = await Promise.all([
    client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1"),
    client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/2"),
  ])
  assert.deepEqual(results.map((result) => result.error_info?.kind), ["network", "circuit_open"])
  assert.equal(calls, 1)
  assert.deepEqual(waits, [100])
})

test("RemoteFetchClient: cooldown unico permite recuperacao half-open e segue a fila", async () => {
  let calls = 0
  let now = 0
  const waits: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 4,
    circuitCooldownMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      now += ms
    },
    fetchImpl: async () => {
      calls++
      if (calls <= 4) throw new TypeError("fetch failed")
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    },
  })

  const failed = []
  for (let id = 1; id <= 4; id++) {
    failed.push(await client.get(`https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`))
  }
  const recovered = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/5")
  const next = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/6")
  assert.deepEqual(failed.map((result) => result.status), ["error", "error", "error", "error"])
  assert.equal(recovered.status, "ok")
  assert.equal(next.status, "ok")
  assert.deepEqual(waits, [1_000], "a fila espera o cooldown uma unica vez antes do half-open")
  assert.equal(calls, 6)
})

test("RemoteFetchClient: half-open permite uma unica probe concorrente por host", async () => {
  let calls = 0
  let now = 0
  let releaseCooldown!: () => void
  let markCooldownStarted!: () => void
  const cooldownStarted = new Promise<void>((resolve) => {
    markCooldownStarted = resolve
  })
  const waits: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 1,
    circuitCooldownMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      markCooldownStarted()
      await new Promise<void>((resolve) => {
        releaseCooldown = () => {
          now += ms
          resolve()
        }
      })
    },
    fetchImpl: async () => {
      calls++
      if (calls === 1) throw new TypeError("fetch failed")
      return Response.json({ ok: true })
    },
  })

  const first = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  const firstProbe = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/2")
  await cooldownStarted
  const secondProbe = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/3")
  releaseCooldown()
  const probes = await Promise.all([firstProbe, secondProbe])
  assert.equal(first.status, "error")
  assert.deepEqual(probes.map((result) => result.status).sort(), ["error", "ok"])
  assert.deepEqual(probes.map((result) => result.error_info?.kind).filter(Boolean), ["circuit_open"])
  assert.equal(calls, 2)
  assert.deepEqual(waits, [1_000])
})

test("RemoteFetchClient: callback de cooldown obsoleto nao reabre host apos sucesso concorrente", async () => {
  let calls = 0
  let resolveFirst!: (response: Response) => void
  let resolveThird!: (response: Response) => void
  let releaseCooldown!: () => void
  let markCooldownStarted!: () => void
  const cooldownStarted = new Promise<void>((resolve) => {
    markCooldownStarted = resolve
  })
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 1,
    circuitCooldownMs: 1_000,
    sleep: async (ms) => {
      if (ms > 0) {
        markCooldownStarted()
        await new Promise<void>((resolve) => {
          releaseCooldown = resolve
        })
      }
    },
    fetchImpl: async () => {
      calls++
      if (calls === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve })
      if (calls === 2) throw new TypeError("fetch failed")
      if (calls === 3) return new Promise<Response>((resolve) => { resolveThird = resolve })
      return Response.json({ ok: true })
    },
  })

  const inFlightSuccess = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  const openingFailure = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/2")
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(calls, 2)
  const cooldownWaiter = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/3")
  await cooldownStarted

  resolveFirst(Response.json({ ok: true }))
  assert.equal((await inFlightSuccess).status, "ok")
  assert.equal((await openingFailure).status, "error")
  releaseCooldown()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(calls, 3)
  const followup = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/4")
  await new Promise<void>((resolve) => setImmediate(resolve))
  resolveThird(Response.json({ ok: true }))
  assert.deepEqual((await cooldownWaiter).status, "ok")
  assert.deepEqual((await followup).status, "ok")
  assert.equal(calls, 4)
})

test("RemoteFetchClient: callback de cooldown obsoleto nao libera host apos falha concorrente", async () => {
  let calls = 0
  let rejectFirst!: (error: Error) => void
  let releaseCooldown!: () => void
  let markCooldownStarted!: () => void
  const cooldownStarted = new Promise<void>((resolve) => {
    markCooldownStarted = resolve
  })
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 1,
    circuitCooldownMs: 1_000,
    sleep: async (ms) => {
      if (ms > 0) {
        markCooldownStarted()
        await new Promise<void>((resolve) => {
          releaseCooldown = resolve
        })
      }
    },
    fetchImpl: async () => {
      calls++
      if (calls === 1) return new Promise<Response>((_resolve, reject) => { rejectFirst = reject })
      if (calls === 2) throw new TypeError("fetch failed")
      return Response.json({ ok: true })
    },
  })

  const inFlightFailure = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  const openingFailure = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/2")
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(calls, 2)
  const cooldownWaiter = client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/3")
  await cooldownStarted

  rejectFirst(new Error("fetch failed"))
  assert.equal((await inFlightFailure).status, "error")
  assert.equal((await openingFailure).status, "error")
  releaseCooldown()
  const result = await cooldownWaiter
  assert.equal(result.status, "error")
  assert.equal(result.error_info?.kind, "circuit_open")
  assert.equal(calls, 2)
})

test("RemoteFetchClient: indisponibilidade persistente permanece error sem loop infinito", async () => {
  let calls = 0
  let now = 0
  const waits: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 4,
    circuitCooldownMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      now += ms
    },
    fetchImpl: async () => {
      calls++
      throw new TypeError("fetch failed")
    },
  })

  const results = []
  for (let id = 1; id <= 8; id++) {
    results.push(await client.get(`https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`))
  }
  assert.ok(results.every((result) => result.status === "error"))
  assert.equal(results[4]?.error_info?.kind, "network", "a quinta URL e a tentativa half-open")
  assert.equal(results[5]?.error_info?.kind, "circuit_open")
  assert.equal(calls, 5, "apos half-open falhar, nao ha novas chamadas durante o lote")
  assert.deepEqual(waits, [1_000])
})

test("RemoteFetchClient: resposta 4xx e shape invalido nao abrem breaker de transporte", async () => {
  let calls = 0
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 1,
    fetchImpl: async () => {
      calls++
      return new Response("bad request", { status: 400 })
    },
  })
  const first = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/1")
  const second = await client.get("https://dadosabertos.camara.leg.br/api/v2/deputados/2")
  assert.equal(first.error_info?.kind, "http")
  assert.equal(second.error_info?.kind, "http")
  assert.equal(calls, 2)
})

test("RemoteFetchClient: 4xx nao-transitorio limpa falhas transitórias anteriores", async () => {
  let calls = 0
  const waits: number[] = []
  const client = new RemoteFetchClient({
    timeoutMs: 100,
    maxRetries: 0,
    paceMs: 0,
    circuitFailureThreshold: 3,
    circuitCooldownMs: 1_000,
    sleep: async (ms) => {
      waits.push(ms)
    },
    fetchImpl: async () => {
      calls++
      if (calls === 3) return new Response("bad request", { status: 400 })
      throw new TypeError("fetch failed")
    },
  })

  const results = []
  for (let id = 1; id <= 5; id++) {
    results.push(await client.get(`https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`))
  }
  assert.deepEqual(results.map((result) => result.error_info?.kind), ["network", "network", "http", "network", "network"])
  assert.equal(calls, 5)
  assert.deepEqual(waits, [])
})

// O gate precisa permanecer fail-closed quando uma fonte nao respondeu apos
// os retries. Sem esse caso, o job pode ficar verde sem validar parte da
// coorte, como ocorreu no run 33276655204.
test("shouldFailGate: erro residual da fonte reprova o gate", () => {
  assert.equal(shouldFailGate({ ok: 50, error: 1 }), true)
  assert.equal(shouldFailGate({ ok: 50, mismatch: 1 }), true)
  assert.equal(shouldFailGate({ ok: 50, not_found: 1 }), true)
})

test("shouldFailGate: somente ok e skipped nao reprovam", () => {
  assert.equal(shouldFailGate({ ok: 50 }), false)
  assert.equal(shouldFailGate({ skipped: 3 }), false)
  assert.equal(shouldFailGate({ ok: 50, skipped: 3 }), false)
})
