/**
 * Números da home do arquivo, com a fonte de cada um.
 *
 * Conta direto no export do banco (NDJSON.gz por tabela, feito no dia do
 * corte), no Git e no GitHub, e grava src/data/numeros-arquivo-2026.json.
 * Nenhum número é digitado: refazer o arquivo é rodar o script de novo.
 *
 * Uso:
 *   node --import tsx scripts/arquivo/numeros-arquivo.ts --export=<pasta do export>
 *        --log-testes=<saída do npm test> [--ref=origin/main]
 *        [--out=src/data/numeros-arquivo-2026.json]
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"

type Linha = Record<string, unknown>

function argumento(nome: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

function tabela(pasta: string, nome: string): Linha[] {
  const texto = gunzipSync(readFileSync(join(pasta, `${nome}.ndjson.gz`))).toString("utf8")
  return texto.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Linha)
}

const publicada = (r: Linha) => !r.despublicado_em
const distintos = (linhas: Linha[], campo: string) => new Set(linhas.map((r) => r[campo]).filter((v) => v !== null && v !== undefined && v !== "")).size

function comando(bin: string, args: string[]): string {
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim()
}

function main() {
  const pasta = argumento("export")
  const logTestes = argumento("log-testes")
  if (!pasta || !logTestes) throw new Error("--export e --log-testes são obrigatórios")
  const ref = argumento("ref") ?? "origin/main"
  const out = argumento("out") ?? "src/data/numeros-arquivo-2026.json"
  const manifesto = JSON.parse(readFileSync(join(pasta, "MANIFEST.json"), "utf8")) as { exportado_em: string }

  const fichas = tabela(pasta, "candidatos_publico")
  const porCargo = (cargo: string) => fichas.filter((r) => r.cargo_disputado === cargo).length
  const noticias = tabela(pasta, "noticias_candidato")
  const projetos = tabela(pasta, "projetos_lei").filter(publicada)
  const processos = tabela(pasta, "processos")
  const contas = tabela(pasta, "financiamento").filter(publicada)
  const anosContas = contas.map((r) => Number(r.ano_eleicao)).filter(Number.isFinite)
  const declaracoes = tabela(pasta, "patrimonio").filter(publicada)
  const coleta = tabela(pasta, "coleta_log")
  const datasColeta = coleta.map((r) => String(r.executado_em)).sort()

  const testes = Number(readFileSync(logTestes, "utf8").match(/^ℹ tests (\d+)$/m)?.[1])
  const falhas = Number(readFileSync(logTestes, "utf8").match(/^ℹ fail (\d+)$/m)?.[1])
  if (!Number.isFinite(testes) || falhas !== 0) throw new Error("log de testes sem total ou com falha")

  const sha = comando("git", ["rev-parse", "--short", ref])
  const exportFonte = `export do banco de ${manifesto.exportado_em.slice(0, 10)}`
  const numeros = {
    versao: 1,
    medido_em: new Date().toISOString(),
    exportado_em: manifesto.exportado_em,
    ref_codigo: sha,
    dados: {
      fichas: { valor: fichas.length, presidente: porCargo("Presidente"), governador: porCargo("Governador"), senador: porCargo("Senador"), ufs: distintos(fichas, "estado"), fonte: `${exportFonte}, tabela candidatos_publico` },
      candidaturas_tse: { valor: tabela(pasta, "candidatos_roster_2026").length, fonte: `${exportFonte}, tabela candidatos_roster_2026 (cadastro do TSE)` },
      noticias: { valor: noticias.length, fontes: distintos(noticias, "fonte"), fonte: `${exportFonte}, tabela noticias_candidato` },
      projetos_lei: { valor: projetos.length, fonte: `${exportFonte}, tabela projetos_lei, só publicados` },
      atos_governo: { valor: tabela(pasta, "legislacao_mandato_executivo").length, fonte: `${exportFonte}, tabela legislacao_mandato_executivo` },
      processos: { valor: processos.length, tribunais: distintos(processos, "tribunal"), fonte: `${exportFonte}, tabela processos` },
      prestacoes_contas: { valor: contas.length, ano_inicial: Math.min(...anosContas), ano_final: Math.max(...anosContas), fonte: `${exportFonte}, tabela financiamento, só publicadas` },
      // Cada linha de patrimonio é uma declaração; os bens ficam no array `bens` dela.
      bens_declarados: { valor: declaracoes.reduce((total, r) => total + (Array.isArray(r.bens) ? r.bens.length : 0), 0), declaracoes: declaracoes.length, fonte: `${exportFonte}, itens de patrimonio.bens nas declarações publicadas` },
    },
    operacao: {
      registros_coleta: { valor: coleta.length, inicio: datasColeta[0].slice(0, 10), fim: datasColeta.at(-1)!.slice(0, 10), fonte: `${exportFonte}, tabela coleta_log` },
      rotinas_coleta: { valor: distintos(coleta, "fonte"), fonte: `${exportFonte}, valores distintos de coleta_log.fonte` },
      mudancas_rastreadas: { valor: tabela(pasta, "candidate_changes").length, fonte: `${exportFonte}, tabela candidate_changes` },
    },
    construcao: {
      testes: { valor: testes, fonte: `npm test em ${sha}` },
      prs_mesclados: { valor: Number(comando("gh", ["pr", "list", "--state", "merged", "--limit", "5000", "--json", "number", "--jq", "length"])), fonte: "GitHub, pull requests mesclados" },
      commits: { valor: Number(comando("git", ["rev-list", "--count", ref])), fonte: `git rev-list em ${sha}` },
      migracoes: { valor: comando("git", ["ls-tree", "--name-only", `${ref}:supabase/migrations`]).split("\n").filter((f) => f.endsWith(".sql")).length, fonte: `supabase/migrations em ${sha}` },
    },
  }
  writeFileSync(out, `${JSON.stringify(numeros, null, 2)}\n`)
  console.log(`gravado ${out}`)
}

main()
