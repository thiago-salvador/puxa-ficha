import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

import { LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT } from "@/lib/fetch-gastos-votos-in-batch"
import { groupLegislacaoProfileItems } from "@/lib/legislacao-profile-groups"
import {
  toPublicCandidatoProfileDto,
  toPublicLegislacaoExecutivoDto,
} from "@/lib/public-profile-dto"
import type { FichaCandidato, LegislacaoMandatoExecutivo } from "@/lib/types"

/**
 * Coverage_id real do inventario completo de Goias (3.600 atos, a ficha mais
 * pesada do site e presidenciavel). Usa-lo aqui amarra o teste ao mesmo mapa de
 * cobertura que a UI le, em vez de a um id inventado.
 */
const COVERAGE_ID_CAIADO = "ronaldo-caiado-go-completo-leis-2019-01-01-2026-03-27"

const API_PATH = "src/lib/api.ts"
const PROFILE_PATH = "src/components/CandidatoProfile.tsx"
const ROUTE_PATH = "src/app/api/candidato-profile/[slug]/legislacao-executivo/route.ts"

function buildAtoExecutivo(index: number): LegislacaoMandatoExecutivo {
  return {
    id: `lme-${index}`,
    candidato_id: "cand-1",
    historico_politico_id: null,
    tipo_relacao: "lei_sancionada",
    esfera: "estadual",
    uf_norma: "GO",
    municipio_norma: null,
    tipo_norma: "lei",
    numero: String(index),
    ano: 2026,
    data_norma: `2026-03-${String((index % 27) + 1).padStart(2, "0")}`,
    // Vocabulario de politica publica: pontua acima do limiar de destaque.
    ementa: `Institui programa de saude e assistencia social ${index}`,
    signatario: "RONALDO CAIADO",
    autoridade_papel: "titular",
    fonte_primaria_url: "https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/1",
    fonte_primaria_titulo: "Legisla Goias",
    fonte_tramitacao_url: null,
    identificador_fonte: `LEGISLA-GO:${index}`,
    metadata: { coverage_id: COVERAGE_ID_CAIADO },
    created_at: "2026-03-27T00:00:00.000Z",
  }
}

const previa = Array.from({ length: LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT }, (_, i) =>
  buildAtoExecutivo(i),
)
const TOTAL_CAIADO = 3600

describe("inventário do Executivo fora do caminho de render", () => {
  test("a prévia não encolhe o acervo: contagem e texto seguem o total real", () => {
    const comTotal = groupLegislacaoProfileItems({
      projetosLei: [],
      legislacaoMandatoExecutivo: previa,
      legislacaoMandatoExecutivoTotal: TOTAL_CAIADO,
      votos: [],
      cargoDisputado: "Presidente",
    })

    // O que o leitor vê contado é o acervo inteiro, não o pedaço que já chegou.
    assert.equal(comTotal.executivoCount, TOTAL_CAIADO)
    assert.equal(comTotal.totalCount, TOTAL_CAIADO)
    assert.equal(comTotal.navigationCount, TOTAL_CAIADO)

    // E a frase que afirma completude cita o número verdadeiro. Antes deste
    // refactor ela citaria 25, ou seja afirmaria "inventário completo de 25
    // atos" sobre um mandato de 3.600.
    assert.match(
      comTotal.inventoryScope.featuredDescription,
      new RegExp(`inventário completo de ${TOTAL_CAIADO} atos`),
    )
    assert.doesNotMatch(comTotal.inventoryScope.featuredDescription, /completo de 25 atos/)
    assert.equal(comTotal.inventoryScope.kind, "complete")

    // As listas continuam sendo só o que chegou: o total governa a afirmação,
    // nunca o conteúdo renderizado.
    assert.equal(comTotal.executivo.length, LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT)
  })

  test("o gate de destaques usa o acervo, não a prévia", () => {
    // hasExecutiveInventoryHighlights exige 100 atos. Com 25 na mão e 3.600 no
    // acervo, o gate tem que abrir; medindo a prévia ele fecharia e a aba
    // perderia os destaques até o fetch sob demanda voltar.
    const comTotal = groupLegislacaoProfileItems({
      projetosLei: [],
      legislacaoMandatoExecutivo: previa,
      legislacaoMandatoExecutivoTotal: TOTAL_CAIADO,
      votos: [],
      cargoDisputado: "Presidente",
    })
    assert.equal(comTotal.hasExecutiveInventoryHighlights, true)

    const semTotal = groupLegislacaoProfileItems({
      projetosLei: [],
      legislacaoMandatoExecutivo: previa,
      votos: [],
      cargoDisputado: "Presidente",
    })
    assert.equal(semTotal.hasExecutiveInventoryHighlights, false)
  })

  test("sem total informado, o comportamento anterior é preservado", () => {
    const semTotal = groupLegislacaoProfileItems({
      projetosLei: [],
      legislacaoMandatoExecutivo: previa,
      votos: [],
      cargoDisputado: "Presidente",
    })

    assert.equal(semTotal.executivoCount, previa.length)
    assert.equal(semTotal.totalCount, previa.length)
    assert.match(semTotal.inventoryScope.featuredDescription, /completo de 25 atos/)
  })

  test("um total menor que a lista carregada nunca reduz a contagem", () => {
    // Defesa contra total defasado (cache antigo, corrida entre prévia e fetch):
    // a contagem exibida jamais pode ficar abaixo do que está na tela.
    const groups = groupLegislacaoProfileItems({
      projetosLei: [],
      legislacaoMandatoExecutivo: previa,
      legislacaoMandatoExecutivoTotal: 3,
      votos: [],
      cargoDisputado: "Presidente",
    })
    assert.equal(groups.executivoCount, previa.length)
  })
})

describe("payload público do inventário do Executivo", () => {
  test("a ficha declara o total e a truncagem para o cliente", () => {
    const ficha = {
      slug: "ronaldo-caiado",
      legislacao_mandato_executivo: previa,
      legislacao_mandato_executivo_total: TOTAL_CAIADO,
      legislacao_mandato_executivo_truncados: true,
    } as unknown as FichaCandidato

    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.legislacao_mandato_executivo_total, TOTAL_CAIADO)
    assert.equal(dto.legislacao_mandato_executivo_truncados, true)
  })

  test("sem truncagem, o total cai para o tamanho da lista servida", () => {
    const ficha = {
      slug: "candidata",
      legislacao_mandato_executivo: previa,
    } as unknown as FichaCandidato

    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.legislacao_mandato_executivo_total, previa.length)
    assert.equal(dto.legislacao_mandato_executivo_truncados, false)
  })

  test("prévia e inventário completo têm a mesma forma por linha", () => {
    // O cliente substitui a prévia pelo inventário inteiro. Se os dois mappers
    // divergirem, a troca muda o objeto sob a UI sem ninguém perceber.
    const ficha = {
      slug: "ronaldo-caiado",
      legislacao_mandato_executivo: previa,
      legislacao_mandato_executivo_total: TOTAL_CAIADO,
      legislacao_mandato_executivo_truncados: true,
    } as unknown as FichaCandidato

    const daFicha = toPublicCandidatoProfileDto(ficha).legislacao_mandato_executivo
    const daRota = toPublicLegislacaoExecutivoDto(previa)

    assert.deepEqual(daRota, daFicha)
    // E nenhum dos dois carrega campo DB-only.
    for (const row of daRota) {
      assert.deepEqual(
        Object.keys(row).filter((key) =>
          ["candidato_id", "historico_politico_id", "identificador_fonte", "created_at"].includes(key),
        ),
        [],
      )
    }
  })
})

describe("contrato do carregamento sob demanda", () => {
  test("o caminho de render busca só a prévia, com a contagem exata", async () => {
    const source = await readFile(API_PATH, "utf8")
    const consultaDaFicha = source.slice(
      source.indexOf("withSupabaseRetry(`legislacao_mandato_executivo(${slug})`"),
      source.indexOf("withSupabaseRetry(`gastos_parlamentares(${slug})`"),
    )

    assert.ok(consultaDaFicha.length > 0, "o call site da ficha precisa existir")
    assert.match(consultaDaFicha, /count: "exact"/)
    assert.match(
      consultaDaFicha,
      /\.limit\(LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT\)/,
      "a ficha não pode voltar a materializar o inventário inteiro no render",
    )
    assert.match(consultaDaFicha, /\.abortSignal\(signal\)/)
    assert.doesNotMatch(
      consultaDaFicha,
      /fetchLegislacaoMandatoExecutivoRowsPaged/,
      "a paginação completa saiu do caminho de render",
    )
    assert.match(source, /legislacao_mandato_executivo_total:/)
    assert.match(source, /legislacao_mandato_executivo_truncados:/)
  })

  test("a rota própria serve o inventário completo sem service role", async () => {
    const [api, route] = await Promise.all([
      readFile(API_PATH, "utf8"),
      readFile(ROUTE_PATH, "utf8"),
    ])

    // A paralelização de #65 continua sendo o caminho do inventário completo.
    assert.match(api, /RowsPaged\(supabase, candidatoId, signal\)/)
    assert.match(route, /toPublicLegislacaoExecutivoDto\(resource\.data\.rows\)/)
    assert.doesNotMatch(route, /createServiceRoleSupabaseClient/)
  })

  test("o cliente só busca o inventário quando Legislação abre, e recusa resposta parcial", async () => {
    const [profile, sections] = await Promise.all([
      readFile(PROFILE_PATH, "utf8"),
      readFile("src/components/CandidatoProfileSections.tsx", "utf8"),
    ])

    const efeito = profile.slice(profile.indexOf("legislacaoExecutivoLoadStateRef.current !== \"idle\""))
    assert.ok(efeito.length > 0, "o efeito de carregamento precisa existir")
    assert.match(profile, /activeTab !== "legislacao" \|\| legislacaoExecutivoLoadStateRef/)
    assert.match(profile, /legislacao_executivo_fetch_incomplete/)
    assert.match(sections, /legislacaoExecutivoLoadState === "failed"/)
    assert.match(sections, /legislacaoExecutivoLoadState === "loading"/)
  })
})
