import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { afterEach, describe, it } from "node:test"
import { parse } from "yaml"

import { CAMARA_SONDA_URL, resultadoSemAlcance, sondarAlcanceCamara } from "../scripts/lib/camara-alcance"
import { resolverExecucao } from "../scripts/lib/coleta-log"
import { comCausaDeRede, fetchJSON, type FetchRelogio } from "../scripts/lib/helpers"

/**
 * Bloqueio de 26/09/2026: a API da Câmara parou de aceitar conexão dos runners
 * hospedados do GitHub (0 de 96 conexões TCP, UND_ERR_CONNECT_TIMEOUT). Estes
 * testes cobrem o pré-voo que encerra a fonte em ~1 min, o código de rede que
 * passa a aparecer na mensagem, o contrato do workflow (Câmara só por disparo
 * manual, service role só na main, nenhum runner auto-hospedado) e o agente
 * local de scripts/camara-local/.
 */

const fetchOriginal = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function relogioFalso(): FetchRelogio & { esperas: number[] } {
  let agora = 0
  const esperas: number[] = []
  return {
    esperas,
    now: () => agora,
    sleep: async (ms: number) => {
      esperas.push(ms)
      agora += ms
    },
    random: () => 0.5,
  }
}

function erroDeConexao(): Error {
  const causa = Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" })
  return new TypeError("fetch failed", { cause: causa })
}

describe("comCausaDeRede", () => {
  it("acrescenta o código do undici e mantém o prefixo `fetch failed`", () => {
    const erro = comCausaDeRede(erroDeConexao())
    assert.equal(erro.message, "fetch failed (UND_ERR_CONNECT_TIMEOUT)")
    assert.equal((erro.cause as Error).message, "fetch failed")
  })

  it("devolve o próprio erro quando não há código ou ele já está na mensagem", () => {
    const semCodigo = new TypeError("fetch failed")
    assert.equal(comCausaDeRede(semCodigo), semCodigo)
    const jaTem = Object.assign(new Error("x (ECONNRESET)"), { cause: { code: "ECONNRESET" } })
    assert.equal(comCausaDeRede(jaTem), jaTem)
  })

  it("converte valor que não é Error", () => {
    assert.equal(comCausaDeRede("quebrou").message, "quebrou")
  })

  it("chega à mensagem final de fetchJSON depois das tentativas", async () => {
    globalThis.fetch = async () => {
      throw erroDeConexao()
    }
    await assert.rejects(
      fetchJSON("https://exemplo.invalid/x", undefined, 2, 1_000, { relogio: relogioFalso(), budgetMs: 60_000 }),
      /^Error: fetch failed \(UND_ERR_CONNECT_TIMEOUT\)$/,
    )
  })
})

describe("sondarAlcanceCamara", () => {
  it("devolve ok quando a API responde 200, com uma única chamada ao endpoint mínimo", async () => {
    const chamadas: string[] = []
    globalThis.fetch = async (input) => {
      chamadas.push(String(input))
      return new Response(JSON.stringify({ dados: [] }), { status: 200 })
    }
    assert.deepEqual(await sondarAlcanceCamara({ relogio: relogioFalso() }), { ok: true })
    assert.deepEqual(chamadas, [CAMARA_SONDA_URL])
  })

  it("desiste em 3 tentativas com o código de rede no motivo", async () => {
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      throw erroDeConexao()
    }
    const relogio = relogioFalso()
    const alcance = await sondarAlcanceCamara({ relogio })
    assert.equal(chamadas, 3)
    assert.deepEqual(relogio.esperas, [2_000, 6_000])
    assert.deepEqual(alcance, { ok: false, motivo: "fetch failed (UND_ERR_CONNECT_TIMEOUT)" })
  })

  it("trata HTTP 4xx determinístico como inalcançável sem repetir", async () => {
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      return new Response("proibido", { status: 403 })
    }
    const alcance = await sondarAlcanceCamara({ relogio: relogioFalso() })
    assert.equal(chamadas, 1)
    assert.equal(alcance.ok, false)
    assert.match(!alcance.ok ? alcance.motivo : "", /^HTTP 403: /)
  })
})

describe("resultadoSemAlcance", () => {
  it("gera o mesmo formato de uma ficha que falhou, sem escrita", () => {
    const r = resultadoSemAlcance("lula", "fetch failed (UND_ERR_CONNECT_TIMEOUT)")
    assert.equal(r.source, "camara")
    assert.equal(r.candidato, "lula")
    assert.equal(r.rows_upserted, 0)
    assert.deepEqual(r.tables_updated, [])
    assert.equal(r.skipped, undefined)
    assert.equal(r.errors.length, 1)
    assert.match(r.errors[0], /inalcancavel deste runner \(fetch failed \(UND_ERR_CONNECT_TIMEOUT\)\)/)
  })
})

describe("resolverExecucao", () => {
  it("GITHUB_RUN_ID vence tudo", () => {
    assert.equal(resolverExecucao({ githubRunId: "42", execucaoAgendada: "local:mac:20260930T060000Z" }, 7), "gh:42")
  })

  it("aceita a execução do agente local com identificador aleatório", () => {
    assert.equal(resolverExecucao({ execucaoAgendada: "local:ab12cd34ef56ab78:20260930T060000Z" }, 7), "local:ab12cd34ef56ab78:20260930T060000Z")
    assert.throws(() => resolverExecucao({ execucaoAgendada: "local:mac-estudio:20260930T060000Z" }, 7), /PF_COLETA_EXECUCAO fora do formato/)
  })

  it("recusa formato inventado antes de qualquer escrita", () => {
    for (const valor of ["gh:1", "local:Mac:20260930T060000Z", "local:mac:2026-09-30", "local:mac:20260930T060000Z;x"]) {
      assert.throws(() => resolverExecucao({ execucaoAgendada: valor }, 7), /PF_COLETA_EXECUCAO fora do formato/)
    }
  })

  it("sem nada, mantém local:<pid>", () => {
    assert.equal(resolverExecucao({}, 7), "local:7")
    assert.equal(resolverExecucao({ execucaoAgendada: "" }, 8), "local:8")
  })
})

type Step = { run?: string; name?: string; env?: Record<string, string> }
type Job = {
  "runs-on"?: unknown
  needs?: string[]
  if?: string
  steps?: Step[]
}

const textoWorkflow = readFileSync(".github/workflows/ingest.yml", "utf8")
const workflow = parse(textoWorkflow) as { on: Record<string, unknown>; jobs: Record<string, Job> }

describe("ingest.yml", () => {
  const camara = workflow.jobs["ingest-camara"]
  const rest = workflow.jobs["ingest-rest"]

  it("nunca roda em pull_request", () => {
    assert.deepEqual(Object.keys(workflow.on).sort(), ["schedule", "workflow_dispatch"])
  })

  it("todo job com segredo de produção exige a main", () => {
    const comServiceRole = Object.entries(workflow.jobs).filter(([, job]) =>
      /secrets\.(SUPABASE_SERVICE_ROLE_KEY|PF_REVALIDATE_SECRET|PF_DOADOR_CPF_HASH_SALT)/.test(JSON.stringify(job)),
    )
    assert.deepEqual(comServiceRole.map(([nome]) => nome).sort(), [
      "ingest-camara",
      "ingest-news",
      "ingest-rest",
      "ingest-tse",
      "revalidate",
    ])
    for (const [nome, job] of comServiceRole) {
      assert.match(job.if ?? "", /github\.ref == 'refs\/heads\/main'/, nome)
    }
  })

  it("o cabeçalho diz o que o guard de ref protege e o que não protege", () => {
    assert.doesNotMatch(textoWorkflow, /Tanto workflow_dispatch quanto schedule executam somente o código da main/)
    assert.match(textoWorkflow, /workflow_dispatch aceita qualquer\n# branch/)
    assert.match(textoWorkflow, /O que NÃO protege: uma\n# branch que edite este arquivo/)
  })

  it("Câmara: runner hospedado, só disparo manual, depois do REST", () => {
    assert.equal(camara["runs-on"], "ubuntu-latest")
    assert.deepEqual(camara.needs, ["ingest-rest"])
    assert.match(camara.if ?? "", /!cancelled\(\)/)
    assert.match(camara.if ?? "", /github\.event_name == 'workflow_dispatch'/)
    assert.match(camara.if ?? "", /contains\(github\.event\.inputs\.sources, 'camara'\)/)
    assert.doesNotMatch(camara.if ?? "", /schedule/)
    const run = camara.steps?.find((s) => s.name === "Ingestão Câmara")?.run ?? ""
    assert.match(run, /npx tsx scripts\/ingest-all\.ts camara \$FLAGS --apply/)
  })

  it("REST: schedule cai em senado e camara só é validada", () => {
    const passo = rest.steps?.find((s) => s.name === "Ingestão REST")
    assert.equal(passo?.env?.RAW_SOURCES, "${{ github.event.inputs.sources || 'senado' }}")
    assert.match(passo?.run ?? "", /^\s*camara\) ;;$/m)
    assert.doesNotMatch(passo?.run ?? "", /skip-camara-validated/)
    assert.match(passo?.run ?? "", /npx tsx scripts\/ingest-all\.ts \$SAFE --apply/)
  })

  it("revalidação espera a Câmara", () => {
    assert.ok(workflow.jobs.revalidate.needs?.includes("ingest-camara"))
  })

  it("nenhum workflow usa runner auto-hospedado", () => {
    const dir = ".github/workflows"
    const ofensores = readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .filter((f) => /self-hosted|PF_INGEST_CAMARA_RUNNER/.test(readFileSync(`${dir}/${f}`, "utf8")))
    assert.deepEqual(ofensores, [])
  })
})

describe("agente local da Câmara", () => {
  const script = readFileSync("scripts/camara-local/ingest-camara-local.sh", "utf8")
  const instalador = readFileSync("scripts/camara-local/instalar-agente.sh", "utf8")
  const plist = readFileSync("scripts/camara-local/br.com.puxaficha.ingest-camara.plist.template", "utf8")

  it("roda a main num worktree destacado, sem scripts de instalação, com Node 24", () => {
    assert.match(script, /repo_url="https:\/\/github\.com\/thiago-salvador\/puxa-ficha\.git"/)
    assert.match(script, /fetch --quiet --no-tags "\$repo_url" "\+refs\/heads\/main:refs\/remotes\/origin\/main"/)
    assert.match(script, /git ls-remote "\$repo_url" refs\/heads\/main/)
    assert.match(script, /worktree add --quiet --detach "\$base\/repo" "\$sha"/)
    assert.match(script, /npm ci --ignore-scripts/)
    assert.match(script, /v24\.\*/)
    assert.match(script, /tsx="\.\/node_modules\/\.bin\/tsx"/)
    assert.match(script, /"\$tsx" scripts\/ingest-all\.ts camara --skip-camara-validated --apply/)
    assert.match(script, /"\$tsx" scripts\/ingest-all\.ts camara-cotas ceaps-senado partidos-parlamentares --apply/)
    assert.match(script, /scripts\/audit\/exportar-perfis-publicos\.ts/)
    assert.match(script, /scripts\/audit\/fetch-parliamentary-family-sources-local\.ts/)
    assert.match(script, /scripts\/audit\/collect-parliamentary-family-receipts-local\.ts/)
    assert.match(script, /scripts\/audit\/apply-coverage-receipts\.ts/)
    assert.match(script, /--incluir-abertos --recibos-atuais/)
    assert.doesNotMatch(script, /\bnpx\b(?! --no-install)/)
    assert.match(script, /PF_COLETA_EXECUCAO="\$execucao"/)
    assert.match(script, /run_id="\$\(uuidgen/)
    assert.doesNotMatch(script, /scutil --get LocalHostName|hostname -s/)
    assert.match(script, /trap limpar EXIT/)
  })

  it("avisa quando a main foi reescrita e confere a si mesmo contra a main", () => {
    assert.match(script, /merge-base --is-ancestor "\$sha_anterior" "\$sha"/)
    assert.match(script, /force-push/)
    assert.match(script, /cmp -s "\$0" <\(git -C "\$repo" show "\$sha:\$caminho_launcher"\)/)
    const iCmp = script.indexOf('cmp -s "$0"')
    // Posições dos comandos, não do cabeçalho que os descreve.
    assert.ok(iCmp > script.indexOf('remoto="$(git ls-remote'), "autoconferência depois de fixar o SHA")
    assert.ok(iCmp < script.indexOf("\nnpm ci --ignore-scripts"), "autoconferência antes de instalar e rodar")
  })

  it("trava com pid e diretório de log sempre 700", () => {
    assert.match(script, /echo "\$\$" >"\$trava\/pid"/)
    assert.match(script, /kill -0 "\$pid_anterior"/)
    assert.match(script, /chmod 700 "\$dir_log" "\$dir_estado"/)
  })

  it("exige credenciais em arquivo 600 fora do repo, com allowlist de chaves", () => {
    assert.match(script, /credenciais="\$HOME\/\.config\/puxa-ficha\/ingest-camara\.env"/)
    assert.match(script, /stat -f %Lp "\$credenciais"\)" = "600"/)
    assert.match(script, /chave não permitida no arquivo de credenciais/)
    assert.doesNotMatch(script, /^\s*(source|\.) .*credenciais/m)
  })

  it("revalida com as mesmas tags do workflow", () => {
    const doScript = JSON.parse(/tags_json='([^']+)'/.exec(script)?.[1] ?? "null")
    const doWorkflow = JSON.parse(/TAGS_JSON: >-\n\s+(\[.*\])/.exec(textoWorkflow)?.[1] ?? "null")
    assert.ok(Array.isArray(doWorkflow) && doWorkflow.length > 0)
    assert.deepEqual(doScript, doWorkflow)
  })

  it("instalador só instala o que está na main publicada", () => {
    assert.match(instalador, /git ls-remote "\$repo_url" refs\/heads\/main/)
    assert.match(instalador, /\[ "\$head_origem" = "\$sha_main" \] \|\| falhar/)
    assert.match(instalador, /status --porcelain --untracked-files=all -- \./)
    assert.match(instalador, /cmp -s "\$origem\/\$arquivo" <\(git -C "\$repo" show "\$sha_main:scripts\/camara-local\/\$arquivo"\)/)
    assert.ok(instalador.indexOf("cmp -s") < instalador.indexOf("install -m 700"), "confere antes de copiar")
  })

  it("instalador só copia: recusa root e sudo, não carrega o agente", () => {
    assert.match(instalador, /\[ "\$\(id -u\)" -ne 0 \] \|\| falhar/)
    // O texto de instrução impresso no fim (heredoc) cita launchctl; o que
    // importa é que nenhuma linha executável chame launchctl ou sudo.
    const executavel = instalador.replace(/cat <<EOF[\s\S]*?\nEOF\n/g, "")
    assert.ok(executavel.length < instalador.length, "heredoc de instruções não encontrado")
    assert.doesNotMatch(executavel, /^\s*sudo\b/m)
    assert.doesNotMatch(executavel, /^\s*launchctl\b/m)
    assert.match(script, /\[ "\$\(id -u\)" -ne 0 \] \|\| falhar/)
  })

  it("plist agenda uma vez por semana, sem rodar ao carregar", () => {
    assert.match(plist, /<string>br\.com\.puxaficha\.ingest-camara<\/string>/)
    assert.match(plist, /<key>Weekday<\/key>\s*<integer>__WEEKDAY__<\/integer>/)
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<false\/>/)
    assert.match(instalador, /"2026-09-30 06:00:00"/)
  })
})
