/**
 * Contrato dos recibos de ausência de programa oficial.
 *
 * O artefato `QA/evidencias/2026-08-30-programas-ausentes/receipt.json` prova
 * que, em 2026-08-30, a DivulgaCandContas não listava arquivo `codTipo = 5`
 * para cinco candidaturas. Esse artefato é evidência datada, reproduzível pelo
 * gerador, e nunca é reescrito: o recibo continua verdadeiro para a data em que
 * foi emitido.
 *
 * O que muda com o tempo é o pacote oficial. Quando um pacote posterior passa a
 * carregar o PDF do candidato, o recibo daquela candidatura fica superado: ele
 * permanece no artefato histórico, mas deixa de ser vinculado ao inventário e
 * deixa de virar estado público `sem_documento_oficial`.
 */

/** Conjunto fechado do receipt set de 2026-08-30. */
export const RECIBOS_AUSENCIA_SQS: ReadonlySet<string> = new Set([
  "60002553922",
  "130002544411",
  "190002543380",
  "190002550196",
  "250002548080",
])

/**
 * Recibos superados por pacote oficial posterior.
 *
 * - `190002543380` (Eduardo Paes, RJ): o pacote `proposta_governo_2026_RJ.zip`
 *   republicado em 2026-09-02 passou a conter `RJ/2026RJ190002543380_01.pdf`.
 * - `60002553922` (Vera Lúcia, CE): o pacote `proposta_governo_2026_CE.zip`
 *   republicado em 2026-09-03 passou a conter `CE/2026CE60002553922_01.pdf`.
 * - `130002544411` (Ben Mendes, MG): o pacote `proposta_governo_2026_MG.zip`
 *   medido em 2026-09-05 passou a conter `MG/2026MG130002544411_01.pdf`.
 */
export const RECIBOS_AUSENCIA_SUPERADOS_SQS: ReadonlySet<string> = new Set([
  "60002553922",
  "130002544411",
  "190002543380",
])

/** Anúncio posterior no DivulgaCand; não comprova conteúdo no pacote histórico. */
export const RECIBOS_AUSENCIA_SUPERADOS_POR_ANUNCIO_SQS: ReadonlySet<string> = new Set()

/** Recibos ainda vinculados ao snapshot histórico do inventário de pacotes. */
export const RECIBOS_AUSENCIA_VIGENTES_SQS: ReadonlySet<string> = new Set(
  [...RECIBOS_AUSENCIA_SQS].filter((sq) => !RECIBOS_AUSENCIA_SUPERADOS_SQS.has(sq)),
)
