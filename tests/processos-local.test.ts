import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

const launcher = "scripts/processos-local/coletar-local.sh"
const installer = "scripts/processos-local/instalar-agente.sh"
const template = "scripts/processos-local/br.com.puxaficha.processos-local.plist.template"
const content = readFileSync(launcher, "utf8")
const installContent = readFileSync(installer, "utf8")

/** Corpo do heredoc `<<'JS'` que começa na primeira linha que casa com `abertura`. */
function heredocJs(abertura: RegExp): string {
  const linhas = content.split("\n")
  const inicio = linhas.findIndex((linha) => abertura.test(linha))
  assert.ok(inicio >= 0, `heredoc ausente: ${abertura}`)
  const fim = linhas.indexOf("JS", inicio + 1)
  assert.ok(fim > inicio, "heredoc sem fim")
  return linhas.slice(inicio + 1, fim).join("\n")
}

function posicao(trecho: string): number {
  const i = content.indexOf(trecho)
  assert.ok(i >= 0, `trecho ausente no launcher: ${trecho}`)
  return i
}

describe("agente local da coleta judicial", () => {
  it("mantém scripts Bash válidos e executa só a main fixada", () => {
    for (const script of [launcher, installer]) {
      const result = spawnSync("bash", ["-n", script], { encoding: "utf8" })
      assert.equal(result.status, 0, `${script}: ${result.stderr}`)
    }
    assert.match(content, /git -C "\$repo" fetch --quiet --no-tags "\$repo_url"/)
    assert.match(content, /git ls-remote "\$repo_url" refs\/heads\/main/)
    assert.match(content, /cmp -s "\$0" <\(git -C "\$repo" show "\$sha:\$launcher"\)/)
    assert.match(content, /npm ci --ignore-scripts/)
    assert.match(content, /\[ "\$\(id -u\)" -ne 0 \]/)
    assert.match(content, /case "\$modo" in coletar\|--verificar\|--dry-run\) ;; \*\) falhar/)
    assert.match(content, /execucao="local:\$run_id:\$carimbo"/)
    const linhaRunId = content.split("\n").find((linha) => linha.startsWith("run_id="))
    assert.ok(linhaRunId, "launcher sem run_id")
    const gerado = spawnSync("bash", ["-c", `${linhaRunId}; printf 'local:%s:20260930T091700Z' "$run_id"`], { encoding: "utf8" })
    assert.equal(gerado.status, 0, gerado.stderr)
    assert.match(gerado.stdout, /^local:[a-f0-9]{16}:\d{8}T\d{6}Z$/)
  })

  it("guarda artefatos em pasta persistente do usuário, nunca em /tmp", () => {
    assert.match(content, /dir_estado="\$HOME\/Library\/Application Support\/puxa-ficha"/)
    assert.match(content, /dir_log="\$HOME\/Library\/Logs\/puxa-ficha"/)
    assert.match(content, /saida="\$dir_estado\/processos-local\/\$carimbo-\$\{sha:0:12\}"/)
    assert.match(content, /evidencia="\$saida\/processos-\$modo_coleta\.evidence\.json"/)
    assert.match(content, /--cache="\$saida\/cache-\$modo_coleta"/)
    assert.doesNotMatch(content, /PF_PERMITIR_TMP|RUNNER_TEMP/)
  })

  it("verifica sem credenciais e encerra a vigência antes de ler segredos", () => {
    const verificar = posicao('if [ "$modo" = "--verificar" ]; then')
    const vigencia = posicao('-gt 20261025 ]; then')
    const segredos = posicao('[ -f "$credenciais" ]')
    assert.ok(verificar < vigencia && vigencia < segredos)
    assert.match(content, /env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_DB_URL node --input-type=module/)
    const prova = heredocJs(/node --input-type=module - <<'JS'/)
    assert.match(prova, /comunicaapi\.pje\.jus\.br\/api\/v1\/comunicacao\/tribunal/)
    assert.match(prova, /status !== 200/)
    const dir = mkdtempSync(join(tmpdir(), "pf-processos-teste-"))
    try {
      writeFileSync(join(dir, "prova.mjs"), prova)
      const check = spawnSync(process.execPath, ["--check", join(dir, "prova.mjs")], { encoding: "utf8" })
      assert.equal(check.status, 0, check.stderr)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("aceita só as três credenciais, do próprio usuário, com chmod 600", () => {
    assert.match(content, /credenciais="\$HOME\/\.config\/puxa-ficha\/processos-local\.env"/)
    assert.match(content, /\[ "\$\(stat -f %Lp "\$credenciais"\)" = "600" \]/)
    assert.match(content, /\[ "\$\(stat -f %u "\$credenciais"\)" = "\$\(id -u\)" \]/)
    assert.match(content, /\*\) falhar "chave não permitida nas credenciais: \$nome"/)
    for (const chave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"]) {
      assert.match(content, new RegExp(`^    ${chave}\\) `, "m"))
    }
  })

  it("roda a mesma sequência do workflow: conferir, coletar em dry-run, aplicar auditado, conferir", () => {
    const antes = posicao("conferir_recibos antes")
    const coleta = posicao("PF_DRY_RUN=1 node --import tsx scripts/curadoria-processos-lote.ts")
    const aplicar = posicao("scripts/aplicar-evidencia-processos-curadoria.ts --apply")
    const erro = posicao("scripts/registrar-erro-coleta-processos.ts --apply")
    const depois = posicao("conferir_recibos depois")
    assert.ok(antes < coleta && coleta < aplicar && aplicar < erro && erro < depois)
    assert.match(content, /for modo_coleta in vencendo sem-recibo; do/)
    assert.match(content, /--coorte-atual --dry-run "\$@"/)
    assert.match(content, /margem_dias=5\n/)
    assert.match(content, /--alvos=vencendo --margem-dias="\$margem_dias"/)
    assert.match(content, /--tipo="\$tipo" --modo="\$modo_coleta"/)
    assert.match(content, /resumir-diagnostico-coleta-processos\.ts[\s\\]+--entrada="\$evidencia\.diagnostico\.json"/)
    assert.match(content, /--saida="\$saida\/diagnostico-publico\/\$modo_coleta\.json"/)
    // No modo --dry-run o aplicador só simula e nenhum recibo de erro é gravado.
    assert.match(content, /if \[ "\$modo" = "--dry-run" \]; then aplicar=false; fi/)
    assert.match(content, /aplicar-evidencia-processos-curadoria\.ts --dry-run/)
    assert.match(content, /if \[ -f "\$snapshot" \] && \[ "\$aplicar" = "true" \]; then/)
    // As duas conferências usam o snapshot SQL e o checker de 14 dias do workflow.
    assert.match(content, /scripts\/audit\/processos-coverage-snapshot\.sql/)
    assert.match(content, /scripts\/audit\/check-processos-receipts\.ts/)
    assert.doesNotMatch(content, /from\("processos"\)|insert into (public\.)?processos/i)
  })

  it("falha fechado: coleta, aplicador ou conferência final com erro não viram sucesso", () => {
    const ok = posicao('echo "COLETA_OK')
    assert.ok(posicao('[ "$falhas" -eq 0 ] || falhar') < ok)
    assert.ok(posicao('[ "$rc_depois" -eq 0 ] || falhar') < ok)
    assert.match(content, /falhas=\$\(\(falhas \+ 1\)\)/)
    // A conferência anterior é informativa, como o continue-on-error do workflow.
    assert.match(content, /\[ "\$rc_antes" -eq 0 \] \|\| echo "AVISO:/)
  })

  it("entrega a URL do banco ao psql por variáveis PG, nunca na linha de comando", () => {
    assert.doesNotMatch(content, /psql "\$/)
    const bloco = heredocJs(/SUPABASE_DB_URL="\$url_banco" node - /)
    const dir = mkdtempSync(join(tmpdir(), "pf-processos-teste-"))
    try {
      const falso = join(dir, "psql")
      writeFileSync(falso, '#!/bin/sh\nprintf \'{"args":"%s","host":"%s","port":"%s","user":"%s","pass":"%s","db":"%s","ssl":"%s","url":"%s"}\' "$*" "$PGHOST" "$PGPORT" "$PGUSER" "$PGPASSWORD" "$PGDATABASE" "$PGSSLMODE" "$SUPABASE_DB_URL"\n')
      chmodSync(falso, 0o755)
      const saida = join(dir, "recibos.json")
      const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`,
        SUPABASE_DB_URL: "postgresql://usuario.ref:senha%40x@banco.exemplo.test:6543/postgres?sslmode=require" }
      const r = spawnSync(process.execPath, ["-", saida], { input: bloco, env, encoding: "utf8" })
      assert.equal(r.status, 0, r.stderr)
      const visto = JSON.parse(readFileSync(saida, "utf8"))
      assert.deepEqual(visto, {
        args: "-v ON_ERROR_STOP=1 -Atq -f scripts/audit/processos-coverage-snapshot.sql",
        host: "banco.exemplo.test", port: "6543", user: "usuario.ref", pass: "senha@x", db: "postgres", ssl: "require", url: "",
      })
      const invalida = spawnSync(process.execPath, ["-", saida], {
        input: bloco, encoding: "utf8", env: { ...env, SUPABASE_DB_URL: "postgresql://u:s@h/db?options=x" } })
      assert.notEqual(invalida.status, 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("instalador exige a main publicada, agenda segunda e quinta 09:17 UTC e não carrega o agente", () => {
    assert.match(installContent, /\[ "\$head_origem" = "\$sha_main" \]/)
    assert.match(installContent, /status --porcelain --untracked-files=all -- \./)
    assert.match(installContent, /horario_local "2026-09-28 09:17:00"/)
    assert.match(installContent, /horario_local "2026-10-01 09:17:00"/)
    assert.match(installContent, /date -j -u -f "%Y-%m-%d %H:%M:%S" "\$1" \+%s/)
    assert.doesNotMatch(installContent.split("cat <<EOF")[0], /launchctl (bootstrap|load)/)
    assert.match(installContent, /plutil -lint/)
  })

  it("modelo do plist tem dois horários e nenhum marcador sobra depois da troca", () => {
    const modelo = readFileSync(template, "utf8")
    assert.match(modelo, /<string>br\.com\.puxaficha\.processos-local<\/string>/)
    assert.match(modelo, /<key>RunAtLoad<\/key>\s*<false\/>/)
    const trocas: Record<string, string> = {
      __SCRIPT__: "/caminho/script.sh", __REPO__: "/caminho/clone", __LOG__: "/caminho/log",
      __WEEKDAY_A__: "1", __HOUR_A__: "6", __MINUTE_A__: "17", __WEEKDAY_B__: "4", __HOUR_B__: "6", __MINUTE_B__: "17",
    }
    let pronto = modelo
    for (const [marcador, valor] of Object.entries(trocas)) {
      assert.ok(pronto.includes(marcador), `marcador ausente: ${marcador}`)
      pronto = pronto.split(marcador).join(valor)
    }
    assert.doesNotMatch(pronto, /__[A-Z_]+__/)
    assert.equal((pronto.match(/<key>Weekday<\/key>/g) ?? []).length, 2)
    if (process.platform === "darwin") {
      const dir = mkdtempSync(join(tmpdir(), "pf-processos-teste-"))
      try {
        writeFileSync(join(dir, "agente.plist"), pronto)
        const lint = spawnSync("plutil", ["-lint", join(dir, "agente.plist")], { encoding: "utf8" })
        assert.equal(lint.status, 0, lint.stdout + lint.stderr)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })
})
