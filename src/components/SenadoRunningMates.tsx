import type { SenadoRunningMate, SenadoRunningMateAbsence } from "@/lib/senado-running-mates"

/** Resultado de `loadSenadoRunningMates`, enviado do servidor para a ficha. */
export interface SenadoRunningMatesPayload {
  data: Record<string, SenadoRunningMate[]>
  absence: Record<string, SenadoRunningMateAbsence>
  unavailable: boolean
}

export interface SenadoRunningMatesCandidate {
  slug: string
  nome_urna: string
}

/**
 * Public presentation of the two suplência positions. The reader is
 * fail-closed, so an empty map never becomes a guessed name.
 */
export function SenadoRunningMates({
  candidates,
  data,
  absence = {},
  unavailable = false,
  singleCandidate = false,
}: {
  candidates: SenadoRunningMatesCandidate[]
  data: Record<string, SenadoRunningMate[]>
  absence?: Record<string, SenadoRunningMateAbsence>
  unavailable?: boolean
  singleCandidate?: boolean
}) {
  if (candidates.length === 0) return null

  return (
    <section
      className="space-y-5 rounded-xl border border-border/60 bg-card/30 p-5 sm:p-6"
      aria-labelledby="senado-suplentes-title"
      data-pf-senado-suplentes
    >
      <div>
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Senado
        </p>
        <h2 id="senado-suplentes-title" className="mt-1 font-heading text-2xl uppercase">
          Suplentes da chapa
        </h2>
        <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
          Cada titular concorre com duas posições de suplência. Elas ficam separadas da lista de candidatos ao Senado.
        </p>
      </div>
      {unavailable ? (
        <p role="status" className="text-sm font-medium text-muted-foreground">
          Não foi possível consultar os suplentes nesta tentativa.
        </p>
      ) : (
        <div className={singleCandidate ? "" : "grid gap-4 sm:grid-cols-2"}>
          {candidates.map((candidate) => {
            const mates = [...(data[candidate.slug] ?? [])].sort((a, b) => a.ordem - b.ordem)
            const confirmedAbsence = absence[candidate.slug]
            return (
              <article key={candidate.slug} className="rounded-lg border border-border/50 p-4">
                {!singleCandidate && <h3 className="font-heading text-lg uppercase">{candidate.nome_urna}</h3>}
                {mates.length === 2 ? (
                  <ol className="mt-3 space-y-3" aria-label={`Suplentes de ${candidate.nome_urna}`}>
                    {mates.map((mate) => (
                      <li key={mate.sq_candidato} className="flex items-start justify-between gap-4 text-sm">
                        <span>
                          <span className="block font-semibold">{mate.nome_urna}</span>
                          <span className="block text-muted-foreground">Suplente {mate.ordem}{mate.situacao ? ` · ${mate.situacao}` : ""}</span>
                        </span>
                        <a href={mate.fonte_url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-foreground underline">
                          Fonte
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  confirmedAbsence ? (
                    <div className="mt-3 space-y-2 text-sm font-medium text-muted-foreground">
                      <p>Os registros de suplência encontrados no arquivo consultado estão indeferidos.</p>
                      <p>Fonte: <a href={confirmedAbsence.fonte_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline">TSE</a> · arquivo do TSE de {confirmedAbsence.fonte_data}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm font-medium text-muted-foreground">
                      Suplentes não disponíveis nesta cobertura.
                    </p>
                  )
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
