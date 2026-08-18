/**
 * Montagem da aba Destaques (itens 4 e 14 da triagem de 09/08/2026).
 *
 * ## O problema medido
 *
 * A aba mostrava só `pontos_atencao`, e por isso saía com 0 ou 1 na maioria das
 * fichas. O reflexo natural seria "encher a aba", e é o reflexo errado: o gate
 * desta frente é **zero afirmações falsas**, não zero fichas vazias.
 *
 * O que a aba passa a fazer é outra coisa: mostrar o que a ficha JÁ TEM
 * verificado e não estava chegando aqui, e, onde não há conteúdo, dizer POR QUE
 * não há. As duas metades importam. "Nenhum alerta registrado" é a frase que a
 * aba dizia antes, e ela mistura em silêncio dois estados opostos: consultamos e
 * não achamos nada, e nunca consultamos.
 *
 * ## O que o contrato B-E2 obriga, e o que ele proíbe
 *
 * Fonte: `QA/2026-08-09-trilha-b-contrato-de-dados.md`, publicado pela Trilha B
 * em 09/08/2026, com fixtures em `QA/contratos/trilha-b-fixtures.json`.
 *
 * - **Lista vazia não é ficha limpa.** Quem separa é o campo de proveniência
 *   (`sancoes_verificacao`, `processos_verificacao`), não o tamanho da lista.
 *   Só `encontrado` e `vazio_confirmado` autorizam afirmar algo ao leitor;
 *   `indeterminado` e `erro` exigem "não foi possível verificar", e `null` é
 *   "ainda não verificado".
 * - **Sanção não vira ponto de atenção, e não vai virar no lançamento.** O
 *   guard `motivoRecusaDeFonte()` recusa gravidade alta sem fonte pública. Por
 *   isso a sanção entra aqui por caminho PRÓPRIO, direto de
 *   `sancoes_administrativas`. Esperar que a coleta encha `pontos_atencao` era
 *   o plano que o contrato matou.
 * - **Sanção expirada continua na lista.** Vigência deriva de `data_fim`, não
 *   de um campo `ativo` (que nem chega à superfície). Somar a lista inteira
 *   como vigente anunciaria como atual o que já acabou.
 *
 * Este módulo é puro: recebe o que a ficha já tem e devolve o que exibir. Não
 * busca nada, não infere nada que a fonte não disse, e não converte ausência em
 * afirmação.
 */

import type {
  HistoricoPolitico,
  PontoAtencao,
  Processo,
  SancaoAdministrativa,
  SancoesVerificacao,
  VotoCandidato,
} from "@/lib/types"
import type { PatrimonioEleicaoPublico } from "@/lib/public-profile-dto"
import { canonicalCargo } from "@/lib/cargo-utils"
import { resolveHistoricoRowProvenance } from "@/lib/historico-provenance"

/**
 * Vocabulário fechado do contrato B-E2. Repetido aqui como tipo para o
 * compilador cobrar o caso novo se a Trilha B acrescentar um estado.
 */
export type ResultadoVerificacao =
  | "encontrado"
  | "vazio_confirmado"
  | "sem_achado_no_escopo"
  | "indeterminado"
  | "erro"
  | "nao_aplicavel"

/** O que a superfície pode dizer sobre uma fonte que não trouxe conteúdo. */
export type EstadoDaFonte =
  | { tipo: "tem_conteudo" }
  /** `vazio_confirmado`: consultado, nada encontrado. Único vazio que afirma. */
  | { tipo: "vazio_confirmado"; verificadoEm: string | null }
  /** `indeterminado` e `erro`: não foi possível verificar. Nunca ficha limpa. */
  | { tipo: "nao_foi_possivel_verificar"; motivo: ResultadoVerificacao; verificadoEm: string | null }
  /** `sem_achado_no_escopo`: curadoria limitada, nunca ausência. */
  | { tipo: "curadoria_limitada"; verificadoEm: string | null }
  /** `nao_aplicavel`: a fonte não se aplica a esta pessoa. */
  | { tipo: "nao_aplicavel"; verificadoEm: string | null }
  /** Sem linha de verificação: nunca consultado. */
  | { tipo: "nunca_verificado" }
  /**
   * `pontos_atencao` sem linha. NÃO é "consultado, nada encontrado": a tabela é
   * curadoria editorial e não tem proveniência de coleta que autorize afirmar
   * consulta. Também não fecha cobertura factual, porque não é fonte factual.
   */
  | { tipo: "sem_curadoria_editorial" }

export interface FonteDeDestaque {
  chave: "pontos_atencao" | "sancoes" | "processos" | "trajetoria" | "patrimonio" | "votacoes"
  rotulo: string
  estado: EstadoDaFonte
  /**
   * `editorial` não entra no cálculo de cobertura factual. Curadoria ausente é
   * ausência de curadoria, e tratá-la como consulta feita foi o defeito que o
   * bloqueio de 10/08 apontou.
   */
  categoria: "editorial" | "factual"
  /** Rastro da tentativa que sustenta o estado, sem transformar ausência em fato. */
  proveniencia?: {
    fonte: string
    detalhe: string | null
    url: string | null
  }
}

export interface DestaquesDaFicha {
  pontosAtencao: PontoAtencao[]
  /** Sanções vigentes hoje, pela regra de `data_fim` do contrato. */
  sancoesVigentes: SancaoAdministrativa[]
  /** Sanções com `data_fim` no passado. Continuam na lista, rotuladas. */
  sancoesExpiradas: SancaoAdministrativa[]
  processos: Processo[]
  /** Mandatos efetivamente exercidos, pela regra positiva fail-closed. */
  mandatos: HistoricoPolitico[]
  /** Declarações de bens publicadas, com o ano, o valor e a fonte oficial. */
  patrimonioPublicado: DestaquePatrimonio[]
  /** Votos em votação-chave. O item 7 garante que só entra votação exata. */
  votacoes: VotoCandidato[]
  /** Itens que a aba efetivamente exibe como conteúdo. */
  totalExibido: number
  /** Uma linha por fonte, dizendo o que dá para afirmar sobre ela. */
  fontes: FonteDeDestaque[]
  /**
   * `true` quando não há conteúdo E toda fonte fechou cobertura. É o único caso
   * em que a ficha pode dizer ao leitor que não há nada a mostrar.
   */
  vazioHonesto: boolean
  /**
   * `true` quando não há conteúdo e alguma fonte não fechou cobertura. A ficha
   * tem de dizer que não sabe, e não que não há.
   */
  vazioPorNaoVerificado: boolean
}

/**
 * Traduz a proveniência do contrato para o que a superfície pode dizer.
 *
 * `null` e `undefined` caem em `nunca_verificado` de propósito, e o contrato é
 * explícito: leitura da view que falha degrada para o mesmo estado neutro,
 * nunca para limpeza.
 */
export function estadoDaFonte(
  temConteudo: boolean,
  verificacao: SancoesVerificacao | null | undefined
): EstadoDaFonte {
  if (temConteudo) return { tipo: "tem_conteudo" }

  const verificadoEm = verificacao?.executado_em ?? null
  const resultado = verificacao?.resultado as ResultadoVerificacao | undefined

  switch (resultado) {
    case "vazio_confirmado":
      return { tipo: "vazio_confirmado", verificadoEm }
    case "nao_aplicavel":
      return { tipo: "nao_aplicavel", verificadoEm }
    case "sem_achado_no_escopo":
      return { tipo: "curadoria_limitada", verificadoEm }
    case "indeterminado":
    case "erro":
      return { tipo: "nao_foi_possivel_verificar", motivo: resultado, verificadoEm }
    case "encontrado":
      // A fonte diz que achou e a lista chegou vazia. Isso é divergência, não
      // ausência: afirmar "nada encontrado" aqui seria contradizer a própria
      // proveniência. Fecha em indeterminado, que é o estado neutro.
      return { tipo: "nao_foi_possivel_verificar", motivo: "indeterminado", verificadoEm }
    default:
      return { tipo: "nunca_verificado" }
  }
}

/** Só estes três fecham cobertura, pelo vocabulário do contrato B-E2. */
export function fechaCobertura(estado: EstadoDaFonte): boolean {
  return (
    estado.tipo === "tem_conteudo" ||
    estado.tipo === "vazio_confirmado" ||
    estado.tipo === "nao_aplicavel"
  )
}

/**
 * Mandato que pode virar destaque. Regra POSITIVA e fail-closed: só promove o
 * que está nomeado aqui, e o default de tudo que não casa é NÃO promover.
 *
 * ## Por que positiva, e não uma lista de exclusões
 *
 * A primeira versão excluía por texto ("...partido..."), e o bloqueio de 10/08
 * mostrou o furo com um caso que nenhuma blacklist pega por acréscimo:
 * `jarir-pereira` era promovido com "Membro da Executiva Estadual do PSOL
 * Ceará", que não contém a palavra "partido". Uma blacklist erra em silêncio e
 * na direção perigosa: o que ela não previu vira afirmação publicada. Uma regra
 * positiva erra na direção segura: o que ela não previu simplesmente não
 * aparece, e some do total.
 *
 * ## O que entra
 *
 * A chave é o **cargo canônico** (`src/lib/cargo-utils.ts`), que é a régua que
 * o projeto já usa para dedup e para a cobertura de patrimônio.
 *
 * 1. **Cargo eletivo**, casamento exato contra o conjunto fechado abaixo. É o
 *    mesmo conjunto de `CARGOS_ELETIVOS` em `scripts/audit/lib/coverage-model.ts`:
 *    disputá-los exige registro de candidatura, o que os torna verificáveis;
 * 2. **Chefia de pasta no Executivo**, ancorada no início do canônico
 *    (`Ministro...`, `Secretário...`). Cargo público nomeado, não partidário.
 *
 * O resto não entra, e a auditoria em `scripts/audit/auditar-mandatos-promoviveis.ts`
 * lista linha a linha o que fica de fora, para a exclusão ser conferível em vez
 * de confiável.
 *
 * ## O guard partidário, que é a segunda rede e não a primeira
 *
 * Cargo partidário não casa com o conjunto eletivo nem começa com Ministro ou
 * Secretário, então a regra positiva já o barra sozinha. O guard existe para o
 * caso de um texto partidário canonizar por acidente para dentro de uma das
 * duas portas ("Secretário de Comunicação do Partido X"), e nunca é o que
 * sustenta a exclusão do `renan-santos` ou do `jarir-pereira`.
 */
const CARGOS_ELETIVOS_PROMOVIVEIS = new Set([
  "Presidente",
  "Vice-Presidente",
  "Governador",
  "Vice-Governador",
  "Prefeito",
  "Vice-Prefeito",
  "Senador",
  "Deputado Federal",
  "Deputado Estadual",
  "Deputado Distrital",
  "Vereador",
])

/** Chefia de pasta: cargo público de nomeação, ancorado no início do canônico. */
const CHEFIA_DE_PASTA_NO_EXECUTIVO = /^(?:ministr[oa]|secret[áa]ri[oa])\b/i

/** Segunda rede: estrutura partidária que por acidente casasse com o positivo. */
const ESTRUTURA_PARTIDARIA = /\b(partido|diret[óo]rio|executiva|federa[çc][ãa]o partid[áa]ria)\b/i

/** Motivo da recusa, em texto, para a auditoria não repetir a regra. */
export type MotivoNaoPromovivel =
  | "nao_e_mandato"
  | "sem_ano_de_inicio"
  | "estrutura_partidaria"
  | "cargo_fora_da_regra_positiva"

export function motivoNaoPromoverMandato(linha: HistoricoPolitico): MotivoNaoPromovivel | null {
  if (linha.tipo_evento !== "mandato") return "nao_e_mandato"
  if (typeof linha.periodo_inicio !== "number") return "sem_ano_de_inicio"

  const canonico = (linha.cargo_canonico ?? canonicalCargo(linha.cargo ?? "")).trim()
  // A regra positiva vem PRIMEIRO de propósito: assim a auditoria mostra
  // quanto o guard partidário pega ALÉM dela. Em 10/08/2026 esse número é
  // zero, e é a evidência de que a exclusão do `jarir-pereira` e do
  // `renan-santos` não depende de reconhecer o texto de nenhum dos dois.
  const passaNoPositivo =
    CARGOS_ELETIVOS_PROMOVIVEIS.has(canonico) || CHEFIA_DE_PASTA_NO_EXECUTIVO.test(canonico)
  if (!passaNoPositivo) return "cargo_fora_da_regra_positiva"
  if (ESTRUTURA_PARTIDARIA.test(canonico)) return "estrutura_partidaria"
  return null
}

/**
 * Proveniência EFETIVA do card de mandato, nunca a coluna crua.
 *
 * `historico_politico.proveniencia` é nula em 11 dos mandatos promovidos, que
 * são linhas legadas anteriores à coluna. Ler a coluna direto fazia o card
 * omitir a fonte nesses casos, e omissão de fonte num card que afirma um
 * mandato é o oposto do que esta frente existe para fazer. O contrato canônico
 * (`src/lib/historico-provenance.ts`) resolve o legado por `observacoes`, e o
 * pior caso dele é `manual`, nunca vazio.
 *
 * Os rótulos dizem o que a fonte é, sem promover nenhuma a mais do que ela é:
 * curadoria manual continua sendo curadoria manual, e não vira "oficial".
 */
const ROTULO_DE_PROVENIENCIA: Record<string, string> = {
  tse: "TSE",
  wikidata: "Wikidata",
  manual: "curadoria manual",
  misto: "fontes combinadas",
  unknown: "fonte não identificada",
}

export function provenienciaDoMandato(linha: HistoricoPolitico): {
  chave: string
  rotulo: string
} {
  const chave = resolveHistoricoRowProvenance(linha)
  return { chave, rotulo: ROTULO_DE_PROVENIENCIA[chave] ?? ROTULO_DE_PROVENIENCIA.unknown }
}

/**
 * Vigência pela `data_fim`, que é a regra observável do contrato (1.1).
 *
 * `data_fim` nula é sanção sem término no cadastro, e o CEAF nunca tem: conta
 * como vigente. Data no futuro também. Só data no passado expira.
 */
export function sancaoVigente(sancao: SancaoAdministrativa, hoje: Date): boolean {
  const fim = sancao.data_fim
  if (!fim) return true
  const data = new Date(`${fim}T23:59:59Z`)
  if (Number.isNaN(data.getTime())) return true
  return data.getTime() >= hoje.getTime()
}

/**
 * Declaração de bens que a aba exibe. O card mostra ano, valor e link oficial,
 * e cada um desses três vem da fonte: nada é estimado nem interpolado. Sem
 * `valorTotal`, o card diz só que a declaração existe, com o link.
 */
export interface DestaquePatrimonio {
  ano: number
  valorTotal: number | null
  fonteUrl: string | null
}

export interface EntradaDeDestaques {
  pontosAtencao: PontoAtencao[]
  sancoes: SancaoAdministrativa[]
  processos: Processo[]
  historico?: HistoricoPolitico[]
  /**
   * Saída canônica de `buildPatrimonioEleicoes`, a MESMA que a ficha consome.
   * Montar isto por outro caminho foi o defeito que o bloqueio de 10/08
   * apontou: o readback media uma forma e a superfície exibia outra.
   */
  patrimonioEleicoes?: PatrimonioEleicaoPublico[]
  /** Valores declarados, para o card não ser só "declarou em 2022". */
  patrimonio?: ReadonlyArray<{ ano_eleicao: number; valor_total: number }>
  votos?: VotoCandidato[]
  sancoesVerificacao?: SancoesVerificacao | null
  processosVerificacao?: ProcessosVerificacaoCompat
  trajetoriaVerificacao?: SancoesVerificacao | null
  patrimonioVerificacao?: SancoesVerificacao | null
  votacoesVerificacao?: SancoesVerificacao | null
  /** Injetável para o teste não depender do relógio. */
  hoje?: Date
}

type ProcessosVerificacaoCompat = SancoesVerificacao | null | undefined

export function montarDestaquesDaFicha({
  pontosAtencao,
  sancoes,
  processos,
  historico = [],
  patrimonioEleicoes = [],
  patrimonio = [],
  votos = [],
  sancoesVerificacao,
  processosVerificacao,
  trajetoriaVerificacao,
  patrimonioVerificacao,
  votacoesVerificacao,
  hoje = new Date(),
}: EntradaDeDestaques): DestaquesDaFicha {
  const sancoesVigentes = sancoes.filter((s) => sancaoVigente(s, hoje))
  const sancoesExpiradas = sancoes.filter((s) => !sancaoVigente(s, hoje))
  const mandatos = historico.filter((linha) => motivoNaoPromoverMandato(linha) === null)
  const valorPorAno = new Map(patrimonio.map((p) => [p.ano_eleicao, p.valor_total]))
  const patrimonioPublicado: DestaquePatrimonio[] = patrimonioEleicoes
    .filter((p) => p.estado === "publicado")
    .map((p) => ({
      ano: p.ano,
      valorTotal: valorPorAno.get(p.ano) ?? null,
      fonteUrl: p.fonte_url,
    }))
  /**
   * Só voto COM a votação-chave junta. O item 7 garante que a votação só existe
   * por casamento exato, então `v.votacao` presente é conteúdo verificável; sem
   * ela o card não teria o que dizer além de um id, e não entra na conta.
   */
  const votacoes = votos.filter((v) => Boolean(v.votacao))

  const fontes: FonteDeDestaque[] = [
    {
      chave: "pontos_atencao",
      rotulo: "Destaques editoriais",
      categoria: "editorial",
      // Curadoria, não coleta. Ausência aqui é ausência de curadoria, e a
      // tabela não tem proveniência que autorize dizer "consultado, nada
      // encontrado". Também não fecha cobertura factual, porque não é fonte
      // factual.
      estado:
        pontosAtencao.length > 0 ? { tipo: "tem_conteudo" } : { tipo: "sem_curadoria_editorial" },
    },
    {
      chave: "sancoes",
      rotulo: "Sanções administrativas (CEIS, CNEP, CEAF)",
      categoria: "factual",
      estado: estadoDaFonte(sancoes.length > 0, sancoesVerificacao),
      proveniencia: provenienciaDaVerificacao(sancoesVerificacao),
    },
    {
      chave: "processos",
      rotulo: "Processos judiciais",
      categoria: "factual",
      estado: estadoDaFonte(processos.length > 0, processosVerificacao),
      proveniencia: provenienciaDaVerificacao(processosVerificacao),
    },
    {
      chave: "trajetoria",
      rotulo: "Mandatos exercidos",
      categoria: "factual",
      estado: estadoDaFonte(mandatos.length > 0, trajetoriaVerificacao),
      proveniencia: provenienciaDaVerificacao(trajetoriaVerificacao),
    },
    {
      chave: "patrimonio",
      rotulo: "Patrimônio declarado",
      categoria: "factual",
      estado:
        patrimonioPublicado.length > 0
          ? { tipo: "tem_conteudo" }
          : patrimonioVerificacao
            ? estadoDaFonte(false, patrimonioVerificacao)
            : patrimonioEleicoes.some((p) => p.estado === "vazio_confirmado")
              ? { tipo: "vazio_confirmado", verificadoEm: patrimonioEleicoes.find((p) => p.estado === "vazio_confirmado")?.verificado_em ?? null }
              : { tipo: "nunca_verificado" },
      proveniencia: provenienciaDaVerificacao(patrimonioVerificacao),
    },
    {
      chave: "votacoes",
      rotulo: "Votações-chave",
      categoria: "factual",
      estado: estadoDaFonte(votacoes.length > 0, votacoesVerificacao),
      proveniencia: provenienciaDaVerificacao(votacoesVerificacao),
    },
  ]

  // A aba Destaques tem escopo editorial: alertas e pontos positivos. As
  // categorias factuais continuam calculadas para estado de fonte e para as
  // abas próprias, mas não entram na contagem nem são duplicadas aqui.
  const totalExibido = pontosAtencao.length
  const todasFecham = fontes
    .filter((f) => f.categoria === "factual")
    .every((f) => fechaCobertura(f.estado))

  return {
    pontosAtencao,
    sancoesVigentes,
    sancoesExpiradas,
    processos,
    mandatos,
    patrimonioPublicado,
    votacoes,
    totalExibido,
    fontes,
    vazioHonesto: totalExibido === 0 && todasFecham,
    vazioPorNaoVerificado: totalExibido === 0 && !todasFecham,
  }
}

/**
 * Frase por fonte, para a ficha nunca dizer "nada registrado" quando o que
 * houve foi não ter olhado.
 */
export function descreverEstadoDaFonte(fonte: FonteDeDestaque): string {
  const quando = (iso: string | null) =>
    iso ? ` Última verificação em ${iso.slice(0, 10).split("-").reverse().join("/")}.` : ""

  switch (fonte.estado.tipo) {
    case "tem_conteudo":
      return ""
    case "vazio_confirmado":
      return fonte.proveniencia?.fonte.startsWith("destaques-") && fonte.proveniencia.detalhe
        ? `${fonte.proveniencia.detalhe}${quando(fonte.estado.verificadoEm)}`
        : `Consultado, nada encontrado.${quando(fonte.estado.verificadoEm)}`
    case "nao_aplicavel":
      return `Não se aplica a esta candidatura.${quando(fonte.estado.verificadoEm)}`
    case "curadoria_limitada":
      return `Curadoria limitada: o que existe não cobre esta fonte por inteiro, então a ausência aqui não é conclusão.${quando(fonte.estado.verificadoEm)}`
    case "nao_foi_possivel_verificar":
      return `Não foi possível verificar.${quando(fonte.estado.verificadoEm)}`
    case "nunca_verificado":
      return "Ainda não verificado."
    case "sem_curadoria_editorial":
      // Nunca afirma consulta, e é de propósito: a tabela é editorial.
      return "Nenhum destaque editorial publicado."
  }
}

function provenienciaDaVerificacao(
  verificacao: SancoesVerificacao | null | undefined,
): FonteDeDestaque["proveniencia"] {
  if (!verificacao?.fonte) return undefined
  return {
    fonte: verificacao.fonte,
    detalhe: verificacao.detalhe ?? null,
    url: verificacao.url ?? null,
  }
}
