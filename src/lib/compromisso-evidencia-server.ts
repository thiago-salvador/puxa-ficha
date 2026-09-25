import "server-only"

import { readFileSync } from "node:fs"

import falasCatalogo from "../../scripts/data/falas-candidatos.json"
import {
  estadoDasEvidencias,
  FONTE_RECIBO_PROMESSA,
  lerReciboPromessa,
  primeiraUrlDeFontes,
  TIPOS_EVIDENCIA_PUBLICA,
  urlSeguraDeFonte,
  type CompromissoEvidenciaPublica,
  type EstadoEvidenciasPrograma,
  type ReciboPromessaEvidencia,
  type RelacaoPublica,
  type TipoEvidenciaPublica,
} from "@/lib/compromisso-evidencia"
import type { CatalogoFalas } from "@/lib/falas-candidatos"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import { withSupabaseRetry } from "@/lib/supabase-retry"

type LinhaView = {
  id: string
  candidato_id: string
  programa_chave: string
  tema_id: string | null
  tipo_evidencia: string
  evidencia_ref: string
  relacao: string
}

type Cliente = ReturnType<typeof createServiceRoleSupabaseClient>

/**
 * Só em desenvolvimento local: linhas da view vindas de arquivo (a saída da
 * cascata), para ver a seção antes de a migration existir em produção. Os
 * detalhes continuam vindo das tabelas de origem. Em produção é ignorado.
 */
function linhasDeFixture(candidatoId: string): LinhaView[] | null {
  const caminho = process.env.PF_COMPROMISSO_EVIDENCIA_FIXTURE
  if (process.env.NODE_ENV !== "development" || !caminho) return null
  const linhas = JSON.parse(readFileSync(caminho, "utf8")) as LinhaView[]
  return linhas.filter((l) => l.candidato_id === candidatoId)
}

async function linhasDaView(db: Cliente, candidatoId: string): Promise<LinhaView[]> {
  const { data, error } = await withSupabaseRetry(
    `compromisso_evidencia_publica(${candidatoId})`,
    async (signal) => db
      .from("compromisso_evidencia_publica")
      .select("id,candidato_id,programa_chave,tema_id,tipo_evidencia,evidencia_ref,relacao")
      .eq("candidato_id", candidatoId)
      .abortSignal(signal),
  )
  if (error) throw error
  return (data ?? []) as LinhaView[]
}

const ehTipo = (valor: string): valor is TipoEvidenciaPublica => (TIPOS_EVIDENCIA_PUBLICA as readonly string[]).includes(valor)
const ehRelacao = (valor: string): valor is RelacaoPublica => valor === "relacionada" || valor === "sustenta"

async function porIds<T extends { id: string }>(db: Cliente, tabela: string, colunas: string, ids: string[]): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await withSupabaseRetry(
    `${tabela}(compromisso_evidencia)`,
    async (signal) => db.from(tabela).select(colunas).in("id", ids).abortSignal(signal),
  )
  if (error) throw error
  return new Map(((data ?? []) as unknown as T[]).map((linha) => [linha.id, linha]))
}

/**
 * Evidências públicas ligadas aos temas do programa do candidato. Lança em
 * falha de leitura: quem chama decide o estado `erro_leitura`, em vez de uma
 * lista vazia que a ficha leria como "nada encontrado".
 */
async function carregarItens(db: Cliente, candidatoId: string, programaChave: string): Promise<CompromissoEvidenciaPublica[]> {
  const linhas = (linhasDeFixture(candidatoId) ?? await linhasDaView(db, candidatoId))
    .filter((l) => l.programa_chave === programaChave && l.tema_id && ehTipo(l.tipo_evidencia) && ehRelacao(l.relacao))
  const refs = (tipo: TipoEvidenciaPublica) => [...new Set(linhas.filter((l) => l.tipo_evidencia === tipo).map((l) => l.evidencia_ref))]
  const [votos, projetos, posicoes, pontos] = await Promise.all([
    porIds<{ id: string; voto: string; votacao: { titulo: string; data_votacao: string | null; casa: string | null } | null }>(
      db, "votos_candidato", "id,voto,votacao:votacoes_chave(titulo,data_votacao,casa)", refs("votacao_chave")),
    porIds<{ id: string; tipo: string | null; numero: string | null; ano: number | null; ementa: string | null; url_inteiro_teor: string | null }>(
      db, "projetos_lei", "id,tipo,numero,ano,ementa,url_inteiro_teor", refs("projeto_lei")),
    porIds<{ id: string; tema: string; fonte: string | null; url_fonte: string | null; descricao: string | null; gerado_por: string | null }>(
      db, "posicoes_declaradas", "id,tema,fonte,url_fonte,descricao,gerado_por", refs("posicao_declarada")),
    porIds<{ id: string; titulo: string; fontes: Array<string | { url?: string }> | null; data_referencia: string | null; visivel: boolean | null }>(
      db, "pontos_atencao", "id,titulo,fontes,data_referencia,visivel", refs("contradicao")),
  ])
  const falas = new Map((falasCatalogo as unknown as CatalogoFalas).quotes.map((q) => [q.id, q]))
  const saida: CompromissoEvidenciaPublica[] = []
  for (const linha of linhas) {
    const base = { id: linha.id, temaId: linha.tema_id!, tipo: linha.tipo_evidencia as TipoEvidenciaPublica, relacao: linha.relacao as RelacaoPublica }
    if (linha.tipo_evidencia === "votacao_chave") {
      const voto = votos.get(linha.evidencia_ref)
      if (!voto?.votacao) continue
      saida.push({ ...base, referencia: `Voto: ${voto.voto}${voto.votacao.casa ? ` · ${voto.votacao.casa}` : ""}`, texto: voto.votacao.titulo, data: voto.votacao.data_votacao, url: null })
    } else if (linha.tipo_evidencia === "projeto_lei") {
      const projeto = projetos.get(linha.evidencia_ref)
      if (!projeto?.ementa) continue
      saida.push({ ...base, referencia: [projeto.tipo, projeto.numero && projeto.ano ? `${projeto.numero}/${projeto.ano}` : projeto.numero].filter(Boolean).join(" "), texto: projeto.ementa, data: projeto.ano ? String(projeto.ano) : null, url: urlSeguraDeFonte(projeto.url_inteiro_teor) })
    } else if (linha.tipo_evidencia === "posicao_declarada") {
      const posicao = posicoes.get(linha.evidencia_ref)
      // Texto de posição só aparece quando veio de curadoria, nunca de geração automática.
      if (!posicao?.descricao || posicao.gerado_por !== "curadoria") continue
      saida.push({ ...base, referencia: posicao.fonte ?? "", texto: posicao.descricao, data: null, url: urlSeguraDeFonte(posicao.url_fonte) })
    } else if (linha.tipo_evidencia === "fala") {
      const fala = falas.get(linha.evidencia_ref)
      if (!fala) continue
      saida.push({ ...base, referencia: fala.publisher ?? "", texto: fala.quote_text, data: fala.occurred_on ?? fala.occurred_between?.from ?? null, url: urlSeguraDeFonte(fala.article_url) })
    } else {
      const ponto = pontos.get(linha.evidencia_ref)
      if (!ponto || ponto.visivel === false) continue
      saida.push({ ...base, referencia: "", texto: ponto.titulo, data: ponto.data_referencia, url: primeiraUrlDeFontes(ponto.fontes) })
    }
  }
  return saida
}

/**
 * Só em desenvolvimento local: recibos por slug vindos de arquivo, para ver os
 * estados da seção antes de o publicador gravá-los. Em produção é ignorado.
 */
function reciboDeFixture(slug: string): { linha: unknown } | null {
  const caminho = process.env.PF_COMPROMISSO_RECIBO_FIXTURE
  if (process.env.NODE_ENV !== "development" || !caminho) return null
  const recibos = JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>
  return { linha: recibos[slug] ?? null }
}

/** Último recibo do processamento promessa x evidência para o slug. Lança em erro de leitura. */
async function carregarRecibo(db: Cliente, slug: string, candidatoId: string): Promise<ReciboPromessaEvidencia | null> {
  const fixture = reciboDeFixture(slug)
  if (fixture) return lerReciboPromessa(fixture.linha)
  const { data, error } = await withSupabaseRetry(
    `coleta_log_ultima(${FONTE_RECIBO_PROMESSA}:${slug})`,
    async (signal) => db
      .from("coleta_log_ultima")
      .select("candidato_id,resultado,executado_em,detalhe")
      .eq("fonte", FONTE_RECIBO_PROMESSA)
      .eq("escopo", "candidato")
      .eq("alvo", slug)
      .eq("candidato_id", candidatoId)
      .abortSignal(signal)
      .maybeSingle(),
  )
  if (error) throw error
  return lerReciboPromessa(data)
}

/**
 * Estado da seção "Evidências relacionadas" para um programa aprovado. Nunca
 * lança: erro de leitura vira `erro_leitura`, que a ficha mostra como tal. A
 * view e o recibo são lidos em paralelo.
 */
export async function getCompromissoEvidenciasEstado(
  input: { candidatoId: string; slug: string; programaChave: string },
  /** Só para teste: cliente substituto. */
  deps: { criarCliente?: () => Cliente } = {},
): Promise<EstadoEvidenciasPrograma> {
  let db: Cliente
  try {
    db = (deps.criarCliente ?? (() => createServiceRoleSupabaseClient({ cacheMode: "isr" })))()
  } catch {
    return { estado: "erro_leitura" }
  }
  const [itens, recibo] = await Promise.allSettled([
    carregarItens(db, input.candidatoId, input.programaChave),
    carregarRecibo(db, input.slug, input.candidatoId),
  ])
  return estadoDasEvidencias({
    itens: itens.status === "fulfilled" ? itens.value : null,
    recibo: recibo.status === "fulfilled" ? recibo.value : null,
    reciboFalhou: recibo.status === "rejected",
    programaChave: input.programaChave,
  })
}
