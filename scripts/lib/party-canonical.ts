export interface CanonicalParty {
  sigla: string
  nome: string
  aliases: string[]
}

const PARTIES: CanonicalParty[] = [
  { sigla: "PT", nome: "Partido dos Trabalhadores", aliases: [] },
  { sigla: "PL", nome: "Partido Liberal", aliases: [] },
  { sigla: "REPUBLICANOS", nome: "Republicanos", aliases: [] },
  { sigla: "NOVO", nome: "Partido Novo", aliases: ["Novo"] },
  { sigla: "UNIAO", nome: "Uniao Brasil", aliases: ["União Brasil", "UNIÃO"] },
  { sigla: "PSD", nome: "Partido Social Democratico", aliases: [] },
  {
    sigla: "PSDB",
    nome: "Partido da Social Democracia Brasileira",
    aliases: ["Partido Social Democrata Brasileiro"],
  },
  { sigla: "PSB", nome: "Partido Socialista Brasileiro", aliases: [] },
  { sigla: "PSOL", nome: "Partido Socialismo e Liberdade", aliases: [] },
  { sigla: "DC", nome: "Democracia Crista", aliases: [] },
  { sigla: "MISSAO", nome: "Missao", aliases: ["Partido Missao", "Missão"] },
  { sigla: "PDT", nome: "Partido Democratico Trabalhista", aliases: [] },
  {
    sigla: "PSTU",
    nome: "Partido Socialista dos Trabalhadores Unificado",
    aliases: [],
  },
  { sigla: "PCO", nome: "Partido da Causa Operaria", aliases: [] },
  { sigla: "UP", nome: "Unidade Popular", aliases: [] },
  { sigla: "MDB", nome: "Movimento Democratico Brasileiro", aliases: [] },
  { sigla: "PP", nome: "Progressistas", aliases: ["Partido Progressista"] },
  { sigla: "PCDOB", nome: "Partido Comunista do Brasil", aliases: ["PCdoB"] },
  { sigla: "PODE", nome: "Podemos", aliases: ["PODEMOS"] },
  { sigla: "CIDADANIA", nome: "Cidadania", aliases: [] },
  { sigla: "PV", nome: "Partido Verde", aliases: [] },
  { sigla: "AVANTE", nome: "Avante", aliases: [] },
  { sigla: "PRTB", nome: "Partido Renovador Trabalhista Brasileiro", aliases: [] },
]

const normalizePartyValue = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase()

const PARTY_INDEX = new Map<string, CanonicalParty>()

for (const party of PARTIES) {
  PARTY_INDEX.set(normalizePartyValue(party.sigla), party)
  PARTY_INDEX.set(normalizePartyValue(party.nome), party)
  for (const alias of party.aliases) {
    PARTY_INDEX.set(normalizePartyValue(alias), party)
  }
}

export function resolveCanonicalParty(value: string | null | undefined): CanonicalParty | null {
  if (!value || !value.trim()) return null
  return PARTY_INDEX.get(normalizePartyValue(value)) ?? null
}

export function findCanonicalPartyInText(value: string | null | undefined): CanonicalParty | null {
  if (!value || !value.trim()) return null

  const direct = resolveCanonicalParty(value)
  if (direct) return direct

  const normalizedText = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()

  const candidates = PARTIES.flatMap((party) =>
    [party.sigla, party.nome, ...party.aliases].map((candidate) => ({
      party,
      candidate,
      normalized: candidate
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase(),
    }))
  ).sort((left, right) => right.normalized.length - left.normalized.length)

  for (const candidate of candidates) {
    const escaped = candidate.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern =
      candidate.candidate === candidate.party.sigla
        ? new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, "i")
        : new RegExp(escaped, "i")
    if (pattern.test(normalizedText)) {
      return candidate.party
    }
  }

  return null
}

export function partiesEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (!left || !right) return false
  const leftParty = resolveCanonicalParty(left)
  const rightParty = resolveCanonicalParty(right)
  if (!leftParty || !rightParty) return false
  return leftParty.sigla === rightParty.sigla
}
