import { requiredBaseUrl, requireOk } from './check-utils.mjs'

const base = requiredBaseUrl('check-noindex.mjs')
const paths = ['/imprensa/mesa', '/api/imprensa/export?format=csv', '/api/imprensa/export?format=json', '/api/imprensa/export/sites?format=json', '/api/imprensa/export/processos?format=json']
for (const path of paths) {
  const response = await fetch(new URL(path, base))
  requireOk(response, path)
  const body = await response.text()
  const header = /noindex/iu.test(response.headers.get('x-robots-tag') ?? '')
  const meta = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/iu.test(body)
  if (!header && !meta) throw new Error(`NOINDEX_FAIL ${path}`)
}
console.log('NOINDEX_OK 5/5')
