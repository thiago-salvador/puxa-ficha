/**
 * Contrato de `candidatos.verificacao_campos`: quem pode carimbar data por
 * campo, e quando o agregado do perfil pode avançar.
 *
 * ## Por que existe
 *
 * Ate 09/08/2026 nao havia ponto de enforcement nenhum. O escritor real
 * (`scripts/generate-b2-current-profile-migration.ts`) lia
 * `source_verification_dates.proposed_value` do ledger da B2 e emitia o mapa
 * VERBATIM como jsonb, e o leitor (`src/lib/api.ts`) pegava a data mais recente
 * de qualquer campo. As duas pontas erravam em direções opostas:
 *
 * - o leitor promovia o perfil inteiro com verificacao PARCIAL;
 * - o escritor gravava `null` em `social_networks` de `cleber-rabelo` e
 *   `gilberto-vasconcelos`, cujo `query_result` e `no_row_for_safe_sq`: a fonte
 *   FOI consultada com SQ seguro e respondeu sem registros, que
 *   `Settings/OBJECTIVE.md` define como `vazio_confirmado`, estado que merece
 *   data.
 *
 * E o ledger da B2 traz `verified_at` nos 194 x 3 campos, inclusive nos 149 que
 * nunca foram consultados por falta de identidade segura. Data no ledger nunca
 * significou campo confirmado.
 *
 * ## Chave ausente nao e estilo, e o mecanismo da preservação
 *
 * O merge no banco e `verificacao_campos = COALESCE(verificacao_campos,'{}') ||
 * patch`. Em jsonb, o `||` com null do lado direito SOBRESCREVE:
 * `'{"a":"2026-06-01"}'::jsonb || '{"a":null}'::jsonb` da `{"a": null}`. Emitir
 * `{"social_networks": null}` apagaria uma data boa anterior. Por isso `patch` e
 * tipado `Record<string, string>`: o tipo proibe null, e estado que nao avança
 * simplesmente nao entra no objeto.
 *
 * ## Onde mora e por que aqui
 *
 * Em `src/lib` porque o `tsconfig.json` raiz exclui `scripts/`, entao `api.ts`
 * nao pode importar de la; o inverso e legal e ja acontece em vários scripts.
 * Leitor e escritor importam DESTE arquivo. Nao existe gêmeo em `scripts/lib`:
 * duplicar o contrato recriaria a divergência que
 * `tests/freshness-window.test.ts` existe para policiar.
 */

/** Vocabulário de `Settings/OBJECTIVE.md`, seção "todos os dados possíveis". */
export type EstadoCampo =
  | "publicado"
  | "vazio_confirmado"
  | "nao_aplicavel"
  | "indeterminado"
  | "erro"
  | "nao_coletado"

/**
 * Recibo de ausência ou aplicabilidade que uma aba pública consegue exibir.
 *
 * As chaves deste shape convivem em `verificacao_campos` com as datas simples
 * de frescor. Elas não participam do selo agregado: materializam o estado da
 * célula para a superfície correspondente.
 */
export interface EstadoCelulaSuperficie {
  estado: "nao_aplicavel" | "vazio_confirmado"
  motivo: string
  verificado_em: string
}

export type ValorVerificacaoCampo = string | EstadoCelulaSuperficie | null
export type VerificacaoCampos = Record<string, ValorVerificacaoCampo>

export const CHAVE_ESTADO_VOTACOES = "votacoes_chave"
export const CHAVE_ESTADO_HISTORICO = "historico_politico"

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

/** Lê apenas recibos completos e com data de calendário, falhando fechado. */
export function lerEstadoCelulaSuperficie(
  verificacaoCampos: VerificacaoCampos | null | undefined,
  chave: string,
): EstadoCelulaSuperficie | null {
  const valor = verificacaoCampos?.[chave]
  if (!ehRegistro(valor)) return null

  const estado = valor.estado
  const motivo = typeof valor.motivo === "string" ? valor.motivo.trim() : ""
  const verificadoEm =
    typeof valor.verificado_em === "string" ? valor.verificado_em.trim() : ""
  const data = validarDataDeVerificacao(verificadoEm)

  if (
    (estado !== "nao_aplicavel" && estado !== "vazio_confirmado") ||
    !motivo ||
    data == null ||
    data.bruto.length !== 10
  ) {
    return null
  }

  return { estado, motivo, verificado_em: data.bruto }
}

/**
 * Únicos estados que podem carimbar data.
 *
 * `vazio_confirmado` esta aqui de proposito: fonte aplicavel consultada que
 * respondeu sem registros E uma verificacao, e esconder isso transformaria
 * ausência confirmada em lacuna, que e o defeito inverso.
 */
export const ESTADOS_QUE_AVANCAM_FRESCOR = ["publicado", "vazio_confirmado"] as const

/**
 * As tres frentes TSE do bloco "Perfil atual", na ordem declarada. A ordem
 * desempata a escolha da chave mais antiga quando as datas coincidem, que e o
 * caso de todas as 43 fichas resolvidas hoje (`2026-08-06` nas tres).
 */
export const CHAVES_TSE_PERFIL = [
  "candidate_registration",
  "candidate_complement",
  "social_networks",
] as const

export type ChaveTsePerfil = (typeof CHAVES_TSE_PERFIL)[number]

/** Data agregada da curadoria. Nao e frente TSE: e o fallback, nao um concorrente. */
export const CHAVE_AGREGADO_CURADO = "existing_profile_aggregate"

/**
 * Escritas no jsonb, mas fora do bloco de perfil. Declaradas para que a união
 * das tres listas possa ser comparada com as 7 chaves que a migration realmente
 * escreve: chave nova no pipeline reprova em teste em vez de ser ignorada em
 * silencio, como estas tres eram pelo leitor antigo.
 */
export const CHAVES_FORA_DO_PERFIL = ["campaign_proposals", "photo", "news_query"] as const

/** Rotulo publico por frente. Mesma copy que ja estava em `src/lib/api.ts`. */
export const ROTULO_FONTE_TSE: Readonly<Record<ChaveTsePerfil, string>> = Object.freeze({
  candidate_registration: "TSE candidaturas 2026",
  candidate_complement: "TSE situação da candidatura 2026",
  social_networks: "TSE redes declaradas 2026",
})

export interface ResolucaoCampo {
  chave: string
  estado: EstadoCampo
  /** ISO 8601. Ausente ou invalida com estado que avança vira rejeição, nunca `now()`. */
  verificadoEm?: string | null
}

export interface CampoPreservado {
  chave: string
  estado: EstadoCampo
  motivo: string
}

export interface PatchVerificacaoCampos {
  /** Aditivo e sem null por construcao. Aplicar com `||` no banco. */
  patch: Record<string, string>
  /** Estados que nao avançam. Ficam de fora do patch, preservando a data antiga. */
  preservadas: CampoPreservado[]
  /** Estados que avançariam, mas sem data utilizável. Nunca viram `now()`. */
  rejeitadas: CampoPreservado[]
}

const MOTIVO_PRESERVA: Readonly<Record<string, string>> = Object.freeze({
  erro: "falha de fonte ou transporte; a data anterior continua sendo a ultima verificacao real",
  indeterminado: "busca feita sem conclusao segura; avancar a data afirmaria o que nao se sabe",
  nao_coletado: "sem busca valida; nao ha verificacao para datar",
  nao_aplicavel: "frente nao se aplica; nao ha consulta para datar",
})

/**
 * `YYYY-MM-DD`, ou o mesmo com hora ISO. Nada mais.
 *
 * O `new Date()` sozinho e permissivo demais para servir de gate: ele aceita
 * `"Aug 6 2026"`, `"2026"` e, pior, **rola datas impossíveis**:
 * `new Date("2026-02-30")` devolve 02/03/2026 sem reclamar. Uma data de
 * verificacao que o calendário nao tem so pode ter vindo de erro ou de
 * adulteração, e transformar 30 de fevereiro em 2 de marco em silencio e
 * exatamente o tipo de dado inventado que este contrato existe para impedir.
 */
const ISO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
/**
 * Com hora, o fuso e OBRIGATÓRIO (`Z` ou offset explicito).
 *
 * Sem ele, `new Date("2026-08-06T23:30:00")` interpreta como hora LOCAL, e o
 * mesmo texto vira instantes diferentes conforme a maquina: medido, UTC da
 * `1786059000000` e America/Sao_Paulo da `1786069800000`, tres horas de
 * diferença. Uma data de verificacao que muda de valor conforme quem le nao e
 * verificacao. Data pura (`YYYY-MM-DD`) e ancorada em meia-noite UTC de
 * proposito, que e explicito e estável.
 */
const ISO_DATA_HORA =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/

function calendarioReal(ano: number, mes: number, dia: number): boolean {
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

export interface DataDeVerificacao {
  /** Texto original preservado, para o valor gravado nao perder precisão. */
  bruto: string
  /** Instante em ms, para comparacao. Nunca comparar datas por ordem de string. */
  instante: number
}

/**
 * Valida estritamente e devolve o instante junto do texto.
 *
 * Devolver o instante e o que permite comparar datas por MOMENTO, e nao
 * lexicalmente: `"2026-08-06"` e `"2026-08-06T03:42:25.708Z"` sao o mesmo dia com
 * ordem de string invertida, e a chave composta escolhe a mais antiga.
 */
export function validarDataDeVerificacao(
  valor: string | null | undefined,
): DataDeVerificacao | null {
  if (typeof valor !== "string") return null
  const bruto = valor.trim()
  if (!bruto) return null

  const m = ISO_DATA.exec(bruto) ?? ISO_DATA_HORA.exec(bruto)
  if (!m) return null

  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (!calendarioReal(ano, mes, dia)) return null

  const instante = new Date(bruto.includes("T") || bruto.includes(" ") ? bruto : `${bruto}T00:00:00Z`).getTime()
  if (!Number.isFinite(instante)) return null

  return { bruto, instante }
}

function dataUtilizavel(valor: string | null | undefined): string | null {
  return validarDataDeVerificacao(valor)?.bruto ?? null
}

function avanca(estado: EstadoCampo): boolean {
  return (ESTADOS_QUE_AVANCAM_FRESCOR as readonly string[]).includes(estado)
}

/**
 * Constroi o patch aditivo de `verificacao_campos` a partir do estado por campo.
 *
 * `atual` entra so para documentar a intencao de quem chama, e para o chamador
 * poder inspecionar o merge; a funcao nunca copia dele para o patch. Um patch
 * que repetisse valores antigos seria escrita sem verificacao com outro nome.
 */
export function construirPatchVerificacaoCampos(
  atual: VerificacaoCampos | null | undefined,
  resolucoes: readonly ResolucaoCampo[],
): PatchVerificacaoCampos {
  void atual

  const patch: Record<string, string> = {}
  const preservadas: CampoPreservado[] = []
  const rejeitadas: CampoPreservado[] = []

  for (const { chave, estado, verificadoEm } of resolucoes) {
    if (!avanca(estado)) {
      preservadas.push({
        chave,
        estado,
        motivo: MOTIVO_PRESERVA[estado] ?? "estado nao avanca frescor",
      })
      continue
    }

    const data = dataUtilizavel(verificadoEm)
    if (data == null) {
      rejeitadas.push({
        chave,
        estado,
        motivo: "estado avanca frescor, mas a data esta ausente ou e invalida",
      })
      continue
    }

    patch[chave] = data
  }

  return { patch, preservadas, rejeitadas }
}

/**
 * Candidata a "ultima verificacao do perfil": uma data com a fonte que a
 * produziu. `ordem` desempata datas iguais, e e declarada, nao acidental.
 */
export interface CandidataDeVerificacao {
  /** Comparacao, sempre. Nunca comparar datas por ordem de string. */
  instante: number
  /**
   * EXIBICAO, com o texto gravado preservado. Nao e o mesmo que `instante`
   * formatado: data pura ancora em meia-noite UTC, e passar por `Date` antes de
   * formatar em `America/Sao_Paulo` recua um dia (medido em producao em
   * 09/08/2026, com "2026-08-09" exibido como 08/08). `formatDate` ja distingue
   * data de calendario de instante com fuso; quem decide e o texto original.
   */
  exibicao: string
  fonte: string
  ordem: number
}

/**
 * Estados de `coleta_log` que contam como verificacao de verdade.
 *
 * Mesmo principio de `ESTADOS_QUE_AVANCAM_FRESCOR`, aplicado ao vocabulario da
 * coleta: `encontrado` e `vazio_confirmado` sao consultas que responderam,
 * enquanto `erro`, `indeterminado` e `nao_aplicavel` nao verificaram nada.
 * Deixar `erro` avancar a data seria transformar uma consulta que FALHOU em
 * selo de frescor, que e a mentira mais cara que este site pode contar.
 */
export const RESULTADOS_DE_COLETA_QUE_VERIFICAM = ["encontrado", "vazio_confirmado"] as const

export interface ColetaParaFrescor {
  resultado: string
  executado_em: string
}

/**
 * Converte uma linha de coleta em candidata, ou devolve `null`.
 *
 * `null` cobre tres casos que sao o mesmo para quem le a ficha: a coleta nunca
 * rodou, rodou e falhou, ou rodou e nao concluiu. Nenhum deles verificou dado
 * nenhum, e nenhum deles pode mover a data.
 */
export function candidataDeColeta(
  coleta: ColetaParaFrescor | null | undefined,
  fonte: string,
  ordem: number,
): CandidataDeVerificacao | null {
  if (!coleta) return null
  if (!(RESULTADOS_DE_COLETA_QUE_VERIFICAM as readonly string[]).includes(coleta.resultado)) {
    return null
  }
  const instante = new Date(coleta.executado_em).getTime()
  if (!Number.isFinite(instante)) return null
  // `executado_em` e timestamp COM fuso, entao o texto bruto ja e instante e
  // `formatDate` o converte corretamente. Nao ha data pura neste caminho.
  return { instante, exibicao: coleta.executado_em, fonte, ordem }
}

/**
 * A ULTIMA vez que qualquer dado do perfil foi verificado, com a fonte.
 *
 * ## Por que a regra mudou em 09/08/2026
 *
 * Ate aqui o bloco olhava so `verificacao_campos` e `ultima_atualizacao`, e
 * exibia "Perfil verificado em <data>". Duas coisas estavam erradas ao mesmo
 * tempo. A frase prometia que o perfil INTEIRO fora verificado naquela data,
 * quando podia ter sido so a curadoria de identidade. E a data ignorava
 * verificacoes mais recentes que o site JA tinha e ja exibia em outras secoes:
 * as consultas de sancoes (CEIS, CNEP, CEAF) e a curadoria de processos.
 * Resultado medido: fichas anunciando junho enquanto tinham verificacao de
 * agosto na mesma pagina.
 *
 * A regra nova responde a pergunta que o leitor de fato faz: quando alguem
 * olhou isso pela ultima vez? Vence a candidata MAIS RECENTE, e a fonte e
 * nomeada ao lado, para que "verificado" nunca signifique mais do que foi
 * verificado.
 *
 * Note a assimetria deliberada com `resolverFrescorTsePerfil`: LA a escolha e
 * pela data mais ANTIGA, porque as tres frentes TSE compoem UM atributo (o
 * perfil so esta verificado desde o componente mais velho). AQUI a escolha e
 * pela mais RECENTE, porque as candidatas sao atributos INDEPENDENTES e a
 * pergunta e sobre a ultima visita a qualquer um deles. Trocar uma pela outra
 * inverte o significado do selo.
 */
export function resolverUltimaVerificacaoDoPerfil(
  candidatas: readonly (CandidataDeVerificacao | null)[],
): CandidataDeVerificacao | null {
  const validas = candidatas.filter((c): c is CandidataDeVerificacao => c != null)
  if (validas.length === 0) return null

  let vencedora = validas[0]
  for (const c of validas.slice(1)) {
    if (c.instante > vencedora.instante) vencedora = c
    else if (c.instante === vencedora.instante && c.ordem < vencedora.ordem) vencedora = c
  }
  return vencedora
}

export type ResolucaoTsePerfil =
  | { tipo: "completa"; verificadoEm: DataDeVerificacao; chaveMaisAntiga: ChaveTsePerfil }
  | { tipo: "parcial"; resolvidas: number }
  | { tipo: "ausente" }

/**
 * Decide se o bloco "Perfil atual" pode avancar, e desde quando.
 *
 * Promove SO com as tres frentes TSE resolvidas, e pela data MAIS ANTIGA entre
 * elas. Um perfil composto de tres campos esta verificado apenas desde o momento
 * do componente mais velho; com o maximo, reverificar so `social_networks`
 * zeraria o selo enquanto `candidate_registration` apodrece.
 *
 * Custo dessa escolha hoje: zero. As 43 fichas com as tres frentes resolvidas
 * tem a mesma data nas tres (`2026-08-06`), entao minimo e maximo coincidem. A
 * escolha so passa a valer quando a reverificacao incremental comecar, que e
 * exatamente quando precisa estar certa.
 *
 * Resolucao parcial devolve `parcial` e NAO produz data: quem chama cai para o
 * agregado curado. Nunca um hibrido entre data TSE parcial e data curada.
 *
 * Devolve o par `{bruto, instante}`, nunca um `Date`: converter aqui apagaria a
 * distincao entre data de calendario e instante. Foi o defeito de 09/08/2026:
 * "2026-08-09" virava meia-noite UTC, e o formatador publico (America/Sao_Paulo)
 * exibia "08/08/2026" nas 12 fichas materializadas. Comparacoes usam `instante`;
 * exibicao usa `bruto`, que preserva o dia gravado.
 */
export function resolverFrescorTsePerfil(
  verificacaoCampos: VerificacaoCampos | null | undefined,
): ResolucaoTsePerfil {
  const campos = verificacaoCampos ?? {}

  const resolvidas: { chave: ChaveTsePerfil; data: DataDeVerificacao }[] = []
  for (const chave of CHAVES_TSE_PERFIL) {
    const valor = campos[chave]
    const data = validarDataDeVerificacao(typeof valor === "string" ? valor : null)
    if (data == null) continue
    resolvidas.push({ chave, data })
  }

  if (resolvidas.length === 0) return { tipo: "ausente" }
  if (resolvidas.length < CHAVES_TSE_PERFIL.length) {
    return { tipo: "parcial", resolvidas: resolvidas.length }
  }

  // Comparacao por INSTANTE, nunca por ordem de string. Empate fica com a
  // primeira chave da ordem declarada, que e o caso das 43 fichas resolvidas.
  let maisAntiga = resolvidas[0]
  for (const item of resolvidas.slice(1)) {
    if (item.data.instante < maisAntiga.data.instante) maisAntiga = item
  }

  return {
    tipo: "completa",
    verificadoEm: maisAntiga.data,
    chaveMaisAntiga: maisAntiga.chave,
  }
}
