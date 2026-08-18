import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  chaveConferenciaDatajud,
  classificarResultadoDjen,
  cnjValido,
  conferirDatajudResultados,
  contextoPolitico,
  executarLotesEmOrdem,
  filtrarHomonimosDescartados,
  gravarCheckpointConcorrente,
  instituicoesAtivas,
  lotesSolicitados,
  ordenar,
  pesquisarCandidato,
  prioridade,
  processarComDoisWorkers,
} from "../scripts/curadoria-processos-lote"

type Snapshot = Parameters<typeof prioridade>[0]
type Candidato = Parameters<typeof contextoPolitico>[0]

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    slug: "candidato-teste",
    nome_urna: "Candidato Teste",
    cargo_disputado: "Governador",
    processos: 0,
    ...overrides,
  }
}

function candidato(overrides: Partial<Candidato> = {}): Candidato {
  return {
    id: "id-teste",
    slug: "candidato-teste",
    nome_completo: "Carlos da Silva Teste",
    nome_urna: "Carlos Teste",
    cargo_disputado: "Governador",
    cargo_atual: null,
    estado: "MG",
    partido_sigla: "PSD",
    biografia: null,
    ...overrides,
  }
}

describe("curadoria de processos em lote", () => {
  it("aceita lote único e faixa inclusiva de lotes", () => {
    assert.deepEqual(lotesSolicitados(["--lote=4"]), [4])
    assert.deepEqual(lotesSolicitados(["--lotes=1-10"]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.throws(() => lotesSolicitados(["--lote=1", "--lotes=1-2"]), /use --lote=N ou --lotes/)
    assert.throws(() => lotesSolicitados(["--lotes=3-1"]), /faixa de lotes invalida/)
  })

  it("carrega o contexto uma vez e faz checkpoint após cada lote em ordem", async () => {
    let carregamentos = 0
    const eventos: string[] = []

    await executarLotesEmOrdem(
      [2, 3, 4],
      async (numeros) => {
        carregamentos += 1
        assert.deepEqual(numeros, [2, 3, 4])
        return { origem: "recursos-compartilhados" }
      },
      async (numero, contexto) => {
        assert.equal(contexto.origem, "recursos-compartilhados")
        eventos.push(`processar:${numero}`)
        return `resultado:${numero}`
      },
      (numero, resultado) => {
        eventos.push(`checkpoint:${numero}:${resultado}`)
      },
    )

    assert.equal(carregamentos, 1)
    assert.deepEqual(eventos, [
      "processar:2",
      "checkpoint:2:resultado:2",
      "processar:3",
      "checkpoint:3:resultado:3",
      "processar:4",
      "checkpoint:4:resultado:4",
    ])
  })

  it("mantém dois workers e preserva a ordem dos resultados", async () => {
    let ativos = 0
    let maximo = 0
    const resultados = await processarComDoisWorkers([1, 2, 3, 4], async (item) => {
      ativos += 1
      maximo = Math.max(maximo, ativos)
      await new Promise<void>((resolve) => setImmediate(resolve))
      ativos -= 1
      return item * 10
    })

    assert.equal(maximo, 2)
    assert.deepEqual(resultados, [10, 20, 30, 40])
  })

  it("executa a busca DJEN mesmo com identidade bloqueada sem promover vazio", async () => {
    let buscas = 0
    const resultado = await pesquisarCandidato(
      candidato({ slug: "sem-identidade" }),
      snapshot({ slug: "sem-identidade" }),
      undefined,
      new Map(),
      ["TJMG"],
      "/tmp/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({
          status: "bloqueada",
          motivo: "sem segundo identificador oficial",
        }),
        buscarDjen: async (nome) => {
          buscas += 1
          assert.equal(nome, "Carlos da Silva Teste")
          return {
            url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?nomeParte=Carlos%20da%20Silva%20Teste",
            total: 0,
            itens: [],
          }
        },
      },
    )

    assert.equal(buscas, 1)
    assert.equal(resultado.classificacao, "bloqueado")
    assert.equal(resultado.processos.length, 0)
    assert.equal(resultado.busca.total_api, 0)
    assert.equal(resultado.busca.ocorrencias_nome_exato, 0)
    assert.match(resultado.motivo, /identidade/i)
  })

  it("classifica falha de rede como erro explícito, nunca como bloqueio editorial", async () => {
    const resultado = await pesquisarCandidato(
      candidato({ slug: "falha-rede" }),
      snapshot({ slug: "falha-rede" }),
      undefined,
      new Map(),
      ["TJMG"],
      "/tmp/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", nome: "Carlos da Silva Teste" }),
        buscarDjen: async () => { throw new Error("HTTP 503 no DJEN") },
      },
    )

    assert.equal(resultado.classificacao, "erro")
    assert.match(String(resultado.busca.erro), /HTTP 503/)
    assert.equal(resultado.processos.length, 0)
  })

  it("confere DataJud uma vez por lote e atualiza processos de todos os candidatos", async () => {
    const numeros = [
      "4004910-65.2025.8.26.0506",
      "0709932-06.2017.8.07.0001",
      "1000123-45.2024.4.01.3400",
    ]
    const resultados = [
      {
        slug: "candidato-a",
        processos: [
          { numero_cnj: numeros[0], tribunal: "TJSP", datajud: { status: "pendente_conferencia_lote" } },
          { numero_cnj: numeros[1], tribunal: "TJDFT", datajud: { status: "pendente_conferencia_lote" } },
        ],
      },
      {
        slug: "candidato-b",
        processos: [
          { numero_cnj: numeros[2], tribunal: "TRF1", datajud: { status: "pendente_conferencia_lote" } },
        ],
      },
    ] as unknown as Parameters<typeof conferirDatajudResultados>[0]
    let chamadas = 0
    let recebidos: Array<{ numero: string; tribunal: string }> = []

    await conferirDatajudResultados(resultados, "chave-teste", async (processos, chave) => {
      chamadas += 1
      recebidos = processos
      assert.equal(chave, "chave-teste")
      return new Map(processos.map((processo) => [
        chaveConferenciaDatajud(processo.tribunal, processo.numero),
        { status: "confirmado", numeroProcesso: processo.numero.replace(/\D/g, "") },
      ]))
    })

    assert.equal(chamadas, 1)
    assert.deepEqual(recebidos, [
      { numero: numeros[0], tribunal: "TJSP" },
      { numero: numeros[1], tribunal: "TJDFT" },
      { numero: numeros[2], tribunal: "TRF1" },
    ])
    assert.deepEqual(
      resultados.flatMap((candidato) => candidato.processos.map((processo) => processo.datajud.status)),
      ["confirmado", "confirmado", "confirmado"],
    )
  })

  it("rejeita o mesmo CNJ atribuído a tribunais diferentes antes da consulta", async () => {
    const numero = "4004910-65.2025.8.26.0506"
    const resultados = [
      { slug: "candidato-a", processos: [{ numero_cnj: numero, tribunal: "TJSP", datajud: {} }] },
      { slug: "candidato-b", processos: [{ numero_cnj: numero, tribunal: "TJBA", datajud: {} }] },
    ] as unknown as Parameters<typeof conferirDatajudResultados>[0]
    let chamadas = 0

    await assert.rejects(
      () => conferirDatajudResultados(resultados, "chave-teste", async () => {
        chamadas += 1
        return new Map()
      }),
      /conflito de tribunal/,
    )
    assert.equal(chamadas, 0)
  })

  it("rejeita resposta DataJud ausente para a chave tribunal e CNJ", async () => {
    const numero = "4004910-65.2025.8.26.0506"
    const resultados = [
      { slug: "candidato-a", processos: [{ numero_cnj: numero, tribunal: "TJSP", datajud: {} }] },
    ] as unknown as Parameters<typeof conferirDatajudResultados>[0]

    await assert.rejects(
      () => conferirDatajudResultados(resultados, "chave-teste", async () => new Map()),
      /resposta ausente para TJSP 4004910-65\.2025\.8\.26\.0506/,
    )
  })

  it("rejeita status DataJud pendente", async () => {
    const numero = "4004910-65.2025.8.26.0506"
    const resultados = [
      { slug: "candidato-a", processos: [{ numero_cnj: numero, tribunal: "TJSP", datajud: {} }] },
    ] as unknown as Parameters<typeof conferirDatajudResultados>[0]

    await assert.rejects(
      () => conferirDatajudResultados(resultados, "chave-teste", async () => new Map([
        [chaveConferenciaDatajud("TJSP", numero), { status: "pendente_conferencia_lote" }],
      ])),
      /status nao final.*pendente_conferencia_lote/,
    )
  })

  it("aceita os status finais confirmado, nao_localizado e erro", async () => {
    const entradas = [
      { numero: "4004910-65.2025.8.26.0506", tribunal: "TJSP", status: "confirmado" },
      { numero: "0709932-06.2017.8.07.0001", tribunal: "TJDFT", status: "nao_localizado" },
      { numero: "1000123-45.2024.4.01.3400", tribunal: "TRF1", status: "erro" },
    ]
    const resultados = entradas.map((entrada, indice) => ({
      slug: `candidato-${indice}`,
      processos: [{ numero_cnj: entrada.numero, tribunal: entrada.tribunal, datajud: {} }],
    })) as unknown as Parameters<typeof conferirDatajudResultados>[0]

    await assert.doesNotReject(() => conferirDatajudResultados(
      resultados,
      "chave-teste",
      async () => new Map(entradas.map((entrada) => [
        chaveConferenciaDatajud(entrada.tribunal, entrada.numero),
        { status: entrada.status },
      ])),
    ))
    assert.deepEqual(
      resultados.flatMap((candidato) => candidato.processos.map((processo) => processo.datajud.status)),
      ["confirmado", "nao_localizado", "erro"],
    )
  })

  it("declara todas as instituições ativas do inventário DJEN", () => {
    assert.deepEqual(instituicoesAtivas([
      { uf: "", instituicoes: [{ sigla: "STF" }, { sigla: "STJ", active: false }] },
      { uf: "SP", instituicoes: [{ sigla: "TJSP" }, { sigla: "STF" }] },
      { uf: "BA", instituicoes: [{ sigla: "TJBA", active: true }] },
    ]), ["STF", "TJBA", "TJSP"])
  })

  it("prioriza governador com mandato de ministro antes de sinais editoriais", () => {
    const ministro = snapshot({
      slug: "ministro",
      historico: [{ tipo_evento: "mandato", cargo_canonico: "Ministro de Estado" }],
    })
    const comSinal = snapshot({
      slug: "com-sinal",
      claims: [{ titulo: "Investigação em andamento" }],
    })
    const comum = snapshot({ slug: "comum" })

    assert.equal(prioridade(ministro), 2)
    assert.deepEqual(ordenar([comum, comSinal, ministro]).map((item) => item.slug), [
      "ministro",
      "com-sinal",
      "comum",
    ])
  })

  it("aceita cargo próximo do nome e rejeita cargo distante", () => {
    const registro = candidato()
    const ficha = snapshot()
    const proximo = "O processo cita Carlos da Silva Teste, governador de Minas Gerais, como parte interessada."
    const distante = `Governador de outro estado. ${"texto sem identidade ".repeat(30)} Carlos da Silva Teste foi citado.`

    assert.match(contextoPolitico(registro, ficha, proximo, registro.nome_completo) ?? "", /CARLOS DA SILVA TESTE/)
    assert.equal(contextoPolitico(registro, ficha, distante, registro.nome_completo), null)
  })

  it("não atribui ao candidato cargo e UF pertencentes a terceira pessoa", () => {
    const registro = candidato()
    const ficha = snapshot()
    const texto = [
      "Carlos da Silva Teste compareceu à audiência como interessado.",
      "Na sequência, Maria Souza, governadora de Minas Gerais, apresentou sua manifestação.",
    ].join(" ")

    assert.equal(contextoPolitico(registro, ficha, texto, registro.nome_completo), null)
  })

  it("não atribui ao candidato o cargo atual mencionado depois de outro nome", () => {
    const registro = candidato()
    const ficha = snapshot()
    const texto = "Carlos da Silva Teste e o atual governador João de Minas Gerais compareceram à audiência."

    assert.equal(contextoPolitico(registro, ficha, texto, registro.nome_completo), null)
  })

  it("não usa Eleição 2026 e partido soltos como vínculo de identidade", () => {
    const registro = candidato()
    const ficha = snapshot({ partido_sigla: "PSD" })
    const texto = [
      "Carlos da Silva Teste foi mencionado em uma comunicação sem qualificação.",
      "Em tópico independente, Eleição 2026. O PSD divulgou seu calendário partidário.",
    ].join(" ")

    assert.equal(contextoPolitico(registro, ficha, texto, registro.nome_completo), null)
  })

  it("não fabrica correspondência de CPF concatenando dígitos dispersos", () => {
    const registro = candidato()
    const ficha = snapshot()
    const texto = [
      "Carlos da Silva Teste consta na comunicação.",
      "Protocolo 123, sala 456, evento 789 e item 01.",
    ].join(" ")

    assert.equal(
      contextoPolitico(registro, ficha, texto, registro.nome_completo, { cpf: "123.456.789-01" }),
      null,
    )
  })

  it("não repete em homônimos um CNJ já aceito como processo", () => {
    const aceito = "4004910-65.2025.8.26.0506"
    const apenasHomonimo = "0709932-06.2017.8.07.0001"
    const descartados = new Map([
      [aceito, { numero_cnj: aceito }],
      [apenasHomonimo, { numero_cnj: apenasHomonimo }],
    ])
    const encontrados = new Map<string, unknown>([[aceito, { contexto: "cargo próximo" }]])

    assert.deepEqual(filtrarHomonimosDescartados(descartados, encontrados), [
      { numero_cnj: apenasHomonimo },
    ])
  })

  it("bloqueia ausência de achado quando o DJEN atinge o teto público", () => {
    const truncado = classificarResultadoDjen(0, 0, true)

    assert.equal(truncado.classificacao, "bloqueado")
    assert.match(truncado.motivo, /teto publico de 10000 comunicacoes/)
    assert.match(truncado.motivo, /nao confirma vazio/)
    assert.equal(classificarResultadoDjen(0, 0, false).classificacao, "vazio_confirmado")
    assert.equal(classificarResultadoDjen(1, 0, true).classificacao, "encontrado")
  })

  it("preserva checkpoints de dois lotes concorrentes", async () => {
    const diretorio = mkdtempSync(join(tmpdir(), "processos-checkpoint-"))
    const evidenciaPath = join(diretorio, "evidencia.json")
    const candidato = (slug: string) => ({
      slug,
      nome_urna: slug,
      nome_completo: slug,
      cargo: "Governador",
      uf: "MG",
      partido: "PSD",
      prioridade: 4 as const,
      identidade: {},
      busca: {},
      ocorrencias_ambiguas: [],
      homonimos_descartados: [],
      classificacao: "vazio_confirmado" as const,
      motivo: "teste",
      processos: [],
      banco: { coleta_log: "pendente" as const },
    })
    const base = {
      supabase_ref: "ref-teste",
      base_commit: "commit-teste",
      branch: "branch-teste",
      snapshot_inicial_em: "2026-08-05T12:00:00.000Z",
      total_inicial: 2,
      candidatos_iniciais: ["candidato-a", "candidato-b"],
      fontes: {},
    }

    let sinalizarLock!: () => void
    const lockAdquirido = new Promise<void>((resolve) => { sinalizarLock = resolve })
    let liberarPrimeiro!: () => void
    const aguardarLiberacao = new Promise<void>((resolve) => { liberarPrimeiro = resolve })

    try {
      const primeiro = gravarCheckpointConcorrente(evidenciaPath, {
        ...base,
        lote: {
          numero: 1,
          concluido_em: "2026-08-05T12:01:00.000Z",
          slugs: ["candidato-a"],
          candidatos: [candidato("candidato-a")],
        },
      }, {
        retryMs: 1,
        aposAdquirirLock: async () => {
          sinalizarLock()
          await aguardarLiberacao
        },
      })

      await lockAdquirido
      const segundo = gravarCheckpointConcorrente(evidenciaPath, {
        ...base,
        lote: {
          numero: 2,
          concluido_em: "2026-08-05T12:02:00.000Z",
          slugs: ["candidato-b"],
          candidatos: [candidato("candidato-b")],
        },
      }, { retryMs: 1, timeoutMs: 2_000 })

      await new Promise<void>((resolve) => setImmediate(resolve))
      liberarPrimeiro()
      await Promise.all([primeiro, segundo])

      const final = JSON.parse(readFileSync(evidenciaPath, "utf8")) as {
        lotes: Array<{ numero: number }>
        resumo: Record<string, number>
      }
      assert.deepEqual(final.lotes.map((lote) => lote.numero), [1, 2])
      assert.equal(final.resumo.classificados, 2)
      assert.equal(final.resumo.vazio_confirmado, 2)
    } finally {
      rmSync(diretorio, { recursive: true, force: true })
    }
  })

  it("rejeita metadados divergentes sem alterar o checkpoint existente", async () => {
    const diretorio = mkdtempSync(join(tmpdir(), "processos-checkpoint-invariantes-"))
    const evidenciaPath = join(diretorio, "evidencia.json")
    const base = {
      supabase_ref: "ref-teste",
      base_commit: "commit-teste",
      branch: "branch-teste",
      snapshot_inicial_em: "2026-08-05T12:00:00.000Z",
      total_inicial: 1,
      candidatos_iniciais: ["candidato-a"],
      fontes: { djen: "fonte-a", datajud: { versao: 1 } },
    }
    const lote = {
      numero: 1,
      concluido_em: "2026-08-05T12:01:00.000Z",
      slugs: ["candidato-a"],
      candidatos: [{
        slug: "candidato-a",
        nome_urna: "Candidato A",
        nome_completo: "Candidato A",
        cargo: "Governador",
        uf: "MG",
        partido: "PSD",
        prioridade: 4 as const,
        identidade: {},
        busca: {},
        ocorrencias_ambiguas: [],
        homonimos_descartados: [],
        classificacao: "vazio_confirmado" as const,
        motivo: "teste",
        processos: [],
        banco: { coleta_log: "pendente" as const },
      }],
    }

    try {
      await gravarCheckpointConcorrente(evidenciaPath, { ...base, lote })
      const original = readFileSync(evidenciaPath, "utf8")
      const divergencias = [
        { campo: "base_commit", entrada: { ...base, base_commit: "outro-commit", lote } },
        { campo: "branch", entrada: { ...base, branch: "outra-branch", lote } },
        { campo: "supabase_ref", entrada: { ...base, supabase_ref: "outra-ref", lote } },
        { campo: "snapshot_inicial_em", entrada: { ...base, snapshot_inicial_em: "2026-08-05T13:00:00.000Z", lote } },
        { campo: "fontes", entrada: { ...base, fontes: { djen: "fonte-b" }, lote } },
      ]

      for (const divergencia of divergencias) {
        await assert.rejects(
          gravarCheckpointConcorrente(evidenciaPath, divergencia.entrada),
          new RegExp(`checkpoint: ${divergencia.campo} diverge`),
        )
        assert.equal(readFileSync(evidenciaPath, "utf8"), original)
      }
    } finally {
      rmSync(diretorio, { recursive: true, force: true })
    }
  })

  it("rejeita CNJ com prefixo, sufixo ou separadores arbitrários", () => {
    const formatado = "4004910-65.2025.8.26.0506"
    const digitos = "40049106520258260506"

    assert.equal(cnjValido(formatado), true)
    assert.equal(cnjValido(digitos), true)
    assert.equal(cnjValido(`prefixo${formatado}`), false)
    assert.equal(cnjValido(`${formatado}sufixo`), false)
    assert.equal(cnjValido("4004910/65/2025/8/26/0506"), false)
  })
})
