import { requiredBaseUrl, requireOk } from './check-utils.mjs'

const base = requiredBaseUrl('check-sala.mjs')
const response = await fetch(new URL('/imprensa', base))
requireOk(response, 'Sala')
const html = await response.text()
const ids = ['o-que-e', 'numeros', 'confianca', 'pautas', 'ferramentas', 'kit', 'contato', 'perguntas', 'atualizacoes']
const positions = ids.map((id) => html.search(new RegExp(`<section\\b[^>]*\\bid=["']${id}["']`, 'iu')))
const missing = ids.filter((_, index) => positions[index] < 0)
const ordered = positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]))
const noindex = /noindex/iu.test(response.headers.get('x-robots-tag') ?? '') || /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/iu.test(html)
if (missing.length || !ordered || noindex) throw new Error(`SALA_FAIL missing=${missing.join(',')} ordered=${ordered} noindex=${noindex}`)
console.log('SALA_OK 9/9')
