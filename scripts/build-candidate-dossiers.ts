import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { loadCandidatos } from "./lib/helpers"
import { getCanonicalPerson } from "./lib/canonical-person-map"
import { ASSERTIONS_MAP } from "./lib/factual-assertions"
import { SOURCE_OF_TRUTH_MAP } from "./lib/source-of-truth"
import type { AuditCandidateResult, CandidatePublicSnapshot } from "./lib/audit-types"

const args = process.argv.slice(2)
const reportPath =
  args.find((_, i) => args[i - 1] === "--report") ??
  resolve(process.cwd(), "scripts/audit-factual-report.json")
const outputDir =
  args.find((_, i) => args[i - 1] === "--output-dir") ??
  resolve(process.cwd(), "scripts/candidate-dossiers")
const onlyManual = args.includes("--only-manual")

interface AuditReport {
  gerado_em: string
  candidatos: AuditCandidateResult[]
  snapshots: CandidatePublicSnapshot[]
}

type DossierBucket =
  | "curated_ready"
  | "mirrored_needs_curadoria"
  | "manual_needed"
  | "blocked_no_anchor"

function inferBucket(
  snapshot: CandidatePublicSnapshot,
  audit: AuditCandidateResult,
  assertionConfidence?: string
): DossierBucket {
  if (assertionConfidence === "curated" && audit.auditoria_status === "auditado") {
    return "curated_ready"
  }
  if (!snapshot.has_tse_anchor && !snapshot.has_camara_anchor && !snapshot.has_senado_anchor) {
    return "blocked_no_anchor"
  }
  if (assertionConfidence === "mirrored") {
    return "mirrored_needs_curadoria"
  }
  if (audit.auditoria_status !== "auditado") {
    return "manual_needed"
  }
  return "manual_needed"
}

function inferNextSteps(
  snapshot: CandidatePublicSnapshot,
  audit: AuditCandidateResult,
  assertionConfidence?: string
): string[] {
  const steps: string[] = []

  if (!snapshot.has_tse_anchor && !snapshot.has_camara_anchor && !snapshot.has_senado_anchor) {
    return [
      "Resolver ancora oficial minima antes de qualquer promocao para curated.",
      "Confirmar identidade canonica e fonte primaria de partido/cargo atual.",
    ]
  }

  if (assertionConfidence === "curated" && audit.auditoria_status === "auditado") {
    return [
      "Ja esta curated e auditado.",
      "Pode entrar no lote operacional de publicacao se gate e release-verify estiverem verdes.",
    ]
  }

  if (assertionConfidence === "mirrored") {
    if (snapshot.has_camara_anchor || snapshot.has_senado_anchor) {
      steps.push(
        "Confirmar partido e cargo atual em fonte oficial legislativa ou institucional."
      )
    } else {
      steps.push("Confirmar partido e cargo atual em fonte oficial ou partidaria.")
    }

    steps.push("Confirmar cargo_disputado/pre-candidatura em imprensa solida recente.")
    steps.push("Promover assertion de mirrored para curated com verifiedAt e source reais.")
    return steps
  }

  steps.push("Revisar lacunas restantes do audit antes de promover para curated.")
  return steps
}

function main() {
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as AuditReport
  const cadastro = loadCandidatos()
  const snapshotsBySlug = new Map(report.snapshots.map((snapshot) => [snapshot.slug, snapshot]))

  mkdirSync(outputDir, { recursive: true })

  const rows = report.candidatos
    .filter((candidate) => !onlyManual || candidate.auditoria_status !== "auditado")
    .map((candidate) => {
      const snapshot = snapshotsBySlug.get(candidate.slug)
      if (!snapshot) {
        throw new Error(`Snapshot ausente para ${candidate.slug}`)
      }

      const cadastroItem = cadastro.find((item) => item.slug === candidate.slug)
      const canonicalPerson = getCanonicalPerson(candidate.slug)
      const assertion = ASSERTIONS_MAP.get(candidate.slug)
      const failingFields = candidate.campos.filter((campo) => campo.resultado === "fail")
      const bucket = inferBucket(snapshot, candidate, assertion?.confidence)
      const nextSteps = inferNextSteps(snapshot, candidate, assertion?.confidence)

      const dossier = {
        slug: candidate.slug,
        canonical_person_slug: canonicalPerson.canonicalSlug,
        related_person_slugs: canonicalPerson.slugs,
        nome_urna: candidate.nome_urna,
        audit_profile: candidate.audit_profile,
        bucket,
        auditoria_status: candidate.auditoria_status,
        assertion_confidence: assertion?.confidence ?? "none",
        verified_at: assertion?.verifiedAt ?? null,
        anchors: {
          has_tse: snapshot.has_tse_anchor,
          has_camara: snapshot.has_camara_anchor,
          has_senado: snapshot.has_senado_anchor,
        },
        ids: cadastroItem?.ids ?? {},
        secoes_obrigatorias: candidate.secoes_obrigatorias,
        next_steps: nextSteps,
        snapshot,
        failing_fields: failingFields.map((field) => ({
          campo: field.campo,
          severidade: field.severidade,
          motivo: field.motivo,
          fonte_publicacao: SOURCE_OF_TRUTH_MAP.get(field.campo)?.fonte_publicacao ?? null,
          fonte_confirmacao: SOURCE_OF_TRUTH_MAP.get(field.campo)?.fonte_confirmacao ?? null,
        })),
      }

      const markdown = [
        `# Dossie de ${candidate.slug}`,
        "",
        `- Nome: ${candidate.nome_urna}`,
        `- Pessoa canonica: ${canonicalPerson.canonicalSlug}`,
        `- Perfil de auditoria: ${candidate.audit_profile}`,
        `- Bucket: ${bucket}`,
        `- Status de auditoria: ${candidate.auditoria_status}`,
        `- Assertion: ${assertion?.confidence ?? "sem assertion"} (${assertion?.verifiedAt ?? "sem verifiedAt"})`,
        `- Ancoras: TSE=${snapshot.has_tse_anchor} | Camara=${snapshot.has_camara_anchor} | Senado=${snapshot.has_senado_anchor}`,
        `- Secoes obrigatorias: ${candidate.secoes_obrigatorias.join(", ")}`,
        "",
        "## Proximo passo editorial",
        "",
        ...nextSteps.map((step) => `- ${step}`),
        "",
        "## Falhas abertas",
        "",
        ...(failingFields.length > 0
          ? failingFields.map((field) => {
              const source = SOURCE_OF_TRUTH_MAP.get(field.campo)
              return `- ${field.campo}: ${field.motivo ?? "falha sem detalhe"} | publicacao=${source?.fonte_publicacao ?? "n/d"} | confirmacao=${source?.fonte_confirmacao ?? "n/d"}`
            })
          : ["- Nenhuma falha aberta."]),
      ].join("\n")

      writeFileSync(resolve(outputDir, `${candidate.slug}.json`), JSON.stringify(dossier, null, 2), "utf8")
      writeFileSync(resolve(outputDir, `${candidate.slug}.md`), `${markdown}\n`, "utf8")

      return {
        slug: candidate.slug,
        bucket,
        failing: failingFields.length,
      }
    })

  const summary = [
    "# Candidate Dossiers",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    `- Total: ${rows.length}`,
    `- Curated ready: ${rows.filter((row) => row.bucket === "curated_ready").length}`,
    `- Mirrored needs curadoria: ${rows.filter((row) => row.bucket === "mirrored_needs_curadoria").length}`,
    `- Manual needed: ${rows.filter((row) => row.bucket === "manual_needed").length}`,
    `- Blocked no anchor: ${rows.filter((row) => row.bucket === "blocked_no_anchor").length}`,
  ].join("\n")

  writeFileSync(resolve(outputDir, "SUMMARY.md"), `${summary}\n`, "utf8")
}

main()
