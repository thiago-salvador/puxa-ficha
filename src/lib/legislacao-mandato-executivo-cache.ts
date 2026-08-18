import type { LegislacaoMandatoExecutivo } from "./types"

/**
 * Cap em ementa para o payload servido pelo Vercel Data Cache (unstable_cache em
 * src/lib/api.ts:getCachedCandidatoBySlugResource). O valor precisa caber no
 * pior caso atual de inventario completo (GO, 3.600 atos) sem estourar 2 MB.
 */
const EMENTA_CACHE_CAP = 180

/**
 * Aplica a politica de cache do payload publico LME apos o mapper publico
 * (toPublicLegislacaoMandatoExecutivoRow):
 *
 * 1. Dedup de metadata.coverage_id: como `coverage_id` e' identico em todas as
 *    rows da mesma curadoria (ex.: 2548 rows de Zema com o mesmo coverage_id) e
 *    os consumidores em legislacao-profile-groups
 *    (getCompleteCoverageDescription / resolveExecutiveLegislationInventoryScope)
 *    retornam na primeira ocorrencia, basta manter o coverage_id na primeira
 *    row de cada coverage_id distinto. As demais zeram metadata para nao
 *    inflar o payload de unstable_cache.
 *
 * 2. Remove propriedades DB-only que a UI publica nao consome. O payload RSC
 *    nao e endpoint de banco; manter chaves vazias por linha foi suficiente
 *    para Ronaldo Caiado/GO voltar a exceder 2 MB com 3.600 atos.
 *
 * 3. Cap em ementa a EMENTA_CACHE_CAP caracteres com sufixo "...".
 *
 * 4. Ordenacao deterministica: data_norma desc (nulls last) -> ano desc ->
 *    tipo_norma asc -> numero asc.
 *
 * Comportamento identico ao bloco anonimo que vivia em api.ts ate 2026-05-01;
 * extraido para isolar a politica que provocou o Build warning de 2 MB. Desde
 * 2026-05-05, a politica ficou mais agressiva: campos nao usados no render
 * publico sao omitidos do objeto serializado.
 */
export function applyLegislacaoMandatoExecutivoCachePolicy(
  rows: LegislacaoMandatoExecutivo[]
): LegislacaoMandatoExecutivo[] {
  const seenCoverageIds = new Set<string>()
  return rows
    .map((row) => {
      const coverageId =
        typeof row.metadata?.coverage_id === "string"
          ? row.metadata.coverage_id
          : null
      let metadata = row.metadata
      if (coverageId) {
        if (seenCoverageIds.has(coverageId)) {
          metadata = {}
        } else {
          seenCoverageIds.add(coverageId)
        }
      }
      const ementa =
        row.ementa && row.ementa.length > EMENTA_CACHE_CAP
          ? row.ementa.slice(0, EMENTA_CACHE_CAP - 3) + "..."
          : row.ementa
      return {
        id: row.id,
        tipo_relacao: row.tipo_relacao,
        tipo_norma: row.tipo_norma,
        numero: row.numero,
        ano: row.ano,
        data_norma: row.data_norma,
        ementa,
        signatario: row.signatario,
        autoridade_papel: row.autoridade_papel,
        fonte_primaria_url: row.fonte_primaria_url,
        metadata,
      } as LegislacaoMandatoExecutivo
    })
    .sort((a, b) => {
      // data_norma desc, nulls last
      const aDate = a.data_norma ? new Date(a.data_norma).getTime() : 0
      const bDate = b.data_norma ? new Date(b.data_norma).getTime() : 0
      if (aDate !== bDate) return bDate - aDate
      // ano desc
      if ((a.ano ?? 0) !== (b.ano ?? 0)) return (b.ano ?? 0) - (a.ano ?? 0)
      // tipo_norma
      const aTipo = a.tipo_norma ?? ''
      const bTipo = b.tipo_norma ?? ''
      if (aTipo !== bTipo) return aTipo.localeCompare(bTipo)
      // numero
      const aNum = a.numero ?? ''
      const bNum = b.numero ?? ''
      return aNum.localeCompare(bNum)
    })
}
