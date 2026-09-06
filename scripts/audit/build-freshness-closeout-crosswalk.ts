import type { OfficialCandidacy, ActiveProfileCrosswalkEntry } from "../../src/lib/candidate-publication-integrity"
import { classifyOfficialCandidacy, validateActiveProfileCrosswalk } from "../../src/lib/candidate-publication-integrity"

type Row = OfficialCandidacy & { party: string }
type Profile = ActiveProfileCrosswalkEntry & { office: string; uf: string | null; names: string[]; parties: string[]; statuses: (string | null)[] }
type Snapshot = { metadata: { checked_at: string; source: string; election_id: string; active_registration_count: number; active_profile_count: number; unresolved_count: number; source_urls: string[] }; profiles: Profile[] }
type Source = { status: string; divulgacand: { status: string; checked_at: string; sources: string[] } }

export function buildCloseoutCrosswalk(rows: Row[], source: Source, previous: Snapshot): Snapshot {
  if (source.status !== "fresh" || source.divulgacand.status !== "fresh" || new Set(source.divulgacand.sources).size !== 28) throw new Error("Exige fonte fresca das 28 listagens oficiais")
  if (new Set(rows.map(r => r.sq_candidato)).size !== rows.length) throw new Error("SQ duplicada na fonte")
  if (rows.some(r => classifyOfficialCandidacy(r) === "review_required")) throw new Error("status oficial não resolvido")
  const groups = new Map<string, Row[]>()
  for (const row of rows.filter(r => classifyOfficialCandidacy(r) === "active")) {
    const slug = row.sq_candidato === "140002554434" ? "ruth-reis" : row.profile_slug
    if (!slug) throw new Error(`SQ sem perfil: ${row.sq_candidato}`)
    const group = groups.get(slug) ?? []
    group.push({...row, profile_slug: slug})
    groups.set(slug, group)
  }
  const profiles: Profile[] = [...groups.entries()].map(([slug, group]): Profile => {
    const sqs = group.map(r => r.sq_candidato).sort()
    if (group.some(r => r.office !== group[0].office || r.uf !== group[0].uf)) throw new Error(`Colisão de perfil: ${slug}`)
    if (group.length > 1 && (slug !== "laudicerio-aguiar" || sqs.join() !== "110002553937,110002554073")) throw new Error(`Duplicidade não aprovada: ${slug}`)
    return {profile_slug: slug, office: group[0].office, uf: group[0].uf, canonical_registration_sq: group.length === 1 ? sqs[0] : null, registration_sqs: sqs, names: [...new Set(group.map(r => r.name))].sort(), parties: [...new Set(group.map(r => r.party))].sort(), statuses: [...new Set(group.map(r => r.status))].sort(), publication_status: group.length === 1 ? "active" : "quarantine_duplicate_active"}
  }).sort((a,b) => a.office.localeCompare(b.office) || (a.uf ?? "").localeCompare(b.uf ?? "") || a.profile_slug.localeCompare(b.profile_slug))
  validateActiveProfileCrosswalk(profiles, {activeRegistrationCount: 208, activeProfileCount: 207, unresolvedCount: 0})
  const active = profiles.reduce((n,p) => n + p.registration_sqs.length, 0)
  if (active !== 208 || profiles.length !== 207) throw new Error("Universo mudou: esperado 208 inscrições / 207 perfis")
  return {metadata: {...previous.metadata, checked_at: source.divulgacand.checked_at, active_registration_count: active, active_profile_count: profiles.length, unresolved_count: 0, source_urls: [...source.divulgacand.sources]}, profiles}
}
