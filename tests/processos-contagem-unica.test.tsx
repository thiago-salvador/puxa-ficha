// cspell:ignore representacoes etica comparaveis
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import type { CandidatoResumo } from "@/lib/api"
import { CandidatoCard } from "@/components/CandidatoCard"
import { DeferredCandidatoProfileClient } from "@/components/DeferredCandidatoProfileClient"
import { buildCandidatoGridMaps } from "@/lib/candidato-grid-maps"
import { getHomeHeroMetrics } from "@/lib/home-hero-metrics"
import { processosOverviewDisplay } from "@/lib/processos-display"
import {
  aplicarProcessosJusticaAosComparaveis,
  aplicarProcessosJusticaAosResumos,
  contarProcessosJudiciaisPorCandidato,
  contarProcessosJusticaDasLinhas,
  contarProcessosJusticaDoCandidato,
  CRITERIO_CONTAGEM_PROCESSOS,
  filtrarProcessosJudiciaisContaveis,
  getProcessosDisciplinaresContaveis,
  incluirProcessoDisciplinarPadrao,
  incluirProcessoJudicialPadrao,
  type CriterioContagemProcessos,
} from "@/lib/processos-justica-candidato"
import { contarProcessosJustica, exibicaoProcessosJustica, legendaCurtaProcessosJustica } from "@/lib/processos-justica-total"
import { getRepresentacoesEticaAprovadas } from "@/lib/representacoes-etica"
import type { Candidato } from "@/lib/types"

const SENADO_ON = { SENADO_ENABLED: "true" }

/** Casos reais do dataset versionado: Senado (Flávio), Câmara (Eder Mauro) e um sem disciplinar. */
const CASOS = [
  { slug: "flavio-bolsonaro", cargo: "Presidente", judiciais: 1, esperado: 7, disciplinares: 6 },
  { slug: "delegado-eder-mauro", cargo: "Senador", judiciais: 2, esperado: 3, disciplinares: 1 },
  { slug: "candidato-sem-disciplinar", cargo: "Governador", judiciais: 4, esperado: 4, disciplinares: 0 },
] as const

function candidato(slug: string, cargo: string): Candidato {
  return {
    id: `id-${slug}`, slug, nome_urna: slug, nome_completo: slug, partido_sigla: "PT",
    foto_url: null, cargo_disputado: cargo, estado: cargo === "Presidente" ? null : "SP", redes_sociais: {},
  } as Candidato
}

/** O que o cache de lista guarda: só a contagem judicial. */
function resumoJudicial(slug: string, cargo: string, judiciais: number): CandidatoResumo {
  return {
    candidato: candidato(slug, cargo),
    patrimonio: null,
    patrimonio_atipico: false,
    processos: judiciais,
    processos_ordenacao: judiciais,
    pontos_atencao: 0,
  }
}

function numeroDoAtributo(html: string, attr: string): number {
  const match = new RegExp(`${attr}="([^"]*)"`).exec(html)
  assert.ok(match, `atributo ${attr} ausente`)
  return Number(match[1])
}

/** KPI da ficha como o skeleton hidratável o renderiza (mesma regra do CandidatoProfile). */
function kpiDaFicha(slug: string, judiciais: number, criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS): number {
  const html = renderToStaticMarkup(
    <DeferredCandidatoProfileClient
      slug={slug}
      overview={{
        processos: judiciais,
        processosDisciplinares: getProcessosDisciplinaresContaveis(slug, criterio).map((item) => ({ casa: item.casa })),
        patrimonio: null,
        mudancas: null,
      }}
    />,
  )
  return numeroDoAtributo(html, "data-pf-overview-processos")
}

describe("contagem única de processos: ficha, grade e hero mostram o mesmo número", () => {
  it("os casos de teste existem no dataset como esperado", () => {
    for (const caso of CASOS) {
      assert.equal(getRepresentacoesEticaAprovadas(caso.slug).length, caso.disciplinares, caso.slug)
    }
    assert.ok(getRepresentacoesEticaAprovadas("delegado-eder-mauro").every((item) => item.casa === "camara"))
    assert.ok(getRepresentacoesEticaAprovadas("flavio-bolsonaro").every((item) => item.casa === "senado"))
  })

  for (const caso of CASOS) {
    it(`${caso.slug}: card da listagem, KPI da ficha e contribuição no hero são ${caso.esperado}`, () => {
      const fichaKpi = kpiDaFicha(caso.slug, caso.judiciais)

      const resumos = aplicarProcessosJusticaAosResumos([resumoJudicial(caso.slug, caso.cargo, caso.judiciais)])
      const maps = buildCandidatoGridMaps(resumos)
      const cardHtml = renderToStaticMarkup(
        <CandidatoCard
          candidato={resumos[0].candidato}
          processos={maps.processos[caso.slug]}
          processosContagem={maps.processosContagem[caso.slug]}
          patrimonio={null}
          index={0}
        />,
      )
      const card = numeroDoAtributo(cardHtml, "data-pf-card-processos")

      const hero = getHomeHeroMetrics(resumos, "live", SENADO_ON).totalProcessos

      const comparador = aplicarProcessosJusticaAosComparaveis([{ slug: caso.slug, total_processos: caso.judiciais }])[0].total_processos

      assert.deepEqual(
        { fichaKpi, card, hero, comparador, ordenacao: maps.processSortCounts[caso.slug] },
        { fichaKpi: caso.esperado, card: caso.esperado, hero: caso.esperado, comparador: caso.esperado, ordenacao: caso.esperado },
      )
    })
  }

  it("Flávio: o card traz o total, o rótulo no plural e a legenda curta 1 judicial · 6 disc.", () => {
    const resumos = aplicarProcessosJusticaAosResumos([resumoJudicial("flavio-bolsonaro", "Presidente", 1)])
    const maps = buildCandidatoGridMaps(resumos)
    const html = renderToStaticMarkup(
      <CandidatoCard
        candidato={resumos[0].candidato}
        processos={maps.processos["flavio-bolsonaro"]}
        processosContagem={maps.processosContagem["flavio-bolsonaro"]}
        patrimonio={1000}
        index={0}
      />,
    )
    assert.match(html, /1 judicial · 6 disc\./)
    assert.match(html, /Processos<\/p>/)
    assert.match(html, /title="1 judicial · 6 disciplinares no Senado"/)
    assert.doesNotMatch(html, /Processo<\/p>/)
  })

  it("sem disciplinar, o card não ganha legenda e a grade não recebe partes", () => {
    const resumos = aplicarProcessosJusticaAosResumos([resumoJudicial("candidato-sem-disciplinar", "Governador", 4)])
    const maps = buildCandidatoGridMaps(resumos)
    assert.deepEqual(maps.processosContagem, {})
    const html = renderToStaticMarkup(
      <CandidatoCard candidato={resumos[0].candidato} processos={maps.processos["candidato-sem-disciplinar"]} patrimonio={1000} index={0} />,
    )
    assert.doesNotMatch(html, /data-pf-card-processos-legenda/)
  })

  it("a legenda curta some sem disciplinar e omite a parte judicial zerada", () => {
    assert.equal(legendaCurtaProcessosJustica(contarProcessosJustica({ judiciais: 3, disciplinares: [] })), undefined)
    assert.equal(
      legendaCurtaProcessosJustica(contarProcessosJustica({ judiciais: 0, disciplinares: [{ casa: "camara" }, { casa: "senado" }] })),
      "2 disc.",
    )
  })

  it("sem disciplinar, a régua judicial (com — e recibo) continua valendo", () => {
    const judicial = processosOverviewDisplay(0)
    assert.deepEqual(exibicaoProcessosJustica(judicial, contarProcessosJustica({ judiciais: 0, disciplinares: [] })), judicial)
    assert.deepEqual(
      exibicaoProcessosJustica(judicial, contarProcessosJustica({ judiciais: 0, disciplinares: [{ casa: "senado" }] })),
      { value: 1, sub: "1 disciplinar no Senado" },
    )
  })

  it("a ordenação sem contagem judicial continua null", () => {
    const [resumo] = aplicarProcessosJusticaAosResumos([{ ...resumoJudicial("flavio-bolsonaro", "Presidente", 1), processos_ordenacao: null }])
    assert.equal(resumo.processos_ordenacao, null)
    assert.equal(resumo.processos, 7)
  })
})

describe("hero: agregado com a mesma definição da ficha", () => {
  it("o total do hero é a soma dos totais de cada ficha no recorte e separa a parte disciplinar", () => {
    const base = [
      ...CASOS.map((caso) => resumoJudicial(caso.slug, caso.cargo, caso.judiciais)),
      resumoJudicial("vice-fora-do-recorte", "Vice-Presidente", 9),
    ]
    const resumos = aplicarProcessosJusticaAosResumos(base)
    const metrics = getHomeHeroMetrics(resumos, "live", SENADO_ON)

    const somaDasFichas = CASOS.reduce((soma, caso) => soma + contarProcessosJusticaDoCandidato(caso.slug, caso.judiciais).total, 0)
    const somaDisciplinares = CASOS.reduce((soma, caso) => soma + caso.disciplinares, 0)
    assert.equal(metrics.totalProcessos, somaDasFichas)
    assert.equal(metrics.totalProcessos, 7 + 3 + 4)
    assert.equal(metrics.totalProcessosDisciplinares, somaDisciplinares)
  })

  it("com o Senado desligado, senador sai do total e da parte disciplinar", () => {
    const resumos = aplicarProcessosJusticaAosResumos(CASOS.map((caso) => resumoJudicial(caso.slug, caso.cargo, caso.judiciais)))
    const metrics = getHomeHeroMetrics(resumos, "live", {})
    assert.equal(metrics.totalProcessos, 7 + 4)
    assert.equal(metrics.totalProcessosDisciplinares, 6)
  })

  it("a home e a /uf mostram a parte disciplinar e o aviso; as listas repassam as partes à grade", () => {
    const home = readFileSync("src/app/(site)/2o-turno/page.tsx", "utf8")
    assert.match(home, /totalProcessosDisciplinares/)
    assert.match(home, /PROCESSO_DISCIPLINAR_AVISO/)
    assert.match(readFileSync("src/app/(site)/uf/[uf]/page.tsx", "utf8"), /PROCESSO_DISCIPLINAR_AVISO/)
    for (const path of ["src/app/(site)/2o-turno/page.tsx", "src/app/(site)/uf/[uf]/page.tsx", "src/app/(site)/uf/[uf]/senado/page.tsx"]) {
      assert.match(readFileSync(path, "utf8"), /processosContagem=\{processosContagem\}/, path)
    }
  })

  it("os resources de lista e do comparador aplicam a contagem única fora do cache", () => {
    const api = readFileSync("src/lib/api.ts", "utf8")
    assert.match(api, /data: aplicarProcessosJusticaAosResumos\(cached\.data\)/)
    assert.match(api, /data: aplicarProcessosJusticaAosComparaveis\(cached\.data\)/)
  })
})

/** Linhas brutas de `processos`: uma com fonte do tribunal, uma com selo de confirmação e uma sem fonte publicável. */
const LINHAS_FLAVIO = [
  { id: "p-oficial", candidato_id: "id-flavio-bolsonaro", numero_processo: "HC 201965", url_fonte: "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=HC&numeroProcesso=201965" },
  { id: "p-confirmacao", candidato_id: "id-flavio-bolsonaro", numero_processo: null, url_fonte: "https://www.exemplo-noticia.com.br/politica/materia-sobre-o-processo-2026?id=9" },
  { id: "p-sem-fonte", candidato_id: "id-flavio-bolsonaro", numero_processo: null, url_fonte: null },
]

/** Os três caminhos de uma superfície, todos a partir das mesmas linhas e do mesmo critério. */
function superficies(criterio: CriterioContagemProcessos) {
  const slug = "flavio-bolsonaro"
  // Ficha: a API filtra as linhas públicas e o KPI conta essa lista.
  const fichaKpi = kpiDaFicha(slug, filtrarProcessosJudiciaisContaveis(LINHAS_FLAVIO, criterio).length, criterio)
  // Grade: o resumo conta as linhas no banco e aplica a parte disciplinar depois do cache.
  const judiciaisDoResumo = contarProcessosJudiciaisPorCandidato(LINHAS_FLAVIO, criterio).get("id-flavio-bolsonaro") ?? 0
  const resumos = aplicarProcessosJusticaAosResumos([resumoJudicial(slug, "Presidente", judiciaisDoResumo)], criterio)
  const maps = buildCandidatoGridMaps(resumos)
  const card = numeroDoAtributo(
    renderToStaticMarkup(
      <CandidatoCard candidato={resumos[0].candidato} processos={maps.processos[slug]} processosContagem={maps.processosContagem[slug]} patrimonio={null} index={0} />,
    ),
    "data-pf-card-processos",
  )
  const hero = getHomeHeroMetrics(resumos, "live", SENADO_ON).totalProcessos
  return { fichaKpi, card, hero, contagem: contarProcessosJusticaDasLinhas(slug, LINHAS_FLAVIO, criterio) }
}

describe("critério de contagem: ponto de extensão único", () => {
  it("o critério padrão reproduz a regra de hoje (nivelFonteProcesso: oficial ou em confirmação)", () => {
    assert.deepEqual(LINHAS_FLAVIO.map(incluirProcessoJudicialPadrao), [true, true, false])
    // Disciplinar: todo item aprovado no dataset entra, como hoje.
    for (const caso of CASOS) {
      const aprovados = getRepresentacoesEticaAprovadas(caso.slug)
      assert.ok(aprovados.every(incluirProcessoDisciplinarPadrao))
      assert.equal(getProcessosDisciplinaresContaveis(caso.slug), aprovados)
    }
    assert.deepEqual(
      filtrarProcessosJudiciaisContaveis(LINHAS_FLAVIO).map((linha) => [linha.id, linha.fonte_nivel]),
      [["p-oficial", "oficial"], ["p-confirmacao", "em_confirmacao"]],
    )
    const hoje = superficies(CRITERIO_CONTAGEM_PROCESSOS)
    assert.deepEqual({ fichaKpi: hoje.fichaKpi, card: hoje.card, hero: hoje.hero }, { fichaKpi: 8, card: 8, hero: 8 })
    assert.deepEqual(hoje.contagem, { judiciais: 2, disciplinaresSenado: 6, disciplinaresCamara: 0, disciplinares: 6, total: 8 })
  })

  it("trocar o predicado muda card da listagem, KPI da ficha e hero juntos", () => {
    const soOficiais: CriterioContagemProcessos = {
      ...CRITERIO_CONTAGEM_PROCESSOS,
      incluirJudicial: (processo) => incluirProcessoJudicialPadrao(processo) && processo.id !== "p-confirmacao",
    }
    const semDisciplinares: CriterioContagemProcessos = { ...CRITERIO_CONTAGEM_PROCESSOS, incluirDisciplinar: () => false }

    const a = superficies(soOficiais)
    assert.deepEqual({ fichaKpi: a.fichaKpi, card: a.card, hero: a.hero }, { fichaKpi: 7, card: 7, hero: 7 })

    const b = superficies(semDisciplinares)
    assert.deepEqual({ fichaKpi: b.fichaKpi, card: b.card, hero: b.hero }, { fichaKpi: 2, card: 2, hero: 2 })
    assert.equal(b.contagem.disciplinares, 0)
  })

  it("nenhuma superfície reimplementa o filtro: só o módulo da contagem chama nivelFonteProcesso ou lê o dataset disciplinar", () => {
    const permitidos = new Set([
      join("src", "lib", "djen-consulta-url.ts"),
      join("src", "lib", "processos-justica-candidato.ts"),
      join("src", "lib", "representacoes-etica.ts"),
    ])
    const arquivos: string[] = []
    const visitar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) visitar(caminho)
        else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho)
      }
    }
    visitar("src")
    const violacoes = arquivos.filter((arquivo) => {
      if (permitidos.has(arquivo)) return false
      const fonte = readFileSync(arquivo, "utf8")
      return /nivelFonteProcesso\(/.test(fonte) || /getRepresentacoesEticaAprovadas\b/.test(fonte)
    })
    assert.deepEqual(violacoes, [])
  })
})
