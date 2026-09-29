import { execFileSync } from 'node:child_process'
import { requiredBaseUrl } from './check-utils.mjs'

const base = requiredBaseUrl('check-aviso.mjs')
const notice = 'Confira os dados na fonte original antes de publicar.'
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()
const nameParticles = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])
const requireNotice = (text, label) => {
  if (!normalize(text).includes(normalize(notice))) throw new Error(`AVISO_FAIL ${label}: aviso ausente`)
}
const fetchOk = async (path) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${path} respondeu ${response.status}`)
  return response
}
const parseCsv = (body) => {
  const text = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (quoted) throw new Error('AVISO_FAIL CSV: aspas sem fechamento')
  if (row.length || cell) { row.push(cell); rows.push(row) }
  return rows
}

// Superfícies 1 a 4: páginas com conteúdo HTML visível.
for (const [label, path] of [
  ['Sala', '/imprensa'],
  ['Mesa', '/imprensa/mesa'],
  ['Atualizações', '/imprensa/atualizacoes'],
  ['Frescor', '/imprensa/frescor'],
]) {
  const response = await fetchOk(path)
  requireNotice(await response.text(), label)
}

// Superfície 5: OCR do PNG gerado, sem aceitar headers como prova visual.
const mainResponse = await fetchOk('/api/imprensa/export?format=json')
const main = await mainResponse.json()
if (!Array.isArray(main.rows) || !main.rows[0]?.slug || !main.rows[0]?.nome) throw new Error('AVISO_FAIL: export sem candidato ou nome para conferir card e embed')
const slug = encodeURIComponent(main.rows[0].slug)
const cardResponse = await fetchOk(`/api/card/${slug}?format=feed&v=2`)
const card = Buffer.from(await cardResponse.arrayBuffer())
let cardText
try {
  cardText = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '11'], { input: card, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
} catch {
  throw new Error('AVISO_FAIL card: OCR indisponível')
}
requireNotice(cardText, 'card PNG OCR')
const expectedNameTokens = normalize(main.rows[0].nome).split(' ').filter((token) => token.length >= 3 && !nameParticles.has(token))
const recognizedNameTokens = new Set(normalize(cardText).split(' '))
const matchedNameTokens = expectedNameTokens.filter((token) => recognizedNameTokens.has(token))
const requiredMatches = Math.min(2, expectedNameTokens.length)
if (requiredMatches === 0 || matchedNameTokens.length < requiredMatches) {
  throw new Error(`AVISO_FAIL card PNG OCR: nome não reconhecido (${matchedNameTokens.length}/${requiredMatches} tokens)`)
}

// Superfície 6: conteúdo HTML do embed.
const embedResponse = await fetchOk(`/embed/${slug}`)
requireNotice(await embedResponse.text(), 'embed')

// Superfícies 7 e 8: JSON e CSV em todas as três rotas de export.
const exportPaths = ['/api/imprensa/export', '/api/imprensa/export/sites', '/api/imprensa/export/processos']
for (const path of exportPaths) {
  const response = await fetchOk(`${path}?format=json&cargo=Governador&uf=SP`)
  const data = await response.json()
  if (data.aviso !== notice) throw new Error(`AVISO_FAIL JSON ${path}`)
}
for (const path of exportPaths) {
  const response = await fetchOk(`${path}?format=csv&cargo=Governador&uf=SP`)
  const headerNotice = response.headers.get('x-aviso-dados')
  if (!headerNotice || decodeURIComponent(headerNotice) !== notice) throw new Error(`AVISO_FAIL CSV ${path}: header HTTP`)
  const body = await response.text()
  const [header, ...rows] = parseCsv(body)
  if (!header || header.at(-1) !== 'aviso' || header[0] === `# ${notice}`) throw new Error(`AVISO_FAIL CSV ${path}: cabeçalho`)
  for (const row of rows) {
    if (row.length !== header.length || row.at(-1) !== notice) throw new Error(`AVISO_FAIL CSV ${path}: linha sem aviso`)
  }
}

console.log('AVISO_OK 8/8')
