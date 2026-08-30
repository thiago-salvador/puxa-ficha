/** Converte decisões humanas da fila strict-all em propostas SQL fail-closed. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

interface QueueDecision {
  item_id: string
  slug: string
  category: string
  valid_decisions: string[]
  dependencies: string[]
}

interface QueueProfile {
  slug: string
  current: Record<string, unknown>
  decisions: QueueDecision[]
}

interface Queue {
  schema_version: number
  queue_id: string
  queue_sha256: string
  profiles: QueueProfile[]
}

interface SubmittedDecision {
  item_id: string
  category: string
  decisao: string
  evidence_url?: string
  evidence_checked_at?: string
  evidence_sha256?: string
  motivo?: string
  data_efetiva?: string
  escopo?: string
}

interface DecisionRecord {
  schema_version: number
  recebido_em: string
  queue_id: string
  queue_sha256: string
  slug: string
  decisoes: SubmittedDecision[]
}

interface PlannedAction {
  kind: "unpublish_profile" | "non_applicable_receipt"
  item_id: string
  slug: string
  category: string
  receivedAt: string
  decision: SubmittedDecision
  profile: QueueProfile
}

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

function safeId(value: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9._:-]+$/.test(value)) throw new Error(`${label} inválido`)
  return value
}

function parseJsonl(path: string): DecisionRecord[] {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as DecisionRecord
    } catch (error) {
      throw new Error(`JSONL linha ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function receiptSource(category: string): string | null {
  if (category.startsWith("R3:")) return category.slice(3)
  if (category === "R5:votos") return "destaques-votacoes"
  if (category === "R5:trajetoria") return "destaques-trajetoria"
  return null
}

function validHttps(value: unknown): boolean {
  try {
    const parsed = new URL(String(value))
    return parsed.protocol === "https:" && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && /[zZ]|[+-]\d{2}:\d{2}$/.test(value)
}

function validateDecisionEvidence(decision: SubmittedDecision): void {
  if (["publicar_com_evidencia", "recibo_nao_aplicabilidade"].includes(decision.decisao)) {
    if (!validHttps(decision.evidence_url)
      || !decision.evidence_checked_at
      || !Number.isFinite(Date.parse(decision.evidence_checked_at))
      || !/[zZ]|[+-]\d{2}:\d{2}$/.test(decision.evidence_checked_at)
      || !/^[a-f0-9]{64}$/.test(decision.evidence_sha256 ?? "")) {
      throw new Error(`${decision.item_id}: evidência HTTPS, horário com fuso e SHA-256 são obrigatórios`)
    }
  }
  if (decision.decisao === "despublicar_com_motivo_data"
    && ((decision.motivo ?? "").trim().length < 10 || !/^\d{4}-\d{2}-\d{2}$/.test(decision.data_efetiva ?? ""))) {
    throw new Error(`${decision.item_id}: motivo e data efetiva são obrigatórios`)
  }
  if (decision.decisao === "recibo_nao_aplicabilidade" && (decision.escopo ?? "").trim().length < 10) {
    throw new Error(`${decision.item_id}: escopo do recibo é obrigatório`)
  }
}

export function planStrictAllDecisions(queue: Queue, records: DecisionRecord[]): {
  actions: PlannedAction[]
  blocked: Array<Record<string, unknown>>
  pending: string[]
  superseded: string[]
  jobs: Array<Record<string, unknown>>
} {
  if (queue.schema_version !== 1) throw new Error("queue schema incompatível")
  const profileBySlug = new Map(queue.profiles.map((profile) => [profile.slug, profile]))
  const itemById = new Map(queue.profiles.flatMap((profile) => profile.decisions.map((item) => [item.item_id, item] as const)))
  const submitted = new Map<string, { record: DecisionRecord; decision: SubmittedDecision }>()
  for (const record of records) {
    if (record.schema_version !== 1 || record.queue_id !== queue.queue_id || record.queue_sha256 !== queue.queue_sha256) {
      throw new Error(`registro de ${record.slug}: fila ou hash divergente`)
    }
    if (!validTimestamp(record.recebido_em)) {
      throw new Error(`registro de ${record.slug}: recebido_em deve ser um horário real com fuso`)
    }
    if (!profileBySlug.has(record.slug)) throw new Error(`slug fora da fila: ${record.slug}`)
    for (const decision of record.decisoes) {
      const item = itemById.get(decision.item_id)
      if (!item || item.slug !== record.slug || item.category !== decision.category) {
        throw new Error(`item fora da fila: ${decision.item_id}`)
      }
      if (!item.valid_decisions.includes(decision.decisao)) {
        throw new Error(`${decision.item_id}: decisão não permitida`)
      }
      validateDecisionEvidence(decision)
      const previous = submitted.get(decision.item_id)
      if (previous && JSON.stringify(previous.decision) !== JSON.stringify(decision)) {
        throw new Error(`${decision.item_id}: decisões conflitantes no JSONL`)
      }
      submitted.set(decision.item_id, { record, decision })
    }
  }

  const unpublishSlugs = new Set([...submitted].filter(([itemId, value]) =>
    itemId.endsWith(":R1_selo") && value.decision.decisao === "despublicar_com_motivo_data",
  ).map(([itemId]) => itemId.split(":", 1)[0]))
  const actions: PlannedAction[] = []
  const blocked: Array<Record<string, unknown>> = []
  const superseded = [...unpublishSlugs].flatMap((slug) =>
    profileBySlug.get(slug)!.decisions.filter((item) => item.category !== "R1_selo").map((item) => item.item_id),
  )
  const jobs: Array<Record<string, unknown>> = []
  const resolved = new Set<string>()
  const nonApplicable = new Map<string, { item: QueueDecision; value: { record: DecisionRecord; decision: SubmittedDecision }; profile: QueueProfile }>()

  for (const [itemId, value] of submitted) {
    const item = itemById.get(itemId)!
    const profile = profileBySlug.get(item.slug)!
    if (unpublishSlugs.has(item.slug) && item.category !== "R1_selo") {
      superseded.push(itemId)
      continue
    }
    if (value.decision.decisao === "coletar") {
      jobs.push({ item_id: itemId, slug: item.slug, category: item.category, status: "aguarda_execucao" })
      continue
    }
    if (value.decision.decisao === "publicar_com_evidencia") {
      blocked.push({
        item_id: itemId,
        reason: "decisão registrada, mas o payload factual da publicação não existe na fila; gerar payload específico antes da migration",
      })
      continue
    }
    if (value.decision.decisao === "despublicar_com_motivo_data") {
      if (item.category !== "R1_selo") {
        blocked.push({ item_id: itemId, reason: "despublicação editorial sem alvo de linha identificado" })
        continue
      }
      actions.push({ kind: "unpublish_profile", item_id: itemId, slug: item.slug, category: item.category, receivedAt: value.record.recebido_em, decision: value.decision, profile })
      resolved.add(itemId)
      continue
    }
    if (value.decision.decisao === "recibo_nao_aplicabilidade") {
      if (!receiptSource(item.category)) {
        blocked.push({ item_id: itemId, reason: "categoria sem fonte canônica de receipt" })
        continue
      }
      nonApplicable.set(itemId, { item, value, profile })
    }
  }

  // Uma decisão dependente só vira ação quando cada pré-requisito já produziu
  // uma ação factual. O ponto fixo torna o resultado independente da ordem do JSONL.
  let advanced = true
  while (advanced) {
    advanced = false
    for (const [itemId, candidate] of nonApplicable) {
      if (resolved.has(itemId) || !candidate.item.dependencies.every((dependency) => resolved.has(dependency))) continue
      actions.push({
        kind: "non_applicable_receipt",
        item_id: itemId,
        slug: candidate.item.slug,
        category: candidate.item.category,
        receivedAt: candidate.value.record.recebido_em,
        decision: candidate.value.decision,
        profile: candidate.profile,
      })
      resolved.add(itemId)
      advanced = true
    }
  }
  for (const [itemId, candidate] of nonApplicable) {
    if (resolved.has(itemId)) continue
    blocked.push({
      item_id: itemId,
      reason: "dependência sem ação factual concluída",
      dependencies: candidate.item.dependencies.filter((dependency) => !resolved.has(dependency)),
    })
  }

  const pending = [...itemById.keys()].filter((itemId) => !submitted.has(itemId) && !superseded.includes(itemId)).sort()
  return { actions, blocked, pending, superseded: [...new Set(superseded)].sort(), jobs }
}

export function generateStrictAllSql(
  queue: Queue,
  actions: PlannedAction[],
  version: string,
  batchId: string,
): { migration: string; readback: string; rollback: string; rollbackReadback: string } {
  const execution = `migration:${version}:${batchId}`
  const profiles = [...new Map(actions.map((action) => [action.slug, action.profile])).values()]
  const expectedValues = profiles.map((profile) => {
    const current = profile.current
    const unpublished = actions.some((action) => action.slug === profile.slug && action.kind === "unpublish_profile")
    return `  (${sql(profile.slug)},${sql(current.nome_urna)},${sql(current.cargo_disputado)},${sql(current.estado)},${sql(current.partido_sigla)},${unpublished})`
  }).join(",\n")
  const unpublish = actions.filter((action) => action.kind === "unpublish_profile")
  const receipts = actions.map((action) => {
    const source = action.kind === "non_applicable_receipt" ? receiptSource(action.category)! : "strict-all-human-review"
    const result = action.kind === "non_applicable_receipt" ? "nao_aplicavel" : "encontrado"
    const detail = JSON.stringify({
      contract_version: 1,
      queue_sha256: queue.queue_sha256,
      item_id: action.item_id,
      decisao: action.decision.decisao,
      motivo: action.decision.motivo ?? null,
      data_efetiva: action.decision.data_efetiva ?? null,
      escopo: action.decision.escopo ?? null,
      evidence_sha256: action.decision.evidence_sha256 ?? null,
      recebido_em: action.receivedAt,
    })
    const executedAt = action.decision.evidence_checked_at ?? action.receivedAt
    return `SELECT ${sql(source)},'candidato',${sql(action.slug)},c.id,${sql(executedAt)}::timestamptz,${sql(result)},${result === "encontrado" ? 1 : 0},${sql(`strict_all_v1:${detail}`)},${sql(action.decision.evidence_url ?? null)},${sql(execution)},${sql(action.kind === "unpublish_profile" ? "escrita" : "coleta")} FROM public.candidatos c WHERE c.slug=${sql(action.slug)} AND ${sql(`${batchId}:${actions.length}`)}=${sql(`${batchId}:${actions.length}`)}`
  })
  const receiptGuards = actions.map((action) => {
    const source = action.kind === "non_applicable_receipt" ? receiptSource(action.category)! : "strict-all-human-review"
    const result = action.kind === "non_applicable_receipt" ? "nao_aplicavel" : "encontrado"
    const detail = JSON.stringify({
      contract_version: 1,
      queue_sha256: queue.queue_sha256,
      item_id: action.item_id,
      decisao: action.decision.decisao,
      motivo: action.decision.motivo ?? null,
      data_efetiva: action.decision.data_efetiva ?? null,
      escopo: action.decision.escopo ?? null,
      evidence_sha256: action.decision.evidence_sha256 ?? null,
      recebido_em: action.receivedAt,
    })
    const executedAt = action.decision.evidence_checked_at ?? action.receivedAt
    return `(l.fonte=${sql(source)} AND c.slug=${sql(action.slug)} AND l.executado_em=${sql(executedAt)}::timestamptz AND l.resultado=${sql(result)} AND l.volume=${result === "encontrado" ? 1 : 0} AND l.detalhe=${sql(`strict_all_v1:${detail}`)} AND l.url IS NOT DISTINCT FROM ${sql(action.decision.evidence_url ?? null)} AND l.natureza=${sql(action.kind === "unpublish_profile" ? "escrita" : "coleta")})`
  }).join(" OR ")
  const expectedCte = `(VALUES\n${expectedValues}\n) AS e(slug,nome_urna,cargo,uf,partido,unpublished)`
  const exactProfileJoin = "c.slug=e.slug AND c.nome_urna=e.nome_urna AND c.cargo_disputado=e.cargo AND c.estado IS NOT DISTINCT FROM e.uf AND c.partido_sigla IS NOT DISTINCT FROM e.partido"
  const migration = `-- Proposta gerada de decisões humanas strict-all. Não aplicar sem autorização nomeada do lote ${batchId}.\nBEGIN;\nCREATE TEMP TABLE _strict_all_expected(slug text primary key,nome_urna text,cargo text,uf text,partido text,unpublished boolean) ON COMMIT DROP;\nINSERT INTO _strict_all_expected VALUES\n${expectedValues};\nDO $$ DECLARE n integer; BEGIN\n  SELECT count(*) INTO n FROM _strict_all_expected e JOIN public.candidatos c ON ${exactProfileJoin} WHERE c.publicavel=true;\n  IF n<>${profiles.length} THEN RAISE EXCEPTION 'strict-all: identidades/publicação divergiram %/${profiles.length}',n; END IF;\n  IF EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao=${sql(execution)}) THEN RAISE EXCEPTION 'strict-all: execução já existe'; END IF;\nEND $$;\n${unpublish.map((action) => `-- @write tabela=candidatos slug=${action.slug} campos=publicavel\nUPDATE public.candidatos SET publicavel=false WHERE slug=${sql(action.slug)} AND publicavel=true;`).join("\n")}\n-- @write tabela=coleta_log ref=${batchId}:${actions.length} campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza\nINSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)\n${receipts.join("\nUNION ALL\n")};\nDO $$ DECLARE receipts integer; hidden integer; BEGIN\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(execution)};\n  SELECT count(*) INTO hidden FROM public.candidatos WHERE slug IN (${unpublish.map((action) => sql(action.slug)).join(",") || "null"}) AND publicavel=false;\n  IF receipts<>${actions.length} OR hidden<>${unpublish.length} THEN RAISE EXCEPTION 'strict-all pós-condição receipts=% hidden=%',receipts,hidden; END IF;\nEND $$;\nCOMMIT;\n`
  const readback = `\\set ON_ERROR_STOP on\nSET default_transaction_read_only=on;\nDO $$ DECLARE ledger integer; receipts integer; exact_receipts integer; exact_profiles integer; BEGIN\n  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(version)};\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(execution)};\n  SELECT count(*) INTO exact_receipts FROM public.coleta_log l JOIN public.candidatos c ON c.id=l.candidato_id WHERE l.execucao=${sql(execution)} AND (${receiptGuards});\n  SELECT count(*) INTO exact_profiles FROM ${expectedCte} JOIN public.candidatos c ON ${exactProfileJoin} WHERE c.publicavel=(NOT e.unpublished);\n  IF ledger<>1 OR receipts<>${actions.length} OR exact_receipts<>${actions.length} OR exact_profiles<>${profiles.length} THEN RAISE EXCEPTION 'strict-all readback ledger=% receipts=% exact_receipts=% exact_profiles=%',ledger,receipts,exact_receipts,exact_profiles; END IF;\nEND $$;\nSELECT ${actions.length} AS actions,${unpublish.length} AS unpublished;\n`
  const rollback = `\\set ON_ERROR_STOP on\nBEGIN;\nCREATE TEMP TABLE _strict_all_expected(slug text primary key,nome_urna text,cargo text,uf text,partido text,unpublished boolean) ON COMMIT DROP;\nINSERT INTO _strict_all_expected VALUES\n${expectedValues};\nDO $$ DECLARE ledger integer; receipts integer; exact_receipts integer; exact_profiles integer; BEGIN\n  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(version)};\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(execution)};\n  SELECT count(*) INTO exact_receipts FROM public.coleta_log l JOIN public.candidatos c ON c.id=l.candidato_id WHERE l.execucao=${sql(execution)} AND (${receiptGuards});\n  SELECT count(*) INTO exact_profiles FROM _strict_all_expected e JOIN public.candidatos c ON ${exactProfileJoin} WHERE c.publicavel=(NOT e.unpublished);\n  IF ledger<>1 OR receipts<>${actions.length} OR exact_receipts<>${actions.length} OR exact_profiles<>${profiles.length} THEN RAISE EXCEPTION 'strict-all rollback recusado ledger=% receipts=% exact_receipts=% exact_profiles=%',ledger,receipts,exact_receipts,exact_profiles; END IF;\nEND $$;\nUPDATE public.candidatos c SET publicavel=true FROM _strict_all_expected e WHERE ${exactProfileJoin} AND e.unpublished=true AND c.publicavel=false;\nDELETE FROM public.coleta_log WHERE execucao=${sql(execution)};\nDELETE FROM supabase_migrations.schema_migrations WHERE version=${sql(version)};\nCOMMIT;\n`
  const rollbackReadback = `\\set ON_ERROR_STOP on\nSET default_transaction_read_only=on;\nDO $$ DECLARE ledger integer; receipts integer; exact_profiles integer; BEGIN\n  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(version)};\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(execution)};\n  SELECT count(*) INTO exact_profiles FROM ${expectedCte} JOIN public.candidatos c ON ${exactProfileJoin} WHERE c.publicavel=true;\n  IF ledger<>0 OR receipts<>0 OR exact_profiles<>${profiles.length} THEN RAISE EXCEPTION 'strict-all rollback readback ledger=% receipts=% exact_profiles=%',ledger,receipts,exact_profiles; END IF;\nEND $$;\nSELECT ${profiles.length} AS restored_profiles;\n`
  return { migration, readback, rollback, rollbackReadback }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const queuePath = resolve(flag(argv, "queue") ?? "")
  const decisionsPath = resolve(flag(argv, "decisions") ?? "")
  const out = resolve(flag(argv, "out") ?? "")
  const version = safeId(flag(argv, "version") ?? "", "version")
  const batchId = safeId(flag(argv, "batch") ?? "", "batch")
  if (!/^\d{14}$/.test(version) || !queuePath || !decisionsPath || !out) {
    throw new Error("--queue, --decisions, --out, --version=YYYYMMDDHHMMSS e --batch são obrigatórios")
  }
  const queue = JSON.parse(readFileSync(queuePath, "utf8")) as Queue
  const records = parseJsonl(decisionsPath)
  const plan = planStrictAllDecisions(queue, records)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, "apply-plan.json"), `${JSON.stringify({ queue_sha256: queue.queue_sha256, version, batch_id: batchId, ...plan }, null, 2)}\n`)
  if (plan.actions.length > 0) {
    const generated = generateStrictAllSql(queue, plan.actions, version, batchId)
    writeFileSync(join(out, `${version}_${batchId}.proposta.sql`), generated.migration)
    writeFileSync(join(out, `${version}_${batchId}.readback.sql`), generated.readback)
    writeFileSync(join(out, `${version}_${batchId}.rollback.sql`), generated.rollback)
    writeFileSync(join(out, `${version}_${batchId}.rollback.readback.sql`), generated.rollbackReadback)
  }
  console.log(JSON.stringify({ out, actions: plan.actions.length, blocked: plan.blocked.length, pending: plan.pending.length, jobs: plan.jobs.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
