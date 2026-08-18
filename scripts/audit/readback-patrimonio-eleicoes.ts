/**
 * Readback do item R2: o que o banco tem de patrimônio por eleição, o que o DTO
 * público devolve, e o que a aba Dinheiro REALMENTE mostra no DOM.
 *
 * Só leitura, e sobre `candidatos_publico` (194 fichas).
 *
 * ## Por que este script renderiza o componente sobre o payload do DTO
 *
 * A ficha pública não renderiza o objeto que `getCandidatoBySlug` monta. Ela
 * renderiza o que `/api/candidato-profile/[slug]` devolve, e essa rota serve
 * `toPublicCandidatoProfileDto(ficha)`. O DTO publica a série derivada
 * (`patrimonio_eleicoes`) e NÃO publica os insumos crus dela
 * (`patrimonio_ausencias_oficiais`). Medir o componente sobre a ficha crua do
 * servidor mede um payload que nenhum visitante recebe, e foi assim que a
 * degradação de `vazio_confirmado` para `nao_coletado` passou batida.
 *
 * Então cada ficha é medida duas vezes:
 *   - `servidor`: a ficha crua, forma que `getCandidatoBySlug` monta;
 *   - `cliente`: `toPublicCandidatoProfileDto(servidor)`, byte a byte o que o
 *     browser recebe e o componente consome.
 *
 * A verdade de referência é o banco: ano com linha em `patrimonio` deve sair
 * como `publicado`; ano com linha em `patrimonio_ausencia_oficial` deve sair
 * como `vazio_confirmado`, COM fonte e data no DOM. Qualquer um desses dois
 * aparecendo como "ainda não coletado", ou não aparecendo, é defeito.
 *
 * Uso: npx tsx scripts/audit/readback-patrimonio-eleicoes.ts [--json=caminho]
 *      [--slugs=a,b,c]
 */
import { writeFileSync } from "node:fs"
// `createElement` em vez de JSX porque `scripts/` está fora do tsconfig, e sem
// ele o transform cai no JSX clássico e quebra em "React is not defined".
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { supabase } from "../lib/supabase"
import {
  PATRIMONIO_ANO_INICIAL_APLICAVEL,
  toPublicCandidatoProfileDto,
  type PatrimonioEleicaoEstado,
} from "../../src/lib/public-profile-dto"
import { normalizeHistoricoPoliticoForDisplay } from "../../src/lib/historico-dedupe"
import { normalizePatrimonioForDisplay } from "../../src/lib/person-level-dedupe"
import { CandidatoProfile } from "../../src/components/CandidatoProfile"
import type {
  FichaCandidato,
  HistoricoPolitico,
  Patrimonio,
  PatrimonioAusenciaOficial,
} from "../../src/lib/types"

async function todas<T>(tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data?.length) break
    linhas.push(...(data as unknown as T[]))
    if (data.length < 1000) break
  }
  return linhas
}

/**
 * A aba Dinheiro entra por `next/dynamic`, que é `React.lazy` por baixo. Numa
 * renderização síncrona o primeiro passe só alcança o fallback; com o módulo já
 * resolvido, o segundo passe entrega o conteúdo real. Sem isto o readback
 * mediria o esqueleto de carregamento e concluiria que a aba não mostra nada.
 */
async function renderizarAba(ficha: FichaCandidato, aba: "dinheiro" | "geral"): Promise<string> {
  await import("../../src/components/CandidatoProfileSections")
  let html = ""
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    html = renderToStaticMarkup(createElement(CandidatoProfile, { ficha, initialTab: aba }))
    if (!html.includes("animate-pulse")) return html
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return html
}

/** Estados de eleição que o DOM marca, por ano. */
function estadosNoDom(html: string): Map<number, PatrimonioEleicaoEstado> {
  const out = new Map<number, PatrimonioEleicaoEstado>()
  const re =
    /data-pf-patrimonio-eleicao="(\d{4})"\s+data-pf-patrimonio-eleicao-estado="([a-z_]+)"/g
  for (const match of html.matchAll(re)) {
    out.set(Number(match[1]), match[2] as PatrimonioEleicaoEstado)
  }
  return out
}

/**
 * Anos com valor publicado visível na aba. O card de valor carrega o ano no
 * atributo; o card expansível carrega o id da linha, então o ano vem do mapa
 * id -> ano montado a partir do próprio payload renderizado.
 */
function anosPublicadosNoDom(html: string, idParaAno: Map<string, number>): Set<number> {
  const out = new Set<number>()
  for (const match of html.matchAll(/data-pf-patrimonio-valor="(\d{4})"/g)) {
    out.add(Number(match[1]))
  }
  for (const match of html.matchAll(/data-pf-timeline-ref="patrimonio-([^"]+)"/g)) {
    const ano = idParaAno.get(match[1])
    if (ano != null) out.add(ano)
  }
  return out
}

/** Uma linha de ausência confirmada só é honesta com fonte E data no DOM. */
function anosComFonteEData(html: string): Set<number> {
  const out = new Set<number>()
  const blocos = html.split("data-pf-patrimonio-eleicao=").slice(1)
  for (const bloco of blocos) {
    const ano = Number(bloco.slice(1, 5))
    if (!Number.isFinite(ano)) continue
    const corpo = bloco.split("data-pf-patrimonio-eleicao=")[0]
    if (corpo.includes("Verificado em") && corpo.includes("Fonte oficial")) out.add(ano)
  }
  return out
}

interface DefeitoEleicao {
  ano: number
  esperado: PatrimonioEleicaoEstado
  dto: PatrimonioEleicaoEstado | "ausente"
  dom: PatrimonioEleicaoEstado | "ausente"
  motivo: string
}

async function main() {
  const args = process.argv.slice(2)
  const saida = args.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null
  const filtro = args.find((a) => a.startsWith("--slugs="))?.split("=")[1]?.split(",") ?? null

  const candidatos = await todas<Record<string, unknown> & { id: string; slug: string }>(
    "candidatos_publico",
    "*"
  )
  const historico = await todas<HistoricoPolitico & { despublicado_em?: string | null }>(
    "historico_politico",
    "*"
  )
  const patrimonio = await todas<Patrimonio & { candidato_id: string }>("patrimonio", "*")
  const ausencias = await todas<PatrimonioAusenciaOficial & { candidato_id: string }>(
    "patrimonio_ausencia_oficial",
    "*"
  )

  const porCand = <T extends { candidato_id: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) m.set(x.candidato_id, [...(m.get(x.candidato_id) ?? []), x])
    return m
  }
  const historicoPor = porCand(historico.filter((h) => h.despublicado_em == null))
  const patrimonioPor = porCand(patrimonio)
  const ausenciasPor = porCand(ausencias)

  const alvo = filtro ? candidatos.filter((c) => filtro.includes(c.slug)) : candidatos

  let fichasComDefeito = 0
  let eleicoesComDefeito = 0
  let fichasComAusenciaConfirmada = 0
  let eleicoesAusenciaConfirmada = 0
  let eleicoesAusenciaConfirmadaComFonteEData = 0
  const detalhePorFicha: Array<{ slug: string; defeitos: DefeitoEleicao[] }> = []
  const nomeados: Record<string, unknown> = {}
  const NOMEADOS = [
    "flavio-bolsonaro",
    "hertz-dias",
    "rui-costa-pimenta",
    "samara-martins",
    "jose-estevao",
    "samara-mineiro",
    "dr-luisinho",
    "preta-lu",
  ]

  for (const c of alvo) {
    // As MESMAS normalizações que `src/lib/api.ts` aplica antes de a ficha
    // receber os dados.
    const h = normalizeHistoricoPoliticoForDisplay(historicoPor.get(c.id) ?? [])
    const pat = normalizePatrimonioForDisplay(patrimonioPor.get(c.id) ?? [])
    const aus = ausenciasPor.get(c.id) ?? []

    const fichaServidor = {
      ...c,
      historico: h,
      patrimonio: pat,
      patrimonio_ausencias_oficiais: aus,
      mudancas_partido: [],
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
    } as unknown as FichaCandidato

    // Byte a byte o que o browser recebe de `/api/candidato-profile/[slug]`.
    const fichaCliente = toPublicCandidatoProfileDto(fichaServidor) as unknown as FichaCandidato

    const idParaAno = new Map(
      (fichaCliente.patrimonio ?? []).map((p) => [p.id, p.ano_eleicao] as const)
    )
    const html = await renderizarAba(fichaCliente, "dinheiro")
    const domEstados = estadosNoDom(html)
    const domPublicados = anosPublicadosNoDom(html, idParaAno)
    const domComProva = anosComFonteEData(html)

    const dtoPorAno = new Map(
      (fichaCliente as unknown as { patrimonio_eleicoes?: Array<{ ano: number; estado: PatrimonioEleicaoEstado }> })
        .patrimonio_eleicoes?.map((e) => [e.ano, e.estado]) ?? []
    )

    // Verdade do banco, restrita à janela aplicável da série TSE.
    const verdade = new Map<number, PatrimonioEleicaoEstado>()
    for (const a of aus) {
      if (a.ano_eleicao >= PATRIMONIO_ANO_INICIAL_APLICAVEL) {
        verdade.set(a.ano_eleicao, "vazio_confirmado")
      }
    }
    for (const p of pat) {
      if (p.ano_eleicao >= PATRIMONIO_ANO_INICIAL_APLICAVEL) verdade.set(p.ano_eleicao, "publicado")
    }

    const defeitos: DefeitoEleicao[] = []
    for (const [ano, esperado] of [...verdade].sort((a, b) => b[0] - a[0])) {
      const dom: PatrimonioEleicaoEstado | "ausente" = domPublicados.has(ano)
        ? "publicado"
        : (domEstados.get(ano) ?? "ausente")
      const dto = dtoPorAno.get(ano) ?? "ausente"

      if (esperado === "vazio_confirmado") {
        eleicoesAusenciaConfirmada += 1
        if (dom === "vazio_confirmado" && domComProva.has(ano)) {
          eleicoesAusenciaConfirmadaComFonteEData += 1
        }
      }

      if (dom === esperado) {
        // Ausência confirmada exibida sem fonte e data continua desonesta.
        if (esperado === "vazio_confirmado" && !domComProva.has(ano)) {
          defeitos.push({
            ano,
            esperado,
            dto,
            dom,
            motivo: "ausencia_confirmada_sem_fonte_e_data_no_dom",
          })
        }
        continue
      }

      defeitos.push({
        ano,
        esperado,
        dto,
        dom,
        motivo:
          dom === "nao_coletado"
            ? "banco_tem_dado_mas_dom_diz_nao_coletado"
            : dom === "ausente"
              ? "banco_tem_dado_mas_dom_omite_a_eleicao"
              : "estado_divergente",
      })
    }

    if (aus.some((a) => a.ano_eleicao >= PATRIMONIO_ANO_INICIAL_APLICAVEL)) {
      fichasComAusenciaConfirmada += 1
    }
    if (defeitos.length > 0) {
      fichasComDefeito += 1
      eleicoesComDefeito += defeitos.length
      detalhePorFicha.push({ slug: c.slug, defeitos })
    }

    if (NOMEADOS.includes(c.slug)) {
      nomeados[c.slug] = {
        banco: [...verdade].sort((a, b) => b[0] - a[0]).map(([ano, estado]) => ({ ano, estado })),
        dto: [...dtoPorAno].sort((a, b) => b[0] - a[0]).map(([ano, estado]) => ({ ano, estado })),
        dom: [...new Set([...verdade.keys(), ...domEstados.keys(), ...domPublicados])]
          .sort((a, b) => b - a)
          .map((ano) => ({
            ano,
            estado: domPublicados.has(ano) ? "publicado" : (domEstados.get(ano) ?? "ausente"),
            fonte_e_data: domComProva.has(ano),
          })),
        defeitos,
      }
    }
  }

  const resumo = {
    universo: { fichasPublicas: candidatos.length, fichasMedidas: alvo.length },
    fichasComPeloMenosUmaEleicaoDefeituosa: fichasComDefeito,
    eleicoesDefeituosas: eleicoesComDefeito,
    ausenciaOficialConfirmada: {
      fichas: fichasComAusenciaConfirmada,
      eleicoes: eleicoesAusenciaConfirmada,
      exibidasComFonteEData: eleicoesAusenciaConfirmadaComFonteEData,
    },
    porMotivo: detalhePorFicha
      .flatMap((f) => f.defeitos.map((d) => d.motivo))
      .reduce<Record<string, number>>((acc, m) => ({ ...acc, [m]: (acc[m] ?? 0) + 1 }), {}),
    casosNomeados: nomeados,
    fichasAfetadas: detalhePorFicha.map((f) => f.slug),
  }

  console.log(JSON.stringify(resumo, null, 2))
  if (saida) {
    writeFileSync(saida, JSON.stringify({ resumo, detalhePorFicha }, null, 2))
    console.log(`\nDetalhe em ${saida}`)
  }
  if (fichasComDefeito > 0) {
    console.error(
      `\nFALHA: ${fichasComDefeito} ficha(s) exibem eleição com dado no banco como não coletada, omitida ou sem fonte.`
    )
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
