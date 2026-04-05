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

export function normalizeCandidatoProfileTab(
  tab: string | undefined,
): CandidatoProfileTabId | undefined {
  if (tab == null || tab === "") return undefined
  return (CANDIDATO_PROFILE_TAB_IDS as readonly string[]).includes(tab)
    ? (tab as CandidatoProfileTabId)
    : undefined
}
