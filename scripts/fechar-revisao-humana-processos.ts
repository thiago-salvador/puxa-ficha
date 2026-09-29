/**
 * Fecha uma revisão humana aberta pelo aplicador de processos (confirmação
 * editorial em conflito com a coleta nova).
 *
 * O padrão é dry-run. `--apply` grava o recibo final `nao_aplicavel` em
 * `processos-revisao-humana` só quando o último recibo dessa fonte para o alvo
 * está pendente (`indeterminado`), e confere depois pela `coleta_log_ultima`.
 * A decisão sobre o CNJ vai ao recibo judicial pelo registrador
 * (`data:curadoria:registrar`); este comando não altera processos nem o recibo
 * judicial.
 *
 * Exemplo:
 *   npm run data:curadoria:fechar-revisao -- --slug=fulano \
 *     --cnj=0000001-00.2026.8.13.0001:mantido --decidido-por="Thiago Salvador" \
 *     --decidido-em=2026-10-05 --apply
 */
import { pathToFileURL } from "node:url"

import {
  entradaFechamentoRevisaoHumana,
  FONTE_REVISAO_HUMANA,
  type DecisaoRevisaoHumana,
} from "./aplicar-evidencia-processos-curadoria"
import { registrarColetaOuFalhar } from "./lib/coleta-log"
import { supabase } from "./lib/supabase"

function valor(argv: string[], nome: string): string {
  const achados = argv.filter((arg) => arg.startsWith(`--${nome}=`))
  if (achados.length !== 1) throw new Error(`--${nome} obrigatorio e unico`)
  return achados[0].slice(nome.length + 3).trim()
}

export function lerFechamento(argv: string[]): { slug: string; decisoes: DecisaoRevisaoHumana[]; decididoPor: string; decididoEm: string; apply: boolean } {
  const conhecidas = /^--(?:slug|cnj|decidido-por|decidido-em)=|^--(?:apply|dry-run)$/
  const desconhecida = argv.find((arg) => !conhecidas.test(arg))
  if (desconhecida) throw new Error(`flag desconhecida: ${desconhecida}`)
  if (argv.includes("--apply") && argv.includes("--dry-run")) throw new Error("use --apply ou --dry-run, nunca os dois")
  const decisoes = argv.filter((arg) => arg.startsWith("--cnj=")).map((arg) => {
    const [numero_cnj, decisao] = arg.slice("--cnj=".length).split(":")
    return { numero_cnj: (numero_cnj ?? "").trim(), decisao: (decisao ?? "").trim() as DecisaoRevisaoHumana["decisao"] }
  })
  return { slug: valor(argv, "slug"), decisoes, decididoPor: valor(argv, "decidido-por"), decididoEm: valor(argv, "decidido-em"), apply: argv.includes("--apply") }
}

async function ultimoControle(slug: string): Promise<{ resultado: string; detalhe: string | null } | null> {
  const { data, error } = await supabase.from("coleta_log_ultima")
    .select("resultado,detalhe")
    .eq("fonte", FONTE_REVISAO_HUMANA).eq("escopo", "candidato").eq("alvo", slug)
    .maybeSingle()
  if (error) throw new Error(`leitura de ${FONTE_REVISAO_HUMANA}: ${error.message}`)
  return data as { resultado: string; detalhe: string | null } | null
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const opcoes = lerFechamento(argv)
  const entrada = entradaFechamentoRevisaoHumana(opcoes.slug, opcoes.decisoes, opcoes.decididoPor, opcoes.decididoEm)
  if (!opcoes.apply) {
    console.log(JSON.stringify({ modo: "dry-run", fonte: entrada.fonte, alvo: entrada.alvo, resultado: entrada.resultado, detalhe: entrada.detalhe }, null, 2))
    return
  }
  const pendente = await ultimoControle(opcoes.slug)
  if (pendente?.resultado !== "indeterminado") throw new Error(`nenhuma revisao humana pendente para ${opcoes.slug}`)
  await registrarColetaOuFalhar(entrada)
  const depois = await ultimoControle(opcoes.slug)
  const conferido = depois?.resultado === entrada.resultado && depois?.detalhe === entrada.detalhe
  console.log(JSON.stringify({ modo: "apply", alvo: entrada.alvo, resultado: entrada.resultado, readback: conferido }))
  if (!conferido) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
