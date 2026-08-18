/**
 * Traducao do ledger de pesquisa da B2 para o vocabulario de estados de
 * `@/lib/verificacao-campos`.
 *
 * ## Por que a chave do mapa e (campo, query_result), e nao query_result sozinho
 *
 * O mesmo `query_result` significa coisas diferentes conforme o campo. Medido
 * sobre `research-b2/proposals.jsonl`:
 *
 * - `no_safe_match` aparece em `current_candidacy_status` (149), `profession`
 *   (149), `education` (149) E `biography` (1);
 * - `found` aparece em `news` (184) e `current_office` (63);
 * - `no_result_in_scoped_query` aparece em `current_office` e `news`.
 *
 * Um mapa so por `query_result` colapsaria campos sem relacao e traduziria
 * errado. Par desconhecido LANCA: vocabulario novo no ledger tem de ser decidido
 * por gente, nao virar `nao_coletado` por omissao.
 *
 * ## Por que `candidate_complement` e agregado
 *
 * As tres chaves de `verificacao_campos` nao tem relacao 1:1 com os campos do
 * ledger. `candidate_complement` corresponde ao pacote
 * `consulta_cand_complementar_2026`, que sustenta DOIS campos, `profession` e
 * `education`. Uma data so pode cobrir os dois se os dois foram verificados,
 * entao a chave composta so resolve quando todos os constituintes resolvem, e em
 * mistura o estado que NAO avanca domina.
 *
 * Hoje os dois alinham perfeitamente (45 resolvidos e 149 nao resolvidos em cada
 * um), entao o caso misto nao existe no dado real e so e exercitavel por fixture
 * sintetica. A regra e escrita agora justamente por isso: descobri-la na primeira
 * divergencia significaria descobrir que o gerador escolheu um lado em silencio.
 *
 * ## O defeito que esta traducao corrige
 *
 * `social_networks` com `no_row_for_safe_sq` (2 casos: `cleber-rabelo` e
 * `gilberto-vasconcelos`) e fonte consultada com SQ seguro que respondeu sem
 * registros, ou seja `vazio_confirmado` pela definicao de
 * `Settings/OBJECTIVE.md`, um estado que MERECE data. O gerador antigo repassava
 * o `proposed_value` verbatim e gravava `null`.
 */

import {
  ESTADOS_QUE_AVANCAM_FRESCOR,
  validarDataDeVerificacao,
  type DataDeVerificacao,
  type EstadoCampo,
} from "../../src/lib/verificacao-campos"

export interface PropostaB2 {
  field: string
  query_result?: string | null
  source_date?: string | null
  verified_at?: string | null
  proposed_value?: unknown
}

/**
 * (campo do ledger, query_result) -> estado do campo.
 *
 * Fechado de proposito. `Settings/OBJECTIVE.md` define o vocabulario de estados,
 * e cada linha abaixo e uma decisao de traducao, nao um default.
 */
const MAPA: ReadonlyMap<string, EstadoCampo> = new Map([
  // Pacote consulta_cand_2026: o registro de candidatura de 2026.
  ["current_candidacy_status|safe_official_registration_found", "publicado"],
  // Sem identidade segura a consulta nem chegou a ser feita para esta pessoa.
  // Ausencia de linha nao prova ausencia de fato (Settings/EXPECTED_BEHAVIOR.md).
  ["current_candidacy_status|no_safe_match", "nao_coletado"],

  // Pacote consulta_cand_complementar_2026: sustenta profession E education.
  ["profession|found_in_safe_current_registration", "publicado"],
  ["profession|no_safe_match", "nao_coletado"],
  ["education|found_in_safe_current_registration", "publicado"],
  ["education|no_safe_match", "nao_coletado"],

  // Pacote rede_social_candidato_2026.
  ["social_networks|found_for_safe_sq", "publicado"],
  // Consultado com SQ seguro, zero linhas: ausencia confirmada, e ela tem data.
  ["social_networks|no_row_for_safe_sq", "vazio_confirmado"],
  ["social_networks|no_safe_current_sq", "nao_coletado"],

  // O recurso oficial de propostas nao foi publicado pelo TSE, entao a fonte
  // aplicavel nunca foi consultada. Uma pista de noticia nao verifica o campo.
  ["campaign_proposals|dated_news_lead_found", "nao_coletado"],
  ["campaign_proposals|official_resource_absent_and_no_scoped_lead", "nao_coletado"],

  // A foto que ja existe na ficha nao e verificacao da frente contra a fonte
  // oficial, e o recurso oficial de fotos tambem nao foi publicado.
  ["photo|existing_photo", "nao_coletado"],
  ["photo|official_photo_resource_not_published", "nao_coletado"],

  // `news_query` data a CONSULTA de noticias, nao um valor de campo. Consulta
  // feita com resultado e consulta feita sem resultado no escopo sao as duas
  // consultas reais, e as duas merecem a data do dia em que ocorreram.
  ["news|found", "publicado"],
  ["news|no_result_in_scoped_query", "vazio_confirmado"],
])

/** Chave de `verificacao_campos` -> campos do ledger que a sustentam. */
export const COMPOSICAO_DAS_CHAVES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  candidate_registration: ["current_candidacy_status"],
  candidate_complement: ["profession", "education"],
  social_networks: ["social_networks"],
  campaign_proposals: ["campaign_proposals"],
  photo: ["photo"],
  news_query: ["news"],
})

export function estadoDoCampo(field: string, queryResult: string | null | undefined): EstadoCampo {
  const chave = `${field}|${queryResult ?? ""}`
  const estado = MAPA.get(chave)
  if (estado === undefined) {
    throw new Error(
      `verificacao-campos: par (campo, query_result) desconhecido: ${chave}. ` +
        `Vocabulario novo no ledger exige decisao explicita de traducao em ` +
        `scripts/lib/verificacao-campos-ledger-b2.ts, nunca um default.`,
    )
  }
  return estado
}

/**
 * De onde sai a data de cada campo, declarado em vez de adivinhado.
 *
 * As duas semanticas convivem no ledger e nao sao intercambiaveis:
 *
 * - `source_date` data a FONTE. As tres frentes TSE saem do snapshot de
 *   06/08/2026, e e essa a data que a ficha deve mostrar: quando o registro
 *   oficial foi tirado, nao quando alguem rodou o script.
 * - `verified_at` data a CONSULTA. `news_query` e literalmente o carimbo da
 *   busca de noticias, com precisao de milissegundo, e trocar por `source_date`
 *   perderia a hora sem ganhar nada.
 *
 * Medido em `acm-neto`: as frentes TSE trazem `source_date: 2026-08-06` e
 * `verified_at: 2026-08-07T03:42:25.708Z`; `news` traz `source_date: 2026-08-07`
 * e `verified_at: 2026-08-07T03:37:56.233Z`. Uma preferencia unica para todos os
 * campos erraria em um dos dois lados.
 */
const ORIGEM_DA_DATA: Readonly<Record<string, "source_date" | "verified_at">> = Object.freeze({
  current_candidacy_status: "source_date",
  profession: "source_date",
  education: "source_date",
  social_networks: "source_date",
  campaign_proposals: "source_date",
  photo: "source_date",
  news: "verified_at",
})

/** Ordem de precedencia dos estados que NAO avancam, para a agregacao. */
const PESO_NAO_AVANCA: Readonly<Record<string, number>> = Object.freeze({
  erro: 4,
  indeterminado: 3,
  nao_coletado: 2,
  nao_aplicavel: 1,
})

/**
 * Importado, nao reescrito. Repetir a lista aqui criaria o gemeo que o modulo de
 * contrato existe para nao ter.
 */
function avanca(estado: EstadoCampo): boolean {
  return (ESTADOS_QUE_AVANCAM_FRESCOR as readonly string[]).includes(estado)
}

export interface ResolucaoDerivada {
  chave: string
  estado: EstadoCampo
  verificadoEm: string | null
}

function dataDaProposta(p: PropostaB2): string | null {
  const origem = ORIGEM_DA_DATA[p.field]
  if (origem === undefined) {
    throw new Error(
      `verificacao-campos: campo sem origem de data declarada: ${p.field}. ` +
        `source_date data a fonte e verified_at data a consulta; escolher por ` +
        `default trocaria uma pela outra em silencio.`,
    )
  }
  return (origem === "source_date" ? p.source_date : p.verified_at) ?? null
}

/**
 * Agrega os campos constituintes de uma chave.
 *
 * Todos avancam -> a chave avanca, com a data MAIS ANTIGA entre eles (mesma
 * regra do leitor: a chave so cobre o conjunto desde o componente mais velho).
 * Qualquer um nao avanca -> a chave nao avanca, e o estado devolvido e o mais
 * grave entre os que nao avancam.
 */
export function agregarChave(chave: string, propostas: readonly PropostaB2[]): ResolucaoDerivada {
  const campos = COMPOSICAO_DAS_CHAVES[chave]
  if (!campos) throw new Error(`verificacao-campos: chave sem composicao declarada: ${chave}`)

  const estados: { estado: EstadoCampo; data: string | null }[] = []
  for (const campo of campos) {
    // Um campo pode ter MAIS DE UMA proposta no ledger: medido, `campaign_proposals`
    // aparece duas vezes em 59 dos 194 perfis. Pegar a primeira seria um
    // desempate nao declarado, entao TODAS entram, e a regra e a mesma da chave
    // composta: o estado que nao avanca domina.
    const doCampo = propostas.filter((p) => p.field === campo)
    if (doCampo.length === 0) {
      // Campo constituinte ausente do ledger e ausencia de busca, nao ausencia
      // de fato. Fail-safe para o lado que nao carimba data.
      estados.push({ estado: "nao_coletado", data: null })
      continue
    }
    for (const proposta of doCampo) {
      estados.push({
        estado: estadoDoCampo(campo, proposta.query_result),
        data: dataDaProposta(proposta),
      })
    }
  }

  const bloqueadores = estados.filter((e) => !avanca(e.estado))
  if (bloqueadores.length > 0) {
    const pior = bloqueadores.reduce((a, b) =>
      (PESO_NAO_AVANCA[b.estado] ?? 0) > (PESO_NAO_AVANCA[a.estado] ?? 0) ? b : a,
    )
    return { chave, estado: pior.estado, verificadoEm: null }
  }

  // CADA constituinte precisa da propria data valida. Antes bastava UM ter data
  // para a chave inteira ser carimbada, o que deixava `candidate_complement`
  // afirmar cobertura de `profession` E `education` com a data de um so. Uma
  // data que cobre dois campos exige que os dois tenham sido datados.
  const datas: DataDeVerificacao[] = []
  for (const e of estados) {
    const data = validarDataDeVerificacao(e.data)
    if (data == null) {
      // LANCA, nao rebaixa. Rebaixar para `nao_coletado` transformava o caso em
      // `preservada`, e o escritor so lanca em `rejeitadas`: uma fonte que disse
      // `publicado` com `source_date` ausente ou corrompido virava skip
      // silencioso, sem erro e sem linha de log. E o oposto da regra do resto do
      // modulo, onde par (campo, query_result) desconhecido derruba a rodada.
      throw new Error(
        `verificacao-campos: ${chave} tem constituinte em estado que avanca frescor ` +
          `(${e.estado}) com data inutilizavel: ${JSON.stringify(e.data)}. ` +
          `Fonte que afirma verificacao sem data legivel e defeito de dado, nao ausencia de busca.`,
      )
    }
    datas.push(data)
  }

  // `vazio_confirmado` domina `publicado` quando convivem: a chave inteira so
  // pode ser anunciada como publicada se todo constituinte trouxe valor.
  const estado: EstadoCampo = estados.some((e) => e.estado === "vazio_confirmado")
    ? "vazio_confirmado"
    : "publicado"

  // Mais antiga por INSTANTE. Ordenar strings misturaria `2026-08-06` com
  // `2026-08-06T03:42:25.708Z` pela ordem do alfabeto, nao pelo tempo.
  const maisAntiga = datas.reduce((a, b) => (b.instante < a.instante ? b : a))

  return { chave, estado, verificadoEm: maisAntiga.bruto }
}

/**
 * Deriva as resolucoes de todas as chaves de `verificacao_campos` de um perfil.
 *
 * `existing_profile_aggregate` nao tem campo no ledger: e a data agregada da
 * curadoria que ja existia na ficha, carregada adiante. Ela e preservada como
 * estava, e nao e uma verificacao nova de frente nenhuma.
 */
export function derivarResolucoes(
  propostas: readonly PropostaB2[],
  agregadoCurado: unknown,
): ResolucaoDerivada[] {
  const resolucoes = Object.keys(COMPOSICAO_DAS_CHAVES).map((chave) => agregarChave(chave, propostas))

  const curado = typeof agregadoCurado === "string" && agregadoCurado.trim() ? agregadoCurado : null
  resolucoes.push({
    chave: "existing_profile_aggregate",
    estado: curado ? "publicado" : "nao_coletado",
    verificadoEm: curado,
  })

  return resolucoes
}
