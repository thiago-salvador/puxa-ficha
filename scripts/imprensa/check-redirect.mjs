import { requiredBaseUrl } from './check-utils.mjs'

const base = requiredBaseUrl('check-redirect.mjs')
const paths = [
  '/imprensa?cargo=&uf=',
  '/imprensa?uf=SP',
  '/imprensa?cargo=Governador',
  '/imprensa?cargo=Governador&uf=SP',
  '/imprensa?cargo=Governador&utm_source=teste',
  '/imprensa/?cargo=&uf=',
]

for (const path of paths) {
  const expected = new URL(path.replace(/^\/imprensa\/?/, '/imprensa/mesa'), base)
  let current = new URL(path, base)
  let matched = false
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const location = response.headers.get('location')
    if (response.status !== 308 || !location) {
      throw new Error(`REDIRECT_FAIL ${path} hop=${hop} status=${response.status} location=${location}`)
    }
    const next = new URL(location, current)
    if (next.href === current.href) throw new Error(`REDIRECT_LOOP ${path}`)
    if (next.href === expected.href) {
      matched = true
      break
    }
    current = next
  }
  if (!matched) throw new Error(`REDIRECT_DESTINATION_FAIL ${path} expected=${expected.href}`)
}
console.log('REDIRECT_OK')
