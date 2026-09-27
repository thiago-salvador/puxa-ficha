import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  mesmosBens,
  planejarFinancas2026,
  semReceitaReal,
  travasDoPlano,
  type EstadoProducao,
  type PlannedRow,
} from "../scripts/lib/tse-2026-financas-plano"
import { decidirPortao, lerArgs, linhasDeReciboDeFalha } from "../scripts/tse-2026-financas"

const PACOTE = { url_receitas: "https://tse/receitas.zip", url_bens: "https://tse/bens.zip" }
const vazio = (): EstadoProducao => ({ financiamento: [], verificacoes: [], patrimonio: [], ausencias: [] })

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
  it("lerArgs reconhece apply, agendado, out e sha", () => {
    assert.deepEqual(lerArgs(["--apply", "--agendado", "--out=x", "--expected-plan-sha=abc"]), {
      aplicar: true, agendado: true, out: "x", expectedPlanSha: "abc",
    })
    assert.deepEqual(lerArgs([]), { aplicar: false, agendado: false, out: null, expectedPlanSha: null })
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

  it("limita volume absoluto e proporção da coorte antes de qualquer apply", () => {
    const plano = planejarFinancas2026({ publicos: [{ id: "c1", slug: "a" }], planejadas: [fin("a", "c1")], estado: vazio(), pacote: PACOTE })
    const acao = plano.acoes[0]!
    const volume = { ...plano, acoes: Array.from({ length: 501 }, () => acao) }
    assert.ok(travasDoPlano(volume, vazio()).some((falha) => falha.includes("500 ações")))
    const proporcao = { ...plano, acoes: Array.from({ length: 11 }, (_, index) => ({ ...acao, slug: `ficha-${index}` })), resumo: { ...plano.resumo, fichas_publicas: 20 } }
    assert.ok(travasDoPlano(proporcao, vazio()).some((falha) => falha.includes("50%")))
  })

  it("rodada que não aplica deixa recibo de erro nas duas fontes por ficha", () => {
    const linhas = linhasDeReciboDeFalha([{ id: "c1", slug: "a" }, { id: "c2", slug: "b" }], "pacote indisponível")
    assert.equal(linhas.length, 4)
    assert.deepEqual([...new Set(linhas.map((l) => l.fonte))].sort(), ["tse-financiamento", "tse-patrimonio"])
    assert.ok(linhas.every((l) => l.resultado === "erro" && l.volume === 0 && l.detalhe.includes("pacote indisponível")))
  })
})

describe("coletor TSE 2026: contrato de escrita", () => {
  const src = readFileSync("scripts/tse-2026-financas.ts", "utf8")
  it("toda escrita de domínio passa por escreverAuditado com CAS", () => {
    assert.match(src, /\.eq\("maiores_doadores", JSON\.stringify\(acao\.antes\.maiores_doadores\)\)/)
    assert.match(src, /\.eq\("categorias_origem", JSON\.stringify\(acao\.antes\.categorias_origem\)\)/)
    assert.match(src, /\.is\("categorias_origem", null\)/)
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
