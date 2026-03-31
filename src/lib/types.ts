// ============================================
// PUXA FICHA 2026
// TypeScript Types
// ============================================

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
  profissao_declarada: string | null;
  genero?: string | null;
  estado_civil?: string | null;
  cor_raca?: string | null;

  // Político
  partido_atual: string;
  partido_sigla: string;
  cargo_atual: string | null;
  cargo_disputado: 'Presidente' | 'Governador';
  estado: string | null; // UF pra governadores

  status: 'pre-candidato' | 'candidato' | 'indeferido' | 'desistente' | 'removido';
  biografia?: string | null;

  // Mídia
  foto_url: string | null;
  site_campanha: string | null;
  redes_sociais: Record<string, string>;

  // Meta
  fonte_dados: string[];
  ultima_atualizacao: string;
}

// --- Histórico Político ---
export interface HistoricoPolitico {
  id: string;
  candidato_id: string;
  cargo: string;
  periodo_inicio: number;
  periodo_fim: number | null;
  partido: string;
  estado: string;
  eleito_por: string;
  observacoes: string | null;
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
  maiores_doadores: Doador[];
}

export interface Doador {
  nome: string;
  valor: number;
  tipo: 'PF' | 'PJ' | 'fundo_partidario' | 'fundo_eleitoral' | 'recursos_proprios';
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
}

export interface VotoCandidato {
  id: string;
  candidato_id: string;
  votacao_id: string;
  voto: 'sim' | 'não' | 'abstenção' | 'ausente' | 'obstrução';
  contradicao: boolean;
  contradicao_descricao: string | null;

  // Joined
  votacao?: VotacaoChave;
}

// --- Processos ---
export interface Processo {
  id: string;
  candidato_id: string;
  tipo: 'criminal' | 'improbidade' | 'eleitoral' | 'civil';
  tribunal: string;
  numero_processo: string | null;
  descricao: string;
  status: 'em_andamento' | 'condenado' | 'absolvido' | 'prescrito';
  data_inicio: string | null;
  data_decisao: string | null;
  gravidade: 'alta' | 'media' | 'baixa';
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
  verificado: boolean;
  gerado_por: 'ia' | 'curadoria' | 'automatico';
}

export interface FonteReferencia {
  titulo: string;
  url: string;
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
}

// --- Gastos Parlamentares ---
export interface GastoParlamentar {
  id: string;
  candidato_id: string;
  ano: number;
  total_gasto: number;
  detalhamento: GastoCategoria[];
  gastos_destaque: GastoDestaque[];
}

export interface GastoCategoria {
  categoria: string;
  valor: number;
  fornecedor?: string;
}

export interface GastoDestaque {
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

// --- Noticias ---
export interface NoticiaCandidato {
  id: string;
  candidato_id: string;
  titulo: string;
  fonte: string | null;
  url: string;
  data_publicacao: string;
  snippet: string | null;
}

// --- Views compostas ---

export interface FichaCandidato extends Candidato {
  historico: HistoricoPolitico[];
  mudancas_partido: MudancaPartido[];
  patrimonio: Patrimonio[];
  financiamento: Financiamento[];
  votos: VotoCandidato[];
  processos: Processo[];
  pontos_atencao: PontoAtencao[];
  projetos_lei: ProjetoLei[];
  gastos_parlamentares: GastoParlamentar[];
  sancoes_administrativas: SancaoAdministrativa[];
  noticias: NoticiaCandidato[];

  // Contadores
  total_processos: number;
  processos_criminais: number;
  total_mudancas_partido: number;
  total_pontos_atencao: number;
  pontos_criticos: number;
  total_sancoes: number;
}

export interface CandidatoComparavel {
  id: string;
  nome_urna: string;
  slug: string;
  partido_sigla: string;
  cargo_disputado: string;
  estado: string | null;
  foto_url: string | null;
  idade: number | null;
  formacao: string | null;
  total_processos: number;
  mudancas_partido: number;
  alertas_graves: number;
  patrimonio_declarado: number | null;
  pontos_atencao: PontoAtencao[];
}
