import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import candidatos from "../data/candidatos.json"
import { ProfileSourceFooter } from "../src/components/ProfileSourceFooter"
import { hasIncompletePartyTimeline } from "../src/lib/candidate-integrity"
import {
  buildCargoDisputadoProvenienceLabel,
  buildCargoDisputadoProvenienceNote,
  resolveCargoDisputadoProveniencia,
} from "../src/lib/candidatura-proveniencia"
import { toPublicCandidatoProfileDto } from "../src/lib/public-profile-dto"
import type { FichaCandidato } from "../src/lib/types"
import { validatePreloadedSqRow } from "../scripts/lib/tse-resolver"

const REPO = resolve(import.meta.dirname, "..")
const ler = (arquivo: string) => readFileSync(join(REPO, arquivo), "utf8")
const regexEscape = (valor: string) => valor.replace(/[.*+?^$()|[\]\\]/g, "\\$&")
const FONTES_ORLEANS = [
  "https://www.al.ma.leg.br/sitealema/discurso/tempo-dos-blocos-iracema-vale-3/",
  "https://orleansbrandao.com.br/",
  "https://orleansbrandao.com.br/saiba-mais/",
  "https://www.seam.ma.gov.br/noticias/orleans-brandao-participa-da-18-cavalgada-de-sao-joao-do-paraiso-e-anuncia-obras-para-o-municipio",
  "https://pm.ssp.ma.gov.br/wp-content/uploads/2026/04/Publicacao-da-promocao-dos-Oficiais-no-Diario-Oficial-no-059-de-31-de-marco-de-2026.pdf",
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
] as const

test("universo público de 194 e os cinco seeds seguem fail-closed", () => {
  const matriz194 = ler("supabase/migrations/20260811101000_destaques_estados_residuais_194.sql")
  assert.match(matriz194, /if publicas <> 194 then raise exception/)
  const porSlug = new Map(candidatos.map((c) => [c.slug, c]))
  assert.deepEqual(porSlug.get("renan-filho")?.ids.tse_sq_candidato, {
    "2018": "20000621744", "2022": "20001698127",
  })
  assert.deepEqual(porSlug.get("orleans-brandao")?.ids.tse_sq_candidato, {})
  assert.equal(porSlug.get("coronel-busnello")?.ids.tse_sq_candidato["2026"], "190002544120")
  assert.equal(porSlug.get("jeremias-cosmo")?.ids.tse_sq_candidato["2026"], "170002541258")
})

test("SQ pré-carregado exige nome civil, UF e cargo oficiais", () => {
  const candidato = { nome_completo: "Jose Renan Vasconcelos Calheiros Filho", nome_urna: "Renan Filho", estado: "AL" }
  const linha = { NM_CANDIDATO: "JOSÉ RENAN VASCONCELOS CALHEIROS FILHO", NM_URNA_CANDIDATO: "RENAN FILHO", SG_UF: "AL", DS_CARGO: "SENADOR" }
  assert.deepEqual(validatePreloadedSqRow(candidato, linha), { ok: true })
  assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, NM_CANDIDATO: "RENAN BEKEL DE MELO PACHECO", NM_URNA_CANDIDATO: "RENAN BEKEL" }), { ok: false, reason: "nome" })
  assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, SG_UF: "RR" }), { ok: false, reason: "uf" })
  assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, DS_CARGO: "" }), { ok: false, reason: "cargo" })
})

test("timeline incompleta permanece explícita sem contaminar o recurso inteiro", () => {
  assert.equal(hasIncompletePartyTimeline([{ ano: 2022, partido_novo: "PSD" } as never], "MISSAO", "MISSÃO"), true)
  const api = ler("src/lib/api.ts")
  assert.match(api, /\.from\("mudancas_partido"\)[\s\S]{0,180}\.is\("despublicado_em", null\)/)
  assert.doesNotMatch(api, /relatedErrors\.length > 0 \|\| integrityMessages\.length > 0/)
  assert.match(api, /timeline_partidaria_incompleta: timelinePartidariaIncompleta/)
})

test("Orleans público mantém proveniência editorial e fontes no DTO/API/DOM", () => {
  const ficha = {
    id: "b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601",
    nome_completo: "Carlos Orleans Braide Brandão",
    nome_urna: "Orleans Brandao",
    slug: "orleans-brandao",
    partido_atual: "Movimento Democrático Brasileiro",
    partido_sigla: "MDB",
    cargo_disputado: "Governador",
    cargo_atual: null,
    status: "pre-candidato",
    situacao_candidatura:
      "Pré-candidatura declarada publicamente; não é candidatura registrada ou deferida no TSE.",
    site_campanha: "https://orleansbrandao.com.br/",
    fonte_dados: [...FONTES_ORLEANS],
    ultima_atualizacao: "2026-08-11T18:00:00.000Z",
    redes_sociais: {},
  } as FichaCandidato

  assert.equal(resolveCargoDisputadoProveniencia(ficha), "declaracao_editorial")
  assert.equal(
    buildCargoDisputadoProvenienceLabel("declaracao_editorial"),
    "Candidatura declarada",
  )
  assert.match(
    buildCargoDisputadoProvenienceNote("declaracao_editorial"),
    /não é registro de candidatura deferido pelo TSE/i,
  )

  const dto = toPublicCandidatoProfileDto(ficha)
  assert.equal(dto.cargo_disputado_proveniencia, "declaracao_editorial")
  assert.equal(dto.cargo_atual, null)
  assert.equal(dto.site_campanha, "https://orleansbrandao.com.br/")
  assert.deepEqual(dto.fonte_dados, FONTES_ORLEANS)

  const html = renderToStaticMarkup(
    createElement(ProfileSourceFooter, {
      ficha: {
        fonte_dados: [...FONTES_ORLEANS],
        ultima_atualizacao: ficha.ultima_atualizacao,
      },
    }),
  )
  for (const fonte of FONTES_ORLEANS) assert.match(html, new RegExp(regexEscape(fonte)))
  assert.match(
    ler("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx"),
    /data-pf-hero-role-provenance=\{cargoProveniencia\}/,
  )
})

test("migration, readback e rollback preservam os controles de identidade", () => {
  const migration = ler("supabase/migrations/20260811102100_integridade_identidade_timeline_5.sql")
  const rollback = ler("supabase/rollback/20260811102100_integridade_identidade_timeline_5.rollback.sql")
  const readback = ler("supabase/readback/20260811102100_integridade_identidade_timeline_5.readback.sql")
  const readbackSchema = ler("supabase/readback/20260811102000_quarentena_identidade_timeline_schema.readback.sql")
  const evidencia = ler("QA/evidencias/2026-08-11-integridade-identidade-timeline-5/resumo.json")
  const manifesto = JSON.parse(ler("tests/fixtures/integridade-identidade-timeline-5-manifest.json")) as {
    measured_at: string
    source: string
    tables: Record<string, Array<{ id: string; candidato_id: string }>>
    hashes: Record<string, Record<string, string>>
  }
  for (const sq of ["190002544120", "170002541258", "100002543869", "20000621744", "20001698127", "210001596122"]) {
    assert.match(`${migration}\n${readback}\n${evidencia}`, new RegExp(sq))
  }
  assert.match(migration, /resultado #NULO/)
  assert.match(migration, /Carlos Orleans Braide Brandão/)
  assert.doesNotMatch(migration, /'incerto'/)
  assert.match(migration, /'pre-candidato',[\s\S]{0,240}Pré-candidatura declarada publicamente; não é candidatura registrada ou deferida no TSE\.[\s\S]{0,1800}true/)
  assert.match(migration, /'MDB',\s*NULL,'Governador','MA','pre-candidato'/)
  assert.doesNotMatch(migration, /https:\/\/seam\.ma\.gov\.br\/quem-e-quem['"]/)
  for (const fonte of FONTES_ORLEANS) assert.match(migration, new RegExp(regexEscape(fonte)))
  assert.match(migration, /identidade_timeline_quarentena_snapshot/)
  assert.match(migration, /identidade_timeline_manifesto_allowlisted/)
  assert.doesNotMatch(migration, /c\.ultima_atualizacao=e\.ultima_atualizacao/)
  assert.match(migration, /c\.created_at=e\.created_at/)
  assert.match(migration, /extensions\.digest/)
  assert.match(migration, /preimage,postimage/)
  assert.match(migration, /to_jsonb\([chmpft]\)/)
  assert.doesNotMatch(migration, /^BEGIN;|^COMMIT;/m)
  assert.doesNotMatch(rollback, /^BEGIN;|^COMMIT;/m)
  assert.match(rollback, /pg_constraint/)
  assert.match(rollback, /notification_log/)
  assert.match(rollback, /to_jsonb\(t\)=s\.preimage/)
  assert.doesNotMatch(rollback, /contexto LIKE|despublicacao_motivo LIKE|m\.ano=2026/i)
  for (const id of [
    "30f87192-dc08-473c-aa19-21c7fadfb44b",
    "24e9d2d1-9008-4dfd-916d-03a6713820ec",
    "65ed4abb-2b3e-4092-aeed-bee9bfd38fde",
  ]) assert.match(rollback, new RegExp(id))
  assert.match(readback, /v_postimage/)
  assert.match(readback, /v_publicas_fora/)
  assert.match(readback, /v_hist_manifesto<>12/)
  assert.match(readback, /v_partido_manifesto<>6/)
  assert.match(readback, /v_patrimonio_manifesto<>4/)
  assert.match(readback, /v_financiamento_manifesto<>4/)
  assert.match(readback, /v_universo_publico<>194/)
  assert.match(readback, /FROM public\.candidatos_publico/)
  assert.doesNotMatch(readback, /status IN \('pre-candidato','candidato'\)/)
  assert.doesNotMatch(readback, /c\.ultima_atualizacao=e\.ultima/)
  assert.match(readback, /c\.created_at=e\.criado/)
  assert.match(readbackSchema, /RAISE EXCEPTION/)
  assert.match(readbackSchema, /version='20260811102000'/)
  assert.match(readbackSchema, /identidade_timeline_quarentena_snapshot/)

  assert.deepEqual(
    Object.fromEntries(Object.entries(manifesto.tables).map(([tabela, rows]) => [tabela, rows.length])),
    { historico_politico: 12, mudancas_partido: 6, patrimonio: 4, financiamento: 4 },
  )
  assert.equal(manifesto.measured_at, "2026-08-12T00:56:40-03:00")
  assert.match(manifesto.source, /after migrations 20260810093000, 20260810121000 and 20260811102000/)
  for (const [tabela, rows] of Object.entries(manifesto.tables)) {
    assert.equal(Object.keys(manifesto.hashes[tabela] ?? {}).length, rows.length)
    for (const row of rows) {
      const hash = manifesto.hashes[tabela]?.[row.id]
      assert.match(hash ?? "", /^[0-9a-f]{64}$/)
      assert.match(migration, new RegExp(row.id))
      assert.match(migration, new RegExp(row.candidato_id))
      assert.match(migration, new RegExp(hash!))
    }
  }
})

test("harness PostgreSQL 17 cobre domínio real, drift, dependências e igualdade integral", () => {
  const harness = ler("scripts/audit/provar-integridade-identidade-timeline-5.sh")
  assert.match(harness, /valor_total numeric\(15,2\)/)
  for (const campo of ["total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral", "total_pessoa_fisica", "total_recursos_proprios"]) {
    assert.match(harness, new RegExp(`${campo} numeric\\(15,2\\)`))
  }
  assert.match(harness, /candidatos_status_dominio/)
  for (const status of ["pre-candidato", "candidato", "indeferido", "desistente", "removido"]) {
    assert.match(harness, new RegExp(status))
  }
  for (const campo of ["id", "slug", "nome_completo", "nome_urna", "data_nascimento", "estado", "cargo_disputado", "partido_atual", "partido_sigla", "status", "situacao_candidatura", "publicavel", "created_at"]) {
    assert.match(harness, new RegExp(`^${campo}\\|`, "m"))
  }
  assert.doesNotMatch(harness, /^ultima_atualizacao\|/m)
  assert.match(harness, /cron altera somente ultima_atualizacao/)
  assert.match(harness, /readback aceita avanço posterior de ultima_atualizacao/)
  assert.match(harness, /000000002011/)
  assert.match(harness, /on delete cascade/)
  assert.match(harness, /on delete set null/)
  assert.match(harness, /future_candidate_child/)
  assert.match(harness, /notification_log/)
  for (const tabela of ["votos_candidato", "projetos_lei", "pontos_atencao", "gastos_parlamentares", "sancoes_administrativas", "noticias_candidato", "posicoes_declaradas", "legislacao_mandato_executivo", "alert_subscriptions", "candidate_changes", "patrimonio_ausencia_oficial", "financiamento_verificacoes"]) {
    assert.match(harness, new RegExp(tabela))
  }
  assert.match(harness, /segunda linha legítima/)
  assert.match(harness, /baseline=.*md5/)
  assert.match(harness, /baseline[\s\S]*depois/)
  assert.match(harness, /universo público pós-forward/)
  assert.match(harness, /universo público pós-rollback/)
  assert.match(harness, /create view candidatos_publico with \(security_invoker=true\)/)
  assert.match(harness, /where status <> 'removido'::text and publicavel=true/)
  assert.match(harness, /readback recusa indeferido publicável que eleva a view a 195/)
  assert.match(harness, /readback recusa desistente publicável que eleva a view a 195/)
  assert.match(harness, /readback recusa cargo_atual stale/)
  assert.match(harness, /readback recusa URL oficial 404/)
  assert.match(harness, /--single-transaction/)
  assert.match(harness, /pg_dump[\s\S]*--schema-only/)
  assert.match(harness, /EXPECTED_SCHEMA_SEM_CATEGORIAS_SHA256="[0-9a-f]{64}"/)
  assert.match(harness, /EXPECTED_SCHEMA_COM_CATEGORIAS_SHA256="[0-9a-f]{64}"/)
  for (const adversarial of ["partido_novo='OUTRO'", "periodo_inicio=2099", "estado='ZZ'", "partido='OUTRO'", "manifesto linha ausente"]) {
    assert.match(harness, new RegExp(adversarial))
  }
})
