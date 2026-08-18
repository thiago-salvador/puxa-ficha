import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import { ProfileOverview } from "@/components/ProfileOverview"
import { EmbedWidget } from "@/components/EmbedWidget"
import type { PatrimonioEleicaoPublico } from "@/lib/public-profile-dto"
import type { FichaCandidato, Financiamento, HistoricoPolitico, Patrimonio } from "@/lib/types"

/* ─── Fixtures ──────────────────────────────────── */

const FONTE_BEM_CANDIDATO_2014 =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip"

function patrimonioRow(partial: Partial<Patrimonio> & Pick<Patrimonio, "id">): Patrimonio {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2010,
    valor_total: 150_000,
    bens: [{ tipo: "Imóvel", descricao: "Apartamento residencial", valor: 150_000 }],
    ...partial,
    id: partial.id,
  }
}

function financiamentoRow(partial: Partial<Financiamento> & Pick<Financiamento, "id">): Financiamento {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2022,
    total_arrecadado: 50_000,
    total_fundo_partidario: 10_000,
    total_fundo_eleitoral: 20_000,
    total_pessoa_fisica: 15_000,
    total_recursos_proprios: 5_000,
    maiores_doadores: [],
    ...partial,
    id: partial.id,
  }
}

function historicoRow(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "candidato-teste",
    cargo: "Deputado Federal",
    cargo_canonico: "Deputado Federal",
    tipo_evento: "mandato",
    periodo_inicio: 2014,
    periodo_fim: 2018,
    partido: "PCO",
    estado: "SP",
    eleito_por: "voto direto",
    observacoes: null,
    proveniencia: "tse",
    ...partial,
    id: partial.id,
  }
}

/** Série no formato do DTO público para o caso motivador (Rui Costa Pimenta). */
const ELEICOES_RUI: PatrimonioEleicaoPublico[] = [
  {
    ano: 2014,
    estado: "vazio_confirmado",
    fonte_url: FONTE_BEM_CANDIDATO_2014,
    verificado_em: "2026-08-07T18:27:03.374Z",
  },
  { ano: 2010, estado: "publicado", fonte_url: null, verificado_em: null },
  { ano: 2006, estado: "publicado", fonte_url: null, verificado_em: null },
]

function renderMoneyTab(args: {
  patrimonio: Patrimonio[]
  financiamento?: Financiamento[]
  historicoLength?: number
  patrimonioEleicoes?: PatrimonioEleicaoPublico[] | null
}) {
  return renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={args.patrimonio}
      financiamento={args.financiamento ?? []}
      historico={[]}
      gastos={[]}
      historicoLength={args.historicoLength ?? 0}
      suggestion={null}
      patrimonioEleicoes={args.patrimonioEleicoes}
    />,
  )
}

function buildFicha(partial: Partial<FichaCandidato> = {}): FichaCandidato {
  return {
    id: "candidato-teste",
    nome_completo: "Candidato Teste",
    nome_urna: "Candidato Teste",
    slug: "candidato-teste",
    data_nascimento: "1960-01-01",
    idade: 66,
    naturalidade: "São Paulo/SP",
    formacao: null,
    profissao_declarada: null,
    partido_atual: "PCO",
    partido_sigla: "PCO",
    cargo_atual: null,
    cargo_disputado: "Presidente",
    estado: "SP",
    status: "candidato",
    situacao_candidatura: null,
    biografia: null,
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: ["TSE"],
    ultima_atualizacao: "2026-08-07",
    historico: [],
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    processos: [],
    pontos_atencao: [],
    projetos_lei: [],
    legislacao_mandato_executivo: [],
    gastos_parlamentares: [],
    sancoes_administrativas: [],
    noticias: [],
    indicadores_estaduais: [],
    total_processos: 0,
    processos_criminais: 0,
    total_mudancas_partido: 0,
    total_pontos_atencao: 0,
    pontos_criticos: 0,
    total_sancoes: 0,
    ...partial,
  }
}

/* ─── MoneyTabSection ───────────────────────────── */

test("MoneyTabSection exibe vazio_confirmado com texto neutro, fonte oficial e data da verificação", () => {
  const html = renderMoneyTab({
    patrimonio: [
      patrimonioRow({ id: "pat-2010", ano_eleicao: 2010 }),
      patrimonioRow({ id: "pat-2006", ano_eleicao: 2006 }),
    ],
    patrimonioEleicoes: ELEICOES_RUI,
  })

  // Anos publicados continuam exibidos como antes (chart/seção de evolução).
  assert.ok(html.includes("Evolução patrimonial"), "anos publicados seguem na seção de evolução")

  // Bloco novo com estado explícito.
  assert.ok(html.includes('data-pf-patrimonio-eleicoes-sem-dado="1"'))
  assert.ok(html.includes("Eleições sem dado publicado"))
  assert.ok(html.includes('data-pf-patrimonio-eleicao="2014"'))
  assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="vazio_confirmado"'))
  assert.ok(html.includes("Sem bens declarados ao TSE em 2014"))
  assert.ok(html.includes("Verificado em 07/08/2026"), "verificado_em em formato curto pt-BR")
  assert.ok(html.includes(`href="${FONTE_BEM_CANDIDATO_2014}"`), "fonte_url vira link")
  assert.ok(html.includes("Fonte oficial"))
  assert.ok(!html.includes("Ainda não coletado"), "nenhum estado de pendência neste cenário")
})

test("MoneyTabSection exibe nao_coletado como pendência explícita sem insinuar ausência de bens", () => {
  const html = renderMoneyTab({
    patrimonio: [patrimonioRow({ id: "pat-2022", ano_eleicao: 2022 })],
    patrimonioEleicoes: [
      { ano: 2022, estado: "publicado", fonte_url: null, verificado_em: null },
      { ano: 2018, estado: "nao_coletado", fonte_url: null, verificado_em: null },
    ],
  })

  assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="nao_coletado"'))
  assert.ok(html.includes("Ainda não coletado"))
  assert.ok(html.includes("A coleta de bens da eleição de 2018 ainda não foi realizada"))
  assert.ok(
    html.includes("A ausência de dados aqui não significa ausência de bens"),
    "texto não pode insinuar que o candidato não tinha bens",
  )
  assert.ok(!html.includes("Fonte oficial"), "nao_coletado não tem fonte para exibir")
  assert.ok(!html.includes("Verificado em"), "nao_coletado não tem data de verificação")
})

test("MoneyTabSection lista eleições sem dado mesmo sem nenhum patrimônio publicado (caso Rui)", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    historicoLength: 3,
    patrimonioEleicoes: [ELEICOES_RUI[0]],
  })

  // Empty state existente permanece.
  assert.ok(html.includes("Nenhum patrimônio declarado no TSE"))
  // Eleição deixa de ser invisível.
  assert.ok(html.includes("Eleições sem dado publicado"))
  assert.ok(html.includes("Sem bens declarados ao TSE em 2014"))
  assert.ok(html.includes("Verificado em 07/08/2026"))
  assert.ok(html.includes(`href="${FONTE_BEM_CANDIDATO_2014}"`))
})

test("MoneyTabSection cobre o caminho com financiamento e sem patrimônio publicado", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [financiamentoRow({ id: "fin-2014" })],
    patrimonioEleicoes: [ELEICOES_RUI[0]],
  })

  assert.ok(html.includes("De onde vem o dinheiro"))
  assert.ok(
    html.includes("A fonte oficial foi conferida em todos os pleitos aplicáveis e não registra declaração de bens."),
  )
  assert.ok(html.includes("Sem bens declarados ao TSE em 2014"))
})

test("MoneyTabSection ordena eleições sem dado da mais recente para a mais antiga", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    patrimonioEleicoes: [
      { ano: 2006, estado: "nao_coletado", fonte_url: null, verificado_em: null },
      { ano: 2018, estado: "nao_coletado", fonte_url: null, verificado_em: null },
    ],
  })

  assert.ok(html.includes('data-pf-patrimonio-eleicoes-sem-dado="2"'))
  assert.ok(html.indexOf('data-pf-patrimonio-eleicao="2018"') >= 0)
  assert.ok(
    html.indexOf('data-pf-patrimonio-eleicao="2018"') < html.indexOf('data-pf-patrimonio-eleicao="2006"'),
    "2018 deve aparecer antes de 2006",
  )
})

/*
  Este teste congelava o defeito corrigido em 12/08: sem a série por eleição, o
  card afirmava a ausência na base do TSE. Série desconhecida não sustenta
  afirmação sobre a fonte oficial; o bloco por eleição segue ausente, que é o
  comportamento que o teste protegia de verdade.
*/
test("MoneyTabSection sem a prop patrimonioEleicoes não afirma ausência no TSE", () => {
  const html = renderMoneyTab({ patrimonio: [], financiamento: [], historicoLength: 3 })

  assert.ok(!html.includes("Eleições sem dado publicado"))
  assert.ok(!html.includes("data-pf-patrimonio-eleicoes-sem-dado"))
  assert.ok(!html.includes("Nenhum patrimônio declarado no TSE"))
  assert.ok(html.includes("Patrimônio ainda não coletado"))
})

/* ─── ProfileOverview ───────────────────────────── */

test("ProfileOverview mostra teaser de patrimônio com estado explícito quando não há bens publicados", () => {
  const ficha = buildFicha({
    historico: [historicoRow({ id: "hist-2014", periodo_inicio: 2014, periodo_fim: 2014 })],
  }) as FichaCandidato & { patrimonio_eleicoes: PatrimonioEleicaoPublico[] }
  ficha.patrimonio_eleicoes = [ELEICOES_RUI[0]]

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(html.includes("Patrimônio declarado"), "teaser continua nomeado como patrimônio")
  assert.ok(html.includes('data-pf-patrimonio-eleicoes-sem-dado="1"'))
  assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="vazio_confirmado"'))
  assert.ok(html.includes("2014"))
  assert.ok(html.includes("Sem bens declarados ao TSE"))
  assert.ok(html.includes("Eleições disputadas sem dado de patrimônio publicado"))
})

test("ProfileOverview exibe pendência nao_coletada no teaser sem insinuar ausência", () => {
  const ficha = buildFicha({
    historico: [historicoRow({ id: "hist-2018", periodo_inicio: 2018, periodo_fim: null })],
  }) as FichaCandidato & { patrimonio_eleicoes: PatrimonioEleicaoPublico[] }
  ficha.patrimonio_eleicoes = [
    { ano: 2018, estado: "nao_coletado", fonte_url: null, verificado_em: null },
  ]

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="nao_coletado"'))
  assert.ok(html.includes("Ainda não coletado"))
  assert.ok(!html.includes("Sem bens declarados ao TSE"))
})

/**
 * Correção R2 (2026-08-10). Este teste afirmava o contrário: que sem o campo
 * composto o teaser ficava OCULTO. Isso encodava o defeito, porque a ficha
 * montada sobre a view interna (preview, embed, readback) nunca traz o campo, e
 * ali a eleição disputada sumia da visão geral em vez de aparecer com estado.
 * Sem o campo composto e COM os insumos crus, a leitura canônica recompõe.
 */
test("ProfileOverview sem o campo composto recompõe a eleição a partir dos insumos crus", () => {
  const ficha = buildFicha({
    historico: [historicoRow({ id: "hist-2014" })],
  })

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(html.includes("Patrimônio declarado"), "a eleição de 2014 não pode sumir da visão geral")
  assert.ok(html.includes('data-pf-patrimonio-eleicoes-sem-dado="1"'))
  assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="nao_coletado"'))
})

test("ProfileOverview mantém teaser oculto quando não há eleição aplicável nem patrimônio", () => {
  const ficha = buildFicha({
    historico: [historicoRow({ id: "hist-2002", periodo_inicio: 2002, periodo_fim: 2006 })],
  })

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(
    !html.includes("Patrimônio declarado"),
    "2002 é anterior à série bem_candidato do TSE e não vira lacuna publicável",
  )
  assert.ok(!html.includes("data-pf-patrimonio-eleicoes-sem-dado"))
})

test("ProfileOverview com patrimônio publicado mantém o teaser tradicional sem bloco de ausência", () => {
  const ficha = buildFicha({
    patrimonio: [patrimonioRow({ id: "pat-2010", ano_eleicao: 2010 })],
  }) as FichaCandidato & { patrimonio_eleicoes: PatrimonioEleicaoPublico[] }
  ficha.patrimonio_eleicoes = ELEICOES_RUI

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(html.includes("Patrimônio declarado"))
  assert.ok(html.includes("Registro único disponível"), "teaser de registro único permanece igual")
  assert.ok(!html.includes("Eleições disputadas sem dado de patrimônio publicado"))
})

/* ─── EmbedWidget ───────────────────────────── */

test("EmbedWidget explicita vazio confirmado quando não há patrimônio publicado", () => {
  const ficha = buildFicha({
    patrimonio_ausencias_oficiais: [
      {
        ano_eleicao: 2014,
        fonte_url: FONTE_BEM_CANDIDATO_2014,
        verificado_em: "2026-08-07T18:27:03.374Z",
      },
    ],
    historico: [historicoRow({ id: "hist-2014", periodo_inicio: 2014, periodo_fim: 2014 })],
  })

  const html = renderToStaticMarkup(<EmbedWidget ficha={ficha} />)

  assert.ok(html.includes("N/D"), "sem valor para exibir")
  assert.ok(html.includes("2014: sem bens declarados ao TSE"), "eleição não fica invisível no embed")
})

test("EmbedWidget explicita coleta pendente para eleição TSE sem dado nem confirmação", () => {
  const ficha = buildFicha({
    historico: [historicoRow({ id: "hist-2018", periodo_inicio: 2018, periodo_fim: null })],
  })

  const html = renderToStaticMarkup(<EmbedWidget ficha={ficha} />)

  assert.ok(html.includes("2018: coleta de bens ainda não realizada"))
  assert.ok(!html.includes("sem bens declarados ao TSE"))
})

test("EmbedWidget com patrimônio publicado mantém o sub tradicional por ano", () => {
  const ficha = buildFicha({
    patrimonio: [patrimonioRow({ id: "pat-2010", ano_eleicao: 2010 })],
    historico: [historicoRow({ id: "hist-2014", periodo_inicio: 2014, periodo_fim: 2014 })],
  })

  const html = renderToStaticMarkup(<EmbedWidget ficha={ficha} />)

  assert.ok(html.includes("Ano 2010"))
  assert.ok(!html.includes("sem bens declarados ao TSE"))
  assert.ok(!html.includes("coleta de bens ainda não realizada"))
})

test("EmbedWidget de ficha nova não transforma coleções vazias em três zeros factuais", () => {
  const html = renderToStaticMarkup(
    <EmbedWidget
      ficha={buildFicha({
        total_processos: 0,
        processos_criminais: 0,
        processos_verificacao: null,
        total_mudancas_partido: 0,
        mudancas_partido: [],
        historico: [],
      })}
    />,
  )

  assert.ok(html.includes("Processos"))
  assert.ok(html.includes("não verificado"))
  assert.ok(html.includes("Trocas de partido"))
  assert.ok(html.includes("ainda não coletado"))
  assert.ok(html.includes("Histórico político (registros)"))
  assert.ok(!html.includes(">0<"), "ficha sem coleta não pode publicar zero factual")
})

test("EmbedWidget preserva zero judicial somente quando o escopo foi verificado", () => {
  const html = renderToStaticMarkup(
    <EmbedWidget
      ficha={buildFicha({
        total_processos: 0,
        processos_verificacao: {
          resultado: "vazio_confirmado",
          executado_em: "2026-08-13T00:00:00Z",
        },
      })}
    />,
  )

  assert.ok(html.includes(">0<"))
  assert.ok(html.includes("escopo verificado"))
})

test("EmbedWidget preserva contagem judicial positiva", () => {
  const html = renderToStaticMarkup(
    <EmbedWidget ficha={buildFicha({ total_processos: 2, processos_criminais: 1 })} />,
  )

  assert.ok(html.includes(">2<"))
  assert.ok(html.includes("1 criminal"))
})
