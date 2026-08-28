import type {
  FichaCandidato,
  Financiamento,
  HistoricoPolitico,
  LegislacaoMandatoExecutivo,
  MudancaPartido,
  Patrimonio,
  PatrimonioEleicaoPublico,
  Processo,
  ProjetoLei,
  PontoAtencao,
  SancaoAdministrativa,
  VotoCandidato,
} from "@/lib/types"
import {
  buildCargoDisputadoProvenienceNote,
  resolveCargoDisputadoProveniencia,
} from "@/lib/candidatura-proveniencia"
import { anosDePleitoDisputado } from "@/lib/pleitos-disputados"
import { buildFinanciamentoEleicoes } from "@/lib/financiamento-eleicoes"
import { processoPodeContarComoCriminal } from "@/lib/processos-display"
import { pareceNomeDeInstituicao } from "@/lib/formacao-display"
import { sanitizePublicText } from "@/lib/public-text"
import { formatProcessSummaryLabel } from "@/lib/ui-labels"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import {
  maskDocumentLikeSequences,
  sanitizeFontePublica,
  sanitizeObservacaoPublica,
} from "@/lib/observacao-publica"

const FORBIDDEN_PUBLIC_PROFILE_KEY_RE =
  /(?:cpf|cnpj|documento|email|telefone|token|secret)/i

export { maskDocumentLikeSequences } from "@/lib/observacao-publica"

function maskNullableText(value: string | null | undefined): string | null {
  if (value == null) return null
  return replaceInternalEditorialJargon(value)
}

const WIKIDATA_QID_ONLY_RE = /^Q\d+$/i

function replaceInternalEditorialJargon(value: string): string {
  // Fonte única em `observacao-publica.ts`: tira o rótulo SQ_CANDIDATO E o
  // número, que antes sobrevivia sozinho na ficha.
  return sanitizePublicText(sanitizeObservacaoPublica(value) ?? "")
}

function publicTaxonomyValue(value: string | null | undefined): string | null {
  if (value == null) return null
  const sanitized = replaceInternalEditorialJargon(value).trim()
  if (!sanitized || WIKIDATA_QID_ONLY_RE.test(sanitized)) return null
  if (sanitized.length > 4 && sanitized === sanitized.toLocaleUpperCase("pt-BR")) {
    const lower = sanitized.toLocaleLowerCase("pt-BR")
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1)
  }
  return sanitized
}

function hashPublicId(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function compactPublicId(prefix: string, source: string | null | undefined, index: number) {
  return `${prefix}-${index + 1}-${hashPublicId(source ?? `${prefix}-${index}`)}`
}

function publicHistorico(row: HistoricoPolitico, index: number) {
  return {
    id: compactPublicId("hist", row.id, index),
    cargo: row.cargo,
    cargo_canonico: row.cargo_canonico ?? null,
    tipo_evento: row.tipo_evento ?? null,
    periodo_inicio: row.periodo_inicio,
    periodo_fim: row.periodo_fim,
    partido: row.partido,
    estado: row.estado,
    eleito_por: row.eleito_por,
    observacoes: maskNullableText(row.observacoes),
    proveniencia: row.proveniencia == null
      ? null
      : replaceInternalEditorialJargon(row.proveniencia),
  }
}

function publicMudancaPartido(row: MudancaPartido, index: number) {
  return {
    id: compactPublicId("mud", row.id, index),
    partido_anterior: row.partido_anterior,
    partido_novo: row.partido_novo,
    data_mudanca: row.data_mudanca,
    ano: row.ano,
    contexto: maskNullableText(row.contexto),
  }
}

function publicPatrimonio(row: Patrimonio, index: number) {
  return {
    id: compactPublicId("pat", row.id, index),
    ano_eleicao: row.ano_eleicao,
    valor_total: row.valor_total,
    bens: (row.bens ?? []).map((bem) => ({
      tipo: sanitizePublicText(bem.tipo),
      descricao: replaceInternalEditorialJargon(bem.descricao ?? ""),
      valor: bem.valor,
    })),
  }
}

export type { PatrimonioEleicaoEstado, PatrimonioEleicaoPublico } from "@/lib/types"

/** Série bem_candidato nos dados abertos do TSE começa em 2006. */
export const PATRIMONIO_ANO_INICIAL_APLICAVEL = 2006

/**
 * Estado de patrimônio por eleição aplicável (>= 2006). A ficha não pode
 * ocultar o ano em que o candidato disputou eleição sem dado: ou o bem está
 * publicado, ou a ausência foi confirmada no pacote oficial do TSE, ou a
 * coleta ainda não aconteceu. Cada caso tem estado próprio, nunca um vazio
 * silencioso.
 */
export function buildPatrimonioEleicoes(
  patrimonio: ReadonlyArray<{ ano_eleicao: number }>,
  ausenciasOficiais: ReadonlyArray<{
    ano_eleicao: number
    fonte_url?: string | null
    verificado_em?: string | null
  }>,
  historico: ReadonlyArray<{
    periodo_inicio?: number | null
    periodo_fim?: number | null
    proveniencia?: string | null
    cargo?: string | null
    eleito_por?: string | null
    observacoes?: string | null
  }>,
): PatrimonioEleicaoPublico[] {
  const anos = new Set<number>()
  for (const row of patrimonio) {
    if (row.ano_eleicao >= PATRIMONIO_ANO_INICIAL_APLICAVEL) anos.add(row.ano_eleicao)
  }
  for (const ausencia of ausenciasOficiais) {
    if (ausencia.ano_eleicao >= PATRIMONIO_ANO_INICIAL_APLICAVEL) anos.add(ausencia.ano_eleicao)
  }
  // Âncora única de "pleito disputado", compartilhada com financiamento em
  // `pleitos-disputados.ts`. Duas cópias da regra dariam duas respostas para a
  // mesma pergunta nas duas abas.
  for (const ano of anosDePleitoDisputado(historico, PATRIMONIO_ANO_INICIAL_APLICAVEL)) {
    anos.add(ano)
  }

  const anosPublicados = new Set(patrimonio.map((row) => row.ano_eleicao))
  const ausenciaPorAno = new Map(ausenciasOficiais.map((ausencia) => [ausencia.ano_eleicao, ausencia]))

  return [...anos]
    .sort((a, b) => b - a)
    .map((ano) => {
      if (anosPublicados.has(ano)) {
        return { ano, estado: "publicado", fonte_url: null, verificado_em: null }
      }
      const ausencia = ausenciaPorAno.get(ano)
      if (ausencia) {
        return {
          ano,
          estado: "vazio_confirmado",
          fonte_url: ausencia.fonte_url ?? null,
          verificado_em: ausencia.verificado_em ?? null,
        }
      }
      return { ano, estado: "nao_coletado", fonte_url: null, verificado_em: null }
    })
}

function ehPatrimonioEleicaoPublico(item: unknown): item is PatrimonioEleicaoPublico {
  if (!item || typeof item !== "object") return false
  const candidato = item as PatrimonioEleicaoPublico
  if (typeof candidato.ano !== "number") return false
  return (
    candidato.estado === "publicado" ||
    candidato.estado === "vazio_confirmado" ||
    candidato.estado === "nao_coletado"
  )
}

/**
 * Ponto ÚNICO de leitura da série de patrimônio por eleição. Toda superfície
 * (ficha, visão geral, embed) passa por aqui, e nenhuma recompõe por conta
 * própria.
 *
 * A regra é: se a ficha já traz a série composta, ela vence. Recompor sobre o
 * payload que o browser recebe é o defeito que esta função existe para fechar,
 * porque o DTO publica `patrimonio_eleicoes` e NÃO publica
 * `patrimonio_ausencias_oficiais`. Sem os insumos, `buildPatrimonioEleicoes`
 * não tem como saber que a ausência foi conferida no pacote oficial do TSE e
 * rebaixa toda ausência confirmada (com fonte e data) para "ainda não
 * coletado". Em 2026-08-10 isso valia para 39 das 194 fichas públicas.
 *
 * A recomposição fica como fallback para ficha montada à mão (readback, teste,
 * preview sobre a view interna), onde os insumos crus estão presentes e o campo
 * composto não.
 */
export function resolvePatrimonioEleicoes(
  ficha: Pick<FichaCandidato, "patrimonio" | "patrimonio_ausencias_oficiais" | "historico"> & {
    patrimonio_eleicoes?: unknown
  },
): PatrimonioEleicaoPublico[] {
  const composta = ficha.patrimonio_eleicoes
  if (Array.isArray(composta)) return composta.filter(ehPatrimonioEleicaoPublico)
  return buildPatrimonioEleicoes(
    ficha.patrimonio ?? [],
    ficha.patrimonio_ausencias_oficiais ?? [],
    ficha.historico ?? [],
  )
}

function publicFinanciamento(row: Financiamento, index: number) {
  return {
    id: compactPublicId("fin", row.id, index),
    ano_eleicao: row.ano_eleicao,
    total_arrecadado: row.total_arrecadado,
    total_fundo_partidario: row.total_fundo_partidario,
    total_fundo_eleitoral: row.total_fundo_eleitoral,
    total_pessoa_fisica: row.total_pessoa_fisica,
    total_recursos_proprios: row.total_recursos_proprios,
    categorias_origem: row.categorias_origem ?? null,
    maiores_doadores: (row.maiores_doadores ?? []).map((doador) => ({
      nome: doador.nome,
      valor: doador.valor,
      tipo: doador.tipo,
    })),
  }
}

function publicVoto(row: VotoCandidato, index: number) {
  return {
    id: compactPublicId("voto", row.id, index),
    votacao_id: row.votacao_id,
    voto: row.voto,
    contradicao: row.contradicao,
    contradicao_descricao: maskNullableText(row.contradicao_descricao),
    votacao: row.votacao
      ? {
          id: compactPublicId("votacao", row.votacao.id, index),
          titulo: row.votacao.titulo,
          descricao: maskDocumentLikeSequences(row.votacao.descricao),
          data_votacao: row.votacao.data_votacao,
          casa: row.votacao.casa,
          tema: row.votacao.tema,
          impacto_popular: row.votacao.impacto_popular,
          proposicao_id: row.votacao.proposicao_id ?? null,
        }
      : undefined,
  }
}

function publicProcesso(row: Processo, index: number) {
  return {
    id: compactPublicId("proc", row.id, index),
    tipo: row.tipo,
    tribunal: row.tribunal,
    numero_processo: row.numero_processo,
    descricao: formatProcessSummaryLabel(replaceInternalEditorialJargon(row.descricao ?? "")),
    status: row.status,
    data_inicio: row.data_inicio,
    data_decisao: row.data_decisao,
    gravidade: row.gravidade,
    fonte: row.fonte ?? null,
    url_fonte: row.url_fonte ?? null,
  }
}

function publicPontoAtencao(row: PontoAtencao, index: number) {
  return {
    id: compactPublicId("ponto", row.id, index),
    categoria: row.categoria,
    titulo: row.titulo,
    descricao: replaceInternalEditorialJargon(row.descricao ?? ""),
    fontes: (row.fontes ?? []).map((fonte) => ({
      titulo: replaceInternalEditorialJargon(fonte.titulo),
      url: fonte.url,
      url_archive: fonte.url_archive,
      data: fonte.data,
    })),
    gravidade: row.gravidade,
    visivel: row.visivel,
    verificado: row.verificado,
    gerado_por: row.gerado_por,
    data_referencia: row.data_referencia ?? null,
  }
}

function publicProjetoLei(row: ProjetoLei, index: number) {
  return {
    id: compactPublicId("pl", row.id, index),
    tipo: row.tipo,
    numero: row.numero,
    ano: row.ano,
    ementa: maskNullableText(row.ementa),
    tema: row.tema,
    situacao: row.situacao,
    url_inteiro_teor: row.url_inteiro_teor,
    destaque: row.destaque,
    destaque_motivo: maskNullableText(row.destaque_motivo),
    coverage_id: row.coverage_id ?? null,
  }
}

function publicLegislacaoMetadata(metadata: Record<string, unknown> | null | undefined) {
  const coverageId = metadata?.coverage_id
  return typeof coverageId === "string" && coverageId.trim()
    ? { coverage_id: coverageId.trim() }
    : {}
}

function publicLegislacaoMandatoExecutivo(row: LegislacaoMandatoExecutivo, index: number) {
  return {
    id: compactPublicId("lme", row.id, index),
    tipo_relacao: row.tipo_relacao,
    tipo_norma: row.tipo_norma,
    numero: row.numero,
    ano: row.ano,
    data_norma: row.data_norma,
    ementa: maskNullableText(row.ementa),
    signatario: row.signatario,
    autoridade_papel: row.autoridade_papel,
    fonte_primaria_url: row.fonte_primaria_url,
    metadata: publicLegislacaoMetadata(row.metadata),
  }
}

/**
 * Linhas de cota da Câmara não são exibíveis enquanto a base de agregação não estiver fechada.
 *
 * Em 17/08 tentamos recalcular essas linhas da fonte oficial e o controle positivo falhou:
 * o recibo de 16/08 registra `jhc 2019` com 355 documentos e R$ 351.517,43, e o
 * `Ano-2019.csv.zip` baixado no dia seguinte (a Câmara regenerou o arquivo às 03:12) dá 140
 * documentos e R$ 221.848,77 para o mesmo `ideCadastro`, sem identidade escondida. Testamos as
 * 13 linhas de 2019 que o banco tinha: nenhuma reproduz, nem por `vlrLiquido`, nem por
 * `vlrDocumento`, nem por documento menos glosa, e o banco é sempre maior. Direção sistemática
 * assim é base de agregação diferente, e não sabemos qual é a certa.
 *
 * São 165 linhas em 22 fichas. Mostrar número sobre dinheiro público que não bate com a fonte
 * que a própria ficha cita é pior do que não mostrar: a regra do projeto proíbe exibir valor
 * sem fonte rastreável, e não proíbe omitir a seção. Nenhuma linha foi apagada do banco.
 *
 * Para reativar: fechar a definição de "gasto do ano" (líquido, documento ou líquido de glosa),
 * pinar o snapshot anual com sha256, recalcular filtrando por `ideCadastro`/`nuDeputadoId` e
 * validar contra um controle positivo que reproduza ao centavo. Plano em
 * `entregas/COTA-CAMARA/PLANO-POS-LANCAMENTO.md`.
 */
export function gastoParlamentarExibivel(fonte: string | null | undefined): boolean {
  const f = (fonte ?? "").toLowerCase()
  return !(f.includes("camara") || f.includes("câmara"))
}

function publicGastosParlamentares(row: FichaCandidato["gastos_parlamentares"][number], index: number) {
  const detalhamentoBruto = row.detalhamento as unknown
  const detalhamento = Array.isArray(detalhamentoBruto)
    ? detalhamentoBruto
    : detalhamentoBruto && typeof detalhamentoBruto === "object"
      ? Object.entries(detalhamentoBruto).map(([categoria, valor]) => ({ categoria, valor }))
      : []

  return {
    id: compactPublicId("gasto", row.id, index),
    ano: row.ano,
    total_gasto: row.total_gasto,
    detalhamento: detalhamento.map((item) => ({
      categoria: typeof item.categoria === "string" ? item.categoria : "",
      valor: typeof item.valor === "number" ? item.valor : Number(item.valor) || 0,
      fornecedor:
        "fornecedor" in item && typeof item.fornecedor === "string"
          ? maskDocumentLikeSequences(item.fornecedor)
          : undefined,
    })),
    gastos_destaque: (row.gastos_destaque ?? []).map((item) => ({
      descricao: maskDocumentLikeSequences(item.descricao),
      valor: item.valor,
      categoria: item.categoria,
    })),
  }
}

function publicGastosExecutivo(row: NonNullable<FichaCandidato["gastos_executivo"]>[number], index: number) {
  return {
    id: compactPublicId("gasto-executivo", row.id, index),
    orgao_codigo: row.orgao_codigo,
    orgao_nome: row.orgao_nome,
    ug_codigo: row.ug_codigo ?? null,
    ug_nome: row.ug_nome ?? null,
    mes_extrato: row.mes_extrato,
    valor_total: row.valor_total,
    qtd_transacoes: row.qtd_transacoes,
    qtd_portador_sigiloso: row.qtd_portador_sigiloso ?? 0,
    qtd_portador_nominado: row.qtd_portador_nominado ?? 0,
    qtd_portador_ausente: row.qtd_portador_ausente ?? 0,
    qtd_estabelecimento_sigiloso: row.qtd_estabelecimento_sigiloso ?? 0,
    qtd_estabelecimento_nominado: row.qtd_estabelecimento_nominado ?? 0,
    qtd_estabelecimento_ausente: row.qtd_estabelecimento_ausente ?? 0,
    fonte: row.fonte,
    coletado_em: row.coletado_em,
  }
}

function publicSancao(row: SancaoAdministrativa, index: number) {
  return {
    id: compactPublicId("sancao", row.id, index),
    tipo: row.tipo,
    descricao: maskNullableText(row.descricao),
    orgao_sancionador: row.orgao_sancionador,
    data_inicio: row.data_inicio,
    data_fim: row.data_fim,
    fundamentacao: maskNullableText(row.fundamentacao),
    vinculo: row.vinculo,
  }
}

function publicNoticia(row: FichaCandidato["noticias"][number], index: number) {
  return {
    id: compactPublicId("noticia", row.id, index),
    titulo: replaceInternalEditorialJargon(row.titulo),
    fonte: row.fonte,
    url: row.url,
    data_publicacao: row.data_publicacao,
    snippet: maskNullableText(row.snippet),
    // Auditoria 2026-07-24, etapa 1C: quem consome a API precisa saber quando a
    // materia e cobertura do pleito e nao noticia sobre o candidato.
    contexto_do_pleito: row.contexto_do_pleito === true,
  }
}

function publicIndicador(row: NonNullable<FichaCandidato["indicadores_estaduais"]>[number], index: number) {
  return {
    id: compactPublicId("ind", row.id, index),
    estado: row.estado,
    ano: row.ano,
    fonte: row.fonte,
    indicador: row.indicador,
    valor: row.valor,
    valor_texto: row.valor_texto,
    unidade: row.unidade,
  }
}

function publicSocialLinkValue(value: unknown) {
  if (typeof value === "string") {
    return maskDocumentLikeSequences(value)
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const out: { url?: string; username?: string; followers?: number | null } = {}
  if (typeof record.url === "string") out.url = maskDocumentLikeSequences(record.url)
  if (typeof record.username === "string") out.username = maskDocumentLikeSequences(record.username)
  if (typeof record.followers === "number" || record.followers === null) {
    out.followers = record.followers
  }

  return Object.keys(out).length > 0 ? out : null
}

function publicSocialLinks(value: Record<string, unknown> | null | undefined) {
  const out: Record<string, string | { url?: string; username?: string; followers?: number | null }> = {}
  for (const [key, link] of Object.entries(value ?? {})) {
    if (FORBIDDEN_PUBLIC_PROFILE_KEY_RE.test(key)) continue
    const publicValue = publicSocialLinkValue(link)
    if (publicValue) out[key] = publicValue
  }
  return out
}

export function toPublicCandidatoProfileDto(ficha: FichaCandidato) {
  const cargoProveniencia = resolveCargoDisputadoProveniencia(ficha)

  return {
    id: ficha.id,
    nome_completo: ficha.nome_completo,
    nome_urna: ficha.nome_urna,
    slug: ficha.slug,
    data_nascimento: ficha.data_nascimento,
    idade: ficha.idade,
    naturalidade: ficha.naturalidade,
    formacao: publicTaxonomyValue(
      pareceNomeDeInstituicao(ficha.formacao) ? null : ficha.formacao,
    ),
    formacao_instituicao:
      ficha.formacao_instituicao?.trim() ||
      (pareceNomeDeInstituicao(ficha.formacao) ? (ficha.formacao?.trim() ?? null) : null),
    profissao_declarada: publicTaxonomyValue(ficha.profissao_declarada),
    genero: ficha.genero ?? null,
    estado_civil: ficha.estado_civil ?? null,
    cor_raca: ficha.cor_raca ?? null,
    partido_atual: ficha.partido_atual,
    partido_sigla: ficha.partido_sigla,
    cargo_atual: ficha.cargo_atual,
    cargo_disputado: ficha.cargo_disputado,
    // Achado A0.1 (auditoria 2026-07-24): o payload publico devolvia
    // cargo_disputado/situacao_candidatura sem dizer de onde vem. Quem consome
    // a API recebia declaracao editorial de pre-candidatura com cara de
    // registro oficial. Os dois campos abaixo carregam a proveniencia junto do
    // dado, na mesma regra usada na ficha.
    cargo_disputado_proveniencia: cargoProveniencia,
    cargo_disputado_proveniencia_nota: buildCargoDisputadoProvenienceNote(cargoProveniencia),
    estado: ficha.estado,
    status: ficha.status,
    situacao_candidatura: ficha.situacao_candidatura ?? null,
    chapa_2026: ficha.chapa_2026 ?? null,
    biografia: ficha.biografia == null ? null : replaceInternalEditorialJargon(ficha.biografia),
    foto_url: ficha.foto_url,
    site_campanha: ficha.site_campanha,
    redes_sociais: publicSocialLinks(ficha.redes_sociais),
    // Fontes passam pela MESMA limpeza: a varredura achou 65 entradas em 63
    // fichas com identificador numérico solto fora de URL.
    fonte_dados: (ficha.fonte_dados ?? []).map((f) => sanitizeFontePublica(f) ?? ""),
    ultima_atualizacao: ficha.ultima_atualizacao,
    verificacao_campos: ficha.verificacao_campos ?? null,
    // Mesma lista que o DOM renderiza: sem isto a API servia a duplicata que a
    // ficha já não mostra (Ciro Gomes saía com 11 linhas no payload e 10 na
    // tela), e o badge contava 11.
    historico: prepareHistoricoPoliticoPublicDisplayList([...(ficha.historico ?? [])]).map(
      publicHistorico,
    ),
    mudancas_partido: (ficha.mudancas_partido ?? []).map(publicMudancaPartido),
    patrimonio: (ficha.patrimonio ?? []).map(publicPatrimonio),
    // Passa adiante a série que `getCandidatoBySlug` já compôs com os insumos
    // completos; só recompõe quando a ficha veio montada à mão.
    patrimonio_eleicoes: resolvePatrimonioEleicoes(ficha),
    financiamento: (ficha.financiamento ?? []).map(publicFinanciamento),
    financiamento_eleicoes:
      ficha.financiamento_eleicoes ??
      buildFinanciamentoEleicoes(ficha.financiamento ?? [], ficha.historico ?? []),
    votos: (ficha.votos ?? []).map(publicVoto),
    processos: (ficha.processos ?? []).map(publicProcesso),
    pontos_atencao: (ficha.pontos_atencao ?? []).map(publicPontoAtencao),
    projetos_lei: (ficha.projetos_lei ?? []).map(publicProjetoLei),
    projetos_lei_total: ficha.projetos_lei_total ?? (ficha.projetos_lei ?? []).length,
    projetos_lei_truncados: ficha.projetos_lei_truncados ?? false,
    // Rodada 3 da vistoria: o campo era calculado em getCandidatoBySlug e
    // morria aqui, então /api/candidato-profile/[slug] não expunha a composição
    // e o readback por API não tinha como conferi-la. `null` preservado como
    // null: consumidor degrada para rótulo neutro, nunca inventa zero.
    projetos_lei_natureza_projetos_total: ficha.projetos_lei_natureza_projetos_total ?? null,
    // Total de destaques do acervo INTEIRO, para o card não publicar "0 em
    // destaque" quando o destaque mora fora da prévia de 25.
    projetos_lei_destaques_total: ficha.projetos_lei_destaques_total ?? null,
    // Linhas de fonte Câmara (rodada 4): a assinatura do corte se verifica
    // contra ESTA dimensão, nunca contra o total global.
    projetos_lei_camara_total: ficha.projetos_lei_camara_total ?? null,
    legislacao_mandato_executivo: (ficha.legislacao_mandato_executivo ?? []).map(
      publicLegislacaoMandatoExecutivo
    ),
    legislacao_mandato_executivo_total:
      ficha.legislacao_mandato_executivo_total ??
      (ficha.legislacao_mandato_executivo ?? []).length,
    legislacao_mandato_executivo_truncados:
      ficha.legislacao_mandato_executivo_truncados ?? false,
    gastos_parlamentares: (ficha.gastos_parlamentares ?? [])
      .filter((row) => gastoParlamentarExibivel(row.fonte))
      .map(publicGastosParlamentares),
    gastos_executivo: (ficha.gastos_executivo ?? []).map(publicGastosExecutivo),
    sancoes_administrativas: (ficha.sancoes_administrativas ?? []).map(publicSancao),
    noticias: (ficha.noticias ?? []).map(publicNoticia),
    indicadores_estaduais: (ficha.indicadores_estaduais ?? []).map(publicIndicador),
    total_processos: ficha.total_processos,
    processos_criminais: (ficha.processos ?? []).filter(
      processoPodeContarComoCriminal,
    ).length,
    total_mudancas_partido: ficha.total_mudancas_partido,
    total_pontos_atencao: ficha.total_pontos_atencao,
    pontos_criticos: ficha.pontos_criticos,
    total_sancoes: ficha.total_sancoes,
    // Proveniência do zero de sanções: quem consome a API precisa saber se o
    // vazio foi verificado nos cadastros (vazio_confirmado + data) ou se a
    // fonte nunca foi consultada (null). Zero provado e zero presumido não
    // podem ter a mesma cara nem no JSON.
    sancoes_verificacao: ficha.sancoes_verificacao ?? null,
    processos_verificacao: ficha.processos_verificacao ?? null,
    trajetoria_verificacao: ficha.trajetoria_verificacao ?? null,
    patrimonio_verificacao: ficha.patrimonio_verificacao ?? null,
    votacoes_verificacao: ficha.votacoes_verificacao ?? null,
    historico_descartado: ficha.historico_descartado ?? 0,
    historico_em_revisao: ficha.historico_em_revisao ?? false,
    timeline_partidaria_incompleta: ficha.timeline_partidaria_incompleta ?? false,
    section_freshness: ficha.section_freshness ?? {},
  }
}

export type PublicCandidatoProfileDto = ReturnType<typeof toPublicCandidatoProfileDto>

export function toPublicProjetosLeiDto(rows: ProjetoLei[]) {
  return rows.map(publicProjetoLei)
}

export function toPublicLegislacaoExecutivoDto(rows: LegislacaoMandatoExecutivo[]) {
  return rows.map(publicLegislacaoMandatoExecutivo)
}

export function findForbiddenPublicProfileKeys(value: unknown): string[] {
  const found = new Set<string>()
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_PUBLIC_PROFILE_KEY_RE.test(key)) {
        found.add(key)
      }
      visit(child)
    }
  }

  visit(value)
  return [...found].sort()
}
