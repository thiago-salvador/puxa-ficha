export interface TSEPatrimonioBemInput {
  slug: string
  sourceKey: string
  ordem: string
  tipo: string
  descricao: string
  valor: number
}

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function buildAssetIdentityKey(item: TSEPatrimonioBemInput): string {
  const ordem = normalizeKeyPart(item.ordem)
  if (ordem) return `${normalizeKeyPart(item.slug)}|ordem:${ordem}`

  return [
    normalizeKeyPart(item.slug),
    normalizeKeyPart(item.tipo),
    normalizeKeyPart(item.descricao),
    item.valor.toFixed(2),
  ].join("|")
}

/**
 * Os CSVs do TSE podem repetir o mesmo bem em arquivos nacional (`_BR`) e estadual (`_UF`).
 * Mantemos todas as ocorrências do primeiro arquivo em que o bem aparece, mas descartamos
 * repetições idênticas vindas de outro arquivo para evitar soma em dobro.
 */
export function dedupeTsePatrimonioRows<T extends TSEPatrimonioBemInput>(rows: T[]): T[] {
  const firstSourceByAsset = new Map<string, string>()
  const output: T[] = []

  for (const row of rows) {
    const assetKey = buildAssetIdentityKey(row)
    const firstSource = firstSourceByAsset.get(assetKey)

    if (firstSource && firstSource !== row.sourceKey) continue
    if (!firstSource) firstSourceByAsset.set(assetKey, row.sourceKey)

    output.push(row)
  }

  return output
}
