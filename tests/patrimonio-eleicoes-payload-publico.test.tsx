/**
 * Regressão R2: a ficha pública não renderiza o objeto que `getCandidatoBySlug`
 * monta, e sim o payload que `/api/candidato-profile/[slug]` devolve, que é
 * `toPublicCandidatoProfileDto(ficha)`.
 *
 * O DTO publica a série derivada (`patrimonio_eleicoes`) e NÃO publica os
 * insumos crus dela (`patrimonio_ausencias_oficiais`). Enquanto a ficha
 * recompunha a série no cliente, ela recompunha sem os insumos e rebaixava toda
 * ausência CONFERIDA no pacote oficial do TSE para "ainda não coletado",
 * perdendo fonte e data no caminho. Em 2026-08-10 o readback contou 39 das 194
 * fichas públicas nesse estado, e nenhuma das 61 ausências confirmadas chegava
 * ao DOM com prova.
 *
 * Estes testes atravessam a mesma fronteira que a produção atravessa: montam a
 * ficha do servidor, passam pelo DTO e renderizam o componente REAL sobre o
 * resultado. Medir a função sem cruzar o DTO é o que deixou o defeito passar.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CandidatoProfile } from "@/components/CandidatoProfile"
import {
  buildPatrimonioEleicoes,
  resolvePatrimonioEleicoes,
  toPublicCandidatoProfileDto,
} from "@/lib/public-profile-dto"
import type {
  FichaCandidato,
  HistoricoPolitico,
  Patrimonio,
  PatrimonioAusenciaOficial,
} from "@/lib/types"

const VERIFICADO_EM = "2026-08-07T18:27:03.374Z"

function fonteBemCandidato(ano: number) {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`
}

function patrimonioRow(id: string, ano: number): Patrimonio {
  return {
    id,
    candidato_id: "cand-1",
    ano_eleicao: ano,
    valor_total: 120_000,
    bens: [{ tipo: "Imóvel", descricao: "Apartamento residencial", valor: 120_000 }],
  }
}

function ausenciaRow(ano: number): PatrimonioAusenciaOficial {
  return {
    ano_eleicao: ano,
    fonte_url: fonteBemCandidato(ano),
    verificado_em: VERIFICADO_EM,
  } as PatrimonioAusenciaOficial
}

/** Candidatura oficial do TSE: é ela que torna o ano aplicável. */
function candidaturaTse(id: string, ano: number, cargo: string): HistoricoPolitico {
  return {
    id,
    candidato_id: "cand-1",
    cargo,
    cargo_canonico: cargo,
    tipo_evento: "candidatura",
    periodo_inicio: ano,
    periodo_fim: ano + 4,
    partido: "PCO",
    estado: "SP",
    eleito_por: "voto direto",
    observacoes: null,
    proveniencia: "tse",
  }
}

function fichaDoServidor(partial: Partial<FichaCandidato>): FichaCandidato {
  const base = {
    id: "cand-1",
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
    patrimonio_ausencias_oficiais: [],
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
  } as FichaCandidato

  // `src/lib/api.ts` compõe a série UMA vez, com os três insumos completos.
  // Reproduzir isso aqui é o que torna o teste fiel ao caminho de produção.
  return {
    ...base,
    patrimonio_eleicoes: buildPatrimonioEleicoes(
      base.patrimonio ?? [],
      base.patrimonio_ausencias_oficiais ?? [],
      base.historico ?? [],
    ),
  }
}

/** O payload exato que o browser recebe da rota da ficha. */
function payloadDoCliente(ficha: FichaCandidato): FichaCandidato {
  return toPublicCandidatoProfileDto(ficha) as unknown as FichaCandidato
}

/**
 * A aba Dinheiro entra por `next/dynamic` (React.lazy por baixo): o primeiro
 * passe síncrono só alcança o fallback, e com o módulo resolvido o segundo
 * entrega o conteúdo real.
 */
async function renderAbaDinheiro(ficha: FichaCandidato): Promise<string> {
  await import("@/components/CandidatoProfileSections")
  let html = ""
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    html = renderToStaticMarkup(<CandidatoProfile ficha={ficha} initialTab="dinheiro" />)
    if (!html.includes("animate-pulse")) return html
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("aba Dinheiro não saiu do esqueleto de carregamento")
}

function estadoNoDom(html: string, ano: number): string | null {
  const match = html.match(
    new RegExp(`data-pf-patrimonio-eleicao="${ano}"\\s+data-pf-patrimonio-eleicao-estado="([a-z_]+)"`),
  )
  return match?.[1] ?? null
}

/* ─── Casos nomeados da nota PF Ajustes ──────────────────────────────── */

test("Rui Costa Pimenta (item 16): a ausência conferida de 2014 sobrevive ao payload do DTO", async () => {
  const ficha = fichaDoServidor({
    slug: "rui-costa-pimenta",
    patrimonio: [patrimonioRow("pat-2010", 2010), patrimonioRow("pat-2006", 2006)],
    patrimonio_ausencias_oficiais: [ausenciaRow(2014)],
    historico: [
      candidaturaTse("h-2014", 2014, "Presidente"),
      candidaturaTse("h-2010", 2010, "Presidente"),
      candidaturaTse("h-2006", 2006, "Presidente"),
    ],
  })

  const html = await renderAbaDinheiro(payloadDoCliente(ficha))

  assert.equal(
    estadoNoDom(html, 2014),
    "vazio_confirmado",
    "2014 tem ausência conferida no TSE e não pode virar pendência de coleta",
  )
  assert.ok(html.includes("Sem bens declarados ao TSE em 2014"))
  assert.ok(html.includes("Verificado em 07/08/2026"), "a data da verificação chega ao DOM")
  assert.ok(html.includes(`href="${fonteBemCandidato(2014)}"`), "a fonte oficial chega ao DOM")
  assert.ok(
    !html.includes("A coleta de bens da eleição de 2014 ainda não foi realizada"),
    "nenhuma frase de pendência para um ano já conferido",
  )
})

test("Hertz Dias (item 11): 2020 e 2022 conferidas continuam conferidas depois do DTO", async () => {
  const ficha = fichaDoServidor({
    slug: "hertz-dias",
    patrimonio: [patrimonioRow("pat-2018", 2018)],
    patrimonio_ausencias_oficiais: [ausenciaRow(2022), ausenciaRow(2020)],
    historico: [
      candidaturaTse("h-2022", 2022, "Governador"),
      candidaturaTse("h-2020", 2020, "Prefeito"),
      candidaturaTse("h-2018", 2018, "Deputado Federal"),
      candidaturaTse("h-2010", 2010, "Deputado Federal"),
    ],
  })

  const html = await renderAbaDinheiro(payloadDoCliente(ficha))

  assert.equal(estadoNoDom(html, 2022), "vazio_confirmado")
  assert.equal(estadoNoDom(html, 2020), "vazio_confirmado")
  // 2010 não tem nada no banco: a pendência de coleta ali é honesta e continua.
  assert.equal(
    estadoNoDom(html, 2010),
    "nao_coletado",
    "ano sem dado e sem conferência segue como pendência declarada",
  )
})

test("Samara Martins (item 17): 2020 conferida convive com 2022 publicado", async () => {
  const ficha = fichaDoServidor({
    slug: "samara-martins",
    patrimonio: [patrimonioRow("pat-2022", 2022)],
    patrimonio_ausencias_oficiais: [ausenciaRow(2020)],
    historico: [
      candidaturaTse("h-2022", 2022, "Deputado Federal"),
      candidaturaTse("h-2020", 2020, "Vereador"),
    ],
  })

  const html = await renderAbaDinheiro(payloadDoCliente(ficha))

  assert.equal(estadoNoDom(html, 2020), "vazio_confirmado")
  assert.ok(html.includes("Verificado em 07/08/2026"))
  assert.ok(
    html.includes('data-pf-patrimonio-eleicoes-sem-dado="1"'),
    "só 2020 entra na lista sem dado; 2022 segue publicado",
  )
  assert.equal(estadoNoDom(html, 2022), null, "2022 não pode aparecer como eleição sem dado")
})

test("Flávio Bolsonaro (item 9): as cinco eleições com bens declarados seguem no DOM", async () => {
  const anos = [2018, 2016, 2014, 2010, 2006]
  const ficha = fichaDoServidor({
    slug: "flavio-bolsonaro",
    patrimonio: anos.map((ano) => patrimonioRow(`pat-${ano}`, ano)),
    historico: anos.map((ano) => candidaturaTse(`h-${ano}`, ano, "Deputado Estadual")),
  })

  const html = await renderAbaDinheiro(payloadDoCliente(ficha))

  assert.ok(html.includes("Evolução patrimonial"), "a série publicada continua na aba")
  assert.ok(
    !html.includes("data-pf-patrimonio-eleicoes-sem-dado"),
    "nenhuma das cinco eleições tem lacuna, então não existe bloco de eleição sem dado",
  )
  for (const ano of anos) {
    assert.equal(estadoNoDom(html, ano), null, `${ano} não pode aparecer como eleição sem dado`)
  }
  // 2002 é anterior à série bem_candidato do TSE e não vira lacuna publicável.
  assert.equal(estadoNoDom(html, 2002), null)
})

/* ─── Ausência conferida sem nenhum patrimônio publicado ─────────────── */

test("ficha sem nenhum patrimônio publicado ainda mostra a ausência conferida, com fonte e data", async () => {
  const ficha = fichaDoServidor({
    slug: "so-ausencia",
    patrimonio: [],
    patrimonio_ausencias_oficiais: [ausenciaRow(2020)],
    historico: [candidaturaTse("h-2020", 2020, "Vereador")],
  })

  const html = await renderAbaDinheiro(payloadDoCliente(ficha))

  assert.equal(
    estadoNoDom(html, 2020),
    "vazio_confirmado",
    "gatear a seção em patrimonio.length > 0 sumia com a ausência que sabemos provar",
  )
  assert.ok(html.includes("Sem bens declarados ao TSE em 2020"))
  assert.ok(html.includes(`href="${fonteBemCandidato(2020)}"`))
  assert.ok(html.includes("Verificado em 07/08/2026"))
})

/* ─── Contrato do resolvedor ─────────────────────────────────────────── */

test("resolvePatrimonioEleicoes prefere a série composta e só recompõe sem ela", () => {
  const ficha = fichaDoServidor({
    patrimonio: [patrimonioRow("pat-2010", 2010)],
    patrimonio_ausencias_oficiais: [ausenciaRow(2014)],
    historico: [candidaturaTse("h-2014", 2014, "Presidente")],
  })

  const dto = payloadDoCliente(ficha)
  const doDto = resolvePatrimonioEleicoes(dto)
  assert.deepEqual(
    doDto,
    ficha.patrimonio_eleicoes,
    "o DTO propaga a série do servidor sem recompor",
  )
  assert.equal(doDto.find((e) => e.ano === 2014)?.fonte_url, fonteBemCandidato(2014))

  // Ficha montada à mão (readback, preview) não traz a série: aí recompõe.
  const { patrimonio_eleicoes: _omitida, ...semSerie } = ficha
  void _omitida
  const recomposta = resolvePatrimonioEleicoes(semSerie as FichaCandidato)
  assert.deepEqual(recomposta, ficha.patrimonio_eleicoes)
})

test("resolvePatrimonioEleicoes descarta entrada malformada em vez de inventar estado", () => {
  const eleicoes = resolvePatrimonioEleicoes({
    patrimonio: [],
    patrimonio_ausencias_oficiais: [],
    historico: [],
    patrimonio_eleicoes: [
      { ano: 2020, estado: "vazio_confirmado", fonte_url: null, verificado_em: null },
      { ano: "2018", estado: "publicado" },
      { ano: 2016, estado: "chutado" },
      null,
    ],
  })

  assert.deepEqual(eleicoes.map((e) => e.ano), [2020])
})

test("DTO público preserva a série financeira composta com ausência e erro", () => {
  const ficha = fichaDoServidor({
    financiamento_eleicoes: [
      {
        ano: 2008,
        estado: "ausencia_oficial",
        fonte_url: "https://dadosabertos.tse.jus.br/2008",
        verificado_em: "2026-08-10",
      },
      {
        ano: 2004,
        estado: "erro",
        fonte_url: "https://dadosabertos.tse.jus.br/2004",
        verificado_em: "2026-08-10",
        detalhe: "Layout sem SQ_CANDIDATO.",
      },
    ],
  })

  const dto = payloadDoCliente(ficha)
  assert.deepEqual(dto.financiamento_eleicoes, ficha.financiamento_eleicoes)
})
