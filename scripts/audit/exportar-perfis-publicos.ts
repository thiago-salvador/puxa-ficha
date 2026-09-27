/**
 * Snapshot privado dos perfis públicos pela API do site, para os coletores de
 * prova compararem a fonte oficial com o que a ficha mostra. Mesma leitura da
 * matriz (`fetchPublicProfiles`). Perfil que não respondeu derruba o comando:
 * comparar contra coorte incompleta faria faltar recibo sem aviso.
 *
 * Coorte de atualização: com `--recibos=<coverage-receipts-snapshot>` as
 * fichas com atualização encerrada depois do turno ficam fora do snapshot, e
 * nenhum coletor da cobertura as percorre (o aplicador recusa alvo fora de
 * perfis.json). Em gravação o workflow sempre tem esse arquivo.
 *
 * Uso: node --import tsx scripts/audit/exportar-perfis-publicos.ts \
 *        --out=/privado/perfis.json [--recibos=/privado/recibos-atuais.json] [--base-url=https://puxaficha.com.br]
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { fetchPublicProfiles, lerEncerradasDoSnapshot } from "./audit-cobertura-fichas"
import { estaNaCoorteAtualizacao, coorteAtualizacaoDe } from "../lib/coorte-atualizacao"
import { assertOutsideRepository } from "./lib/private-output"

async function main(): Promise<void> {
  const option = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
  const out = option("out")
  if (!out) throw new Error("uso: --out=<arquivo privado> [--base-url=]")
  const target = assertOutsideRepository(out, "--out")
  const recibos = option("recibos")
  const encerradas = recibos ? lerEncerradasDoSnapshot([JSON.parse(readFileSync(resolve(recibos), "utf8")) as unknown]) : new Map<string, string>()
  const coorte = coorteAtualizacaoDe([...encerradas].map(([slug, data]) => ({ candidato_id: `slug:${slug}`, slug, fase_eleitoral: "encerrada", fase_turno: null, atualizacao_encerrada_em: data })))
  // coorte-atualizacao: aplica
  const lidos = await fetchPublicProfiles(option("base-url") ?? "https://puxaficha.com.br")
  const { errors } = lidos
  const profiles = lidos.profiles.filter((profile) => estaNaCoorteAtualizacao(coorte, { slug: typeof profile.slug === "string" ? profile.slug : null }))
  if (errors.length) throw new Error(`${errors.length} perfil(is) público(s) não lido(s); snapshot recusado`)
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(profiles)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, target)
  console.log(JSON.stringify({ perfis: profiles.length, atualizacao_encerrada: lidos.profiles.length - profiles.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
