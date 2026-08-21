import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  assertSemReplacementChar,
  decodeCeapsCsv,
  REPLACEMENT_CHAR,
} from "../scripts/lib/ceaps-csv-encoding"
import { toPublicCandidatoProfileDto } from "../src/lib/public-profile-dto"
import type { FichaCandidato } from "../src/lib/types"

const ROOT = process.cwd()
const MIGRATION = "20260821214601_ceaps_categoria_utf8.sql"
const LABEL_DIVULGACAO = "Divulgação da atividade parlamentar"
const LABEL_CONTRATACAO =
  "Contratação de consultorias, assessorias, pesquisas, trabalhos técnicos e outros serviços de apoio ao exercício do mandato parlamentar"
const LABEL_LOCOMOCAO = "Locomoção, hospedagem, alimentação, combustíveis e lubrificantes"

function categoriasPublicas(dto: ReturnType<typeof toPublicCandidatoProfileDto>): string[] {
  return (dto.gastos_parlamentares ?? []).flatMap((row) => [
    ...(row.detalhamento ?? []).map((item) => item.categoria ?? ""),
    ...(row.gastos_destaque ?? []).map((item) => item.categoria ?? ""),
  ])
}

function assertCategoriasPublicasSemReplacement(
  dto: ReturnType<typeof toPublicCandidatoProfileDto>,
): void {
  const quebradas = categoriasPublicas(dto).filter((categoria) =>
    categoria.includes(REPLACEMENT_CHAR),
  )
  if (quebradas.length === 0) return
  throw new Error(
    `gastos_parlamentares categoria com U+FFFD: ${quebradas.join(" | ")}`,
  )
}

function fixtureComCategorias(detalhe: string, destaque: string): FichaCandidato {
  return {
    id: "cand-1",
    nome_completo: "Alan Rick",
    nome_urna: "Alan Rick",
    slug: "alan-rick",
    data_nascimento: null,
    idade: null,
    naturalidade: null,
    formacao: null,
    formacao_instituicao: null,
    profissao_declarada: null,
    genero: null,
    estado_civil: null,
    cor_raca: null,
    partido_atual: "UNIÃO",
    partido_sigla: "UNIÃO",
    cargo_atual: "Senador",
    cargo_disputado: "Senador",
    estado: "AC",
    status: "candidato",
    situacao_candidatura: null,
    biografia: null,
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: ["Senado"],
    ultima_atualizacao: "2026-08-21T00:00:00.000Z",
    historico: [],
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    processos: [],
    pontos_atencao: [],
    projetos_lei: [],
    legislacao_mandato_executivo: [],
    gastos_parlamentares: [
      {
        id: "gasto-1",
        candidato_id: "cand-1",
        ano: 2024,
        total_gasto: 10,
        fonte: "Senado",
        detalhamento: [{ categoria: detalhe, valor: 10 }],
        gastos_destaque: [{ descricao: "Gasto", valor: 10, categoria: destaque }],
      },
    ],
    gastos_executivo: [],
    sancoes_administrativas: [],
    noticias: [],
    indicadores_estaduais: [],
    total_processos: 0,
    processos_criminais: 0,
    total_mudancas_partido: 0,
    total_pontos_atencao: 0,
    pontos_criticos: 0,
    total_sancoes: 0,
    historico_descartado: 0,
    historico_em_revisao: false,
    timeline_partidaria_incompleta: false,
    section_freshness: {},
  }
}

describe("CEAPS categoria UTF-8", () => {
  it("latin1 de Divulgação lido como utf8 produz U+FFFD", () => {
    const bytes = Buffer.from(LABEL_DIVULGACAO, "latin1")
    const asUtf8 = bytes.toString("utf8")
    assert.ok(asUtf8.includes(REPLACEMENT_CHAR), asUtf8)
    assert.notEqual(asUtf8, LABEL_DIVULGACAO)
  })

  it("decodeCeapsCsv recupera o rótulo acentuado do CSV Latin-1", () => {
    const bytes = Buffer.from(LABEL_DIVULGACAO, "latin1")
    assert.equal(decodeCeapsCsv(bytes), LABEL_DIVULGACAO)
  })

  it("assertSemReplacementChar recusa gravar string com U+FFFD", () => {
    assert.throws(
      () => assertSemReplacementChar(`Divulga${REPLACEMENT_CHAR}o da atividade parlamentar`, "ceaps-teste"),
      /U\+FFFD/,
    )
  })

  it("detector do DTO publico recusa categoria com U+FFFD", () => {
    const dto = toPublicCandidatoProfileDto(
      fixtureComCategorias(
        `Divulga${REPLACEMENT_CHAR}o da atividade parlamentar`,
        `Contrata${REPLACEMENT_CHAR}o de consultorias`,
      ),
    )
    assert.throws(() => assertCategoriasPublicasSemReplacement(dto), /U\+FFFD/)
  })

  it("DTO publico com Divulgação, Contratação e Locomoção passa o invariante", () => {
    const dto = toPublicCandidatoProfileDto(
      fixtureComCategorias(LABEL_DIVULGACAO, LABEL_CONTRATACAO),
    )
    dto.gastos_parlamentares[0].gastos_destaque.push({
      descricao: "Deslocamento",
      valor: 1,
      categoria: LABEL_LOCOMOCAO,
    })
    assertCategoriasPublicasSemReplacement(dto)
    const joined = categoriasPublicas(dto).join(" | ")
    assert.match(joined, /Divulgação/)
    assert.match(joined, /Contratação/)
    assert.match(joined, /Locomoção/)
  })

  it("migration restaura alan-rick e mailza-assis com rótulos acentuados", () => {
    const sql = readFileSync(join(ROOT, "supabase/migrations", MIGRATION), "utf8")
    assert.match(sql, /alan-rick/)
    assert.match(sql, /mailza-assis/)
    assert.match(sql, /Divulgação/)
    assert.match(sql, /Contratação/)
    assert.match(sql, /Locomoção/)
    assert.ok(sql.includes(REPLACEMENT_CHAR), "U+FFFD precisa existir no FROM do replace")
    const semReplace = sql
      .replaceAll(`$ceaps$`, "")
      .split("\n")
      .filter((line) => !line.includes("replace(") && !line.includes("U&'\\FFFD'"))
      .join("\n")
    assert.equal(
      semReplace.includes(REPLACEMENT_CHAR),
      false,
      "U+FFFD fora do replace source",
    )
  })
})
