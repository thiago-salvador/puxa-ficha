/**
 * Rehash estreito de `cpf_hash` de doador pessoa física com a chave v2 (#409),
 * sem reingerir os pleitos: só `cpf_hash`/`cpf_hash_versao` mudam, com CAS.
 *
 *   npx tsx scripts/rehash-doador-cpf-v2.ts --anos=2018,2024                  # dry-run
 *   npx tsx scripts/rehash-doador-cpf-v2.ts --anos=2018 --out=<dir>           # + plano e backup
 *   npx tsx scripts/rehash-doador-cpf-v2.ts --anos=2018 --apply --expected-plan-sha=<sha>
 *
 * A lista completa de doadores de cada pleito vem do ingest canônico em
 * dry-run (`planStorageRows`), que baixa ou reusa `data/tse/*.zip`.
 */
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { supabase } from "./lib/supabase"
import { ingestTSE, type PlannedTseRow } from "./lib/ingest-tse"
import { escreverAuditado } from "./lib/escrita-auditada"
import {
  chaveContexto,
  exigirChaveV2,
  planejarRehashLinha,
  type DesfechoRehash,
  type LinhaFinanciamentoAtual,
} from "./lib/rehash-doador-cpf-v2"
import { stableJson } from "./lib/tse-2026-financas-plano"

const SCRIPT = "rehash-doador-cpf-v2"

export function lerAnos(argv: string[]): number[] {
  const raw = argv.find((a) => a.startsWith("--anos="))?.slice("--anos=".length)
  if (!raw) throw new Error("informe --anos=AAAA[,AAAA]")
  const anos = raw.split(",").map((s) => Number(s.trim()))
  if (anos.some((a) => !Number.isInteger(a) || a < 2002 || a > 2026)) throw new Error(`--anos inválido: ${raw}`)
  return [...new Set(anos)].sort()
}

async function linhasPublicas(ano: number): Promise<Array<LinhaFinanciamentoAtual & { slug: string }>> {
  const { data: publicos, error: e1 } = await supabase.from("candidatos_publico").select("id, slug").range(0, 1999)
  if (e1) throw new Error(e1.message)
  const slugPorId = new Map((publicos ?? []).map((p: { id: string; slug: string }) => [p.id, p.slug]))
  const out: Array<LinhaFinanciamentoAtual & { slug: string }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("financiamento")
      .select("id, candidato_id, ano_eleicao, sq_candidato, uf_candidatura, maiores_doadores")
      .eq("ano_eleicao", ano).order("id").range(offset, offset + 999)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as LinhaFinanciamentoAtual[]) {
      const slug = slugPorId.get(row.candidato_id)
      if (slug) out.push({ ...row, slug })
    }
    if (!data || data.length < 1000) break
  }
  return out
}

export interface PlanoAno {
  ano: number
  desfechos: Array<DesfechoRehash & { slug: string }>
  resumo: Record<string, number>
}

async function planejarAno(ano: number): Promise<PlanoAno> {
  const planejadas: PlannedTseRow[] = []
  const resultados = await ingestTSE([ano], {
    dryRun: true,
    planStorageRows: true,
    skipPatrimonio: true,
    onPlannedRow: (e) => planejadas.push(e),
  })
  const erroDeAno = resultados.find((r) => r.candidato === `financiamento-${ano}` && r.errors.length > 0)
  if (erroDeAno) throw new Error(`pacote TSE ${ano}: ${erroDeAno.errors.join("; ")}`)

  const fontePorContexto = new Map<string, Record<string, unknown>[]>()
  for (const p of planejadas) {
    if (p.table !== "financiamento") continue
    const r = p.row
    const lista = Array.isArray(r.doadores_completos) ? (r.doadores_completos as Record<string, unknown>[]) : null
    if (!lista) throw new Error("ingest não devolveu doadores_completos: planStorageRows ignorado")
    fontePorContexto.set(chaveContexto(String(r.candidato_id), ano, r.sq_candidato, r.uf_candidatura), lista)
  }

  const atuais = await linhasPublicas(ano)
  const desfechos = atuais.map((linha) => ({
    ...planejarRehashLinha(
      linha,
      fontePorContexto.get(chaveContexto(linha.candidato_id, ano, linha.sq_candidato, linha.uf_candidatura)) ?? null,
    ),
    slug: linha.slug,
  }))
  const resumo: Record<string, number> = { linhas_publicas: atuais.length, hashes_novos: 0, doadores_sem_correspondencia: 0 }
  for (const d of desfechos) {
    resumo[d.tipo] = (resumo[d.tipo] ?? 0) + 1
    if (d.tipo === "atualizar" || d.tipo === "parcial") resumo.hashes_novos += d.hashes_novos
    if (d.tipo === "parcial") resumo.doadores_sem_correspondencia += d.sem_correspondencia
  }
  return { ano, desfechos, resumo }
}

function escritas(plano: PlanoAno) {
  return plano.desfechos.filter(
    (d): d is Extract<DesfechoRehash, { tipo: "atualizar" | "parcial" }> & { slug: string } =>
      (d.tipo === "atualizar" || d.tipo === "parcial") && d.hashes_novos > 0,
  )
}

export function shaDoPlanoAno(plano: PlanoAno): string {
  return createHash("sha256")
    .update(stableJson(escritas(plano).map((d) => ({ id: d.id, depois: d.depois }))))
    .digest("hex")
}

function salvar(dir: string, nome: string, conteudo: unknown): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = resolve(dir, nome)
  writeFileSync(path, JSON.stringify(conteudo, null, 2) + "\n", { mode: 0o600 })
  chmodSync(path, 0o600)
  return path
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  exigirChaveV2(process.env.PF_DOADOR_CPF_HASH_SALT)
  const anos = lerAnos(argv)
  const aplicar = argv.includes("--apply")
  const out = argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ?? null
  const esperado = new Map(
    (argv.find((a) => a.startsWith("--expected-plan-sha="))?.slice("--expected-plan-sha=".length) ?? "")
      .split(",").filter(Boolean).map((par) => {
        const [ano, sha] = par.split("=")
        return [Number(ano), sha] as const
      }),
  )

  let codigo = 0
  for (const ano of anos) {
    const plano = await planejarAno(ano)
    const sha = shaDoPlanoAno(plano)
    const lista = escritas(plano)
    console.log(JSON.stringify({ ano, modo: aplicar ? "apply" : "dry-run", plano_sha256: sha, resumo: plano.resumo }))
    if (out) {
      salvar(out, `rehash-${ano}-plano-privado.json`, { ano, plano_sha256: sha, escritas: lista })
      salvar(out, `rehash-${ano}-backup-preimagem.json`, lista.map((d) => ({ id: d.id, slug: d.slug, maiores_doadores: d.antes })))
      salvar(out, `rehash-${ano}-resumo.json`, {
        ano,
        plano_sha256: sha,
        resumo: plano.resumo,
        por_slug: plano.desfechos.map((d) => ({ slug: d.slug, tipo: d.tipo, hashes_novos: "hashes_novos" in d ? d.hashes_novos : 0 })),
      })
    }
    if (!aplicar) {
      // Sonda de CAS: o predicado jsonb do update casa exatamente a linha.
      let falhas = 0
      for (const d of lista) {
        const { data, error } = await supabase.from("financiamento").select("id")
          .eq("id", d.id).eq("maiores_doadores", JSON.stringify(d.antes))
        if (error || (data ?? []).length !== 1) falhas++
      }
      console.log(JSON.stringify({ ano, sonda_cas: { ok: lista.length - falhas, falhas } }))
      if (falhas > 0) codigo = 5
      continue
    }
    if (esperado.get(ano) !== sha) {
      console.error(`${ano}: plano_sha256 ${sha} difere do revisado (${esperado.get(ano) ?? "ausente"}); nada gravado`)
      codigo = 3
      continue
    }
    let conflitos = 0
    for (const d of lista) {
      const linhas = await escreverAuditado(
        {
          script: SCRIPT,
          tabela: "financiamento",
          motivo: "acrescenta cpf_hash v2 a doador pessoa física sem hash (#409), sem alterar valores",
          recorte: `id=${d.id}; ${d.slug} ${ano}; ${d.hashes_novos} hash(es)`,
        },
        () =>
          supabase.from("financiamento").update({ maiores_doadores: d.depois })
            .eq("id", d.id).eq("maiores_doadores", JSON.stringify(d.antes)).select("id"),
      )
      if (linhas.length !== 1) conflitos++
    }
    console.log(JSON.stringify({ ano, aplicadas: lista.length - conflitos, conflitos }))
    if (conflitos > 0) codigo = 4
  }
  return codigo
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    },
  )
}
