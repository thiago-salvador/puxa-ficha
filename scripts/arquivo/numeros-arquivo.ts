/**
 * Números da home do arquivo, com a fonte de cada um.
 *
 * Conta direto no export do banco (NDJSON.gz por tabela, feito no dia do
 * corte), no Git e no GitHub, e grava src/data/numeros-arquivo-2026.json:
 * os totais, a série semanal dos gráficos da home e a linha do tempo (só
 * datas com registro no banco, no Git ou no calendário do TSE).
 * Nenhum número é digitado: refazer o arquivo é rodar o script de novo.
 *
 * Uso:
 *   node --import tsx scripts/arquivo/numeros-arquivo.ts --export=<pasta do export>
 *        --log-testes=<saída do npm test> [--ref=origin/main]
 *        [--out=src/data/numeros-arquivo-2026.json]
 */
import { execFileSync } from "node:child_process"
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { ARQUIVO_ELEICOES_2026 } from "../../src/lib/arquivo"
import { diaEmBrasilia, porSemana } from "./semanas"

type Linha = Record<string, unknown>

function argumento(nome: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

function tabela(pasta: string, nome: string): Linha[] {
  const texto = gunzipSync(readFileSync(join(pasta, `${nome}.ndjson.gz`))).toString("utf8")
  return texto.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Linha)
}

const publicada = (r: Linha) => !r.despublicado_em
// O arquivo congela os dados no fim do dia do corte (25/10, Brasília): registro posterior não entra na contagem.
const FIM_DO_CORTE = Date.parse(ARQUIVO_ELEICOES_2026.fimIso)
const antesDoCorte = (campo: string) => (r: Linha) => typeof r[campo] === "string" && Date.parse(r[campo] as string) < FIM_DO_CORTE
const distintos = (linhas: Linha[], campo: string) => new Set(linhas.map((r) => r[campo]).filter((v) => v !== null && v !== undefined && v !== "")).size

// Seções do site e o nome com que aparecem no menu e no rodapé. A data de cada uma é a do merge na main
// (git log --first-parent), ou a do código publicado quando ela já veio no primeiro commit.
const SECOES: { rota: string; rotulo: string }[] = [
  { rota: "candidato", rotulo: "fichas" },
  { rota: "comparar", rotulo: "comparador" },
  { rota: "quiz", rotulo: "quiz" },
  { rota: "alertas", rotulo: "alertas" },
  { rota: "rankings", rotulo: "listas" },
  { rota: "doadores", rotulo: "doadores" },
  { rota: "senado", rotulo: "Senado" },
  { rota: "imprensa", rotulo: "área de imprensa" },
  { rota: "colinha", rotulo: "colinha" },
  { rota: "deputados", rotulo: "deputados" },
  { rota: "dados-abertos", rotulo: "dados abertos" },
  { rota: "programas", rotulo: "programas de governo" },
  { rota: "1o-turno", rotulo: "resultado do 1º turno por estado" },
]

function comando(bin: string, args: string[]): string {
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim()
}

function juntar(itens: string[]): string {
  return itens.length < 2 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`
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
  const noticias = tabela(pasta, "noticias_candidato").filter(antesDoCorte("data_publicacao"))
  const projetos = tabela(pasta, "projetos_lei").filter(publicada)
  const processos = tabela(pasta, "processos")
  const contas = tabela(pasta, "financiamento").filter(publicada)
  const anosContas = contas.map((r) => Number(r.ano_eleicao)).filter(Number.isFinite)
  const declaracoes = tabela(pasta, "patrimonio").filter(publicada)
  const coleta = tabela(pasta, "coleta_log").filter(antesDoCorte("executado_em"))
  const datasColeta = coleta.map((r) => String(r.executado_em)).sort()

  const testes = Number(readFileSync(logTestes, "utf8").match(/^ℹ tests (\d+)$/m)?.[1])
  const falhas = Number(readFileSync(logTestes, "utf8").match(/^ℹ fail (\d+)$/m)?.[1])
  if (!Number.isFinite(testes) || falhas !== 0) throw new Error("log de testes sem total ou com falha")

  const sha = comando("git", ["rev-parse", "--short", ref])
  const fimCorte = new Date(FIM_DO_CORTE - 1).toISOString()
  const inicioColeta = datasColeta[0]
  const mudancas = tabela(pasta, "candidate_changes").filter(antesDoCorte("created_at"))
  const semanal = porSemana(datasColeta, inicioColeta, fimCorte)
  // Só datas válidas entre a primeira coleta e o corte: campo nulo ou fora do período não entra na série.
  const datasEntrada = (linhas: Linha[], campo: string) =>
    linhas
      .map((r) => r[campo])
      .filter((d): d is string => typeof d === "string" && Number.isFinite(Date.parse(d)) && d >= inicioColeta && Date.parse(d) < FIM_DO_CORTE)

  // Linha do tempo: só datas com registro (banco, Git, calendário do TSE no código).
  const primeiroCommit = comando("git", ["rev-list", "--max-parents=0", ref]).split("\n").at(-1)!
  const dataPrimeiroCommit = comando("git", ["log", "-1", "--format=%ad", "--date=short", primeiroCommit])
  const secoesPorData = new Map<string, string[]>()
  for (const { rota, rotulo } of SECOES) {
    const data = comando("git", ["log", ref, "--first-parent", "--reverse", "--format=%ad", "--date=short", "--", `src/app/(site)/${rota}`]).split("\n")[0]
    if (!data) throw new Error(`seção sem histórico no Git: ${rota}`)
    secoesPorData.set(data, [...(secoesPorData.get(data) ?? []), rotulo])
  }
  const marcos = [
    { data: diaEmBrasilia(inicioColeta), titulo: "Primeira coleta registrada", fonte: "coleta_log" },
    ...[...secoesPorData.entries()].map(([data, rotulos]) => ({
      data,
      titulo: data === dataPrimeiroCommit ? `Primeiro commit do repositório público, já com ${juntar(rotulos)}` : `Entram no código: ${juntar(rotulos)}`,
      fonte: data === dataPrimeiroCommit ? "primeiro commit público" : "merge na main",
    })),
    { data: "2026-10-04", titulo: "1º turno", fonte: "calendário eleitoral do TSE" },
    { data: "2026-10-25", titulo: `2º turno; os dados congelam em ${ARQUIVO_ELEICOES_2026.dataCorte}`, fonte: "calendário eleitoral do TSE" },
  ].sort((a, b) => a.data.localeCompare(b.data))
  const exportFonte = `export do banco de ${manifesto.exportado_em.slice(0, 10)}`
  const numeros = {
    versao: 2,
    medido_em: new Date().toISOString(),
    exportado_em: manifesto.exportado_em,
    ref_codigo: sha,
    dados: {
      fichas: { valor: fichas.length, presidente: porCargo("Presidente"), governador: porCargo("Governador"), senador: porCargo("Senador"), ufs: distintos(fichas, "estado"), fonte: `${exportFonte}, tabela candidatos_publico` },
      candidaturas_tse: { valor: tabela(pasta, "candidatos_roster_2026").length, fonte: `${exportFonte}, tabela candidatos_roster_2026 (cadastro do TSE)` },
      noticias: { valor: noticias.length, fontes: distintos(noticias, "fonte"), fonte: `${exportFonte}, tabela noticias_candidato, publicadas até o corte` },
      projetos_lei: { valor: projetos.length, fonte: `${exportFonte}, tabela projetos_lei, só publicados` },
      atos_governo: { valor: tabela(pasta, "legislacao_mandato_executivo").length, fonte: `${exportFonte}, tabela legislacao_mandato_executivo` },
      processos: { valor: processos.length, tribunais: distintos(processos, "tribunal"), fonte: `${exportFonte}, tabela processos` },
      prestacoes_contas: { valor: contas.length, ano_inicial: Math.min(...anosContas), ano_final: Math.max(...anosContas), fonte: `${exportFonte}, tabela financiamento, só publicadas` },
      // Cada linha de patrimonio é uma declaração; os bens ficam no array `bens` dela.
      bens_declarados: { valor: declaracoes.reduce((total, r) => total + (Array.isArray(r.bens) ? r.bens.length : 0), 0), declaracoes: declaracoes.length, fonte: `${exportFonte}, itens de patrimonio.bens nas declarações publicadas` },
    },
    operacao: {
      registros_coleta: { valor: coleta.length, inicio: diaEmBrasilia(datasColeta[0]), fim: diaEmBrasilia(datasColeta.at(-1)!), fonte: `${exportFonte}, tabela coleta_log até o corte de ${ARQUIVO_ELEICOES_2026.dataCorte}` },
      rotinas_coleta: { valor: distintos(coleta, "fonte"), fonte: `${exportFonte}, valores distintos de coleta_log.fonte` },
      mudancas_rastreadas: { valor: mudancas.length, fonte: `${exportFonte}, tabela candidate_changes até o corte de ${ARQUIVO_ELEICOES_2026.dataCorte}` },
    },
    serie_semanal: {
      semanas: semanal.semanas,
      coleta: semanal.valores,
      mudancas: porSemana(datasEntrada(mudancas, "created_at"), inicioColeta, fimCorte).valores,
      noticias: porSemana(datasEntrada(noticias, "created_at"), inicioColeta, fimCorte).valores,
      fonte: `${exportFonte}: coleta_log.executado_em, candidate_changes.created_at e noticias_candidato.created_at, por semana (segunda a domingo, horário de Brasília)`,
    },
    marcos,
    construcao: {
      testes: { valor: testes, fonte: `npm test em ${sha}` },
      prs_mesclados: { valor: Number(comando("gh", ["pr", "list", "--state", "merged", "--limit", "5000", "--json", "number", "--jq", "length"])), fonte: "GitHub, pull requests mesclados" },
      commits: { valor: Number(comando("git", ["rev-list", "--count", ref])), fonte: `git rev-list em ${sha}` },
      migracoes: { valor: comando("git", ["ls-tree", "--name-only", `${ref}:supabase/migrations`]).split("\n").filter((f) => f.endsWith(".sql")).length, fonte: `supabase/migrations em ${sha}` },
    },
  }
  // Temporário e rename: uma queda no meio não deixa o JSON da home truncado.
  writeFileSync(`${out}.tmp`, `${JSON.stringify(numeros, null, 2)}\n`)
  renameSync(`${out}.tmp`, out)
  console.log(`gravado ${out}`)
}

main()
