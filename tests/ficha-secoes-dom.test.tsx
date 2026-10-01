/**
 * Cobertura de DOM de cada seção que a ficha mostra: para cada uma, o teste
 * prova que o conteúdo aparece quando há dado e que o estado vazio é honesto
 * (diz o que falta ou não aparece), nunca um zero ou "nada consta" inventado.
 * Seções com carga diferida na ficha (Dinheiro, Programa) são renderizadas
 * pelo mesmo componente que a aba monta.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import rawChecagens from "../scripts/data/checagens-atribuidas.json"
import rawRecibos from "../scripts/data/checagens-recibos.json"
import rawRepresentacoes from "../scripts/data/representacoes-conselho-etica.json"
import { CandidatoProfile } from "../src/components/CandidatoProfile"
import { MoneyTabSection } from "../src/components/CandidatoProfileSections"
import { ProgramaGovernoTab } from "../src/components/ProgramaGovernoSection"
import { getReciboChecagens } from "../src/lib/buscas-recibos"
import { getApprovedAttributedFactChecks } from "../src/lib/checagens-atribuidas"
import type { CompromissoEvidenciaPublica, EstadoEvidenciasPrograma } from "../src/lib/compromisso-evidencia"
import { toProgramaGovernoManifestoPublico } from "../src/lib/programa-governo"
import { getRepresentacoesEticaAprovadas } from "../src/lib/representacoes-etica"
import type { CandidatoProfileTabId } from "../src/lib/candidato-profile-tabs"
import type {
  Financiamento,
  FichaCandidato,
  GastoParlamentar,
  Patrimonio,
  Processo,
  VotoCandidato,
} from "../src/lib/types"
import { compromissoEvidenciaCopy } from "../src/lib/ui-labels"

function fichaCom(parcial: Partial<FichaCandidato> = {}): FichaCandidato {
  return {
    id: "cand-secoes",
    slug: "ficha-secoes-teste",
    nome: "Ficha Secoes Teste",
    nome_urna: "Ficha Secoes Teste",
    partido: "TESTE",
    estado: "SP",
    cargo_disputado: "Deputado Federal",
    pontos_atencao: [],
    sancoes_administrativas: [],
    processos: [],
    historico: [],
    patrimonio: [],
    patrimonio_ausencias_oficiais: [],
    votos: [],
    mudancas_partido: [],
    financiamento: [],
    gastos_parlamentares: [],
    projetos_lei: [],
    sancoes_verificacao: null,
    processos_verificacao: null,
    trajetoria_verificacao: null,
    votacoes_verificacao: null,
    ...parcial,
  } as unknown as FichaCandidato
}

function renderAba(ficha: FichaCandidato, aba: CandidatoProfileTabId): string {
  return renderToStaticMarkup(<CandidatoProfile ficha={ficha} initialTab={aba} />)
}

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
}

/** Texto do painel da aba ativa, sem cabeçalho nem faixa de indicadores. */
function painel(html: string): string {
  const inicio = html.indexOf('role="tabpanel"')
  assert.ok(inicio >= 0, "painel da aba ausente")
  return texto(html.slice(inicio))
}

function campoGeral(html: string, chave: string): string {
  const match = html.match(new RegExp(`data-pf-candidate-general-field="${chave}"[^>]*>([\\s\\S]*?)</dl>`))
  assert.ok(match, `campo ${chave} ausente`)
  return texto(match[1]).trim()
}

function renderDinheiro(parcial: {
  patrimonio?: Patrimonio[]
  financiamento?: Financiamento[]
  gastos?: GastoParlamentar[]
  gastosFreshness?: "not_applicable" | null
}): string {
  return texto(
    renderToStaticMarkup(
      <MoneyTabSection
        patrimonio={parcial.patrimonio ?? []}
        patrimonioEleicoes={[]}
        financiamento={parcial.financiamento ?? []}
        doadoresRecorrentes={null}
        financiamentoEleicoes={[]}
        historico={[]}
        gastos={parcial.gastos ?? []}
        transparencia={[]}
        gastosExecutivo={[]}
        historicoLength={0}
        suggestion={null}
        highlightTimelineRef={null}
        freshness={
          parcial.gastosFreshness
            ? { gastos_parlamentares: { status: parcial.gastosFreshness } as never }
            : undefined
        }
      />,
    ),
  )
}

const FINANCIAMENTO: Financiamento = {
  id: "fin-2022",
  candidato_id: "cand-secoes",
  ano_eleicao: 2022,
  cargo_candidatura: "Deputado Federal",
  total_arrecadado: 500_000,
  total_fundo_partidario: 100_000,
  total_fundo_eleitoral: 300_000,
  total_pessoa_fisica: 80_000,
  total_recursos_proprios: 20_000,
  maiores_doadores: [],
} as Financiamento

const PATRIMONIO: Patrimonio[] = [
  { id: "pat-2018", candidato_id: "cand-secoes", ano_eleicao: 2018, valor_total: 200_000, bens: [{ tipo: "Casa", descricao: "Casa residencial", valor: 200_000 }] },
  { id: "pat-2022", candidato_id: "cand-secoes", ano_eleicao: 2022, valor_total: 300_000, bens: [{ tipo: "Casa", descricao: "Casa residencial", valor: 300_000 }] },
]

const GASTO: GastoParlamentar = {
  id: "gasto-2024",
  candidato_id: "cand-secoes",
  ano: 2024,
  total_gasto: 123_456,
  detalhamento: [],
  gastos_destaque: [],
  fonte: "Câmara dos Deputados",
} as GastoParlamentar

const PROCESSO: Processo = {
  id: "proc-1",
  candidato_id: "cand-secoes",
  tipo: "improbidade",
  tribunal: "TJSP",
  numero_processo: "1000001-08.2020.8.26.0053",
  descricao: "Ação de improbidade administrativa de teste",
  status: "em_andamento",
  data_inicio: "2020-03-01",
  data_decisao: null,
  gravidade: "media",
  fonte: "TJSP",
  url_fonte: "https://esaj.tjsp.jus.br/cpopg/show.do?processo.numero=1000001-08.2020.8.26.0053",
}

const VOTO: VotoCandidato = {
  id: "voto-1",
  candidato_id: "cand-secoes",
  votacao_id: "votacao-1",
  voto: "sim",
  contradicao: false,
  contradicao_descricao: null,
  votacao: {
    id: "votacao-1",
    titulo: "Reforma tributária de teste",
    descricao: "Votação de teste",
    data_votacao: "2023-07-06",
    casa: "Câmara",
    tema: "Economia",
    impacto_popular: "Teste",
  },
}

describe("ficha: situação e cargo (Visão Geral)", () => {
  test("presentes quando a ficha traz o dado", () => {
    const html = renderAba(fichaCom({ situacao_candidatura: "APTO" } as Partial<FichaCandidato>), "geral")
    assert.match(campoGeral(html, "situacao-candidatura"), /APTO/i)
    assert.match(campoGeral(html, "cargo-disputado"), /Deputado Federal/i)
  })

  test("vazio honesto: dizem Não informado em vez de sumir ou inventar", () => {
    const html = renderAba(fichaCom({ situacao_candidatura: null, cargo_disputado: null } as unknown as Partial<FichaCandidato>), "geral")
    assert.equal(campoGeral(html, "situacao-candidatura"), "Julgamento do registro Desconhecido")
    assert.equal(campoGeral(html, "cargo-disputado"), "Cargo disputado Não informado")
  })
})

describe("ficha: financiamento e patrimônio (Dinheiro)", () => {
  test("presentes com valor e ano", () => {
    const money = renderDinheiro({ patrimonio: PATRIMONIO, financiamento: [FINANCIAMENTO] })
    assert.match(money, /Evolução patrimonial/)
    assert.match(money, /R\$\s*300\.000/)
    assert.match(money, /2022/)
    assert.match(money, /R\$\s*500\.000/)
  })

  test("vazio honesto: sem pleito com bens e sem financiamento, sem valor zero", () => {
    const money = renderDinheiro({})
    assert.match(money, /Sem pleito com declaração de bens nesta ficha/)
    assert.doesNotMatch(money, /R\$\s*0(?![\d.,])/)
    const soPatrimonio = renderDinheiro({ patrimonio: PATRIMONIO })
    assert.match(soPatrimonio, /Sem financiamento de campanha nesta ficha/)
  })
})

describe("ficha: gastos parlamentares (Dinheiro)", () => {
  test("presentes com total do ano", () => {
    const money = renderDinheiro({ patrimonio: PATRIMONIO, gastos: [GASTO] })
    assert.match(money, /Gastos parlamentares/)
    assert.match(money, /R\$\s*123\.456/)
  })

  test("vazio honesto: sem dado a seção não aparece, e fora do escopo diz por quê", () => {
    assert.doesNotMatch(renderDinheiro({ patrimonio: PATRIMONIO }), /Gastos parlamentares/)
    const foraDoEscopo = renderDinheiro({ patrimonio: PATRIMONIO, gastosFreshness: "not_applicable" })
    assert.match(foraDoEscopo, /Gastos parlamentares/)
    assert.match(foraDoEscopo, /Não se aplica/)
    assert.doesNotMatch(foraDoEscopo, /R\$\s*0(?![\d.,])/)
  })
})

describe("ficha: processos (Justiça)", () => {
  test("presentes com descrição e tribunal", () => {
    const html = painel(renderAba(fichaCom({ processos: [PROCESSO], total_processos: 1 } as Partial<FichaCandidato>), "justica"))
    assert.match(html, /Processos judiciais \(1\)/)
    assert.match(html, /improbidade administrativa de teste/i)
    assert.match(html, /TJSP/)
  })

  test("vazio honesto: sem verificação não vira ficha limpa nem contagem zero", () => {
    const html = painel(renderAba(fichaCom(), "justica"))
    assert.match(html, /Processos judiciais ainda não verificados/)
    assert.match(html, /não significa ficha limpa/)
    assert.doesNotMatch(html, /Processos judiciais \(0\)/)
  })
})

describe("ficha: representações ao Conselho de Ética (Justiça)", () => {
  const itens = (rawRepresentacoes as { itens: Array<{ candidate_slug: string }> }).itens
  const comRepresentacao = itens.map((item) => item.candidate_slug).find((slug) => getRepresentacoesEticaAprovadas(slug).length > 0)

  test("presentes para ficha com representação aprovada", () => {
    assert.ok(comRepresentacao, "dataset sem representação aprovada")
    const html = renderAba(fichaCom({ slug: comRepresentacao }), "justica")
    assert.match(html, /data-pf-representacoes-etica="(camara|senado)"/)
    assert.match(html, /data-pf-representacao-etica=/)
  })

  test("vazio honesto: sem representação no acervo, nada afirma ausência", () => {
    const html = renderAba(fichaCom(), "justica")
    assert.doesNotMatch(html, /data-pf-representacoes-etica=/)
    assert.doesNotMatch(painel(html), /nenhuma representação|sem representações/i)
  })
})

describe("ficha: checagens atribuídas", () => {
  type Identidade = { candidate_id: string; candidate_slug: string; office: string; uf: string | null }
  const identidades = new Map<string, Identidade>()
  for (const check of rawChecagens as Identidade[]) identidades.set(check.candidate_slug, check)
  const casos = [...identidades.values()].map((identidade) => ({
    identidade,
    aprovadas: getApprovedAttributedFactChecks(identidade).length,
    recibo: getReciboChecagens(identidade),
  }))
  const recibos = (rawRecibos as { receipts: Array<{ candidate_slug: string; candidate_id: string }> }).receipts
  const reciboVazio = recibos
    .map((r) => ({ r, recibo: getReciboChecagens(r) }))
    .find(({ r, recibo }) => recibo?.result === "vazio_confirmado" && !identidades.has(r.candidate_slug))

  const fichaDe = (identidade: Identidade) =>
    fichaCom({
      id: identidade.candidate_id,
      slug: identidade.candidate_slug,
      cargo_disputado: identidade.office,
      estado: identidade.uf,
    } as Partial<FichaCandidato>)

  test("presentes com checagem publicada e texto de cobertura parcial", () => {
    const parcial = casos.find((caso) => caso.aprovadas > 0 && (caso.recibo?.naoResponderam.length ?? 0) > 0)
    assert.ok(parcial, "dataset sem ficha com checagem e cobertura parcial")
    const html = painel(renderAba(fichaDe(parcial.identidade), "checagens"))
    assert.match(html, /Checagens atribuídas/)
    assert.match(html, /não respond(?:eu|eram) nesta busca/)
  })

  test("vazio honesto: busca vazia diz que buscou; sem recibo a aba some", () => {
    assert.ok(reciboVazio, "dataset sem recibo vazio_confirmado")
    const vazia = painel(
      renderAba(
        fichaCom({ id: reciboVazio.r.candidate_id, slug: reciboVazio.r.candidate_slug, cargo_disputado: "Governador" } as Partial<FichaCandidato>),
        "checagens",
      ),
    )
    assert.match(vazia, /nenhuma checagem com o nome desta candidatura no título/)

    const semRecibo = renderAba(fichaCom({ cargo_disputado: "Governador" } as Partial<FichaCandidato>), "checagens")
    assert.doesNotMatch(semRecibo, /id="profile-tab-checagens"/)
    assert.doesNotMatch(semRecibo, /Checagens atribuídas/)
  })
})

describe("ficha: votações em destaque (Votos)", () => {
  test("presentes com título da votação e voto", () => {
    const html = renderAba(fichaCom({ votos: [VOTO] }), "votos")
    assert.match(html, /data-pf-voto-card/)
    assert.match(painel(html), /Reforma tributária de teste/)
  })

  test("vazio honesto: explica a ausência de mandato legislativo, sem contagem zero de votos", () => {
    const html = renderAba(fichaCom(), "votos")
    assert.match(html, /data-pf-votos-empty-state/)
    assert.match(painel(html), /Sem histórico legislativo estruturado/)
    assert.doesNotMatch(html, /data-pf-voto-card/)
  })
})

describe("ficha: promessa do programa e evidências relacionadas", () => {
  const manifesto = toProgramaGovernoManifestoPublico(
    JSON.parse(readFileSync("src/data/programas-governo/presidencia-2026/lula.json", "utf8")),
  )
  const tema = manifesto.resumo!.temas[0]
  // As evidências relacionadas moram no topo da aba Programa.
  const render = (evidencias: EstadoEvidenciasPrograma) =>
    renderToStaticMarkup(
      <ProgramaGovernoTab manifesto={manifesto} loadState="failed" response={null} onRetry={() => {}} evidencias={evidencias} />,
    )

  test("presente com vínculo publicado ao tema da promessa", () => {
    const evidencia: CompromissoEvidenciaPublica = {
      id: "e1",
      temaId: tema.id,
      tipo: "projeto_lei",
      relacao: "relacionada",
      referencia: "PL 1/2020",
      texto: "Ementa da proposição.",
      data: "2020",
      url: "https://www.camara.leg.br/x",
    }
    const html = render({ estado: "com_vinculos", itens: [evidencia], processadoEm: null })
    assert.match(html, /data-pf-compromisso-evidencias-estado="com_vinculos"/)
    assert.match(texto(html), /PL 1\/2020/)
  })

  test("vazio honesto: não processado e nenhum par dizem o que aconteceu", () => {
    const naoProcessado = render({ estado: "nao_processado" })
    assert.match(naoProcessado, /data-pf-compromisso-evidencias-vazio/)
    assert.ok(texto(naoProcessado).includes(texto(compromissoEvidenciaCopy.estado.nao_processado)))
    const nenhumPar = render({ estado: "nenhum_par", processadoEm: "2026-09-25T08:34:00Z" })
    assert.ok(texto(nenhumPar).includes(texto(compromissoEvidenciaCopy.estado.nenhum_par)))
  })
})
