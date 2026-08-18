import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const renato = readFileSync(
  "supabase/migrations/20260805134000_renato_gomes_homonimo_remocao.sql",
  "utf8",
)
const sweep = readFileSync(
  "supabase/migrations/20260805135000_varredura_homonimos_cadu_juliana.sql",
  "utf8",
)
const prefixNormalization = readFileSync(
  "supabase/migrations/20260805133000_cargo_canonico_sem_prefixo_de_candidatura.sql",
  "utf8",
)
const renatoFormation = readFileSync(
  "supabase/migrations/20260805136000_renato_gomes_formacao_homonimo.sql",
  "utf8",
)
const renatoAuditCorrection = readFileSync(
  "supabase/migrations/20260805137000_renato_gomes_corrige_log_identidade.sql",
  "utf8",
)

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `início não encontrado: ${start}`)
  assert.notEqual(endIndex, -1, `fim não encontrado: ${end}`)
  return source.slice(startIndex, endIndex)
}

describe("correções de identidade por homônimo", () => {
  it("remove as cinco linhas filhas e zera os campos civis de renato-gomes", () => {
    assert.match(renato, /DELETE FROM public\.patrimonio/)
    assert.match(renato, /DELETE FROM public\.financiamento/)
    assert.match(renato, /DELETE FROM public\.historico_politico/)
    assert.match(renato, /nome_completo = nome_urna/)
    assert.match(renato, /naturalidade = NULL/)
    assert.match(renato, /profissao_declarada = NULL/)
    assert.match(renato, /ainda existe linha filha ligada a ficha/)
  })

  it("limpa a identidade e o dinheiro do homônimo de cadu-xavier", () => {
    assert.match(sweep, /slug = 'cadu-xavier'/)
    assert.match(sweep, /SQ 200000998862/)
    assert.match(sweep, /cpf = NULL/)
    assert.match(sweep, /data_nascimento = NULL/)
    assert.match(sweep, /profissao_declarada = NULL/)
    assert.match(sweep, /Vazios confirmados anteriores invalidos/)
  })

  it("despublica só a vereadora homônima e preserva a prefeita Juliana Brizola", () => {
    assert.match(sweep, /SQ 210001233500/)
    assert.match(sweep, /SQ 210001189949/)
    assert.match(sweep, /cargo_canonico = 'Vereador'/)
    assert.match(sweep, /cargo_canonico = 'Prefeito'/)
    assert.match(sweep, /juliana_homonima: estado pos-correcao inesperado/)
  })

  it("não grava documentos pessoais literais nas migrations", () => {
    assert.doesNotMatch(`${renato}\n${sweep}`, /\b\d{11}\b/)
  })

  it("a conferência de duplicatas não conta homônimos despublicados antes", () => {
    assert.match(
      prefixNormalization,
      /despublicacao_motivo LIKE 'Duplicata da mesma candidatura%'/,
    )
  })

  it("restringe as duplicatas de cargo aos dois casos confirmados", () => {
    const update = between(
      prefixNormalization,
      "UPDATE public.historico_politico h",
      "-- Normalização.",
    )
    const slugs = [...update.matchAll(/c\.slug = '([^']+)'/g)].map((match) => match[1])

    assert.deepEqual(slugs, ["henrique-areas", "indira-xavier"])
    assert.match(update, /c\.slug = 'henrique-areas' AND h\.periodo_inicio = 2016 AND h\.partido = 'PCO'/)
    assert.match(update, /c\.slug = 'indira-xavier' AND h\.periodo_inicio = 2022 AND h\.partido = 'UP'/)
    assert.match(update, /AND h\.tipo_evento = 'candidatura'/)
    assert.match(update, /gemea\.partido = h\.partido/)
    assert.match(update, /gemea\.tipo_evento = h\.tipo_evento/)
  })

  it("remove o resíduo de formação do mesmo SQ de Renato", () => {
    const precondition = between(renatoFormation, "IF NOT EXISTS (", "END $$;")
    const update = between(renatoFormation, "UPDATE public.candidatos", "-- @write tabela=coleta_log")

    assert.match(
      precondition,
      /WHERE slug = 'renato-gomes'\s+AND formacao = 'Ensino médio completo'\s+AND cpf IS NULL\s+AND data_nascimento IS NULL\s+AND profissao_declarada IS NULL/,
    )
    assert.match(
      update,
      /SET formacao = NULL,\s+ultima_atualizacao = now\(\)\s+WHERE slug = 'renato-gomes'\s+AND formacao = 'Ensino médio completo'/,
    )
    assert.equal((renatoFormation.match(/120000886590/g) ?? []).length, 2)
    assert.match(renatoFormation, /nenhuma formacao foi inferida/)
  })

  it("corrige no banco o texto de auditoria de Renato", () => {
    assert.match(renato, /Nome completo voltou ao nome_urna/)
    assert.match(renatoAuditCorrection, /Nome completo voltou ao nome_urna/)
    assert.match(
      renatoAuditCorrection,
      /WHERE alvo = 'renato-gomes'\s+AND fonte = 'tse-identidade'\s+AND execucao = 'manual:homonimos-sistematico-20260805';\s+\s*GET DIAGNOSTICS linhas = ROW_COUNT;\s+IF linhas <> 1 THEN\s+RAISE EXCEPTION 'renato_homonimo_log: esperado 1 registro, encontrado %', linhas;/,
    )
  })
})
