import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  mesmosBens,
  partitionarAcoesPorRiscoDeIdentidade,
  planejarFinancas2026,
  semReceitaReal,
  travasDoPlano,
  type EstadoProducao,
  type PlannedRow,
} from "../scripts/lib/tse-2026-financas-plano"
import { decidirPortao, lerArgs, linhasDeReciboAplicaveis, linhasDeReciboDeFalha, planoPublico } from "../scripts/tse-2026-financas"

const PACOTE = { url_receitas: "https://tse/receitas.zip", url_bens: "https://tse/bens.zip" }
const vazio = (): EstadoProducao => ({ financiamento: [], verificacoes: [], patrimonio: [], ausencias: [] })

describe("partição de ações por risco de identidade", () => {
  it("move ações de perfis em risco para revisão e mantém apenas ações seguras", () => {
    const plano = {
      acoes: [
        { tipo: "inserir_financiamento" as const, slug: "risco", linha: {} },
        { tipo: "inserir_patrimonio" as const, slug: "seguro", linha: {} },
        { tipo: "apagar_verificacao" as const, slug: "risco", id: "v1", antes: {} as never },
      ],
      recibos: [],
      revisao: [],
      resumo: {
        fichas_publicas: 2,
        financiamento: {
          fichas_com_linha_apos_plano: 1, inserir: 1, atualizar: 0, inalterado: 0,
          preservado_curadoria: 0, verificacoes_vencidas_apagadas: 1, fichas_vazio_confirmado: 0,
          fichas_erro: 0, aguardando_backfill_categorias: 0,
        },
        patrimonio: {
          fichas_com_linha_apos_plano: 0, inserir: 0, inalterado: 0, divergente_revisao: 0,
          ausencias_desmentidas_apagadas: 0, fichas_vazio_confirmado: 0, fichas_erro: 0,
        },
        recibos: { financiamento: 0, patrimonio: 0 },
      },
      resumo_por_perfil: {
        risco: { financiamento: { fichas_com_linha_apos_plano: 1, inserir: 1, verificacoes_vencidas_apagadas: 1 }, patrimonio: {} },
        seguro: { financiamento: {}, patrimonio: {} },
      },
    }

    const resultado = partitionarAcoesPorRiscoDeIdentidade(plano, ["risco"])

    assert.equal(resultado.deferred, 2)
    assert.deepEqual(resultado.plano.acoes.map((acao) => acao.slug), ["seguro"])
    assert.deepEqual(resultado.plano.revisao.map(({ slug, familia, motivo }) => ({ slug, familia, motivo })), [
      { slug: "risco", familia: "financiamento", motivo: "identidade_em_revisao" },
      { slug: "risco", familia: "financiamento", motivo: "identidade_em_revisao" },
    ])
    assert.equal(plano.acoes.length, 3, "helper preserva o plano original")
    assert.equal(resultado.plano.resumo.financiamento.inserir, 0)
    assert.equal(resultado.plano.resumo.financiamento.fichas_com_linha_apos_plano, 0)
    assert.throws(() => partitionarAcoesPorRiscoDeIdentidade({ ...plano, resumo_por_perfil: {} }, ["risco"]),
      (error: unknown) => error instanceof Error && error.message === "plano sem resumo do perfil em risco: risco")
  })

})

function fin(slug: string, id: string, extra: Record<string, unknown> = {}): PlannedRow {
  return {
    table: "financiamento",
    slug,
    row: {
      candidato_id: id,
      ano_eleicao: 2026,
      sq_candidato: `sq-${slug}`,
      uf_candidatura: "SP",
      total_arrecadado: 1000,
      total_fundo_partidario: 0,
      total_fundo_eleitoral: 1000,
      total_pessoa_fisica: 0,
      total_recursos_proprios: 0,
      categorias_origem: { fundo_eleitoral: 1000, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 },
      maiores_doadores: [{ nome: "PARTIDO X", valor: 1000, tipo: "fundo_eleitoral" }],
      fonte: "TSE",
      doadores_completos: [],
      receitas: 3,
      ...extra,
    },
  }
}

function planoComPerfilEmRisco() {
  const plano = planejarFinancas2026({
    publicos: [{ id: "c1", slug: "risco" }, { id: "c2", slug: "seguro" }],
    planejadas: [fin("risco", "c1"), fin("seguro", "c2")],
    estado: vazio(),
    pacote: PACOTE,
  })
  return partitionarAcoesPorRiscoDeIdentidade(plano, ["risco"]).plano
}

describe("partição de recibos por risco de identidade", () => {
  it("marca recibo financeiro arriscado como indeterminado", () => {
    const recibo = planoComPerfilEmRisco().recibos.find((item) => item.alvo === "risco" && item.fonte === "tse-financiamento")
    assert.equal(recibo?.resultado, "indeterminado")
  })

  it("não grava recibo de perfil em risco e preserva o recibo seguro", () => {
    const original = planejarFinancas2026({ publicos: [{ id: "c1", slug: "risk" }, { id: "c2", slug: "safe" }],
      planejadas: [fin("risk", "c1"), fin("safe", "c2")], estado: vazio(), pacote: PACOTE })
    const partitioned = { ...partitionarAcoesPorRiscoDeIdentidade(original, ["risk"]).plano, identity_risk_slugs: ["risk"] }
    const written = linhasDeReciboAplicaveis(partitioned, [])
    assert.ok(written.length > 0)
    assert.ok(written.every((row) => row.alvo === "safe"))
  })

  it("mantém volume inteiro obrigatório no recibo privado em revisão", () => {
    const recibo = planoComPerfilEmRisco().recibos.find((item) => item.alvo === "risco" && item.fonte === "tse-financiamento")
    assert.equal(recibo?.volume, 0)
    assert.equal(JSON.parse(recibo?.detalhe ?? "{}").motivo, "identidade_em_revisao")
  })

  it("recalcula resumo das ações adiadas", () => {
    const plano = planoComPerfilEmRisco()
    assert.equal(plano.resumo.recibos.financiamento, 2)
    assert.equal(plano.resumo.financiamento.inserir, 1)
    assert.equal(plano.resumo.financiamento.fichas_com_linha_apos_plano, 1)
  })

  it("recalcula o agrupamento público pelo novo resultado", () => {
    const agrupado = planoPublico(planoComPerfilEmRisco()).recibos_por_resultado
    assert.equal(agrupado["tse-financiamento:indeterminado"], 1)
    assert.equal(agrupado["tse-financiamento:encontrado"], 1)
  })

  it("remove do resumo as contagens de perfil inalterado e curado em revisão", () => {
    const estado = vazio()
    estado.financiamento = [
      existente("f1", "c1", { sq_candidato: "sq-risco", fonte: "curadoria" }),
      existente("f2", "c2", {
        sq_candidato: "sq-seguro", total_arrecadado: "1000.00", total_fundo_eleitoral: 1000,
        categorias_origem: { fundo_eleitoral: 1000, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 },
        maiores_doadores: [{ nome: "PARTIDO X", valor: 1000, tipo: "fundo_eleitoral" }],
      }),
    ]
    const plano = planejarFinancas2026({
      publicos: [{ id: "c1", slug: "risco" }, { id: "c2", slug: "seguro" }],
      planejadas: [fin("risco", "c1"), fin("seguro", "c2")],
      estado,
      pacote: PACOTE,
    })

    assert.equal(plano.resumo.financiamento.preservado_curadoria, 1)
    assert.equal(plano.resumo.financiamento.inalterado, 1)
    const particionado = partitionarAcoesPorRiscoDeIdentidade(plano, ["risco"]).plano
    assert.equal(particionado.resumo.financiamento.preservado_curadoria, 0)
    assert.equal(particionado.resumo.financiamento.inalterado, 1)
  })
})

function existente(id: string, candidato: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    candidato_id: candidato,
    ano_eleicao: 2026,
    sq_candidato: `sq-${candidato === "c1" ? "a" : "b"}`,
    uf_candidatura: "SP",
    cargo_candidatura: null,
    total_arrecadado: "500.00",
    total_fundo_partidario: 0,
    total_fundo_eleitoral: 500,
    total_pessoa_fisica: 0,
    total_recursos_proprios: 0,
    categorias_origem: { fundo_eleitoral: 500, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 },
    maiores_doadores: [{ nome: "PARTIDO X", valor: 500, tipo: "fundo_eleitoral" }],
    fonte: "TSE",
    despublicado_em: null,
    ...extra,
  }
}

describe("plano de finanças TSE 2026", () => {
  it("agendado registra categorias NULL pendentes de backfill sem atualizar nem exceder 50%", () => {
    const publicos = Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
    const planejadas = publicos.map((item) => fin(item.slug, item.id))
    const estado = vazio()
    estado.financiamento = publicos.map((item) => existente(`f${item.id}`, item.id, {
      sq_candidato: `sq-${item.slug}`, total_arrecadado: 1000, total_fundo_eleitoral: 1000,
      categorias_origem: null, maiores_doadores: planejadas.find((row) => row.slug === item.slug)!.row.maiores_doadores,
    }))
    const plano = planejarFinancas2026({ publicos, planejadas, estado, pacote: PACOTE, agendado: true })
    assert.equal(plano.acoes.filter((acao) => acao.tipo === "atualizar_financiamento").length, 0)
    assert.equal(plano.resumo.financiamento.aguardando_backfill_categorias, 20)
    assert.deepEqual(travasDoPlano(plano, estado), [])
  })
  it("revisão manual não conta preenchimento exclusivo de categorias NULL no limite de 50%", () => {
    const publicos = Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
    const planejadas = publicos.map((item) => fin(item.slug, item.id))
    const estado = vazio()
    estado.financiamento = publicos.map((item) => existente(`f${item.id}`, item.id, {
      sq_candidato: `sq-${item.slug}`, total_arrecadado: 1000, total_fundo_eleitoral: 1000,
      categorias_origem: null, maiores_doadores: planejadas.find((row) => row.slug === item.slug)!.row.maiores_doadores,
    }))
    const plano = planejarFinancas2026({ publicos, planejadas, estado, pacote: PACOTE })
    assert.equal(plano.acoes.filter((acao) => acao.tipo === "atualizar_financiamento").length, 20)
    assert.deepEqual(travasDoPlano(plano, estado), [])
  })
  it("insere receita nova e apaga a ausência vencida antes do insert", () => {
    const estado = vazio()
    estado.verificacoes.push({
      id: "v1", candidato_id: "c1", ano_eleicao: 2026, sq_candidato: "sq-a", uf_candidatura: "SP",
      resultado: "ausencia_oficial", verificado_em: "2026-09-15T00:00:00Z",
    })
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado, pacote: PACOTE })
    assert.deepEqual(plano.acoes.map((a) => a.tipo), ["apagar_verificacao", "inserir_financiamento"])
    const insert = plano.acoes[1]!
    assert.ok(insert.tipo === "inserir_financiamento" && !("doadores_completos" in insert.linha) && !("receitas" in insert.linha))
    assert.equal(plano.recibos.find((r) => r.fonte === "tse-financiamento")?.resultado, "encontrado")
    assert.equal(plano.recibos.find((r) => r.fonte === "tse-financiamento")?.volume, 3)
  })

  it("linha-marcador de valor zero não vira financiamento de R$ 0 nem apaga ausência", () => {
    const estado = vazio()
    estado.verificacoes.push({
      id: "v1", candidato_id: "c1", ano_eleicao: 2026, sq_candidato: "sq-a", uf_candidatura: "SP",
      resultado: "ausencia_oficial", verificado_em: null,
    })
    const marcador = fin("a", "c1", { total_arrecadado: 0, total_fundo_eleitoral: 0, maiores_doadores: [] })
    assert.equal(semReceitaReal(marcador.row), true)
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [marcador], estado, pacote: PACOTE })
    assert.equal(plano.acoes.length, 0)
    assert.equal(plano.recibos.find((r) => r.fonte === "tse-financiamento")?.resultado, "vazio_confirmado")
  })

  it("atualiza só linha de máquina publicada e preserva curadoria", () => {
    const estado = vazio()
    estado.financiamento.push(existente("f1", "c1", { sq_candidato: "sq-a" }))
    estado.financiamento.push(existente("f2", "c2", { sq_candidato: "sq-b", despublicado_em: "2026-09-01T00:00:00Z" }))
    const plano = planejarFinancas2026({
      publicos: [{ id: "c1", slug: "a" }, { id: "c2", slug: "b" }],
      planejadas: [fin("a", "c1"), fin("b", "c2")],
      estado,
      pacote: PACOTE,
    })
    assert.deepEqual(plano.acoes.map((a) => `${a.tipo}:${a.slug}`), ["atualizar_financiamento:a"])
    const upd = plano.acoes[0]!
    assert.ok(upd.tipo === "atualizar_financiamento")
    assert.equal(upd.depois.total_arrecadado, 1000)
    assert.deepEqual(upd.depois.categorias_origem, { fundo_eleitoral: 1000, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 })
    assert.deepEqual(upd.antes.categorias_origem, { fundo_eleitoral: 500, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 })
    assert.ok(!("despublicado_em" in upd.depois), "update nunca mexe em despublicação")
    assert.equal(upd.antes.total_arrecadado, "500.00", "CAS leva o valor atual")
    assert.equal(upd.antes.total_fundo_partidario, 0)
    assert.equal(upd.antes.total_fundo_eleitoral, 500)
    assert.equal(upd.antes.total_pessoa_fisica, 0)
    assert.equal(upd.antes.total_recursos_proprios, 0)
    assert.equal(plano.resumo.financiamento.preservado_curadoria, 1)
  })

  it("linha igual à fonte não gera escrita", () => {
    const estado = vazio()
    estado.financiamento.push(existente("f1", "c1", {
      sq_candidato: "sq-a", total_arrecadado: "1000.00", total_fundo_eleitoral: "1000.00",
      categorias_origem: { fundo_eleitoral: 1000, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 },
      maiores_doadores: [{ tipo: "fundo_eleitoral", valor: 1000, nome: "PARTIDO X" }],
    }))
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado, pacote: PACOTE })
    assert.equal(plano.acoes.length, 0)
    assert.equal(plano.resumo.financiamento.inalterado, 1)
  })

  it("ficha sem identidade no pacote recebe recibo de erro, nunca vazio", () => {
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [], estado: vazio(), pacote: PACOTE })
    assert.deepEqual(plano.recibos.map((r) => r.resultado), ["erro", "erro"])
    assert.equal(plano.revisao[0]?.motivo, "sem_identidade_2026")
  })

  it("bens novos substituem ausência desmentida; bens existentes divergentes só vão para revisão", () => {
    const estado = vazio()
    estado.ausencias.push({ id: "a1", candidato_id: "c1", ano_eleicao: 2026, sq_candidato: "sq-a", verificado_em: "2026-09-14T00:00:00Z" })
    estado.patrimonio.push({
      id: "p2", candidato_id: "c2", ano_eleicao: 2026, sq_candidato: null, valor_total: "10.00",
      bens: [{ tipo: "Casa", descricao: "X", valor: 10 }], fonte: "TSE", despublicado_em: null,
    })
    const bens = (slug: string, id: string, valor: number): PlannedRow => ({
      table: "patrimonio", slug,
      row: { candidato_id: id, ano_eleicao: 2026, sq_candidato: `sq-${slug}`, valor_total: valor, bens: [{ tipo: "Casa", descricao: "X", valor }] },
    })
    const plano = planejarFinancas2026({
      publicos: [{ id: "c1", slug: "a" }, { id: "c2", slug: "b" }],
      planejadas: [bens("a", "c1", 5), bens("b", "c2", 20)],
      estado,
      pacote: PACOTE,
    })
    assert.deepEqual(plano.acoes.map((a) => `${a.tipo}:${a.slug}`), ["inserir_patrimonio:a", "apagar_ausencia_patrimonio:a"])
    assert.ok(plano.revisao.some((r) => r.slug === "b" && r.motivo === "patrimonio_divergente"))
  })

  it("compara bens como multiconjunto", () => {
    const a = [{ tipo: "A", descricao: "1", valor: 1 }, { tipo: "B", descricao: "2", valor: 2 }]
    assert.equal(mesmosBens(a, [...a].reverse()), true)
    assert.equal(mesmosBens(a, [a[0]]), false)
  })

  it("trava a execução agendada quando o total cairia demais ou o pacote regride", () => {
    const estado = vazio()
    estado.financiamento.push(existente("f1", "c1", { sq_candidato: "sq-a", total_arrecadado: "5000.00" }))
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado, pacote: PACOTE })
    const falhas = travasDoPlano(plano, estado)
    assert.ok(falhas.some((f) => f.includes("cairia")))
    const semPacote = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [], estado, pacote: PACOTE })
    assert.ok(travasDoPlano(semPacote, estado).some((f) => f.includes("regressão")))
  })
})

describe("plano de finanças TSE 2026: casos de revisão", () => {
  it("receita publicada que sumiu do pacote vira erro e revisão, sem apagar nada", () => {
    const estado = vazio()
    estado.financiamento.push(existente("f1", "c1", { sq_candidato: "sq-a" }))
    const ausente: PlannedRow = {
      table: "financiamento_verificacoes",
      slug: "a",
      row: { candidato_id: "c1", ano_eleicao: 2026, sq_candidato: "sq-a", uf_candidatura: "SP", resultado: "ausencia_oficial" },
    }
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [ausente], estado, pacote: PACOTE })
    assert.equal(plano.acoes.length, 0)
    assert.equal(plano.revisao[0]?.motivo, "receita_sumiu_do_pacote")
    assert.equal(plano.recibos.find((r) => r.fonte === "tse-financiamento")?.resultado, "erro")
    assert.ok(travasDoPlano(plano, estado).some((f) => f.includes("sumiu")))
  })

  it("receita de outra identidade não sobrescreve a linha existente", () => {
    const estado = vazio()
    estado.financiamento.push(existente("f1", "c1", { sq_candidato: "sq-outro" }))
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado, pacote: PACOTE })
    assert.equal(plano.acoes.length, 0)
    assert.equal(plano.revisao[0]?.motivo, "financiamento_outra_identidade")
  })

  it("só apaga a verificação do mesmo contexto SQ/UF do insert", () => {
    const estado = vazio()
    estado.verificacoes.push(
      { id: "v1", candidato_id: "c1", ano_eleicao: 2026, sq_candidato: "sq-a", uf_candidatura: "SP", resultado: "ausencia_oficial", verificado_em: null },
      { id: "v2", candidato_id: "c1", ano_eleicao: 2026, sq_candidato: "sq-velho", uf_candidatura: "RJ", resultado: "ausencia_oficial", verificado_em: null },
    )
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado, pacote: PACOTE })
    const apagadas = plano.acoes.filter((a) => a.tipo === "apagar_verificacao").map((a) => ("id" in a ? a.id : ""))
    assert.deepEqual(apagadas, ["v1"])
    assert.ok(plano.revisao.some((r) => r.motivo === "verificacao_outra_identidade"))
  })
})

describe("coletor TSE 2026: portão e argumentos", () => {
  it("CAS de JSON usa hashes do banco sem serializar doadores ou categorias na URL", () => {
    const src = readFileSync(new URL("../scripts/tse-2026-financas.ts", import.meta.url), "utf8")
    const migration = readFileSync(new URL("../supabase/migrations/20260927095346_financiamento_publico_categorias_origem.sql", import.meta.url), "utf8")
    assert.match(src, /\.eq\("maiores_doadores_hash", acao\.antes\.maiores_doadores_hash\)/)
    assert.match(src, /\.eq\("categorias_origem_hash", acao\.antes\.categorias_origem_hash\)/)
    assert.doesNotMatch(src, /\.eq\("(?:maiores_doadores|categorias_origem)", JSON\.stringify/)
    assert.match(migration, /GENERATED ALWAYS AS \(md5\(COALESCE\(maiores_doadores::text/)
  })
  it("lerArgs reconhece apply, agendado, out e sha", () => {
    assert.deepEqual(lerArgs(["--apply", "--agendado", "--out=x", "--expected-plan-sha=abc"]), {
      aplicar: true, agendado: true, out: "x", expectedPlanSha: "abc", backfillCategorias: false, backfillDryRun: null, reviewedPlan: null, expectedPlanFileSha: null,
      avaliarTravas: false, maxFichasAlteradas: null,
    })
    assert.deepEqual(lerArgs([]), { aplicar: false, agendado: false, out: null, expectedPlanSha: null, backfillCategorias: false, backfillDryRun: null, reviewedPlan: null, expectedPlanFileSha: null, avaliarTravas: false, maxFichasAlteradas: null })
  })

  it("agendado não exige sha, mas respeita travas e sonda de CAS", () => {
    const agendado = lerArgs(["--apply", "--agendado"])
    assert.deepEqual(decidirPortao(agendado, "s", [], []), { aplicar: true })
    assert.equal((decidirPortao(agendado, "s", ["queda"], []) as { codigo: number }).codigo, 2)
    assert.equal((decidirPortao(agendado, "s", [], ["cas"]) as { codigo: number }).codigo, 5)
  })

  it("manual exige o sha revisado e também passa pela sonda", () => {
    assert.equal((decidirPortao(lerArgs(["--apply"]), "s", [], []) as { codigo: number }).codigo, 3)
    assert.equal((decidirPortao(lerArgs(["--apply", "--expected-plan-sha=t"]), "s", [], []) as { codigo: number }).codigo, 3)
    assert.deepEqual(decidirPortao(lerArgs(["--apply", "--expected-plan-sha=s"]), "s", [], []), { aplicar: true })
    assert.equal((decidirPortao(lerArgs(["--apply", "--expected-plan-sha=s"]), "s", [], ["x"]) as { codigo: number }).codigo, 5)
    assert.equal((decidirPortao(lerArgs(["--apply", "--expected-plan-sha=s"]), "s", ["limite de proporção"], []) as { codigo: number }).codigo, 2)
  })

  it("backfill de categorias exige modo manual, SHA revisado e recibo de dry-run", () => {
    const sha = "a".repeat(64)
    assert.equal((decidirPortao(lerArgs(["--apply", "--agendado", "--backfill-categorias"]), sha, [], []) as { codigo: number }).codigo, 3)
    assert.equal((decidirPortao(lerArgs(["--apply", "--backfill-categorias", `--expected-plan-sha=${sha}`]), sha, [], []) as { codigo: number }).codigo, 3)
    assert.deepEqual(decidirPortao(lerArgs(["--apply", "--backfill-categorias", `--expected-plan-sha=${sha}`, "--backfill-dry-run=/tmp/verified.json"]), sha, [], []), { aplicar: true })
  })

  it("limita volume absoluto e proporção da coorte antes de qualquer apply", () => {
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado: vazio(), pacote: PACOTE })
    const acao = plano.acoes[0]!
    const volume = { ...plano, acoes: Array.from({ length: 501 }, () => acao) }
    assert.ok(travasDoPlano(volume, vazio()).some((falha) => falha.includes("500 ações")))
    const proporcao = { ...plano, acoes: Array.from({ length: 11 }, (_, index) => ({ ...acao, slug: `ficha-${index}` })), resumo: { ...plano.resumo, fichas_publicas: 20 } }
    assert.ok(travasDoPlano(proporcao, vazio()).some((falha) => falha.includes("50%")))
    assert.equal(travasDoPlano(proporcao, vazio(), { maxQuedaRelativa: 0.2, maxAffectedRatio: 0.95, maxActions: 1000 }).some((falha) => falha.includes("95%")), false)
  })

  it("exclui perfis com identidade em revisão do denominador de cobertura", () => {
    const publicos = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
    const planejadas = publicos.map((item) => fin(item.slug, item.id))
    const estado = vazio()
    estado.financiamento = publicos.map((item, index) => existente(`f${index}`, item.id, { sq_candidato: `sq-${item.slug}` }))
    const plano = planejarFinancas2026({ publicos, planejadas, estado, pacote: PACOTE })
    const particionado = partitionarAcoesPorRiscoDeIdentidade(plano, ["p8", "p9"]).plano
    for (const recibo of particionado.recibos.filter((item) => ["p8", "p9"].includes(item.alvo) && item.fonte === "tse-financiamento")) {
      recibo.resultado = "indeterminado"
      recibo.volume = null
      recibo.detalhe = JSON.stringify({ motivo: "identidade_em_revisao" })
    }

    assert.deepEqual(travasDoPlano(particionado, estado), [])
  })

  it("fecha a trava se risco reduzir o denominador elegível abaixo de 50%", () => {
    const publicos = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
    const planejadas = publicos.map((item) => fin(item.slug, item.id))
    const estado = vazio()
    estado.financiamento = publicos.map((item, index) => existente(`f${index}`, item.id, { sq_candidato: `sq-${item.slug}` }))
    const original = planejarFinancas2026({ publicos, planejadas, estado, pacote: PACOTE })
    const riskSlugs = publicos.slice(4).map((item) => item.slug)
    const partitioned = partitionarAcoesPorRiscoDeIdentidade(original, riskSlugs).plano
    assert.ok(travasDoPlano(partitioned, estado).some((failure) => failure.includes("abaixo de 50%")))
  })

  it("não conta receitas encontradas de perfis sem linha financeira publicada", () => {
    const publicos = Array.from({ length: 12 }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
    const planejadas = [...Array.from({ length: 7 }, (_, index) => fin(`p${index}`, `c${index}`)),
      fin("p8", "c8"), fin("p9", "c9"), fin("p10", "c10"), fin("p11", "c11")]
    const estado = vazio()
    estado.financiamento = publicos.slice(0, 10).map((item, index) => existente(`f${index}`, item.id, { sq_candidato: `sq-${item.slug}` }))
    const plano = planejarFinancas2026({ publicos, planejadas, estado, pacote: PACOTE })
    const particionado = partitionarAcoesPorRiscoDeIdentidade(plano, ["p8", "p9"]).plano

    assert.ok(travasDoPlano(particionado, estado).some((falha) => falha.includes("regressão do pacote")))
  })

  it("rodada que não aplica deixa recibo de erro nas duas fontes por ficha", () => {
    const linhas = linhasDeReciboDeFalha([{ id: "c1", slug: "a" }, { id: "c2", slug: "b" }], "pacote indisponível")
    assert.equal(linhas.length, 4)
    assert.deepEqual([...new Set(linhas.map((l) => l.fonte))].sort(), ["tse-financiamento", "tse-patrimonio"])
    assert.ok(linhas.every((l) => l.resultado === "erro" && l.volume === 0 && l.detalhe.includes("pacote indisponível")))
    assert.deepEqual(linhasDeReciboDeFalha([{ id: "c1", slug: "risk" }, { id: "c2", slug: "safe" }], "abortada", new Set(["risk"]))
      .map((row) => row.alvo), ["safe", "safe"])
  })
})

describe("coletor TSE 2026: contrato de escrita", () => {
  const src = readFileSync("scripts/tse-2026-financas.ts", "utf8")
  it("toda escrita de domínio passa por escreverAuditado com CAS", () => {
    assert.match(src, /\.eq\("maiores_doadores_hash", acao\.antes\.maiores_doadores_hash\)/)
    assert.match(src, /\.eq\("categorias_origem_hash", acao\.antes\.categorias_origem_hash\)/)
    assert.match(src, /const comSubtotais = \["total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral", "total_pessoa_fisica", "total_recursos_proprios"\]/)
    assert.match(src, /valor == null \? query\.is\(coluna, null\) : query\.eq\(coluna, valor as number\)/)
    assert.match(src, /\.eq\("candidato_id", acao\.antes\.candidato_id as string\)/)
    assert.match(src, /\.eq\("ano_eleicao", acao\.antes\.ano_eleicao as number\)/)
    assert.match(src, /\.eq\("sq_candidato", acao\.antes\.sq_candidato as string\)/)
    assert.match(src, /\.eq\("uf_candidatura", acao\.antes\.uf_candidatura as string\)/)
    assert.match(src, /qSemCategorias = \["total_arrecadado"/)
    assert.match(src, /\.is\("despublicado_em", null\)/)
    assert.match(src, /exigirChaveV2\(process\.env\.PF_DOADOR_CPF_HASH_SALT\)/)
  })
  it("apply manual exige o sha do plano revisado; ação que lança vira conflito", () => {
    assert.match(src, /opts\.expectedPlanSha !== sha/)
    assert.match(src, /conflitos\.push\(\{ slug: acao\.slug, tipo: acao\.tipo, motivo: `exceção:/)
    assert.match(src, /await gravarRecibosDeFalha\(`rodada abortou antes de aplicar/)
  })
})
