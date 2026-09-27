import {
  validateRepresentacoesEticaDataset,
  type RepresentacaoEticaAprovada,
} from "../../src/lib/representacoes-etica"
import type { Fila, ItemFila } from "./representacoes-etica-coleta"
import { FASES_SO_REVISAO_HUMANA } from "../../src/lib/representacoes-etica-fase"

export const MONITOR_REPRESENTACOES_SCHEMA_VERSION = 1 as const

export type RepresentacaoCamaraPublicada = Extract<RepresentacaoEticaAprovada, { casa: "camara" }>

export function isRepresentacaoCamaraPublicada(item: RepresentacaoEticaAprovada): item is RepresentacaoCamaraPublicada {
  return item.casa === "camara"
}

export interface AlertaRepresentacaoEtica {
  id: string
  estado: "mudanca_detectada" | "revisar_vinculo"
  motivos: string[]
  publicado: Pick<RepresentacaoCamaraPublicada, "candidate_slug" | "deputado_id" | "proposicao" | "fase" | "ultimo_andamento_em" | "verificado_em">
  atual: null | {
    candidate_slug: string
    deputado_id: number
    fase_sugerida: string | null
    fase_sugerida_label: string | null
    ultimo_andamento: ItemFila["ultimo_andamento"]
    despachos_para_revisao: ItemFila["despachos_para_revisao"]
    verificado_em: string
    url_oficial: string
  }
}

export interface FilaRevisaoMudancas {
  schema_version: typeof MONITOR_REPRESENTACOES_SCHEMA_VERSION
  fonte: "camara-dadosabertos-v2"
  gerado_em: string
  itens_publicados_verificados: number
  alertas: AlertaRepresentacaoEtica[]
}

/**
 * Compara remontagens atuais com a publicação aprovada. É função pura: não
 * grava dataset nem decide qual fase deve ser publicada.
 */
export function montarFilaDeMudancas(
  dataset: unknown,
  filaAtual: Pick<Fila, "itens">,
  geradoEm: string,
  semRemontagem: ReadonlySet<string> = new Set(),
): FilaRevisaoMudancas {
  const validado = validateRepresentacoesEticaDataset(dataset)
  if (validado.issues.length > 0) {
    throw new Error(`dataset publicado inválido: ${validado.issues.map((i) => `#${i.index} ${i.motivo}`).join("; ")}`)
  }

  const atuais = new Map(filaAtual.itens.map((item) => [item.id, item]))
  const alertas: AlertaRepresentacaoEtica[] = []

  const publicadosCamara = validado.itens.filter(isRepresentacaoCamaraPublicada)
  for (const publicado of publicadosCamara) {
    const fonte = atuais.get(publicado.id)
    if (!fonte || semRemontagem.has(publicado.id)) {
      alertas.push({
        id: publicado.id,
        estado: "revisar_vinculo",
        motivos: ["item publicado não foi remontado com identidade confirmada nas fontes atuais"],
        publicado: resumirPublicado(publicado),
        atual: fonte ? resumirAtual(fonte) : null,
      })
      continue
    }

    const vinculosAlterados: string[] = []
    if (fonte.candidato.slug !== publicado.candidate_slug) vinculosAlterados.push("vínculo candidato mudou")
    if (fonte.deputado.id !== publicado.deputado_id) vinculosAlterados.push("vínculo deputado mudou")
    if (vinculosAlterados.length > 0) {
      alertas.push({
        id: publicado.id,
        estado: "revisar_vinculo",
        motivos: vinculosAlterados,
        publicado: resumirPublicado(publicado),
        atual: resumirAtual(fonte),
      })
      continue
    }

    // A fase publicada é um rótulo editorial; sem baseline da sugestão na
    // aprovação, só uma nova data de andamento prova mudança desde a publicação.
    // O dataset guarda a data, não texto/id do andamento; avanços no mesmo dia
    // não são distinguíveis até uma futura versão registrar essa impressão digital.
    const motivos: string[] = []
    const movimentoMudou = (fonte.ultimo_andamento?.data ?? null) !== publicado.ultimo_andamento_em
    if (movimentoMudou) {
      motivos.push("data do último andamento mudou")
      if (!FASES_SO_REVISAO_HUMANA.has(publicado.fase) && (fonte.fase_sugerida?.fase ?? null) !== publicado.fase) {
        motivos.push("fase sugerida diverge após movimento")
      }
    }
    if (motivos.length > 0) {
      alertas.push({
        id: publicado.id,
        estado: "mudanca_detectada",
        motivos,
        publicado: resumirPublicado(publicado),
        atual: resumirAtual(fonte),
      })
    }
  }

  return {
    schema_version: MONITOR_REPRESENTACOES_SCHEMA_VERSION,
    fonte: "camara-dadosabertos-v2",
    gerado_em: geradoEm,
    itens_publicados_verificados: publicadosCamara.length,
    alertas,
  }
}

function resumirPublicado(item: RepresentacaoCamaraPublicada): AlertaRepresentacaoEtica["publicado"] {
  return {
    candidate_slug: item.candidate_slug,
    deputado_id: item.deputado_id,
    proposicao: item.proposicao,
    fase: item.fase,
    ultimo_andamento_em: item.ultimo_andamento_em,
    verificado_em: item.verificado_em,
  }
}

function resumirAtual(item: ItemFila): NonNullable<AlertaRepresentacaoEtica["atual"]> {
  return {
    candidate_slug: item.candidato.slug,
    deputado_id: item.deputado.id,
    fase_sugerida: item.fase_sugerida?.fase ?? null,
    fase_sugerida_label: item.fase_sugerida_label,
    ultimo_andamento: item.ultimo_andamento,
    despachos_para_revisao: item.despachos_para_revisao,
    verificado_em: item.verificado_em,
    url_oficial: item.representacao.url_oficial,
  }
}
