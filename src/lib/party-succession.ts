/**
 * Sucessão de legendas partidárias: renomeação, fusão e incorporação.
 *
 * Diferente de `partiesHistoricallyEquivalent` (grupo plano, para renomeação da
 * MESMA legenda), aqui a relação é DIRIGIDA e DATADA. Grupo plano não serve para
 * fusão: PSL e DEM viraram UNIÃO em 2022, mas PSL e DEM eram partidos distintos
 * antes disso, e colapsá-los faria "PSL → DEM em 2020" sumir da ficha como se
 * não fosse troca. Com aresta datada, PSL → UNIÃO depois de 2022 é sucessão, e
 * PSL → DEM em 2020 continua sendo troca.
 *
 * Fonte única de todas as arestas: TSE, "Partidos registrados no TSE", aba
 * "Fusões, incorporações e mudanças de nomenclatura/sigla/número de legenda",
 * https://www.tse.jus.br/partidos/partidos-politicos/partidos-registrados-no-tse
 * (HTTP 200, acesso 2026-09-18). Processo e data de decisão estão em cada linha
 * e são os mesmos publicados lá. Nada aqui vem de memória: linha sem processo no
 * TSE não entra.
 */
import { normalizePartySigla, resolveCanonicalPartySigla } from "@/lib/party-utils"

export type PartySuccessionKind = "renomeacao" | "fusao" | "incorporacao"

interface PartySuccessionEdge {
  from: string
  to: string
  kind: PartySuccessionKind
  /** Data da decisão do TSE, AAAA-MM-DD. */
  decidedOn: string
  processo: string
}

/**
 * Renomeações anteriores a 2000 que já estão cobertas por `HISTORICAL_PARTY_GROUPS`
 * (PPR/PP/PPB, PRONA/PL/PR) ficam de fora: o grupo plano resolve, e repetir aqui
 * só criaria dois caminhos para o mesmo fato.
 */
const PARTY_SUCCESSION_EDGES: PartySuccessionEdge[] = [
  // Fusões: os dois partidos de origem deixaram de existir e a legenda nova nasceu.
  { from: "PSL", to: "UNIÃO", kind: "fusao", decidedOn: "2022-02-08", processo: "RPP nº 0600641-95.2021.6.00.0000" },
  { from: "DEM", to: "UNIÃO", kind: "fusao", decidedOn: "2022-02-08", processo: "RPP nº 0600641-95.2021.6.00.0000" },
  { from: "PTB", to: "PRD", kind: "fusao", decidedOn: "2023-11-09", processo: "RPP nº 0601913-90.2022.6.00.0000" },
  { from: "PATRIOTA", to: "PRD", kind: "fusao", decidedOn: "2023-11-09", processo: "RPP nº 0601913-90.2022.6.00.0000" },

  // Incorporações: o partido incorporado deixou de existir e o filiado passou ao incorporador.
  { from: "PGT", to: "PL", kind: "incorporacao", decidedOn: "2003-04-01", processo: "PET nº 1307 (883-36.2003.6.00.0000)" },
  { from: "PST", to: "PL", kind: "incorporacao", decidedOn: "2003-04-01", processo: "PET nº 1307 (883-36.2003.6.00.0000)" },
  // A incorporação do PSD histórico pelo PTB (PET nº 1304, 20/02/2003) NÃO entra
  // aqui, e é de propósito. "PSD" é a única sigla desta tabela que foi reusada: o
  // PSD de hoje tem registro próprio, deferido em 27.9.2011, e não tem relação com
  // o que o PTB incorporou em 2003. Como a aresta é resolvida por sigla, mantê-la
  // faria uma troca real "PSD → PTB" de 2014 ser rotulada incorporação e sumir da
  // contagem sempre que a janela observada começasse antes de 2003. O fato de 2003
  // não afeta nenhuma ficha da coorte de 2026 e não vale o risco.
  { from: "PAN", to: "PTB", kind: "incorporacao", decidedOn: "2007-03-15", processo: "PET nº 2456 (31136-02.2006.6.00.0000)" },
  { from: "PRP", to: "PATRIOTA", kind: "incorporacao", decidedOn: "2019-03-28", processo: "PET nº 0601953-14.2018.6.00.0000" },
  { from: "PPL", to: "PCdoB", kind: "incorporacao", decidedOn: "2019-05-28", processo: "PET nº 0601972-20.2018.6.00.0000" },
  { from: "PHS", to: "PODE", kind: "incorporacao", decidedOn: "2019-09-19", processo: "PET nº 0602013-84.2018.6.00.0000" },
  { from: "PROS", to: "SOLIDARIEDADE", kind: "incorporacao", decidedOn: "2023-02-14", processo: "PetCiv nº 0601967-56.2022.6.00.0000" },
  { from: "PSC", to: "PODE", kind: "incorporacao", decidedOn: "2023-06-15", processo: "PetCiv nº 0600013-38.2023.6.00.0000" },

  // Mudanças de nome/sigla: mesma legenda, nome novo. Também entram como aresta
  // para que um caminho misto (renomeação seguida de fusão) seja reconhecido.
  { from: "PSN", to: "PHS", kind: "renomeacao", decidedOn: "2000-05-30", processo: "PET nº 371 (141-21.1997.6.00.0000)" },
  { from: "PRN", to: "PTC", kind: "renomeacao", decidedOn: "2001-04-24", processo: "PET nº 341 (1069-69.1997.6.00.0000)" },
  { from: "PPB", to: "PP", kind: "renomeacao", decidedOn: "2003-05-29", processo: "PET nº 104 (1104-63.1996.6.00.0000)" },
  { from: "PFL", to: "DEM", kind: "renomeacao", decidedOn: "2007-06-12", processo: "PET nº 1826 (29794-53.2006.6.00.0000)" },
  { from: "PMR", to: "PRB", kind: "renomeacao", decidedOn: "2009-09-21", processo: "RPP nº 301 (25929-56.2005.6.00.0000)" },
  { from: "PTN", to: "PODE", kind: "renomeacao", decidedOn: "2017-05-16", processo: "PET nº 52 (658-94.1995.6.00.0000)" },
  { from: "PT DO B", to: "AVANTE", kind: "renomeacao", decidedOn: "2017-09-12", processo: "PET nº 115 (6-43.1996.6.00.0000)" },
  { from: "PEN", to: "PATRIOTA", kind: "renomeacao", decidedOn: "2018-04-26", processo: "RPP nº 1535-72.2011.6.00.0000" },
  { from: "PMDB", to: "MDB", kind: "renomeacao", decidedOn: "2018-05-15", processo: "PET nº 128 (1286-49.1996.6.00.0000)" },
  { from: "PSDC", to: "DC", kind: "renomeacao", decidedOn: "2018-05-17", processo: "PET nº 96 (863-89.1996.6.00.0000)" },
  { from: "PR", to: "PL", kind: "renomeacao", decidedOn: "2019-02-09", processo: "RPP nº 305 (29782-39.2006.6.00.0000)" },
  { from: "PRB", to: "REPUBLICANOS", kind: "renomeacao", decidedOn: "2019-08-15", processo: "RPP nº 301 (25929-56.2005.6.00.0000)" },
  { from: "PPS", to: "CIDADANIA", kind: "renomeacao", decidedOn: "2019-09-19", processo: "PET nº 74 (1782-78.1996.6.00.0000)" },
  { from: "PTC", to: "AGIR", kind: "renomeacao", decidedOn: "2022-03-31", processo: "RPP nº 51-91.1989.6.00.0000" },
  { from: "PMN", to: "MOBILIZA", kind: "renomeacao", decidedOn: "2023-12-05", processo: "PetCiv nº 0001624-23.1996.6.00.0000" },
  { from: "PMB", to: "DEMOCRATA", kind: "renomeacao", decidedOn: "2025-12-02", processo: "RPP nº 0001554-73.2014.6.00.0000" },
]

export interface PartySuccessionResult {
  kind: PartySuccessionKind
  steps: Array<Pick<PartySuccessionEdge, "from" | "to" | "kind" | "decidedOn" | "processo">>
}

function successionToken(value: string | null | undefined): string | null {
  const token = normalizePartySigla(resolveCanonicalPartySigla(value) ?? value)
  return token || null
}

const EDGES_BY_FROM = new Map<string, PartySuccessionEdge[]>()

for (const edge of PARTY_SUCCESSION_EDGES) {
  const token = successionToken(edge.from)
  if (!token) continue
  EDGES_BY_FROM.set(token, [...(EDGES_BY_FROM.get(token) ?? []), edge])
}

function edgeYear(edge: PartySuccessionEdge) {
  return Number(edge.decidedOn.slice(0, 4))
}

/**
 * Caminho de sucessão entre duas siglas, respeitando a janela observada.
 *
 * `fromYear` é o ano em que o candidato foi visto na sigla de origem e `toYear` o
 * ano em que foi visto na de destino. Uma aresta só vale se a decisão do TSE caiu
 * dentro dessa janela: sem isso, "PSD (2014) → PTB" casaria com a incorporação do
 * PSD histórico em 2003.
 */
export function resolvePartySuccession(
  from: string | null | undefined,
  to: string | null | undefined,
  options?: { fromYear?: number | null; toYear?: number | null } | null,
): PartySuccessionResult | null {
  const start = successionToken(from)
  const target = successionToken(to)
  if (!start || !target || start === target) return null

  const fromYear = options?.fromYear ?? null
  const toYear = options?.toYear ?? null

  const queue: Array<{ token: string; steps: PartySuccessionEdge[] }> = [{ token: start, steps: [] }]
  const seen = new Set<string>([start])

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of EDGES_BY_FROM.get(current.token) ?? []) {
      const year = edgeYear(edge)
      if (fromYear != null && year < fromYear) continue
      if (toYear != null && year > toYear) continue

      const nextToken = successionToken(edge.to)
      if (!nextToken || seen.has(nextToken)) continue

      const steps = [...current.steps, edge]
      if (nextToken === target) {
        const kind: PartySuccessionKind = steps.some((step) => step.kind === "fusao")
          ? "fusao"
          : steps.some((step) => step.kind === "incorporacao")
            ? "incorporacao"
            : "renomeacao"
        return { kind, steps }
      }

      seen.add(nextToken)
      queue.push({ token: nextToken, steps })
    }
  }

  return null
}

/**
 * Caminho para frente a partir de uma sigla, dentro da janela.
 *
 * Cada sigla tem no máximo uma sucessora na tabela do TSE, então o caminho é
 * determinístico. Serve para saber em que legenda o filiado foi parar quando o
 * partido dele foi extinto entre a última eleição observada e hoje.
 */
export function walkPartySuccession(
  from: string | null | undefined,
  options?: { fromYear?: number | null; toYear?: number | null } | null,
): PartySuccessionResult["steps"] {
  let token = successionToken(from)
  if (!token) return []

  const fromYear = options?.fromYear ?? null
  const toYear = options?.toYear ?? null
  const steps: PartySuccessionResult["steps"] = []
  const seen = new Set<string>([token])

  for (;;) {
    const edge = (EDGES_BY_FROM.get(token) ?? []).find((candidate) => {
      const year = edgeYear(candidate)
      if (fromYear != null && year < fromYear) return false
      if (toYear != null && year > toYear) return false
      return true
    })
    if (!edge) return steps

    const next = successionToken(edge.to)
    if (!next || seen.has(next)) return steps

    steps.push(edge)
    seen.add(next)
    token = next
  }
}

export function formatPartySuccessionDate(decidedOn: string) {
  const [ano, mes, dia] = decidedOn.split("-")
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : decidedOn
}

const SUCCESSION_LABEL: Record<PartySuccessionKind, string> = {
  renomeacao: "renomeação",
  fusao: "fusão",
  incorporacao: "incorporação",
}

export function formatPartySuccessionLabel(kind: PartySuccessionKind) {
  return SUCCESSION_LABEL[kind]
}
