#!/usr/bin/env tsx

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

type ResultadoRest = {
  status: number
  count: number | null
  errorCode: string | null
}

type Worktree = {
  path: string
  head: string
  branch: string | null
}

type LedgerDireto =
  | {
      status: "disponivel"
      metodo: "psql_select_read_only"
      quantidadeVersoes: number
      versaoMaisRecente: string | null
      md5VersoesOrdenadas: string
    }
  | {
      status: "indisponivel"
      metodo: "psql_select_read_only"
      motivo: string
    }

type LedgerWorkflow = {
  status: "disponivel" | "indisponivel"
  motivo?: string
  run?: {
    databaseId: number
    headSha: string
    status: string
    conclusion: string
    event: string
    createdAt: string
    updatedAt: string
    url: string
  }
  leitura?: {
    quantidadeVersoes: number | null
    versaoMaisRecente: string | null
    quantidadeArquivosRepoNoRun: number | null
    gateDeclarouConsistencia: boolean
  }
}

for (const arquivo of [".env.local", ".env"]) {
  if (existsSync(arquivo)) process.loadEnvFile(arquivo)
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
const siteUrl =
  process.env.PF_PUBLIC_ORIGIN ??
  (configuredSiteUrl && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(configuredSiteUrl)
    ? configuredSiteUrl
    : "https://puxaficha.com.br")

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios")
}
const requiredSupabaseUrl = supabaseUrl
const requiredServiceKey = serviceKey

async function contar(path: string): Promise<ResultadoRest> {
  const response = await fetch(`${requiredSupabaseUrl}/rest/v1/${path}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      apikey: requiredServiceKey,
      Authorization: `Bearer ${requiredServiceKey}`,
      Prefer: "count=exact",
    },
  })
  const bruto = await response.text()
  const range = response.headers.get("content-range")
  const total = range?.match(/\/(\d+)$/)?.[1]
  let errorCode: string | null = null
  if (!response.ok) {
    try {
      errorCode = String((JSON.parse(bruto) as { code?: unknown }).code ?? "erro_sem_codigo")
    } catch {
      errorCode = "resposta_nao_json"
    }
  }
  return { status: response.status, count: total ? Number(total) : response.ok ? 0 : null, errorCode }
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex")
}

function listarWorktrees(): Worktree[] {
  const blocos = git("worktree", "list", "--porcelain").split("\n\n")
  return blocos.filter(Boolean).map((bloco) => {
    const linhas = bloco.split("\n")
    const valor = (prefixo: string) =>
      linhas.find((linha) => linha.startsWith(`${prefixo} `))?.slice(prefixo.length + 1)
    return {
      path: valor("worktree") ?? "",
      head: valor("HEAD") ?? "",
      branch: valor("branch")?.replace("refs/heads/", "") ?? null,
    }
  })
}

function estadoCheckout(branch: "main" | "rc-lancamento", worktrees: Worktree[]) {
  const checkout = worktrees.find((item) => item.branch === branch)
  const ref = git("rev-parse", branch)
  const ultimoReflog = git(
    "reflog",
    "show",
    "-1",
    "--date=iso-strict",
    "--format=%H%x09%gD%x09%gs%x09%cd",
    branch
  )

  if (!checkout) {
    return {
      anexado: false,
      ref,
      ultimoReflog,
    }
  }

  const status = execFileSync("git", ["-C", checkout.path, "status", "--porcelain=v1", "-z"], {
    encoding: "utf8",
  })
  return {
    anexado: true,
    path: checkout.path,
    head: checkout.head,
    ref,
    dirty: status.length > 0,
    entradasStatus: status.split("\0").filter(Boolean).length,
    statusSha256: sha256(status),
    ultimoReflog,
  }
}

function lerLedgerDireto(): LedgerDireto {
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    return {
      status: "indisponivel",
      metodo: "psql_select_read_only",
      motivo: "SUPABASE_DB_URL ausente no ambiente local; nenhuma conexao direta foi tentada.",
    }
  }

  try {
    const consulta = `
      select json_build_object(
        'quantidadeVersoes', count(*),
        'versaoMaisRecente', max(version),
        'md5VersoesOrdenadas', md5(coalesce(string_agg(version, ',' order by version), ''))
      )::text
      from supabase_migrations.schema_migrations
    `
    const bruto = execFileSync(
      "psql",
      [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", consulta],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGOPTIONS: "-c default_transaction_read_only=on",
        },
      }
    ).trim()
    const resultado = JSON.parse(bruto) as {
      quantidadeVersoes: number
      versaoMaisRecente: string | null
      md5VersoesOrdenadas: string
    }
    return {
      status: "disponivel",
      metodo: "psql_select_read_only",
      ...resultado,
    }
  } catch {
    return {
      status: "indisponivel",
      metodo: "psql_select_read_only",
      motivo:
        "A consulta SELECT com default_transaction_read_only falhou; o erro foi omitido para nao expor a URI do banco.",
    }
  }
}

function repoGitHub(): string | null {
  const remoto = git("remote", "get-url", "origin")
  const match = remoto.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1] ?? null
}

function lerLedgerPeloWorkflow(): LedgerWorkflow {
  const repo = repoGitHub()
  if (!repo) {
    return { status: "indisponivel", motivo: "origin nao aponta para um repositorio GitHub reconhecivel." }
  }

  try {
    const runs = JSON.parse(
      execFileSync(
        "gh",
        [
          "run",
          "list",
          "--repo",
          repo,
          "--workflow",
          "ledger-guard.yml",
          "--branch",
          "main",
          "--limit",
          "1",
          "--json",
          "databaseId,headSha,status,conclusion,event,createdAt,updatedAt,url",
        ],
        { encoding: "utf8" }
      )
    ) as LedgerWorkflow["run"][]
    const run = runs[0]
    if (!run) return { status: "indisponivel", motivo: "Nenhum run do ledger-guard foi encontrado." }

    const log = execFileSync(
      "gh",
      ["run", "view", String(run.databaseId), "--repo", repo, "--log"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
    )
    const contagem = log.match(/versões lidas do ledger:\s*(\d+)/)
    const resumo = log.match(
      /\[ledger\]\s+(\d+) versão\(ões\) no ledger \(topo ([^)]+)\), (\d+) arquivo\(s\) no repo/
    )

    return {
      status: "disponivel",
      run,
      leitura: {
        quantidadeVersoes: contagem ? Number(contagem[1]) : resumo ? Number(resumo[1]) : null,
        versaoMaisRecente: resumo?.[2] ?? null,
        quantidadeArquivosRepoNoRun: resumo ? Number(resumo[3]) : null,
        gateDeclarouConsistencia:
          run.conclusion === "success" &&
          log.includes("OK: ledger e repositório contam a mesma história."),
      },
    }
  } catch {
    return {
      status: "indisponivel",
      motivo: "A leitura publica do run ou do log de ledger-guard pelo GitHub CLI falhou.",
    }
  }
}

async function main(): Promise<void> {
  const worktrees = listarWorktrees()
  const remoto = git(
    "ls-remote",
    "origin",
    "refs/heads/main",
    "refs/heads/rc-lancamento"
  )
    .split("\n")
    .filter(Boolean)
    .map((linha) => linha.split(/\s+/))
    .reduce<Record<string, string>>((acc, [sha, ref]) => {
      acc[ref.replace("refs/heads/", "")] = sha
      return acc
    }, {})

  let deployment: Record<string, unknown>
  try {
    const deploymentResponse = await fetch(new URL("/api/deployment-info", siteUrl), {
      signal: AbortSignal.timeout(30_000),
    })
    deployment = deploymentResponse.ok
      ? ((await deploymentResponse.json()) as Record<string, unknown>)
      : { status: deploymentResponse.status }
  } catch (error) {
    deployment = {
      status: "erro_explicito",
      mensagem: error instanceof Error ? error.message : String(error),
    }
  }

  const alvos = {
    fichasPublicas: await contar("candidatos_publico?select=id&limit=1"),
    processosTotal: await contar("processos?select=id&limit=1"),
    judicial69: await contar(
      "processos?select=id&fonte=like.curadoria-djen-20260805%25&limit=1"
    ),
    judicial66: await contar(
      "processos?select=id&fonte=like.curadoria-djen-20260810%25&limit=1"
    ),
    tse8: await contar(
      "coleta_log?select=executado_em&fonte=eq.destaques-trajetoria&execucao=eq.pf-destaques-tse-8-20260811&limit=1"
    ),
    senadoLinhas: await contar("votacoes_chave?select=id&casa=eq.Senado&limit=1"),
    senadoPares: await contar(
      "votos_candidato?select=id,votacoes_chave!inner(casa)&votacoes_chave.casa=eq.Senado&limit=1"
    ),
    financiamentoContrato: await contar(
      "financiamento_verificacoes_publico?select=candidato_id&limit=1"
    ),
    patrimonioRerun: await contar(
      "patrimonio?select=id&fonte=like.%252026-08-10%25&limit=1"
    ),
  }

  const prova = {
    schemaVersion: 1,
    capturadoEm: new Date().toISOString(),
    natureza: "somente_leitura",
    git: {
      localMain: git("rev-parse", "main"),
      localRcLancamento: git("rev-parse", "rc-lancamento"),
      remoto,
      integracaoHead: git("rev-parse", "HEAD"),
      integracaoDirty: git("status", "--porcelain").length > 0,
      checkouts: {
        principalMain: estadoCheckout("main", worktrees),
        rcLancamento: estadoCheckout("rc-lancamento", worktrees),
      },
    },
    deployment,
    producao: alvos,
    invariantesSemAplicacao: {
      fichasPublicas194: alvos.fichasPublicas.count === 194,
      processosAinda30: alvos.processosTotal.count === 30,
      judicial69Ausente: alvos.judicial69.count === 0,
      judicial66Ausente: alvos.judicial66.count === 0,
      tse8Ausente: alvos.tse8.count === 0,
      senadoAinda13x81: alvos.senadoLinhas.count === 13 && alvos.senadoPares.count === 81,
      financiamentoNaoAplicado:
        alvos.financiamentoContrato.status === 404 &&
        alvos.financiamentoContrato.errorCode === "PGRST205",
      patrimonioRerunAusente: alvos.patrimonioRerun.count === 0,
    },
    ledger: {
      acessoDireto: lerLedgerDireto(),
      evidenciaSubstituta: lerLedgerPeloWorkflow(),
      limiteDaProva:
        "Sem SUPABASE_DB_URL local, o recibo nao consulta o banco diretamente. O workflow substituto registra o SELECT, a contagem e o gate no SHA de main indicado no proprio run.",
    },
    proveniencia: {
      refsRemotas: "git ls-remote origin refs/heads/main refs/heads/rc-lancamento",
      deployment: new URL("/api/deployment-info", siteUrl).toString(),
      contagens: "Supabase PostgREST, GET com Prefer: count=exact e limit=1",
      ledgerDireto: "psql SELECT com PGOPTIONS default_transaction_read_only=on",
      ledgerSubstituto: "GitHub Actions ledger-guard.yml, metadados e log do run mais recente em main",
    },
  }

  const outputArg = process.argv.find((arg) => arg.startsWith("--output="))
  if (outputArg) {
    const output = resolve(outputArg.slice("--output=".length))
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(prova, null, 2)}\n`)
  }
  console.log(JSON.stringify(prova, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
