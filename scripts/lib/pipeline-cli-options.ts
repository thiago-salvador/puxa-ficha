export type IngestCliOptions = {
  sourceArgs: string[]
  skipCamaraValidated: boolean
  targetSlugs?: string[]
  forceFrozen: boolean
  camaraCandidateTimeoutMs?: number
  senadoCandidateTimeoutMs?: number
}

function parseSlugs(value: string): string[] {
  return [...new Set(value.split(",").map((slug) => slug.trim()).filter(Boolean))]
}

function parsePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value == null || value.trim() === "") return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve ser um inteiro positivo em milissegundos`)
  }
  return parsed
}

/**
 * Overrides de acervo encerrado são deliberadamente scoped. Sem `--slugs`,
 * uma flag local poderia transformar uma recuperação pontual em recoleta global.
 */
export function parseIngestCliOptions(
  argv: string[],
  env: Record<string, string | undefined> = process.env
): IngestCliOptions {
  const sourceArgs: string[] = []
  let targetSlugs: string[] = []
  let forceFrozen = false
  let skipCamaraValidated = false

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === "--skip-camara-validated") {
      skipCamaraValidated = true
    } else if (value === "--force-frozen") {
      forceFrozen = true
    } else if (value === "--slugs") {
      targetSlugs = parseSlugs(argv[index + 1] ?? "")
      index++
    } else if (value.startsWith("--slugs=")) {
      targetSlugs = parseSlugs(value.slice("--slugs=".length))
    } else if (!value.startsWith("-")) {
      sourceArgs.push(value)
    }
  }

  const camaraCandidateTimeoutMs = parsePositiveInteger(
    env.PF_CAMARA_CANDIDATE_TIMEOUT_MS,
    "PF_CAMARA_CANDIDATE_TIMEOUT_MS"
  )
  const senadoCandidateTimeoutMs = parsePositiveInteger(
    env.PF_SENADO_CANDIDATE_TIMEOUT_MS,
    "PF_SENADO_CANDIDATE_TIMEOUT_MS"
  )
  const hasScopedOverride = forceFrozen || camaraCandidateTimeoutMs != null || senadoCandidateTimeoutMs != null
  if (hasScopedOverride && targetSlugs.length === 0) {
    throw new Error("--force-frozen e overrides de timeout exigem --slugs com escopo explícito")
  }

  return {
    sourceArgs,
    skipCamaraValidated,
    targetSlugs: targetSlugs.length > 0 ? targetSlugs : undefined,
    forceFrozen,
    camaraCandidateTimeoutMs,
    senadoCandidateTimeoutMs,
  }
}
