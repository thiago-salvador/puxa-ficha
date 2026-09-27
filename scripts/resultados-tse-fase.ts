/**
 * Fase eleitoral pelo resultado oficial do TSE e coorte de atualização.
 *
 *   plano   Lê o resultado oficial (resultados.tse.jus.br), cruza com as fichas
 *           no ar e escreve o plano. Só leitura: nunca grava no banco.
 *   gerar   Transforma um plano completo na migration de resultado auditada
 *           (migration, readback, rollback, readback do rollback, allowlist,
 *           recorte e manifesto do apply-fase-eleitoral-production).
 *
 * Uso:
 *   npm run resultados:tse -- plano --turno=1 --out=reports/resultados-tse
 *        [--ciclo=ele2026] [--eleicao-federal=N --eleicao-estadual=N]
 *        [--config=ele-c.json] [--arquivos=DIR] [--coorte=coorte.json] [--exigir-completo]
 *   npm run resultados:tse -- gerar --plano=reports/resultados-tse/plano-turno-1.json
 *        --versao=AAAAMMDDHHMMSS
 *
 * Leitura parcial nunca marca ninguém: ver scripts/lib/resultados-tse.ts.
 * Runbook: docs/operations/coorte-atualizacao-pos-turno.md.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { DATAS_TURNOS_2026, type TurnoEleitoral } from "../src/lib/coorte-atualizacao"
import { TABELA_FASE_ELEITORAL, isTabelaFaseAusente } from "./lib/coorte-atualizacao"
import { gerarArquivosFase } from "./lib/fase-eleitoral-migration"
import {
  CICLO_2026,
  TSE_CONFIG_ELEICOES_URL,
  arquivosDoTurno,
  descobrirEleicoes,
  lerArquivoResultado,
  montarPlano,
  type ArquivoAlvo,
  type CandidaturaCoorte,
  type CargoResultado,
  type EleicoesDoTurno,
  type LeituraArquivo,
  type PlanoFase,
} from "./lib/resultados-tse"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const USER_AGENT = "puxa-ficha-resultados/1.0 (+https://puxaficha.com.br)"

function opcao(args: string[], nome: string): string | null {
  const prefixo = `--${nome}=`
  return args.find((a) => a.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

function turnoDe(args: string[]): TurnoEleitoral {
  const t = opcao(args, "turno")
  if (t !== "1" && t !== "2") throw new Error("--turno=1 ou --turno=2 é obrigatório")
  return Number(t) as TurnoEleitoral
}

interface Resposta { status: number; corpo: string }

async function baixar(url: string): Promise<Resposta> {
  let ultimoErro: unknown = null
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      const r = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(20_000) })
      const corpo = await r.text()
      if (r.status >= 500 && tentativa === 0) continue
      return { status: r.status, corpo }
    } catch (error) {
      ultimoErro = error
    }
  }
  throw new Error(`falha de rede em ${url}: ${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`)
}

async function lerConfig(args: string[]): Promise<unknown> {
  const local = opcao(args, "config")
  if (local) return JSON.parse(readFileSync(resolve(local), "utf8"))
  const r = await baixar(TSE_CONFIG_ELEICOES_URL)
  if (r.status !== 200) throw new Error(`ele-c.json HTTP ${r.status}`)
  return JSON.parse(r.corpo)
}

async function eleicoesDoTurno(args: string[], turno: TurnoEleitoral): Promise<EleicoesDoTurno> {
  const ciclo = opcao(args, "ciclo") ?? CICLO_2026
  const federal = opcao(args, "eleicao-federal")
  const estadual = opcao(args, "eleicao-estadual")
  if (federal || estadual) {
    if (!federal || !estadual || !/^\d+$/.test(federal) || !/^\d+$/.test(estadual)) {
      throw new Error("--eleicao-federal e --eleicao-estadual vão juntos, numéricos")
    }
    return { ciclo, turno, data: DATAS_TURNOS_2026[turno], federal, estadual }
  }
  return descobrirEleicoes(await lerConfig(args), { ciclo, turno, dataIso: DATAS_TURNOS_2026[turno] })
}

async function lerArquivos(alvos: ArquivoAlvo[], turno: TurnoEleitoral, dirLocal: string | null): Promise<LeituraArquivo[]> {
  const leituras: LeituraArquivo[] = []
  const fila = [...alvos]
  const trabalhador = async () => {
    for (let alvo = fila.shift(); alvo; alvo = fila.shift()) {
      try {
        if (dirLocal) {
          const caminho = join(dirLocal, basename(new URL(alvo.url).pathname))
          if (!existsSync(caminho)) { leituras.push({ ok: false, alvo, motivo: "arquivo local ausente" }); continue }
          leituras.push(lerArquivoResultado(alvo, turno, readFileSync(caminho, "utf8")))
          continue
        }
        const r = await baixar(alvo.url)
        if (r.status !== 200) { leituras.push({ ok: false, alvo, motivo: `HTTP ${r.status}` }); continue }
        leituras.push(lerArquivoResultado(alvo, turno, r.corpo))
      } catch (error) {
        leituras.push({ ok: false, alvo, motivo: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabalhador))
  return leituras.sort((a, b) => a.alvo.chave.localeCompare(b.alvo.chave))
}

async function lerCoorteDoBanco(): Promise<CandidaturaCoorte[]> {
  const { supabase } = await import("./lib/supabase")
  const candidatos: Array<Omit<CandidaturaCoorte, "fase_eleitoral" | "atualizacao_encerrada_em">> = []
  for (let from = 0; ; from += 1000) {
    // coorte-atualizacao: aplica (o plano parte das fichas no ar e da fase já gravada)
    const { data, error } = await supabase.from("candidatos")
      .select("id, slug, cargo_disputado, estado, sq_candidato_2026")
      .in("cargo_disputado", ["Presidente", "Governador", "Senador"])
      .eq("publicavel", true).neq("status", "removido")
      .order("id").range(from, from + 999)
    if (error) throw new Error(`candidatos: ${error.message}`)
    candidatos.push(...((data ?? []) as typeof candidatos))
    if (!data || data.length < 1000) break
  }
  const fases = new Map<string, { fase_eleitoral: string; atualizacao_encerrada_em: string | null }>()
  const { data: linhas, error } = await supabase.from(TABELA_FASE_ELEITORAL)
    .select("candidato_id, fase_eleitoral, atualizacao_encerrada_em")
  if (error && !isTabelaFaseAusente(error)) throw new Error(`${TABELA_FASE_ELEITORAL}: ${error.message}`)
  for (const l of (linhas ?? []) as Array<{ candidato_id: string; fase_eleitoral: string; atualizacao_encerrada_em: string | null }>) {
    fases.set(l.candidato_id, l)
  }
  return candidatos.map((c) => ({
    ...c,
    fase_eleitoral: fases.get(c.id)?.fase_eleitoral ?? "em_disputa",
    atualizacao_encerrada_em: fases.get(c.id)?.atualizacao_encerrada_em ?? null,
  }))
}

function resumoMarkdown(plano: PlanoFase): string {
  const linhas = [
    `## Resultado TSE, ${plano.turno}º turno: plano ${plano.status}`,
    "",
    `Eleições ${plano.eleicoes.ciclo}: federal ${plano.eleicoes.federal}, estadual ${plano.eleicoes.estadual}.`,
    "",
    `| Item | Quantidade |`,
    `|---|---|`,
    ...Object.entries(plano.resumo).map(([k, v]) => `| ${k} | ${v} |`),
    `| arquivos lidos | ${plano.fontes.filter((f) => f.ok).length} de ${plano.fontes.length} |`,
  ]
  const recusados = plano.fontes.filter((f) => !f.ok)
  if (recusados.length) {
    linhas.push("", "Arquivos recusados (ninguém destes arquivos é marcado):", ...recusados.map((f) => `- ${f.chave}: ${f.motivo}`))
  }
  return `${linhas.join("\n")}\n`
}

async function comandoPlano(args: string[]): Promise<number> {
  const turno = turnoDe(args)
  const out = resolve(opcao(args, "out") ?? "reports/resultados-tse")
  const eleicoes = await eleicoesDoTurno(args, turno)
  const coorteArquivo = opcao(args, "coorte")
  const coorte = coorteArquivo ? JSON.parse(readFileSync(resolve(coorteArquivo), "utf8")) as CandidaturaCoorte[] : await lerCoorteDoBanco()
  const alvos = arquivosDoTurno(eleicoes, coorte
    .filter((c) => c.cargo_disputado === "Presidente" || c.cargo_disputado === "Governador" || c.cargo_disputado === "Senador")
    .map((c) => ({ cargo: c.cargo_disputado as CargoResultado, uf: c.estado })))
  const leituras = await lerArquivos(alvos, turno, opcao(args, "arquivos"))
  const plano = montarPlano({ turno, eleicoes, coorte, leituras, agora: new Date() })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, `plano-turno-${turno}.json`), `${JSON.stringify(plano, null, 2)}\n`)
  const resumo = resumoMarkdown(plano)
  writeFileSync(join(out, `resumo-turno-${turno}.md`), resumo)
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, resumo, { flag: "a" })
  console.log(JSON.stringify({ status: plano.status, turno, eleicoes, resumo: plano.resumo, arquivos: plano.fontes.length, recusados: plano.fontes.filter((f) => !f.ok).length }))
  if (plano.status !== "completo") {
    console.log(`::warning::plano ${plano.status}: ${plano.pendentes.length} pendência(s); nada será marcado para elas`)
    if (args.includes("--exigir-completo")) return 3
  }
  return 0
}

function topoDaArvore(): { version: string; name: string } {
  const nomes = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort()
  const ultimo = nomes[nomes.length - 1]
  return { version: ultimo.slice(0, 14), name: ultimo.slice(15, -4) }
}

function comandoGerar(args: string[]): number {
  const planoPath = opcao(args, "plano")
  const version = opcao(args, "versao")
  if (!planoPath || !version) throw new Error("gerar exige --plano= e --versao=")
  const plano = JSON.parse(readFileSync(resolve(planoPath), "utf8")) as PlanoFase
  const predecessor = topoDaArvore()
  const arquivos = gerarArquivosFase({ plano, version, predecessor })
  const escrever = (rel: string, conteudo: string) => {
    const caminho = join(ROOT, rel)
    if (existsSync(caminho)) throw new Error(`já existe: ${rel}`)
    mkdirSync(join(caminho, ".."), { recursive: true })
    writeFileSync(caminho, conteudo)
    console.log(`escrito ${rel}`)
  }
  escrever(`supabase/migrations/${arquivos.nome}.sql`, arquivos.migration)
  escrever(`supabase/readback/${arquivos.nome}.readback.sql`, arquivos.readback)
  escrever(`supabase/rollback/${arquivos.nome}.rollback.sql`, arquivos.rollback)
  escrever(`supabase/readback/${arquivos.nome}.rollback.readback.sql`, arquivos.rollbackReadback)
  escrever(arquivos.recorte.allowlist, `${JSON.stringify(arquivos.allowlist, null, 2)}\n`)
  const manifestoRel = `supabase/fase-eleitoral/${arquivos.manifesto.conjunto}.json`
  const manifestoPath = join(ROOT, manifestoRel)
  writeFileSync(manifestoPath, `${JSON.stringify(arquivos.manifesto, null, 2)}\n`)
  console.log(`escrito ${manifestoRel}`)
  const recortesPath = join(ROOT, "scripts/audit/recortes.json")
  const recortes = JSON.parse(readFileSync(recortesPath, "utf8")) as { recortes: unknown[] }
  recortes.recortes.push(arquivos.recorte)
  writeFileSync(recortesPath, `${JSON.stringify(recortes, null, 2)}\n`)
  console.log("recorte acrescentado em scripts/audit/recortes.json")
  console.log(`predecessor ${predecessor.version}_${predecessor.name}; conferir o topo do ledger antes do apply (runbook)`)
  return 0
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [comando, ...args] = argv
  if (comando === "plano") return comandoPlano(args)
  if (comando === "gerar") return comandoGerar(args)
  console.error("uso: resultados-tse-fase.ts plano|gerar ... (ver cabeçalho)")
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
