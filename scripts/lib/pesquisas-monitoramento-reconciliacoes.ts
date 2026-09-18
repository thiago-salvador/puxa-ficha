import "server-only"

// Reviewed metadata reconciliations, never a tolerance window.
//
// The registry and the publication must agree. When they do not, the conflict
// blocks the evidence, because picking one side silently would publish a fact
// nobody verified. A row here records that a human read the institute's own
// full report and found which side it supports. Each row is pinned to one
// registration, one field and one exact pair of values, so a later change on
// either side re-opens the conflict instead of inheriting this decision.
//
// Background for the 2026 Datafolha rows: in this batch the registry's
// "Data de término da pesquisa" repeats the "Data de divulgação". The
// institute's own report states a field period that ends before disclosure and
// matches the article. The registry value stays in the evidence as the
// registered date; it is not the last interview day.

export type ReconciliacaoMetadado = {
  /** Registration the receipt is pinned to. */
  registration: string
  /** Conflicting field, spelled exactly as the adapter reports it. */
  field: "início do campo" | "fim do campo" | "amostra"
  /** Value found in the publication, which this receipt confirms. */
  published: string | number
  /** Value found in the registry, which this receipt does not adopt. */
  registered: string | number
  /** Primary document that settles the divergence. */
  document_url: string
  document_sha256: string
  /** Literal sentence read in that document. */
  quote: string
}

const RECONCILIACOES: readonly ReconciliacaoMetadado[] = [
  {
    registration: "CE-04292/2026", field: "fim do campo", published: "2026-08-12", registered: "2026-08-13",
    document_url: "https://media.folha.com.br/datafolha/2026/08/24/ur9ciye6deot2issi0qbqg.pdf",
    document_sha256: "f58edced302bf52df4888cb309289dfc1ac0cdf4769d6a027785846d94d4b277",
    quote: "O campo foi realizado entre os dias 10 a 12 de agosto de 2026",
  },
  {
    registration: "MG-00446/2026", field: "fim do campo", published: "2026-08-20", registered: "2026-08-21",
    document_url: "https://media.folha.uol.com.br/datafolha/2026/08/24/lj60levleuoh62nyztyruw.pdf",
    document_sha256: "7dfdae22c8942bd4ade53b320a5a3bd0a50c86c2b0ce22c57231a9108b48ad85",
    quote: "O campo foi realizado entre os dias 18 a 20 de agosto de 2026",
  },
  {
    registration: "PE-01528/2026", field: "fim do campo", published: "2026-08-20", registered: "2026-08-21",
    document_url: "https://media.folha.uol.com.br/datafolha/2026/08/24/x-pn-l5xim4pc9cbyx3scg.pdf",
    document_sha256: "3c6308f4aaf9d2bbc6349b599c993db7139e987adbf0ea558dc7743aad983c2c",
    quote: "O campo foi realizado entre os dias 18 a 20 de agosto de 2026",
  },
  {
    registration: "SP-01806/2026", field: "fim do campo", published: "2026-08-19", registered: "2026-08-21",
    document_url: "https://media.folha.uol.com.br/datafolha/2026/08/24/x149q-jz18rrpybpyihznw.pdf",
    document_sha256: "e92ceccdb6481206508179841c18cd22a86101c5eac29c6ed90f77c400e9a8f7",
    quote: "O campo foi realizado entre os dias 18 e 19 de agosto de 2026",
  },
  {
    registration: "RJ-02945/2026", field: "fim do campo", published: "2026-08-20", registered: "2026-08-21",
    document_url: "https://media.folha.uol.com.br/datafolha/2026/08/24/jw-8lts35iuo-qsiqkpr0a.pdf",
    document_sha256: "2e16b881be5dd8f110236860b896849c35be813d5fdb760ab15fe310531c870e",
    quote: "O campo foi realizado entre os dias 18 a 20 de agosto de 2026",
  },
  {
    registration: "BR-04496/2026", field: "fim do campo", published: "2026-08-19", registered: "2026-08-20",
    document_url: "https://media.folha.uol.com.br/datafolha/2026/08/24/z449esriv9uiuf2nkkin3zmjzj79u-frfagzqbw2ors.pdf",
    document_sha256: "06fd31e73b68d5559bb92bae110a15ce23a0a449744a4a930194cc543c1c871f",
    quote: "O campo foi realizado entre os dias 18 e 19 de agosto de 2026",
  },
] as const

/**
 * Returns the receipt that settles this exact divergence, or null. A receipt
 * only applies when registration, field and both values match it literally.
 */
export function reconciliacaoMetadadoRevisada(input: {
  registration: string
  field: string
  published: string | number
  registered: string | number
}): ReconciliacaoMetadado | null {
  return RECONCILIACOES.find((entry) => entry.registration === input.registration
    && entry.field === input.field
    && entry.published === input.published
    && entry.registered === input.registered) ?? null
}

export function listarReconciliacoesMetadado(): readonly ReconciliacaoMetadado[] {
  return RECONCILIACOES
}
