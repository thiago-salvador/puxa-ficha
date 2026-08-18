import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const REPO = join(import.meta.dirname, "..")
const EVIDENCIA = join(REPO, "QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json")
const MIGRATION = join(REPO, "supabase/migrations/20260811101000_destaques_estados_residuais_194.sql")
const ROLLBACK = join(REPO, "supabase/rollback/20260811101000_destaques_estados_residuais_194.rollback.sql")
const READBACK = join(REPO, "supabase/readback/20260811101000_destaques_estados_residuais_194.readback.sql")
const PROCESSOS_LEGADOS = join(REPO, "supabase/migrations/20260811101200_processos_legados_fontes_oficiais.sql")
const READBACK_PROJETADO = join(REPO, "QA/evidencias/2026-08-11-itens-4-14-destaques/readback-projetado.json")

describe("matriz nominal 194x5 dos itens 4/14", () => {
  const manifesto = JSON.parse(readFileSync(EVIDENCIA, "utf8")) as {
    schema_version: number
    fontes_reutilizadas: { processos_legados: { path: string; sha256: string } }
    universo: { fichas: number; fontes_por_ficha: number; celulas: number }
    resumo: { nunca_verificado_projetado: number; conteudo_sem_endpoint_nominal: number }
    persistencia: Array<{ slug: string; fonte_log: string; resultado: string; detalhe: string }>
    celulas: Array<{
      slug: string
      fonte: string
      estado_projetado: string
      fonte_externa: { endpoints: string[] }
      identidade: { estado: string }
      tentativa: { executada: boolean; motivo: string }
      evidencia_nominal: string
      payload: {
        schema_version: number
        chave: string
        fonte: string
        estado: { atual: string; projetado: string; resultado_persistido: string | null }
        consulta: { executada: boolean; endpoints_nominais: string[]; bloqueio: string | null }
        evidencia: { referencia: string; detalhe: string }
      }
    }>
  }

  test("mede exatamente 194 fichas por cinco fontes, sem célula silenciosa", () => {
    assert.equal(manifesto.schema_version, 3)
    assert.deepEqual(manifesto.universo, { fichas: 194, fontes_por_ficha: 5, celulas: 970 })
    assert.equal(new Set(manifesto.celulas.map((item) => `${item.slug}:${item.fonte}`)).size, 970)
    assert.equal(manifesto.resumo.nunca_verificado_projetado, 0)
    assert.equal(manifesto.celulas.filter((item) => item.estado_projetado === "nunca_verificado").length, 0)
  })

  test("cada célula traz endpoint ou bloqueio de identidade e payload nominal", () => {
    for (const celula of manifesto.celulas) {
      assert.ok(Array.isArray(celula.fonte_externa.endpoints))
      assert.ok(celula.fonte_externa.endpoints.length > 0 || celula.identidade.estado === "ausente" || celula.payload.consulta.bloqueio)
      assert.equal(typeof celula.tentativa.executada, "boolean")
      assert.ok(celula.tentativa.motivo.length > 12)
      assert.ok(celula.evidencia_nominal.length > 8)
      assert.equal(celula.payload.schema_version, 1)
      assert.equal(celula.payload.chave, `${celula.slug}:${celula.fonte}`)
      assert.equal(celula.payload.fonte, celula.fonte)
      assert.equal(celula.payload.estado.projetado, celula.estado_projetado)
      assert.equal(celula.payload.consulta.executada, celula.tentativa.executada)
      assert.deepEqual(celula.payload.consulta.endpoints_nominais, celula.fonte_externa.endpoints)
      assert.ok(celula.payload.evidencia.referencia.length > 8)
      assert.ok(celula.payload.evidencia.detalhe.length > 12)
      if (celula.estado_projetado === "tem_conteudo") {
        assert.ok(celula.payload.consulta.endpoints_nominais.length > 0 || celula.payload.consulta.bloqueio, `${celula.slug}:${celula.fonte}`)
        assert.ok(celula.payload.consulta.endpoints_nominais.every((url) => !url.includes("{votacao_id}")))
      }
    }
  })

  test("projeção 101200 zera conteúdo sem endpoint e preserva o bloqueio Andorra", () => {
    const bloqueios = manifesto.celulas.filter((item) => item.estado_projetado === "tem_conteudo" && item.payload.consulta.endpoints_nominais.length === 0)
    assert.equal(manifesto.resumo.conteudo_sem_endpoint_nominal, 0)
    assert.deepEqual(bloqueios, [])
    const felicio = manifesto.celulas.find((item) => item.slug === "felicio-ramuth" && item.fonte === "processos")
    assert.ok(JSON.stringify(felicio?.payload).includes("43.0719.0000337/2020-0"))
    assert.ok(JSON.stringify(felicio?.payload).includes("75292421-804d-435c-8982-34054dd49bcf"))
    assert.ok(JSON.stringify(felicio?.payload).includes("indeterminado, nunca ausência"))
  })

  test("projeção judicial oficial nomeia os cinco identificadores aprovados e o SHA da fonte", () => {
    const processos = manifesto.celulas.filter((item) => ["flavio-bolsonaro", "tarcisio-gov-sp", "haddad-gov-sp", "felicio-ramuth"].includes(item.slug) && item.fonte === "processos")
    const payload = JSON.stringify(processos.map((item) => item.payload))
    for (const id of ["HC 201965", "TC 008.761/2020-5", "0000017-45.2016.6.26.0001", "0607928-52.2022.6.26.0000", "43.0719.0000337/2020-0"]) {
      assert.ok(payload.includes(id), id)
    }
    assert.ok(processos.every((item) => item.payload.consulta.endpoints_nominais.length > 0 && item.payload.consulta.executada))
    const esperado = createHash("sha256").update(readFileSync(PROCESSOS_LEGADOS)).digest("hex")
    assert.equal(manifesto.fontes_reutilizadas.processos_legados.sha256, esperado)
    assert.match(payload, new RegExp(`sha256:${esperado}`))
  })

  test("readback projetado aplica cinco correções, remove Andorra e preserva DOM", () => {
    const readback = JSON.parse(readFileSync(READBACK_PROJETADO, "utf8")) as {
      resumo: {
        fichas: number
        itensPorFonte: { processos: number }
        provaDom: { fichasRenderizadas: number; divergencias: number }
        provaProcessosLegadosProjetados: { atualizados: number; despublicados: number; semEndpointDepois: number; origem: string }
      }
    }
    assert.equal(readback.resumo.fichas, 194)
    assert.equal(readback.resumo.itensPorFonte.processos, 11)
    assert.deepEqual(readback.resumo.provaDom, { fichasRenderizadas: 194, divergencias: 0, exemplos: [] })
    assert.deepEqual(readback.resumo.provaProcessosLegadosProjetados, {
      atualizados: 5,
      despublicados: 1,
      semEndpointDepois: 0,
      origem: "supabase/migrations/20260811101200_processos_legados_fontes_oficiais.sql",
    })
  })

  test("persistência recusa vazio fabricado e cobre 80/32/180", () => {
    assert.equal(manifesto.persistencia.length, 292)
    assert.deepEqual(
      Object.fromEntries(["destaques-trajetoria", "destaques-patrimonio", "destaques-votacoes"].map((fonte) => [fonte, manifesto.persistencia.filter((item) => item.fonte_log === fonte).length])),
      { "destaques-trajetoria": 80, "destaques-patrimonio": 32, "destaques-votacoes": 180 },
    )
    assert.equal(manifesto.persistencia.filter((item) => item.resultado === "indeterminado").length, 241)
    assert.equal(manifesto.persistencia.filter((item) => item.resultado === "sem_achado_no_escopo").length, 51)
    assert.equal(manifesto.persistencia.filter((item) => ["vazio_confirmado", "nao_aplicavel"].includes(item.resultado)).length, 0)
  })

  test("projeção oficial deixa 14 fichas com votos, 28 limitadas e Dr Daniel residual", () => {
    const votos = manifesto.celulas.filter((item) => item.fonte === "votacoes")
    assert.equal(votos.filter((item) => item.estado_projetado === "tem_conteudo").length, 14)
    assert.equal(votos.filter((item) => item.estado_projetado === "curadoria_limitada").length, 28)
    assert.equal(votos.filter((item) => item.estado_projetado === "nao_foi_possivel_verificar").length, 152)
    assert.equal(votos.find((item) => item.slug === "dr-daniel")?.estado_projetado, "nao_foi_possivel_verificar")
  })

  test("trajetórias de Cadu e Ricardo têm fonte oficial nominal", () => {
    for (const slug of ["cadu-xavier", "ricardo-cappelli"]) {
      const celula = manifesto.celulas.find((item) => item.slug === slug && item.fonte === "trajetoria")
      assert.equal(celula?.estado_projetado, "tem_conteudo")
      assert.ok(celula?.payload.consulta.endpoints_nominais.some((url) => /gov\.br|rn\.gov\.br/.test(url)))
    }
  })

  test("patrimônio percorre banco, API, DTO e DOM", () => {
    const coleta = readFileSync(join(REPO, "scripts/lib/coleta-log.ts"), "utf8")
    const api = readFileSync(join(REPO, "src/lib/api.ts"), "utf8")
    const dto = readFileSync(join(REPO, "src/lib/public-profile-dto.ts"), "utf8")
    const tipos = readFileSync(join(REPO, "src/lib/types.ts"), "utf8")
    const perfil = readFileSync(join(REPO, "src/components/CandidatoProfile.tsx"), "utf8")
    assert.match(coleta, /"destaques-patrimonio": "candidato"/)
    for (const texto of [api, dto, tipos, perfil]) assert.match(texto, /patrimonio_verificacao|patrimonioVerificacao/)
  })

  test("migration, rollback e readback são nominais e fail-closed", () => {
    for (const path of [MIGRATION, ROLLBACK, READBACK]) assert.ok(existsSync(path), path)
    const sql = readFileSync(MIGRATION, "utf8")
    const rollback = readFileSync(ROLLBACK, "utf8")
    const readback = readFileSync(READBACK, "utf8")
    assert.match(sql, /alvos publicos %, esperado 292/)
    assert.match(sql, /verificacao\(oes\) igual\(is\) ou posterior\(es\)/)
    assert.doesNotMatch(sql, /vazio_confirmado[^']*'/)
    assert.match(rollback, /rollback recusado/)
    assert.match(readback, /241 indeterminados/)
    assert.match(readback, /20260811102100/)
    assert.match(readback, /456ba86bfc5de2cc7a51714f4cef0f8c/)
    assert.match(readback, /95cc5a76055102f6b8684ad33818d731/)
    assert.match(readback, /case r\.split_identidade_ledger/)
  })
})
