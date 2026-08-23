/**
 * Client-safe normalizacao de sigla/nome de partido (espelha `normalizePartyValue`
 * em `scripts/lib/party-canonical.ts` sem depender de Node/scripts).
 */
import { stripAccents } from "@/lib/strip-accents"

export function normalizePartySigla(value: string | null | undefined): string {
  if (!value || !value.trim()) return ""
  return stripAccents(value)
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase()
}

interface CanonicalPartyDefinition {
  sigla: string
  aliases: string[]
}

interface HistoricalPartyGroupDefinition {
  group: string
  labels: string[]
}

interface HistoricalPartyDisplayDefinition {
  historicalLabel: string
  modernLabel: string
  switchYear: number
}

const CANONICAL_PARTIES: CanonicalPartyDefinition[] = [
  { sigla: "PDS", aliases: ["Partido Democrático Social", "Partido Democratico Social"] },
  { sigla: "PT", aliases: ["Partido dos Trabalhadores"] },
  { sigla: "PTB", aliases: ["Partido Trabalhista Brasileiro"] },
  {
    sigla: "SEMPARTIDO",
    aliases: [
      "Sem partido",
      "Sem Partido",
      "Independente",
      "Sem filiacao partidaria",
      "Sem filiação partidária",
    ],
  },
  { sigla: "PL", aliases: ["Partido Liberal"] },
  { sigla: "PPR", aliases: ["Partido Progressista Reformador"] },
  { sigla: "PPB", aliases: ["Partido Progressista Brasileiro"] },
  { sigla: "PR", aliases: ["Partido da República", "Partido da Republica"] },
  { sigla: "REPUBLICANOS", aliases: ["Republicanos"] },
  { sigla: "PRB", aliases: ["Partido Republicano Brasileiro"] },
  { sigla: "NOVO", aliases: ["Partido Novo", "Novo"] },
  { sigla: "UNIÃO", aliases: ["UNIAO", "União Brasil", "Uniao Brasil"] },
  { sigla: "PSD", aliases: ["Partido Social Democrático", "Partido Social Democratico"] },
  { sigla: "PMN", aliases: ["Partido da Mobilização Nacional", "Partido da Mobilizacao Nacional"] },
  // MOBILIZA e o nome/sigla atual da mesma legenda do PMN. Fonte oficial:
  // https://www.tse.jus.br/partidos/partidos-politicos/partidos-registrados-no-tse
  // (HTTP 200, acesso 2026-07-25), tabela "MUDANÇAS DE NOME E/OU SIGLA",
  // literal: "Partido da Mobilização Nacional (PMN) Mobilização Nacional
  // (MOBILIZA) PetCiv nº 0001624-23.1996.6.00.0000 05/12/2023".
  //
  // Fica como entrada PRÓPRIA, nao como alias de PMN, pelo mesmo motivo ja
  // documentado em scripts/lib/party-canonical.ts (review 2026-06-09): colapsar
  // as duas siglas faria a ficha de quem esta hoje no MOBILIZA exibir "PMN",
  // que e o nome anterior. A continuidade entre as duas eras e resolvida no
  // grupo historico abaixo, igual PMDB/MDB e PFL/DEM, entao a renomeação nao
  // conta como troca de partido nem aparece como troca na timeline.
  { sigla: "MOBILIZA", aliases: ["Mobilização Nacional", "Mobilizacao Nacional"] },
  // PATRI e PATRIOTA sao a MESMA legenda: o partido passou a se chamar Patriota
  // em 26/04/2018 (sigla PATRI) e em 26/03/2019 o TSE deferiu o uso do nome
  // PATRIOTA. Mesma fonte oficial acima, literal: "A mudança de nome do Partido
  // Ecológico Nacional (PEN) para Patriota (PATRI) foi deferida em 26/04/2018.
  // Posteriormente, o Patriota (PATRI) requereu a utilização do nome PATRIOTA
  // (sem sigla). O pedido foi deferido pelo TSE, em 26/03/2019."
  //
  // Aqui PATRI entra como ALIAS (e nao como era separada) porque o nome do
  // partido ja era Patriota nos dois momentos: so a abreviação mudou. Sem isso,
  // `partiesEquivalent("PATRI", "PATRIOTA")` devolvia falso e a timeline do
  // cabo-daciolo publicava a descontinuidade "2022 PATRI → PDT" seguida de
  // "2026 PATRIOTA → MOBILIZA" (auditoria 2026-07-24).
  { sigla: "PATRIOTA", aliases: ["Patriota", "PATRI"] },
  // Siglas presentes no banco que nao resolviam para nada (resolveCanonicalPartySigla
  // devolvia null), o que fazia ate a comparacao de uma sigla consigo mesma ser falsa.
  // Todas conferidas na mesma pagina do TSE acima, acesso 2026-07-25:
  // "PCB PARTIDO COMUNISTA BRASILEIRO 9.5.1996"; "Partido da Reconstrução
  // Nacional (PRN) Partido Trabalhista Cristão (PTC) ... 24/04/2001"; "Partido
  // da Reedificação da Ordem Nacional (PRONA) e Partido Liberal (PL) Partido da
  // República (PR) ... 19/12/2006".
  { sigla: "PCB", aliases: ["Partido Comunista Brasileiro"] },
  { sigla: "PRN", aliases: ["Partido da Reconstrução Nacional", "Partido da Reconstrucao Nacional"] },
  {
    sigla: "PRONA",
    aliases: ["Partido da Reedificação da Ordem Nacional", "Partido da Reedificacao da Ordem Nacional"],
  },
  {
    sigla: "PAN",
    aliases: ["Partido dos Aposentados da Nação", "Partido dos Aposentados da Nacao"],
  },
  { sigla: "PROS", aliases: ["Partido Republicano da Ordem Social"] },
  { sigla: "PSL", aliases: ["Partido Social Liberal"] },
  { sigla: "DEM", aliases: ["Democratas"] },
  { sigla: "PFL", aliases: ["Partido da Frente Liberal"] },
  {
    sigla: "PSDB",
    aliases: ["Partido da Social Democracia Brasileira", "Partido Social Democrata Brasileiro"],
  },
  { sigla: "PSB", aliases: ["Partido Socialista Brasileiro"] },
  { sigla: "PSOL", aliases: ["Partido Socialismo e Liberdade"] },
  { sigla: "DC", aliases: ["Democracia Cristã", "Democracia Crista"] },
  { sigla: "MISSÃO", aliases: ["MISSAO", "Partido Missão", "Partido Missao", "Missão", "Missao"] },
  {
    sigla: "PDT",
    aliases: ["Partido Democrático Trabalhista", "Partido Democratico Trabalhista"],
  },
  { sigla: "PSC", aliases: ["Partido Social Cristão", "Partido Social Cristao"] },
  {
    sigla: "PHS",
    aliases: ["Partido Humanista da Solidariedade", "Partido Humanista da Solidaridade"],
  },
  {
    sigla: "DIVERSOS",
    aliases: ["Diversos", "diversos"],
  },
  {
    sigla: "PSTU",
    aliases: ["Partido Socialista dos Trabalhadores Unificado"],
  },
  { sigla: "PCO", aliases: ["Partido da Causa Operária", "Partido da Causa Operaria"] },
  { sigla: "UP", aliases: ["Unidade Popular"] },
  {
    sigla: "PMDB",
    aliases: ["Partido do Movimento Democrático Brasileiro", "Partido do Movimento Democratico Brasileiro"],
  },
  { sigla: "MDB", aliases: ["Movimento Democrático Brasileiro", "Movimento Democratico Brasileiro"] },
  { sigla: "PP", aliases: ["Progressistas", "Partido Progressista"] },
  { sigla: "PCdoB", aliases: ["Partido Comunista do Brasil", "PCDOB"] },
  { sigla: "PTN", aliases: ["Partido Trabalhista Nacional"] },
  { sigla: "PODE", aliases: ["Podemos", "PODEMOS"] },
  { sigla: "PPS", aliases: ["Partido Popular Socialista"] },
  { sigla: "CIDADANIA", aliases: ["Cidadania"] },
  { sigla: "PV", aliases: ["Partido Verde"] },
  {
    sigla: "REDE",
    aliases: ["Rede Sustentabilidade"],
  },
  {
    sigla: "PT DO B",
    aliases: ["Partido Trabalhista do Brasil", "PTDOB", "PTdoB"],
  },
  { sigla: "AVANTE", aliases: ["Avante"] },
  { sigla: "DEMOCRATA", aliases: ["D35", "Democrata", "Democrata 35", "O Democrata"] },
  { sigla: "AGIR", aliases: ["Agir", "Agir 36", "AGIR 36"] },
  { sigla: "PRP", aliases: ["Partido Republicano Progressista"] },
  { sigla: "PRD", aliases: ["Partido Renovação Democrática", "Partido Renovacao Democratica"] },
  { sigla: "PRTB", aliases: ["Partido Renovador Trabalhista Brasileiro"] },
  { sigla: "SOLIDARIEDADE", aliases: ["Solidariedade", "SD"] },
  { sigla: "PTC", aliases: ["Partido Trabalhista Cristão", "Partido Trabalhista Cristao"] },
  { sigla: "PMB", aliases: ["Partido da Mulher Brasileira"] },
]

const CANONICAL_PARTY_BY_TOKEN = new Map<string, string>()

for (const party of CANONICAL_PARTIES) {
  CANONICAL_PARTY_BY_TOKEN.set(normalizePartySigla(party.sigla), party.sigla)
  for (const alias of party.aliases) {
    CANONICAL_PARTY_BY_TOKEN.set(normalizePartySigla(alias), party.sigla)
  }
}

const HISTORICAL_PARTY_GROUPS: HistoricalPartyGroupDefinition[] = [
  { group: "MDB", labels: ["MDB", "PMDB"] },
  { group: "CIDADANIA", labels: ["CIDADANIA", "PPS", "Partido Popular Socialista"] },
  { group: "REPUBLICANOS", labels: ["REPUBLICANOS", "PRB", "Partido Republicano Brasileiro"] },
  { group: "DEM", labels: ["DEM", "DEMOCRATAS", "PFL", "Partido da Frente Liberal"] },
  { group: "PODE", labels: ["PODE", "PODEMOS", "PTN", "Partido Trabalhista Nacional"] },
  { group: "PP", labels: ["PP", "PPB", "PPR", "Progressistas"] },
  { group: "PL", labels: ["PL", "PR", "Partido Liberal", "Partido da Republica"] },
  { group: "AVANTE", labels: ["AVANTE", "PT DO B", "PTDOB", "Partido Trabalhista do Brasil"] },
  // Renomeação PMN -> MOBILIZA deferida pelo TSE em 05/12/2023 (fonte citada
  // junto da entrada canonica acima). No grupo historico, uma linha
  // "PMN -> MOBILIZA" e classificada como renomeação: nao entra em
  // countPartySwitches e a timeline rotula "(renomeação)" em vez de troca.
  { group: "MOBILIZA", labels: ["MOBILIZA", "PMN", "Mobilização Nacional", "Partido da Mobilização Nacional"] },
]

const HISTORICAL_PARTY_GROUP_BY_TOKEN = new Map<string, string>()

for (const group of HISTORICAL_PARTY_GROUPS) {
  for (const label of group.labels) {
    HISTORICAL_PARTY_GROUP_BY_TOKEN.set(normalizePartySigla(label), group.group)
  }
}

const PARTY_DISPLAY_BY_TOKEN: Record<string, string> = {
  PCDOB: "PCdoB",
  SD: "SOLIDARIEDADE",
  SOLIDARIEDADE: "SOLIDARIEDADE",
  SEMPARTIDO: "Sem partido",
}

const HISTORICAL_PARTY_DISPLAY: Record<string, HistoricalPartyDisplayDefinition> = {
  MDB: { historicalLabel: "PMDB", modernLabel: "MDB", switchYear: 2018 },
  CIDADANIA: { historicalLabel: "PPS", modernLabel: "CIDADANIA", switchYear: 2019 },
  REPUBLICANOS: { historicalLabel: "PRB", modernLabel: "REPUBLICANOS", switchYear: 2019 },
  DEM: { historicalLabel: "PFL", modernLabel: "DEM", switchYear: 2007 },
  PODE: { historicalLabel: "PTN", modernLabel: "PODE", switchYear: 2017 },
  AVANTE: { historicalLabel: "PT DO B", modernLabel: "AVANTE", switchYear: 2017 },
  PL: { historicalLabel: "PR", modernLabel: "PL", switchYear: 2019 },
  // switchYear 2024 e nao 2023: a decisao do TSE saiu em 05/12/2023, ou seja,
  // quase todo o ano de 2023 a legenda ainda era PMN. Rotular 2023 como
  // MOBILIZA seria antecipar o fato.
  MOBILIZA: { historicalLabel: "PMN", modernLabel: "MOBILIZA", switchYear: 2024 },
}

export function resolveCanonicalPartySigla(value: string | null | undefined): string | null {
  const token = normalizePartySigla(value)
  if (!token) return null
  return CANONICAL_PARTY_BY_TOKEN.get(token) ?? null
}

export function partiesEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftCanonical = resolveCanonicalPartySigla(left)
  const rightCanonical = resolveCanonicalPartySigla(right)
  return !!leftCanonical && !!rightCanonical && leftCanonical === rightCanonical
}

export function matchesPartySiglaFilter(
  value: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  const valueCanonical = resolveCanonicalPartySigla(value)
  const filterCanonical = resolveCanonicalPartySigla(filter)
  if (valueCanonical || filterCanonical) {
    return !!valueCanonical && !!filterCanonical && valueCanonical === filterCanonical
  }
  const valueToken = normalizePartySigla(value)
  const filterToken = normalizePartySigla(filter)
  return !!valueToken && valueToken === filterToken
}

function resolveHistoricalPartyGroup(
  value: string | null | undefined
): string | null {
  const canonical = resolveCanonicalPartySigla(value)
  const token = normalizePartySigla(canonical ?? value)
  if (!token) return null
  return HISTORICAL_PARTY_GROUP_BY_TOKEN.get(token) ?? token
}

export function partiesHistoricallyEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftGroup = resolveHistoricalPartyGroup(left)
  const rightGroup = resolveHistoricalPartyGroup(right)
  return !!leftGroup && !!rightGroup && leftGroup === rightGroup
}

function getHistoricalDisplayLabel(
  value: string | null | undefined,
  year: number | null | undefined,
): string | null {
  if (year == null) return null

  const group = resolveHistoricalPartyGroup(value)
  if (!group) return null

  const rule = HISTORICAL_PARTY_DISPLAY[group]
  if (!rule) return null

  return year < rule.switchYear ? rule.historicalLabel : rule.modernLabel
}

export function formatPartyDisplayLabel(
  value: string | null | undefined,
  options?: { year?: number | null } | null,
): string {
  if (!value || !value.trim()) return ""

  const historical = getHistoricalDisplayLabel(value, options?.year)
  if (historical) {
    const historicalToken = normalizePartySigla(historical)
    return PARTY_DISPLAY_BY_TOKEN[historicalToken] ?? historical
  }

  const canonical = resolveCanonicalPartySigla(value)
  if (canonical) {
    const token = normalizePartySigla(canonical)
    return PARTY_DISPLAY_BY_TOKEN[token] ?? canonical
  }
  return PARTY_DISPLAY_BY_TOKEN[normalizePartySigla(value)] ?? value.trim()
}

const UNCERTAIN_PARTY_TOKENS: ReadonlySet<string> = new Set(["INCERTO", "SEMPARTIDO"])

export function isUncertainParty(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true
  return UNCERTAIN_PARTY_TOKENS.has(normalizePartySigla(value))
}

export function formatPartyPublicLabel(
  value: string | null | undefined,
  options?: { year?: number | null } | null,
): string {
  if (isUncertainParty(value)) return ""
  return formatPartyDisplayLabel(value, options)
}
