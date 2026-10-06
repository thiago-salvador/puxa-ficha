import { HomeRecentUpdates } from "@/components/HomeRecentUpdates"
import { getVerifiedCandidateUpdates } from "@/lib/verified-candidate-updates-data"
import { deveMostrarAtualizacoes } from "@/lib/verified-candidate-updates"

/** Sem `slugs`, as últimas mudanças de toda a base; com `slugs`, só daquele recorte (na home, quem está no 2º turno). */
export async function HomeRecentUpdatesData({ slugs }: { slugs?: readonly string[] } = {}) {
  const resource = await getVerifiedCandidateUpdates(slugs ? { slugs } : {})
  const escopo = slugs ? "segundo-turno" : "todos"
  if (!deveMostrarAtualizacoes(resource, escopo)) return null
  return <HomeRecentUpdates resource={resource} escopo={escopo} />
}
