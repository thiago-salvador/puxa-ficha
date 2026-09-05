import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  getLegislacaoEmptyState,
  getTrajetoriaEmptyState,
  getVotosEmptyState,
} from "@/components/EmptyState"
import { LegislationTabSection } from "@/components/CandidatoProfileSections"
import { PublicDataSourcesNote } from "@/components/PublicDataSourcesNote"
import { METHODOLOGY_SOURCES } from "@/data/methodology-sources"

function sourceById(id: string) {
  const source = METHODOLOGY_SOURCES.find((item) => item.id === id)
  assert.ok(source, `source ${id} deve existir`)
  return source
}

describe("UI claims copy contract", () => {
  test("/privacidade nao promete exclusividade absoluta quando tambem ha alertas de visitantes", () => {
    const content = readFileSync("src/app/(site)/privacidade/page.tsx", "utf-8")

    assert.doesNotMatch(content, /trata exclusivamente dados de candidatos/i)
    assert.match(content, /dados públicos de candidatos e agentes políticos/)
    assert.match(content, /dados mínimos necessários/)
    assert.match(content, /sem criar conta ou login tradicional/)
  })

  test("/privacidade separa bases oficiais de fontes publicas complementares", () => {
    const content = readFileSync("src/app/(site)/privacidade/page.tsx", "utf-8")

    assert.doesNotMatch(content, /Todos os dados são obtidos de fontes públicas oficiais/)
    assert.match(content, /Bases oficiais consultadas/)
    assert.match(content, /Fontes públicas complementares, quando aplicável/)
    assert.ok(
      content.indexOf("Bases oficiais consultadas") < content.indexOf("Wikipedia e Wikidata"),
      "Wikipedia/Wikidata nao deve aparecer dentro do bloco de bases oficiais",
    )
    assert.ok(
      content.indexOf("Fontes públicas complementares") < content.indexOf("Google News"),
      "Google News deve aparecer no bloco complementar",
    )
  })

  test("fontes complementares da metodologia nao sao classificadas como bases oficiais", () => {
    // `jarbas` saiu da lista em 2026-08-05 (endpoint HTTP 522, zero linha
    // publicada, zero tentativa em coleta_log). Ver docs/fontes-pendentes.md.
    for (const id of ["wikipedia", "google-news"]) {
      assert.equal(sourceById(id).sourceKind, "fonte_publica_complementar")
    }

    for (const id of ["tse", "camara", "senado", "transparencia", "tcu"]) {
      assert.equal(sourceById(id).sourceKind, "base_oficial")
    }
  })

  test("fonte sem dado publicado nao volta para a metodologia sozinha", () => {
    // Regra do achado A0.3: a pagina so anuncia fonte que produziu dado E tem
    // superficie que o mostra. `jarbas` violava as duas pontas (endpoint 522,
    // zero linha em pontos_atencao, zero tentativa em coleta_log). Se voltar,
    // que volte junto com o dado, e este teste junto.
    assert.equal(
      METHODOLOGY_SOURCES.some((s) => s.id === "jarbas"),
      false,
      "jarbas so pode voltar a /metodologia com dado publicado (docs/fontes-pendentes.md)",
    )
    // CEAPS fica: a rota de atualizacao caiu, mas ha 102 linhas em
    // gastos_parlamentares que o site mostra, e a pagina precisa dizer de onde
    // aquele numero veio.
    assert.equal(
      METHODOLOGY_SOURCES.some((s) => s.id === "ceaps-senado"),
      true,
    )
  })

  test("TSE continua separado de processos judiciais/administrativos na metodologia", () => {
    const tse = sourceById("tse")
    const tcu = sourceById("tcu")

    assert.ok(tse.dataTypes.some((item) => /Certidões criminais/.test(item)))
    assert.ok(!tse.dataTypes.some((item) => /Processos/i.test(item)))
    assert.ok(tcu.dataTypes.some((item) => /Processos/i.test(item)))
  })

  test("PublicDataSourcesNote nao atribui processos genericamente ao TSE", () => {
    const html = renderToStaticMarkup(
      createElement(PublicDataSourcesNote, { variant: "presidencia" })
    )

    assert.doesNotMatch(html, /TSE[^.]*processos/i)
    assert.match(html, /Processos e registros judiciais\/administrativos/)
    assert.match(html, /bases públicas consultadas e curadoria/)
  })

  test("empty states de Votos e Legislacao para historico legislativo nao afirmam ausencia de mandato", () => {
    const votos = getVotosEmptyState(true)
    const legislacao = getLegislacaoEmptyState(true)
    const collapsed = `${votos.title} ${votos.description} ${legislacao.title} ${legislacao.description}`

    assert.match(votos.title, /Votações ainda não coletadas/)
    assert.match(votos.description, /votações-chave estruturadas/)
    assert.match(legislacao.title, /Projetos de lei ainda não coletados/)
    assert.match(legislacao.description, /projetos ou atos legislativos com fonte estruturada/)
    assert.doesNotMatch(collapsed, /Candidato sem mandato legislativo anterior/)
  })

  test("estado vazio de Trajetoria nao transforma falta de linha em primeira candidatura", () => {
    const trajetoria = getTrajetoriaEmptyState()
    const collapsed = `${trajetoria.title} ${trajetoria.description}`

    assert.match(trajetoria.title, /Trajetória ainda não confirmada/)
    assert.match(trajetoria.description, /não significa primeira candidatura/i)
    assert.match(trajetoria.description, /ainda não tem histórico político estruturado/i)
    assert.doesNotMatch(collapsed, /não possui histórico de cargos públicos/i)
  })

  test("hero da ficha não deixa dados pessoais inteiramente ausentes em silêncio", () => {
    const content = readFileSync(
      "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx",
      "utf-8",
    )

    assert.match(content, /const heroMetaParts = \[/)
    assert.match(content, /const heroMeta = heroMetaParts\.length > 0/)
    assert.match(content, /Dados pessoais ainda não coletados/)
    assert.match(content, /data-pf-hero-meta-state=\{heroMetaParts\.length > 0 \? "publicado" : "nao_coletado"\}/)
  })

  test("hero da ficha expõe os três complementos pessoais oficiais que já viajam no DTO", () => {
    const content = readFileSync(
      "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx",
      "utf-8",
    )

    assert.match(content, /ficha\.genero/)
    assert.match(content, /ficha\.estado_civil/)
    assert.match(content, /ficha\.cor_raca/)
  })

  test("LegislationTabSection vazio com historico legislativo renderiza copy neutra", () => {
    const html = renderToStaticMarkup(
      createElement(LegislationTabSection, {
        projetosLei: [],
        legislacaoMandatoExecutivo: [],
        votos: [],
        cargoDisputado: "Governador",
        hasLegislativeHistory: true,
        suggestion: null,
      })
    )

    assert.match(html, /Projetos de lei ainda não coletados/)
    assert.match(html, /bases consultadas ainda não têm projetos ou atos legislativos/)
    assert.doesNotMatch(html, /Candidato sem mandato legislativo anterior/)
  })

  test("LegislationTabSection parcial pequeno exibe ressalva de inventario ampliado", () => {
    const html = renderToStaticMarkup(
      createElement(LegislationTabSection, {
        projetosLei: [
          {
            id: "fixture-pl-parcial",
            candidato_id: "fixture-candidato",
            tipo: "PL",
            numero: "42",
            ano: 2026,
            ementa: "Cria diretrizes para transparência de contratos públicos.",
            tema: null,
            situacao: "tramitando",
            url_inteiro_teor: "https://example.gov/proposicao/42",
            destaque: false,
            destaque_motivo: null,
            fonte: "Fonte oficial de teste",
            coverage_id: null,
            coverage_scope: null,
          },
        ],
        legislacaoMandatoExecutivo: [],
        votos: [],
        cargoDisputado: "Governador",
        hasLegislativeHistory: true,
        suggestion: null,
      })
    )

    assert.match(html, /Inventário ampliado/)
    assert.match(html, /data-pf-legislation-inventory-scope/)
    assert.match(html, /Inventário ampliado parcial/)
    assert.match(html, /recorte disponível/)
    assert.match(html, /Não é um inventário completo da autoria parlamentar/)
    assert.doesNotMatch(html, /Inventário completo do mandato/)
    assert.doesNotMatch(html, /Inventário completo da autoria parlamentar/)
  })

  test("LegislationTabSection mantém ressalva parcial nas subabas de categoria", () => {
    const content = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")

    assert.match(content, /const renderInventoryScopeNotice =/)
    for (const subtab of ["propostas", "votadas", "aprovadas", "executivo"]) {
      assert.match(
        content,
        new RegExp(`<TabsContent value="${subtab}"[\\s\\S]{0,220}\\{renderInventoryScopeNotice\\(\\)\\}`),
        `subaba ${subtab} deve manter a ressalva parcial visível`,
      )
    }
  })

  test("LegislationTabSection com destaques exibe escopo completo na aba inicial", () => {
    const html = renderToStaticMarkup(
      createElement(LegislationTabSection, {
        projetosLei: [
          {
            id: "fixture-wilder-pl",
            candidato_id: "fixture-wilder",
            tipo: "PL",
            numero: "1",
            ano: 2026,
            ementa: "Institui programa nacional de infraestrutura.",
            tema: null,
            situacao: "tramitando",
            url_inteiro_teor: null,
            destaque: true,
            destaque_motivo: "fixture",
            fonte: "Senado Dados Abertos",
            coverage_id:
              "wilder-morais-senado-completo-autoria-substantiva-2023-2026-20260512",
            coverage_scope: "inventario_completo_senado_autoria_substantiva_2023_2026_20260512",
          },
        ],
        legislacaoMandatoExecutivo: [],
        votos: [],
        cargoDisputado: "Governador",
        hasLegislativeHistory: true,
        suggestion: null,
      })
    )

    assert.match(html, /Inventário completo da autoria parlamentar/)
    assert.match(html, /mandato atual 2023-2026/)
    assert.match(html, /não cobre o mandato anterior no Senado/)
    assert.match(html, /não cobre inventário global da vida política/)
  })

  test("metodologia nao promete verificacao factual completa no enriquecimento automatico", () => {
    const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")

    assert.doesNotMatch(content, /Tudo automatizado com verificação de consistência/)
    assert.match(content, /checagens automáticas de formato, dedupe e proveniência/)
    assert.match(content, /curadoria editorial é usada quando o conteúdo vira claim público/)
  })
})
