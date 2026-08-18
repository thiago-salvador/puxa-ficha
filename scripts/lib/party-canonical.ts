export interface CanonicalParty {
  sigla: string
  nome: string
  aliases: string[]
}

const PARTIES: CanonicalParty[] = [
  { sigla: "PDS", nome: "Partido Democrático Social", aliases: ["Partido Democratico Social"] },
  { sigla: "PT", nome: "Partido dos Trabalhadores", aliases: [] },
  {
    sigla: "SEMPARTIDO",
    nome: "Sem partido",
    aliases: [
      "Sem Partido",
      "Independente",
      "Sem filiacao partidaria",
      "Sem filiação partidária",
    ],
  },
  { sigla: "PL", nome: "Partido Liberal", aliases: [] },
  { sigla: "PTB", nome: "Partido Trabalhista Brasileiro", aliases: [] },
  { sigla: "PPR", nome: "Partido Progressista Reformador", aliases: [] },
  { sigla: "PPB", nome: "Partido Progressista Brasileiro", aliases: [] },
  { sigla: "PR", nome: "Partido da República", aliases: ["Partido da Republica"] },
  { sigla: "REPUBLICANOS", nome: "Republicanos", aliases: [] },
  { sigla: "PRB", nome: "Partido Republicano Brasileiro", aliases: [] },
  { sigla: "NOVO", nome: "Partido Novo", aliases: ["Novo"] },
  {
    sigla: "UNIÃO",
    nome: "União Brasil",
    aliases: ["UNIAO", "União Brasil", "Uniao Brasil"],
  },
  { sigla: "PSD", nome: "Partido Social Democrático", aliases: ["Partido Social Democratico"] },
  // Nome oficial do PMN e "Partido da Mobilização Nacional"; "Mobilização
  // Nacional" (sem "Partido da") e o nome atual, ja da era MOBILIZA. Fonte:
  // https://www.tse.jus.br/partidos/partidos-politicos/partidos-registrados-no-tse
  // (HTTP 200, acesso 2026-07-25).
  {
    sigla: "PMN",
    nome: "Partido da Mobilização Nacional",
    aliases: ["Partido da Mobilizacao Nacional"],
  },
  {
    sigla: "PAN",
    nome: "Partido dos Aposentados da Nação",
    aliases: ["Partido dos Aposentados da Nacao"],
  },
  {
    sigla: "PROS",
    nome: "Partido Republicano da Ordem Social",
    aliases: [],
  },
  { sigla: "PSL", nome: "Partido Social Liberal", aliases: [] },
  { sigla: "DEM", nome: "Democratas", aliases: [] },
  { sigla: "PFL", nome: "Partido da Frente Liberal", aliases: [] },
  {
    sigla: "PSDB",
    nome: "Partido da Social Democracia Brasileira",
    aliases: ["Partido Social Democrata Brasileiro"],
  },
  { sigla: "PSB", nome: "Partido Socialista Brasileiro", aliases: [] },
  { sigla: "PSOL", nome: "Partido Socialismo e Liberdade", aliases: [] },
  { sigla: "DC", nome: "Democracia Cristã", aliases: ["Democracia Crista"] },
  {
    sigla: "MISSÃO",
    nome: "Partido Missão",
    aliases: ["MISSAO", "Partido Missão", "Partido Missao", "Missão", "Missao"],
  },
  { sigla: "PDT", nome: "Partido Democrático Trabalhista", aliases: ["Partido Democratico Trabalhista"] },
  { sigla: "PSC", nome: "Partido Social Cristão", aliases: ["Partido Social Cristao"] },
  {
    sigla: "PHS",
    nome: "Partido Humanista da Solidariedade",
    aliases: ["Partido Humanista da Solidariedade", "Partido Humanista da Solidaridade"],
  },
  {
    sigla: "DIVERSOS",
    nome: "Agregado editorial — múltiplas legendas em mandato (curadoria)",
    aliases: ["Diversos", "diversos"],
  },
  {
    sigla: "PSTU",
    nome: "Partido Socialista dos Trabalhadores Unificado",
    aliases: [],
  },
  { sigla: "PCO", nome: "Partido da Causa Operária", aliases: ["Partido da Causa Operaria"] },
  { sigla: "UP", nome: "Unidade Popular", aliases: [] },
  {
    sigla: "PMDB",
    nome: "Partido do Movimento Democrático Brasileiro",
    aliases: ["Partido do Movimento Democratico Brasileiro"],
  },
  { sigla: "MDB", nome: "Movimento Democrático Brasileiro", aliases: ["Movimento Democratico Brasileiro"] },
  { sigla: "PP", nome: "Progressistas", aliases: ["Partido Progressista"] },
  { sigla: "PCdoB", nome: "Partido Comunista do Brasil", aliases: ["PCDOB"] },
  {
    sigla: "PTN",
    nome: "Partido Trabalhista Nacional",
    aliases: [],
  },
  { sigla: "PODE", nome: "Podemos", aliases: ["PODEMOS"] },
  // PATRI e a sigla antiga da MESMA legenda: o TSE deferiu PEN -> Patriota
  // (PATRI) em 26/04/2018 e depois o uso do nome PATRIOTA em 26/03/2019 (mesma
  // pagina do TSE citada abaixo, acesso 2026-07-25). Sem este alias,
  // resolveCanonicalParty("PATRI") devolvia null e a timeline do cabo-daciolo
  // publicava PATRI e PATRIOTA como partidos diferentes.
  { sigla: "PATRIOTA", nome: "Patriota", aliases: ["PATRI"] },
  {
    sigla: "PPS",
    nome: "Partido Popular Socialista",
    aliases: [],
  },
  { sigla: "CIDADANIA", nome: "Cidadania", aliases: [] },
  { sigla: "PV", nome: "Partido Verde", aliases: [] },
  {
    sigla: "REDE",
    nome: "Rede Sustentabilidade",
    aliases: ["Rede Sustentabilidade"],
  },
  {
    sigla: "PT DO B",
    nome: "Partido Trabalhista do Brasil",
    aliases: ["PTDOB", "PTdoB"],
  },
  { sigla: "AVANTE", nome: "Avante", aliases: [] },
  {
    sigla: "DEMOCRATA",
    nome: "Democrata",
    aliases: ["D35", "Democrata 35", "O Democrata"],
  },
  { sigla: "AGIR", nome: "Agir", aliases: ["Agir 36", "AGIR 36"] },
  {
    sigla: "PRP",
    nome: "Partido Republicano Progressista",
    aliases: [],
  },
  {
    sigla: "PRD",
    nome: "Partido Renovação Democrática",
    aliases: ["Partido Renovacao Democratica"],
  },
  { sigla: "PRTB", nome: "Partido Renovador Trabalhista Brasileiro", aliases: [] },
  { sigla: "SOLIDARIEDADE", nome: "Solidariedade", aliases: ["Solidariedade", "SD"] },
  { sigla: "PTC", nome: "Partido Trabalhista Cristão", aliases: ["Partido Trabalhista Cristao"] },
  { sigla: "PMB", nome: "Partido da Mulher Brasileira", aliases: ["Partido da Mulher Brasileira"] },
  // PMN (historico) e MOBILIZA sao a mesma legenda em eras diferentes, tratadas
  // como entradas distintas igual PMDB/MDB e PFL/DEM. NUNCA listar "PMN" nem
  // "Partido da Mobilizacao Nacional" como alias aqui: isso sobrescrevia a chave de
  // indice do PMN e colapsava PMN -> MOBILIZA, reescrevendo historico curado
  // (review 2026-06-09).
  //
  // Data corrigida na etapa 2C da auditoria de 2026-07-24: a renomeacao foi
  // deferida pelo TSE em 05/12/2023, nao em 2022. Literal da fonte oficial
  // (https://www.tse.jus.br/partidos/partidos-politicos/partidos-registrados-no-tse,
  // HTTP 200, acesso 2026-07-25): "Partido da Mobilização Nacional (PMN)
  // Mobilização Nacional (MOBILIZA) PetCiv nº 0001624-23.1996.6.00.0000
  // 05/12/2023". A continuidade entre as duas eras vive no grupo historico de
  // src/lib/party-utils.ts, que impede a renomeacao de contar como troca.
  { sigla: "MOBILIZA", nome: "Mobilização Nacional", aliases: ["Mobiliza", "Mobilizacao Nacional"] },
  { sigla: "PCB", nome: "Partido Comunista Brasileiro", aliases: [] },
  // PRN e PRONA aparecem em mudancas_partido e nao resolviam para nada. Mesma
  // fonte do TSE acima: "Partido da Reconstrução Nacional (PRN) Partido
  // Trabalhista Cristão (PTC) ... 24/04/2001" e "Partido da Reedificação da
  // Ordem Nacional (PRONA) e Partido Liberal (PL) Partido da República (PR)
  // ... 19/12/2006".
  {
    sigla: "PRN",
    nome: "Partido da Reconstrução Nacional",
    aliases: ["Partido da Reconstrucao Nacional"],
  },
  {
    sigla: "PRONA",
    nome: "Partido da Reedificação da Ordem Nacional",
    aliases: ["Partido da Reedificacao da Ordem Nacional"],
  },
]

const normalizePartyValue = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase()

const PARTY_INDEX = new Map<string, CanonicalParty>()

// Guard de colisao: cada sigla/nome/alias normalizado deve mapear para um unico
// partido canonico. Sem isso, uma entrada posterior cujo alias colide com a chave
// de outra entrada a sobrescreve silenciosamente (bug PMN -> MOBILIZA, review 2026-06-09).
for (const party of PARTIES) {
  for (const token of [party.sigla, party.nome, ...party.aliases]) {
    const key = normalizePartyValue(token)
    const existing = PARTY_INDEX.get(key)
    if (existing && existing.sigla !== party.sigla) {
      throw new Error(
        `party-canonical: chave "${key}" (de "${token}") colide entre "${existing.sigla}" e "${party.sigla}". ` +
          `Cada sigla/nome/alias normalizado deve mapear para um unico partido canonico.`,
      )
    }
    PARTY_INDEX.set(key, party)
  }
}

export function resolveCanonicalParty(value: string | null | undefined): CanonicalParty | null {
  if (!value || !value.trim()) return null
  return PARTY_INDEX.get(normalizePartyValue(value)) ?? null
}

/** Nome editorial por extenso ancorado no registro TSE de 14/08/2026. */
export function officialPartyDisplayName(sigla: string | null | undefined): string | null {
  return resolveCanonicalParty(sigla)?.nome ?? null
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

export function canonicalPartiesEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (!left || !right) return false
  const leftParty = resolveCanonicalParty(left)
  const rightParty = resolveCanonicalParty(right)
  if (!leftParty || !rightParty) return false
  return leftParty.sigla === rightParty.sigla
}
