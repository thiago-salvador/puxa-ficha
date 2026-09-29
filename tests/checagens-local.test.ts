import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const launcher = "scripts/checagens-local/coletar-local.sh"
const installer = "scripts/checagens-local/instalar-agente.sh"

describe("agente local de checagens", () => {
  it("mantém scripts Bash válidos e executa só a main fixada", () => {
    for (const script of [launcher, installer]) {
      const result = spawnSync("bash", ["-n", script], { encoding: "utf8" })
      assert.equal(result.status, 0, `${script}: ${result.stderr}`)
    }
    const content = readFileSync(launcher, "utf8")
    assert.match(content, /git -C "\$repo" fetch --quiet --no-tags "\$repo_url"/)
    assert.match(content, /git ls-remote "\$repo_url" refs\/heads\/main/)
    assert.match(content, /cmp -s "\$0" <\(git -C "\$repo" show "\$sha:\$launcher"\)/)
    assert.match(content, /npm ci --ignore-scripts/)
    assert.match(content, /checagens-rotas-smoke\.ts --exigir-todas/)
    assert.doesNotMatch(content, /LocalHostName|hostname -s/)
    assert.match(content, /execucao="local:\$run_id:\$carimbo"/)
    // A linha do launcher, executada como está, precisa gerar o id que o coleta_log aceita.
    const linhaRunId = content.split("\n").find((linha) => linha.startsWith("run_id="))
    assert.ok(linhaRunId, "launcher sem run_id")
    const gerado = spawnSync("bash", ["-c", `${linhaRunId}; printf 'local:%s:20260928T181242Z' "$run_id"`], { encoding: "utf8" })
    assert.equal(gerado.status, 0, gerado.stderr)
    assert.match(gerado.stdout, /^local:[a-f0-9]{16}:\d{8}T\d{6}Z$/)
    const installContent = readFileSync(installer, "utf8")
    assert.match(installContent, /\[ "\$head_origem" = "\$sha_main" \]/)
    assert.doesNotMatch(installContent.split("cat <<EOF")[0], /launchctl bootstrap/)
  })

  it("só grava depois de verificar 7\/7 e não agenda escrita no GitHub", () => {
    const content = readFileSync(launcher, "utf8")
    const dryRun = content.indexOf("--sem-google --concorrencia 3")
    const seteAgencias = content.indexOf("Object.keys(r.agencias).length !== 7")
    const gravar = content.indexOf("--gravar-log")
    assert.ok(dryRun >= 0 && dryRun < seteAgencias && seteAgencias < gravar)
    assert.match(content, /\[ "\$\(stat -f %Lp "\$credenciais"\)" = "600" \]/)
    const workflow = readFileSync(".github/workflows/checagens-coleta.yml", "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.doesNotMatch(workflow, /schedule:|SUPABASE_SERVICE_ROLE_KEY|--gravar-log|--catalogo/)
  })
})
