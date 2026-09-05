import assert from "node:assert"
import { test, describe } from "node:test"
import { aggregatePlCountsByQuizEixo, mapProjetoTemaToQuizEixo } from "@/lib/quiz-tema-map"
import { existsSync, readFileSync } from "fs"

function extractProjectIngestRow(content: string): string {
  const projectUpsertIndex = content.indexOf('.from("projetos_lei")')
  assert.notStrictEqual(projectUpsertIndex, -1, "ingest deve escrever em projetos_lei")

  const rowStart = content.lastIndexOf("const row = {", projectUpsertIndex)
  assert.notStrictEqual(rowStart, -1, "ingest deve montar objeto row antes do upsert de projetos_lei")

  const braceStart = content.indexOf("{", rowStart)
  let depth = 0
  for (let index = braceStart; index < content.length; index++) {
    const char = content[index]
    if (char === "{") depth++
    if (char === "}") depth--
    if (depth === 0) {
      return content.slice(rowStart, index + 1)
    }
  }

  throw new Error("nao foi possivel extrair objeto row de projetos_lei")
}

function assertRawProjectIngestRow(content: string, sourceLabel: string, sourceValue: string) {
  const row = extractProjectIngestRow(content)

  for (const field of ["tipo", "numero", "ano", "ementa", "fonte", "proposicao_id_api"]) {
    assert.match(row, new RegExp(`\\b${field}\\b\\s*(?::|,)`), `${sourceLabel} ingest escreve ${field}`)
  }

  assert.match(row, new RegExp(`\\bfonte:\\s*"${sourceValue}"`), `${sourceLabel} ingest escreve fonte correta`)
  assert.doesNotMatch(row, /\btema:\s*/, `${sourceLabel} ingest não deve escrever tema`)
  assert.doesNotMatch(row, /\bdestaque:\s*/, `${sourceLabel} ingest não deve escrever destaque`)
  assert.doesNotMatch(row, /\bdestaque_motivo:\s*/, `${sourceLabel} ingest não deve escrever destaque_motivo`)
}

describe("Projetos de lei contract", () => {
  describe("src/lib/types.ts", () => {
    test("existe export interface ProjetoLei", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /export interface ProjetoLei/, "deve exportar interface ProjetoLei")
    })

    test("ProjetoLei contém campo id", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /id:\s*string/, "deve ter campo id")
    })

    test("ProjetoLei contém campo candidato_id", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /candidato_id:\s*string/, "deve ter campo candidato_id")
    })

    test("ProjetoLei contém campo tipo", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /tipo:\s*string/, "deve ter campo tipo")
    })

    test("ProjetoLei contém campo numero", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /numero:\s*string\s*\|/, "deve ter campo numero")
    })

    test("ProjetoLei contém campo ano", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /ano:\s*number\s*\|/, "deve ter campo ano")
    })

    test("ProjetoLei contém campo ementa", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /ementa:\s*string\s*\|/, "deve ter campo ementa")
    })

    test("ProjetoLei contém campo tema (enriquecimento editorial)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /tema:\s*string\s*\|/, "deve ter campo tema (enriquecimento editorial)")
    })

    test("ProjetoLei contém campo situacao", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /situacao:\s*string\s*\|/, "deve ter campo situacao")
    })

    test("ProjetoLei contém campo url_inteiro_teor", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /url_inteiro_teor:\s*string\s*\|/, "deve ter campo url_inteiro_teor")
    })

    test("ProjetoLei contém campo destaque (enriquecimento editorial)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /destaque:\s*boolean/, "deve ter campo destaque (enriquecimento editorial)")
    })

    test("ProjetoLei contém campo destaque_motivo (enriquecimento editorial)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /destaque_motivo:\s*string\s*\|/, "deve ter campo destaque_motivo (enriquecimento editorial)")
    })

    test("ProjetoLei contém campo fonte", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /fonte:\s*string/, "deve ter campo fonte")
    })

    test("ProjetoLei contém campo proposicao_id_api (para audit/dedupe)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /proposicao_id_api\??:\s*string\s*\|\s*null/, "deve ter campo proposicao_id_api para audit/dedupe")
    })

    test("ProjetoLei contém campo coverage_id (etiqueta de cobertura parlamentar)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /coverage_id\??:\s*string\s*\|\s*null/, "deve ter campo coverage_id para cobertura parlamentar verificada")
    })

    test("ProjetoLei contém campo coverage_scope (escopo formal do coverage_id)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /coverage_scope\??:\s*string\s*\|\s*null/, "deve ter campo coverage_scope")
    })

    test("ProjetoLei contém campo metadata (provenance auditável)", () => {
      const content = readFileSync("src/lib/types.ts", "utf-8")
      assert.match(content, /metadata\??:\s*Record<string,\s*unknown>\s*\|\s*null/, "deve ter campo metadata para provenance")
    })
  })

  describe("Contrato de bruto vs enriquecido", () => {
    test("ingest oficial Câmara/Senado produz legislação bruta (tipo, numero, ano, ementa, fonte, proposicao_id_api)", () => {
      const camaraContent = readFileSync("scripts/lib/ingest-camara.ts", "utf-8")
      const senadoContent = readFileSync("scripts/lib/ingest-senado.ts", "utf-8")

      assertRawProjectIngestRow(camaraContent, "Camara", "Camara")
      assertRawProjectIngestRow(senadoContent, "Senado", "Senado")
    })

    test("tema, destaque e destaque_motivo são enriquecimento editorial/curatorial, não produzidos por ingest oficial", () => {
      const camaraContent = readFileSync("scripts/lib/ingest-camara.ts", "utf-8")
      const senadoContent = readFileSync("scripts/lib/ingest-senado.ts", "utf-8")

      assertRawProjectIngestRow(camaraContent, "Camara", "Camara")
      assertRawProjectIngestRow(senadoContent, "Senado", "Senado")
    })

    test("quiz só consome projetos_lei com tema (tema não nulo)", () => {
      const apiContent = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(apiContent, /\.not\("tema", "is", null\)/, "quiz dataset deve ignorar tema nulo")
    })

    test("UI de legislação ordena com destaque primeiro, mas não trata ausência de tema/destaque como erro factual", () => {
      const sectionsContent = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")
      // UI uses destaque for ordering but handles missing gracefully
      assert.match(sectionsContent, /if \(a\.destaque && !b\.destaque\) return -1/, "UI ordena destaque primeiro")
      // No assertion that destaque or tema must be present - absence is acceptable
    })
  })

  describe("src/lib/api.ts", () => {
    test("a ficha busca a tabela projetos_lei", () => {
      const content = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(content, /from\("projetos_lei"\)/, "deve consultar tabela projetos_lei")
    })

    test("a query filtra por candidato_id", () => {
      const content = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(content, /\.eq\("candidato_id", id\)/, "deve filtrar por candidato_id")
    })

    test("a query ordena por ano descendente", () => {
      const content = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(content, /\.order\("ano", \{ ascending: false \}\)/, "deve ordenar por ano descendente")
    })

    test("a montagem da ficha popula projetos_lei: projetos.data", () => {
      const content = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(content, /projetos_lei:\s*projetos\.data/, "deve popular projetos_lei")
    })

    test("o dataset do quiz busca candidato_id, tema, url_inteiro_teor em projetos_lei", () => {
      const content = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(content, /select\("candidato_id,tema,url_inteiro_teor"\)/, "deve buscar campos específicos para quiz")
    })

    test("o dataset do quiz ignora tema nulo", () => {
      const content = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(content, /\.not\("tema", "is", null\)/, "deve ignorar tema nulo")
    })
  })

  describe("src/lib/timeline-utils.ts", () => {
    test("computeProcessYearFallback considera ficha.projetos_lei", () => {
      const content = readFileSync("src/lib/timeline-utils.ts", "utf-8")
      assert.match(content, /ficha\.projetos_lei/, "deve considerar projetos_lei no fallback")
    })

    test("buildTimelineEvents percorre ficha.projetos_lei", () => {
      const content = readFileSync("src/lib/timeline-utils.ts", "utf-8")
      assert.match(content, /for \(const pl of ficha\.projetos_lei/, "deve percorrer projetos_lei")
    })

    test("projeto sem ano é ignorado na timeline", () => {
      const content = readFileSync("src/lib/timeline-utils.ts", "utf-8")
      assert.match(content, /if \(pl\.ano == null\) continue/, "deve ignorar projeto sem ano")
    })

    test("evento de projeto usa id no formato pl-${pl.id}", () => {
      const content = readFileSync("src/lib/timeline-utils.ts", "utf-8")
      assert.match(content, /id: `pl-\$\{pl\.id\}`/, "deve usar formato pl-${pl.id}")
    })

    test("evento de projeto usa type: projeto_lei", () => {
      const content = readFileSync("src/lib/timeline-utils.ts", "utf-8")
      assert.match(content, /type:\s*"projeto_lei"/, "deve usar type projeto_lei")
    })

    test("evento de projeto aponta tab_link: legislacao", () => {
      const content = readFileSync("src/lib/timeline-utils.ts", "utf-8")
      assert.match(content, /tab_link:\s*"legislacao"/, "deve apontar para aba legislacao")
    })
  })

  describe("src/lib/quiz-tema-map.ts", () => {
    test("exporta mapProjetoTemaToQuizEixo", () => {
      const content = readFileSync("src/lib/quiz-tema-map.ts", "utf-8")
      assert.match(content, /export function mapProjetoTemaToQuizEixo/, "deve exportar mapProjetoTemaToQuizEixo")
      assert.strictEqual(mapProjetoTemaToQuizEixo("segurança pública"), "seguranca")
    })

    test("exporta aggregatePlCountsByQuizEixo", () => {
      const content = readFileSync("src/lib/quiz-tema-map.ts", "utf-8")
      assert.match(content, /export function aggregatePlCountsByQuizEixo/, "deve exportar aggregatePlCountsByQuizEixo")
    })

    test("aggregatePlCountsByQuizEixo chama mapProjetoTemaToQuizEixo", () => {
      const content = readFileSync("src/lib/quiz-tema-map.ts", "utf-8")
      assert.match(content, /mapProjetoTemaToQuizEixo\(tema\)/, "deve chamar mapProjetoTemaToQuizEixo")
    })

    test("tema tributário/fiscal soma em politica_fiscal", () => {
      const result = aggregatePlCountsByQuizEixo({ "tributário": 2, "fiscal": 1 })
      assert.strictEqual(result.politica_fiscal, 3, "temas tributário/fiscal devem somar em politica_fiscal")
    })

    test("tema de segurança soma em seguranca", () => {
      const result = aggregatePlCountsByQuizEixo({ "segurança pública": 3 })
      assert.strictEqual(result.seguranca, 3, "tema de segurança deve somar em seguranca")
    })

    test("tema desconhecido é ignorado", () => {
      const result = aggregatePlCountsByQuizEixo({ "tema desconhecido": 5 })
      assert.strictEqual(Object.keys(result).length, 0, "tema desconhecido deve ser ignorado")
    })
  })

  describe("src/components/LegislationTabSection.tsx", () => {
    test("a seção de legislação recebe projetosLei", () => {
      const content = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")
      assert.match(content, /projetosLei:\s*ProjetoLei\[\]/, "deve receber projetosLei")
    })

    test("renderiza Projetos de lei ({projetosLei.length}) quando o acervo é só projeto de lei", () => {
      const content = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")
      assert.match(content, /Projetos de lei \(\$\{items\.length\}\)/, "deve renderizar contagem")
    })

    /**
     * Issue #138. O acervo autoral da Câmara traz requerimento, indicação e
     * emenda junto do projeto de lei. Enquanto o rótulo era fixo, a ficha do
     * eduardo-paes anunciava 339 projetos de lei quando 245 daquelas linhas não
     * são projeto de lei nenhum.
     */
    /**
     * Rodada 2 da vistoria: o card usava `projetosLei.length` (a prévia de 25)
     * e derivava o rótulo dos tipos dessas 25 linhas. Com 25 PLs seguidas de um
     * REQ, a ficha anunciava "25 Projetos de lei" para um acervo misto maior.
     */
    test("o card do perfil publica o acervo, nunca a prévia (rodada 2)", () => {
      const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")
      assert.match(
        profile,
        /value=\{projetosLeiTotal\}/,
        "o valor do card é o total materializado, não o tamanho da prévia",
      )
      assert.match(
        profile,
        /label=\{rotuloCardLegislacao\}/,
        "o rótulo do card sai da composição do acervo inteiro",
      )
      assert.match(
        profile,
        /projetos_lei_natureza_projetos_total/,
        "o card consome o head-count por natureza vindo do servidor",
      )

      const api = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(
        api,
        /projetos_lei_natureza_projetos_total/,
        "a API expõe o numerador de projetos de lei do acervo inteiro",
      )
      assert.match(
        api,
        /\.in\("tipo", \[\.\.\.SIGLAS_PROJETO_LEI\]\)/,
        "o numerador vem de head-count por sigla, não da prévia",
      )
      assert.match(
        readFileSync("src/lib/candidate-section-freshness.ts", "utf-8"),
        /rotuloFreshnessProjetos/,
        "o freshness também rotula pelo acervo inteiro",
      )
    })

    /**
     * Rodada 3 da vistoria: o campo de natureza era calculado na API interna e
     * morria no DTO público, então /api/candidato-profile/[slug] não expunha a
     * composição e o readback prometido não tinha o que conferir. E o `sub` do
     * card contava destaque só na prévia de 25.
     */
    test("a composição e os destaques chegam ao DTO público e ao card (rodada 3)", () => {
      const dto = readFileSync("src/lib/public-profile-dto.ts", "utf-8")
      assert.match(
        dto,
        /projetos_lei_natureza_projetos_total: ficha\.projetos_lei_natureza_projetos_total \?\? null/,
        "o DTO público copia a composição em vez de descartá-la",
      )
      assert.match(
        dto,
        /projetos_lei_destaques_total/,
        "o DTO público expõe o total de destaques do acervo",
      )

      const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")
      assert.match(
        profile,
        /sub=\{subDestaquesCard\}/,
        "o sub do card sai do acervo inteiro, não da prévia",
      )
      assert.match(
        profile,
        /projetos_lei_destaques_total/,
        "o card consome o head-count de destaques do servidor",
      )

      const api = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(
        api,
        /\.eq\("destaque", true\)/,
        "a API conta destaques do acervo inteiro por head-count",
      )
    })

    /**
     * Rodada 4 da vistoria: o readback comparava o total GLOBAL com a
     * assinatura do corte, que é por fonte (sete das dez fichas já passavam de
     * 100 no total antes do backfill), e validava o DOM com includes no HTML
     * inteiro, aprovando card errado com o texto certo no rodapé.
     */
    test("o readback verifica a dimensão por fonte e o card ancorado (rodada 4)", () => {
      const api = readFileSync("src/lib/api.ts", "utf-8")
      assert.match(
        api,
        /\.eq\("fonte", "Camara"\)/,
        "a API expõe a contagem de fonte Câmara, a mesma dimensão projetosCamara da régua",
      )

      const dto = readFileSync("src/lib/public-profile-dto.ts", "utf-8")
      assert.match(
        dto,
        /projetos_lei_camara_total: ficha\.projetos_lei_camara_total \?\? null/,
        "o DTO público copia a contagem por fonte",
      )

      const readback = readFileSync("scripts/readback-fichas-camara.ts", "utf-8")
      // Pós-backfill real: renan-filho tem exatamente 100 declaradas, então
      // limiar fixo reprovaria acervo completo. O invariante é igualdade com o
      // declarado pela fonte, na dimensão por fonte.
      assert.match(
        readback,
        /camara !== declarado/,
        "a contagem pública de fonte Câmara compara com o declarado pela fonte",
      )
      assert.match(
        readback,
        /declaradoNaCamara/,
        "o denominador vem da própria Câmara, em 1 request",
      )
      assert.doesNotMatch(
        readback,
        /CORTE_HISTORICO/,
        "limiar fixo é proxy: reprova acervo legitimamente completo em 100",
      )
      assert.match(
        readback,
        /data-pf-overview-legislacao="\(\\+d\+\)"|data-pf-overview-legislacao/,
        "o DOM se verifica pelo card ancorado, não por includes no HTML inteiro",
      )
      assert.match(
        readback,
        /totalNoCard !== total/,
        "o número exibido no card tem que bater com a API",
      )
      assert.doesNotMatch(
        readback,
        /html\.includes\(/,
        "includes no HTML inteiro aprova card errado com texto certo em outro lugar",
      )

      const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")
      assert.match(
        profile,
        /dataValueAttr="data-pf-overview-legislacao"/,
        "o card de legislação carrega a âncora de readback",
      )
    })

    test("o readback das dez fichas é fail-closed (rodada 3)", () => {
      const readback = readFileSync("scripts/readback-fichas-camara.ts", "utf-8")
      assert.match(readback, /process\.exitCode = 1/, "qualquer ficha reprovada derruba o processo")
      assert.match(
        readback,
        /signal: AbortSignal\.timeout\(45_000\)/,
        "rede indisponível não pode pendurar o gate indefinidamente",
      )
      assert.match(
        readback,
        /!idsPorSlug\.has\(slug\)/,
        "slug removido por PF_INGEST_SLUGS não pode virar candidato legítimo sem id da Câmara",
      )
      assert.match(
        readback,
        /projetos_lei_natureza_projetos_total/,
        "o readback confere a composição pela API pública",
      )
      assert.match(
        readback,
        /camara !== declarado/,
        "o readback compara a superfície pública com o declarado pela fonte",
      )
      assert.doesNotMatch(
        readback,
        /\|\| echo/,
        "nenhum ramo pode converter falha em sucesso",
      )

      // A camada normativa (Status/) mora no repositorio de OPERACAO, um nivel acima quando
      // o app vive em pf-16-08/app/. Desde a migracao de 18/08/2026 o app tambem e a RAIZ do
      // repositorio publico, e ali esse caminho legitimamente nao existe. Onde a normativa
      // esta presente a assercao continua valendo inteira; onde nao esta, o teste diz isso
      // em vez de quebrar com ENOENT.
      const caminhoStatus = "../Status/ARQUITETURA.md"
      if (!existsSync(caminhoStatus)) {
        console.log(
          "  (fora do repositorio de operacao: sem ../Status/, a checagem da normativa nao roda)"
        )
        return
      }
      const status = readFileSync(caminhoStatus, "utf-8")
      assert.match(
        status,
        /readback-fichas-camara\.ts/,
        "o STATUS aponta para o script fail-closed, não para loop de shell",
      )
      assert.match(status, /-H @-/, "o secret de revalidação entra por stdin, nunca por argv")
      assert.doesNotMatch(
        status,
        /-H "x-pf-revalidate-secret: \$/,
        "secret expandido em argv é visível em inspeção de processos",
      )
    })

    test("acervo misto deixa de ser anunciado como projeto de lei", () => {
      const content = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")
      assert.match(
        content,
        /Proposições de autoria \(\$\{items\.length\}\)/,
        "rótulo precisa mudar quando há proposição que não é projeto de lei",
      )
      assert.match(
        content,
        /contarPorNatureza/,
        "a composição precisa vir do classificador, não de contagem solta",
      )
      assert.match(
        content,
        /data-pf-legislation-projetos-lei/,
        "o readback público precisa expor quantos são projeto de lei",
      )
    })

    test("ordena visualmente com destaque primeiro", () => {
      const content = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")
      assert.match(content, /if \(a\.destaque && !b\.destaque\) return -1/, "deve ordenar destaque primeiro")
    })

    test("usa safeHref antes de renderizar link externo", () => {
      const content = readFileSync("src/components/LegislationTabSection.tsx", "utf-8")
      assert.match(content, /safeHref\(projeto\.url_inteiro_teor\)/, "deve usar safeHref antes de renderizar link")
    })
  })
})
