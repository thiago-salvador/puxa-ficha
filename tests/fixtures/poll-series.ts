import type { StatePollScenario } from "../../src/lib/state-polls"

const verified = <T,>(value: T) => ({ value, status: "publicado" as const })

/** Synthetic observations are test-only and never imported by the application. */
export function fixturePoll(date: string, values = [31, 42, 10]): StatePollScenario {
  return {
    id: `fixture-${date}`, sourceId: "fixture", sourceStatus: "aprovado", state: "publicado", electionYear: 2026,
    instituto: verified("Instituto de teste"), contratante: verified("Contratante de teste"),
    fieldwork: { start: verified(date), end: verified(date) }, publicationDate: verified(date),
    sample: { size: verified(1500), population: verified("Eleitores") },
    marginErrorPp: verified(2.5), confidencePercent: verified(95), method: verified("Telefone"),
    registration: { code: verified("REGISTRO-DE-TESTE"), url: verified("https://example.org/registro") },
    geography: { type: "nacional", label: "Brasil", code: "BR" }, office: "Presidente",
    provenance: { resultUrl: `https://example.org/pesquisa/${date}`, supportingUrls: [], registrationUrl: "https://example.org/registro", sourceKind: "fixture", routeClass: "fixture", routeReason: "fixture", consultedAt: `${date}T12:00:00Z`, capture: { format: "html", sha256: "test-only", status: "publicado" } },
    scenario: { id: `scenario-${date}`, turn: 1, geography: "Brasil", labelRaw: "Cenário de teste com A, B e C", question: verified("Pergunta de teste"), comparabilityKey: "2026|Presidente|BR|1|estimulado|teste-abc|total", resultados: values.map((value, index) => ({ rawLabel: `Candidato ${String.fromCharCode(65 + index)}`, candidateSlug: `candidate-${index}`, matchStatus: "exact_alias", valuePercent: value, status: "publicado" })) },
  }
}

export const fixtureSeries = [
  fixturePoll("2026-07-01", [31, 42, 10]), fixturePoll("2026-08-01", [34, 40, 9]),
  fixturePoll("2026-08-15", [35, 39, 8]), fixturePoll("2026-09-01", [38, 37, 7]),
]
