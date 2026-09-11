/**
 * Coleta ainda não implementada. O antigo stub consultava servidores por nome
 * e descartava a resposta; agora informa o bloqueio antes de consultar o Portal.
 */

import { loadCandidatosPublicos } from "./helpers-db"
import type { IngestResult } from "./types"

export function resultadoTransparenciaPendente(slug: string): IngestResult {
  return {
    source: "transparencia",
    candidato: slug,
    tables_updated: [],
    rows_upserted: 0,
    errors: ["Coleta não implementada: endpoint, identidade e persistência precisam de contrato"],
    duration_ms: 0,
    coleta_resultado: "erro",
    coleta_detalhe:
      "Coleta não implementada; a antiga busca nominal de servidores não persistia dados. " +
      "Nenhuma consulta ao Portal realizada; nenhuma ausência confirmada.",
  }
}

export async function ingestTransparencia(): Promise<IngestResult[]> {
  // Sem contrato de persistência nem identificação comprovada, a consulta
  // nominal não sustenta informação sobre o candidato. A dívida segue aberta.
  return (await loadCandidatosPublicos()).map((cand) => resultadoTransparenciaPendente(cand.slug))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTransparencia().then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
