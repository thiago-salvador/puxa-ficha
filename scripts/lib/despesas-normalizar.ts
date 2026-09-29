/**
 * Normalizador puro das despesas de campanha (sem IO).
 *
 * Entrada: a lista de despesas contratadas de uma candidatura e os totais
 * consolidados da fonte. Saída: a linha no formato `FinanciamentoDespesas`
 * (sem `id` e `candidato_id`), com todas as visões calculadas da mesma lista:
 * concentração por tipo, maiores fornecedores e doações a terceiros. Doações
 * continuam dentro do total contratado e nunca são somadas de novo.
 *
 * Conferência em centavos: soma dos itens == total contratado e soma da
 * concentração == total. Qualquer diferença vira `divergencias` tipadas e a
 * linha sai com `estado_coleta = "falha_coleta"`, com os agregados preservados
 * para revisão (nada é descartado em silêncio).
 *
 * Documentos (CPF/CNPJ) só existem em memória, para agrupar fornecedores.
 * Nenhum documento sai deste módulo.
 */

import { stripAccents } from "../../src/lib/strip-accents"
import {
  removerDocumentosDoTexto,
  type DespesaConcentracaoItem,
  type DespesaDoacaoTerceiroItem,
  type DespesaFornecedorItem,
  type DespesasEstadoColeta,
  type FinanciamentoDespesas,
} from "../../src/lib/financiamento-despesas-contrato"

export const CATEGORIA_NAO_INFORMADA = "Não informada"
export const MAX_FORNECEDORES_PJ = 10

const SENTINELAS = new Set(["", "#NULO", "#NULO#", "#NE", "#NE#", "-1", "-3", "NULL", "NULO"])

/** Remove sentinelas de dado ausente (`#NULO`, `-1`, `-3`, vazio). */
export function semSentinela(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).trim()
  return SENTINELAS.has(texto.toUpperCase()) ? null : texto
}

/** Destinatário de doação conforme a fonte (antes da classificação). */
export interface DestinatarioEntrada {
  /** SQ oficial do candidato destinatário (2018+). Null em 2026 e quando ausente. */
  sq: string | null
  nome: string | null
  uf: string | null
  cargo: string | null
  partido: string | null
  /** Esfera partidária do fornecedor (histórico); indica órgão de partido. */
  esferaPartidaria: string | null
  /** Contexto do prestador (ex.: `beneficiadoContratante` em 2026). Nunca é o destinatário. */
  contexto: string | null
}

export interface DespesaItemEntrada {
  tipo: string | null
  /** Valor em centavos inteiros; null quando a fonte trouxe valor inválido. */
  valorCentavos: number | null
  /** Só dígitos, só em memória. 14 = PJ, 11 = PF, demais = sem documento. */
  documentoFornecedor: string | null
  nomeFornecedor: string | null
  descricao: string | null
  /** Preenchido pelo adaptador da fonte para itens de doação. */
  destinatario?: DestinatarioEntrada | null
}

export interface ConcentracaoOficialItem {
  tipo: string
  quantidade: number | null
  valor: number
}

export interface RankingOficialItem {
  /** Só dígitos, só em memória. */
  documento: string | null
  valor: number
}

export interface TotaisEntrada {
  /**
   * `oficial`: a fonte publica o total contratado (2026); null nele significa
   * "não informado". `soma_itens`: a fonte só publica itens (histórico) e o
   * total é a soma deles.
   */
  origemTotalContratado: "oficial" | "soma_itens"
  total_despesas_contratadas: number | null
  total_despesas_pagas: number | null
  /** Total oficial de doações a terceiros, quando a fonte informa. */
  total_doacoes_a_terceiros_oficial: number | null
  recursos_financeiros: number | null
  recursos_estimaveis: number | null
  divida_campanha: number | null
  sobra_financeira: number | null
  concentracao_oficial?: readonly ConcentracaoOficialItem[] | null
  ranking_oficial?: readonly RankingOficialItem[] | null
}

export interface ContextoCandidatura {
  ano_eleicao: number
  sq_candidato: string
  uf: string | null
  municipio_codigo: string | null
  cargo_candidatura: string | null
  prestacao_parcial: boolean
  data_entrega: string | null
  id_ultima_entrega: string | null
  tipo_entrega: string | null
  fonte: string
  fonte_url: string | null
  coletado_em: string
}

/** Linha pronta para gravar, sem `id` e `candidato_id`. */
export type LinhaDespesasNormalizada = Omit<FinanciamentoDespesas, "id" | "candidato_id"> & {
  id_ultima_entrega: string | null
  tipo_entrega: string | null
}

export type DivergenciaDespesas =
  | { tipo: "valor_invalido"; indices: number[] }
  | { tipo: "soma_itens_diferente_do_total"; soma_centavos: number; total_centavos: number; diferenca_centavos: number }
  | { tipo: "soma_concentracao_diferente_do_total"; soma_centavos: number; total_centavos: number; diferenca_centavos: number }
  | { tipo: "itens_sem_total_oficial"; quantidade_itens: number }
  | { tipo: "concentracao_oficial_diferente"; tipo_despesa: string; calculado_centavos: number; oficial_centavos: number }
  | { tipo: "doacoes_diferentes_do_oficial"; calculado_centavos: number; oficial_centavos: number }
  | { tipo: "ranking_oficial_diferente"; posicao: number; calculado_centavos: number | null; oficial_centavos: number }

/** Doação sem SQ oficial do destinatário: candidata ao julgamento J2 em sombra. */
export interface PendenciaDestinatario {
  indice: number
  destinatario_tipo_regra: DespesaDoacaoTerceiroItem["destinatario_tipo"]
  /** Nome sem documento; omitido quando o fornecedor é pessoa física. */
  destinatario_nome: string | null
  contexto_prestador: string | null
  documento: "PJ" | "PF" | "ausente"
  nome_parece_partido: boolean
  nome_parece_campanha: boolean
  valor: number
}

/** Linha "Não informada" com descrição livre: candidata ao julgamento J3 em sombra. */
export interface PendenciaCategoria {
  indice: number
  descricao: string
  tipo_original: "vazio" | "sentinela"
  documento: "PJ" | "PF" | "ausente"
  /** Só PJ: nome sem documento. */
  fornecedor_nome: string | null
  valor: number
}

export interface ResultadoNormalizacao {
  linha: LinhaDespesasNormalizada
  divergencias: DivergenciaDespesas[]
  pendencias_jev: {
    doacoes_sem_sq: PendenciaDestinatario[]
    categorias_nao_informadas: PendenciaCategoria[]
    categorias_conhecidas: string[]
  }
  contagens: { itens: number; pf_itens: number; pj_itens: number; sem_documento_itens: number; doacoes: number }
}

const PADRAO_DOACAO = /doac(?:ao|oes)\b.*\ba outros? candidat/i
const PADRAO_PARTIDO = /\b(?:partido|diretorio|direcao|comissao (?:provisoria|executiva)|orgao (?:partidario|de direcao)|executiva (?:nacional|estadual|municipal))\b/i
const PADRAO_CAMPANHA = /\beleic(?:ao|oes)\s+\d{4}\b/i

function semAcento(texto: string): string {
  return stripAccents(texto)
}

export function ehDoacaoATerceiros(tipo: string | null): boolean {
  return tipo !== null && PADRAO_DOACAO.test(semAcento(tipo))
}

function tipoDocumento(documento: string | null): "PJ" | "PF" | "ausente" {
  const digitos = documento ? documento.replace(/\D/g, "") : ""
  if (digitos.length === 14 && !/^0+$/.test(digitos)) return "PJ"
  if (digitos.length === 11 && !/^0+$/.test(digitos)) return "PF"
  return "ausente"
}

function textoPublico(valor: string | null | undefined): string | null {
  const limpo = semSentinela(valor)
  if (!limpo) return null
  const texto = removerDocumentosDoTexto(limpo)
  return texto ? texto : null
}

function centavosDeReais(valor: number | null): number | null {
  if (valor === null || !Number.isFinite(valor)) return null
  return Math.round(valor * 100)
}

/** Centavos inteiros em reais: a divisão por 100 é a última operação (sem resíduo de float). */
function reaisDeCentavos(centavos: number): number {
  return Math.round(centavos) / 100
}

/** Valor em reais vindo da fonte, arredondado ao centavo; null continua null. */
function reaisArredondados(valor: number | null): number | null {
  const centavos = centavosDeReais(valor)
  return centavos === null ? null : reaisDeCentavos(centavos)
}

function sqValido(sq: string | null): boolean {
  const limpo = semSentinela(sq)
  return limpo !== null && /^\d{5,20}$/.test(limpo) && !/^0+$/.test(limpo)
}

function classificarDestinatario(
  item: DespesaItemEntrada,
): { tipo: DespesaDoacaoTerceiroItem["destinatario_tipo"]; nome: string | null; temSq: boolean; parecePartido: boolean; pareceCampanha: boolean } {
  const destinatario = item.destinatario ?? null
  const nomeBruto = semSentinela(destinatario?.nome ?? item.nomeFornecedor)
  const nomeComparavel = nomeBruto ? semAcento(nomeBruto) : ""
  const parecePartido = PADRAO_PARTIDO.test(nomeComparavel) || semSentinela(destinatario?.esferaPartidaria) !== null
  const pareceCampanha = PADRAO_CAMPANHA.test(nomeComparavel)
  const documento = tipoDocumento(item.documentoFornecedor)
  const temSq = sqValido(destinatario?.sq ?? null)
  const nome = textoPublico(nomeBruto)
  if (temSq) return { tipo: "candidato", nome, temSq, parecePartido, pareceCampanha }
  if (parecePartido && documento !== "PF") return { tipo: "partido", nome, temSq, parecePartido, pareceCampanha }
  if (pareceCampanha && documento === "PJ") return { tipo: "candidato", nome, temSq, parecePartido, pareceCampanha }
  return { tipo: "outro", nome: null, temSq, parecePartido, pareceCampanha }
}

function ordenarPorValor<T extends { valorCentavos: number; quantidade: number; chave: string }>(itens: T[]): T[] {
  return itens.sort((a, b) =>
    b.valorCentavos - a.valorCentavos || b.quantidade - a.quantidade || a.chave.localeCompare(b.chave, "pt-BR"),
  )
}

function nomeMaisFrequente(contagem: Map<string, number>): string | null {
  let escolhido: string | null = null
  let maior = -1
  for (const [nome, vezes] of [...contagem].sort(([a], [b]) => a.localeCompare(b, "pt-BR"))) {
    if (vezes > maior) { escolhido = nome; maior = vezes }
  }
  return escolhido
}

export function normalizarDespesas(
  itens: readonly DespesaItemEntrada[],
  totais: TotaisEntrada,
  contexto: ContextoCandidatura,
): ResultadoNormalizacao {
  const divergencias: DivergenciaDespesas[] = []
  const invalidos = itens.flatMap((item, indice) =>
    item.valorCentavos === null || !Number.isSafeInteger(item.valorCentavos) || item.valorCentavos < 0 ? [indice] : [],
  )
  if (invalidos.length) divergencias.push({ tipo: "valor_invalido", indices: invalidos })
  const valorDe = (item: DespesaItemEntrada): number =>
    item.valorCentavos !== null && Number.isSafeInteger(item.valorCentavos) && item.valorCentavos >= 0 ? item.valorCentavos : 0

  const somaItens = itens.reduce((soma, item) => soma + valorDe(item), 0)
  const totalOficialCentavos = centavosDeReais(totais.total_despesas_contratadas)

  // Estado e total: null da fonte continua null; zero só quando declarado.
  let estado: DespesasEstadoColeta = "declarado"
  let totalCentavos: number | null
  if (totais.origemTotalContratado === "oficial") {
    if (totalOficialCentavos === null) {
      if (itens.length === 0) estado = "sem_prestacao"
      else divergencias.push({ tipo: "itens_sem_total_oficial", quantidade_itens: itens.length })
      totalCentavos = null
    } else {
      totalCentavos = totalOficialCentavos
      if (somaItens !== totalOficialCentavos) {
        divergencias.push({
          tipo: "soma_itens_diferente_do_total",
          soma_centavos: somaItens,
          total_centavos: totalOficialCentavos,
          diferenca_centavos: somaItens - totalOficialCentavos,
        })
      }
    }
  } else {
    totalCentavos = itens.length === 0 ? null : somaItens
    if (itens.length === 0) estado = "sem_prestacao"
  }

  // Concentração por tipo.
  const porTipo = new Map<string, { quantidade: number; valorCentavos: number }>()
  const categoriasConhecidas = new Set<string>()
  const pendenciasCategoria: PendenciaCategoria[] = []
  itens.forEach((item, indice) => {
    const limpo = semSentinela(item.tipo)
    const tipo = limpo ? removerDocumentosDoTexto(limpo) || CATEGORIA_NAO_INFORMADA : CATEGORIA_NAO_INFORMADA
    if (tipo !== CATEGORIA_NAO_INFORMADA) categoriasConhecidas.add(tipo)
    const acumulado = porTipo.get(tipo) ?? { quantidade: 0, valorCentavos: 0 }
    acumulado.quantidade += 1
    acumulado.valorCentavos += valorDe(item)
    porTipo.set(tipo, acumulado)
    if (tipo === CATEGORIA_NAO_INFORMADA) {
      const descricao = textoPublico(item.descricao)
      if (descricao) {
        const documento = tipoDocumento(item.documentoFornecedor)
        pendenciasCategoria.push({
          indice,
          descricao,
          tipo_original: item.tipo === null || String(item.tipo).trim() === "" ? "vazio" : "sentinela",
          documento,
          fornecedor_nome: documento === "PJ" ? textoPublico(item.nomeFornecedor) : null,
          valor: reaisDeCentavos(valorDe(item)),
        })
      }
    }
  })
  const concentracao = ordenarPorValor([...porTipo].map(([chave, v]) => ({ chave, ...v })))
  const concentracao_despesas: DespesaConcentracaoItem[] = concentracao.map((c) => ({
    tipo: c.chave,
    quantidade: c.quantidade,
    valor: reaisDeCentavos(c.valorCentavos),
  }))
  const somaConcentracao = concentracao.reduce((soma, c) => soma + c.valorCentavos, 0)
  if (totalCentavos !== null && somaConcentracao !== totalCentavos && !divergencias.some((d) => d.tipo === "soma_itens_diferente_do_total")) {
    divergencias.push({
      tipo: "soma_concentracao_diferente_do_total",
      soma_centavos: somaConcentracao,
      total_centavos: totalCentavos,
      diferenca_centavos: somaConcentracao - totalCentavos,
    })
  }
  for (const oficial of totais.concentracao_oficial ?? []) {
    const limpo = semSentinela(oficial.tipo)
    const tipo = limpo ? removerDocumentosDoTexto(limpo) || CATEGORIA_NAO_INFORMADA : CATEGORIA_NAO_INFORMADA
    const calculado = porTipo.get(tipo)?.valorCentavos ?? 0
    const oficialCentavos = centavosDeReais(oficial.valor) ?? 0
    if (calculado !== oficialCentavos) {
      divergencias.push({ tipo: "concentracao_oficial_diferente", tipo_despesa: tipo, calculado_centavos: calculado, oficial_centavos: oficialCentavos })
    }
  }

  // Fornecedores: PJ por documento completo; PF só somadas.
  const porDocumento = new Map<string, { quantidade: number; valorCentavos: number; nomes: Map<string, number> }>()
  const pfDocumentos = new Set<string>()
  let pfQuantidade = 0
  let pfCentavos = 0
  let pjItens = 0
  let semDocumentoItens = 0
  for (const item of itens) {
    const documento = tipoDocumento(item.documentoFornecedor)
    const digitos = item.documentoFornecedor ? item.documentoFornecedor.replace(/\D/g, "") : ""
    if (documento === "PF") {
      pfDocumentos.add(digitos)
      pfQuantidade += 1
      pfCentavos += valorDe(item)
      continue
    }
    if (documento === "ausente") { semDocumentoItens += 1; continue }
    pjItens += 1
    const acumulado = porDocumento.get(digitos) ?? { quantidade: 0, valorCentavos: 0, nomes: new Map<string, number>() }
    acumulado.quantidade += 1
    acumulado.valorCentavos += valorDe(item)
    const nome = textoPublico(item.nomeFornecedor)
    if (nome) acumulado.nomes.set(nome, (acumulado.nomes.get(nome) ?? 0) + 1)
    porDocumento.set(digitos, acumulado)
  }
  const pjOrdenados = ordenarPorValor([...porDocumento].map(([documento, v]) => ({
    chave: nomeMaisFrequente(v.nomes) ?? "Fornecedor sem nome informado",
    documento,
    quantidade: v.quantidade,
    valorCentavos: v.valorCentavos,
  })))
  const maiores_fornecedores: DespesaFornecedorItem[] = pjOrdenados.slice(0, MAX_FORNECEDORES_PJ).map((f) => ({
    tipo: "PJ",
    nome: f.chave,
    quantidade: f.quantidade,
    valor: reaisDeCentavos(f.valorCentavos),
  }))
  if (pfQuantidade > 0) {
    maiores_fornecedores.push({
      tipo: "PF_agregado",
      quantidade_prestadores: pfDocumentos.size,
      quantidade: pfQuantidade,
      valor: reaisDeCentavos(pfCentavos),
    })
  }
  // Ranking oficial (inclui PF): confere o total por documento completo.
  const totalPorDocumento = new Map<string, number>()
  for (const item of itens) {
    const digitos = item.documentoFornecedor ? item.documentoFornecedor.replace(/\D/g, "") : ""
    if (tipoDocumento(digitos) === "ausente") continue
    totalPorDocumento.set(digitos, (totalPorDocumento.get(digitos) ?? 0) + valorDe(item))
  }
  ;(totais.ranking_oficial ?? []).forEach((oficial, posicao) => {
    const digitos = oficial.documento ? oficial.documento.replace(/\D/g, "") : ""
    const calculado = digitos ? totalPorDocumento.get(digitos) ?? null : null
    const oficialCentavos = centavosDeReais(oficial.valor) ?? 0
    if (calculado !== oficialCentavos) {
      divergencias.push({ tipo: "ranking_oficial_diferente", posicao: posicao + 1, calculado_centavos: calculado, oficial_centavos: oficialCentavos })
    }
  })

  // Doações a terceiros: recorte da mesma lista, nunca somado de novo ao total.
  const doacoes_a_terceiros: DespesaDoacaoTerceiroItem[] = []
  const pendenciasDestinatario: PendenciaDestinatario[] = []
  let doacoesCentavos = 0
  itens.forEach((item, indice) => {
    if (!ehDoacaoATerceiros(semSentinela(item.tipo))) return
    const valor = valorDe(item)
    doacoesCentavos += valor
    const classe = classificarDestinatario(item)
    const destinatario = item.destinatario ?? null
    const comContexto = classe.tipo !== "outro"
    doacoes_a_terceiros.push({
      destinatario_tipo: classe.tipo,
      destinatario_nome: comContexto ? classe.nome : null,
      uf: comContexto ? textoPublico(destinatario?.uf) : null,
      cargo: comContexto ? textoPublico(destinatario?.cargo) : null,
      partido: comContexto ? textoPublico(destinatario?.partido) : null,
      valor: reaisDeCentavos(valor),
      candidato_slug: null,
    })
    if (!classe.temSq) {
      const documento = tipoDocumento(item.documentoFornecedor)
      pendenciasDestinatario.push({
        indice,
        destinatario_tipo_regra: classe.tipo,
        destinatario_nome: documento === "PF" ? null : textoPublico(destinatario?.nome ?? item.nomeFornecedor),
        contexto_prestador: textoPublico(destinatario?.contexto),
        documento,
        nome_parece_partido: classe.parecePartido,
        nome_parece_campanha: classe.pareceCampanha,
        valor: reaisDeCentavos(valor),
      })
    }
  })
  doacoes_a_terceiros.sort((a, b) => b.valor - a.valor || (a.destinatario_nome ?? "").localeCompare(b.destinatario_nome ?? "", "pt-BR"))
  const doacoesOficialCentavos = centavosDeReais(totais.total_doacoes_a_terceiros_oficial)
  if (doacoesOficialCentavos !== null && doacoesOficialCentavos !== doacoesCentavos) {
    divergencias.push({ tipo: "doacoes_diferentes_do_oficial", calculado_centavos: doacoesCentavos, oficial_centavos: doacoesOficialCentavos })
  }
  const totalDoacoes = estado === "sem_prestacao" && doacoesOficialCentavos === null
    ? null
    : reaisDeCentavos(doacoesCentavos)

  if (divergencias.length) estado = "falha_coleta"
  const pagasCentavos = centavosDeReais(totais.total_despesas_pagas)

  const linha: LinhaDespesasNormalizada = {
    ano_eleicao: contexto.ano_eleicao,
    sq_candidato: contexto.sq_candidato,
    uf: contexto.uf,
    municipio_codigo: contexto.municipio_codigo,
    cargo_candidatura: contexto.cargo_candidatura,
    estado_coleta: estado,
    total_despesas_contratadas: totalCentavos === null ? null : reaisDeCentavos(totalCentavos),
    total_despesas_pagas: pagasCentavos === null ? null : reaisDeCentavos(pagasCentavos),
    total_doacoes_a_terceiros: totalDoacoes,
    recursos_financeiros: reaisArredondados(totais.recursos_financeiros),
    recursos_estimaveis: reaisArredondados(totais.recursos_estimaveis),
    divida_campanha: reaisArredondados(totais.divida_campanha),
    sobra_financeira: reaisArredondados(totais.sobra_financeira),
    concentracao_despesas,
    maiores_fornecedores,
    doacoes_a_terceiros,
    prestacao_parcial: contexto.prestacao_parcial,
    data_entrega: contexto.data_entrega,
    fonte: contexto.fonte,
    fonte_url: contexto.fonte_url,
    coletado_em: contexto.coletado_em,
    id_ultima_entrega: contexto.id_ultima_entrega,
    tipo_entrega: contexto.tipo_entrega,
  }

  return {
    linha,
    divergencias,
    pendencias_jev: {
      doacoes_sem_sq: pendenciasDestinatario,
      categorias_nao_informadas: pendenciasCategoria,
      categorias_conhecidas: [...categoriasConhecidas].sort((a, b) => a.localeCompare(b, "pt-BR")),
    },
    contagens: {
      itens: itens.length,
      pf_itens: pfQuantidade,
      pj_itens: pjItens,
      sem_documento_itens: semDocumentoItens,
      doacoes: doacoes_a_terceiros.length,
    },
  }
}

/** Varredura de segurança: nenhum texto público pode carregar 11 ou 14 dígitos. */
export function textoTemDocumento(valor: unknown): boolean {
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor)
  return /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{11,14}/.test(texto ?? "")
}
