// Runtime smoke check: valida rotas publicas essenciais e garante que
// as rotas protegidas continuam fail-closed em producao.
//
// Uso: SMOKE_URL=https://puxaficha.com.br npm run smoke:runtime

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000"

interface Check {
  label: string
  path: string
  expectedStatus: number
  contains?: string[]
}

const CHECKS: Check[] = [
  {
    label: "Home",
    path: "/",
    expectedStatus: 200,
    contains: ["Puxa Ficha", "Eleicoes 2026"],
  },
  {
    label: "Explorar",
    path: "/explorar",
    expectedStatus: 200,
    contains: ["O modo explorar existe para descoberta rapida"],
  },
  {
    label: "Comparar",
    path: "/comparar",
    expectedStatus: 200,
    contains: ["Comparador", "Lado a lado"],
  },
  {
    label: "Ficha Lula",
    path: "/candidato/lula",
    expectedStatus: 200,
    contains: ["Lula", "PT"],
  },
  {
    label: "Ficha Tarcisio",
    path: "/candidato/tarcisio",
    expectedStatus: 200,
    contains: ["Tarcisio", "REPUBLICANOS"],
  },
  {
    label: "Sitemap",
    path: "/sitemap.xml",
    expectedStatus: 200,
    contains: ["<urlset", "/candidato/lula"],
  },
  {
    label: "Internaltest bloqueado",
    path: "/internaltest",
    expectedStatus: 404,
  },
  {
    label: "Styleguide bloqueado",
    path: "/styleguide",
    expectedStatus: 404,
  },
  {
    label: "Preview bloqueado",
    path: "/preview/candidato/lula",
    expectedStatus: 404,
  },
]

async function runCheck(check: Check): Promise<{ ok: boolean; msg: string }> {
  const url = `${BASE}${check.path}`
  const start = Date.now()

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "puxa-ficha-runtime-smoke/1.0",
      },
      redirect: "manual",
    })

    const ms = Date.now() - start
    if (response.status !== check.expectedStatus) {
      return {
        ok: false,
        msg: `${check.label}: HTTP ${response.status} (esperado ${check.expectedStatus}) em ${ms}ms`,
      }
    }

    if (!check.contains || check.contains.length === 0) {
      return {
        ok: true,
        msg: `${check.label}: HTTP ${response.status} em ${ms}ms`,
      }
    }

    const body = await response.text()
    const missing = check.contains.filter((token) => !body.includes(token))
    if (missing.length > 0) {
      return {
        ok: false,
        msg: `${check.label}: faltando ${missing.map((item) => `"${item}"`).join(", ")} em ${ms}ms`,
      }
    }

    return {
      ok: true,
      msg: `${check.label}: HTTP ${response.status} com marcadores ok em ${ms}ms`,
    }
  } catch (error) {
    return {
      ok: false,
      msg: `${check.label}: fetch failed (${error instanceof Error ? error.message : String(error)})`,
    }
  }
}

async function main() {
  console.log(`Runtime smoke: ${CHECKS.length} checks at ${BASE}\n`)

  let failures = 0
  for (const check of CHECKS) {
    const result = await runCheck(check)
    console.log(result.ok ? `  PASS  ${result.msg}` : `  FAIL  ${result.msg}`)
    if (!result.ok) failures++
  }

  console.log(`\n${CHECKS.length - failures}/${CHECKS.length} OK`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

export {}
