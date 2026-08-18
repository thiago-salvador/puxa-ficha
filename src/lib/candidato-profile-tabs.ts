/** Tab ids aligned with `CandidatoProfile` / `ProfileTabs`. */
export const CANDIDATO_PROFILE_TAB_IDS = [
  "geral",
  "timeline",
  "dinheiro",
  "justica",
  "votos",
  "trajetoria",
  "legislacao",
  "alertas",
] as const

export type CandidatoProfileTabId = (typeof CANDIDATO_PROFILE_TAB_IDS)[number]

export const CANDIDATO_PROFILE_NAV_TAB_IDS = [
  "geral",
  "dinheiro",
  "justica",
  "votos",
  "trajetoria",
  "legislacao",
  "alertas",
] as const satisfies readonly CandidatoProfileTabId[]

export type CandidatoProfileNavTabId = (typeof CANDIDATO_PROFILE_NAV_TAB_IDS)[number]

export function normalizeCandidatoProfileTab(
  tab: string | undefined,
): CandidatoProfileTabId | undefined {
  if (tab == null || tab === "") return undefined
  return (CANDIDATO_PROFILE_TAB_IDS as readonly string[]).includes(tab)
    ? (tab as CandidatoProfileTabId)
    : undefined
}

export function normalizeCandidatoProfileNavTab(
  tab: string | undefined,
): CandidatoProfileNavTabId | undefined {
  const normalized = normalizeCandidatoProfileTab(tab)
  if (!normalized) return undefined
  return (CANDIDATO_PROFILE_NAV_TAB_IDS as readonly string[]).includes(normalized)
    ? (normalized as CandidatoProfileNavTabId)
    : undefined
}
