import { createClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  bootstrapCohort,
  createLocalCohortUpsertAdapter,
  createSupabaseCohortUpsertAdapter,
  buildSenadoProfilePatch,
  readSenadoProfileEvidence,
  readSenadoPublicCohortConfig,
  readRosterManifest,
  resolveCohortSourceTasks,
  runCohortSources,
  selectSenadoPublicCohort,
  validateSenadoPublicCohortIntersection,
  validateCohortSources,
  validateCohortSelection,
  writeCohortPromotionArtifact,
  type CohortUpsertClient,
} from "./lib/ingest-cohort"
import { emDryRun } from "./lib/dry-run"
import { loadCandidatos } from "./lib/helpers"

function option(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

export function assertLocalSupabaseEndpoint(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("endpoint Supabase inválido")
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"])
  if (!["http:", "https:"].includes(url.protocol) || !localHosts.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("apply-supabase só aceita endpoint localhost explícito")
  }
  return url.toString().replace(/\/$/, "")
}

function loadServiceKey(): string {
  for (const file of [".env.local", ".env"]) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(resolve(process.cwd(), file))) process.loadEnvFile(resolve(process.cwd(), file))
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) throw new Error("apply-supabase exige SUPABASE_SERVICE_ROLE_KEY no ambiente ou .env")
  return key
}

function parseBooleanOption(name: string): boolean {
  const value = option(name)
  if (value === undefined) return false
  if (value === "1" || value === "true") return true
  throw new Error(`--${name} inválido: use --${name}=1`)
}

async function main(): Promise<void> {
  const publicCohortConfigPath = option("public-cohort-config")
  const manifestOption = option("manifest")
  const sqs = (option("sqs") ?? "").split(",").map((sq) => sq.trim()).filter(Boolean)
  if (sqs.length === 0 && publicCohortConfigPath === undefined) throw new Error("coorte exige --sqs=SQ1,SQ2 explícito")
  const dryRun = parseBooleanOption("dry-run")
  const applyLocal = option("apply-local")
  const applySupabase = option("apply-supabase")
  const promotionArtifact = option("promotion-artifact")
  const profileEvidencePath = option("profile-evidence")
  const collectTse = parseBooleanOption("collect-tse")
  const requestedSources = validateCohortSources(option("sources"))
  if (collectTse && requestedSources.includes("tse")) {
    throw new Error("--collect-tse e --sources=tse duplicam a coleta TSE")
  }
  const sources = collectTse ? [...requestedSources, "tse"] : requestedSources
  if (dryRun && (applyLocal !== undefined || (applySupabase !== undefined && publicCohortConfigPath === undefined) || collectTse || promotionArtifact !== undefined)) throw new Error("dry-run não pode combinar aplicação, coleta ou artefato de promoção")
  if (!dryRun && emDryRun() && (applyLocal !== undefined || applySupabase !== undefined || collectTse)) throw new Error("PF_DRY_RUN ativo: aplicação/coleta bloqueada")
  if (applyLocal !== undefined && applySupabase !== undefined) throw new Error("escolha apply-local ou apply-supabase")
  if (applyLocal !== undefined && sources.length > 0) throw new Error("--sources exige --apply-supabase=endpoint-localhost")
  if (!dryRun && applyLocal === undefined && applySupabase === undefined) throw new Error("bootstrap exige --dry-run=1, --apply-local=CAMINHO ou --apply-supabase=URL")
  if (collectTse && applySupabase === undefined) throw new Error("collect-tse exige --apply-supabase=endpoint-localhost")
  if (profileEvidencePath !== undefined && applySupabase === undefined) throw new Error("profile-evidence exige --apply-supabase=endpoint-localhost")

  if (publicCohortConfigPath !== undefined) {
    if (applyLocal !== undefined || promotionArtifact !== undefined || profileEvidencePath !== undefined) throw new Error("configuração pública não combina com bootstrap, promoção ou profile-evidence")
    if (applySupabase === undefined) throw new Error("configuração pública exige --apply-supabase=endpoint-localhost para conferir candidatos_publico")
    const endpoint = assertLocalSupabaseEndpoint(applySupabase)
    const client = createClient(endpoint, loadServiceKey())
    const artifact = readSenadoPublicCohortConfig(publicCohortConfigPath)
    const { data: publicRows, error: publicError } = await client.from("candidatos_publico")
      .select("id,slug")
      .eq("cargo_disputado", "Senador")
      .order("slug")
      .limit(1000)
    if (publicError) throw new Error(`configuração pública: candidatos_publico: ${publicError.message}`)
    const expectedCount = artifact.source.expected_count
    const { data: canonicalRows, error: canonicalError } = await client.from("candidatos")
      .select("id,slug,nome_completo,nome_urna,cargo_disputado,estado,sq_candidato_2026")
      .eq("cargo_disputado", "Senador")
      .eq("publicavel", true)
      .order("slug")
      .limit(1000)
    if (canonicalError) throw new Error(`configuração pública: candidatos: ${canonicalError.message}`)
    const publicIds = new Set((publicRows ?? []).map((row) => row.id))
    if ((publicRows ?? []).length !== expectedCount || (canonicalRows ?? []).length !== expectedCount || (canonicalRows ?? []).some((row) => !publicIds.has(row.id))) throw new Error(`configuração pública diverge da interseção candidatos/candidatos_publico: esperado=${expectedCount}`)
    validateSenadoPublicCohortIntersection(artifact.rows, canonicalRows ?? [], expectedCount)
    const publicCohort = selectSenadoPublicCohort(artifact.rows, sqs)
    const sourceRun = sources.length > 0
      ? await runCohortSources(publicCohort.selection, sources, { seed: publicCohort.seed, tseYears: collectTse ? [2026] : undefined, dryRun })
      : undefined
    const benyCount = artifact.rows.filter((row) => row.slug === "tse-2026-110002553706" && row.ids.tse_sq_candidato["2026"] === "110002553706").length
    if (benyCount !== 1) throw new Error(`configuração pública exige Beny exatamente uma vez: ${benyCount}`)
    console.log(JSON.stringify({
      manifest: resolve(publicCohortConfigPath),
      config_sha256: createHash("sha256").update(readFileSync(resolve(publicCohortConfigPath))).digest("hex"),
      mode: dryRun ? "public-explicit-dry-run" : "public-explicit-local",
      endpoint,
      intersection: { config: artifact.rows.length, candidatos_publico: (publicRows ?? []).length, exact: true, beny: benyCount },
      selection: { sqs: publicCohort.selection.sqs, ufs: publicCohort.selection.ufs, rows: publicCohort.selection.rows.length },
      ...(sourceRun ? { sources: sourceRun } : {}),
    }, null, 2))
    if (sourceRun && sourceRun.exit_code !== 0) process.exitCode = sourceRun.exit_code
    return
  }

  if (!manifestOption) throw new Error("coorte exige --manifest=CAMINHO do roster")
  const manifestPath = resolve(manifestOption)
  const manifest = readRosterManifest(manifestPath)
  const selection = validateCohortSelection(manifest, { ano: 2026, sqs, explicit: true })
  // Resolve o registry antes do primeiro upsert do bootstrap. Assim, uma
  // fonte removida do registry não deixa uma coorte parcialmente escrita.
  const sourceTasks = dryRun || sources.length === 0 ? undefined : await resolveCohortSourceTasks(sources)
  if (applyLocal !== undefined) {
    const localRootOption = option("local-root")
    if (!localRootOption) throw new Error("apply-local exige --local-root=DIRETÓRIO que delimita o destino")
    const localRoot = resolve(localRootOption)
    const target = resolve(applyLocal)
    if (target !== localRoot && !target.startsWith(`${localRoot}/`)) throw new Error(`apply-local só aceita destino dentro de ${localRoot}`)
    const adapter = createLocalCohortUpsertAdapter(target)
    const result = await bootstrapCohort({ selection, dryRun: false, adapters: [adapter] })
    const seed = loadCandidatos()
    const promotion = promotionArtifact ? writeCohortPromotionArtifact(promotionArtifact, selection, seed) : undefined
    console.log(JSON.stringify({ manifest: manifestPath, mode: "local-json", selection: { sqs: selection.sqs, ufs: selection.ufs }, inserts: adapter.inserts, updates: adapter.updates, ...(promotion ? { promotion_artifact: promotion } : {}), ...result }, null, 2))
    return
  }
  if (applySupabase !== undefined) {
    const endpoint = assertLocalSupabaseEndpoint(applySupabase)
    const client = createClient(endpoint, loadServiceKey()) as unknown as CohortUpsertClient
    // O coletor TSE importa o cliente lazy; apontá-lo para o mesmo endpoint
    // local evita que um .env remoto seja usado depois do onboarding.
    process.env.SUPABASE_URL = endpoint
    const adapter = createSupabaseCohortUpsertAdapter(client)
    const result = await bootstrapCohort({ selection, dryRun: false, adapters: [adapter] })
    const seed = loadCandidatos()
    const promotion = promotionArtifact ? writeCohortPromotionArtifact(promotionArtifact, selection, seed) : undefined
    const output: Record<string, unknown> = { manifest: manifestPath, mode: "supabase-localhost", endpoint, selection: { sqs: selection.sqs, ufs: selection.ufs }, ...(promotion ? { promotion_artifact: promotion } : {}), ...result }
    if (profileEvidencePath !== undefined) {
      const document = readSenadoProfileEvidence(profileEvidencePath)
      if (!adapter.patchProfile) throw new Error("adapter Supabase sem etapa de perfil")
      const profiles: Array<{ sq: string; missing: string[] }> = []
      for (const row of selection.rows) {
        const source = document.rows[row.sq_candidato]
        if (!source) throw new Error(`evidência de perfil ausente para SQ ${row.sq_candidato}`)
        const profile = buildSenadoProfilePatch(row, source.base, source.complement, source.evidence)
        await adapter.patchProfile(row, profile)
        profiles.push({ sq: row.sq_candidato, missing: profile.missing })
      }
      output.profile = { evidence: profileEvidencePath, rows: profiles }
    }
    if (sources.length > 0) {
      const sourceRun = await runCohortSources(selection, sources, {
        seed,
        taskRegistry: sourceTasks,
        tseYears: collectTse ? [2026] : undefined,
      })
      output.sources = sourceRun
      if (sourceRun.exit_code !== 0) process.exitCode = sourceRun.exit_code
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }
  const result = await bootstrapCohort({
    selection,
    dryRun: true,
    adapters: [{ name: "tse-roster-plan", writes: false, async enrich() { throw new Error("dry-run adapter não deve ser chamado") } }],
  })
  console.log(JSON.stringify({ manifest: manifestPath, mode: "dry-run", selection: { sqs: selection.sqs, ufs: selection.ufs }, sources, ...result }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
