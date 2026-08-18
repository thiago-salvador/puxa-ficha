import type { MudancaPartido } from "@/lib/types"
import { partiesHistoricallyEquivalent } from "@/lib/party-utils"

function normalizePartyValue(value: string | null | undefined): string | null {
  if (!value) return null

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

/**
 * Devolve a transicao terminal da linha do tempo.
 *
 * Ordenar so por ano nao basta: quando ha duas ou mais trocas no mesmo ano, o
 * `sort` estavel devolve a ordem de chegada do array, que nao tem relacao com a
 * ordem dos fatos. O caso que expos isso: em 2021 o candidato saiu de
 * REPUBLICANOS para PATRIOTA em maio e de PATRIOTA para PL em novembro. Pelo
 * ano, a primeira do array vencia, a terminal virava PATRIOTA, e a ficha
 * acusava a linha do tempo de nao ter chegado ao partido atual, que era PL.
 *
 * O desempate correto e a propria cadeia, e nao precisa de data: dentro do ano,
 * a transicao cujo `partido_novo` nao aparece como `partido_anterior` de
 * nenhuma outra e a ultima. `data_mudanca` e nulo em toda a base hoje, entao
 * depender dela seria depender de dado que nao existe.
 */
function transicaoTerminal(mudancas: MudancaPartido[]): MudancaPartido | null {
  if (mudancas.length === 0) return null

  const anoMaximo = Math.max(...mudancas.map((m) => m.ano))
  const doAnoMaximo = mudancas.filter((m) => m.ano === anoMaximo)
  if (doAnoMaximo.length === 1) return doAnoMaximo[0] ?? null

  const anterioresNoAno = new Set(
    doAnoMaximo.map((m) => normalizePartyValue(m.partido_anterior)).filter(Boolean)
  )
  const terminais = doAnoMaximo.filter(
    (m) => !anterioresNoAno.has(normalizePartyValue(m.partido_novo))
  )

  // Cadeia bem formada deixa exatamente uma ponta. Se o dado estiver ciclico ou
  // partido, nao se inventa uma ordem: devolve a primeira e o resto da funcao
  // decide pelo conteudo, nao pela posicao.
  if (terminais.length === 1) return terminais[0] ?? null
  return doAnoMaximo[0] ?? null
}

export function hasIncompletePartyTimeline(
  mudancas: MudancaPartido[],
  partidoSigla: string | null | undefined,
  partidoAtual: string | null | undefined
): boolean {
  if (mudancas.length === 0) return false

  const latest = transicaoTerminal(mudancas)
  const latestPartidoNovo = latest?.partido_novo ?? null
  const latestToken = normalizePartyValue(latestPartidoNovo)

  // Rede de seguranca: se o partido atual aparece como destino de QUALQUER
  // transicao do ano mais recente, a linha do tempo chegou nele, e o aviso de
  // desatualizada seria falso mesmo que a cadeia esteja mal formada.
  const anoMaximo = Math.max(...mudancas.map((m) => m.ano))
  const destinosDoAnoMaximo = mudancas
    .filter((m) => m.ano === anoMaximo)
    .map((m) => normalizePartyValue(m.partido_novo))
  const atuais = [normalizePartyValue(partidoSigla), normalizePartyValue(partidoAtual)].filter(
    Boolean
  )
  if (atuais.some((token) => destinosDoAnoMaximo.includes(token))) return false

  if (!latestToken) return false

  const currentTokens = [normalizePartyValue(partidoSigla), normalizePartyValue(partidoAtual)].filter(
    (value): value is string => Boolean(value)
  )

  if (currentTokens.length === 0) return false

  if (currentTokens.includes(latestToken)) return false

  // Equivalência histórica (ex.: PMDB ↔ MDB, DEM ↔ UNIÃO) evita falso positivo quando o
  // normalizador da timeline colapsa a row de rename como redundante e a última entrada
  // ativa fica no partido pré-rename, apesar de o candidato estar no partido canônico atual.
  if (partidoSigla && partiesHistoricallyEquivalent(latestPartidoNovo, partidoSigla)) return false
  if (partidoAtual && partiesHistoricallyEquivalent(latestPartidoNovo, partidoAtual)) return false

  return true
}
