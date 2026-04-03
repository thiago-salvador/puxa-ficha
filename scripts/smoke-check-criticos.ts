// Smoke check: verifica que paginas de candidatos criticos exibem o partido correto no hero.
// Busca a sigla no eyebrow span (class text-eyebrow) com pattern:
//   text-eyebrow...>{SIGLA}<!-- --> · <!-- -->{cargo}
// Aceita unicode middot (U+00B7) e React comment markers entre tokens.
//
// Uso: SMOKE_URL=http://localhost:3100 npx tsx scripts/smoke-check-criticos.ts

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000"

interface Check {
  slug: string
  expectedPartido: string
  label: string
}

// Only curated candidates (publicavel = true) are tested.
// Mirrored candidates are not visible on the site.
const CHECKS: Check[] = [
  // Presidenciaveis (all curated)
  { slug: "lula", expectedPartido: "PT", label: "Lula" },
  { slug: "flavio-bolsonaro", expectedPartido: "PL", label: "Flavio Bolsonaro" },
  { slug: "tarcisio", expectedPartido: "REPUBLICANOS", label: "Tarcisio" },
  { slug: "ciro-gomes", expectedPartido: "PSDB", label: "Ciro Gomes" },
  { slug: "ronaldo-caiado", expectedPartido: "PSD", label: "Caiado" },
  { slug: "ratinho-junior", expectedPartido: "PSD", label: "Ratinho Jr" },
  { slug: "aldo-rebelo", expectedPartido: "DC", label: "Aldo Rebelo" },
  // Governadores prioritarios (curated)
  { slug: "sergio-moro-gov-pr", expectedPartido: "PL", label: "Moro (PR)" },
  { slug: "geraldo-alckmin", expectedPartido: "PSB", label: "Alckmin (SP)" },
  { slug: "jorginho-mello", expectedPartido: "PL", label: "Jorginho Mello (SC)" },
  { slug: "nikolas-ferreira", expectedPartido: "PL", label: "Nikolas (MG)" },
  { slug: "eduardo-paes", expectedPartido: "PSD", label: "Paes (RJ)" },
  { slug: "jeronimo", expectedPartido: "PT", label: "Jeronimo (BA)" },
  { slug: "haddad-gov-sp", expectedPartido: "PT", label: "Haddad (SP)" },
  { slug: "ricardo-nunes", expectedPartido: "MDB", label: "Nunes (SP)" },
]

// The hero eyebrow renders: {SIGLA} · {cargo}
// In Next.js SSR HTML this appears as:
//   text-eyebrow)]">PT<!-- --> · <!-- -->Presidente</span>
// We match the eyebrow span pattern with React comment markers between tokens.
function buildEyebrowPattern(sigla: string): RegExp {
  // Match: ">SIGLA" followed by optional React comments and middot,
  // inside the eyebrow span (text-eyebrow class).
  // The > before SIGLA ensures we're matching rendered content, not attributes.
  const escaped = sigla.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `text-eyebrow[^>]*>` +       // eyebrow span opening
    `${escaped}` +                 // partido sigla
    `(?:\\s|<!\\-\\-.*?\\-\\->)*` + // whitespace or React comments
    `[\\xB7\u00B7]`,              // middot (unicode)
    "i"
  )
}

async function check(c: Check): Promise<{ ok: boolean; msg: string }> {
  try {
    const res = await fetch(`${BASE}/candidato/${c.slug}`)
    if (!res.ok) return { ok: false, msg: `${c.label}: HTTP ${res.status}` }
    const html = await res.text()

    const pattern = buildEyebrowPattern(c.expectedPartido)
    if (pattern.test(html)) {
      return { ok: true, msg: `${c.label}: ${c.expectedPartido} in eyebrow` }
    }
    return { ok: false, msg: `${c.label}: "${c.expectedPartido}" NOT in eyebrow span` }
  } catch (e) {
    return { ok: false, msg: `${c.label}: fetch failed (${e})` }
  }
}

async function main() {
  console.log(`Smoke check: ${CHECKS.length} pages at ${BASE}\n`)
  const results = await Promise.all(CHECKS.map(check))
  let failures = 0
  for (const r of results) {
    console.log(r.ok ? `  PASS  ${r.msg}` : `  FAIL  ${r.msg}`)
    if (!r.ok) failures++
  }
  console.log(`\n${results.length - failures}/${results.length} OK`)
  if (failures > 0) process.exit(1)
}

main()

export {}
