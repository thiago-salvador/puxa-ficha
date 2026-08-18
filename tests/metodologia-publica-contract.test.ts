import assert from "node:assert"
import { test, describe } from "node:test"
import { METHODOLOGY_SOURCES } from "@/data/methodology-sources"
import { readFileSync } from "fs"

describe("Metodologia pública contract", () => {
  describe("src/data/methodology-sources.ts", () => {
    test("existe export interface MethodologySource", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /export interface MethodologySource/, "deve exportar interface MethodologySource")
    })

    test("a interface contém campo id", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /id:\s*string/, "deve ter campo id")
    })

    test("a interface contém campo name", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /name:\s*string/, "deve ter campo name")
    })

    test("a interface contém campo url", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /url:\s*string/, "deve ter campo url")
    })

    test("a interface contém campo description", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /description:\s*string/, "deve ter campo description")
    })

    test("a interface contém campo dataTypes", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /dataTypes:\s*string\[\]/, "deve ter campo dataTypes")
    })

    test("a interface contém campo updateFrequency", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /updateFrequency:/, "deve ter campo updateFrequency")
    })

    test("a interface contém campo curationType", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /curationType:/, "deve ter campo curationType")
    })

    test("existe export const METHODOLOGY_SOURCES", () => {
      const content = readFileSync("src/data/methodology-sources.ts", "utf-8")
      assert.match(content, /export const METHODOLOGY_SOURCES/, "deve exportar METHODOLOGY_SOURCES")
    })

    test("nenhum id é duplicado", () => {
      const ids = METHODOLOGY_SOURCES.map((s) => s.id)
      const uniqueIds = new Set(ids)
      assert.strictEqual(ids.length, uniqueIds.size, "ids devem ser únicos")
    })

    test("todo source tem name não vazio", () => {
      for (const source of METHODOLOGY_SOURCES) {
        assert.ok(source.name.length > 0, `source ${source.id} deve ter name não vazio`)
      }
    })

    test("todo source tem description não vazio", () => {
      for (const source of METHODOLOGY_SOURCES) {
        assert.ok(source.description.length > 0, `source ${source.id} deve ter description não vazio`)
      }
    })

    test("todo source tem dataTypes não vazio", () => {
      for (const source of METHODOLOGY_SOURCES) {
        assert.ok(source.dataTypes.length > 0, `source ${source.id} deve ter dataTypes não vazio`)
      }
    })

    test("todo url começa com https://", () => {
      for (const source of METHODOLOGY_SOURCES) {
        assert.ok(source.url.startsWith("https://"), `source ${source.id} url deve começar com https://`)
      }
    })

    test("updateFrequency só usa valores permitidos", () => {
      const allowed = new Set(["diária", "semanal", "mensal", "por ciclo eleitoral", "sob demanda"])
      for (const source of METHODOLOGY_SOURCES) {
        assert.ok(allowed.has(source.updateFrequency), `source ${source.id} updateFrequency inválido: ${source.updateFrequency}`)
      }
    })

    test("curationType só usa valores permitidos", () => {
      const allowed = new Set(["automático", "curadoria", "misto"])
      for (const source of METHODOLOGY_SOURCES) {
        assert.ok(allowed.has(source.curationType), `source ${source.id} curationType inválido: ${source.curationType}`)
      }
    })

    test("a lista inclui tse", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "tse"), "deve incluir tse")
    })

    test("a lista inclui camara", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "camara"), "deve incluir camara")
    })

    test("a lista inclui senado", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "senado"), "deve incluir senado")
    })

    test("a lista inclui transparencia", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "transparencia"), "deve incluir transparencia")
    })

    test("a lista inclui wikipedia", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "wikipedia"), "deve incluir wikipedia")
    })

    test("a lista inclui google-news", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "google-news"), "deve incluir google-news")
    })

    test("a lista inclui ibge", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "ibge"), "deve incluir ibge")
    })

    test("a lista inclui ipea", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "ipea"), "deve incluir ipea")
    })

    test("a lista inclui atlas-violencia", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "atlas-violencia"), "deve incluir atlas-violencia")
    })

    test("a lista inclui siconfi", () => {
      assert.ok(METHODOLOGY_SOURCES.some((s) => s.id === "siconfi"), "deve incluir siconfi")
    })
  })

  describe("src/app/(site)/metodologia/page.tsx", () => {
    test("metadata tem canonical /metodologia", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /canonical:\s*"\/metodologia"/, "deve ter canonical /metodologia")
    })

    test("OpenGraph usa https://puxaficha.com.br/metodologia", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /url:\s*"https:\/\/puxaficha\.com\.br\/metodologia"/, "deve usar URL correta no OpenGraph")
    })

    test("exporta revalidate = 3600", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /export const revalidate = 3600/, "deve exportar revalidate = 3600")
    })

    test("importa METHODOLOGY_SOURCES", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /import.*METHODOLOGY_SOURCES/, "deve importar METHODOLOGY_SOURCES")
    })

    test("renderiza METHODOLOGY_SOURCES", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /METHODOLOGY_SOURCES\.map/, "deve renderizar METHODOLOGY_SOURCES")
    })

    test("usa MethodologySourceCard", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /MethodologySourceCard/, "deve usar MethodologySourceCard")
    })

    test("usa MethodologyPipelineSteps", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /MethodologyPipelineSteps/, "deve usar MethodologyPipelineSteps")
    })

    test("linka para /quiz/metodologia", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /href="\/quiz\/metodologia"/, "deve linkar para /quiz/metodologia")
    })

    test("renderiza indicadores de frescor via FRESHNESS_INDICATORS", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /FRESHNESS_INDICATORS/, "deve usar FRESHNESS_INDICATORS")
    })

    test("inclui aviso de fonte temporariamente instável", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /Fonte temporariamente instável/, "deve incluir aviso de fonte instável")
    })

    test("explica que pontos gerados por IA só entram na superfície pública após checagem editorial", () => {
      const content = readFileSync("src/app/(site)/metodologia/page.tsx", "utf-8")
      assert.match(content, /Pontos de atenção gerados com IA só entram na superfície pública depois de checagem\s+editorial/, "deve explicar checagem editorial para IA")
      assert.match(content, /não é parecer jurídico\s+nem aprovação humana final/i, "deve evitar claim de aprovação humana ou jurídica")
    })
  })

  describe("src/components/MethodologySourceCard.tsx", () => {
    test("FREQUENCY_LABEL cobre diária", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /"diária":/, "deve cobrir diária")
    })

    test("FREQUENCY_LABEL cobre semanal", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /"semanal":/, "deve cobrir semanal")
    })

    test("FREQUENCY_LABEL cobre mensal", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /"mensal":/, "deve cobrir mensal")
    })

    test("FREQUENCY_LABEL cobre por ciclo eleitoral", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /"por ciclo eleitoral":/, "deve cobrir por ciclo eleitoral")
    })

    test("FREQUENCY_LABEL cobre sob demanda", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /"sob demanda":/, "deve cobrir sob demanda")
    })

    test("CURATION_CONFIG cobre automático", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /"automático":/, "deve cobrir automático")
    })

    test("CURATION_CONFIG cobre curadoria", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /curadoria:/, "deve cobrir curadoria")
    })

    test("CURATION_CONFIG cobre misto", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /misto:/, "deve cobrir misto")
    })

    test("links externos usam target=\"_blank\"", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /target="_blank"/, "deve usar target=\"_blank\"")
    })

    test("links externos usam rel=\"noopener noreferrer\"", () => {
      const content = readFileSync("src/components/MethodologySourceCard.tsx", "utf-8")
      assert.match(content, /rel="noopener noreferrer"/, "deve usar rel=\"noopener noreferrer\"")
    })
  })

  describe("src/components/MethodologyPipelineSteps.tsx", () => {
    test("contém etapa de coleta", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /Coleta de dados/, "deve conter etapa de coleta")
    })

    test("contém etapa de processamento e cruzamento", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /Processamento e cruzamento/, "deve conter etapa de processamento")
    })

    test("contém etapa de enriquecimento", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /Enriquecimento/, "deve conter etapa de enriquecimento")
    })

    test("contém etapa de curadoria editorial", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /Curadoria editorial/, "deve conter etapa de curadoria")
    })

    test("contém etapa de publicação", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /Publicação/, "deve conter etapa de publicação")
    })

    test("menciona que pontos gerados por IA só ficam públicos após checagem editorial", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /Pontos gerados por IA só ficam públicos após checagem editorial registrada/, "deve mencionar checagem editorial para IA")
    })

    test("menciona gate de auditoria factual na publicação", () => {
      const content = readFileSync("src/components/MethodologyPipelineSteps.tsx", "utf-8")
      assert.match(content, /auditoria factual/, "deve mencionar gate de auditoria factual")
    })
  })

  describe("src/components/PublicDataSourcesNote.tsx", () => {
    test("os dois variants exibem link conservador de fontes e metodologia", () => {
      const content = readFileSync("src/components/PublicDataSourcesNote.tsx", "utf-8")
      assert.match(content, /Fontes consultadas e metodologia/, "deve exibir Fontes consultadas e metodologia")
      assert.doesNotMatch(content, /Lista completa de fontes/, "não deve prometer lista completa de fontes")
    })

    test("o link de fontes consultadas deve apontar para /metodologia, não /sobre", () => {
      const content = readFileSync("src/components/PublicDataSourcesNote.tsx", "utf-8")
      const sobreCount = (content.match(/href="\/sobre"/g) || []).length
      const metodologiaCount = (content.match(/href="\/metodologia"/g) || []).length
      assert.strictEqual(sobreCount, 0, "não deve apontar para /sobre")
      assert.strictEqual(metodologiaCount, 2, "deve apontar para /metodologia nos dois variants")
    })
  })

  describe("src/app/(site)/quiz/metodologia/page.tsx", () => {
    test("metadata tem canonical /quiz/metodologia", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /canonical:\s*"\/quiz\/metodologia"/, "deve ter canonical /quiz/metodologia")
    })

    test("OpenGraph usa https://puxaficha.com.br/quiz/metodologia", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /url:\s*"https:\/\/puxaficha\.com\.br\/quiz\/metodologia"/, "deve usar URL correta no OpenGraph")
    })

    test("exporta revalidate = 3600", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /export const revalidate = 3600/, "deve exportar revalidate = 3600")
    })

    test("importa collectQuizVotacaoTitulos", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /collectQuizVotacaoTitulos/, "deve importar collectQuizVotacaoTitulos")
    })

    test("importa quizPerguntasOrdenadas", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /quizPerguntasOrdenadas/, "deve importar quizPerguntasOrdenadas")
    })

    test("importa QUIZ_PERGUNTAS", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /QUIZ_PERGUNTAS/, "deve importar QUIZ_PERGUNTAS")
    })

    test("afirma que o quiz não é recomendação, ranking ou previsão eleitoral", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /Não é recomendação de voto, ranking, sugestão,\s+priorização de candidato nem previsão eleitoral/, "deve afirmar que não é recomendação, ranking ou previsão")
      assert.doesNotMatch(content, /Comparar os 2 mais alinhados|dois primeiros do\s+ranking/, "não deve prometer atalho baseado em ranking")
    })

    test("cita votações", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /Votações/, "deve citar votações")
    })

    test("cita espectro partidário", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /Espectro partidário/, "deve citar espectro partidário")
    })

    test("cita posições declaradas", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /Posições declaradas/, "deve citar posições declaradas")
    })

    test("cita projetos de lei", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /Projetos de lei/, "deve citar projetos de lei")
    })

    test("cita financiamento", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /Financiamento/, "deve citar financiamento")
    })

    test("cita QUIZ_FIN_COBERTURA_MINIMA", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /QUIZ_FIN_COBERTURA_MINIMA/, "deve citar QUIZ_FIN_COBERTURA_MINIMA")
    })

    test("cita QUIZ_FINANCIAMENTO_REGRAS_VERSION = 1", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      const rules = readFileSync("src/data/quiz/financiamento-setores.ts", "utf-8")
      assert.match(content, /QUIZ_FINANCIAMENTO_REGRAS_VERSION/, "deve citar versão das regras")
      assert.match(rules, /QUIZ_FINANCIAMENTO_REGRAS_VERSION\s*=\s*1/, "versão das regras deve ser 1")
    })

    test("inclui seção/âncora feedback-espectro", () => {
      const content = readFileSync("src/app/(site)/quiz/metodologia/page.tsx", "utf-8")
      assert.match(content, /id="feedback-espectro"/, "deve incluir âncora feedback-espectro")
    })
  })
})
