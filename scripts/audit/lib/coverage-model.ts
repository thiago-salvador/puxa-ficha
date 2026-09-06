/**
 * Régua de cobertura de dados por candidato (2026-08-02).
 *
 * Lógica pura e testável do relatório gerado por `scripts/audit/coverage-report.ts`
 * e conferido por `scripts/audit/check-report.ts`. Nada aqui toca rede ou banco.
 *
 * Cinco estados de célula:
 *   - `ok`      : preenchido (o texto traz a contagem / volume)
 *   - `partial` : preenchido pela metade (vale meio ponto no índice)
 *   - `missing` : esperado e vazio (é o que o gate de lacuna corrigível persegue)
 *   - `zero`    : zero legítimo ou não coletado; o banco não distingue os dois
 *   - `na`      : não se aplica ao candidato, pelo histórico político registrado
 *
 * Aplicabilidade (`na`) é derivada do histórico do próprio site, não de opinião:
 *   - cota parlamentar  : mandato de deputado federal ou senador com fim >= 2009
 *                         (a cota digital do CEAP começa em 2009)
 *   - votações-chave    : mandato federal com fim >= 2012 (janela das 24 votações
 *                         do banco, de 2012-05-25 a 2024-12-10)
 *   - projetos de lei   : mandato parlamentar em qualquer esfera
 *   - legislação exec.  : chefia de Executivo (Presidente, Governador ou Prefeito),
 *                         com `tipo_evento = 'mandato'`
 *   - patrimônio e      : já ter declarado ao TSE, isto é, SQ_CANDIDATO conhecido no
 *     financiamento       seed, âncora atual no banco OU candidatura / mandato
 *                         ELETIVO no histórico com `periodo_inicio <= 2026`.
 *                         Cargo por nomeação (ministro, secretário, presidência de
 *                         partido) não conta.
 *
 * Patrimônio mede POR ELEIÇÃO aplicável, não por presença (2026-08-07): o
 * denominador são as candidaturas a partir de `PATRIMONIO_ANO_INICIAL_APLICAVEL`
 * (2006, janela da série bem_candidato dos dados abertos do TSE) vindas do
 * histórico com proveniência `tse`, unidas aos anos com bem publicado e aos anos
 * com ausência oficial confirmada (`patrimonioAusenciasOficiais`). Quem publicou
 * bens em 2006 e 2010 mas deve a eleição de 2014 não sai mais como completo.
 * Evolução patrimonial e bens ano a ano continuam medindo só o conjunto publicado.
 *
 * Histórico incompleto pode gerar falso `na`: é limitação conhecida e está escrita
 * na própria página do relatório.
 */

import {
  provenienciaDaColuna,
  FONTES_POR_COLUNA,
  ROTULO_PROVENIENCIA as ROTULOS_DO_MODULO,
  type ColetaPorFonte,
  type VeredictoProveniencia
} from "./coleta-proveniencia"
import { FONTE_CAMARA_PROPOSICOES } from "../../lib/coleta-log"
import { QUIZ_PERGUNTAS } from "../../../src/data/quiz/perguntas"
import {
  FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE,
  FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA,
} from "../../../src/lib/financiamento-eleicoes"
import { anosDePleitoDisputado } from "../../../src/lib/pleitos-disputados"
import { getEspectroPartidario } from "../../../src/data/quiz/espectro-partidario"
import { isPhotoPlaceholder } from "../../../src/lib/photo-placeholder"
import { resolveCanonicalPartySigla } from "../../../src/lib/party-utils"

export type { ColetaPorFonte } from "./coleta-proveniencia"
export { FONTES_POR_COLUNA } from "./coleta-proveniencia"

type CellState = "ok" | "partial" | "missing" | "zero" | "na"

/**
 * Por que a célula está zerada, quando dá para saber.
 *
 * Até 2026-08-04 o relatório dizia, na própria legenda, que `zero` podia ser
 * "verificado e nada encontrado" ou "nunca coletado", e que o banco não
 * distinguia os dois. `coleta_log` registra a TENTATIVA, e é dela que estes
 * valores saem — sempre da última tentativa por fonte.
 *
 * **O cálculo NÃO mora aqui.** O mapa coluna → fontes e a precedência do
 * veredito são de `lib/coleta-proveniencia.ts`, que cobre as 23 colunas. Este
 * arquivo cuida do DESENHO da célula, que é outra coisa. Havia duas
 * implementações do mesmo cálculo, escritas em paralelo em 04/08 por duas
 * threads que não sabiam uma da outra, e manter as duas repunha em escala menor
 * exatamente a duplicação que o relatório de régua única existiu para acabar.
 *
 * O único valor que este arquivo acrescenta é `desconhecida`, que o módulo não
 * tem como conhecer: é o caso de o log não ter sido lido nesta execução (banco
 * sem a migration, ou snapshot antigo em disco). Sem ele, "não perguntamos"
 * viraria "nunca verificado", que é afirmação sobre o banco a partir de uma
 * falha de leitura nossa.
 */
export type Proveniencia = VeredictoProveniencia | "desconhecida"

export interface Cell {
  state: CellState
  text: string
  tip?: string
  /** Só nas colunas cujo zero era ambíguo. Ver `COLUNAS_COM_PROVENIENCIA`. */
  proveniencia?: Proveniencia
}

export const ROTULO_PROVENIENCIA: Record<Proveniencia, string> = {
  ...ROTULOS_DO_MODULO,
  desconhecida: "procedência não lida"
}

/** Último ano de registro no TSE considerado para "já declarou". */
export const ANO_ULTIMA_ELEICAO_REGISTRADA = 2026
/**
 * Primeira eleição medida pela régua de patrimônio. A série `bem_candidato` dos
 * dados abertos do TSE começa em 2006; antes disso não há pacote oficial para
 * confirmar dado nem ausência. Declarada aqui com o mesmo valor usado nas
 * etapas de coleta da execução pf-patrimonio-20260807T170643Z.
 */
export const PATRIMONIO_ANO_INICIAL_APLICAVEL = 2006
/** Cota parlamentar digital (CEAP) só existe a partir de 2009. */
export const ANO_INICIO_COTA_PARLAMENTAR = 2009
/** Fallback para snapshot antigo sem a cardinalidade dinâmica das votações. */
export const ANO_INICIO_VOTACOES_CHAVE = 2015
/** Temas derivados das perguntas que o cálculo do quiz realmente consome. */
export const TEMAS_QUIZ: readonly string[] = Object.freeze(
  [...new Set(QUIZ_PERGUNTAS.flatMap((pergunta) => pergunta.temas_pl ?? []))].sort()
)

const CARGOS_COM_QUIZ = new Set(["Presidente", "Governador"])

const CARGOS_PARLAMENTAR_FEDERAL = new Set(["Deputado Federal", "Senador"])
const CARGOS_PARLAMENTAR = new Set([
  "Deputado Federal",
  "Senador",
  "Deputado Estadual",
  "Deputado Distrital",
  "Vereador"
])
const CARGOS_CHEFIA_EXECUTIVO = new Set(["Presidente", "Governador", "Prefeito"])
/** Cargos eletivos: disputá-los exige registro de candidatura e declaração de bens ao TSE. */
const CARGOS_ELETIVOS = new Set([
  ...CARGOS_PARLAMENTAR,
  ...CARGOS_CHEFIA_EXECUTIVO,
  "Vice-Presidente",
  "Vice-Governador",
  "Vice-Prefeito"
])

interface HistoricoEvento {
  cargo_canonico: string | null
  tipo_evento: string | null
  periodo_inicio: number | null
  periodo_fim: number | null
  /**
   * Origem da linha no histórico. Só `tse` alimenta a régua de patrimônio por
   * eleição: é a proveniência cujos anos casam com a série bem_candidato do
   * TSE. Ausente em snapshots anteriores a 2026-08-07, quando o SQL não a
   * carregava; aí a linha simplesmente não cria eleição aplicável.
   */
  proveniencia?: string | null
  eleito_por?: string | null
  observacoes?: string | null
}

interface FinanciamentoVerificacaoCoverage {
  ano_eleicao: number
  resultado: "ausencia_oficial" | "nao_coletado" | "erro"
}

type FotoOrigem = "local" | "tse" | "wikimedia" | "oficial" | "terceiro"

export interface CandidatoCoverage {
  slug: string
  nome_urna: string
  partido_sigla: string | null
  cargo_disputado: string | null
  estado: string | null

  foto: boolean
  /** URL crua para impedir que placeholder persistido conte como foto. */
  foto_url?: string | null
  /** Origem tecnica da URL; nao afirma autoria, licenca ou titularidade. */
  foto_origem?: FotoOrigem | null
  bio: boolean
  redes: boolean
  /** A fonte oficial foi consultada e não publicou link válido para o pleito. */
  redesVazioConfirmado?: boolean

  /** Idade vem da view pública `candidatos_publico` (a coluna crua é sempre NULL). */
  idade: number | null
  naturalidade: string | null
  formacao: string | null
  profissao: string | null

  historico: HistoricoEvento[]
  /** SQ_CANDIDATO conhecido no seed `data/candidatos.json`. */
  temSqNoSeed: boolean
  /** SQ_CANDIDATO do pleito atual persistido no banco, sem expor o identificador. */
  temSqAtualNoBanco?: boolean
  /** IDs oficiais usados pelos ingests federais, resolvidos do seed pelo relatório. */
  temIdCamaraNoSeed: boolean
  temIdSenadoNoSeed: boolean

  mudancas: number
  patrimonioAnos: number[]
  patrimonioAnosComBens: number[]
  /**
   * Eleições em que o pacote oficial `bem_candidato` do TSE foi lido de ponta a
   * ponta e não trouxe bens para o SQ_CANDIDATO (tabela
   * `patrimonio_ausencia_oficial`). Lista vazia quando o banco ainda não tem a
   * tabela ou o snapshot é anterior a ela: ausência de prova não vira prova de
   * ausência, e a eleição segue contada como lacuna.
   */
  patrimonioAusenciasOficiais: number[]
  financiamentoAnos: number[]
  financiamentoAnosComDoadores: number[]
  financiamentoAnosComReceitaPositiva?: number[]
  financiamentoVerificacoes?: FinanciamentoVerificacaoCoverage[]
  votos: number
  /** Votações-chave cujo ano e casa intersectam um mandato federal da ficha. */
  votosAplicaveis?: number
  contradicoes: number
  processos: number
  alertas: number
  projetos: number
  /**
   * Só as linhas com `fonte = 'Camara'`. É contra ESTE número que a
   * cardinalidade declarada pela Câmara se compara (issue #138): somar Senado e
   * curadoria no denominador recriaria o falso completo, com 100 da Câmara mais
   * 104 do Senado passando por 204 declaradas. Opcional porque snapshot
   * anterior à mudança não traz o campo, e aí a resposta é "não sei", nunca
   * "está completo".
   */
  projetosCamara?: number
  /** Ao menos um recorte público de autoria parlamentar está marcado como completo. */
  projetosTemInventarioCompleto?: boolean
  /**
   * Destaques que o leitor alcança hoje. A ficha carrega os 25 projetos mais
   * recentes (`ano` desc, `numero` desc) e ordena destaque primeiro DENTRO dessa
   * fatia, então destaque de proposição antiga não aparece. Só contam os que
   * caem na fatia.
   */
  destaquesVisiveis: number
  /** Destaques marcados no banco, incluindo os que não aparecem na ficha. */
  destaquesTotais: number
  gastosAnos: number[]
  legislacaoExecutivo: number
  /** O inventário público de atos do Executivo traz coverage_id reconhecido como completo. */
  legislacaoExecutivoTemInventarioCompleto?: boolean
  noticias: number
  /** Estado editorial do artefato estático de programa de governo de 2026. */
  programaGovernoEstado?: string | null
  /**
   * Temas com posição declarada E `verificado = true`. É o que o quiz usa
   * (`src/lib/api.ts`, `.eq("verificado", true)`), portanto é o que o leitor vê.
   */
  posicoesTemasVerificados: string[]
  /** Temas com posição gravada mas ainda sem revisão humana. Não vão ao ar. */
  posicoesTemasPendentes: string[]
  /** Temas cuja ausência de declaração foi verificada e documentada. */
  posicoesTemasSemDeclaracao?: string[]
  sancoes: number
  /** Itens que dependem de decisão humana para mudar o que está publicado. */
  itensRevisar: ItemRevisar[]
  /**
   * Última tentativa de coleta por fonte, do campo `coleta` do snapshot (que
   * lê `coleta_log_ultima`). Ausente quando o log não foi lido — banco sem a
   * migration, ou snapshot em disco anterior a ela. Aí toda procedência vira
   * `desconhecida` e o relatório volta a dizer só "zero".
   *
   * Objeto vazio é OUTRA coisa: o log foi lido e este candidato não tem
   * tentativa nenhuma registrada, que é `nunca_verificado`. A distinção entre
   * "não perguntamos" e "perguntamos e não havia registro" é a razão de ser da
   * tabela, então ela não pode se perder logo aqui.
   */
  coletas?: ColetaPorFonte
}

/** Colunas que ganham procedência. São todas as do mapa canônico. */
export const COLUNAS_COM_PROVENIENCIA = Object.keys(FONTES_POR_COLUNA)

/**
 * Procedência de um zero. Delega o veredito a `lib/coleta-proveniencia.ts`.
 *
 * O único julgamento que sobra aqui é o `desconhecida`: log não lido não é
 * fonte não verificada.
 */
export function provenienciaDoZero(
  coluna: string,
  coletas: ColetaPorFonte | undefined,
  fontesNaoAplicaveis: Readonly<Record<string, string>> = {}
): Proveniencia {
  if (!FONTES_POR_COLUNA[coluna]) return "desconhecida"
  // Coluna sem ingest não depende do log: o veredito é o mesmo com ou sem ele.
  if (FONTES_POR_COLUNA[coluna].length === 0) return "sem_ingest"
  if (!coletas) return "desconhecida"
  const coletaComNaoAplicaveis: ColetaPorFonte = { ...coletas }
  for (const fonte of Object.keys(fontesNaoAplicaveis)) {
    if (!coletaComNaoAplicaveis[fonte]) {
      coletaComNaoAplicaveis[fonte] = { resultado: "nao_aplicavel" }
    }
  }
  return provenienciaDaColuna(coluna, coletaComNaoAplicaveis).veredito
}

/** Classes de item que entram na fila de revisão. */
export type ClasseRevisar =
  "posicao_nao_verificada" | "ponto_atencao_pendente" | "ponto_atencao_ia_no_ar_sem_revisao"

export interface ItemRevisar {
  id: string
  classe: ClasseRevisar
  titulo: string
  detalhe: string | null
  fonte: string | null
  url: string | null
  /** O que muda no site se for aprovado. */
  efeito: string
}

export const ROTULO_CLASSE: Record<ClasseRevisar, string> = {
  posicao_nao_verificada: "Posição declarada aguardando revisão",
  ponto_atencao_pendente: "Ponto de atenção fora do ar, aguardando revisão",
  ponto_atencao_ia_no_ar_sem_revisao: "Ponto de atenção de IA no ar sem revisão humana"
}

interface Aplicabilidade {
  cotaParlamentar: boolean
  votacoesChave: boolean
  projetosLei: boolean
  legislacaoExecutivo: boolean
  declarouAoTse: boolean
  /** Foi parlamentar federal alguma vez, mesmo fora da janela das votações. */
  parlamentarFederalQualquerEpoca: boolean
}

function fimEfetivo(evento: HistoricoEvento): number | null {
  // Mandato em curso (`periodo_fim` nulo) conta como corrente: satisfaz qualquer piso.
  if (evento.periodo_fim === null) return Number.POSITIVE_INFINITY
  return evento.periodo_fim
}

export function calcularAplicabilidade(c: CandidatoCoverage): Aplicabilidade {
  const mandatos = c.historico.filter((h) => h.tipo_evento === "mandato")
  const mandatosFederais = mandatos.filter((h) =>
    CARGOS_PARLAMENTAR_FEDERAL.has(h.cargo_canonico ?? "")
  )

  const declarouPorHistorico = c.historico.some((h) => {
    if (!CARGOS_ELETIVOS.has(h.cargo_canonico ?? "")) return false
    if (h.tipo_evento !== "mandato" && h.tipo_evento !== "candidatura") return false
    const inicio = h.periodo_inicio
    return inicio !== null && inicio <= ANO_ULTIMA_ELEICAO_REGISTRADA
  })

  return {
    cotaParlamentar: mandatosFederais.some((h) => {
      const fim = fimEfetivo(h)
      return fim !== null && fim >= ANO_INICIO_COTA_PARLAMENTAR
    }),
    votacoesChave: mandatosFederais.some((h) => {
      const fim = fimEfetivo(h)
      return fim !== null && fim >= ANO_INICIO_VOTACOES_CHAVE
    }),
    projetosLei: mandatos.some((h) => CARGOS_PARLAMENTAR.has(h.cargo_canonico ?? "")),
    legislacaoExecutivo: mandatos.some((h) => CARGOS_CHEFIA_EXECUTIVO.has(h.cargo_canonico ?? "")),
    declarouAoTse: c.temSqNoSeed || c.temSqAtualNoBanco === true || declarouPorHistorico,
    parlamentarFederalQualquerEpoca: mandatosFederais.length > 0
  }
}

/**
 * Fontes que não deveriam ser consultadas para este candidato.
 *
 * `nunca_verificado` só pode representar trabalho realmente pendente. Câmara,
 * Jarbas, Senado e CEAPS são diferentes das fontes de busca por nome: os próprios
 * ingests pulam quem não tem o ID oficial correspondente. O histórico entra
 * como segunda prova para não esconder um ID ausente no seed: se há mandato de
 * deputado federal ou senador registrado, a fonte continua aplicável e a falta
 * de tentativa continua visível.
 *
 * Uma tentativa já registrada sempre prevalece sobre esta inferência no eixo
 * por fonte. A função só classifica a ausência de tentativa.
 */
export function calcularFontesNaoAplicaveis(
  c: CandidatoCoverage
): Readonly<Record<string, string>> {
  const mandatos = c.historico.filter((h) => h.tipo_evento === "mandato")
  const foiDeputadoFederal = mandatos.some((h) => h.cargo_canonico === "Deputado Federal")
  const foiSenador = mandatos.some((h) => h.cargo_canonico === "Senador")
  const naoAplicaveis: Record<string, string> = {}

  if (!c.temIdCamaraNoSeed && !foiDeputadoFederal) {
    const motivo = "N/A pelo histórico e pelo seed: sem mandato ou ID da Câmara"
    naoAplicaveis.camara = motivo
    naoAplicaveis.jarbas = motivo
  }
  if (!c.temIdSenadoNoSeed && !foiSenador) {
    const motivo = "N/A pelo histórico e pelo seed: sem mandato ou ID do Senado"
    naoAplicaveis.senado = motivo
    naoAplicaveis["ceaps-senado"] = motivo
  }

  return naoAplicaveis
}

/**
 * Patrimônio por eleição aplicável (2026-08-07).
 *
 * Eleições aplicáveis: anos a partir de `PATRIMONIO_ANO_INICIAL_APLICAVEL`
 * vindos de três fontes, em união deduplicada:
 *   1. histórico com proveniência `tse` (o ingest do TSE grava o ANO DA
 *      ELEIÇÃO em `periodo_inicio`, mesmo quando o evento é mandato);
 *   2. anos com bem publicado (`patrimonioAnos`);
 *   3. anos com ausência oficial confirmada (`patrimonioAusenciasOficiais`).
 *
 * Por ano, o estado é: publicado (há bem), vazio_confirmado (o pacote oficial
 * bem_candidato foi lido sem bens para o SQ) ou lacuna (eleição aplicável sem
 * dado nem confirmação). Publicado precede vazio_confirmado se os dois
 * aparecerem para o mesmo ano.
 */
export interface PatrimonioPorEleicao {
  aplicaveis: number[]
  publicados: number[]
  ausenciasConfirmadas: number[]
  lacunas: number[]
}

export function patrimonioPorEleicao(c: CandidatoCoverage): PatrimonioPorEleicao {
  const anos = new Set<number>()
  if (c.temSqAtualNoBanco === true && CARGOS_ELETIVOS.has(c.cargo_disputado ?? "")) {
    anos.add(ANO_ULTIMA_ELEICAO_REGISTRADA)
  }
  for (const ano of anosDePleitoDisputado(
    c.historico.map((h) => ({
      periodo_inicio: h.periodo_inicio,
      periodo_fim: h.periodo_fim,
      proveniencia: h.proveniencia,
      cargo: h.cargo_canonico,
      eleito_por: h.eleito_por,
      observacoes: h.observacoes,
    })),
    PATRIMONIO_ANO_INICIAL_APLICAVEL,
  )) anos.add(ano)
  for (const ano of c.patrimonioAnos) {
    if (ano >= PATRIMONIO_ANO_INICIAL_APLICAVEL) anos.add(ano)
  }
  for (const ano of c.patrimonioAusenciasOficiais) {
    if (ano >= PATRIMONIO_ANO_INICIAL_APLICAVEL) anos.add(ano)
  }

  const aplicaveis = [...anos].sort((a, b) => a - b)
  const publicadosSet = new Set(c.patrimonioAnos)
  const ausenciasSet = new Set(c.patrimonioAusenciasOficiais)
  const publicados: number[] = []
  const ausenciasConfirmadas: number[] = []
  const lacunas: number[] = []
  for (const ano of aplicaveis) {
    if (publicadosSet.has(ano)) publicados.push(ano)
    else if (ausenciasSet.has(ano)) ausenciasConfirmadas.push(ano)
    else lacunas.push(ano)
  }
  return { aplicaveis, publicados, ausenciasConfirmadas, lacunas }
}

export interface ColunaDef {
  key: string
  label: string
}

/** Ordem das colunas na tabela. */
export const COLUNAS: ColunaDef[] = [
  { key: "foto", label: "Foto" },
  { key: "foto_origem", label: "Origem da foto" },
  { key: "bio", label: "Bio" },
  { key: "redes", label: "Redes sociais" },
  { key: "dados", label: "Dados pessoais" },
  { key: "cargos", label: "Cargos ocupados" },
  { key: "partidos", label: "Hist. partidário" },
  { key: "patrimonio", label: "Patrimônio (anos)" },
  { key: "evolucao", label: "Evolução patrimonial" },
  { key: "bens", label: "Bens ano a ano" },
  { key: "financiamento", label: "Financiamento (anos)" },
  { key: "doadores", label: "Doadores detalhados" },
  { key: "votos", label: "Votações-chave" },
  { key: "contradicoes", label: "Contradições" },
  { key: "processos", label: "Processos judiciais" },
  // NAO chamar de "Destaques". A ficha publica tem um contador com esse nome que
  // conta TODOS os pontos publicos, inclusive feito_positivo; esta coluna conta os
  // visiveis MENOS os positivos (ver coverage-snapshot.sql). Sao numeros diferentes
  // para o mesmo candidato. Em 04/08/2026 duas medidas homonimas discordaram e a
  // discordancia virou alarme de regressao que nao existia; a licao esta escrita em
  // docs/cobertura-de-dados.md. A renomeacao publica de Alertas para Destaques
  // reabriu o mesmo buraco aqui, e o rotulo volta a dizer o que a coluna mede.
  { key: "alertas", label: "Alertas (sem positivos)" },
  { key: "projetos", label: "Projetos de lei" },
  { key: "destaques", label: "Proj. em destaque" },
  { key: "gastos", label: "Cota parlamentar" },
  { key: "legexec", label: "Legislação do Executivo" },
  { key: "noticias", label: "Notícias" },
  { key: "programa", label: "Programa de governo 2026" },
  { key: "posicoes", label: "Posições (quiz)" },
  { key: "espectro", label: "Espectro do partido (quiz)" },
  { key: "sancoes", label: "Sanções" },
  { key: "revisar", label: "Aguardando aprovação" }
]

/** As 16 colunas que entram no índice de preenchimento. */
export const COLUNAS_DO_INDICE = [
  "foto",
  "bio",
  "redes",
  "dados",
  "patrimonio",
  "evolucao",
  "bens",
  "financiamento",
  "doadores",
  "votos",
  "projetos",
  "gastos",
  "legexec",
  "noticias",
  "programa",
  "posicoes"
] as const

function cell(state: CellState, text: string, tip?: string): Cell {
  return tip ? { state, text, tip } : { state, text }
}

/**
 * Cardinalidade que a Câmara declarou para o acervo autoral do candidato, do
 * registro dedicado que `ingest-camara.ts` grava em `coleta_log`.
 *
 * Issue #138. A régua precisa de um denominador para distinguir acervo completo
 * de acervo truncado, e `projetos_lei` sozinha não tem essa informação: 100
 * linhas podem ser o acervo inteiro de um deputado de mandato curto ou o corte
 * do `slice(0, 100)` sobre 2089. Só a fonte sabe, e é por isso que o ingest
 * passou a gravar o número dela.
 *
 * `null` quando o log não foi lido, quando o candidato nunca teve ingest da
 * Câmara depois desta mudança, ou quando a tentativa falhou. Nos três casos a
 * resposta honesta é "não sei", nunca "está completo".
 */
function declaradoNaCamara(coletas: ColetaPorFonte | undefined): number | null {
  const registro = coletas?.[FONTE_CAMARA_PROPOSICOES]
  if (!registro) return null
  if (registro.resultado === "erro" || registro.resultado === "indeterminado") return null
  const volume = registro.volume
  return typeof volume === "number" && Number.isFinite(volume) && volume >= 0 ? volume : null
}

/**
 * Célula zerada de uma coluna com procedência: o "0" passa a vir acompanhado do
 * motivo, e a dica diz o que aquele zero autoriza afirmar.
 */
function cellZero(coluna: string, c: CandidatoCoverage, semDado: string): Cell {
  const prov = provenienciaDoZero(coluna, c.coletas, calcularFontesNaoAplicaveis(c))
  const explicacao: Record<Proveniencia, string> = {
    zero_provado: `${semDado}: todas as fontes foram consultadas e responderam vazio`,
    coletado: `${semDado} nesta régua, mas a coleta trouxe dado: o vazio é do recorte, não da fonte`,
    nunca_verificado: `${semDado}, e alguma fonte nunca registrou tentativa: este zero não afirma nada`,
    nao_sabemos: `${semDado}, mas alguma coleta falhou ou não soube dizer: o zero não vale como resposta`,
    sem_ingest: `${semDado}: nenhum ingest alimenta esta coluna, só curadoria manual`,
    curadoria_concluida_sem_achado: `${semDado}: a curadoria terminou sem achado no escopo declarado; não é prova absoluta de ausência`,
    desconhecida: `${semDado}; o log de coleta não foi lido nesta execução`
  }
  return {
    state: "zero",
    text: "0",
    tip: explicacao[prov],
    proveniencia: prov
  }
}

function anos(n: number): string {
  return `${n} ano${n > 1 ? "s" : ""}`
}

export function calcularCelulas(c: CandidatoCoverage): Record<string, Cell> {
  const ap = calcularAplicabilidade(c)
  const out: Record<string, Cell> = {}

  const fotoValida = c.foto && !isPhotoPlaceholder(c.foto_url)
  out.foto = fotoValida ? cell("ok", "✓") : cell("missing", "—")
  if (!fotoValida) {
    out.foto_origem = cell("na", "—", "sem foto")
  } else if (!c.foto_origem) {
    out.foto_origem = cell(
      "partial",
      "Não lida",
      "snapshot antigo ou sem origem técnica; não afirma autoria ou licença"
    )
  } else {
    const rotulos: Record<FotoOrigem, string> = {
      local: "Local",
      tse: "TSE",
      wikimedia: "Wikimedia",
      oficial: "Órgão oficial",
      terceiro: "Terceiro",
    }
    const origemMaisForte = ["tse", "wikimedia", "oficial"].includes(c.foto_origem)
    out.foto_origem = cell(
      origemMaisForte ? "ok" : "partial",
      rotulos[c.foto_origem],
      "classificação técnica pela URL; não afirma autoria, licença ou titularidade"
    )
  }
  out.bio = c.bio ? cell("ok", "✓") : cell("missing", "—")
  out.redes = c.redes
    ? cell("ok", "✓")
    : c.redesVazioConfirmado
      ? cell("zero", "0", "TSE consultado; nenhum site ou rede declarado para a candidatura")
      : cell("missing", "—")

  const dp = [
    c.idade !== null,
    Boolean(c.naturalidade),
    Boolean(c.formacao),
    Boolean(c.profissao)
  ].filter(Boolean).length
  out.dados = cell(
    dp >= 3 ? "ok" : dp >= 1 ? "partial" : "missing",
    `${dp}/4`,
    "idade (view pública), naturalidade, formação, profissão"
  )

  const mandatos = c.historico.filter((h) => h.tipo_evento === "mandato").length
  const candidaturas = c.historico.filter((h) => h.tipo_evento === "candidatura").length
  const eventosTrajetoria = mandatos + candidaturas
  out.cargos = eventosTrajetoria > 0
    ? cell(
        "ok",
        `${mandatos} mandato${mandatos === 1 ? "" : "s"} · ${candidaturas} candidatura${candidaturas === 1 ? "" : "s"}`,
        "trajetória eleitoral: mandatos e candidaturas são contados separadamente",
      )
    : cellZero("cargos", c, "nenhum evento eleitoral registrado")
  out.partidos =
    c.mudancas > 0
      ? cell("ok", String(c.mudancas))
      : cellZero("partidos", c, "sem troca registrada")

  // Patrimônio mede POR ELEIÇÃO aplicável, não por presença: o denominador são
  // as eleições >= 2006 (histórico tse, bens publicados, ausências confirmadas),
  // e candidatura aplicável sem dado nem confirmação é lacuna ainda que haja bem
  // publicado em outro ano. O rótulo mostra a conta (cobertos/aplicáveis).
  const pat = c.patrimonioAnos.length
  const porEleicao = patrimonioPorEleicao(c)

  if (!ap.declarouAoTse) {
    out.patrimonio = cell(
      "na",
      "n/a",
      "nunca disputou eleição nem teve mandato eletivo: não há declaração ao TSE"
    )
  } else if (porEleicao.aplicaveis.length === 0) {
    out.patrimonio =
      pat > 0
        ? cell("ok", anos(pat), "bem publicado fora da janela medida (a partir de 2006)")
        : cell(
            "na",
            "n/a",
            "declarou ao TSE, mas nenhuma eleição aplicável na janela medida (a partir de 2006)"
          )
  } else {
    const { aplicaveis, publicados, ausenciasConfirmadas, lacunas } = porEleicao
    const cobertos = publicados.length + ausenciasConfirmadas.length
    const texto =
      ausenciasConfirmadas.length > 0
        ? `${cobertos}/${aplicaveis.length} · ${ausenciasConfirmadas.length} ausência${
            ausenciasConfirmadas.length > 1 ? "s" : ""
          } confirmada${ausenciasConfirmadas.length > 1 ? "s" : ""}`
        : `${cobertos}/${aplicaveis.length}`
    const partes = [
      `eleições aplicáveis a partir de ${PATRIMONIO_ANO_INICIAL_APLICAVEL}: ${aplicaveis.join(", ")}`
    ]
    if (publicados.length > 0) partes.push(`com dado publicado: ${publicados.join(", ")}`)
    if (ausenciasConfirmadas.length > 0) {
      partes.push(
        `ausência confirmada (pacote oficial bem_candidato do TSE sem bens para o SQ): ${ausenciasConfirmadas.join(", ")}`
      )
    }
    if (lacunas.length > 0) partes.push(`sem dado nem confirmação: ${lacunas.join(", ")}`)
    out.patrimonio = cell(
      lacunas.length === 0 ? "ok" : publicados.length > 0 ? "partial" : "missing",
      texto,
      partes.join(". ")
    )
  }

  // Evolução e bens continuam medindo o conjunto PUBLICADO: a régua por eleição
  // muda a célula de patrimônio, não o denominador delas. Sem publicado e sem
  // lacuna (nada aplicável na janela, ou tudo com ausência oficial confirmada),
  // não há conjunto a medir: n/a, não lacuna.
  if (pat > 0) {
    out.evolucao =
      pat >= 2 ? cell("ok", "✓") : cell("partial", "1 ano", "evolução precisa de 2 anos ou mais")
    const bens = c.patrimonioAnosComBens.length
    out.bens = cell(bens === pat ? "ok" : bens > 0 ? "partial" : "missing", `${bens}/${pat}`)
  } else if (!ap.declarouAoTse) {
    const tip = "nunca disputou eleição nem teve mandato eletivo: não há declaração ao TSE"
    out.evolucao = cell("na", "n/a", tip)
    out.bens = cell("na", "n/a", tip)
  } else if (porEleicao.lacunas.length === 0) {
    const tip =
      porEleicao.aplicaveis.length === 0
        ? "declarou ao TSE, mas nenhuma eleição aplicável na janela medida (a partir de 2006)"
        : "ausência oficial confirmada para todas as eleições aplicáveis: não há conjunto publicado a medir"
    out.evolucao = cell("na", "n/a", tip)
    out.bens = cell("na", "n/a", tip)
  } else {
    out.evolucao = cell("missing", "—")
    out.bens = cell("missing", "—")
  }

  const fin = c.financiamentoAnos.length
  const verificacoesFin = c.financiamentoVerificacoes ?? []
  const ausenciasFin = new Set(
    verificacoesFin.filter((v) => v.resultado === "ausencia_oficial").map((v) => v.ano_eleicao),
  )
  const anosAplicaveisFin = anosDePleitoDisputado(
    c.historico.map((h) => ({
      periodo_inicio: h.periodo_inicio,
      periodo_fim: h.periodo_fim,
      proveniencia: h.proveniencia,
      cargo: h.cargo_canonico,
      eleito_por: h.eleito_por,
      observacoes: h.observacoes,
    })),
    FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE,
  )
  // A eleição de 2026 já aparece na trajetória, mas a prestação final ainda
  // não é devida. O próprio contrato público a classifica como pleito futuro.
  for (const ano of anosAplicaveisFin) {
    if (ano > FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA) anosAplicaveisFin.delete(ano)
  }
  for (const ano of c.financiamentoAnos) {
    if (ano <= FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA) anosAplicaveisFin.add(ano)
  }
  for (const v of verificacoesFin) {
    if (v.ano_eleicao <= FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA) anosAplicaveisFin.add(v.ano_eleicao)
  }
  const publicadosFin = new Set(c.financiamentoAnos)
  const lacunasFin = [...anosAplicaveisFin].filter((ano) => !publicadosFin.has(ano) && !ausenciasFin.has(ano))
  const cobertosFin = [...anosAplicaveisFin].filter((ano) => publicadosFin.has(ano) || ausenciasFin.has(ano))

  if (anosAplicaveisFin.size > 0) {
    out.financiamento = cell(
      lacunasFin.length === 0 ? "ok" : cobertosFin.length > 0 ? "partial" : "missing",
      `${cobertosFin.length}/${anosAplicaveisFin.size}`,
      lacunasFin.length > 0 ? `sem dado nem confirmação: ${lacunasFin.sort((a, b) => a - b).join(", ")}` : undefined,
    )
    const positivos = c.financiamentoAnosComReceitaPositiva ?? c.financiamentoAnos
    const anosComDoadores = new Set(c.financiamentoAnosComDoadores)
    const doadores = positivos.filter((ano) => anosComDoadores.has(ano)).length
    out.doadores = positivos.length === 0
      ? cell("zero", "0", "nenhum pleito publicado com receita positiva exige lista de doadores")
      : cell(
          doadores === positivos.length ? "ok" : doadores > 0 ? "partial" : "missing",
          `${doadores}/${positivos.length}`,
        )
  } else if (fin > 0) {
    out.financiamento = cell("ok", anos(fin))
    const positivos = c.financiamentoAnosComReceitaPositiva ?? c.financiamentoAnos
    const anosComDoadores = new Set(c.financiamentoAnosComDoadores)
    const doadores = positivos.filter((ano) => anosComDoadores.has(ano)).length
    out.doadores = positivos.length === 0
      ? cell("zero", "0", "nenhum pleito publicado com receita positiva exige lista de doadores")
      : cell(doadores === positivos.length ? "ok" : doadores > 0 ? "partial" : "missing", `${doadores}/${positivos.length}`)
  } else if (!ap.declarouAoTse) {
    const tip = "nunca disputou eleição nem teve mandato eletivo: não há prestação de contas ao TSE"
    out.financiamento = cell("na", "n/a", tip)
    out.doadores = cell("na", "n/a", tip)
  } else {
    const tip = c.temSqAtualNoBanco === true
      ? "nenhum pleito anterior aplicável; a prestação de contas de 2026 ainda não é devida"
      : `nenhum pleito aplicável na série digital do TSE (${FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE}-${FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA})`
    out.financiamento = cell("na", c.temSqAtualNoBanco === true ? "pleito em curso" : "n/a", tip)
    out.doadores = cell("na", c.temSqAtualNoBanco === true ? "pleito em curso" : "n/a", tip)
  }

  const votosAplicaveis = typeof c.votosAplicaveis === "number" && Number.isFinite(c.votosAplicaveis)
    ? c.votosAplicaveis
    : null
  if (votosAplicaveis === 0) {
    out.votos = cell("na", "n/a", "nenhuma votação-chave coincide com os anos e a casa do mandato federal")
  } else if (c.votos > 0 && votosAplicaveis !== null) {
    out.votos = cell(
      c.votos >= votosAplicaveis ? "ok" : "partial",
      `${c.votos}/${votosAplicaveis}`,
      c.votos < votosAplicaveis ? `${votosAplicaveis - c.votos} votação(ões) aplicável(is) sem registro` : undefined
    )
  } else if (c.votos > 0) {
    out.votos = cell("ok", String(c.votos), "snapshot antigo sem cardinalidade de votações aplicáveis")
  } else if ((votosAplicaveis ?? (ap.votacoesChave ? 1 : 0)) > 0) {
    const prov = provenienciaDoZero("votos", c.coletas, calcularFontesNaoAplicaveis(c))
    out.votos = prov === "zero_provado"
      ? cell("zero", "0", "fontes oficiais aplicáveis consultadas; nenhum voto nas votações-chave do recorte")
      : cell(
          "missing",
          "—",
          "há votação-chave cujo ano e casa coincidem com o mandato federal, sem voto registrado"
        )
  } else if (ap.parlamentarFederalQualquerEpoca) {
    out.votos = cell(
      "na",
      "n/a",
      `mandato federal encerrado antes de ${ANO_INICIO_VOTACOES_CHAVE}, fora da janela das votações-chave`
    )
  } else {
    out.votos = cell(
      "na",
      "n/a",
      "nunca foi deputado federal ou senador (pelo histórico registrado)"
    )
  }

  out.contradicoes =
    c.contradicoes > 0
      ? cell("ok", String(c.contradicoes))
      : cellZero("contradicoes", c, "nenhuma contradição registrada")
  out.processos =
    c.processos > 0
      ? cell("ok", String(c.processos))
      : cellZero("processos", c, "nenhum processo registrado")
  out.alertas =
    c.alertas > 0
      ? cell("ok", String(c.alertas))
      : cellZero("alertas", c, "nenhum ponto de atenção público")

  const declaradoCamara = declaradoNaCamara(c.coletas)
  // Vistoria dos PRs #141/#142: o denominador da Câmara só se compara com as
  // linhas de fonte Câmara. `c.projetos` soma Senado e curadoria, então 100 da
  // Câmara + 104 do Senado passariam por 204 declaradas, o falso completo de
  // novo. Snapshot antigo não traz `projetosCamara`: aí a resposta é "não sei".
  const projetosCamara =
    typeof c.projetosCamara === "number" && Number.isFinite(c.projetosCamara)
      ? c.projetosCamara
      : null
  const truncado =
    declaradoCamara != null && projetosCamara != null && projetosCamara < declaradoCamara

  if (c.projetos > 0) {
    // Issue #138: `> 0` virava `ok`, e 100 de 2089 passava por acervo completo.
    // Completo agora exige alcançar a cardinalidade que a fonte declarou; sem
    // essa declaração no log, a célula diz que não sabe, em vez de afirmar.
    out.projetos = truncado
      ? cell(
          "partial",
          `${projetosCamara}/${declaradoCamara}`,
          `truncado: a Câmara declara ${declaradoCamara} proposições autorais e o banco tem ` +
            `${projetosCamara} de fonte Câmara (${c.projetos} no total, somando outras fontes)`
        )
      : declaradoCamara == null && c.projetosTemInventarioCompleto
        ? cell("ok", String(c.projetos), "inventário completo no recorte oficial explicitado na ficha")
        : declaradoCamara == null
        ? cell(
            "partial",
            String(c.projetos),
            "sem cardinalidade declarada pela fonte no log de coleta: não dá para afirmar que o acervo está completo"
          )
        : projetosCamara == null
          ? cell(
              "partial",
              String(c.projetos),
              "snapshot sem a contagem por fonte (projetosCamara): não dá para comparar com o declarado pela Câmara"
            )
          : cell("ok", String(c.projetos))
    const ocultos = c.destaquesTotais - c.destaquesVisiveis
    out.destaques =
      c.destaquesVisiveis > 0
        ? cell(
            "ok",
            String(c.destaquesVisiveis),
            ocultos > 0
              ? `${ocultos} destaque(s) marcado(s) no banco não aparecem: a ficha carrega só os 25 projetos mais recentes`
              : undefined
          )
        : cell(
            "partial",
            "0",
            ocultos > 0
              ? `${ocultos} destaque(s) marcado(s) no banco, nenhum dentro dos 25 projetos mais recentes que a ficha carrega`
              : "tem projetos, sem curadoria de destaque"
          )
  } else if (ap.projetosLei) {
    const prov = provenienciaDoZero("projetos", c.coletas, calcularFontesNaoAplicaveis(c))
    if (prov === "zero_provado") {
      out.projetos = cell("zero", "0", "fontes oficiais aplicáveis consultadas; nenhuma proposição autoral no recorte")
      out.destaques = cell("zero", "0", "sem proposição autoral no recorte para destacar")
    } else {
      out.projetos = cell("missing", "—", "teve mandato parlamentar, sem projeto registrado")
      out.destaques = cell("missing", "—")
    }
  } else {
    const tip = "nunca exerceu mandato parlamentar (pelo histórico registrado)"
    out.projetos = cell("na", "n/a", tip)
    out.destaques = cell("na", "n/a", tip)
  }

  const g = c.gastosAnos.length
  if (g > 0) {
    out.gastos = cell("ok", anos(g))
  } else if (ap.cotaParlamentar) {
    const prov = provenienciaDoZero("gastos", c.coletas, calcularFontesNaoAplicaveis(c))
    out.gastos = prov === "zero_provado"
      ? cell("zero", "0", "fontes oficiais aplicáveis consultadas; nenhuma despesa no recorte")
      : cell("missing", "—", "mandato federal na era do CEAP digital, sem cota registrada")
  } else if (ap.parlamentarFederalQualquerEpoca) {
    out.gastos = cell(
      "na",
      "n/a",
      `mandato federal encerrado antes de ${ANO_INICIO_COTA_PARLAMENTAR}, quando a cota digital (CEAP) ainda não existia`
    )
  } else {
    out.gastos = cell("na", "n/a", "cota parlamentar só existe para deputado federal ou senador")
  }

  if (c.legislacaoExecutivo > 0) {
    out.legexec = c.legislacaoExecutivoTemInventarioCompleto
      ? cell("ok", String(c.legislacaoExecutivo), "inventário completo no recorte oficial explicitado na ficha")
      : cell("partial", String(c.legislacaoExecutivo), "há atos publicados, mas nenhum coverage_id reconhecido como inventário completo")
  } else if (ap.legislacaoExecutivo) {
    out.legexec = cell("missing", "—", "chefiou Executivo, sem norma registrada")
  } else {
    out.legexec = cell("na", "n/a", "nunca chefiou Executivo (presidente, governador ou prefeito)")
  }

  out.noticias = c.noticias > 0 ? cell("ok", String(c.noticias)) : cell("missing", "—")

  if (!new Set(["Presidente", "Governador"]).has(c.cargo_disputado ?? "")) {
    out.programa = cell("na", "n/a", "programa de governo é atribuído à candidatura titular ao Executivo")
  } else {
    out.programa = c.programaGovernoEstado === "aprovado"
      ? cell("ok", "✓", "documento oficial extraído, revisado e publicado na ficha")
      : c.programaGovernoEstado === "sem_documento_oficial"
        ? cell("zero", "0", "TSE consultado; nenhum documento oficial foi publicado para a candidatura")
        : cell(
            "missing",
            "—",
            c.programaGovernoEstado
              ? `programa ainda não publicável: ${c.programaGovernoEstado}`
              : "ficha sem artefato de programa de governo de 2026"
          )
  }

  if (CARGOS_COM_QUIZ.has(c.cargo_disputado ?? "")) {
    const uteis = new Set(TEMAS_QUIZ)
    const verificados = new Set(c.posicoesTemasVerificados.filter((tema) => uteis.has(tema)))
    const semDeclaracao = new Set(
      (c.posicoesTemasSemDeclaracao ?? []).filter((tema) => uteis.has(tema) && !verificados.has(tema))
    )
    const n = verificados.size
    const total = TEMAS_QUIZ.length
    const pendentes = c.posicoesTemasPendentes.filter(
      (tema) => uteis.has(tema) && !verificados.has(tema)
    ).length
    const cobertos = n + semDeclaracao.size
    const dica = [
      cobertos >= total ? null : `${total - cobertos} tema(s) sem posição nem omissão confirmada`,
      semDeclaracao.size > 0 ? `${semDeclaracao.size} omissão(ões) de declaração confirmada(s)` : null,
      pendentes > 0 ? `${pendentes} posição(ões) curada(s) aguardando sua revisão` : null,
      `temas que o quiz consome: ${TEMAS_QUIZ.join(", ")}`,
    ]
      .filter(Boolean)
      .join("; ")
    out.posicoes = cell(
      cobertos >= total ? "ok" : cobertos > 0 ? "partial" : "missing",
      semDeclaracao.size > 0 ? `${n}/${total} · ${semDeclaracao.size} omissões confirmadas` : `${n}/${total}`,
      dica || undefined
    )
  } else {
    out.posicoes = cell("na", "n/a", "quiz só existe para Presidente e Governador")
  }

  if (!CARGOS_COM_QUIZ.has(c.cargo_disputado ?? "")) {
    out.espectro = cell("na", "n/a", "quiz só existe para Presidente e Governador")
  } else if (!c.partido_sigla) {
    out.espectro = cell("missing", "—", "candidato sem sigla de partido")
  } else {
    const canonica = resolveCanonicalPartySigla(c.partido_sigla) ?? c.partido_sigla
    out.espectro = getEspectroPartidario(canonica)
      ? cell("ok", "✓", `espectro editorial mapeado para ${canonica}`)
      : cell(
          "missing",
          "—",
          `${canonica} não está em src/data/quiz/espectro-partidario.ts: falta decisão editorial dos dois eixos`
        )
  }

  out.sancoes =
    c.sancoes > 0
      ? cell("ok", String(c.sancoes))
      : cellZero("sancoes", c, "nenhuma sanção registrada")

  const nRevisar = c.itensRevisar.length
  out.revisar =
    nRevisar > 0
      ? cell(
          "partial",
          String(nRevisar),
          "itens esperando sua aprovação para mudar o que está no ar"
        )
      : cell("zero", "0", "nada esperando revisão")

  return out
}

/** Índice de preenchimento: só colunas aplicáveis; `partial` vale meio ponto. */
export function calcularIndice(celulas: Record<string, Cell>): number {
  let total = 0
  let obtido = 0
  for (const key of COLUNAS_DO_INDICE) {
    const c = celulas[key]
    if (!c || c.state === "na") continue
    total += 1
    if (c.state === "ok") obtido += 1
    else if (c.state === "partial") obtido += 0.5
  }
  return total === 0 ? 0 : Math.round((100 * obtido) / total)
}
