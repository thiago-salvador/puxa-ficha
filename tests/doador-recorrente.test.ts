import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  REGRA_DOADOR_RECORRENTE_VERSAO,
  materializarDoadoresRecorrentes,
  motivoExclusaoDoador,
  type CandidatoPublicoRef,
  type FinanciamentoLinhaBruta,
} from "../scripts/lib/doador-recorrente"
import { resumirMaterializacao } from "../scripts/materializar-doador-recorrente"
import { encontrarDocumentoDeDoador } from "../scripts/audit-doador-recorrente-exposure"
import { agruparDoadoresRecorrentes, descreverDoacoes, type DoadorRecorrenteViewRow } from "../src/lib/doador-recorrente-publico"

const ROOT = process.cwd()
const VERSION = "20260922120000"
const CNPJ_ITAU = "60701190000104"
const CNPJ_OAS = "14310577000104"
const HASH_PF = "b".repeat(64)
const SEM_NOMES = new Set<string>()

function pj(nome: string, cnpj: string, valor = 1000) {
  return { nome, valor, tipo: "PJ", cnpj }
}

function financiamento(
  id: string,
  candidato_id: string,
  ano_eleicao: number,
  doadores: Array<Record<string, unknown>>,
): FinanciamentoLinhaBruta {
  return {
    id,
    candidato_id,
    ano_eleicao,
    maiores_doadores: doadores,
    // Espelha sanitize_financiamento_doadores_publicos: mesma ordem, sem documento.
    maiores_doadores_publicos: doadores.map(({ nome, valor, tipo }) => ({ nome, valor, tipo })),
  }
}

function candidato(id: string, slug: string, nome: string, nascimento: string | null = null): CandidatoPublicoRef {
  return { id, slug, nome_completo: nome, data_nascimento: nascimento }
}

function materializar(financiamentos: FinanciamentoLinhaBruta[], candidatos: CandidatoPublicoRef[], nomes: string[] = []) {
  let seq = 0
  return materializarDoadoresRecorrentes({
    financiamentos,
    candidatosPublicos: candidatos,
    nomesDeCandidatos: nomes,
    canonicalSlugDe: (slug) => (slug === "fulano-2010" ? "fulano" : slug),
    novoGrupo: () => `grupo-${++seq}`,
  })
}

describe("doador recorrente: regras de exclusão", () => {
  it("PJ só até 2014 (ADI 4650); depois disso, CNPJ é partido, campanha ou vaquinha", () => {
    assert.equal(motivoExclusaoDoador(pj("BANCO ITAU S.A", CNPJ_ITAU), 2014, SEM_NOMES), null)
    assert.equal(motivoExclusaoDoador(pj("BANCO ITAU S.A", CNPJ_ITAU), 2016, SEM_NOMES), "pj_apos_proibicao")
    assert.equal(motivoExclusaoDoador(pj("Vakinha", "12345678000199"), 2018, SEM_NOMES), "pj_apos_proibicao")
    assert.equal(motivoExclusaoDoador(pj("QueroApoiar.com.br", "12345678000199"), 2022, SEM_NOMES), "pj_apos_proibicao")
  })

  it("órgão partidário, comitê e conta de campanha ficam de fora em qualquer ano", () => {
    assert.equal(motivoExclusaoDoador(pj("Direção Nacional", "12345678000199"), 2010, SEM_NOMES), "partido_ou_comite")
    assert.equal(motivoExclusaoDoador(pj("DIRECAO ESTADUAL/DISTRITAL", "12345678000199"), 2008, SEM_NOMES), "partido_ou_comite")
    assert.equal(motivoExclusaoDoador(pj("Comitê Financeiro Único", "12345678000199"), 2010, SEM_NOMES), "partido_ou_comite")
    assert.equal(
      motivoExclusaoDoador(pj("ELEIÇÃO 2014 MICHEL MIGUEL ELIAS TEMER LULIA VICE PRESIDENTE", "12345678000199"), 2014, SEM_NOMES),
      "conta_de_campanha",
    )
    assert.equal(
      motivoExclusaoDoador(pj("ELEIÇÃO 2010 - ANDRE PUCCINELLI - GOVERNADOR", "12345678000199"), 2010, SEM_NOMES),
      "conta_de_campanha",
    )
    assert.equal(
      motivoExclusaoDoador(pj("DILMA VANA ROUSSEFF", "12345678000199"), 2010, new Set(["DILMA VANA ROUSSEFF"])),
      "conta_de_campanha",
    )
  })

  it("PJ sem marcador empresarial fica de fora; empresa com marcador entra", () => {
    assert.equal(motivoExclusaoDoador(pj("CESAR HANNA HALUM", "12345678000199"), 2010, SEM_NOMES), "pj_sem_marcador_empresarial")
    for (const nome of [
      "J B S  SA",
      "U T C ENGENHARIA S/A",
      "CONSTRUTORA NORBERTO ODEBRECHT S A",
      "INTERFARMA ASSOC. IND. PESQUISA",
      "EUROFARMA LABORATORIOS",
      "MARFRIG- FRIGORIFICO COM. ALIMENTOS S/A",
      "J.G. RODRIGUES & CIA LTDA",
    ]) {
      assert.equal(motivoExclusaoDoador(pj(nome, CNPJ_OAS), 2014, SEM_NOMES), null, nome)
    }
  })

  it("sem identificador ou fora de PF/PJ não agrupa", () => {
    assert.equal(motivoExclusaoDoador({ nome: "Fulana", valor: 10, tipo: "PF" }, 2022, SEM_NOMES), "sem_identificador")
    assert.equal(motivoExclusaoDoador({ nome: "X", tipo: "PJ", cnpj: "123" }, 2010, SEM_NOMES), "sem_identificador")
    assert.equal(motivoExclusaoDoador({ nome: "Fundo", tipo: "fundo_eleitoral", cnpj: CNPJ_OAS }, 2022, SEM_NOMES), "origem_nao_doador")
    assert.equal(motivoExclusaoDoador({ nome: "Fulana", tipo: "PF", cpf_hash: HASH_PF }, 2022, SEM_NOMES), null)
  })
})

describe("doador recorrente: materialização", () => {
  const candidatos = [
    candidato("c1", "fulano", "FULANO DE TAL", "1960-01-01"),
    candidato("c1b", "fulano-2010", "FULANO DE TAL", "1960-01-01"),
    candidato("c2", "beltrana", "BELTRANA SILVA"),
    candidato("c3", "cicrano", "CICRANO SOUZA"),
  ]

  it("agrupa pelo documento, entre pessoas diferentes, e não carrega documento na saída", () => {
    const resultado = materializar(
      [
        financiamento("f1", "c1", 2014, [pj("ITAU UNIBANCO S.A", CNPJ_ITAU, 500)]),
        financiamento("f2", "c2", 2010, [pj("BANCO ITAU S.A", CNPJ_ITAU, 300), pj("CONSTRUTORA OAS LTDA", CNPJ_OAS)]),
        financiamento("f3", "c3", 2022, [{ nome: "Fulana", valor: 10, tipo: "PF", cpf_hash: HASH_PF }]),
        financiamento("f4", "c2", 2022, [{ nome: "Fulana", valor: 20, tipo: "PF", cpf_hash: HASH_PF }]),
      ],
      candidatos,
    )

    assert.equal(resultado.grupos, 2)
    assert.equal(resultado.linhas.length, 4)
    assert.ok(resultado.linhas.every((linha) => linha.regra_versao === REGRA_DOADOR_RECORRENTE_VERSAO))
    // OAS aparece só em uma pessoa: não é recorrente.
    assert.ok(!resultado.linhas.some((linha) => linha.doador_nome.includes("OAS")))
    // Nome exibido é o da coluna pública de cada prestação, não um nome unificado.
    assert.deepEqual(
      resultado.linhas.filter((l) => l.doador_tipo === "PJ").map((l) => l.doador_nome).sort(),
      ["BANCO ITAU S.A", "ITAU UNIBANCO S.A"],
    )

    const serializado = JSON.stringify(resultado)
    assert.doesNotMatch(serializado, new RegExp(`${CNPJ_ITAU}|${CNPJ_OAS}|${HASH_PF}`))
    assert.deepEqual(encontrarDocumentoDeDoador(resultado.linhas), [])
    assert.deepEqual(encontrarDocumentoDeDoador(resumirMaterializacao(resultado)), [])
  })

  it("a mesma pessoa em dois cadastros (mapa canônico ou nome e nascimento) não forma par", () => {
    const resultado = materializar(
      [
        financiamento("f1", "c1", 2014, [pj("BANCO ITAU S.A", CNPJ_ITAU)]),
        financiamento("f2", "c1b", 2010, [pj("BANCO ITAU S.A", CNPJ_ITAU)]),
      ],
      candidatos,
    )
    assert.equal(resultado.grupos, 0)
    assert.equal(resultado.linhas.length, 0)
  })

  it("candidato fora do público não entra, nem como outra ponta", () => {
    const resultado = materializar(
      [
        financiamento("f1", "c1", 2014, [pj("BANCO ITAU S.A", CNPJ_ITAU)]),
        financiamento("f9", "despublicado", 2014, [pj("BANCO ITAU S.A", CNPJ_ITAU)]),
      ],
      candidatos,
    )
    assert.equal(resultado.financiamentosFora, 1)
    assert.equal(resultado.grupos, 0)
  })

  it("sem pareamento garantido com a coluna pública, o doador fica de fora", () => {
    const linha = financiamento("f1", "c1", 2014, [pj("BANCO ITAU S.A", CNPJ_ITAU)])
    linha.maiores_doadores_publicos = []
    const resultado = materializar([linha, financiamento("f2", "c2", 2014, [pj("BANCO ITAU S.A", CNPJ_ITAU)])], candidatos)
    assert.equal(resultado.exclusoes.nome_publico_indisponivel, 1)
    assert.equal(resultado.grupos, 0)
  })
})

describe("doador recorrente: formato público", () => {
  it("uma entrada por doador e uma por pessoa, com os anos em linha e o nome mais recente", () => {
    const base = { candidato_id: "c1", doador_grupo: "g1", doador_tipo: "PJ" }
    const rows: DoadorRecorrenteViewRow[] = [
      { ...base, ano_eleicao: 2014, doador_nome: "VONPAR REFRESCOS SA", valor: "20000.00", outra_ano_eleicao: 2014, outra_valor: 20000, outra_slug: "beltrana", outra_nome_urna: "Beltrana", outra_partido_sigla: "X" },
      { ...base, ano_eleicao: 2014, doador_nome: "VONPAR REFRESCOS SA", valor: "20000.00", outra_ano_eleicao: 2010, outra_valor: 300, outra_slug: "beltrana", outra_nome_urna: "Beltrana", outra_partido_sigla: "X" },
      { ...base, ano_eleicao: 2010, doador_nome: "VONPAR REFRESCOS S.A", valor: 5000, outra_ano_eleicao: 2014, outra_valor: 20000, outra_slug: "beltrana", outra_nome_urna: "Beltrana", outra_partido_sigla: "X" },
      { ...base, ano_eleicao: 2010, doador_nome: "VONPAR REFRESCOS S.A", valor: 5000, outra_ano_eleicao: 2012, outra_valor: null, outra_slug: "cicrano", outra_nome_urna: null, outra_partido_sigla: null },
    ]
    const grupos = agruparDoadoresRecorrentes(rows)
    assert.equal(grupos.length, 1)
    assert.equal(grupos[0].doador_nome, "VONPAR REFRESCOS SA")
    assert.deepEqual(grupos[0].doacoes, [
      { ano_eleicao: 2014, valor: 20000 },
      { ano_eleicao: 2010, valor: 5000 },
    ])
    assert.deepEqual(
      grupos[0].outras_candidaturas.map((outra) => `${outra.slug}:${outra.doacoes.map((d) => d.ano_eleicao).join("/")}`),
      ["beltrana:2014/2010", "cicrano:2012"],
    )
    assert.equal(descreverDoacoes(grupos[0].doacoes, (v) => `R$ ${v}`), "2014 · R$ 20000 | 2010 · R$ 5000")
    assert.equal(descreverDoacoes([{ ano_eleicao: 2012, valor: null }], String), "2012")
  })

  it("o detector de documento pega chave e valor com forma de documento", () => {
    assert.deepEqual(
      encontrarDocumentoDeDoador({ a: { cnpj: "x" }, b: ["11.222.333/0001-99"], c: "a".repeat(64), d: "ok" }).map((a) => a.motivo),
      ["chave_de_documento", "cnpj_formatado", "hash_sha256"],
    )
    assert.deepEqual(encontrarDocumentoDeDoador({ doador_grupo: "7f1c2e9a-1b2c-4d3e-8f90-123456789012", valor: 1000 }), [])
  })
})

describe("doador recorrente: contrato da migration", () => {
  const ler = (path: string) => readFileSync(join(ROOT, path), "utf8")
  const migration = ler(`supabase/migrations/${VERSION}_financiamento_doador_recorrente.sql`)
  const rollback = ler(`supabase/rollback/${VERSION}_financiamento_doador_recorrente.rollback.sql`)
  const readback = ler(`supabase/readback/${VERSION}_financiamento_doador_recorrente.readback.sql`)

  it("tabela e view não têm coluna de documento", () => {
    const tabela = migration.match(/CREATE TABLE public\.financiamento_doador_recorrente \(([\s\S]*?)\n\);/)?.[1] ?? ""
    const view = migration.match(/CREATE VIEW public\.financiamento_doador_recorrente_publico[\s\S]*?AS\s+SELECT([\s\S]*?)\nFROM/)?.[1] ?? ""
    assert.ok(tabela.length > 0 && view.length > 0)
    for (const trecho of [tabela, view]) {
      const colunas = trecho
        .split("\n")
        .map((linha) => linha.trim().split(/\s+/).pop() ?? "")
        .join(" ")
      assert.doesNotMatch(colunas, /cnpj|cpf|hash|documento/i)
    }
  })

  it("anon lê só por grant de coluna e RLS; view com security_invoker; guard falha alto", () => {
    assert.match(migration, /WITH \(security_invoker = true\)/)
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
    assert.match(migration, /REVOKE ALL ON TABLE public\.financiamento_doador_recorrente FROM anon, authenticated/)
    assert.match(migration, /GRANT SELECT \(\s*doador_grupo[\s\S]*?\) ON TABLE public\.financiamento_doador_recorrente TO anon, authenticated/)
    assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.financiamento_doador_recorrente TO anon/)
    assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO anon/)
    assert.match(migration, /USING \(public\.is_public_candidate\(candidato_id\)\)/)
    assert.match(migration, /JOIN public\.financiamento_publico AS fa[\s\S]*JOIN public\.financiamento_publico AS fb/)
    assert.match(migration, /CHECK \(doador_tipo <> 'PJ' OR ano_eleicao < 2016\)/)
    assert.match(migration, /RAISE EXCEPTION 'doador recorrente: coluna de documento/)
  })

  it("rollback e readback cobrem a mesma superfície", () => {
    assert.match(rollback, /DROP VIEW IF EXISTS public\.financiamento_doador_recorrente_publico/)
    assert.match(rollback, /DROP TABLE IF EXISTS public\.financiamento_doador_recorrente/)
    assert.match(rollback, new RegExp(`DELETE FROM supabase_migrations\\.schema_migrations WHERE version = '${VERSION}'`))
    // O apply embute o readback na própria transação: abrir ou fechar
    // transação aqui, ou trocar de papel, desfaria ou quebraria o apply.
    // (O BEGIN sem ponto e vírgula do bloco PL/pgSQL não é transação.)
    assert.doesNotMatch(
      readback,
      /^\s*(BEGIN\s*(;|READ\b|TRANSACTION\b)|COMMIT\s*;|ROLLBACK\s*;|SET\s+(LOCAL\s+)?ROLE\b|RESET\s+ROLE\b)/im,
    )
    assert.match(readback, /security_invoker=true/)
    assert.match(readback, /relrowsecurity/)
    assert.match(readback, /has_table_privilege\('anon', 'public\.financiamento_doador_recorrente_publico', 'SELECT'\)/)
    assert.match(readback, /column_name ILIKE '%cnpj%'/)
  })
})
