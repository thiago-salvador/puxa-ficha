/**
 * Quando a coleta judicial agendada cai antes de produzir evidência por falha
 * que não é da fonte oficial (código, banco, checkpoint), grava um recibo
 * `erro` para os alvos do snapshot sem recibo ou cujo último recibo já é
 * `erro`. Recibo válido nunca é rebaixado, e falha de acesso à fonte não grava
 * nada (ver FALHAS_DE_FONTE): a próxima execução tenta de novo.
 *
 * Padrão dry-run. `--apply` grava pelo registrador canônico, um alvo por vez.
 *
 *   tsx scripts/registrar-erro-coleta-processos.ts \
 *     --snapshot=<evidence>.snapshot.json --tipo=fonte_indisponivel --modo=vencendo [--apply]
 */
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { main as registrarRevisao, validarRevisaoManual } from "./registrar-revisao-curadoria"

const URL_DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"

export function slugsDoSnapshot(valor: unknown): string[] {
  if (!valor || typeof valor !== "object") throw new Error("snapshot invalido: objeto esperado")
  const registro = valor as Record<string, unknown>
  if (registro.schema_version !== 1) throw new Error("snapshot invalido: schema_version 1 esperado")
  if (!Array.isArray(registro.alvos)) throw new Error("snapshot invalido: alvos[] esperado")
  const slugs = registro.alvos.map((alvo, indice) => {
    const slug = alvo && typeof alvo === "object" ? (alvo as Record<string, unknown>).slug : undefined
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`snapshot invalido: alvos[${indice}].slug`)
    }
    return slug
  })
  if (new Set(slugs).size !== slugs.length) throw new Error("snapshot invalido: slug repetido")
  return slugs
}

/**
 * Falhas de acesso à fonte oficial (limite, bloqueio, indisponibilidade, tempo,
 * DNS, rede). Nelas a coleta falha fechada: nenhum recibo `erro` é gravado, os
 * recibos existentes ficam como estão e a próxima execução tenta de novo.
 */
export const FALHAS_DE_FONTE: ReadonlySet<string> = new Set([
  "limite_de_taxa", "bloqueio_http", "fonte_indisponivel", "tempo_esgotado", "dns", "rede",
])

/**
 * Quais alvos podem ganhar recibo `erro`. Nunca rebaixa: só alvo sem recibo
 * (`ultimo_recibo: null`) ou cujo último recibo já é `erro`. Alvo sem o campo
 * no snapshot conta como desconhecido e fica de fora.
 */
export function planejarRecibosErro(valor: unknown, tipo: string): { slugs: string[]; mantidos: number; motivo: string | null } {
  const slugs = slugsDoSnapshot(valor)
  if (FALHAS_DE_FONTE.has(tipo)) {
    return { slugs: [], mantidos: slugs.length, motivo: "fonte oficial indisponivel: recibos existentes mantidos, nenhum recibo erro gravado" }
  }
  const alvos = (valor as { alvos: Array<Record<string, unknown>> }).alvos
  const permitidos = slugs.filter((_, indice) => {
    const alvo = alvos[indice]
    if (!("ultimo_recibo" in alvo)) return false
    const ultimo = alvo.ultimo_recibo
    if (ultimo === null) return true
    return Boolean(ultimo && typeof ultimo === "object" && (ultimo as Record<string, unknown>).resultado === "erro")
  })
  return {
    slugs: permitidos,
    mantidos: slugs.length - permitidos.length,
    motivo: permitidos.length < slugs.length ? "alvos com recibo nao-erro mantidos sem rebaixar" : null,
  }
}

export const TIPOS_FALHA: Readonly<Record<string, string>> = Object.freeze({
  limite_de_taxa: "fonte oficial respondeu com limite de taxa (HTTP 429) repetido; disjuntor aberto",
  bloqueio_http: "fonte oficial recusou o acesso (HTTP 401, 403 ou 407) a partir do executor da coleta",
  fonte_indisponivel: "fonte oficial (DJEN ou DataJud) indisponivel, com erro HTTP ou tentativas esgotadas",
  tempo_esgotado: "fonte oficial nao respondeu dentro do tempo limite",
  dns: "falha de resolucao de nome ao acessar a fonte oficial",
  rede: "falha de conexao de rede com a fonte oficial",
  resposta_invalida: "fonte oficial devolveu resposta em formato inesperado ou incompleta",
  preflight_banco: "leitura da coorte ou dos recibos no banco falhou antes da busca",
  identidade_tse: "base de candidaturas do TSE indisponivel para confirmar a identidade",
  checkpoint: "gravacao da evidencia local da coleta falhou",
  erro_codigo: "erro interno do coletor",
  outro: "falha nao classificada; ver log privado da execucao",
  sem_classificacao: "coleta caiu sem registrar o tipo de falha",
})

export function argumentosErro(slug: string, tipo: string, modo: string, agora: Date = new Date()): string[] {
  const descricao = TIPOS_FALHA[tipo]
  if (!descricao) throw new Error(`--tipo invalido: ${tipo}`)
  if (!/^[a-z-]{3,20}$/.test(modo)) throw new Error("--modo invalido")
  const data = agora.toISOString().slice(0, 10)
  const args = [
    `--slug=${slug}`,
    "--frente=processos",
    `--data=${data}`,
    "--resultado=erro",
    `--detalhe=motivo: coleta judicial agendada (${modo}) interrompida antes do resultado: ${descricao}; tipo_falha: ${tipo}; fontes consultadas: DJEN, DataJud; anos consultados: ${data.slice(0, 4)}`,
    "--identidade=nao-confirmada",
    `--url=${URL_DJEN}`,
  ]
  validarRevisaoManual([...args, "--dry-run"])
  return args
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const snapshot = argv.find((arg) => arg.startsWith("--snapshot="))?.slice("--snapshot=".length)
  const tipo = argv.find((arg) => arg.startsWith("--tipo="))?.slice("--tipo=".length)
  const modo = argv.find((arg) => arg.startsWith("--modo="))?.slice("--modo=".length)
  if (!snapshot || !tipo || !modo) throw new Error("uso: --snapshot=<arquivo> --tipo=<enum> --modo=<modo> [--apply]")
  const apply = argv.includes("--apply")
  if (!TIPOS_FALHA[tipo]) throw new Error(`--tipo invalido: ${tipo}`)
  const plano = planejarRecibosErro(JSON.parse(readFileSync(snapshot, "utf8")), tipo)
  const planos = plano.slugs.map((slug) => argumentosErro(slug, tipo, modo))
  if (apply) {
    for (const args of planos) await registrarRevisao([...args, "--apply"])
  }
  // Só contagem: o log do Actions é público.
  console.log(JSON.stringify({ modo: apply ? "apply" : "dry-run", recibos_erro: planos.length, mantidos: plano.mantidos, motivo: plano.motivo }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
