/**
 * Prova de que o dry-run não escreve, e de que ele é fail-closed.
 *
 * O que "fail-closed" precisa significar aqui, e o que cada caso abaixo prova:
 *
 *   1. Verbo de escrita conhecido lança, sem requisição.
 *   2. Verbo DESCONHECIDO também lança. Este é o caso que separa allowlist de
 *      blocklist: uma versão futura do `@supabase/supabase-js` que acrescente um
 *      verbo de escrita já nasce bloqueada.
 *   3. O bloqueio acontece ANTES de o cliente existir. Sem credencial no
 *      ambiente, `getClient()` lança "Missing SUPABASE_URL"; se o erro que sai é
 *      `EscritaBloqueadaError`, então nada foi construído e nada foi enviado.
 *   4. O coletor de sanções, rodado ponta a ponta em dry-run com rede simulada,
 *      produz plano e não produz bloqueio. Bloqueio zero é o que prova que a
 *      camada 1 cobre os caminhos de escrita do coletor; se alguém acrescentar
 *      um `insert` sem planejar, este número deixa de ser zero.
 *   5. A telemetria de coleta também não escreve.
 *   6. `escreverAuditado` recusa em dry-run, com mensagem própria.
 */

import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  __resetarDryRunParaTeste,
  ativarDryRun,
  emDryRun,
  ENV_DRY_RUN,
  EscritaBloqueadaError,
  exigirDryRun,
  METODOS_DE_LEITURA,
  planejarEscrita,
  relatorioDryRun,
} from "../scripts/lib/dry-run"
import { supabase } from "../scripts/lib/supabase"
import { registrarColetas } from "../scripts/lib/coleta-log"
import { escreverAuditado } from "../scripts/lib/escrita-auditada"
import {
  coletarSancoesDoCandidato,
  type ColetaDeps,
  type RespostaCadastro,
} from "../scripts/lib/ingest-transparencia-sanctions"

/** Verbos que o builder do PostgREST expõe. Só `select` pode passar. */
const VERBOS_DE_ESCRITA = ["insert", "update", "upsert", "delete"] as const

afterEach(() => {
  __resetarDryRunParaTeste()
  delete process.env[ENV_DRY_RUN]
})

describe("dry-run: ativação", () => {
  it("está desligado por padrão e liga pelo env ou pela chamada", () => {
    // O `afterEach` limpa a variável DEPOIS de cada caso, o que não protege o
    // primeiro: numa máquina com `PF_DRY_RUN=1` exportado no shell, o assert
    // de baixo falhava sem nada de errado no código. Mesma classe do bug do
    // `.env.local`, então o caso zera o ambiente que ele mesmo mede.
    const original = process.env[ENV_DRY_RUN]
    delete process.env[ENV_DRY_RUN]

    try {
      assert.equal(emDryRun(), false)

      process.env[ENV_DRY_RUN] = "1"
      assert.equal(emDryRun(), true)

      delete process.env[ENV_DRY_RUN]
      assert.equal(emDryRun(), false)

      ativarDryRun()
      assert.equal(emDryRun(), true)
    } finally {
      if (original !== undefined) process.env[ENV_DRY_RUN] = original
    }
  })

  it("exigirDryRun barra o script quando o modo está desligado", () => {
    assert.throws(() => exigirDryRun("script-de-teste"), /só roda em dry-run/)
    ativarDryRun()
    assert.doesNotThrow(() => exigirDryRun("script-de-teste"))
  })
})

describe("dry-run: blindagem do cliente (camada 2)", () => {
  it("bloqueia todo verbo de escrita conhecido, sem tocar a rede", () => {
    ativarDryRun()

    for (const verbo of VERBOS_DE_ESCRITA) {
      assert.throws(
        () => {
          const builder = supabase.from("sancoes_administrativas") as unknown as Record<
            string,
            (...a: unknown[]) => unknown
          >
          builder[verbo]({ candidato_id: "x" })
        },
        (err: unknown) => {
          assert.ok(
            err instanceof EscritaBloqueadaError,
            `${verbo} devia lançar EscritaBloqueadaError, veio ${String(err)}`,
          )
          assert.match((err as Error).message, /Nenhuma requisição foi feita/)
          return true
        },
        `verbo ${verbo} passou pela blindagem`,
      )
    }
  })

  it("bloqueia verbo DESCONHECIDO: a lista é allowlist, não blocklist", () => {
    ativarDryRun()

    // O nome não existe no supabase-js de hoje. É exatamente esse o ponto: um
    // método novo numa versão futura tem que nascer bloqueado.
    assert.throws(() => {
      const builder = supabase.from("candidatos") as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >
      builder.gravarDeUmJeitoNovo({ x: 1 })
    }, EscritaBloqueadaError)

    assert.deepEqual([...METODOS_DE_LEITURA], ["select"])
  })

  it("bloqueia rpc, que pode escrever sem o chamador saber", () => {
    ativarDryRun()
    const cliente = supabase as unknown as Record<string, (...a: unknown[]) => unknown>
    assert.throws(() => cliente.rpc("qualquer_funcao", {}), EscritaBloqueadaError)
  })

  it("bloqueia ANTES de construir o cliente: o erro não é falta de credencial", () => {
    const urlOriginal = process.env.SUPABASE_URL
    const keyOriginal = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    try {
      ativarDryRun()
      const builder = supabase.from("patrimonio") as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >
      const erro = (() => {
        try {
          builder.insert({ valor_total: 1 })
          return null
        } catch (err) {
          return err
        }
      })()

      // Se a blindagem estivesse depois da construção do cliente, o erro aqui
      // seria "Missing SUPABASE_URL...". É EscritaBloqueadaError, então nada foi
      // construído e nenhuma requisição saiu.
      assert.ok(erro instanceof EscritaBloqueadaError)
      assert.doesNotMatch((erro as Error).message, /Missing SUPABASE_URL/)
    } finally {
      if (urlOriginal !== undefined) process.env.SUPABASE_URL = urlOriginal
      if (keyOriginal !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keyOriginal
    }
  })

  it("registra a tentativa bloqueada no relatório, em vez de engoli-la", () => {
    ativarDryRun()
    try {
      const builder = supabase.from("pontos_atencao") as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >
      builder.delete()
    } catch {
      // esperado
    }

    const relatorio = relatorioDryRun()
    assert.equal(relatorio.bloqueios.length, 1)
    assert.equal(relatorio.bloqueios[0].tabela, "pontos_atencao")
    assert.equal(relatorio.bloqueios[0].metodo, "delete")
  })

  it("com o modo desligado, o acesso segue o caminho normal", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { __resetSupabaseParaTeste } = await import("../scripts/lib/supabase")

    const urlOriginal = process.env.SUPABASE_URL
    const keyOriginal = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    // O teste precisa valer numa máquina COM `.env.local` no cwd (dev local) e
    // numa sem (CI): cache zerado e cwd movido para um diretório vazio, para
    // que `loadEnvFilesOnce` não ache credencial nenhuma.
    __resetSupabaseParaTeste()
    const cwdOriginal = process.cwd()
    const temp = mkdtempSync(join(tmpdir(), "pf-dry-run-test-"))
    process.chdir(temp)

    try {
      // Sem dry-run a blindagem se retira, e o que reclama é a falta de
      // credencial. Isso prova que a mudança não alterou o caminho de produção.
      assert.throws(() => supabase.from("candidatos"), /Missing SUPABASE_URL/)
    } finally {
      process.chdir(cwdOriginal)
      rmSync(temp, { recursive: true, force: true })
      __resetSupabaseParaTeste()
      if (urlOriginal !== undefined) process.env.SUPABASE_URL = urlOriginal
      if (keyOriginal !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keyOriginal
    }
  })
})

describe("dry-run: coleta de sanções ponta a ponta (camada 1)", () => {
  /** CPF válido nos dígitos verificadores, usado só aqui. */
  const CPF = "52998224725"

  function depsComRespostas(
    porTipo: Record<string, RespostaCadastro>,
  ): { deps: ColetaDeps; chamadas: string[] } {
    const chamadas: string[] = []
    return {
      chamadas,
      deps: {
        async buscar(endpoint) {
          chamadas.push(endpoint.tipo)
          return porTipo[endpoint.tipo] ?? { ok: true, registros: [] }
        },
      },
    }
  }

  it("fecha cada cadastro num estado terminal honesto", async () => {
    const { deps } = depsComRespostas({
      CEIS: {
        ok: true,
        registros: [
          {
            id: 1,
            dataInicioSancao: "01/01/2024",
            dataFimSancao: "01/01/2099",
            tipoSancao: { descricaoResumida: "Inidoneidade" },
            orgaoSancionador: { nome: "CGU" },
            pessoa: { cpfFormatado: "529.982.247-25", nome: "Fulano De Tal Completo" },
          },
        ],
      },
      CNEP: { ok: true, registros: [] },
      CEAF: { ok: false, erro: "ceaf: HTTP 500" },
    })

    const coleta = await coletarSancoesDoCandidato(CPF, "Fulano De Tal Completo", deps)

    assert.equal(coleta.consultou, true)
    assert.deepEqual(
      coleta.porCadastro.map((c) => [c.tipo, c.resultado]),
      [
        ["CEIS", "encontrado"],
        ["CNEP", "vazio_confirmado"],
        ["CEAF", "erro"],
      ],
    )
    // Cadastro que caiu não vira ausência: continua `erro`, com motivo.
    assert.match(coleta.porCadastro[2].detalhe ?? "", /HTTP 500/)
  })

  it("cadastro que respondeu só com registro de outra pessoa é INDETERMINADO, nunca vazio", async () => {
    // O cenário é indistinguível do incidente de 2026-08-04: a API ignorou o
    // filtro e devolveu a lista nacional. Fechar em vazio_confirmado seria
    // carimbar "ficha limpa" numa resposta que não fala deste CPF.
    const { deps } = depsComRespostas({
      CEIS: {
        ok: true,
        registros: [{ id: 9, pessoa: { cpfFormatado: "111.222.333-96", nome: "Outra Pessoa" } }],
      },
    })

    const coleta = await coletarSancoesDoCandidato(CPF, "Fulano De Tal Completo", deps)

    assert.equal(coleta.sancoes.length, 0)
    assert.equal(coleta.porCadastro[0].resultado, "indeterminado")
    assert.match(coleta.porCadastro[0].detalhe ?? "", /nenhum casou com o CPF consultado/)
    assert.match(coleta.porCadastro[0].detalhe ?? "", /filtro ignorado/)
    // Os cadastros que responderam vazio de verdade continuam vazio_confirmado.
    assert.equal(coleta.porCadastro[1].resultado, "vazio_confirmado")
    assert.equal(coleta.porCadastro[2].resultado, "vazio_confirmado")
  })

  it("sem CPF válido não consulta cadastro nenhum", async () => {
    const { deps, chamadas } = depsComRespostas({})
    const coleta = await coletarSancoesDoCandidato("123", "Nome Qualquer Completo", deps)

    assert.equal(coleta.consultou, false)
    assert.equal(chamadas.length, 0)
    assert.deepEqual(coleta.porCadastro, [])
  })

  it("o plano descreve a escrita sem escrever, e não gera bloqueio", () => {
    ativarDryRun()

    // Mesma chamada que `upsertSancao` faz no ramo de dry-run.
    planejarEscrita({
      fonte: "transparencia-sanctions",
      tabela: "sancoes_administrativas",
      operacao: "upsert",
      alvo: "fulano-de-tal",
      identidade: "cpf:conferido(exato)",
      chave: { candidato_id: "id-1", tipo: "CEIS", numero_processo: null },
      valores: { tipo: "CEIS", ativo: true },
    })

    const relatorio = relatorioDryRun()
    assert.deepEqual(relatorio.universo, ["fulano-de-tal"])
    assert.equal(relatorio.totalDeLinhasPlanejadas, 1)
    assert.deepEqual(relatorio.porTabela.sancoes_administrativas, {
      insert: 0,
      update: 0,
      upsert: 1,
      delete: 0,
    })
    assert.deepEqual(relatorio.bloqueios, [])
  })
})

describe("dry-run: entrypoint real, zero requisição de escrita", () => {
  /**
   * A prova mais forte do arquivo: roda `ingestTransparenciaSanctions()` DE
   * VERDADE (o mesmo entrypoint do modo de aplicação, não uma função de
   * unidade) contra um PostgREST falso local que anota o MÉTODO HTTP de cada
   * requisição recebida. Zero escrita deixa de ser inferência sobre o proxy e
   * vira observação na borda da rede: nenhum POST, PATCH, PUT ou DELETE chega.
   *
   * O caminho exercitado é o de credencial do Portal ausente, que é justamente
   * o que ANTES escrevia: `registrarColetas` fazia um INSERT em `coleta_log`
   * com uma linha de erro por candidato público. Em dry-run essa telemetria
   * vira relatório.
   */
  it("ingestTransparenciaSanctions() em dry-run não emite nenhuma requisição de escrita", async () => {
    ativarDryRun()

    const { createServer } = await import("node:http")
    const metodos: string[] = []

    const server = createServer((req, res) => {
      metodos.push(`${req.method} ${req.url?.split("?")[0]}`)
      res.setHeader("content-type", "application/json")
      if (req.url?.includes("candidatos_publico")) {
        // Um slug que existe no seed real, para o filtro do roster casar.
        res.end(JSON.stringify([{ slug: "cabo-daciolo" }]))
        return
      }
      res.end(JSON.stringify([]))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const porta = (server.address() as { port: number }).port

    const envOriginal = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      transparencia: process.env.TRANSPARENCIA_API_KEY,
    }
    process.env.SUPABASE_URL = `http://127.0.0.1:${porta}`
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-falsa-de-teste"
    delete process.env.TRANSPARENCIA_API_KEY

    // Sem o reset, um teste anterior pode ter cacheado um cliente contra outro
    // destino (numa máquina com `.env.local`, contra produção de verdade), e o
    // roster seria lido de lá em vez do servidor local: o assert de "viu só
    // leitura" estaria olhando para a borda errada.
    const { __resetSupabaseParaTeste } = await import("../scripts/lib/supabase")
    __resetSupabaseParaTeste()

    try {
      const { ingestTransparenciaSanctions } = await import(
        "../scripts/lib/ingest-transparencia-sanctions"
      )
      const resultados = await ingestTransparenciaSanctions()

      // O entrypoint retornou pelo caminho sem credencial, sem lançar.
      assert.deepEqual(resultados, [])

      // A borda da rede viu SOMENTE leitura.
      assert.ok(metodos.length > 0, "o roster de produção deve ter sido lido")
      const escritas = metodos.filter((m) => !m.startsWith("GET ") && !m.startsWith("HEAD "))
      assert.deepEqual(escritas, [], `métodos de escrita chegaram ao servidor: ${escritas}`)

      // E a telemetria virou relatório, não INSERT: uma linha de erro por
      // candidato público, dizendo por quê.
      const relatorio = relatorioDryRun()
      assert.equal(relatorio.resultados.length, 1)
      assert.equal(relatorio.resultados[0].alvo, "cabo-daciolo")
      assert.equal(relatorio.resultados[0].resultado, "erro")
      assert.match(relatorio.resultados[0].detalhe ?? "", /TRANSPARENCIA_API_KEY ausente/)
      assert.deepEqual(relatorio.bloqueios, [])
    } finally {
      server.close()
      __resetSupabaseParaTeste()
      if (envOriginal.url !== undefined) process.env.SUPABASE_URL = envOriginal.url
      else delete process.env.SUPABASE_URL
      if (envOriginal.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = envOriginal.key
      else delete process.env.SUPABASE_SERVICE_ROLE_KEY
      if (envOriginal.transparencia !== undefined)
        process.env.TRANSPARENCIA_API_KEY = envOriginal.transparencia
    }
  })

  /**
   * O caminho POSITIVO, que é o que de fato precisa provar zero escrita.
   *
   * O teste anterior exercitava só o retorno por credencial ausente, que nem
   * chega em normalização, conferência de documento ou persistência. Aqui o
   * entrypoint real roda com credencial, contra DOIS servidores falsos locais:
   * um Portal que devolve uma sanção legítima do CPF consultado, e um PostgREST
   * que anota o método de cada requisição. O coletor percorre o caminho
   * completo (acha, confere documento, decide gravar) e mesmo assim nenhuma
   * escrita sai: a linha vai para o plano.
   */
  it("caminho positivo: acha sanção real e AINDA ASSIM não emite escrita nenhuma", async () => {
    ativarDryRun()

    const { createServer } = await import("node:http")
    const metodosDb: string[] = []
    const rotasPortal: string[] = []

    // CPF com dígitos verificadores válidos, exclusivo deste teste.
    const CPF_FIXTURE = "52998224725"
    const SLUG = "cabo-daciolo"

    const db = createServer((req, res) => {
      metodosDb.push(`${req.method} ${req.url?.split("?")[0]}`)
      res.setHeader("content-type", "application/json")
      if (req.url?.includes("candidatos_publico")) {
        res.end(JSON.stringify([{ slug: SLUG }]))
        return
      }
      if (req.url?.includes("/candidatos")) {
        const linha = {
          id: "id-fixture-1",
          cpf: CPF_FIXTURE,
          slug: SLUG,
          nome_completo: "Fulano De Tal Completo",
        }
        // `.single()` pede objeto via Accept; fora dele, lista.
        const querObjeto = (req.headers.accept ?? "").includes("pgrst.object")
        res.end(JSON.stringify(querObjeto ? linha : [linha]))
        return
      }
      res.end(JSON.stringify([]))
    })

    const portal = createServer((req, res) => {
      const rota = req.url?.split("?")[0] ?? ""
      rotasPortal.push(`${req.method} ${rota}`)
      res.setHeader("content-type", "application/json")
      if (rota.endsWith("/ceis")) {
        res.end(
          JSON.stringify([
            {
              id: 77,
              dataInicioSancao: "10/09/2021",
              dataFimSancao: "10/09/2099",
              tipoSancao: { descricaoResumida: "Impedimento de contratar" },
              orgaoSancionador: { nome: "TJDFT" },
              pessoa: { cpfFormatado: "529.982.247-25", nome: "Fulano De Tal Completo" },
              numeroProcesso: "0001234-56.2021.8.07.0000",
            },
          ]),
        )
        return
      }
      // CNEP e CEAF respondem vazio de verdade.
      res.end(JSON.stringify([]))
    })

    await new Promise<void>((r) => db.listen(0, "127.0.0.1", r))
    await new Promise<void>((r) => portal.listen(0, "127.0.0.1", r))
    const portaDb = (db.address() as { port: number }).port
    const portaPortal = (portal.address() as { port: number }).port

    const env = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      chave: process.env.TRANSPARENCIA_API_KEY,
      base: process.env.PF_TRANSPARENCIA_API_BASE,
    }
    process.env.SUPABASE_URL = `http://127.0.0.1:${portaDb}`
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-falsa-de-teste"
    process.env.TRANSPARENCIA_API_KEY = "chave-portal-falsa"
    process.env.PF_TRANSPARENCIA_API_BASE = `http://127.0.0.1:${portaPortal}`

    const { __resetSupabaseParaTeste } = await import("../scripts/lib/supabase")
    __resetSupabaseParaTeste()

    try {
      // Import fresco: a base do Portal é lida na carga do módulo.
      const mod = await import(
        `../scripts/lib/ingest-transparencia-sanctions?positivo=${portaPortal}`
      )
      const resultados = (await mod.ingestTransparenciaSanctions()) as Array<{
        candidato: string
        coleta_resultado?: string
        rows_upserted: number
        tables_updated: string[]
      }>

      // 1. O caminho positivo foi mesmo percorrido: os três cadastros foram
      //    consultados e o coletor declarou achado.
      assert.deepEqual(rotasPortal.sort(), ["GET /ceaf", "GET /ceis", "GET /cnep"])
      assert.equal(resultados.length, 1)
      assert.equal(resultados[0].candidato, SLUG)
      assert.equal(resultados[0].coleta_resultado, "encontrado")

      // 2. E mesmo assim nenhuma escrita chegou ao banco.
      const escritas = metodosDb.filter((m) => !m.startsWith("GET ") && !m.startsWith("HEAD "))
      assert.deepEqual(escritas, [], `métodos de escrita chegaram ao PostgREST: ${escritas}`)

      // 3. A linha existe, no plano, com a identidade que a sustenta.
      const relatorio = relatorioDryRun()
      assert.deepEqual(relatorio.bloqueios, [], "nenhum caminho de escrita fora do plano")
      const planejadas = relatorio.escritas.filter(
        (e) => e.tabela === "sancoes_administrativas",
      )
      assert.equal(planejadas.length, 1)
      assert.equal(planejadas[0].alvo, SLUG)
      assert.equal(planejadas[0].operacao, "upsert")
      assert.match(planejadas[0].identidade ?? "", /cpf:conferido\(exato\)/)
      assert.equal((planejadas[0].valores as { tipo: string }).tipo, "CEIS")

      // 4. `pontos_atencao` continua sem linha: o guard de fonte recusa antes
      //    do plano, e o contrato B-E2 promete isso à Trilha C.
      assert.equal(
        relatorio.escritas.filter((e) => e.tabela === "pontos_atencao").length,
        0,
        "sanção não pode gerar ponto de atenção: guard motivoRecusaDeFonte",
      )

      // 5. Desfecho por cadastro, com o achado num e vazio confirmado nos dois
      //    que responderam vazio de verdade.
      const porFonte = Object.fromEntries(
        relatorio.resultados.map((r) => [r.fonte, r.resultado]),
      )
      assert.deepEqual(porFonte, {
        "transparencia-sanctions:CEIS": "encontrado",
        "transparencia-sanctions:CNEP": "vazio_confirmado",
        "transparencia-sanctions:CEAF": "vazio_confirmado",
      })
    } finally {
      db.close()
      portal.close()
      __resetSupabaseParaTeste()
      for (const [chave, valor] of [
        ["SUPABASE_URL", env.url],
        ["SUPABASE_SERVICE_ROLE_KEY", env.key],
        ["TRANSPARENCIA_API_KEY", env.chave],
        ["PF_TRANSPARENCIA_API_BASE", env.base],
      ] as const) {
        if (valor !== undefined) process.env[chave] = valor
        else delete process.env[chave]
      }
    }
  })

  it("ensureSupabaseClient() devolve o cliente blindado, não o cru", async () => {
    ativarDryRun()

    const envOriginal = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
    process.env.SUPABASE_URL = "http://127.0.0.1:1"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-falsa-de-teste"

    try {
      const { ensureSupabaseClient } = await import("../scripts/lib/supabase")
      const cliente = ensureSupabaseClient()

      // Este era o escape: a versão anterior devolvia getClient() direto, e
      // `ensureSupabaseClient().from(t).insert(...)` escrevia com o modo ativo.
      const builder = cliente.from("candidatos") as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >
      assert.throws(() => builder.insert({ slug: "x" }), EscritaBloqueadaError)
      assert.throws(
        () => (cliente as unknown as Record<string, (...a: unknown[]) => unknown>).rpc("f", {}),
        EscritaBloqueadaError,
      )
    } finally {
      if (envOriginal.url !== undefined) process.env.SUPABASE_URL = envOriginal.url
      else delete process.env.SUPABASE_URL
      if (envOriginal.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = envOriginal.key
      else delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })
})

describe("dry-run: telemetria e escrita auditada", () => {
  it("registrarColetas vira linha de relatório, não insert", async () => {
    ativarDryRun()

    await registrarColetas([
      {
        fonte: "transparencia-sanctions",
        alvo: "fulano-de-tal",
        resultado: "vazio_confirmado",
        detalhe: "CEIS, CNEP, CEAF responderam sem registro",
      },
    ])

    const relatorio = relatorioDryRun()
    assert.deepEqual(relatorio.bloqueios, [])
    assert.equal(relatorio.resultados.length, 1)
    assert.equal(relatorio.resultados[0].resultado, "vazio_confirmado")
    assert.deepEqual(relatorio.porResultado, {
      "transparencia-sanctions:vazio_confirmado": 1,
    })
  })

  it("escreverAuditado recusa em dry-run, sem tentar a escrita nem a trilha", async () => {
    ativarDryRun()

    let aplicarFoiChamado = false
    await assert.rejects(
      escreverAuditado(
        {
          script: "teste-de-recusa",
          tabela: "candidatos",
          motivo: "prova de que a recusa vem antes de qualquer requisição",
        },
        () => {
          aplicarFoiChamado = true
          return Promise.resolve({ data: [], error: null })
        },
      ),
      new RegExp(`${ENV_DRY_RUN}=1`),
    )

    assert.equal(aplicarFoiChamado, false)
    // A recusa é anterior à blindagem, então nem bloqueio de `coleta_log` sai.
    assert.deepEqual(relatorioDryRun().bloqueios, [])
  })
})
