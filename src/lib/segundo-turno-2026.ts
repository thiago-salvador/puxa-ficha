// cspell:ignore exibicao celulas
/**
 * Helpers puros da página do 2º turno de 2026: contagem de dias até a votação,
 * linhas do lado a lado dos finalistas, seleção das pesquisas do confronto e os
 * duelos estaduais. Nada aqui busca dado: tudo vem do snapshot do TSE, do DTO
 * de lista das fichas e do catálogo de pesquisas já carregados pela página.
 */
import { formatarPercentual, formatarVotos, type CandidatoResultado1Turno, type DisputaResultado1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { processosOverviewDisplay } from "@/lib/processos-display"
import { exibicaoProcessosJustica, type ProcessosJusticaContagem } from "@/lib/processos-justica-total"
import { PATRIMONIO_ATIPICO_ROTULO } from "@/lib/patrimonio-atipico"
import { formatBRL } from "@/lib/utils"
import type { StatePollScenario } from "@/lib/state-polls"
import { fieldworkDate, publicPollMetadata, publishedValue } from "@/lib/poll-series"
import { DATAS_TURNOS_2026 } from "@/lib/coorte-atualizacao"
import type { CandidatoComparavel } from "@/lib/types"
import { COMPARADOR_NAO_SE_APLICA, deveMostrarBlocoCongresso } from "@/lib/comparador-display"
import { formatEvolucaoPatrimonialPct } from "@/lib/evolucao-patrimonial"
import { formacaoPublicaDe } from "@/lib/formacao-display"
import { anosGastosParlamentaresEmRevisao } from "@/lib/gastos-parlamentares-em-revisao"
import { publicTaxonomyValue } from "@/lib/public-profile-dto"
import { sanitizePtBrText } from "@/lib/ptbr-text"

/** Data da votação do 2º turno, no calendário de Brasília. */
const DATA_2TURNO_2026 = "2026-10-25"

export const SEM_DADO = "sem dado"

const DIA_EM_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function diaUtc(isoData: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoData)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * Dias de calendário (Brasília) entre o instante `agora` e a votação. Negativo
 * depois da data; null para instante inválido.
 */
export function diasAte2Turno(agora: string | number, alvo: string = DATA_2TURNO_2026): number | null {
  const instante = new Date(agora)
  if (Number.isNaN(instante.getTime())) return null
  const hoje = diaUtc(DIA_EM_SP.format(instante))
  const dia = diaUtc(alvo)
  if (hoje === null || dia === null) return null
  return Math.round((dia - hoje) / 86_400_000)
}

/** "Faltam 20 dias", "Falta 1 dia", "É hoje"; null quando a data já passou. */
export function rotuloContagem2Turno(dias: number | null): string | null {
  if (dias === null || dias < 0) return null
  if (dias === 0) return "É hoje"
  return dias === 1 ? "Falta 1 dia" : `Faltam ${dias} dias`
}

/** Versão curta para a faixa fixa no celular: "20 dias", "1 dia", "Hoje"; null quando a data já passou. */
export function rotuloContagemCurto2Turno(dias: number | null): string | null {
  if (dias === null || dias < 0) return null
  if (dias === 0) return "Hoje"
  return dias === 1 ? "1 dia" : `${dias} dias`
}

/** Os dois finalistas na ordem de votos do 1º turno; null se a disputa não tem exatamente dois. */
export function finalistasDaDisputa(
  disputa: DisputaResultado1Turno | null,
): [CandidatoResultado1Turno, CandidatoResultado1Turno] | null {
  if (!disputa) return null
  const finalistas = disputa.candidatos.filter((c) => c.fase === "segundo_turno")
  return finalistas.length === 2 ? [finalistas[0], finalistas[1]] : null
}

/**
 * Slugs de todos os finalistas ainda na disputa (Presidente e governadores),
 * lidos do snapshot do TSE: só disputas com exatamente dois candidatos em
 * `segundo_turno` e com ficha vinculada. Ordenados e sem repetição.
 */
export function slugsDoSegundoTurno(data: Pick<Resultados1Turno, "disputas"> | null | undefined): string[] {
  const slugs = new Set<string>()
  for (const disputa of data?.disputas ?? []) {
    for (const c of finalistasDaDisputa(disputa) ?? []) {
      if (c.slug) slugs.add(c.slug)
    }
  }
  return [...slugs].sort()
}

export interface CelulaLadoALado {
  valor: string
  detalhe?: string
  semDado: boolean
}

export interface LinhaLadoALado {
  id: "resultado" | "partido" | "vice" | "patrimonio" | "processos" | "pontos"
  rotulo: string
  celulas: [CelulaLadoALado, CelulaLadoALado]
}

/** Dados da ficha de um finalista. `undefined` significa que a lista não trouxe a ficha. */
export interface FichaLadoALado {
  patrimonio: number | null | undefined
  patrimonioAtipico: boolean
  processos: number | undefined
  processosContagem?: ProcessosJusticaContagem
  pontosAtencao: number | undefined
}

const vazio = (): CelulaLadoALado => ({ valor: SEM_DADO, semDado: true })

function celulaResultado(c: CandidatoResultado1Turno): CelulaLadoALado {
  if (c.percentual_validos === null) return vazio()
  return { valor: formatarPercentual(c.percentual_validos), detalhe: `${formatarVotos(c.votos)} votos`, semDado: false }
}

function celulaPartido(c: CandidatoResultado1Turno): CelulaLadoALado {
  if (!c.partido) return vazio()
  // Partido e número na mesma linha ("PL · nº 22"), como no estudo de layout de 06/10.
  return { valor: c.numero ? `${c.partido} · nº ${c.numero}` : c.partido, semDado: false }
}

function celulaVice(c: CandidatoResultado1Turno): CelulaLadoALado {
  const vice = c.companheiros.find((p) => p.tipo === "v")
  if (!vice?.nome) return vazio()
  return { valor: vice.nome, detalhe: vice.partido || undefined, semDado: false }
}

function celulaPatrimonio(f: FichaLadoALado | undefined): CelulaLadoALado {
  if (!f || f.patrimonio === null || f.patrimonio === undefined) return vazio()
  return {
    valor: formatBRL(f.patrimonio),
    detalhe: f.patrimonioAtipico ? PATRIMONIO_ATIPICO_ROTULO : undefined,
    semDado: false,
  }
}

function celulaProcessos(f: FichaLadoALado | undefined): CelulaLadoALado {
  if (!f || f.processos === undefined) return vazio()
  // Mesma régua da grade de candidatos: com disciplinar, total e partes; sem, a régua judicial.
  const judicial = processosOverviewDisplay(f.processos)
  const exibicao = f.processosContagem ? exibicaoProcessosJustica(judicial, f.processosContagem) : judicial
  return { valor: String(exibicao.value), detalhe: exibicao.sub, semDado: false }
}

function celulaPontos(f: FichaLadoALado | undefined): CelulaLadoALado {
  if (!f || f.pontosAtencao === undefined) return vazio()
  return {
    valor: String(f.pontosAtencao),
    detalhe: f.pontosAtencao === 0 ? "nenhum publicado na ficha" : "publicados na ficha",
    semDado: false,
  }
}

/** Linhas da comparação lado a lado, sempre na ordem dos finalistas recebida. */
export function montarLadoALado(
  finalistas: [CandidatoResultado1Turno, CandidatoResultado1Turno],
  fichas: [FichaLadoALado | undefined, FichaLadoALado | undefined],
): LinhaLadoALado[] {
  const par = <T>(fn: (c: CandidatoResultado1Turno, f: FichaLadoALado | undefined) => T): [T, T] => [
    fn(finalistas[0], fichas[0]),
    fn(finalistas[1], fichas[1]),
  ]
  return [
    { id: "resultado", rotulo: "1º turno", celulas: par((c) => celulaResultado(c)) },
    { id: "partido", rotulo: "Partido", celulas: par((c) => celulaPartido(c)) },
    { id: "vice", rotulo: "Vice", celulas: par((c) => celulaVice(c)) },
    { id: "patrimonio", rotulo: "Patrimônio declarado", celulas: par((_, f) => celulaPatrimonio(f)) },
    { id: "processos", rotulo: "Processos", celulas: par((_, f) => celulaProcessos(f)) },
    { id: "pontos", rotulo: "Pontos de atenção", celulas: par((_, f) => celulaPontos(f)) },
  ]
}

export interface LinhaLadoALadoExtra {
  id: "cargo-atual" | "idade" | "formacao" | "profissao" | "evolucao" | "trocas" | "ceap" | "congresso"
  rotulo: string
  celulas: [CelulaLadoALado, CelulaLadoALado]
}

/**
 * O que a página já carregou de um finalista para o "Mais informações":
 * a linha do comparador (`getCandidatosComparaveisResource`) e a profissão
 * declarada na ficha. `undefined` em `comparavel` quando a lista não trouxe
 * a ficha: tudo vira "sem dado", nunca zero.
 */
export interface FichaLadoALadoExtra {
  slug: string | null
  comparavel?: Pick<
    CandidatoComparavel,
    | "cargo_atual"
    | "idade"
    | "formacao"
    | "formacao_instituicao"
    | "evolucao_patrimonial_pct"
    | "mudancas_partido"
    | "mudancas_partido_verificado"
    | "total_gasto_parlamentar"
    | "tem_historico_legislativo"
  >
  profissaoDeclarada?: string | null
}

export const SEM_DADO_VERIFICADO = "sem dado verificado"

/** Texto público da ficha: sanitizado e aparado; vazio vira null. */
function textoPublico(valor: string | null | undefined): string | null {
  if (!valor?.trim()) return null
  return sanitizePtBrText(valor).trim() || null
}

function celulaTexto(valor: string | null): CelulaLadoALado {
  return valor ? { valor, semDado: false } : vazio()
}

function celulaCargoAtual(f: FichaLadoALadoExtra): CelulaLadoALado {
  return celulaTexto(textoPublico(f.comparavel?.cargo_atual))
}

function celulaIdade(f: FichaLadoALadoExtra): CelulaLadoALado {
  // Mesma régua do comparador: idade 0 ou ausente não é exibida.
  const idade = f.comparavel?.idade
  return idade ? { valor: `${idade} anos`, semDado: false } : vazio()
}

function celulaFormacao(f: FichaLadoALadoExtra): CelulaLadoALado {
  return celulaTexto(f.comparavel ? formacaoPublicaDe(f.comparavel) : null)
}

function celulaProfissao(f: FichaLadoALadoExtra): CelulaLadoALado {
  // Mesmo sanitizador da ficha: QID cru do Wikidata e jargão interno não viram texto.
  return celulaTexto(textoPublico(publicTaxonomyValue(f.profissaoDeclarada)))
}

function celulaEvolucao(f: FichaLadoALadoExtra): CelulaLadoALado {
  const pct = f.comparavel?.evolucao_patrimonial_pct
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return vazio()
  return { valor: formatEvolucaoPatrimonialPct(pct), detalhe: "2026 contra a eleição anterior declarada", semDado: false }
}

function celulaTrocas(f: FichaLadoALadoExtra): CelulaLadoALado {
  const c = f.comparavel
  // Número só com contagem afirmável, como no comparador; sem verificação, nunca zero.
  if (!c?.mudancas_partido_verificado || !Number.isFinite(c.mudancas_partido)) return { valor: SEM_DADO_VERIFICADO, semDado: true }
  return { valor: String(c.mudancas_partido), detalhe: "no histórico verificado da ficha", semDado: false }
}

function celulaCeap(f: FichaLadoALadoExtra): CelulaLadoALado {
  const total = f.comparavel?.total_gasto_parlamentar
  if (total === null || total === undefined || !Number.isFinite(total)) {
    return { valor: f.comparavel ? COMPARADOR_NAO_SE_APLICA : SEM_DADO, semDado: true }
  }
  // O total já sai sem os anos em revisão; a legenda diz quais ficaram de fora.
  const anos = f.slug ? anosGastosParlamentaresEmRevisao(f.slug) : []
  return {
    valor: formatBRL(total),
    detalhe: anos.length ? `fora do total, em revisão: ${anos.join(", ")}` : "soma da cota no Congresso",
    semDado: false,
  }
}

function celulaCongresso(f: FichaLadoALadoExtra): CelulaLadoALado {
  if (!f.comparavel?.tem_historico_legislativo) return vazio()
  return { valor: "Sim", detalhe: "senador ou deputado federal, no histórico da ficha", semDado: false }
}

/**
 * Linhas do "Mais informações" do lado a lado, só com o que a página já
 * carregou. Mesmas regras públicas do comparador; a cota parlamentar só entra
 * quando algum dos dois tem gasto ou mandato no Congresso.
 */
export function montarLadoALadoExtra(fichas: [FichaLadoALadoExtra, FichaLadoALadoExtra]): LinhaLadoALadoExtra[] {
  const par = (fn: (f: FichaLadoALadoExtra) => CelulaLadoALado): [CelulaLadoALado, CelulaLadoALado] => [fn(fichas[0]), fn(fichas[1])]
  const linhas: LinhaLadoALadoExtra[] = [
    { id: "cargo-atual", rotulo: "Cargo atual", celulas: par(celulaCargoAtual) },
    { id: "idade", rotulo: "Idade", celulas: par(celulaIdade) },
    { id: "formacao", rotulo: "Formação", celulas: par(celulaFormacao) },
    { id: "profissao", rotulo: "Profissão declarada", celulas: par(celulaProfissao) },
    { id: "evolucao", rotulo: "Evolução patrimonial", celulas: par(celulaEvolucao) },
    { id: "trocas", rotulo: "Trocas de partido", celulas: par(celulaTrocas) },
  ]
  const comparaveis = fichas.flatMap((f) => (f.comparavel ? [f.comparavel] : []))
  if (deveMostrarBlocoCongresso(comparaveis)) {
    linhas.push(
      { id: "ceap", rotulo: "Cota parlamentar (CEAP/CEAPS)", celulas: par(celulaCeap) },
      { id: "congresso", rotulo: "Mandato no Congresso", celulas: par(celulaCongresso) },
    )
  }
  return linhas
}

export interface Pesquisa2TurnoLinha {
  id: string
  instituto: string
  /** Data de publicação (AAAA-MM-DD), ou null quando a fonte não publicou. */
  data: string | null
  percentuais: [number, number]
  margem: number | null
  url: string
}

/**
 * Cenários de 2º turno em que os dois candidatos com vínculo exato são
 * exatamente os finalistas. Uma linha por pesquisa, da mais recente para a mais
 * antiga, no máximo `limite`. Só pesquisa aprovada e publicada, com valores e
 * metadados publicados, e coleta encerrada depois do 1º turno: cenário
 * hipotético colhido antes da votação não mede o confronto real.
 */
export function selecionarPesquisasDoConfronto(
  polls: readonly StatePollScenario[],
  slugs: [string, string],
  limite = 6,
  coletaApos: string = DATAS_TURNOS_2026[1],
): Pesquisa2TurnoLinha[] {
  const vistas = new Set<string>()
  const linhas: Pesquisa2TurnoLinha[] = []
  const publicas = polls
    .filter((poll) => poll.sourceStatus === "aprovado" && poll.state === "publicado" && (fieldworkDate(poll) ?? "") > coletaApos)
    .map(publicPollMetadata)
  const ordenadas = [...publicas].sort(
    (a, b) => (b.publicationDate.value ?? "").localeCompare(a.publicationDate.value ?? "") || a.id.localeCompare(b.id),
  )
  for (const poll of ordenadas) {
    if (linhas.length >= limite) break
    if (poll.scenario.turn !== 2 || vistas.has(poll.id)) continue
    const exatos = poll.scenario.resultados.filter((r) => r.matchStatus === "exact_alias" && r.candidateSlug)
    if (exatos.length !== 2) continue
    const a = exatos.find((r) => r.candidateSlug === slugs[0])
    const b = exatos.find((r) => r.candidateSlug === slugs[1])
    const va = a ? publishedValue(poll, a) : null
    const vb = b ? publishedValue(poll, b) : null
    if (va === null || vb === null) continue
    const url = poll.provenance.resultUrl
    if (!/^https:\/\//.test(url)) continue
    vistas.add(poll.id)
    linhas.push({
      id: poll.id,
      instituto: poll.instituto.value ?? "Instituto sem nome publicado",
      data: poll.publicationDate.value,
      percentuais: [va, vb],
      margem: poll.marginErrorPp.value,
      url,
    })
  }
  return linhas
}

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })

/** "17 set." a partir de "2026-09-17"; texto da fonte quando não é data ISO. */
export function formatarDataPesquisa(data: string | null): string {
  if (!data) return SEM_DADO
  const dia = diaUtc(data)
  return dia === null ? data : DATA_CURTA.format(new Date(dia))
}

export interface PontoSeriePesquisa {
  id: string
  instituto: string
  /** AAAA-MM-DD. */
  data: string
  percentuais: [number, number]
}

/**
 * Pesquisas do confronto da mais antiga para a mais recente, só com data ISO
 * publicada. Com menos de duas, não há tendência: devolve lista vazia.
 */
export function serieDasPesquisas(linhas: readonly Pesquisa2TurnoLinha[]): PontoSeriePesquisa[] {
  const pontos = linhas
    .filter((l): l is Pesquisa2TurnoLinha & { data: string } => l.data !== null && diaUtc(l.data) !== null)
    .map((l) => ({ id: l.id, instituto: l.instituto, data: l.data, percentuais: l.percentuais }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
  return pontos.length >= 2 ? pontos : []
}

export interface SerieEscalada {
  pontos: Array<PontoSeriePesquisa & { x: number; y: [number, number] }>
  /** Valores do eixo vertical (em %) com a posição y de cada um. */
  marcas: Array<{ valor: number; y: number }>
}

/**
 * Posições no SVG: x proporcional à data (intervalo real entre pesquisas), y
 * numa faixa de 2 em 2 pontos que cobre todos os valores com folga. Nada de
 * eixo a partir de zero: o confronto oscila em poucos pontos.
 */
export function escalarSerie(
  pontos: readonly PontoSeriePesquisa[],
  caixa: { largura: number; altura: number; margemX: number; margemY: number },
): SerieEscalada {
  if (pontos.length === 0) return { pontos: [], marcas: [] }
  const valores = pontos.flatMap((p) => p.percentuais)
  const min = Math.floor((Math.min(...valores) - 1) / 2) * 2
  const max = Math.ceil((Math.max(...valores) + 1) / 2) * 2
  const dias = pontos.map((p) => diaUtc(p.data) ?? 0)
  const d0 = dias[0]
  const span = Math.max(dias[dias.length - 1] - d0, 1)
  const larguraUtil = caixa.largura - caixa.margemX * 2
  const alturaUtil = caixa.altura - caixa.margemY * 2
  const y = (v: number) => caixa.margemY + ((max - v) / (max - min)) * alturaUtil
  const marcas: SerieEscalada["marcas"] = []
  for (let v = min; v <= max; v += 2) marcas.push({ valor: v, y: y(v) })
  return {
    pontos: pontos.map((p, i) => ({ ...p, x: caixa.margemX + ((dias[i] - d0) / span) * larguraUtil, y: [y(p.percentuais[0]), y(p.percentuais[1])] })),
    marcas,
  }
}

/**
 * Quem lidera um duelo e por quantos pontos (uma casa). O líder sai do valor
 * cheio, antes do arredondamento; empate exato ou sem dado = líder null.
 */
export function vantagemNoDuelo(a: number | null, b: number | null): { lider: 0 | 1 | null; pp: number | null } {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return { lider: null, pp: null }
  if (a === b) return { lider: null, pp: 0 }
  return { lider: a > b ? 0 : 1, pp: Math.round(Math.abs(a - b) * 10) / 10 }
}

const UMA_CASA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "+2,4 p.p."; o que arredonda para zero vira "menos de 0,1 p.p.", nunca um zero enganoso. */
export function formatarVantagem(pp: number): string {
  return pp < 0.05 ? "menos de 0,1 p.p." : `+${UMA_CASA.format(pp)} p.p.`
}

/** "30/7" a partir de "2026-07-30", para o eixo da tendência (o rótulo longo se sobrepõe). */
export function formatarDataEixo(data: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(data)
  return m ? `${Number(m[2])}/${Number(m[1])}` : data
}
