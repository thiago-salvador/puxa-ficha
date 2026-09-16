import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { MoneyTabSection } from "@/components/MoneyTabSection"
import {
  patrimonioMaisRecenteSemEscolhaArbitraria,
  patrimonioPorAnoSemAmbiguidade,
} from "@/lib/patrimonio-contexto"
import { buildPatrimonioEleicoes } from "@/lib/public-profile-dto"
import type { Patrimonio, PatrimonioAusenciaOficial } from "@/lib/types"

const rows: Patrimonio[] = [
  {
    id: "senador",
    candidato_id: "cand",
    ano_eleicao: 2010,
    ano_arquivo: 2010,
    sq_candidato: "110000000595",
    uf_candidatura: "MT",
    cargo_candidatura: "1º SUPLENTE SENADOR",
    data_eleicao: "2010-10-03",
    tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
    valor_total: 380_000,
    bens: [{ tipo: "Casa", descricao: "Residencial", valor: 380_000 }],
  },
  {
    id: "deputado",
    candidato_id: "cand",
    ano_eleicao: 2010,
    ano_arquivo: 2010,
    sq_candidato: "110000000494",
    uf_candidatura: "MT",
    cargo_candidatura: "DEPUTADO FEDERAL",
    data_eleicao: "2010-10-03",
    tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
    valor_total: 380_000,
    bens: [{ tipo: "Casa", descricao: "Outra candidatura", valor: 380_000 }],
  },
]

const ausencia: PatrimonioAusenciaOficial = {
  ano_eleicao: 2010,
  ano_arquivo: 2010,
  sq_candidato: "110000000777",
  uf_candidatura: "MT",
  cargo_candidatura: "VICE-GOVERNADOR",
  data_eleicao: "2010-10-03",
  tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
  fonte_url: "https://cdn.tse.jus.br/bem_candidato_2010.zip",
  verificado_em: "2026-09-15T22:31:02.006Z",
  detalhe: "SQ examinado sem linha de bem.",
}

test("patrimônio multi-SQ não escolhe nem soma candidaturas do mesmo ano", () => {
  assert.deepEqual(patrimonioPorAnoSemAmbiguidade(rows), [])
  assert.deepEqual(patrimonioMaisRecenteSemEscolhaArbitraria(rows), {
    ano: 2010,
    quantidade: 2,
    patrimonio: null,
  })
})

test("compositor preserva declarações e ausência coexistentes por contexto", () => {
  const [eleicao] = buildPatrimonioEleicoes(rows, [ausencia], [])
  assert.equal(eleicao.estado, "publicado")
  assert.equal(eleicao.contextos?.length, 3)
  assert.deepEqual(eleicao.contextos?.map((row) => [row.sq_candidato, row.estado]), [
    ["110000000595", "publicado"],
    ["110000000494", "publicado"],
    ["110000000777", "vazio_confirmado"],
  ])
})

test("UI identifica cargo e eleição em cada declaração e ausência", () => {
  const eleicoes = buildPatrimonioEleicoes(rows, [ausencia], [])
  const html = renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={rows}
      financiamento={[]}
      historico={[]}
      gastos={[]}
      historicoLength={0}
      suggestion={null}
      patrimonioEleicoes={eleicoes}
    />,
  )
  assert.ok(html.includes("1º SUPLENTE SENADOR · eleição ordinária de 2010"))
  assert.ok(html.includes("DEPUTADO FEDERAL · eleição ordinária de 2010"))
  assert.ok(html.includes("VICE-GOVERNADOR · eleição ordinária de 2010"))
  assert.ok(html.includes('data-pf-patrimonio-contexto="110000000777"'))
  assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="vazio_confirmado"'))
  assert.ok(html.includes("SQ examinado sem linha de bem."))
  assert.ok(html.includes('href="https://cdn.tse.jus.br/bem_candidato_2010.zip"'))
  assert.ok(!html.includes("A coleta de bens da eleição de 2010 ainda não foi realizada"))
  assert.ok(html.includes('data-pf-patrimonio-contextos-separados="2010"'))
  assert.ok(html.includes("O gráfico não combina candidaturas distintas em 2010"))
  assert.ok(html.includes("detalhados separadamente nos cartões abaixo"))
})

test("migration usa chave contextual NULLS NOT DISTINCT sem alterar RLS", () => {
  const sql = readFileSync("supabase/migrations/20260915220000_patrimonio_contexto_eleitoral.sql", "utf8")
  assert.match(sql, /uq_patrimonio_contexto_eleitoral[\s\S]*candidato_id, ano_eleicao, sq_candidato[\s\S]*NULLS NOT DISTINCT/)
  assert.match(sql, /patrimonio_ausencia_oficial_contexto_unique[\s\S]*UNIQUE NULLS NOT DISTINCT/)
  assert.doesNotMatch(sql, /DROP POLICY|CREATE POLICY|REVOKE|GRANT/)
})

test("reconciliação multi-SQ: 7 declarações e 5 ausências viram 12 contextos, e recompor não muta nada", () => {
  // O recibo de rerun da reconciliação local é prova de execução e não é
  // versionado. O contrato preservado: cada declaração e cada ausência
  // conferida ocupa um contexto próprio, nada é fundido ou descartado, e
  // recompor a mesma entrada é determinístico e não altera os insumos.
  const contexto = (ano: number, sq: string, cargo: string) => ({
    ano_eleicao: ano,
    ano_arquivo: ano,
    sq_candidato: sq,
    uf_candidatura: "MT",
    cargo_candidatura: cargo,
    data_eleicao: `${ano}-10-01`,
    tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
  })
  const declaracoes = Object.freeze([
    contexto(2018, "sq-2018-a", "GOVERNADOR"),
    contexto(2018, "sq-2018-b", "SENADOR"),
    contexto(2014, "sq-2014-a", "DEPUTADO FEDERAL"),
    contexto(2014, "sq-2014-b", "1º SUPLENTE SENADOR"),
    contexto(2010, "sq-2010-a", "DEPUTADO ESTADUAL"),
    contexto(2010, "sq-2010-b", "SENADOR"),
    contexto(2006, "sq-2006-a", "DEPUTADO FEDERAL"),
  ].map((row) => Object.freeze(row)))
  const ausencias = Object.freeze([
    { ...contexto(2018, "sq-2018-c", "VICE-GOVERNADOR"), fonte_url: "https://cdn.tse.jus.br/bem_candidato_2018.zip", verificado_em: "2026-09-15T00:00:00.000Z" },
    { ...contexto(2014, "sq-2014-c", "2º SUPLENTE SENADOR"), fonte_url: "https://cdn.tse.jus.br/bem_candidato_2014.zip", verificado_em: "2026-09-15T00:00:00.000Z" },
    { ...contexto(2010, "sq-2010-c", "VICE-GOVERNADOR"), fonte_url: "https://cdn.tse.jus.br/bem_candidato_2010.zip", verificado_em: "2026-09-15T00:00:00.000Z" },
    { ...contexto(2006, "sq-2006-b", "SENADOR"), fonte_url: "https://cdn.tse.jus.br/bem_candidato_2006.zip", verificado_em: "2026-09-15T00:00:00.000Z" },
    { ...contexto(2022, "sq-2022-a", "SENADOR"), fonte_url: "https://cdn.tse.jus.br/bem_candidato_2022.zip", verificado_em: "2026-09-15T00:00:00.000Z" },
  ].map((row) => Object.freeze(row)))
  const antes = structuredClone({ declaracoes, ausencias })

  const eleicoes = buildPatrimonioEleicoes(declaracoes, ausencias, [])
  const contextos = eleicoes.flatMap((eleicao) => eleicao.contextos ?? [])
  assert.equal(contextos.length, 12)
  assert.equal(contextos.filter((row) => row.estado === "publicado").length, 7)
  assert.equal(contextos.filter((row) => row.estado === "vazio_confirmado").length, 5)
  assert.equal(new Set(contextos.map((row) => row.sq_candidato)).size, 12)
  assert.equal(eleicoes.find((eleicao) => eleicao.ano === 2022)?.estado, "vazio_confirmado")

  assert.deepEqual(buildPatrimonioEleicoes(declaracoes, ausencias, []), eleicoes)
  assert.deepEqual({ declaracoes, ausencias }, antes)
})
