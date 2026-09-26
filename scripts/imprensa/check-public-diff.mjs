import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const base = process.argv[2]
if (!base) throw new Error('Uso: node scripts/imprensa/check-public-diff.mjs <base-ref>')
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
git(['rev-parse', '--verify', `${base}^{commit}`])
const changed = new Set(git(['diff', '--name-only', base, '--']).split('\n').filter(Boolean))
const diff = git(['diff', '--no-ext-diff', '--unified=0', base, '--'])
const addedLines = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1))
const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
for (const file of untracked) {
  changed.add(file)
  try { addedLines.push(...readFileSync(file, 'utf8').split('\n')) } catch { /* arquivos binários não contêm texto pesquisável */ }
}
const privateDir = ['evidencias', 'privadas'].join('-')
const strategy = ['campanha', 'de imprensa'].join(' ')
const sensitivePatterns = [
  new RegExp(privateDir, 'iu'),
  new RegExp(strategy, 'iu'),
  /follow[ -]?up/iu,
  /lista de (?:jornalistas|contatos)/iu,
  new RegExp(['gabinetes', 'e políticos'].join(' '), 'iu'),
]
const personalEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu
const problems = []
for (const file of changed) {
  if (file.toLowerCase().includes(privateDir.toLowerCase())) problems.push(`caminho privado: ${file}`)
}
for (const line of addedLines) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(line)) problems.push(`conteúdo sensível: ${line.slice(0, 180)}`)
  }
  for (const match of line.matchAll(personalEmail)) {
    if (match[0].toLowerCase() !== 'contato@puxaficha.com.br') problems.push(`e-mail não público: ${match[0]}`)
  }
}
if (problems.length) throw new Error(`PUBLIC_DIFF_FAIL\n${[...new Set(problems)].join('\n')}`)
console.log('PUBLIC_DIFF_OK')
