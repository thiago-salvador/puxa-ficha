import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  FONTE_RECIBO_FINANCIAMENTO,
  fichasAlteradasDoPlano,
  restringirEstadoACoorte,
  type EstadoProducao,
  type PlanoFinancas2026,
} from "../scripts/lib/tse-2026-financas-plano"
import { idsDaCoorteDasTravas, lerArgs, travasDoPortao } from "../scripts/tse-2026-financas"

// Forma do live de 29/09: coorte focada de 48 fichas, 32 alteradas, produção com 400 fichas fora da coorte.
function cenario(fichas = 48, alteradas = 32) {
  const coorte = Array.from({ length: fichas }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
  const plano = {
    acoes: coorte.slice(0, alteradas).map((ficha, index) => ({
      tipo: "atualizar_financiamento" as const, slug: ficha.slug, id: `f${index}`,
      antes: { total_arrecadado: 100 }, depois: { total_arrecadado: 110 },
    })),
    recibos: coorte.map((ficha) => ({ candidato_id: ficha.id, alvo: ficha.slug, fonte: FONTE_RECIBO_FINANCIAMENTO, resultado: "encontrado", detalhe: "{}" })),
    revisao: [],
    resumo: { fichas_publicas: fichas },
  } as unknown as PlanoFinancas2026
  const linha = (candidato_id: string) => ({ candidato_id, ano_eleicao: 2026 }) as unknown as EstadoProducao["financiamento"][number]
  const estado: EstadoProducao = {
    financiamento: [...coorte.map((ficha) => linha(ficha.id)), ...Array.from({ length: 400 }, (_, index) => linha(`fora${index}`))],
    verificacoes: [], patrimonio: [], ausencias: [],
  }
  return { plano, estado, ids: new Set(coorte.map((ficha) => ficha.id)) }
}

const revisado = (...extra: string[]) => lerArgs(["--apply", "--reviewed-plan=/fora/plano.json", ...extra])

describe("travas do writer em coorte focada", () => {
  it("sem coorte fixada, reproduz as duas falhas do live de 29/09", () => {
    const { plano, estado } = cenario()
    const falhas = travasDoPortao(revisado(), plano, estado, null, true)
    assert.ok(falhas.some((falha) => falha.includes("32/48") && falha.includes("50%")))
    assert.ok(falhas.some((falha) => falha.includes("regressão")))
  })

  it("com a coorte fixada, a cobertura mede a coorte e só o limite relativo reprova", () => {
    const { plano, estado, ids } = cenario()
    assert.deepEqual(travasDoPortao(revisado(), plano, estado, ids, true), ["plano altera 32/48 fichas, acima do limite de 50%"])
  })

  it("teto revisado igual às fichas alteradas libera; qualquer diferença reprova", () => {
    const { plano, estado, ids } = cenario()
    assert.equal(fichasAlteradasDoPlano(plano), 32)
    assert.deepEqual(travasDoPortao(revisado("--max-fichas-alteradas=32"), plano, estado, ids, true), [])
    assert.ok(travasDoPortao(revisado("--max-fichas-alteradas=31"), plano, estado, ids, true).some((falha) => falha.includes("diferente do teto revisado de 31")))
    assert.ok(travasDoPortao(revisado("--max-fichas-alteradas=33"), plano, estado, ids, true).some((falha) => falha.includes("diferente do teto revisado de 33")))
  })

  it("teto não vale sem coorte fixada, sem plano revisado, no agendado ou acima de 100 fichas", () => {
    const { plano, estado, ids } = cenario()
    assert.ok(travasDoPortao(revisado("--max-fichas-alteradas=32"), plano, estado, null, true).some((falha) => falha.includes("exige coorte fixada")))
    assert.ok(travasDoPortao(lerArgs(["--apply", "--max-fichas-alteradas=32"]), plano, estado, ids, true).some((falha) => falha.includes("exige plano revisado")))
    assert.ok(travasDoPortao(revisado("--agendado", "--max-fichas-alteradas=32"), plano, estado, ids, true).some((falha) => falha.includes("não vale no agendado")))
    const grande = cenario(101, 60)
    assert.ok(travasDoPortao(revisado("--max-fichas-alteradas=60"), grande.plano, grande.estado, grande.ids, true).some((falha) => falha.includes("acima do teto de 100")))
  })

  it("as outras travas seguem valendo com o teto", () => {
    const { plano, estado, ids } = cenario()
    const queda = { ...plano, acoes: plano.acoes.map((acao, index) => index === 0 ? { ...acao, depois: { total_arrecadado: 50 } } : acao) } as PlanoFinancas2026
    assert.ok(travasDoPortao(revisado("--max-fichas-alteradas=32"), queda, estado, ids, true).some((falha) => falha.includes("cairia")))
    const semRecibo = { ...plano, recibos: plano.recibos.slice(0, 40) } as PlanoFinancas2026
    assert.ok(travasDoPortao(revisado("--max-fichas-alteradas=32"), semRecibo, estado, ids, true).some((falha) => falha.includes("regressão")))
  })

  it("recorte do estado mantém só as linhas da coorte", () => {
    const { estado, ids } = cenario()
    assert.equal(restringirEstadoACoorte(estado, ids).financiamento.length, 48)
    assert.equal(estado.financiamento.length, 448, "recorte não altera o estado original")
  })

  it("rejeita teto que não é inteiro não negativo", () => {
    assert.throws(() => lerArgs(["--max-fichas-alteradas=abc"]), /inteiro não negativo/)
    assert.throws(() => lerArgs(["--max-fichas-alteradas=-2"]), /inteiro não negativo/)
    assert.equal(lerArgs(["--avaliar-travas"]).avaliarTravas, true)
  })

  it("live e avaliação do dry-run usam a mesma função de portão; a avaliação não escreve", () => {
    const source = readFileSync(new URL("../scripts/tse-2026-financas.ts", import.meta.url), "utf8")
    assert.equal(source.match(/travasDoPortao\(opts, plano, estado, idsDaCoorteFixada\(publicos\)/g)?.length, 2)
    const avaliar = source.slice(source.indexOf("async function avaliarTravas("), source.indexOf("export async function main("))
    assert.ok(avaliar.length > 0)
    assert.doesNotMatch(avaliar, /aplicarAcao|gravarRecibos|consumeReviewedPlan|supabase\.from/)
  })

  it("live revisado com portão reprovado não grava recibo de erro; o agendado segue gravando", () => {
    const source = readFileSync(new URL("../scripts/tse-2026-financas.ts", import.meta.url), "utf8")
    const reprovado = source.slice(source.indexOf("if (!portao.aplicar) {"), source.indexOf("const conflitos: Conflito[] = []"))
    const revisado = reprovado.indexOf("if (opts.reviewedPlan) {")
    const retornoRevisado = reprovado.indexOf("return portao.codigo", revisado)
    const falha = reprovado.indexOf("await gravarRecibosDeFalha(")
    assert.ok(revisado >= 0 && retornoRevisado > revisado && falha > retornoRevisado, "o ramo revisado retorna antes de gravar recibos de falha")
    assert.match(reprovado.slice(revisado, retornoRevisado), /portao-reprovado\.json/)
    assert.doesNotMatch(reprovado.slice(revisado, retornoRevisado), /gravarRecibosDeFalha/)
  })
})

describe("travas do agendado com o corte do turno ativo", () => {
  // Forma do agendado de 07/10: coorte de 16 fichas, 11 com receita no pacote e na produção, centenas encerradas publicadas.
  function cenarioCorte() {
    const coorte = Array.from({ length: 16 }, (_, index) => ({ id: `c${index}`, slug: `p${index}` }))
    const comReceita = coorte.slice(0, 11)
    const plano = {
      acoes: comReceita.map((ficha, index) => ({
        tipo: "atualizar_financiamento" as const, slug: ficha.slug, id: `f${index}`,
        antes: { total_arrecadado: 100 }, depois: { total_arrecadado: 110 },
      })),
      recibos: coorte.map((ficha, index) => ({ candidato_id: ficha.id, alvo: ficha.slug, fonte: FONTE_RECIBO_FINANCIAMENTO, resultado: index < 11 ? "encontrado" : "vazio", detalhe: "{}" })),
      revisao: [],
      resumo: { fichas_publicas: coorte.length },
    } as unknown as PlanoFinancas2026
    const linha = (candidato_id: string) => ({ candidato_id, ano_eleicao: 2026 }) as unknown as EstadoProducao["financiamento"][number]
    const estado: EstadoProducao = {
      financiamento: [...comReceita.map((ficha) => linha(ficha.id)), ...Array.from({ length: 460 }, (_, index) => linha(`encerrada${index}`))],
      verificacoes: [], patrimonio: [], ausencias: [],
    }
    return { plano, estado, coorte }
  }
  const agendado = () => lerArgs(["--apply", "--agendado"])

  it("sem o corte, reproduz a falha de 07/10; com o corte, a cobertura mede só a coorte", () => {
    const { plano, estado, coorte } = cenarioCorte()
    const semCorte = idsDaCoorteDasTravas(coorte, { coortePrivada: false, recortadaPeloTurno: false })
    assert.equal(semCorte, null)
    assert.ok(travasDoPortao(agendado(), plano, estado, semCorte, true).some((falha) => falha.includes("regressão")))
    const comCorte = idsDaCoorteDasTravas(coorte, { coortePrivada: false, recortadaPeloTurno: true })
    assert.deepEqual(travasDoPortao(agendado(), plano, estado, comCorte, true), [])
  })

  it("com o corte, pacote que perde receita da coorte continua travando", () => {
    const { plano, estado, coorte } = cenarioCorte()
    const regrediu = { ...plano, recibos: plano.recibos.map((r) => ({ ...r, resultado: "vazio" })) } as unknown as PlanoFinancas2026
    const ids = idsDaCoorteDasTravas(coorte, { coortePrivada: false, recortadaPeloTurno: true })
    assert.ok(travasDoPortao(agendado(), regrediu, estado, ids, true).some((falha) => falha.includes("regressão")))
  })
})
