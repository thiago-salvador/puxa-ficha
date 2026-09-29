/**
 * Pontos de gancho do Jev para despesas (execução em sombra, fora deste módulo).
 *
 * Monta o `state` de dois julgamentos a partir do resultado do normalizador:
 *  - `destinatario_candidato`: doações sem SQ oficial do destinatário;
 *  - `categoria_nao_informada`: linhas "Não informada" com descrição livre.
 *
 * O state leva só flags calculadas em código e texto com sequências de 11 e 14
 * dígitos removidas. Nenhum documento, SQ ou identificador numérico longo sai
 * daqui; a função falha se algum escapar. Nada neste módulo chama a API do Jev
 * nem publica vínculo: o resultado da sombra serve só para revisão.
 */

import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { removerDocumentosDoTexto } from "../../src/lib/financiamento-despesas-contrato"
import { assertOutsideRepository } from "../audit/lib/private-output"
import { textoTemDocumento, type ResultadoNormalizacao } from "./despesas-normalizar"

export const VERSAO_ESTADO_JEV_DESPESAS = "despesas-jev/v1"

export interface EstadoJevDespesasCandidatura {
  /** Referência opaca da candidatura (hash curto do SQ), sem o SQ em si. */
  candidatura_ref: string
  ano_eleicao: number
  doacoes_sem_sq: Array<{
    ref: string
    destinatario_tipo_regra: "candidato" | "partido" | "outro"
    destinatario_nome: string | null
    contexto_prestador: string | null
    flags: {
      documento_fornecedor: "PJ" | "PF" | "ausente"
      nome_parece_partido: boolean
      nome_parece_campanha: boolean
      tem_sq_oficial: false
    }
    valor: number
  }>
  categorias_nao_informadas: Array<{
    ref: string
    /** Null quando o fornecedor é pessoa física: texto livre pode identificá-la. */
    descricao: string | null
    fornecedor_nome: string | null
    flags: { tipo_original: "vazio" | "sentinela"; documento_fornecedor: "PJ" | "PF" | "ausente" }
    valor: number
  }>
  categorias_conhecidas: string[]
}

export interface EstadoJevDespesas {
  versao: typeof VERSAO_ESTADO_JEV_DESPESAS
  julgamentos: ["destinatario_candidato", "categoria_nao_informada"]
  candidaturas: EstadoJevDespesasCandidatura[]
}

function refOpaca(...partes: Array<string | number>): string {
  // Só letras a-f e dígitos, 10 caracteres: nunca forma 11 dígitos seguidos.
  return createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 10)
}

function limpar<T>(valor: T): T {
  if (typeof valor === "string") return removerDocumentosDoTexto(valor) as T
  if (Array.isArray(valor)) return valor.map((item) => limpar(item)) as T
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, limpar(item)])) as T
  }
  return valor
}

/**
 * Falha se qualquer texto do state tiver 11 dígitos ou mais, inclusive separados
 * por espaço, ponto, barra ou hífen (CPF, CNPJ, SQ longo). Recebe o objeto, não o
 * JSON: cada texto é conferido sozinho e o ponto decimal de um valor não conta.
 */
export function assertEstadoSemDocumento(estado: unknown): void {
  if (textoTemDocumento(estado)) {
    throw new Error("state do Jev contém sequência de 11 a 14 dígitos; nada gravado")
  }
}

export function montarEstadoJevCandidatura(
  entrada: { ano_eleicao: number; sq_candidato: string; resultado: ResultadoNormalizacao },
): EstadoJevDespesasCandidatura | null {
  const { doacoes_sem_sq, categorias_nao_informadas, categorias_conhecidas } = entrada.resultado.pendencias_jev
  if (!doacoes_sem_sq.length && !categorias_nao_informadas.length) return null
  const candidatura = refOpaca(entrada.ano_eleicao, entrada.sq_candidato)
  const estado: EstadoJevDespesasCandidatura = {
    candidatura_ref: candidatura,
    ano_eleicao: entrada.ano_eleicao,
    doacoes_sem_sq: doacoes_sem_sq.map((p) => ({
      ref: refOpaca(candidatura, "doacao", p.indice),
      destinatario_tipo_regra: p.destinatario_tipo_regra,
      destinatario_nome: p.documento === "PF" ? null : p.destinatario_nome,
      contexto_prestador: p.contexto_prestador,
      flags: {
        documento_fornecedor: p.documento,
        nome_parece_partido: p.nome_parece_partido,
        nome_parece_campanha: p.nome_parece_campanha,
        tem_sq_oficial: false,
      },
      valor: p.valor,
    })),
    categorias_nao_informadas: categorias_nao_informadas.map((p) => ({
      ref: refOpaca(candidatura, "categoria", p.indice),
      descricao: p.documento === "PF" ? null : p.descricao,
      fornecedor_nome: p.documento === "PJ" ? p.fornecedor_nome : null,
      flags: { tipo_original: p.tipo_original, documento_fornecedor: p.documento },
      valor: p.valor,
    })),
    categorias_conhecidas: [...categorias_conhecidas],
  }
  const limpo = limpar(estado)
  assertEstadoSemDocumento(limpo)
  return limpo
}

export function montarEstadoJevDespesas(
  entradas: ReadonlyArray<{ ano_eleicao: number; sq_candidato: string; resultado: ResultadoNormalizacao }>,
): EstadoJevDespesas {
  const estado: EstadoJevDespesas = {
    versao: VERSAO_ESTADO_JEV_DESPESAS,
    julgamentos: ["destinatario_candidato", "categoria_nao_informada"],
    candidaturas: entradas.flatMap((entrada) => {
      const item = montarEstadoJevCandidatura(entrada)
      return item ? [item] : []
    }),
  }
  assertEstadoSemDocumento(estado)
  return estado
}

/** Grava o state para a rodada de sombra: fora do repositório, modo 0600. */
export function gravarEstadoJevDespesas(caminho: string, estado: EstadoJevDespesas): string {
  assertEstadoSemDocumento(estado)
  const destino = resolve(assertOutsideRepository(caminho, "state do Jev de despesas"))
  mkdirSync(dirname(destino), { recursive: true, mode: 0o700 })
  writeFileSync(destino, `${JSON.stringify(estado, null, 2)}\n`, { mode: 0o600 })
  chmodSync(destino, 0o600)
  return destino
}
