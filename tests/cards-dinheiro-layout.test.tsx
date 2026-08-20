import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import { ProfileOverview } from "@/components/ProfileOverview"
import type { PatrimonioEleicaoPublico } from "@/lib/public-profile-dto"
import type { FichaCandidato, Financiamento, GastoExecutivo, GastoParlamentar, Patrimonio } from "@/lib/types"
import { formatBRL, formatCompact } from "@/lib/utils"

/**
 * Itens 11 e 17 da triagem pré-lançamento: o card de patrimônio saía do padrão
 * dos demais cards de dinheiro. Duas causas medidas nas fichas do Hertz e da
 * Samara, ambas com um único registro publicado:
 *
 * - a grade da visão geral esticava o card curto até a altura do card de
 *   financiamento, deixando ~300px vazios dentro dele (356px de caixa para 60px
 *   de conteúdo, medido em 1280px);
 * - a aba Dinheiro desenhava um gráfico de barras de um dado só, que vira um
 *   bloco preto de largura inteira, e escondia a cifra num subtítulo de 13px
 *   enquanto financiamento mostrava a dele em 28px.
 */

/* ─── Fixtures ──────────────────────────────────── */

function patrimonioRow(partial: Partial<Patrimonio> & Pick<Patrimonio, "id">): Patrimonio {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2018,
    valor_total: 100_000,
    bens: [{ tipo: "Imóvel", descricao: "Apartamento residencial", valor: 100_000 }],
    ...partial,
    id: partial.id,
  }
}

function financiamentoRow(
  partial: Partial<Financiamento> & Pick<Financiamento, "id">,
): Financiamento {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2022,
    total_arrecadado: 26_000,
    total_fundo_partidario: 0,
    total_fundo_eleitoral: 0,
    total_pessoa_fisica: 0,
    total_recursos_proprios: 0,
    maiores_doadores: [],
    ...partial,
    id: partial.id,
  }
}

function gastoRow(partial: Partial<GastoParlamentar> & Pick<GastoParlamentar, "id">): GastoParlamentar {
  return {
    candidato_id: "candidato-teste",
    ano: 2025,
    total_gasto: 595_083,
    detalhamento: [],
    gastos_destaque: [],
    ...partial,
    id: partial.id,
  }
}

function gastoExecutivoRow(
  partial: Partial<GastoExecutivo> & Pick<GastoExecutivo, "id" | "mes_extrato">,
): GastoExecutivo {
  return {
    candidato_id: "candidato-teste",
    orgao_codigo: "20101",
    orgao_nome: "Presidência da República",
    ug_codigo: "110322",
    ug_nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
    valor_total: 100.1,
    qtd_transacoes: 2,
    qtd_portador_sigiloso: 2,
    qtd_portador_nominado: 0,
    qtd_portador_ausente: 0,
    qtd_estabelecimento_sigiloso: 2,
    qtd_estabelecimento_nominado: 0,
    qtd_estabelecimento_ausente: 0,
    fonte: "https://portaldatransparencia.gov.br/cartoes",
    coletado_em: "2026-08-16T04:00:00.000Z",
    ...partial,
    id: partial.id,
    mes_extrato: partial.mes_extrato,
  }
}

function renderMoneyTab(args: {
  patrimonio: Patrimonio[]
  financiamento?: Financiamento[]
  gastos?: GastoParlamentar[]
  gastosExecutivo?: GastoExecutivo[]
  patrimonioEleicoes?: PatrimonioEleicaoPublico[] | null
  expandAllForAudit?: boolean
}) {
  return renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={args.patrimonio}
      financiamento={args.financiamento ?? []}
      historico={[]}
      gastos={args.gastos ?? []}
      gastosExecutivo={args.gastosExecutivo ?? []}
      historicoLength={0}
      suggestion={null}
      patrimonioEleicoes={args.patrimonioEleicoes}
      expandAllForAudit={args.expandAllForAudit}
    />,
  )
}

function buildFicha(partial: Partial<FichaCandidato> = {}): FichaCandidato {
  return {
    id: "candidato-teste",
    nome_completo: "Candidato Teste",
    nome_urna: "Candidato Teste",
    slug: "candidato-teste",
    data_nascimento: "1970-01-01",
    idade: 56,
    naturalidade: "São Luís/MA",
    formacao: null,
    profissao_declarada: null,
    partido_atual: "PSTU",
    partido_sigla: "PSTU",
    cargo_atual: null,
    cargo_disputado: "Presidente",
    estado: "MA",
    status: "candidato",
    situacao_candidatura: null,
    biografia: null,
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: ["TSE"],
    ultima_atualizacao: "2026-08-09",
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

/** Marcador do `PatrimonioChart`: a coluna de fundo tem altura fixa de 120px. */
const MARCADOR_DO_GRAFICO = "height:120px"

/* ─── Aba Dinheiro ──────────────────────────────── */

test("registro único de patrimônio não desenha gráfico de barra sozinha", () => {
  const html = renderMoneyTab({ patrimonio: [patrimonioRow({ id: "pat-2018" })] })

  assert.ok(
    !html.includes(MARCADOR_DO_GRAFICO),
    "uma barra só é um bloco chapado de largura inteira, não uma comparação",
  )
  assert.ok(html.includes(formatBRL(100_000)), "a cifra continua visível sem o gráfico")
})

test("duas ou mais declarações mantêm o gráfico de evolução", () => {
  const html = renderMoneyTab({
    patrimonio: [
      patrimonioRow({ id: "pat-2018", ano_eleicao: 2018 }),
      patrimonioRow({ id: "pat-2022", ano_eleicao: 2022, valor_total: 150_000 }),
    ],
  })

  assert.ok(html.includes(MARCADOR_DO_GRAFICO), "com série real o gráfico permanece")
  assert.ok(html.includes("Evolução patrimonial"))
})

test("declaração sem detalhamento de bens ainda publica o valor", () => {
  const html = renderMoneyTab({
    patrimonio: [patrimonioRow({ id: "pat-2018", bens: [] })],
  })

  assert.ok(
    html.includes('data-pf-patrimonio-valor="2018"'),
    "sem bens não há accordion, e sem o card o valor sumiria junto com o gráfico",
  )
  assert.ok(html.includes(formatBRL(100_000)))
  assert.ok(html.includes("não traz detalhamento de bens"))
  assert.ok(
    html.includes('data-pf-timeline-ref="patrimonio-pat-2018"'),
    "o alvo de scroll da timeline não pode se perder na troca de card",
  )
})

test("a ordem é do ano, não do formato de card", () => {
  // O card sem detalhamento e o accordion são formatos diferentes para o mesmo
  // tipo de linha. Escolher o componente numa passada separada agrupava por
  // formato e mandava uma declaração antiga para cima de uma recente.
  const html = renderMoneyTab({
    patrimonio: [
      patrimonioRow({ id: "pat-2010", ano_eleicao: 2010, bens: [] }),
      patrimonioRow({ id: "pat-2014", ano_eleicao: 2014 }),
      patrimonioRow({ id: "pat-2018", ano_eleicao: 2018, bens: [] }),
      patrimonioRow({ id: "pat-2022", ano_eleicao: 2022 }),
    ],
  })

  const ordemRenderizada = [...html.matchAll(/data-pf-timeline-ref="patrimonio-pat-(\d{4})"/g)].map(
    (m) => Number(m[1]),
  )

  assert.deepEqual(
    ordemRenderizada,
    [2022, 2018, 2014, 2010],
    "mais recente primeiro, alternando os dois formatos de card",
  )
})

test("cada declaração tem exatamente um alvo de scroll da timeline", () => {
  const html = renderMoneyTab({
    patrimonio: [
      patrimonioRow({ id: "pat-2018", ano_eleicao: 2018, bens: [] }),
      patrimonioRow({ id: "pat-2022", ano_eleicao: 2022 }),
    ],
  })

  for (const id of ["pat-2018", "pat-2022"]) {
    assert.equal(
      (html.match(new RegExp(`data-pf-timeline-ref="patrimonio-${id}"`, "g")) ?? []).length,
      1,
      `${id} não pode ter dois elementos disputando o mesmo alvo`,
    )
  }
})

test("cada card financeiro publica tipo, ano e estado para o auditor DOM", () => {
  const html = renderMoneyTab({
    patrimonio: [patrimonioRow({ id: "pat-2018", ano_eleicao: 2018 })],
    financiamento: [financiamentoRow({ id: "fin-2022", ano_eleicao: 2022 })],
    gastos: [gastoRow({ id: "gasto-2025", ano: 2025 })],
  })

  assert.match(
    html,
    /data-pf-money-card="patrimonio" data-pf-money-card-year="2018" data-pf-money-card-state="publicado"/,
  )
  assert.match(
    html,
    /data-pf-money-card="financiamento" data-pf-money-card-year="2022" data-pf-money-card-state="publicado"/,
  )
  assert.match(
    html,
    /data-pf-money-card="gasto" data-pf-money-card-year="2025" data-pf-money-card-state="publicado"/,
  )
})

test("gastos do Executivo são institucionais, mensais e totalizados sem atribuição pessoal", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    gastosExecutivo: [
      gastoExecutivoRow({ id: "ge-jan", mes_extrato: "2026-01-01", valor_total: 100.1 }),
      gastoExecutivoRow({ id: "ge-fev", mes_extrato: "2026-02-01", valor_total: 200.2 }),
    ],
  })

  assert.ok(html.includes("Gastos da estrutura de governo"))
  assert.ok(html.includes('id="gastos-estrutura-governo"'))
  assert.equal(html.includes("Gastos do Candidato Teste"), false)
  assert.equal(html.includes("gastos do Lula"), false)
  assert.ok(html.includes("Portal da Transparência"))
  assert.ok(html.includes(formatBRL(300.3)), "o total do mandato precisa somar a série mensal")
  assert.ok(html.includes('href="https://portaldatransparencia.gov.br/cartoes"'))
  assert.ok(html.includes("coleta em"))

  const mandato = html.indexOf('data-pf-gastos-executivo-total-mandato')
  const ano = html.indexOf('data-pf-gastos-executivo-total-ano')
  const ultimo = html.indexOf('data-pf-gastos-executivo-ultimo-mes')
  assert.ok(mandato >= 0 && ano >= 0 && ultimo >= 0, "os três totais do recorte precisam aparecer")
  assert.ok(mandato < ano && ano < ultimo, "ordem: mandato, ano civil corrente, último mês com movimento")

  const ordem = [...html.matchAll(/data-pf-gasto-executivo-mes="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(ordem, ["2026-02-01", "2026-01-01"])
})

test("caixa de recorte explica o que o número é e o que não é, sem cifra viral", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    gastosExecutivo: [
      gastoExecutivoRow({ id: "ge-fev", mes_extrato: "2026-02-01", valor_total: 200.2 }),
    ],
  })

  assert.ok(html.includes('data-pf-gastos-executivo-recorte'))
  assert.ok(html.includes("O que este número é"))
  assert.ok(html.includes("O que este número não é"))
  assert.ok(html.includes("CPGF"))
  assert.ok(html.includes("Presidência da República"))
  assert.ok(html.includes("20101"))
  assert.ok(html.includes("Portal da Transparência"))
  assert.ok(html.includes("Cota parlamentar"))
  assert.ok(html.includes("CPDC"))
  assert.ok(html.includes("Doação de campanha"))
  assert.ok(html.includes("governo federal inteiro") || html.includes("Ministérios"))
  assert.ok(html.includes("download oficial mensal do CPGF"))
  assert.ok(html.includes("vale o CSV"))
  assert.match(html, /data-pf-gastos-executivo-portador-status/)
  assert.ok(html.includes("sigiloso"))
  assert.equal(html.includes(">Sigiloso<"), false)
  assert.ok(html.includes("misturam"))
  assert.equal(html.includes("WhatsApp"), false)
  assert.equal(html.includes("bilhões"), false)
  assert.equal(html.includes("bilhão"), false)
})

test("anos civis fechados mostram barra anual; meses ficam no ano aberto", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    gastosExecutivo: [
      gastoExecutivoRow({ id: "ge-2025", mes_extrato: "2025-06-01", valor_total: 80 }),
      gastoExecutivoRow({ id: "ge-jan", mes_extrato: "2026-01-01", valor_total: 100.1 }),
      gastoExecutivoRow({ id: "ge-fev", mes_extrato: "2026-02-01", valor_total: 200.2 }),
    ],
  })

  assert.ok(html.includes('data-pf-gastos-executivo-barras-ano'))
  assert.match(html, /data-pf-gastos-executivo-ano-bar="2025"/)
  assert.match(html, /data-pf-gastos-executivo-ano-bar="2026"/)
  assert.ok(html.includes('data-pf-gastos-executivo-barras-mes="2026"'))
  assert.equal(
    html.includes('data-pf-gastos-executivo-barras-mes="2025"'),
    false,
    "ano fechado não despeja barras mensais",
  )
  assert.equal(html.includes('data-pf-gasto-executivo-mes="2025-06-01"'), false)
  assert.ok(html.includes('data-pf-gasto-executivo-mes="2026-02-01"'))
})

test("ficha sem dado não renderiza a seção de gastos do Executivo", () => {
  const html = renderMoneyTab({ patrimonio: [], gastosExecutivo: [] })
  assert.equal(html.includes("Gastos da estrutura de governo"), false)
  assert.equal(html.includes('id="gastos-estrutura-governo"'), false)
})

test("bloco do órgão mostra composição por UG abaixo do total e portador como status medido", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    gastosExecutivo: [
      gastoExecutivoRow({
        id: "gsi-jan",
        mes_extrato: "2026-01-01",
        valor_total: 100,
        qtd_transacoes: 4,
        qtd_portador_sigiloso: 4,
        qtd_estabelecimento_sigiloso: 4,
      }),
      gastoExecutivoRow({
        id: "sg-jan",
        mes_extrato: "2026-01-01",
        valor_total: 50,
        ug_codigo: "110001",
        ug_nome: "SECRETARIA-GERAL/PR",
        qtd_transacoes: 2,
        qtd_portador_sigiloso: 1,
        qtd_portador_nominado: 1,
        qtd_estabelecimento_sigiloso: 2,
      }),
    ],
  })

  const mandato = html.indexOf("data-pf-gastos-executivo-total-mandato")
  const composicao = html.indexOf("data-pf-gastos-executivo-ug-composicao")
  assert.ok(mandato >= 0 && composicao > mandato, "total do órgão fica acima da composição por UG")
  assert.match(html, /data-pf-gastos-executivo-ug="110322"/)
  assert.match(html, /data-pf-gastos-executivo-ug="110001"/)
  assert.ok(html.includes("GABINETE DE SEGURANCA INSTITUCIONAL/PR"))
  assert.ok(html.includes("SECRETARIA-GERAL/PR"))
  assert.ok(html.includes(formatBRL(150)))
  assert.equal(html.includes("gastos do Lula"), false)
  assert.doesNotMatch(html, /[\u2013\u2014]/)
  assert.match(html, /data-pf-gastos-executivo-portador-status/)
  assert.ok(html.includes("Portador"))
  assert.ok(html.includes("sigiloso"))
  assert.ok(html.includes("identificado"))
  assert.equal(html.includes(">Sigiloso<"), false)
  assert.equal(html.includes("JOAO PORTADOR"), false, "portador é status, não lista de nomes")
})

test("dois órgãos no mesmo mês viram blocos separados, nunca uma soma misturada", () => {
  // Thread do CodeRabbit no PR #212: o schema permite mais de um órgão por
  // candidato e mês; somar séries de órgãos diferentes fabricaria um total
  // que não existe em nenhuma fonte.
  const html = renderMoneyTab({
    patrimonio: [],
    gastosExecutivo: [
      gastoExecutivoRow({ id: "ge-a", mes_extrato: "2026-01-01", valor_total: 100 }),
      gastoExecutivoRow({
        id: "ge-b",
        mes_extrato: "2026-01-01",
        valor_total: 40,
        orgao_codigo: "30000",
        orgao_nome: "Governo Estadual Fictício",
      }),
    ],
  })

  const blocos = [...html.matchAll(/data-pf-gastos-executivo-orgao="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(blocos.sort(), ["20101", "30000"])
  assert.ok(html.includes(formatBRL(100)), "total do primeiro órgão isolado")
  assert.ok(html.includes(formatBRL(40)), "total do segundo órgão isolado")
  assert.equal(html.includes(formatBRL(140)), false, "soma cruzada de órgãos não pode existir")
})

test("gastos parlamentares ficam em ordem cronológica estrita", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    gastos: [
      gastoRow({ id: "gasto-2021", ano: 2021 }),
      gastoRow({ id: "gasto-2025", ano: 2025 }),
      gastoRow({ id: "gasto-2023", ano: 2023 }),
    ],
  })
  const anos = [...html.matchAll(/data-pf-money-card="gasto" data-pf-money-card-year="(\d{4})"/g)].map(
    (match) => Number(match[1]),
  )
  assert.deepEqual(anos, [2025, 2023, 2021])
})

test("modo de auditoria torna todo o conteúdo financeiro visível no HTML", () => {
  const html = renderMoneyTab({
    patrimonio: [
      patrimonioRow({ id: "pat-2018", bens: [{ tipo: "Imóvel", descricao: "Casa", valor: 100_000 }] }),
      patrimonioRow({ id: "pat-2022", ano_eleicao: 2022, bens: [{ tipo: "Veículo", descricao: "Carro", valor: 50_000 }] }),
    ],
    gastos: [
      gastoRow({
        id: "gasto-2025",
        detalhamento: [{ categoria: "passagens", valor: 12_345 }],
      }),
    ],
    expandAllForAudit: true,
  })

  assert.ok(html.includes("Casa"))
  assert.ok(html.includes("Carro"))
  assert.ok(html.includes("Passagens"))
  assert.equal((html.match(/aria-expanded="true"/g) ?? []).length, 3)
})

test("patrimônio e cota mostram a cifra na mesma altura tipográfica do financiamento", () => {
  const html = renderMoneyTab({
    patrimonio: [patrimonioRow({ id: "pat-2018" })],
    financiamento: [financiamentoRow({ id: "fin-2022" })],
    gastos: [gastoRow({ id: "gasto-2025" })],
  })

  // O card de financiamento sempre usou 24px no mobile e 28px acima dele.
  const cifrasGrandes = html.match(/text-\[24px\][^"]*sm:text-\[28px\]/g) ?? []
  assert.ok(
    cifrasGrandes.length >= 3,
    `patrimônio, financiamento e cota devem usar a mesma escala; achei ${cifrasGrandes.length}`,
  )
  assert.ok(html.includes(formatBRL(100_000)), "patrimônio em BRL, como os demais cards de dinheiro")
  assert.ok(html.includes(formatBRL(595_083)), "cota parlamentar em BRL")
})

/* ─── Visão geral ───────────────────────────────── */

test("a grade da visão geral não estica card curto até a altura do vizinho", () => {
  const ficha = buildFicha({
    patrimonio: [patrimonioRow({ id: "pat-2018" })],
    financiamento: [financiamentoRow({ id: "fin-2022" })],
  })

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.match(
    html,
    /class="grid grid-cols-1 items-start gap-6 md:grid-cols-2"/,
    "sem items-start a caixa do card curto cresce até o card denso ao lado",
  )
  assert.ok(html.includes('data-pf-money-overview-card="patrimonio"'))
  assert.ok(html.includes('data-pf-money-overview-card="financiamento"'))
  assert.equal(
    (html.match(/data-pf-money-overview-content=/g) ?? []).length,
    2,
    "cada card financeiro expõe uma caixa de conteúdo para medir espaço inferior",
  )
})

test("resumo de cota parlamentar expõe marcador auditável", () => {
  const ficha = buildFicha({ gastos_parlamentares: [gastoRow({ id: "gasto-2025" })] })
  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(html.includes('data-pf-money-overview-card="gasto"'))
  assert.ok(html.includes(formatCompact(595_083)))
})

test("teaser de registro único abre pelo contexto e só depois mostra a cifra", () => {
  const ficha = buildFicha({ patrimonio: [patrimonioRow({ id: "pat-2018" })] })

  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  const contexto = html.indexOf("Declarado em 2018")
  const escopo = html.indexOf("Registro único disponível")
  const cifra = html.indexOf(formatCompact(100_000))

  assert.ok(contexto >= 0 && escopo >= 0 && cifra >= 0, "as três linhas continuam publicadas")
  assert.ok(
    contexto < escopo && escopo < cifra,
    "mesma ordem de leitura do card de financiamento: pleito, escopo, valor",
  )
})

test("Visão Geral mostra o card de gastos da estrutura de governo quando há série", () => {
  const ficha = buildFicha({
    gastos_executivo: [
      gastoExecutivoRow({ id: "ge-2025", mes_extrato: "2025-12-01", valor_total: 40 }),
      gastoExecutivoRow({ id: "ge-jan", mes_extrato: "2026-01-01", valor_total: 100.1 }),
      gastoExecutivoRow({ id: "ge-fev", mes_extrato: "2026-02-01", valor_total: 200.2 }),
    ],
  })
  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)
  assert.ok(html.includes("Gastos da estrutura de governo"))
  assert.equal(html.includes("Gastos do Candidato Teste"), false)
  assert.ok(html.includes("Presidência da República"))
  assert.ok(html.includes(formatCompact(340.3)))
  assert.ok(html.includes(formatCompact(300.3)))
  assert.ok(html.includes(formatCompact(200.2)))

  const mandato = html.indexOf('data-pf-gastos-executivo-total-mandato')
  const ano = html.indexOf('data-pf-gastos-executivo-total-ano')
  const ultimo = html.indexOf('data-pf-gastos-executivo-ultimo-mes')
  assert.ok(mandato >= 0 && ano >= 0 && ultimo >= 0, "os três totais cabem no card compacto")
  assert.ok(mandato < ano && ano < ultimo)
  assert.equal(html.includes("data-pf-gastos-executivo-barras-ano"), false)
  assert.equal(html.includes("data-pf-gastos-executivo-barras-mes"), false)
  assert.equal(html.includes("data-pf-gasto-executivo-mes="), false)
})

test("teaser de gastos do Executivo nunca soma órgãos diferentes numa cifra só", () => {
  const ficha = buildFicha({
    gastos_executivo: [
      // Órgão antigo (prefeitura): não pode entrar na cifra do headline.
      gastoExecutivoRow({
        id: "ge-pref",
        mes_extrato: "2024-06-01",
        valor_total: 5_000,
        orgao_codigo: "99001",
        orgao_nome: "Prefeitura de Teste",
      }),
      // Órgão do mandato mais recente: é o que o headline mostra.
      gastoExecutivoRow({ id: "ge-jan", mes_extrato: "2026-01-01", valor_total: 100.1 }),
      gastoExecutivoRow({ id: "ge-fev", mes_extrato: "2026-02-01", valor_total: 200.2 }),
    ],
  })
  const html = renderToStaticMarkup(<ProfileOverview ficha={ficha} onNavigateTab={() => {}} />)

  assert.ok(html.includes(formatCompact(300.3)), "headline é o total do órgão mais recente")
  assert.equal(
    html.includes(formatCompact(5_300.3)),
    false,
    "a soma cruzada dos dois órgãos nunca aparece",
  )
  assert.ok(html.includes("Presidência da República"), "o nome citado é o do órgão somado")
  assert.ok(html.includes("+1 outro órgão detalhado"), "o outro órgão é apontado para a aba Dinheiro")
  assert.ok(html.includes('data-pf-gastos-executivo-total-mandato'))
})

test("Visão Geral sem série de gastos do Executivo não mostra o card", () => {
  const html = renderToStaticMarkup(
    <ProfileOverview ficha={buildFicha({})} onNavigateTab={() => {}} />,
  )
  assert.equal(html.includes("Gastos da estrutura de governo"), false)
})
