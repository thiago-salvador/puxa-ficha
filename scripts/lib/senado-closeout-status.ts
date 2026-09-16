export type CloseoutStatus =
  | "coletado"
  | "vazio_confirmado"
  | "dados_presentes_cobertura_nao_verificada"
  | "reaproveitado"
  | "bloqueado"
  | "pendente"
  | "nao_verificado"
  | "IDausente"

export type CloseoutReceipt = {
  fonte: string
  escopo: string
  alvo: string
  candidato_id: string | null
  executado_em: string | null
  resultado: string
  volume: number | null
  detalhe: string | null
  url: string | null
}

export type CloseoutCandidate = {
  id: string
  verificacao_campos: Record<string, unknown> | null
}

export type CloseoutEvidence = {
  selected: boolean
  candidate: CloseoutCandidate | null
  receipts: readonly CloseoutReceipt[]
  dataPresent?: boolean
  photoReceipt?: unknown
  photoDataPresent?: boolean
  verificationKey?: string
}

export type CloseoutClassification = {
  status: CloseoutStatus
  evidencia: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Proveniência exige estado e pelo menos uma fonte rastreável. */
export function hasProvenance(value: unknown): boolean {
  const verification = record(value)
  if (!verification || !["publicado", "vazio_confirmado"].includes(String(verification.estado))) return false
  const sources = verification.fontes_consultadas
  if (!Array.isArray(sources) || sources.length === 0) return false
  return sources.some((source) => {
    const item = record(source)
    return Boolean(item && (typeof item.url === "string" && item.url.trim() || typeof item.artifact_path === "string" && item.artifact_path.trim()))
  })
}

/** Recibo fotográfico precisa provar arquivo oficial, membro e arquivo local. */
export function hasPhotoReceipt(value: unknown): boolean {
  const receipt = record(value)
  const archive = record(receipt?.archive_receipt)
  return Boolean(
    receipt && typeof receipt.zip_url === "string" && receipt.zip_url.startsWith("http")
      && typeof receipt.member === "string" && receipt.member.trim()
      && archive && typeof archive.url === "string" && archive.url.startsWith("http")
      && archive.http_status === 200 && typeof archive.checked_at === "string" && Number.isFinite(Date.parse(archive.checked_at))
      && typeof archive.artifact_path === "string" && archive.artifact_path.trim()
      && typeof receipt.local_path === "string" && receipt.local_path.trim()
      && typeof receipt.local_sha256 === "string" && /^[a-f0-9]{64}$/i.test(receipt.local_sha256)
      && typeof receipt.local_bytes === "number" && receipt.local_bytes > 0,
  )
}

function hasReceiptProvenance(receipt: CloseoutReceipt): boolean {
  return receipt.escopo === "candidato"
    && typeof receipt.executado_em === "string" && !Number.isNaN(Date.parse(receipt.executado_em))
    && Boolean((receipt.url && /^https?:\/\/[^\s/]+\/\S*/i.test(receipt.url)) || /https?:\/\/[^\s/]+\/\S+|\.artifacts\/\S+|sha256[\s:=]+[a-f0-9]{64}\b/i.test(receipt.detalhe ?? ""))
}

function noConsultation(detail: string | null): boolean {
  return /(?:nenhuma?|nao|não)\s+(?:houve\s+)?consult(?:a|ado|ada|ou)|(?:skipped|pulad[oa]|nao|não)\s+(?:executad[oa]|consultad[oa])/i.test(detail ?? "")
}

function receiptFor(evidence: CloseoutEvidence, fonte: string): CloseoutReceipt | null {
  const candidateId = evidence.candidate?.id
  return evidence.receipts.find((receipt) => receipt.fonte === fonte && receipt.candidato_id === candidateId) ?? null
}

function withoutReceipt(evidence: CloseoutEvidence, dataPresent: boolean): CloseoutClassification {
  if (dataPresent) return { status: "dados_presentes_cobertura_nao_verificada", evidencia: "dados_presentes_sem_recibo" }
  return evidence.selected
    ? { status: "pendente", evidencia: "selecao_sem_recibo" }
    : { status: "nao_verificado", evidencia: "sem_recibo" }
}

/** Classifica uma fonte por prova de tentativa, sem inferir vazio da seleção. */
export function classifySource(evidence: CloseoutEvidence, fonte: string, dataPresent = evidence.dataPresent ?? false): CloseoutClassification {
  if (!evidence.candidate) {
    return evidence.selected
      ? { status: "pendente", evidencia: "candidato_sem_id" }
      : { status: "IDausente", evidencia: "candidato_ausente" }
  }

  const receipt = receiptFor(evidence, fonte)
  if (!receipt) return withoutReceipt(evidence, dataPresent)
  if (receipt.candidato_id == null || noConsultation(receipt.detalhe)) {
    return { status: "pendente", evidencia: `recibo_${receipt.resultado}_sem_consulta` }
  }
  if (!hasReceiptProvenance(receipt)) {
    return dataPresent
      ? { status: "dados_presentes_cobertura_nao_verificada", evidencia: `recibo_${receipt.resultado}_sem_proveniencia` }
      : { status: "pendente", evidencia: `recibo_${receipt.resultado}_sem_proveniencia` }
  }
  if (receipt.resultado === "encontrado" && (receipt.volume ?? 0) > 0) {
    return { status: "coletado", evidencia: `coleta_log_ultima:${fonte}:encontrado` }
  }
  if (receipt.resultado === "vazio_confirmado") {
    return { status: "vazio_confirmado", evidencia: `coleta_log_ultima:${fonte}:vazio_confirmado` }
  }
  if (receipt.resultado === "erro") {
    return { status: "pendente", evidencia: `coleta_log_ultima:${fonte}:erro` }
  }
  if (receipt.resultado === "nao_aplicavel") {
    return { status: "pendente", evidencia: `coleta_log_ultima:${fonte}:nao_aplicavel` }
  }
  return { status: "nao_verificado", evidencia: `coleta_log_ultima:${fonte}:${receipt.resultado}` }
}

export function classifyVerification(evidence: CloseoutEvidence, key: string): CloseoutClassification {
  if (!evidence.candidate) {
    return evidence.selected
      ? { status: "pendente", evidencia: "candidato_sem_id" }
      : { status: "IDausente", evidencia: "candidato_ausente" }
  }
  const verification = record(evidence.candidate.verificacao_campos?.[key])
  if (hasProvenance(verification) && verification?.estado === "publicado") {
    return { status: "coletado", evidencia: `verificacao_campos:${key}` }
  }
  if (hasProvenance(verification) && verification?.estado === "vazio_confirmado") {
    return { status: "vazio_confirmado", evidencia: `verificacao_campos:${key}:vazio_confirmado` }
  }
  return withoutReceipt(evidence, true)
}

export function classifyPhoto(evidence: CloseoutEvidence): CloseoutClassification {
  if (hasPhotoReceipt(evidence.photoReceipt)) return { status: "coletado", evidencia: "recibo_fotografico" }
  if (!evidence.candidate) {
    return evidence.selected
      ? { status: "pendente", evidencia: "candidato_sem_id" }
      : { status: "IDausente", evidencia: "candidato_ausente" }
  }
  return withoutReceipt(evidence, evidence.photoDataPresent ?? false)
}
