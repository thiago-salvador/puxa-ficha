import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ingestWikidataPolitico,
  type IngestWikidataPoliticoDependencies,
} from "../scripts/lib/ingest-wikidata-politico"

const candidato = {
  slug: "politico-teste",
  nome_completo: "Politico Teste",
  nome_urna: "Politico Teste",
  cargo_disputado: "Governador" as const,
  estado: "SP",
  ids: { camara: null, senado: null, tse_sq_candidato: {} },
}

type ErrorLike = { message: string } | null
type DbResponse = { data: unknown; error: ErrorLike }
type DbOptions = {
  candidate?: { id: string; wikidata_id: string | null; partido_sigla: string | null } | null
  candidateError?: string
  mudancaExisting?: boolean
  mudancaSelectError?: string
  mudancaInsertError?: string
  mudancaInsertErrorAfter?: number
  historicoExisting?: { id: string; observacoes: string | null } | null
  historicoExactError?: string
  historicoNearby?: Record<string, unknown>[]
  historicoNearbyError?: string
  historicoInsertError?: string
  historicoUpdateError?: string
}

type DbState = {
  mudancaInsertCalls: number
}

class MockQuery implements PromiseLike<DbResponse> {
  private operation: "select" | "insert" | "update" = "select"
  private columns = ""

  constructor(
    private readonly table: string,
    private readonly options: DbOptions,
    private readonly state: DbState,
  ) {}

  select(columns: string): this {
    this.operation = "select"
    this.columns = columns
    return this
  }

  insert(): this {
    this.operation = "insert"
    return this
  }

  update(): this {
    this.operation = "update"
    return this
  }

  eq(): this { return this }
  gte(): this { return this }
  lte(): this { return this }
  limit(): this { return this }

  single(): Promise<DbResponse> {
    return Promise.resolve(this.response())
  }

  maybeSingle(): Promise<DbResponse> {
    return Promise.resolve(this.response())
  }

  then<TResult1 = DbResponse, TResult2 = never>(
    onfulfilled?: ((value: DbResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.response()).then(onfulfilled, onrejected)
  }

  private response(): DbResponse {
    if (this.table === "candidatos") {
      return {
        data: this.options.candidate === undefined
          ? { id: "candidate-id", wikidata_id: "Q456", partido_sigla: "PT" }
          : this.options.candidate,
        error: this.options.candidateError ? { message: this.options.candidateError } : null,
      }
    }

    if (this.table === "mudancas_partido") {
      if (this.operation === "select") {
        return {
          data: this.options.mudancaExisting ? { id: "mudanca-id" } : null,
          error: this.options.mudancaSelectError ? { message: this.options.mudancaSelectError } : null,
        }
      }
      this.state.mudancaInsertCalls++
      const shouldFail = this.options.mudancaInsertError
        && (this.options.mudancaInsertErrorAfter === undefined
          || this.state.mudancaInsertCalls > this.options.mudancaInsertErrorAfter)
      return {
        data: null,
        error: shouldFail ? { message: this.options.mudancaInsertError! } : null,
      }
    }

    if (this.table === "historico_politico") {
      if (this.operation === "update") {
        return {
          data: null,
          error: this.options.historicoUpdateError ? { message: this.options.historicoUpdateError } : null,
        }
      }
      if (this.operation === "insert") {
        return {
          data: null,
          error: this.options.historicoInsertError ? { message: this.options.historicoInsertError } : null,
        }
      }
      if (this.columns === "id, observacoes") {
        return {
          data: this.options.historicoExisting ? [this.options.historicoExisting] : [],
          error: this.options.historicoExactError ? { message: this.options.historicoExactError } : null,
        }
      }
      return {
        data: this.options.historicoNearby ?? [],
        error: this.options.historicoNearbyError ? { message: this.options.historicoNearbyError } : null,
      }
    }

    return { data: null, error: null }
  }
}

function database(options: DbOptions = {}): IngestWikidataPoliticoDependencies["database"] {
  const state: DbState = { mudancaInsertCalls: 0 }
  return {
    from: (table: string) => new MockQuery(table, options, state),
  } as unknown as IngestWikidataPoliticoDependencies["database"]
}

function fetchSequence(...steps: unknown[]): IngestWikidataPoliticoDependencies["fetchJson"] {
  let index = 0
  return (async <T>() => {
    const step = steps[index++]
    if (step instanceof Error) throw step
    return step as T
  }) as IngestWikidataPoliticoDependencies["fetchJson"]
}

async function executar(
  db: DbOptions = {},
  fetchJson: IngestWikidataPoliticoDependencies["fetchJson"] = fetchSequence(
    { results: { bindings: [] } },
    { results: { bindings: [] } },
  ),
) {
  let fetchCalls = 0
  const countedFetch: IngestWikidataPoliticoDependencies["fetchJson"] = async <T>(...args: Parameters<IngestWikidataPoliticoDependencies["fetchJson"]>) => {
    fetchCalls++
    return fetchJson<T>(...args)
  }
  const [result] = await ingestWikidataPolitico({
    database: database(db),
    loadCandidates: async () => [candidato],
    fetchJson: countedFetch,
    wait: async () => {},
  })
  return { result, fetchCalls }
}

describe("ingestWikidataPolitico: desfecho da coleta", () => {
  it("sem QID e nao_aplicavel e nao consulta a rede", async () => {
    const { result, fetchCalls } = await executar({
      candidate: { id: "candidate-id", wikidata_id: null, partido_sigla: "PT" },
    })
    assert.equal(fetchCalls, 0)
    assert.equal(result.coleta_resultado, "nao_aplicavel")
  })

  it("duas respostas SPARQL validas vazias viram vazio_confirmado", async () => {
    const { result } = await executar()
    assert.equal(result.coleta_resultado, "vazio_confirmado")
    assert.equal(result.coleta_volume, undefined)
    assert.deepEqual(result.errors, [])
  })

  it("binding remoto conta como encontrado mesmo sem linha gravavel", async () => {
    const { result } = await executar({}, fetchSequence(
      {
        results: {
          bindings: [{
            party: { value: "http://www.wikidata.org/entity/Q987" },
            partyLabel: { value: "Partido dos Trabalhadores" },
          }],
        },
      },
      { results: { bindings: [] } },
    ))

    assert.equal(result.rows_upserted, 0)
    assert.equal(result.coleta_resultado, "encontrado")
    assert.equal(result.coleta_volume, 1)
  })

  it("HTTP, timeout e shape invalido viram erro, nunca vazio", async () => {
    for (const failure of [
      new Error("HTTP 503"),
      new Error("timeout apos 20000ms"),
      { results: {} },
      { results: { bindings: [{}] } },
    ]) {
      const { result } = await executar({}, fetchSequence(failure))
      assert.equal(result.coleta_resultado, "erro")
      assert.notEqual(result.coleta_resultado, "vazio_confirmado")
      assert.ok(result.errors.length > 0)
    }
  })

  it("erro de SELECT do candidato vira erro", async () => {
    const { result } = await executar({ candidateError: "select candidato falhou" })
    assert.equal(result.coleta_resultado, "erro")
    assert.match(result.errors.join(" "), /select candidato falhou/)
  })

  it("erros de SELECT e INSERT de filiacao viram erro", async () => {
    const partyPayload = {
      results: {
        bindings: [{
          party: { value: "http://www.wikidata.org/entity/Q987" },
          partyLabel: { value: "Partido dos Trabalhadores" },
          partyStart: { value: "+2020-01-01T00:00:00Z" },
        }],
      },
    }
    const emptyOffice = { results: { bindings: [] } }

    const select = await executar(
      { mudancaSelectError: "select filiacao falhou" },
      fetchSequence(partyPayload, emptyOffice),
    )
    assert.equal(select.result.coleta_resultado, "erro")

    const insert = await executar(
      { mudancaInsertError: "insert filiacao falhou" },
      fetchSequence(partyPayload, emptyOffice),
    )
    assert.equal(insert.result.coleta_resultado, "erro")
    assert.match(insert.result.errors.join(" "), /insert filiacao falhou/)
  })

  it("preserva escrita parcial quando uma filiacao posterior falha", async () => {
    const partyPayload = {
      results: {
        bindings: [
          {
            party: { value: "http://www.wikidata.org/entity/Q987" },
            partyLabel: { value: "Partido dos Trabalhadores" },
            partyStart: { value: "+2020-01-01T00:00:00Z" },
          },
          {
            party: { value: "http://www.wikidata.org/entity/Q888" },
            partyLabel: { value: "Partido Socialista Brasileiro" },
            partyStart: { value: "+2022-01-01T00:00:00Z" },
          },
        ],
      },
    }

    const { result } = await executar(
      { mudancaInsertError: "segunda filiacao falhou", mudancaInsertErrorAfter: 1 },
      fetchSequence(partyPayload, { results: { bindings: [] } }),
    )

    assert.equal(result.coleta_resultado, "erro")
    assert.equal(result.rows_upserted, 1)
    assert.deepEqual(result.tables_updated, ["mudancas_partido"])
    assert.match(result.errors.join(" "), /segunda filiacao falhou/)
  })

  it("preserva filiacao gravada quando historico posterior falha", async () => {
    const partyPayload = {
      results: {
        bindings: [{
          party: { value: "http://www.wikidata.org/entity/Q987" },
          partyLabel: { value: "Partido dos Trabalhadores" },
          partyStart: { value: "+2020-01-01T00:00:00Z" },
        }],
      },
    }
    const officePayload = {
      results: {
        bindings: [{
          office: { value: "http://www.wikidata.org/entity/Q111" },
          officeLabel: { value: "Governador de Sao Paulo" },
          officeStart: { value: "+2022-01-01T00:00:00Z" },
        }],
      },
    }

    const { result } = await executar(
      { historicoInsertError: "historico posterior falhou" },
      fetchSequence(partyPayload, officePayload),
    )

    assert.equal(result.coleta_resultado, "erro")
    assert.equal(result.rows_upserted, 1)
    assert.deepEqual(result.tables_updated, ["mudancas_partido"])
    assert.match(result.errors.join(" "), /historico posterior falhou/)
  })

  it("erros de SELECT, UPDATE e INSERT do historico viram erro", async () => {
    const emptyParty = { results: { bindings: [] } }
    const officePayload = {
      results: {
        bindings: [{
          office: { value: "http://www.wikidata.org/entity/Q111" },
          officeLabel: { value: "Governador de Sao Paulo" },
          officeStart: { value: "+2022-01-01T00:00:00Z" },
        }],
      },
    }

    const select = await executar(
      { historicoExactError: "select historico falhou" },
      fetchSequence(emptyParty, officePayload),
    )
    assert.equal(select.result.coleta_resultado, "erro")

    const update = await executar(
      {
        historicoExisting: { id: "historico-id", observacoes: "Wikidata" },
        historicoUpdateError: "update historico falhou",
      },
      fetchSequence(emptyParty, officePayload),
    )
    assert.equal(update.result.coleta_resultado, "erro")

    const insert = await executar(
      { historicoInsertError: "insert historico falhou" },
      fetchSequence(emptyParty, officePayload),
    )
    assert.equal(insert.result.coleta_resultado, "erro")
    assert.match(insert.result.errors.join(" "), /insert historico falhou/)
  })
})
