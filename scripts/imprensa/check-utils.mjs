export function requiredBaseUrl(scriptName) {
  const base = process.argv[2]
  if (!base) throw new Error(`Uso: node scripts/imprensa/${scriptName} <base-url>`)
  try { return new URL(base) } catch { throw new Error(`URL base inválida: ${base}`) }
}

export function requireOk(response, label) {
  if (!response.ok) throw new Error(`${label} respondeu ${response.status}`)
}

export function decodeCsvFirstComment(body) {
  const withoutBom = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body
  return withoutBom.split(/\r?\n/u, 1)[0]
}

export async function getJson(base, path, label = path) {
  const response = await fetch(new URL(path, base))
  requireOk(response, label)
  return { response, data: await response.json() }
}
