import { requiredBaseUrl } from './check-utils.mjs'

const base = requiredBaseUrl('check-redirect.mjs')
for (const query of ['cargo=Governador', 'uf=SP', 'cargo=Governador&uf=SP']) {
  const response = await fetch(new URL(`/imprensa?${query}`, base), { redirect: 'manual' })
  const location = response.headers.get('location')
  const expected = new URL(`/imprensa/mesa?${query}`, base)
  if (response.status !== 308 || !location || new URL(location, base).href !== expected.href) {
    throw new Error(`REDIRECT_FAIL ${query} status=${response.status} location=${location}`)
  }
}
console.log('REDIRECT_OK')
