import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

const identidade66 = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/manifesto-identidade-judicial-66.json",
    "utf8",
  ),
)
const proposta69 = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/manifesto-processos-curadoria-69.json",
    "utf8",
  ),
)
const auditoriaUrl69 = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/auditoria-url-fonte-por-processo.json",
    "utf8",
  ),
)
const reconciliacao = JSON.parse(
  readFileSync("QA/evidencias/2026-08-10-item2-judicial/reconciliacao-universo.json", "utf8"),
)
const auditoriaPayload66 = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/auditoria-payload-66.json",
    "utf8",
  ),
)
const proposta66 = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/proposta-66-25/manifesto-processos-curadoria-66.json",
    "utf8",
  ),
)
const allowlist66 = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/proposta-66-25/allowlist-processos-curadoria-66.proposta.json",
    "utf8",
  ),
)
const migration66 = readFileSync(
  "QA/evidencias/2026-08-10-item2-judicial/proposta-66-25/20260810123000_processos_curadoria_djen_66.sql",
  "utf8",
)
const readback66 = readFileSync(
  "QA/evidencias/2026-08-10-item2-judicial/proposta-66-25/20260810123000_processos_curadoria_djen_66.readback.sql",
  "utf8",
)
const migration69Aplicavel = readFileSync(
  "supabase/migrations/20260810122000_processos_curadoria_djen.sql",
  "utf8",
)
const rollback69Aplicavel = readFileSync(
  "supabase/rollback/20260810122000_processos_curadoria_djen.rollback.sql",
  "utf8",
)
const allowlist69Aplicavel = JSON.parse(
  readFileSync("scripts/audit/allowlist-processos-curadoria-20260810.json", "utf8"),
)
const migration66Aplicavel = readFileSync(
  "supabase/migrations/20260810123000_processos_curadoria_djen_66.sql",
  "utf8",
)
const rollback66Aplicavel = readFileSync(
  "supabase/rollback/20260810123000_processos_curadoria_djen_66.rollback.sql",
  "utf8",
)
const allowlist66Aplicavel = JSON.parse(
  readFileSync("scripts/audit/allowlist-processos-curadoria-66-20260810.json", "utf8"),
)

describe("manifestos judiciais complementares", () => {
  it("fecha o lote sanitizado em 66 CNJs, 25 confirmadas e 7 indeterminadas", () => {
    const confirmadas = identidade66.fichas.filter(
      (ficha: { desfecho: string }) => ficha.desfecho === "confirmado",
    )
    const indeterminadas = identidade66.fichas.filter(
      (ficha: { desfecho: string }) => ficha.desfecho === "indeterminado",
    )
    const cnjs = new Set(
      confirmadas.flatMap((ficha: { cnj_relevantes: string[] }) => ficha.cnj_relevantes),
    )

    assert.equal(identidade66.fichas.length, 32)
    assert.equal(confirmadas.length, 25)
    assert.equal(indeterminadas.length, 7)
    assert.equal(cnjs.size, 66)
    assert.equal(identidade66.publicacao_pronta, false)
    assert.match(identidade66.proveniencia.artefato_bruto_sha256, /^[a-f0-9]{64}$/)
  })

  it("preserva fonte e identidade sem versionar CPF ou detalhes pessoais", () => {
    const serializado = JSON.stringify(identidade66)
    assert.doesNotMatch(serializado, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)

    for (const ficha of identidade66.fichas) {
      assert.match(ficha.slug, /^[a-z0-9-]+$/)
      assert.ok(Array.isArray(ficha.tipos_identificador))
      assert.match(ficha.fonte_consultada.nome, /DJEN|PJe|CNJ/i)
      assert.match(ficha.fonte_consultada.url_busca_por_nome, /^https:\/\//)
      for (const url of ficha.fonte_consultada.url_por_processo) {
        assert.match(url, /^https:\/\//)
      }
    }
  })

  it("prova que 66/25 e 69/21 são conjuntos disjuntos e complementares", () => {
    const confirmadas66 = identidade66.fichas.filter(
      (ficha: { desfecho: string }) => ficha.desfecho === "confirmado",
    )
    const slugs66 = new Set(confirmadas66.map((ficha: { slug: string }) => ficha.slug))
    const cnjs66 = new Set(
      confirmadas66.flatMap((ficha: { cnj_relevantes: string[] }) => ficha.cnj_relevantes),
    )
    const slugs69 = new Set(proposta69.linhas.map((linha: { slug: string }) => linha.slug))
    const cnjs69 = new Set(
      proposta69.linhas.map((linha: { numero_cnj: string }) => linha.numero_cnj),
    )

    assert.equal([...slugs66].filter((slug) => slugs69.has(slug)).length, 0)
    assert.equal([...cnjs66].filter((cnj) => cnjs69.has(cnj)).length, 0)
    assert.equal(new Set([...slugs66, ...slugs69]).size, 46)
    assert.equal(new Set([...cnjs66, ...cnjs69]).size, 135)
    assert.equal(reconciliacao.migration.pronta, true)
    assert.deepEqual(reconciliacao.migration.divergencias, [])
    assert.deepEqual(reconciliacao.manifestos_complementares.sobreposicao, {
      cnjs: 0,
      fichas: 0,
    })
    assert.deepEqual(reconciliacao.manifestos_complementares.uniao_potencial, {
      processos: 135,
      fichas: 46,
    })
  })

  it("mantém os lotes 69/21 e 66/25 independentes no caminho aplicável", () => {
    assert.equal(proposta69.estado, "aprovado_editorialmente_nao_aplicado")
    assert.equal(proposta69.processos, 69)
    assert.equal(proposta69.fichas, 21)
    assert.equal((migration69Aplicavel.match(/-- @write tabela=processos/g) ?? []).length, 69)
    assert.match(migration69Aplicavel, /APROVADO EDITORIALMENTE, NAO APLICADO/)
    assert.match(migration69Aplicavel, /URLs nao provam o proprio CNJ/)
    assert.match(rollback69Aplicavel, /preservar curadoria posterior/)
    assert.match(rollback69Aplicavel, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.equal(allowlist69Aplicavel.coorte.length, 21)
    assert.equal(allowlist69Aplicavel.entries.length, 21)
    assert.match(allowlist69Aplicavel._comentario, /APROVADO EDITORIALMENTE/)
    assert.equal(existsSync("supabase/migrations/20260810123000_processos_curadoria_djen_66.sql"), true)
    assert.equal((migration66Aplicavel.match(/-- @write tabela=processos/g) ?? []).length, 66)
    assert.match(migration66Aplicavel, /APROVADO EDITORIALMENTE EM 2026-08-11, NAO APLICADO/)
    assert.match(rollback66Aplicavel, /ROLLBACK CIRURGICO/)
    assert.match(rollback66Aplicavel, /preservar curadoria posterior/)
    assert.match(rollback66Aplicavel, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.equal(allowlist66Aplicavel.coorte.length, 25)
    assert.equal(allowlist66Aplicavel.entries.length, 25)
    assert.match(allowlist66Aplicavel._comentario, /APROVADO EDITORIALMENTE/)
  })

  it("amarra toda URL do Comunica PJe do lote 69 ao CNJ da propria linha", () => {
    let comunicaPje = 0
    let documentosDiretos = 0
    for (const linha of proposta69.linhas as Array<{ numero_cnj: string; url_fonte: string }>) {
      const url = new URL(linha.url_fonte)
      if (url.hostname !== "comunicaapi.pje.jus.br") {
        documentosDiretos += 1
        continue
      }
      comunicaPje += 1
      assert.equal(url.pathname, "/api/v1/comunicacao")
      assert.deepEqual(url.searchParams.getAll("numeroProcesso"), [
        linha.numero_cnj.replace(/\D/g, ""),
      ])
    }
    assert.equal(comunicaPje, 55)
    assert.equal(documentosDiretos, 14)
    assert.deepEqual(auditoriaUrl69.universo, {
      linhas: 69,
      urls_comunica_pje: 55,
      urls_documentais: 14,
      divergencias_antes: 10,
      divergencias_depois: 0,
    })
    assert.equal(auditoriaUrl69.resultado_consultas_especificas.http_200, 10)
    assert.equal(auditoriaUrl69.resultado_consultas_especificas.cnj_encontrado_no_payload, 10)
    assert.deepEqual(
      new Set(auditoriaUrl69.linhas_corrigidas.map((linha: { numero_cnj: string }) => linha.numero_cnj)),
      new Set([
        "0010522-78.2022.5.03.0108",
        "0010746-20.2016.5.03.0013",
        "0011188-38.2015.5.03.0007",
        "0011337-13.2015.5.03.0111",
        "0011475-61.2016.5.03.0105",
        "0011533-64.2016.5.03.0008",
        "0011597-74.2016.5.03.0105",
        "1001988-98.2025.4.01.4300",
        "5717868-11.2022.8.09.0051",
        "5110636-33.2023.8.13.0024",
      ]),
    )
  })

  it("prepara 66 payloads procedurais sem inferir mérito, datas ou gravidade", () => {
    assert.equal(auditoriaPayload66.totais.processos, 66)
    assert.equal(auditoriaPayload66.totais.fichas, 25)
    assert.equal(auditoriaPayload66.totais.publicaveis, 0)
    assert.equal(auditoriaPayload66.totais.payloads_tecnicos_prontos, 66)
    assert.equal(auditoriaPayload66.totais.consultas_com_erro, 0)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.identidade_na_resposta_oficial, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.classe, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.tribunal, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.polo_candidato, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.data_comunicacao, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.orgao, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.status_publico, 66)
    assert.equal(auditoriaPayload66.totais.campos_sustentados.descricao_publica, 66)
    assert.equal(auditoriaPayload66.publicacao_pronta, false)
    assert.equal(
      auditoriaPayload66.semantica.status_comunicacao,
      "nao_e_status_de_merito_do_processo",
    )
    assert.equal(
      auditoriaPayload66.semantica.data_disponibilizacao,
      "nao_e_data_inicio_nem_data_decisao_do_processo",
    )

    const cnjsAuditados = new Set(
      auditoriaPayload66.processos.map((processo: { numero_cnj: string }) => processo.numero_cnj),
    )
    const cnjsConfirmados = new Set(
      identidade66.fichas
        .filter((ficha: { desfecho: string }) => ficha.desfecho === "confirmado")
        .flatMap((ficha: { cnj_relevantes: string[] }) => ficha.cnj_relevantes),
    )
    assert.deepEqual(cnjsAuditados, cnjsConfirmados)

    for (const processo of auditoriaPayload66.processos) {
      assert.equal(processo.payload_tecnico_pronto, true)
      assert.equal(processo.publicacao_pronta, false)
      assert.equal(
        processo.status_publico,
        "comunicacao_processual_publicada_merito_nao_inferido",
      )
      assert.equal(processo.status_processual_merito, null)
      assert.equal(processo.data_inicio, null)
      assert.equal(processo.data_decisao, null)
      assert.match(processo.descricao_publica, /DJEN registra comunicação processual oficial/)
      assert.match(processo.descricao_publica, /não informa, por si só, mérito, culpa ou desfecho/)
      assert.match(processo.fonte_oficial, /^https:\/\/comunicaapi\.pje\.jus\.br\/api\/v1\/comunicacao/)
      assert.deepEqual(processo.campos_faltantes, [])
      assert.deepEqual(processo.campos_nao_inferidos, [
        "status_processual_merito",
        "data_inicio",
        "data_decisao",
        "gravidade",
      ])
    }

    assert.doesNotMatch(JSON.stringify(auditoriaPayload66), /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  })

  it("prova migration, allowlist e readback do 66/25 aprovado e não aplicado", () => {
    assert.equal(proposta66.processos, 66)
    assert.equal(proposta66.fichas, 25)
    assert.equal(proposta66.estado, "aprovado_editorialmente_nao_aplicado")
    assert.equal(allowlist66.coorte.length, 25)
    assert.equal(allowlist66.entries.length, 25)
    assert.equal((migration66.match(/-- @write tabela=processos/g) ?? []).length, 66)
    assert.match(migration66, /curadoria-djen-20260810/)
    assert.match(readback66, /AS inferred_fields/)
    assert.match(readback66, /AS invalid_source_urls/)
    assert.match(readback66, /AS payload_mismatch/)
    assert.match(readback66, /AS source_cnj_mismatch/)
    assert.equal(existsSync("supabase/migrations/20260810123000_processos_curadoria_djen_66.sql"), true)
    assert.equal(migration66Aplicavel.replace(/^--.*\n/gm, ""), migration66.replace(/^--.*\n/gm, ""))

    for (const linha of proposta66.linhas) {
      assert.equal(linha.status, "comunicacao_processual_publicada_merito_nao_inferido")
      assert.equal(linha.data_inicio, null)
      assert.equal(linha.data_decisao, null)
      assert.equal(linha.gravidade, null)
      assert.match(linha.url_fonte, /^https:\/\/comunicaapi\.pje\.jus\.br/)
    }
  })
})
