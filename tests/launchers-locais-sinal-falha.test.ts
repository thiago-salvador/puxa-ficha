import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { fileURLToPath } from "node:url"

// Agentes launchd locais: uma rodada agendada que falha precisa sair com código
// não zero e deixar <agente>.falha, que só uma rodada boa apaga. O launchd
// guarda só o último código de saída, e um novo bootstrap o zera.
const agentes = [
  { dir: "processos-local", script: "coletar-local.sh", agente: "processos-local", log: "processos-local" },
  { dir: "checagens-local", script: "coletar-local.sh", agente: "checagens-local", log: "checagens-local" },
  { dir: "camara-local", script: "ingest-camara-local.sh", agente: "ingest-camara", log: "ingest-camara" },
  { dir: "tse-local", script: "ingest-tse-local.sh", agente: "ingest-tse", log: "ingest-tse" },
] as const

const raiz = fileURLToPath(new URL("..", import.meta.url))

function ambiente() {
  // realpath: no macOS o tmpdir passa por /var -> /private/var.
  const home = realpathSync(mkdtempSync(join(tmpdir(), "pf-launcher-")))
  const bin = join(home, "stub-bin")
  mkdirSync(bin)
  // Os launchers exigem macOS antes de redefinir o PATH; o stub deixa o teste
  // rodar no runner Linux do CI.
  writeFileSync(join(bin, "uname"), "#!/bin/sh\necho Darwin\n")
  chmodSync(join(bin, "uname"), 0o755)
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}`, PF_SEM_NOTIFICACAO: "1" }
  return { home, env }
}

const estado = (home: string) => join(home, "Library", "Application Support", "puxa-ficha")
const logs = (home: string, prefixo: string) =>
  readdirSync(join(home, "Library", "Logs", "puxa-ficha")).filter((nome) => nome.startsWith(`${prefixo}-`)).sort()

describe("sinal de falha dos launchers locais", () => {
  for (const { dir, script, agente, log } of agentes) {
    const launcher = join(raiz, "scripts", dir, script)

    test(`${agente}: rodada agendada que falha sai com 1 e deixa o marcador`, () => {
      const { home, env } = ambiente()
      try {
        // Clone inexistente: falha antes de qualquer rede ou credencial.
        const primeira = spawnSync("bash", [launcher, join(home, "nao-existe")], { env, encoding: "utf8" })
        assert.equal(primeira.status, 1, primeira.stderr)
        const marcador = join(estado(home), `${agente}.falha`)
        assert.ok(existsSync(marcador), "marcador de falha ausente")
        assert.match(readFileSync(marcador, "utf8"), /^rc=1 fim=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z log=.+\n$/)
        assert.match(readFileSync(join(estado(home), `${agente}.ultima-rodada`), "utf8"), /^rc=1 /)
        const [primeiroLog] = logs(home, log)
        assert.match(readFileSync(join(home, "Library", "Logs", "puxa-ficha", primeiroLog), "utf8"), /fim rc=1\n$/)

        // A rodada seguinte registra no log que a anterior falhou.
        spawnSync("sleep", ["1"])
        const segunda = spawnSync("bash", [launcher, join(home, "nao-existe")], { env, encoding: "utf8" })
        assert.equal(segunda.status, 1, segunda.stderr)
        const ultimoLog = logs(home, log).at(-1) ?? ""
        assert.notEqual(ultimoLog, primeiroLog)
        assert.match(readFileSync(join(home, "Library", "Logs", "puxa-ficha", ultimoLog), "utf8"), /AVISO: a rodada agendada anterior falhou: rc=1 /)
      } finally {
        rmSync(home, { recursive: true, force: true })
      }
    })

    test(`${agente}: --verificar manual não mexe no sinal da rodada agendada`, () => {
      const { home, env } = ambiente()
      try {
        const r = spawnSync("bash", [launcher, join(home, "nao-existe"), "--verificar"], { env, encoding: "utf8" })
        assert.equal(r.status, 1, r.stderr)
        assert.equal(existsSync(join(estado(home), `${agente}.falha`)), false)
        assert.equal(existsSync(join(estado(home), `${agente}.ultima-rodada`)), false)
      } finally {
        rmSync(home, { recursive: true, force: true })
      }
    })

    test(`${agente}: rodada boa apaga o marcador`, () => {
      const conteudo = readFileSync(launcher, "utf8")
      const funcao = conteudo.match(/^registrar_sinal\(\) \{\n[\s\S]*?^\}\n/m)?.[0]
      assert.ok(funcao, "registrar_sinal ausente")
      assert.match(conteudo, /fim rc=\$rc"\n {2}\[ [^\n]+\] \|\| registrar_sinal "\$rc"\n/)
      const { home, env } = ambiente()
      try {
        mkdirSync(estado(home), { recursive: true })
        const marcador = join(estado(home), `${agente}.falha`)
        writeFileSync(marcador, "rc=1 fim=2026-10-12T09:17:06Z log=x\n")
        const r = spawnSync("bash", ["-c", [
          "set -euo pipefail",
          `sinal="$HOME/Library/Application Support/puxa-ficha/${agente}.ultima-rodada"`,
          `marcador_falha="$HOME/Library/Application Support/puxa-ficha/${agente}.falha"`,
          'log="$HOME/rodada.log"',
          funcao,
          "registrar_sinal 0",
        ].join("\n")], { env, encoding: "utf8" })
        assert.equal(r.status, 0, r.stderr)
        assert.equal(existsSync(marcador), false)
        assert.match(readFileSync(join(estado(home), `${agente}.ultima-rodada`), "utf8"), /^rc=0 /)
      } finally {
        rmSync(home, { recursive: true, force: true })
      }
    })

    test(`${agente}: instalador recusa clone em pasta que o launchd não lê`, () => {
      const { home, env } = ambiente()
      try {
        for (const [pasta, viaLink] of [["Documents", false], ["Desktop", false], ["Documents", true]] as const) {
          const real = join(home, pasta, `clone-${viaLink ? "link" : "direto"}`)
          mkdirSync(join(real, "scripts", dir), { recursive: true })
          spawnSync("git", ["init", "-q", real])
          copyFileSync(join(raiz, "scripts", dir, "instalar-agente.sh"), join(real, "scripts", dir, "instalar-agente.sh"))
          let clone = real
          if (viaLink) {
            clone = join(home, "atalho")
            symlinkSync(real, clone)
          }
          const r = spawnSync("bash", [join(clone, "scripts", dir, "instalar-agente.sh")], { env, encoding: "utf8" })
          assert.equal(r.status, 1, r.stdout)
          assert.match(r.stderr, /fica numa pasta que o launchd não lê/)
          assert.equal(existsSync(join(home, "Library", "LaunchAgents")), false)
        }
      } finally {
        rmSync(home, { recursive: true, force: true })
      }
    })
  }
})
