// ============================================
// PUXA FICHA 2026
// TypeScript Types
// ============================================

import type { VerificacaoCampos } from "@/lib/verificacao-campos";

// --- Candidato ---
export interface Candidato {
  id: string;
  nome_completo: string;
  nome_urna: string;
  slug: string;

  // Pessoal
  data_nascimento: string | null;
  idade: number | null;
  naturalidade: string | null;
  formacao: string | null;
  formacao_instituicao?: string | null;
  profissao_declarada: string | null;
  genero?: string | null;
  estado_civil?: string | null;
  cor_raca?: string | null;

  // Político
  partido_atual: string;
  partido_sigla: string;
  cargo_atual: string | null;
  cargo_disputado:
    | 'Presidente'
    | 'Vice-Presidente'
    | 'Governador'
    | 'Vice-Governador'
    | 'Senador'
    | 'Deputado Federal'
    | 'Nenhum';
  estado: string | null; // UF pra governadores

  status: 'pre-candidato' | 'candidato' | 'indeferido' | 'desistente' | 'removido';
  situacao_candidatura?: string | null;
  biografia?: string | null;

  // Mídia
  foto_url: string | null;
  foto_credito?: FotoCredito | null;
  site_campanha: string | null;
  redes_sociais: Record<string, string>;
  /** Lista integral declarada no TSE, exclusiva do box da Visao Geral. */
  sites_candidato?: CandidatoSitesCollection | null;

  // Meta
  fonte_dados: string[];
  ultima_atualizacao: string;
  /** Datas de frescor e recibos de estado por aba; não substitui a data do próprio dado. */
  verificacao_campos?: VerificacaoCampos | null;
}

export interface CandidatoSitesCollection {
  ano_eleicao: number;
  fonte_url: string;
  fonte_sha256: string;
  coletado_em: string;
  gerado_em_tse: string | null;
  sites: Array<{
    ordem: number;
    url: string;
  }>;
}

/** Snapshot versionado dos sites declarados no TSE para os perfis conhecidos. */
export interface CandidateSitesTseDataset {
  schema_version: 1;
  election_year: 2026;
  source: {
    catalog_url: string;
    candidate_resource_url: string;
    candidate_resource_sha256: string;
    resource_url: string;
    resource_sha256: string;
    license: string | null;
    collected_at: string;
    generated_at_tse: string | null;
  };
  counts: {
    profiles_total: number;
    profiles_matched: number;
    profiles_with_sites: number;
    site_rows: number;
    unique_entries: number;
    unique_sites: number;
    non_linkable_entries: number;
    duplicate_rows_removed: number;
    ambiguous_profiles: number;
    declared_sq_missing: number;
  };
  ambiguous_profiles: Array<{ slug: string; sq_candidato: string[] }>;
  unmatched_declared_profiles: Array<{ slug: string; sq_candidato: string }>;
  candidates: Record<
    string,
    {
      sq_candidato: string;
      match_method: 'sq_candidato' | 'nome_completo_exato_unico';
      sites: Array<{ order: number; url: string | null; original_url: string }>;
    }
  >;
}

export interface FotoCredito {
  origem: 'tse' | 'wikimedia_commons' | (string & {});
  descricao?: string | null;
  autor?: string | null;
  licenca?: string | null;
  licenca_url?: string | null;
  fonte_url?: string | null;
}

// --- Histórico Político ---
export interface HistoricoPolitico {
  id: string;
  candidato_id: string;
  cargo: string;
  /** Chave deduplicação; alinhada a `src/lib/cargo-utils.ts` (scripts re-exportam o mesmo). */
  cargo_canonico?: string | null;
  /** Mandato/posição vs pleito sem mandato; ver `curadoria interna` (Fluxo 2). */
  tipo_evento?: 'mandato' | 'candidatura' | null;
  /** Ano de início; pode ser null na base (evitar coagir a 0 — diverge da ficha pública). */
  periodo_inicio: number | null;
  periodo_fim: number | null;
  partido: string;
  estado: string;
  eleito_por: string;
  observacoes: string | null;
  /**
   * Proveniência persistida (`historico_politico.proveniencia`). Null = legado; ver `resolveHistoricoRowProvenance`.
   */
  proveniencia?: string | null;
}

// --- Mudança de Partido ---
export interface MudancaPartido {
  id: string;
  candidato_id: string;
  partido_anterior: string;
  partido_novo: string;
  data_mudanca: string | null;
  ano: number;
  contexto: string | null;
}

// --- Patrimônio ---
export interface Patrimonio {
  id: string;
  candidato_id: string;
  ano_eleicao: number;
  valor_total: number;
  bens: BemDeclarado[];
}

export interface BemDeclarado {
  tipo: string;
  descricao: string;
  valor: number;
}

/**
 * Eleição em que o pacote oficial bem_candidato do TSE foi lido de ponta a
 * ponta e não trouxe bens para o SQ_CANDIDATO. Não é um zero declarado: é a
 * confirmação de que a fonte oficial não tem registro para aquele pleito.
 */
export interface PatrimonioAusenciaOficial {
  ano_eleicao: number;
  fonte_url: string | null;
  verificado_em: string | null;
}

// --- Financiamento ---
export interface Financiamento {
  id: string;
  candidato_id: string;
  ano_eleicao: number;
  total_arrecadado: number;
  total_fundo_partidario: number;
  total_fundo_eleitoral: number;
  total_pessoa_fisica: number;
  total_recursos_proprios: number;
  /** Categorias de origem mutuamente exclusivas, na taxonomia reconciliada do TSE. */
  categorias_origem?: Record<string, number> | null;
  maiores_doadores: Doador[];
}

export interface Doador {
  nome: string;
  valor: number;
  tipo: 'PF' | 'PJ' | 'fundo_partidario' | 'fundo_eleitoral' | 'recursos_proprios' | 'desconhecido';
  /** CNPJ 14 dígitos quando a fonte TSE/ingest trouxer documento PJ. */
  cnpj?: string;
  /** Referência unidirecional a PF; não é o CPF em claro. Só preenchido com ingest + salt dedicado. */
  cpf_hash?: string;
}

// --- Votações ---
export interface VotacaoChave {
  id: string;
  titulo: string;
  descricao: string;
  data_votacao: string;
  casa: 'Câmara' | 'Senado';
  tema: string;
  impacto_popular: string;
  /** Fonte nominal da votação, quando a linha foi auditada (camara ou senado). */
  fonte?: string | null;
  /** ID da proposição na Câmara ou Senado, usado para link e explicação de fonte. Null quando não disponível. */
  proposicao_id?: string | null;
}

export interface VotoCandidato {
  id: string;
  candidato_id: string;
  votacao_id: string;
  voto: 'sim' | 'não' | 'abstenção' | 'ausente' | 'obstrução' | 'artigo_17';
  contradicao: boolean;
  contradicao_descricao: string | null;

  // Joined
  votacao?: VotacaoChave;
}

// --- Processos ---
export interface Processo {
  id: string;
  candidato_id: string;
  tipo: 'criminal' | 'improbidade' | 'eleitoral' | 'civil' | 'procedural';
  tribunal: string;
  numero_processo: string | null;
  descricao: string;
  status: 'em_andamento' | 'condenado' | 'absolvido' | 'prescrito' | 'anulado' | (string & {});
  data_inicio: string | null;
  data_decisao: string | null;
  gravidade: 'alta' | 'media' | 'baixa' | null;
  fonte?: string | null;
  url_fonte?: string | null;
}

// --- Pontos de Atenção ---
export interface PontoAtencao {
  id: string;
  candidato_id: string;
  categoria:
    | 'corrupção'
    | 'contradição'
    | 'financiamento_suspeito'
    | 'mudança_partido'
    | 'processo_grave'
    | 'patrimonio_incompativel'
    | 'feito_positivo'
    | 'escandalo';
  titulo: string;
  descricao: string;
  fontes: FonteReferencia[];
  gravidade: 'critica' | 'alta' | 'media' | 'baixa';
  visivel?: boolean;
  verificado: boolean;
  gerado_por: 'ia' | 'curadoria' | 'automatico';
  /** Data factual do fato (YYYY-MM-DD); timeline publica usa quando preenchida. */
  data_referencia?: string | null;
}

interface FonteReferencia {
  titulo: string;
  url: string;
  /** Snapshot best effort da fonte original, quando o Wayback respondeu. */
  url_archive?: string;
  data: string;
}

// --- Projetos de Lei ---
export interface ProjetoLei {
  id: string;
  candidato_id: string;
  tipo: string; // "PL", "PEC", "PLP", etc.
  numero: string | null;
  ano: number | null;
  ementa: string | null;
  tema: string | null;
  situacao: string | null; // "tramitando", "aprovado", "arquivado", "vetado"
  url_inteiro_teor: string | null;
  destaque: boolean;
  destaque_motivo: string | null;
  fonte: string;
  /** Chave da proposição na fonte: sempre interpretar junto com `fonte`. */
  proposicao_id_api?: string | null;
  /** Etiqueta de cobertura da autoria parlamentar verificada (slug+orgao+janela). Espelha COMPLETE_PARLAMENTAR_AUTHORSHIP_COVERAGE. */
  coverage_id?: string | null;
  /** Escopo formal do coverage_id (ex.: 'inventario_completo_camara_autoria_1991_2014_20260430'). */
  coverage_scope?: string | null;
  /** Provenance auditável (data_apresentacao, ordem_assinatura, total_autores, origem_lote, etc.). */
  metadata?: Record<string, unknown> | null;
}

// --- Legislação de Mandato Executivo ---
type LegislacaoMandatoExecutivoTipoRelacao =
  | 'projeto_enviado_pelo_executivo'
  | 'lei_sancionada'
  | 'lei_promulgada_pelo_legislativo';

type LegislacaoMandatoExecutivoEsfera = 'federal' | 'estadual' | 'municipal';

type LegislacaoMandatoExecutivoAutoridadePapel =
  | 'titular'
  | 'vice_interino'
  | 'mesa_legislativa'
  | 'outro'
  | 'nao_informado';

export interface LegislacaoMandatoExecutivo {
  id: string;
  candidato_id: string;
  historico_politico_id: string | null;
  tipo_relacao: LegislacaoMandatoExecutivoTipoRelacao;
  esfera: LegislacaoMandatoExecutivoEsfera;
  uf_norma: string | null;
  municipio_norma: string | null;
  tipo_norma: string | null;
  numero: string | null;
  ano: number | null;
  data_norma: string | null;
  ementa: string | null;
  signatario: string | null;
  autoridade_papel: LegislacaoMandatoExecutivoAutoridadePapel;
  fonte_primaria_url: string;
  fonte_primaria_titulo: string | null;
  fonte_tramitacao_url: string | null;
  identificador_fonte: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// --- Gastos Parlamentares ---
export interface GastoParlamentar {
  id: string;
  candidato_id: string;
  ano: number;
  total_gasto: number;
  detalhamento: GastoCategoria[];
  gastos_destaque: GastoDestaque[];
  /** Rótulo da origem da linha. Decide se ela pode ser exibida: ver `gastoParlamentarExibivel`. */
  fonte?: string | null;
}

// --- Gastos da estrutura de governo ---
export interface GastoExecutivo {
  id: string;
  candidato_id: string;
  orgao_codigo: string;
  orgao_nome: string;
  ug_codigo?: string;
  ug_nome?: string;
  mes_extrato: string;
  valor_total: number;
  qtd_transacoes: number;
  qtd_portador_sigiloso?: number;
  qtd_portador_nominado?: number;
  qtd_portador_ausente?: number;
  qtd_estabelecimento_sigiloso?: number;
  qtd_estabelecimento_nominado?: number;
  qtd_estabelecimento_ausente?: number;
  fonte: string;
  coletado_em: string;
}

interface GastoCategoria {
  categoria: string;
  valor: number;
  fornecedor?: string;
}

interface GastoDestaque {
  descricao: string;
  valor: number;
  categoria: string;
}

// --- Sancoes Administrativas ---
export interface SancaoAdministrativa {
  id: string;
  candidato_id: string;
  tipo: 'CEIS' | 'CNEP' | 'CEAF' | 'CEPIM';
  descricao: string | null;
  orgao_sancionador: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  fundamentacao: string | null;
  vinculo: 'direto' | 'empresa_associada';
  cnpj_empresa: string | null;
}

/**
 * Desfechos possíveis de uma tentativa de coleta, como registrados em
 * `public.coleta_log` (migration 20260804160000). A ausência de linha é o sexto
 * estado, "nunca verificado", e se lê pela negativa.
 */
type ColetaResultado =
  | 'encontrado'
  | 'vazio_confirmado'
  | 'nao_aplicavel'
  /**
   * Curadoria limitada: o que existe não cobre a fonte por inteiro, então a
   * ausência NÃO é conclusão. Estava no vocabulário fechado do contrato B-E2
   * (`QA/2026-08-09-trilha-b-contrato-de-dados.md`) e faltava aqui, então o
   * compilador não cobrava o caso e a superfície tratava como desconhecido.
   */
  | 'sem_achado_no_escopo'
  | 'erro'
  | 'indeterminado';

/**
 * Última verificação dos cadastros de sanções (CEIS, CNEP e CEAF) para o
 * candidato, lida da view `public.coleta_log_ultima`. Só `vazio_confirmado`
 * autoriza a ficha a dizer "nada encontrado": os demais desfechos (e a ausência
 * deste campo) rendem estado neutro, sem afirmação de limpeza.
 */
export interface SancoesVerificacao {
  resultado: ColetaResultado;
  executado_em: string;
  /** Fonte canônica em `coleta_log_ultima`, quando propagada para a superfície. */
  fonte?: string;
  /** Escopo público e curto da verificação. Nunca recebe erro técnico bruto. */
  detalhe?: string | null;
  /** URL representativa da tentativa, quando a fonte possui uma só. */
  url?: string | null;
}

/** Último desfecho da busca editorial de processos para a ficha. */
export type ProcessosVerificacao = SancoesVerificacao;

// --- Indicadores Estaduais ---
export interface IndicadorEstadual {
  id: string;
  estado: string;
  ano: number;
  fonte: string;
  indicador: string;
  valor: number | null;
  valor_texto: string | null;
  unidade: string | null;
  metadata: Record<string, unknown> | null;
}

/** Linha minima para ranking nacional (payload leve). */
export interface IndicadorEstadualRanking {
  id: string;
  estado: string;
  ano: number;
  indicador: string;
  valor: number | null;
  /** Chave da origem no banco (ex.: ibge_sidra, ipeadata). */
  fonte?: string | null;
}

// --- Noticias ---
export interface NoticiaCandidato {
  id: string;
  candidato_id: string;
  titulo: string;
  fonte: string | null;
  url: string;
  data_publicacao: string;
  snippet: string | null;
  /**
   * Campo DERIVADO em tempo de leitura (não existe em `noticias_candidato`).
   * `true` quando o título não cita o candidato: é cobertura coletiva do pleito
   * devolvida pela busca por nome, não notícia sobre a pessoa. A ingestão passou
   * a descartar esses itens (auditoria 2026-07-24, etapa 1C); a flag existe para
   * rotular honestamente as 17.498 linhas que já estavam gravadas.
   */
  contexto_do_pleito?: boolean;
}

// --- Estado da fonte de dados ---
export type DataSourceStatus = 'live' | 'degraded';

export interface DataResource<T> {
  data: T;
  sourceStatus: DataSourceStatus;
  sourceMessage?: string | null;
}

type SectionFreshnessStatus =
  | "current"
  | "historical"
  | "stale"
  | "missing";

export type SectionFreshnessKey =
  | "perfil_atual"
  | "historico_politico"
  | "mudancas_partido"
  | "patrimonio"
  | "financiamento"
  | "projetos_lei"
  | "votos_candidato"
  | "gastos_parlamentares"
  | "gastos_executivo";

export interface SectionFreshnessInfo {
  key: SectionFreshnessKey;
  label: string;
  status: SectionFreshnessStatus;
  verifiedAt?: string | null;
  referenceDate: string | null;
  referenceYear: number | null;
  sourceLabel?: string | null;
  message: string;
}

// --- Views compostas ---

export type PatrimonioEleicaoEstado = "publicado" | "vazio_confirmado" | "nao_coletado";

/**
 * Estado público do patrimônio de UMA eleição aplicável. Mora aqui, e não no
 * DTO, porque `FichaCandidato` precisa carregar a série já composta: o payload
 * que o browser recebe é o DTO, e o DTO não publica os insumos crus
 * (`patrimonio_ausencias_oficiais`). Sem o campo composto viajando junto, quem
 * renderiza teria de recompor sem os insumos e degradaria toda ausência
 * confirmada para "ainda não coletado".
 */
export interface PatrimonioEleicaoPublico {
  ano: number;
  estado: PatrimonioEleicaoEstado;
  fonte_url: string | null;
  verificado_em: string | null;
}

export interface Chapa2026 {
  chave: string;
  eleicao_codigo: string;
  eleicao_data: string;
  uf: string | null;
  cargo_titular: 'Presidente' | 'Governador';
  identidade_status: 'confirmada' | 'duplicidade_oficial';
  vinculo_titular_status:
    | 'confirmado'
    | 'revisao_identidade'
    | 'duplicidade_oficial'
    | 'novo_perfil_oficial';
  tse_situacao_codigo: string;
  titular_slug: string | null;
  titular_nome_completo: string;
  titular_nome_urna: string;
  titular_partido_sigla: string;
  vice_slug: string | null;
  vice_nome_completo: string;
  vice_nome_urna: string;
  vice_partido_sigla: string;
  fonte_url: string;
  fonte_sha256: string;
  snapshot_em: string;
}

export interface FichaCandidato extends Candidato {
  chapa_2026?: Chapa2026 | null;
  historico: HistoricoPolitico[];
  mudancas_partido: MudancaPartido[];
  patrimonio: Patrimonio[];
  patrimonio_ausencias_oficiais?: PatrimonioAusenciaOficial[];
  /**
   * Série composta uma única vez (em `getCandidatoBySlug`) e propagada intacta
   * até o DOM. Opcional porque ficha montada à mão (teste, readback, preview)
   * pode não trazê-la; nesse caso `resolvePatrimonioEleicoes` recompõe a partir
   * dos insumos crus, que aí estão presentes.
   */
  patrimonio_eleicoes?: PatrimonioEleicaoPublico[];
  financiamento: Financiamento[];
  /** Série canônica por pleito, incluindo zero, ausência oficial e erro. */
  financiamento_eleicoes?: import("@/lib/financiamento-eleicoes").FinanciamentoEleicaoPublico[];
  votos: VotoCandidato[];
  processos: Processo[];
  pontos_atencao: PontoAtencao[];
  projetos_lei: ProjetoLei[];
  /** Total materializado; `projetos_lei` pode conter apenas a prévia inicial. */
  projetos_lei_total?: number;
  /** Indica que o cliente deve buscar o inventário completo sob demanda. */
  projetos_lei_truncados?: boolean;
  /**
   * Quantas linhas do acervo INTEIRO são projeto de lei (head-count por
   * `siglaTipo`, issue #138). Denominador do rótulo do card: derivar natureza da
   * prévia de 25 publicaria a prévia como se fosse o acervo. `null` quando a
   * consulta falhou; ausente em cache anterior ao campo. Nos dois casos o
   * consumidor usa o rótulo neutro.
   */
  projetos_lei_natureza_projetos_total?: number | null;
  /**
   * Destaques do acervo INTEIRO (head-count). O card não pode contar destaque
   * só na prévia de 25: destaque na 26ª linha viraria "0 em destaque" ao lado
   * do total completo. `null` = consulta falhou; ausente = cache antigo.
   */
  projetos_lei_destaques_total?: number | null;
  /**
   * Linhas com `fonte = 'Camara'` no acervo inteiro (head-count). Mesma
   * dimensão do `projetosCamara` da régua de cobertura: é contra ELA que a
   * assinatura do corte da issue #138 (100 linhas Câmara) se verifica. Total
   * global não serve, porque soma Senado e curadoria. `null` = consulta
   * falhou; ausente = cache antigo.
   */
  projetos_lei_camara_total?: number | null;
  legislacao_mandato_executivo: LegislacaoMandatoExecutivo[];
  /** Total materializado; `legislacao_mandato_executivo` pode conter apenas a prévia inicial. */
  legislacao_mandato_executivo_total?: number;
  /** Indica que o cliente deve buscar o inventário completo do Executivo sob demanda. */
  legislacao_mandato_executivo_truncados?: boolean;
  gastos_parlamentares: GastoParlamentar[];
  gastos_executivo?: GastoExecutivo[];
  sancoes_administrativas: SancaoAdministrativa[];
  /**
   * Proveniência do zero de sanções: última tentativa de coleta registrada em
   * `coleta_log_ultima` para a fonte `transparencia-sanctions`. `null` quando o
   * candidato nunca foi verificado (ou quando a leitura da view falhou, o que
   * degrada para o mesmo estado neutro em vez de inventar limpeza).
   */
  sancoes_verificacao?: SancoesVerificacao | null;
  /**
   * Proveniência do vazio judicial. Distingue vazio confirmado, busca
   * inconclusiva, erro, ocorrência em revisão e ausência de tentativa.
   */
  processos_verificacao?: ProcessosVerificacao | null;
  /** Auditoria do recorte publicável de mandatos na aba Destaques. */
  trajetoria_verificacao?: SancoesVerificacao | null;
  /** Auditoria da cobertura de patrimônio na aba Destaques. */
  patrimonio_verificacao?: SancoesVerificacao | null;
  /** Auditoria do recorte editorial de votações-chave na aba Destaques. */
  votacoes_verificacao?: SancoesVerificacao | null;
  noticias: NoticiaCandidato[];
  indicadores_estaduais?: IndicadorEstadual[];

  // Contadores
  total_processos: number;
  processos_criminais: number;
  /** Número de trocas efetivas (exclui linha âncora de filiação inicial quando aplicável). */
  total_mudancas_partido: number;
  total_pontos_atencao: number;
  pontos_criticos: number;
  total_sancoes: number;

  // Integridade factual da superficie publicada
  historico_descartado?: number;
  historico_em_revisao?: boolean;
  timeline_partidaria_incompleta?: boolean;
  section_freshness?: Partial<Record<SectionFreshnessKey, SectionFreshnessInfo>>;
}

export interface CandidatoComparavel {
  id: string;
  nome_urna: string;
  slug: string;
  partido_sigla: string;
  cargo_disputado: string;
  cargo_atual: string | null;
  estado: string | null;
  foto_url: string | null;
  idade: number | null;
  formacao: string | null;
  formacao_instituicao?: string | null;
  total_processos: number;
  mudancas_partido: number;
  alertas_graves: number;
  patrimonio_declarado: number | null;
  /**
   * Variação percentual do patrimônio 2026 vs. o último ano anterior registrado.
   * Null quando só há 2026, quando 2026 falta, ou quando o ano anterior é 0.
   */
  evolucao_patrimonial_pct: number | null;
  /** Soma de `total_gasto` em `gastos_parlamentares` — alinhada ao ranking gastos-parlamentares. */
  total_gasto_parlamentar: number | null;
  /** Presença de mandato federal (senador ou deputado federal) em `historico_politico`. Não inclui vereador, deputado estadual nem distrital. */
  tem_historico_legislativo: boolean;
}
