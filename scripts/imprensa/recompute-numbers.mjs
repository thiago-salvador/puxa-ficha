const baseArg = process.argv[2]
if (!baseArg) throw new Error('Uso: node scripts/imprensa/recompute-numbers.mjs <base-url>')
const base = new URL(baseArg)
const response = await fetch(new URL('/api/imprensa/export?format=json', base), { signal: AbortSignal.timeout(15_000) })
if (!response.ok) throw new Error(`Export respondeu ${response.status}`)
const data = await response.json()
if (typeof data.generatedAt !== 'string' || !Array.isArray(data.rows)) throw new Error('Export não cumpre o contrato atual')
const count = (rows, get) => {
  const values = rows.map(get).map((value) => value ?? 'indisponivel')
  return Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]))
}
const ufs = [...new Set(data.rows.map((row) => row.uf).filter(Boolean))].sort()
const result = {
  generated_at: data.generatedAt,
  candidatos: data.rows.length,
  por_cargo: count(data.rows, (row) => row.cargo),
  ufs_total: ufs.length,
  ufs,
  processos: count(data.rows, (row) => row.processos?.estado),
  sites: count(data.rows, (row) => row.sites?.estado),
  chapa: count(data.rows, (row) => row.chapa?.estado),
}
console.log(JSON.stringify(result, null, 2))
