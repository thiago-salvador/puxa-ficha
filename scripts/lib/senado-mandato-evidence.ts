/**
 * Extrai somente evidência de exercício pessoal publicada no endpoint
 * `senador/{id}/mandatos.json`.
 *
 * O período das legislaturas é contexto do mandato, não prova de que a pessoa
 * o exerceu. Sem início explícito em `Exercicios.Exercicio`, a entrada fica
 * inelegível e o produtor deve preservar qualquer linha legada sem promovê-la.
 */

export type SenadoMandatoExercise = {
  inicio: number | null
  fim: number | null
  inicioData: string | null
  fimData: string | null
  partido: string | null
  participacao: string | null
}

export type SenadoMandatoPeriod = {
  inicio: number
  fim: number | null
  inicioData: string
  fimData: string | null
  exercicios: SenadoMandatoExercise[]
}

export type SenadoMandatoEvidence = {
  elegivel: boolean
  proveniencia: "senado" | null
  periodoInicio: number | null
  periodoFim: number | null
  partido: string | null
  eleitoPor: "suplencia" | "voto direto" | null
  exercicios: SenadoMandatoExercise[]
  periodos: SenadoMandatoPeriod[]
  motivo: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
  const record = asRecord(value)
  return record ? [record] : []
}

function normalizedDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const brazilian = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(text)
  if (brazilian) return `${brazilian[3]}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`
  if (/^\d{4}$/.test(text)) return `${text}-01-01`
  return null
}

function yearFromDate(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2200) return value
  const date = normalizedDate(value)
  const year = date ? Number(date.slice(0, 4)) : null
  return year !== null && year >= 1900 && year <= 2200 ? year : null
}

function first(value: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (value[key] != null && String(value[key]).trim() !== "") return value[key]
  }
  return null
}

function extractExercises(mandato: Record<string, unknown>): Record<string, unknown>[] {
  const container = asRecord(mandato.Exercicios)
  return records(container?.Exercicio ?? mandato.Exercicio)
}

function periodosFromExercises(exercicios: SenadoMandatoExercise[]): SenadoMandatoPeriod[] {
  const ordered = exercicios
    .filter((exercise) => exercise.inicio !== null)
    .sort((a, b) => (a.inicioData ?? `${a.inicio}-01-01`).localeCompare(b.inicioData ?? `${b.inicio}-01-01`))
  const periods: SenadoMandatoPeriod[] = []
  for (const exercise of ordered) {
    const current = periods.at(-1)
    const currentEnd = current?.exercicios
      .map((item) => item.fimData ?? (item.fim === null ? null : `${item.fim}-12-31`))
      .filter((date): date is string => date !== null)
      .sort()
      .at(-1) ?? null
    const nextDay = currentEnd == null ? null : new Date(`${currentEnd}T00:00:00Z`)
    if (nextDay) nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    const startsAfterGap = current != null && currentEnd != null &&
      (exercise.inicioData ?? `${exercise.inicio}-01-01`) > (nextDay?.toISOString().slice(0, 10) ?? currentEnd)
    if (current == null || startsAfterGap) {
      periods.push({ inicio: exercise.inicio!, fim: exercise.fim, inicioData: exercise.inicioData ?? `${exercise.inicio}-01-01`, fimData: exercise.fimData, exercicios: [exercise] })
    } else {
      current.exercicios.push(exercise)
      current.fim = exercise.fimData === null ? null : Math.max(current.fim ?? 0, exercise.fim ?? 0)
    }
  }
  return periods.map((period) => {
    const last = period.exercicios.at(-1)
    return { ...period, fim: last?.fimData === null ? null : period.fim, fimData: last?.fimData ?? null }
  })
}

export function deriveSenadoMandatoEvidence(mandato: Record<string, unknown>): SenadoMandatoEvidence {
  const rawExercises = extractExercises(mandato)
  const exercicios = rawExercises.map((exercise) => ({
    inicioData: normalizedDate(first(exercise, ["DataInicio", "DataInicioExercicio"])),
    fimData: normalizedDate(first(exercise, ["DataFim", "DataFimExercicio"])),
    inicio: yearFromDate(first(exercise, ["DataInicio", "DataInicioExercicio"])),
    fim: yearFromDate(first(exercise, ["DataFim", "DataFimExercicio"])),
    partido: String(first(exercise, ["SiglaPartido", "SiglaPartidoParlamentar"]) ?? "").trim() || null,
    participacao: String(first(exercise, ["DescricaoParticipacao", "DescricaoExercicio", "TipoExercicio"]) ?? "").trim() || null,
  }))
  const datados = exercicios.filter((exercise) => exercise.inicio !== null)
  if (datados.length === 0) {
    return {
      elegivel: false,
      proveniencia: null,
      periodoInicio: null,
      periodoFim: null,
      partido: null,
      eleitoPor: null,
      exercicios,
      periodos: [],
      motivo: "Exercicios sem DataInicio explícita; período da legislatura não prova exercício pessoal",
    }
  }
  const periodos = periodosFromExercises(datados)
  const starts = periodos.map((period) => period.inicio)
  const participation = String(mandato.DescricaoParticipacao ?? datados.find((exercise) => exercise.participacao)?.participacao ?? "").toLowerCase()
  return {
    elegivel: true,
    proveniencia: "senado",
    periodoInicio: starts[0],
    periodoFim: periodos.length === 1 ? (periodos[0]?.fim ?? null) : null,
    partido: datados.find((exercise) => exercise.partido)?.partido ?? null,
    eleitoPor: participation.includes("suplent") ? "suplencia" : participation ? "voto direto" : null,
    exercicios,
    periodos,
    motivo: periodos.length > 1
      ? "Exercicios com DataInicio explícita em intervalos separados; não colapsar licença"
      : "Exercicios com DataInicio explícita",
  }
}
