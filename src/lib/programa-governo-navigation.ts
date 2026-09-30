import type { ProgramaGovernoSecao } from "@/lib/programa-governo"

export function programaSecaoAnchor(sourceSha256: string, secaoId: string): string {
  return `programa-${sourceSha256}-${secaoId}`
}

export function resolveProgramaSectionTarget(
  secoes: readonly ProgramaGovernoSecao[],
  sourceSha256: string | undefined,
  search: string,
): { index: number; stale: boolean } {
  const params = new URLSearchParams(search)
  const requestedHash = params.get("sourceSha256")
  const requestedSection = params.get("secao")
  if (!requestedHash || !requestedSection) return { index: -1, stale: false }
  if (requestedHash !== sourceSha256) return { index: -1, stale: true }
  const index = secoes.findIndex((secao) => secao.id === requestedSection)
  return { index, stale: index < 0 }
}
