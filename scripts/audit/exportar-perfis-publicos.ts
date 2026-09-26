/**
 * Snapshot privado dos perfis públicos pela API do site, para os coletores de
 * prova compararem a fonte oficial com o que a ficha mostra. Mesma leitura da
 * matriz (`fetchPublicProfiles`). Perfil que não respondeu derruba o comando:
 * comparar contra coorte incompleta faria faltar recibo sem aviso.
 *
 * Uso: node --import tsx scripts/audit/exportar-perfis-publicos.ts \
 *        --out=/privado/perfis.json [--base-url=https://puxaficha.com.br]
 */
import { renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { fetchPublicProfiles } from "./audit-cobertura-fichas"
import { assertOutsideRepository } from "./lib/private-output"

async function main(): Promise<void> {
  const option = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
  const out = option("out")
  if (!out) throw new Error("uso: --out=<arquivo privado> [--base-url=]")
  const target = assertOutsideRepository(out, "--out")
  const { profiles, errors } = await fetchPublicProfiles(option("base-url") ?? "https://puxaficha.com.br")
  if (errors.length) throw new Error(`${errors.length} perfil(is) público(s) não lido(s); snapshot recusado`)
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(profiles)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, target)
  console.log(JSON.stringify({ perfis: profiles.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
