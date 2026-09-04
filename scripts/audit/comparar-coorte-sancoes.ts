import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadCandidatosPublicosMinimos } from "../lib/candidatos-publicos-minimos"
import { ativarDryRun } from "../lib/dry-run"

// Somente SELECT de slug/nome na view pública. Não importa nem executa coletor.
ativarDryRun()

async function main(): Promise<void> {
  const coorte = await loadCandidatosPublicosMinimos({ escopo: null })
  const seed = JSON.parse(readFileSync(resolve("data/candidatos.json"), "utf8")) as {
    slug: string
  }[]
  const noSeed = new Set(seed.map((candidato) => candidato.slug))
  const antes = coorte.filter((candidato) => noSeed.has(candidato.slug)).length
  console.log(JSON.stringify({
    modo: "somente leitura, sem coleta CGU",
    medido_em: new Date().toISOString(),
    escopo: "coorte pública inteira, sem PF_INGEST_SLUGS",
    publicos: coorte.length,
    antes_seed_intersecao_publicos: antes,
    depois_coorte_publica: coorte.length,
    publicos_fora_seed: coorte.length - antes,
  }, null, 2))
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : "Falha ao comparar coorte")
  process.exitCode = 1
})
