import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

type Priority = "P0" | "P1" | "P2"
type Category = "R1_selo" | "R2_destaques" | `R3:${string}` | `R5:${string}`
type Decision =
  | "publicar_com_evidencia"
  | "despublicar_com_motivo_data"
  | "recibo_nao_aplicabilidade"
  | "coletar"

interface CanonicalReview {
  run_id: number
  head_sha: string
  artifact_source: Record<string, unknown>
  r1_human_review_after_structured_contract: { count: number; slugs: string[] }
  human_review: {
    R2_destaques: { question: string; slugs: string[] }
    R3_coletas: { question: string; by_source: Record<string, string[]> }
    R5_materializacao_abas: { question: string; by_tab: Record<string, string[]> }
  }
  special_cases: {
    trajectory_without_visible_row: string[]
    process_only_missing: string[]
  }
}

interface SnapshotProfile {
  slug: string
  nome_urna: string
  cargo_disputado: string
  estado?: string | null
  partido_sigla?: string | null
  bio?: boolean
  foto?: boolean
  idade?: number | null
  redes?: boolean
  processos?: number
  sancoes?: number
  votos?: number
  historico?: unknown[]
  destaquesTotais?: number
  destaquesVisiveis?: number
  itensRevisar?: unknown[]
  coleta?: Record<string, unknown>
}

interface QueueDecisionItem {
  item_id: string
  slug: string
  category: Category
  question: string
  valid_decisions: Decision[]
  dependencies: string[]
  batch_eligible: boolean
  batch_key: string | null
}

interface QueueProfile {
  slug: string
  priority: Priority
  priority_reason: string
  categories: string[]
  current: Record<string, unknown>
  decisions: QueueDecisionItem[]
  flags: string[]
}

interface QueueCore {
  schema_version: 1
  queue_id: string
  generated_at: string
  canonical: { path: string; sha256: string; run_id: number; head_sha: string }
  snapshot: { path: string; sha256: string; checked_at: string; profiles_total: number }
  counts: Record<string, number>
  priority_notes: Record<string, unknown>
  profiles: QueueProfile[]
  batches: Array<{ batch_key: string; category: string; slugs: string[]; count: number }>
  jobs: Array<{
    source: string
    slugs: string[]
    profile_command: string
    batch_commands: string[]
    writes_production: false
  }>
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  )
}

function optionsFor(category: Category): Decision[] {
  if (category.startsWith("R3:")) return ["coletar", "recibo_nao_aplicabilidade"]
  if (category.startsWith("R5:")) {
    return ["publicar_com_evidencia", "recibo_nao_aplicabilidade", "coletar"]
  }
  return ["publicar_com_evidencia", "despublicar_com_motivo_data", "coletar"]
}

function currentProfile(profile: SnapshotProfile): Record<string, unknown> {
  return {
    slug: profile.slug,
    nome_urna: profile.nome_urna,
    cargo_disputado: profile.cargo_disputado,
    estado: profile.estado ?? null,
    partido_sigla: profile.partido_sigla ?? null,
    bio: profile.bio ?? false,
    foto: profile.foto ?? false,
    idade: profile.idade ?? null,
    redes: profile.redes ?? false,
    processos: profile.processos ?? 0,
    sancoes: profile.sancoes ?? 0,
    votos: profile.votos ?? 0,
    historico: profile.historico?.length ?? 0,
    destaques_totais: profile.destaquesTotais ?? 0,
    destaques_visiveis: profile.destaquesVisiveis ?? 0,
    itens_revisar: profile.itensRevisar ?? [],
    coleta: profile.coleta ?? {},
  }
}

function categoryQuestion(canonical: CanonicalReview, category: Category): string {
  if (category === "R1_selo") {
    return "A ficha permanece pública com evidência atual ou deve ser despublicada com motivo e data?"
  }
  if (category === "R2_destaques") return canonical.human_review.R2_destaques.question
  if (category.startsWith("R3:")) {
    return `${canonical.human_review.R3_coletas.question} Fonte: ${category.slice(3)}.`
  }
  return `${canonical.human_review.R5_materializacao_abas.question} Aba: ${category.slice(3)}.`
}

export function buildStrictAllQueue(
  canonical: CanonicalReview,
  snapshot: SnapshotProfile[],
  input: { canonicalPath: string; snapshotPath: string; snapshotCheckedAt: string; generatedAt?: string; outputDir?: string },
): QueueCore & { queue_sha256: string } {
  const canonicalRaw = readFileSync(input.canonicalPath)
  const snapshotRaw = readFileSync(input.snapshotPath)
  if (!Number.isFinite(Date.parse(input.snapshotCheckedAt))) throw new Error("snapshot_checked_at inválido")
  if (canonical.r1_human_review_after_structured_contract.count !== 76) throw new Error("R1 precisa ter 76 fichas")

  const categories = new Map<string, Set<Category>>()
  const add = (slug: string, category: Category): void => {
    const current = categories.get(slug) ?? new Set<Category>()
    current.add(category)
    categories.set(slug, current)
  }
  for (const slug of canonical.r1_human_review_after_structured_contract.slugs) add(slug, "R1_selo")
  for (const slug of canonical.human_review.R2_destaques.slugs) add(slug, "R2_destaques")
  for (const [source, slugs] of Object.entries(canonical.human_review.R3_coletas.by_source)) {
    for (const slug of slugs) add(slug, `R3:${source}`)
  }
  for (const [tab, slugs] of Object.entries(canonical.human_review.R5_materializacao_abas.by_tab)) {
    for (const slug of slugs) add(slug, `R5:${tab}`)
  }

  const occurrenceCount = [...categories.values()].reduce((total, values) => total + values.size, 0)
  if (occurrenceCount !== 459 || categories.size !== 169) {
    throw new Error(`universo strict-all divergente: ${occurrenceCount}/459, ${categories.size}/169`)
  }

  const p0 = new Set([
    ...canonical.special_cases.trajectory_without_visible_row,
    ...canonical.special_cases.process_only_missing,
  ])
  if (p0.size !== 10) throw new Error(`P0 divergente: ${p0.size}`)
  const topLevel = (values: Set<Category>): Set<string> =>
    new Set([...values].map((value) => value.split(":", 1)[0]))
  const p1Cohort = new Set([...categories].filter(([, values]) => topLevel(values).size === 4).map(([slug]) => slug))
  if (p1Cohort.size !== 41) throw new Error(`P1 divergente: ${p1Cohort.size}`)

  const r5Only = uniqueSorted([...categories].filter(([, values]) =>
    values.size === 1 && values.has("R5:votos"),
  ).map(([slug]) => slug))
  const r2Only = uniqueSorted([...categories].filter(([, values]) =>
    values.size === 1 && values.has("R2_destaques"),
  ).map(([slug]) => slug))
  if (r5Only.length !== 30 || r2Only.length !== 7) {
    throw new Error(`P2 lotes divergentes: R5=${r5Only.length}, R2=${r2Only.length}`)
  }

  const snapshotBySlug = new Map(snapshot.map((profile) => [profile.slug, profile]))
  const missingProfiles = [...categories.keys()].filter((slug) => !snapshotBySlug.has(slug))
  if (missingProfiles.length > 0) throw new Error(`snapshot sem ${missingProfiles.length} fichas: ${missingProfiles.join(",")}`)

  const profiles: QueueProfile[] = uniqueSorted(categories.keys()).map((slug) => {
    const values = categories.get(slug)!
    const priority: Priority = p0.has(slug) ? "P0" : p1Cohort.has(slug) ? "P1" : "P2"
    const flags: string[] = []
    const r3Sources = [...values].filter((value) => value.startsWith("R3:"))
    if (r3Sources.length === 2) flags.push("r3_duplo_fonte_nunca_em_lote")
    if (p0.has(slug) && p1Cohort.has(slug)) flags.push("promovido_de_p1_para_p0")
    const decisions = [...values].sort().map((category): QueueDecisionItem => {
      const dependencies: string[] = []
      if (category !== "R1_selo" && values.has("R1_selo")) dependencies.push(`${slug}:R1_selo`)
      if (category.startsWith("R5:") && r3Sources.length > 0) {
        dependencies.push(...r3Sources.map((source) => `${slug}:${source}`))
      }
      const batchKey = values.size === 1 && category === "R5:votos"
        ? "P2:R5-votos-only"
        : values.size === 1 && category === "R2_destaques"
          ? "P2:R2-only"
          : null
      return {
        item_id: `${slug}:${category}`,
        slug,
        category,
        question: categoryQuestion(canonical, category),
        valid_decisions: optionsFor(category),
        dependencies,
        batch_eligible: batchKey !== null && !flags.includes("r3_duplo_fonte_nunca_em_lote"),
        batch_key: batchKey,
      }
    })
    return {
      slug,
      priority,
      priority_reason: priority === "P0"
        ? "caso especial da revisão independente"
        : priority === "P1"
          ? "presente nas quatro categorias; decidir R1 primeiro"
          : "baixa interseção; lote somente quando explicitamente elegível",
      categories: [...values].sort(),
      current: currentProfile(snapshotBySlug.get(slug)!),
      decisions,
      flags,
    }
  })

  const evidenceDir = relative(process.cwd(), input.outputDir ?? dirname(resolve(input.canonicalPath)))
  const jobs = Object.entries(canonical.human_review.R3_coletas.by_source).map(([source, slugs]) => {
    const sorted = uniqueSorted(slugs)
    const script = source === "transparencia-sanctions"
      ? "scripts/audit/collect-strict-all-sanctions.ts"
      : "scripts/curadoria-processos-lote.ts"
    const common = source === "transparencia-sanctions"
      ? `PF_DRY_RUN=1 node --import tsx ${script} --slugs={SLUGS} --out=${evidenceDir}/r3-${source}-{EXECUTION}.json`
      : `node --import tsx ${script} --slugs={SLUGS} --snapshot={SNAPSHOT} --evidence=${evidenceDir}/r3-${source}-{EXECUTION}.json`
    return {
      source,
      slugs: sorted,
      profile_command: common.replace("{SLUGS}", "{SLUG}"),
      batch_commands: chunks(sorted, 20).map((batch) => common.replace("{SLUGS}", batch.join(","))),
      writes_production: false as const,
    }
  })

  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const core: QueueCore = {
    schema_version: 1,
    queue_id: "strict-all-human-review:2026-08-30",
    generated_at: generatedAt,
    canonical: {
      path: relative(process.cwd(), input.canonicalPath),
      sha256: sha256(canonicalRaw),
      run_id: canonical.run_id,
      head_sha: canonical.head_sha,
    },
    snapshot: {
      path: relative(process.cwd(), input.snapshotPath),
      sha256: sha256(snapshotRaw),
      checked_at: input.snapshotCheckedAt,
      profiles_total: snapshot.length,
    },
    counts: {
      occurrences: occurrenceCount,
      profiles: categories.size,
      p0_profiles: profiles.filter((profile) => profile.priority === "P0").length,
      p1_cohort_profiles: p1Cohort.size,
      p1_queue_profiles: profiles.filter((profile) => profile.priority === "P1").length,
      p1_promoted_to_p0: [...p0].filter((slug) => p1Cohort.has(slug)).length,
      p2_profiles: profiles.filter((profile) => profile.priority === "P2").length,
      p2_r5_votes_only: r5Only.length,
      p2_r2_only: r2Only.length,
      r3_occurrences: Object.values(canonical.human_review.R3_coletas.by_source).reduce((total, slugs) => total + slugs.length, 0),
    },
    priority_notes: {
      p0: "10 casos individuais; nenhuma decisão default",
      p1: "41 fichas pertencem à coorte de quatro categorias; quatro foram promovidas a P0, restando 37 sem duplicação",
      p2: "122 fichas; somente os lotes R5-votos-only e R2-only são elegíveis para decisão em lote",
      r3: "dupla fonte nunca é elegível para lote",
    },
    profiles,
    batches: [
      { batch_key: "P2:R5-votos-only", category: "R5:votos", slugs: r5Only, count: r5Only.length },
      { batch_key: "P2:R2-only", category: "R2_destaques", slugs: r2Only, count: r2Only.length },
    ],
    jobs,
  }
  return { ...core, queue_sha256: sha256(canonicalJson(core)) }
}

function renderPage(queue: QueueCore & { queue_sha256: string }, priority: Priority): string {
  const profiles = queue.profiles.filter((profile) => profile.priority === priority)
  const cards = profiles.map((profile) => {
    const current = profile.current
    const decisions = profile.decisions.map((item) => `
      <fieldset class="decision" data-item-id="${escapeHtml(item.item_id)}" data-category="${escapeHtml(item.category)}">
        <legend>${escapeHtml(item.category)}</legend>
        <p>${escapeHtml(item.question)}</p>
        <label>Decisão
          <select class="choice">
            <option value="">Pendente, sem default</option>
            ${item.valid_decisions.map((decision) => `<option value="${decision}">${escapeHtml(decision)}</option>`).join("")}
          </select>
        </label>
        <label>URL da evidência <input class="evidence-url" type="url"></label>
        <label>Verificado em <input class="checked-at" type="datetime-local"></label>
        <label>SHA-256 <input class="evidence-sha" pattern="[a-f0-9]{64}"></label>
        <label>Motivo <textarea class="reason"></textarea></label>
        <label>Data efetiva <input class="effective-date" type="date"></label>
        <label>Escopo do recibo <input class="scope" placeholder="fonte, período e identidade"></label>
        ${item.dependencies.length > 0 ? `<p class="deps">Bloqueios: ${escapeHtml(item.dependencies.join(", "))}</p>` : ""}
      </fieldset>`).join("")
    return `<article class="card" data-slug="${escapeHtml(profile.slug)}">
      <header><div><h2>${escapeHtml(current.nome_urna)} <code>${escapeHtml(profile.slug)}</code></h2>
      <p>${escapeHtml(current.cargo_disputado)} ${escapeHtml(current.estado)} · ${escapeHtml(current.partido_sigla)}</p></div>
      <button class="submit-profile" type="button">Gravar decisões desta ficha</button></header>
      <details><summary>Dados atuais</summary><pre>${escapeHtml(JSON.stringify(current, null, 2))}</pre></details>
      ${profile.flags.map((flag) => `<p class="flag">${escapeHtml(flag)}</p>`).join("")}
      ${decisions}
      <p class="status" aria-live="polite"></p>
    </article>`
  }).join("\n")
  const queueJson = JSON.stringify({ queue_id: queue.queue_id, queue_sha256: queue.queue_sha256 }).replaceAll("</", "<\\/")
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
  <title>Strict-all ${priority}</title><style>
  :root{font-family:ui-sans-serif,system-ui;color:#17202a;background:#f4f1eb}body{margin:0}nav,main{max-width:1160px;margin:auto;padding:20px}nav{display:flex;gap:12px;position:sticky;top:0;background:#f4f1eb;border-bottom:1px solid #d6cec0;z-index:2}.card{background:white;border:1px solid #d8d0c2;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 6px 20px #3b2e1f12}.card header{display:flex;justify-content:space-between;gap:16px;align-items:start}.decision{border:1px solid #ddd4c7;border-radius:12px;margin:14px 0;padding:14px}.decision label{display:block;margin:8px 0}.decision input,.decision select,.decision textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #bdb3a4;border-radius:8px}.submit-profile{background:#153b2f;color:white;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}.flag,.deps{color:#8a3d18;font-weight:600}.status{min-height:1.4em}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f5f0;padding:12px;border-radius:10px}@media(max-width:700px){.card header{display:block}.submit-profile{width:100%}}
  </style></head><body><nav><strong>Strict-all</strong><a href="index.html">Resumo</a><a href="p0.html">P0</a><a href="p1.html">P1</a><a href="p2.html">P2</a></nav>
  <main><h1>${priority}: ${profiles.length} fichas</h1><p>Nenhuma opção vem selecionada. O servidor grava JSONL e não toca banco.</p>${cards}</main>
  <script>const queue=${queueJson};
  function value(root,selector){return root.querySelector(selector).value.trim()}
  document.querySelectorAll('.submit-profile').forEach(button=>button.addEventListener('click',async()=>{
    const card=button.closest('.card'),status=card.querySelector('.status');
    const decisoes=[...card.querySelectorAll('.decision')].map(root=>({
      item_id:root.dataset.itemId,category:root.dataset.category,decisao:value(root,'.choice'),
      evidence_url:value(root,'.evidence-url'),evidence_checked_at:value(root,'.checked-at')?new Date(value(root,'.checked-at')).toISOString():'',evidence_sha256:value(root,'.evidence-sha'),
      motivo:value(root,'.reason'),data_efetiva:value(root,'.effective-date'),escopo:value(root,'.scope')
    })).filter(item=>item.decisao);
    if(decisoes.length===0){status.textContent='Nada decidido. A ficha continua pendente.';return}
    button.disabled=true;status.textContent='Gravando...';
    try{const response=await fetch('/revisao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schema_version:1,...queue,slug:card.dataset.slug,decisoes})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||('HTTP '+response.status));status.textContent='Decisões gravadas no JSONL. Nenhum dado foi aplicado.'}
    catch(error){status.textContent='Falha: '+error.message;button.disabled=false}
  }))</script></body></html>`
}

function renderIndex(queue: QueueCore & { queue_sha256: string }): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Strict-all review</title>
  <style>body{max-width:900px;margin:40px auto;padding:0 20px;font:16px/1.5 ui-sans-serif,system-ui;color:#17202a;background:#f4f1eb}section{background:white;padding:22px;border-radius:16px;margin:18px 0}a{color:#075e45;font-weight:700}code{overflow-wrap:anywhere}</style></head><body>
  <h1>Fila strict-all</h1><p>459 ocorrências, 169 fichas, zero decisão default. Saída append-only em JSONL.</p>
  <section><h2><a href="p0.html">P0, 10 fichas</a></h2><p>Casos especiais, todos na mesma página para uma sessão de revisão.</p></section>
  <section><h2><a href="p1.html">P1, ${queue.counts.p1_queue_profiles} fichas</a></h2><p>Coorte original de 41 nas quatro categorias, com ${queue.counts.p1_promoted_to_p0} promovidas a P0 sem duplicação.</p></section>
  <section><h2><a href="p2.html">P2, ${queue.counts.p2_profiles} fichas</a></h2><p>Inclui os lotes elegíveis de 30 R5-votos-only e 7 R2-only. R3 em duas fontes nunca entra em lote.</p></section>
  <section><h2>Integridade</h2><p>Queue SHA-256: <code>${queue.queue_sha256}</code></p><p>Snapshot: <code>${escapeHtml(queue.snapshot.checked_at)}</code></p></section>
  </body></html>`
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const canonicalPath = resolve(flag(argv, "canonical") ?? "QA/evidencias/2026-08-30-superficie-strict-all-human-review.json")
  const snapshotPath = resolve(flag(argv, "snapshot") ?? "")
  const outDir = resolve(flag(argv, "out") ?? "QA/evidencias/2026-08-30-strict-all-review-funnel")
  const snapshotCheckedAt = flag(argv, "snapshot-checked-at")
  const generatedAt = flag(argv, "generated-at") ?? undefined
  if (!snapshotPath || !snapshotCheckedAt) throw new Error("--snapshot e --snapshot-checked-at são obrigatórios")
  const canonical = JSON.parse(readFileSync(canonicalPath, "utf8")) as CanonicalReview
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as SnapshotProfile[]
  const queue = buildStrictAllQueue(canonical, snapshot, {
    canonicalPath,
    snapshotPath,
    snapshotCheckedAt,
    generatedAt,
    outputDir: outDir,
  })
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, "queue.json"), `${JSON.stringify(queue, null, 2)}\n`)
  writeFileSync(join(outDir, "profiles-current.json"), `${JSON.stringify(queue.profiles.map((profile) => profile.current), null, 2)}\n`)
  writeFileSync(join(outDir, "input-receipt.json"), `${JSON.stringify({
    canonical: queue.canonical,
    snapshot: queue.snapshot,
    queue_sha256: queue.queue_sha256,
    generated_at: queue.generated_at,
  }, null, 2)}\n`)
  writeFileSync(join(outDir, "jobs.json"), `${JSON.stringify(queue.jobs, null, 2)}\n`)
  writeFileSync(join(outDir, "index.html"), renderIndex(queue))
  for (const priority of ["P0", "P1", "P2"] as const) {
    writeFileSync(join(outDir, `${priority.toLowerCase()}.html`), renderPage(queue, priority))
  }
  console.log(JSON.stringify({ out: outDir, queue_sha256: queue.queue_sha256, counts: queue.counts }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
