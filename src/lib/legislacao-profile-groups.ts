import type { LegislacaoMandatoExecutivo, ProjetoLei, VotoCandidato } from "@/lib/types"
import {
  deduplicarProposicoesPorEmenta,
  umaLinhaPorTextoDeEmenta,
} from "@/lib/proposicao-dedupe"
import { isProjetoLei } from "@/lib/proposicao-natureza"

export interface LegislacaoProfileGroups {
  propostasParlamentares: ProjetoLei[]
  destaquesParlamentares: ProjetoLei[]
  propostasExecutivo: LegislacaoMandatoExecutivo[]
  destaquesExecutivo: LegislacaoMandatoExecutivo[]
  votosApenas: VotoCandidato[]
  projetosAprovados: ProjetoLei[]
  leisSancionadas: LegislacaoMandatoExecutivo[]
  executivo: LegislacaoMandatoExecutivo[]
  /** Tamanho real do inventário do Executivo; `executivo` pode trazer só a prévia. */
  executivoCount: number
  inventoryScope: ExecutiveLegislationInventoryScope
  totalCount: number
  featuredCount: number
  navigationCount: number
  proposedCount: number
  approvedCount: number
  hasLegislationHighlights: boolean
  hasExecutiveInventoryHighlights: boolean
}

export interface LegislacaoProfileContext {
  cargoDisputado?: string | null
}

export type ExecutiveLegislationInventoryScopeKind =
  | "empty"
  | "complete"
  | "parlamentar_complete"
  | "expanded_partial"

export interface ExecutiveLegislationInventoryScope {
  kind: ExecutiveLegislationInventoryScopeKind
  isComplete: boolean
  tabLabel:
    | "Todas"
    | "Inventário completo do mandato"
    | "Inventário completo da autoria parlamentar"
    | "Inventário ampliado"
  listDescription: string
  featuredDescription: string
}

function normalizeProposicaoId(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function normalizeSource(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized === "câmara" ? "camara" : normalized === "senado" ? "senado" : normalized || null
}

function proposicaoSourceKey(source: string | null | undefined, id: string | null | undefined) {
  const normalizedId = normalizeProposicaoId(id)
  if (!normalizedId) return null
  return `${normalizeSource(source) ?? "unknown"}:${normalizedId}`
}

function isProjetoLeiAprovado(projeto: ProjetoLei) {
  return projeto.situacao?.trim().toLowerCase() === "aprovado"
}

function isPresidentialProfile(cargoDisputado: string | null | undefined) {
  return cargoDisputado?.trim().toLowerCase() === "presidente"
}

function textMatchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value))
}

const LEGISLATION_HIGHLIGHT_MINIMUM = 100
const LEGISLATION_HIGHLIGHT_THRESHOLD = 3
const LEGISLATION_HIGHLIGHT_LIMIT = 10
const LEGISLATION_HIGHLIGHT_CRITERIA =
  "prioriza atos com sinais de política pública, programa, fundo, orçamento, tributos, crédito, segurança, saúde, educação, assistência, clima, infraestrutura ou estrutura do Estado"
const COMPLETE_EXECUTIVE_HIGHLIGHT_SCOPE =
  "Este recorte cobre apenas o exercício de chefe do Executivo descrito no inventário completo de atos do Executivo no mandato; outros cargos públicos do candidato não estão refletidos nesta aba."

const COMPLETE_PARLAMENTAR_AUTHORSHIP_COVERAGE: Record<string, string> = {
  "ivan-moraes-recife-openlegis-completo-autoria-principal-pl-pelo-2017-2024-cutoff-20260512":
    "Inventário completo da autoria parlamentar: autoria principal de Ivan Moraes na Câmara Municipal do Recife/OpenLegis em PL e PELO no recorte 2017-2024, enumerada por @@materias por ano/tipo e confirmada por authorship firstAuthor=true, com cutoff em 12/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara Municipal do Recife/OpenLegis; não cobre inventário global da vida política, atos do Executivo, Assembleia Legislativa, Câmara dos Deputados, campanhas, proposições fora de PL/PELO, proposições sem PDF/ementa/número/ano oficiais, nem superfícies fora do OpenLegis Recife.",
  "leandro-grass-cldf-ple-completo-autoria-principal-pl-2019-2022-cutoff-20260512":
    "Inventário completo da autoria parlamentar: autoria principal de Leandro Grass na Câmara Legislativa do Distrito Federal/PLE em Projeto de Lei (PL), no recorte 2019-2022, enumerada pelo filtro público PLE autoria=Leandro Grass e tipoProposicao=Projeto de Lei com primeira autoria confirmada no detalhe, com cutoff em 12/05/2026. Este recorte cobre apenas autoria parlamentar principal no PLE da CLDF; não cobre inventário global da vida política, Câmara dos Deputados, cargos executivos, campanhas, proposições fora de PL, coautorias em que ele não aparece como primeiro autor, nem superfícies fora do PLE CLDF.",
  "adailton-furia-sapl-alro-completo-autoria-principal-plo-2019-2020-cutoff-20260512":
    "Inventário completo da autoria parlamentar: autoria principal de Adailton Fúria na Assembleia Legislativa de Rondônia/SAPL ALRO em Projeto de Lei Ordinária (PLO), no recorte 2019-2020, enumerada pela pesquisa oficial SAPL ALRO tipo=1 e confirmada pela autoria literal iniciada por Adailton Fúria, com cutoff em 12/05/2026. Este recorte cobre apenas autoria parlamentar principal em PLO no SAPL ALRO; não cobre inventário global da vida política, mandatos de Vereador e Prefeito, atos do Executivo municipal, proposições fora de PLO/tipo=1, proposições em que ele não aparece como primeiro nome da autoria literal, nem superfícies fora do SAPL ALRO.",
  "dr-furlan-alap-elegis-completo-autoria-principal-pl-2014-2020-cutoff-20260512":
    "Inventário completo da autoria parlamentar: autoria principal de Dr. Furlan na Assembleia Legislativa do Amapá/eLegis em Projeto de Lei Ordinária (PL), no recorte 2014-2020, enumerada pela pesquisa oficial eLegis ALAP tipo_proposicao=1 origem=Dr. Furlan e confirmada por autoria singular Deputado Dr. Furlan, com cutoff em 12/05/2026. Este recorte cobre apenas autoria parlamentar principal em PL no eLegis ALAP; não cobre inventário global da vida política, Prefeitura de Macapá, atos do Executivo municipal, PEC, Projeto de Decreto Legislativo, Projeto de Resolução, proposições anteriores ao mandato parlamentar compatível, proposições em que ele não aparece como autoria principal singular, nem superfícies fora do eLegis ALAP.",
  "aldo-rebelo-camara-completo-autoria-1991-2014-20260430":
    "Inventário completo da autoria parlamentar: proposições legislativas (PL, PEC, PLP, PDC, PDL, PDS, PRC, MSC) onde Aldo Rebelo é autor principal (ordemAssinatura=1) na Câmara dos Deputados nas legislaturas 49ª-54ª (1991-2014), enumeradas via API Câmara Dados Abertos v2 com cutoff em 30/04/2026. Este recorte cobre apenas a autoria parlamentar Câmara; cargos ministeriais (Ciência e Tecnologia, Esporte, Defesa) e a Presidência da Câmara não estão refletidos nesta aba.",
  "eduardo-paes-camara-completo-autoria-principal-tipos-verificados-1999-2006-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Eduardo Paes na Camara dos Deputados em tipos verificados (EMC, EMP, INC, PDC, PEC, PFC, PL, PLP, REC, REQ e RIC), no recorte 1999-2006, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=74683 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "acm-neto-camara-completo-autoria-principal-tipos-verificados-2003-2012-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de ACM Neto na Camara dos Deputados em tipos verificados (EMA, EMC, EMP, ERD, INC, PEC, PFC, PL, PLP, PRC, REC, REM, REQ e RIC), no recorte 2003-2012, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=74058 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "anderson-ferreira-camara-completo-autoria-principal-tipos-verificados-2011-2016-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Anderson Ferreira na Camara dos Deputados em tipos verificados (EMC, PDC, PL, REQ e RIC), no recorte 2011-2016, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=160551 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "celina-leao-camara-completo-autoria-principal-tipos-verificados-2019-2022-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Celina Leao na Camara dos Deputados em tipos verificados (EMC, ESB, INC, PDL, PL, PLP, PLV, PRC, REQ, RIC e SLD), no recorte 2019-2022, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=204380 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "decio-lima-camara-completo-autoria-principal-tipos-verificados-2007-2018-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Decio Lima na Camara dos Deputados em tipos verificados (EMC, EMP, PDC, PEC, PFC, PL, PLP, PRC, R.C, REC, REQ e RIC), no recorte 2007-2018, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=141413 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "eduardo-braide-camara-completo-autoria-principal-tipos-verificados-2019-2020-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Eduardo Braide na Camara dos Deputados em tipos verificados (EMC, INC, PEC, PL e REQ), no recorte 2019-2020, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=204552 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "fabio-mitidieri-camara-completo-autoria-principal-tipos-verificados-2015-2022-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Fabio Mitidieri na Camara dos Deputados em tipos verificados (EMC, INC, PL, PLP, PRC, REQ e RIC), no recorte 2015-2022, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=178969 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "garotinho-camara-completo-autoria-principal-tipos-verificados-2011-2014-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Garotinho na Camara dos Deputados em tipos verificados (EMC, EMP, INC, PFC, PL, PLP, PRC, REC, REQ e RIC), no recorte 2011-2014, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=160539 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "gilberto-kassab-camara-completo-autoria-principal-tipos-verificados-1999-2004-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Gilberto Kassab na Camara dos Deputados em tipos verificados (EMC, INC, PEC, PL, REC, REL, REQ e RIC), no recorte 1999-2004, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=74778 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "helder-salomao-camara-completo-autoria-principal-tipos-verificados-2015-2026-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Helder Salomao na Camara dos Deputados em tipos verificados (EMC, PDC, PDL, PL, PLP, PRC, REC, REL, REQ, RIC, RPDR e SOR), no recorte 2015-2026, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=178873 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "jhc-camara-completo-autoria-principal-tipos-verificados-2015-2020-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de JHC na Camara dos Deputados em tipos verificados (EMC, INC, PDC, PEC, PFC, PL, PLP, PRC, RCP, REC, REQ, RIC e SIT), no recorte 2015-2020, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=178842 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "joao-campos-camara-completo-autoria-principal-tipos-verificados-2019-2020-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Joao Campos na Camara dos Deputados em tipos verificados (EMC, INC, PDL, PL, PRC, RCP, REQ e RIC), no recorte 2019-2020, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=204429 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "joao-rodrigues-camara-completo-autoria-principal-tipos-verificados-2011-2017-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Joao Rodrigues na Camara dos Deputados em tipos verificados (EMC, INC, PDC, PEC, PL, PLP e REQ), no recorte 2011-2017, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=160571 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "laurez-moreira-camara-completo-autoria-principal-tipos-verificados-2007-2012-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Laurez Moreira na Camara dos Deputados em tipos verificados (PL, PLP, REQ e RIC), no recorte 2007-2012, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=141479 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "rafael-greca-camara-completo-autoria-principal-tipos-verificados-2000-2002-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Rafael Greca na Camara dos Deputados em tipos verificados (PL e RIC), no recorte 2000-2002, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=73465 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "renan-filho-camara-completo-autoria-principal-tipos-verificados-2011-2014-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Renan Filho na Camara dos Deputados em tipos verificados (EMC, PL, PLP, PRC, PRN e REQ), no recorte 2011-2014, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=160623 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "teresa-surita-camara-completo-autoria-principal-tipos-verificados-1991-2012-cutoff-20260511":
    "Inventario completo da autoria parlamentar: autoria principal de Teresa Surita na Camara dos Deputados em tipos verificados (EMC, PEC, PFC, PL, PLP, REQ e RIC), no recorte 1991-2012, enumerada via Camara Dados Abertos v2 por idDeputadoAutor=160608 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1 e proponente=1, com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal na Camara; nao cobre inventario global da vida politica, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, campanhas, proposicoes em que ele nao aparece como autor principal, nem superficies fora da Camara Dados Abertos.",
  "geraldo-alckmin-camara-completo-autoria-principal-tipos-legislativos-1987-1994-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal de Geraldo Alckmin na Câmara dos Deputados em tipos legislativos canônicos (PDC, PL, PLP e PRC), no recorte 1987-1994, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor=65480 e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara; não cobre inventário global da vida política, atos do Executivo em São Paulo, Vice-Presidência, ministérios, Prefeitura, ALESP, Senado, campanhas, requerimentos RIC/RQC ou PLs em que ele não aparece como autor principal.",
  "orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal de Orleans Brandão (Carlos Brandão na Câmara) na Câmara dos Deputados em tipos verificados (EMC, INC, PEC, PFC, PL, PLP, REQ e RIC), no recorte 2007-2014, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor=141402 em 3 páginas oficiais e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara com ano oficial verificável; não cobre inventário global da vida política, atos do Executivo no Maranhão, Governo do Maranhão, Vice-Governo, STC/Legisla Maranhão, assembleia estadual, prefeitura, Senado, campanhas, nem proposições em que ele não aparece como autor principal ou sem ano oficial verificável.",
  "ciro-gomes-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal de Ciro Gomes na Câmara dos Deputados em tipos verificados (EMA, PEP, PRL, PRR, RDF, REC, REQ e SBT), no recorte do mandato federal 2007-2010, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor=141406 em página única oficial e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara; não cobre inventário global da vida política, Prefeitura de Fortaleza, Governo do Ceará, ministérios, campanhas, outros cargos executivos, nem proposições em que ele não aparece como autor principal.",
  "ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal de Ciro Gomes na Câmara dos Deputados em tipos verificados (EMA, PEP, PRL, PRR, RDF, REC, REQ e SBT), no recorte do mandato federal 2007-2010, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor=141406 em página única oficial e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara; não cobre inventário global da vida política, Prefeitura de Fortaleza, Governo do Ceará, ministérios, campanhas, outros cargos executivos, nem proposições em que ele não aparece como autor principal.",
  "daniel-vilela-camara-completo-autoria-principal-tipos-verificados-2015-2018-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal de Daniel Vilela na Câmara dos Deputados em tipos verificados (EMA, EMC, EMP, INC, PEC, PFC, PL, PLC, PLP, PRC, REC, REQ, RIC e RRC), no recorte de anos oficiais 2015-2018, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor=144523 em 5 páginas oficiais e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara; não cobre inventário global da vida política, atos do Executivo em Goiás, Governo de Goiás, assembleia estadual, prefeitura, campanhas, atos executivos, nem proposições em que ele não aparece como autor principal ou sem ano oficial verificável.",
  "ratinho-junior-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal de Ratinho Junior na Câmara dos Deputados em tipos verificados (EMC, EMP, INA, INC, PEC, PL, PLV, REC, REQ e RIC), no recorte de anos oficiais 2007-2014, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor=141403 em 11 páginas oficiais e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara; não cobre inventário global da vida política, atos do Executivo no Paraná, Governo do Paraná, assembleia estadual, prefeitura, campanhas, atos executivos, nem proposições em que ele não aparece como autor principal ou sem ano oficial verificável.",
  "alexandre-curi-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Alexandre Curi na Assembleia Legislativa do Paraná em tipos legislativos substantivos (PL e PLC aceitos a partir dos relatórios oficiais de PRO/PLC), no recorte 2019-2026 com cutoff em 30/04/2026, enumerada pela página oficial ALEP Transparência de atividade por parlamentar e PDFs oficiais de autoria. Este recorte cobre apenas autoria parlamentar principal na ALEP; não cobre inventário global da vida política, atos do Executivo, Governo do Paraná, prefeitura, Senado, Câmara dos Deputados, campanhas, atos procedimentais ou proposições em que ele não aparece como autor principal.",
  "requiao-filho-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Requiao Filho na Assembleia Legislativa do Paraná em tipos legislativos substantivos (PL aceitos a partir dos relatórios oficiais de PRO), no recorte 2019-2026 com cutoff em 30/04/2026, enumerada pela página oficial ALEP Transparência de atividade por parlamentar e PDFs oficiais de autoria. Este recorte cobre apenas autoria parlamentar principal na ALEP; não cobre inventário global da vida política, atos do Executivo, Governo do Paraná, prefeitura, Senado, Câmara dos Deputados, campanhas, atos procedimentais ou proposições em que ele não aparece como autor principal.",
  "edegar-pretto-alrs-completo-autoria-principal-tipos-legislativos-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Edegar Pretto na Assembleia Legislativa do Rio Grande do Sul em tipos legislativos substantivos (PL e PLC), enumerada pela busca oficial de proposições legislativas da ALRS por proponente/tipo com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal na ALRS; não cobre inventário global da vida política, atos do Executivo, governo estadual, prefeitura, Câmara, Senado, campanhas, atos de comissão ou proposições em que ele não aparece como primeiro proponente.",
  "gabriel-souza-alrs-completo-autoria-principal-tipos-legislativos-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Gabriel Souza na Assembleia Legislativa do Rio Grande do Sul em tipos legislativos substantivos (PDL, PEC, PL, PLC e PR), enumerada pela busca oficial de proposições legislativas da ALRS por proponente/tipo com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal na ALRS; não cobre inventário global da vida política, atos do Executivo, Vice-Governo, governo estadual, prefeitura, Câmara, Senado, campanhas, atos de comissão ou proposições em que ele não aparece como primeiro proponente.",
  "juliana-brizola-alrs-completo-autoria-principal-tipos-legislativos-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Juliana Brizola na Assembleia Legislativa do Rio Grande do Sul em tipos legislativos substantivos (PEC, PL, PLC e PR), enumerada pela busca oficial de proposições legislativas da ALRS por proponente/tipo com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal na ALRS; não cobre inventário global da vida política, atos do Executivo, prefeitura, Câmara, Senado, campanhas, atos de comissão ou proposições em que ela não aparece como primeira proponente.",
  "marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Marcos Vieira na Assembleia Legislativa de Santa Catarina em projetos de lei (PL) do e-Legis/ALESC, no recorte 2023-2026, enumerada pela busca oficial de Processo Legislativo por iniciativa=Deputado Marcos Vieira com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal na ALESC/e-Legis; não cobre inventário global da vida política, proposições anteriores a 2023 no sistema legado da ALESC, atos do Executivo, Governo de Santa Catarina, prefeitura, Senado, Câmara dos Deputados, campanhas, relatorias, emendas, indicações, moções ou proposições em que ele não aparece como autor principal.",
  "janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Janaina Riva na Assembleia Legislativa de Mato Grosso em projeto de lei ordinária (PLO) no SAPL/ALMT, no recorte 2015, enumerada pelo endpoint oficial de autoria por autor_id=10 em página única com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal no SAPL/ALMT; não cobre inventário global da vida política, atos do Executivo em Mato Grosso, campanhas, Senado, Câmara dos Deputados, relatorias, emendas, indicações, proposições posteriores ao cutoff ou proposições em que ela não aparece como autora principal.",
  "amelio-cayres-alto-completo-autoria-principal-tipos-legislativos-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Amelio Cayres na Assembleia Legislativa do Tocantins em tipos legislativos substantivos (PLO, PLCC, PEC, PDL e PR) no SAPL/ALTO, enumerada pelo endpoint oficial de autoria por author_id=12 em 2 páginas oficiais com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal no SAPL/ALTO; não cobre inventário global da vida política, atos do Executivo em Tocantins, Prefeitura, Governo do Tocantins, Câmara, Senado, campanhas, relatorias, emendas, requerimentos ou proposições em que ele não aparece como primeiro autor.",
  "soldado-sampaio-alrr-completo-autoria-principal-tipos-legislativos-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de Soldado Sampaio na Assembleia Legislativa de Roraima em tipos legislativos substantivos (PL, PLC, PEC, PDL e PRL) no SAPL/ALRR, enumerada pelo endpoint oficial de autoria por author_id=64 em 9 páginas oficiais com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal no SAPL/ALRR; não cobre inventário global da vida política, atos do Executivo em Roraima, Câmara, Senado, campanhas, relatorias, emendas, requerimentos ou proposições em que ele não aparece como primeiro autor.",
  "andre-kamai-rio-branco-sapl-completo-autoria-principal-tipos-legislativos-cutoff-20260511":
    "Inventário completo da autoria parlamentar: autoria principal de André Kamai na Câmara Municipal de Rio Branco em tipos legislativos substantivos (PLO, PDL e PRE) no SAPL Rio Branco, enumerada pelo endpoint oficial de autoria por author_id=138 em 4 páginas oficiais com cutoff em 11/05/2026. Este recorte cobre apenas autoria parlamentar principal no SAPL Rio Branco; não cobre inventário global da vida política, atos do Executivo, Prefeitura, Governo do Acre, Câmara dos Deputados, Senado, campanhas, relatorias, emendas, requerimentos, indicações, moções ou proposições em que ele não aparece como primeiro autor.",
  "david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510":
    "Inventário completo da autoria parlamentar: autoria principal de David Almeida na Assembleia Legislativa do Amazonas em projetos de lei (PL) no SAPL/ALEAM, no recorte 2007-2018, enumerada pela pesquisa oficial de matérias legislativas por autoria__autor=14 e tipo=1 com cutoff em 10/05/2026. Este recorte cobre apenas autoria parlamentar principal no SAPL/ALEAM; não cobre inventário global da vida política, atos do Executivo no Amazonas ou em Manaus, Governo do Amazonas, Prefeitura de Manaus, Câmara, Senado, campanhas, relatorias, emendas, requerimentos ou proposições em coautoria sem autoria principal literal.",
  "ataides-oliveira-senado-completo-autoria-substantiva-2011-2018-20260505":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PLS, PEC e PRS) em que Ataídes Oliveira aparece como autor principal, no recorte 2011-2018, enumerada via Senado Dados Abertos com cutoff em 05/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, ALERJ, Câmara dos Deputados, prefeitura, governo estadual, atos executivos, candidatura de 2018 ou pleito 2026.",
  "ricardo-ferraco-senado-completo-autoria-substantiva-2011-2018-20260505":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDS, PEC, PLS e PRS) em que Ricardo Ferraço aparece como autor principal, no recorte 2011-2018, enumerada via Senado Dados Abertos com cutoff em 05/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, ALERJ, Câmara dos Deputados, prefeitura, governo estadual ou atos executivos.",
  "flavio-bolsonaro-senado-completo-autoria-substantiva-2019-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC, PL, PLP, PCE, PDL e PRS) em que Flavio Bolsonaro aparece como autor principal, no recorte 2019-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, ALERJ, Câmara dos Deputados, prefeitura, governo estadual ou atos executivos.",
  "alan-rick-senado-completo-autoria-substantiva-2023-2026-20260505":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP e PRS) em que Alan Rick aparece como autor principal, no recorte 2023-2026, enumerada via Senado Dados Abertos com cutoff em 05/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PL) em que Beto Faro aparece como autor principal, no recorte 2023-2025, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "cicero-lucena-senado-completo-autoria-substantiva-2007-2014-20260505":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC e PLS) em que Cícero Lucena aparece como autor principal, no recorte 2007-2014, enumerada via Senado Dados Abertos com cutoff em 05/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "cleitinho-senado-completo-autoria-substantiva-2023-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP e PRS) em que Cleitinho aparece como autor principal, no recorte 2023-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "confucio-moura-senado-completo-autoria-substantiva-2019-2025-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC, PL, PLP e PRS) em que Confúcio Moura aparece como autor principal, no recorte 2019-2025, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "eduardo-braga-senado-completo-autoria-substantiva-2011-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PDS, PEC, PL, PLP, PLS e PRS) em que Eduardo Braga aparece como autor principal, no recorte 2011-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP e PRS) em que Eduardo Girão aparece como autor principal, no recorte 2019-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260711":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP e PRS) em que Eduardo Girão aparece como autor principal, no recorte 2019-2026, enumerada via Senado Dados Abertos com cutoff em 11/07/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PL e PLP) em que Efraim Filho aparece como autor principal, no recorte 2023-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "joao-capiberibe-senado-completo-autoria-substantiva-2003-2018-20260505":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDS, PEC, PLS e PRS) em que João Capiberibe aparece como autor principal, no recorte 2003-2018, enumerada via Senado Dados Abertos com cutoff em 05/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "jorginho-mello-senado-completo-autoria-substantiva-2019-2022-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PL e PLP) em que Jorginho Mello aparece como autor principal, no recorte 2019-2022, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "marconi-perillo-senado-completo-autoria-substantiva-2007-2010-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC, PLS e PRS) em que Marconi Perillo aparece como autor principal, no recorte 2007-2010, enumerada via Senado Dados Abertos CodigoParlamentar 4535 com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, atos do Executivo em Goiás, demais mandatos de governador, decretos estaduais, assembleia estadual, prefeitura, campanhas ou atos executivos.",
  "marcos-rogerio-senado-completo-autoria-substantiva-2019-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP e PRS) em que Marcos Rogério aparece como autor principal, no recorte 2019-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC, PL, PLS e PRS) em que Omar Aziz aparece como autor principal, no recorte 2015-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "pedro-cunha-lima-senado-completo-autoria-substantiva-1978-1982-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PLS) em que Pedro Cunha Lima aparece como autor principal, no recorte 1978-1982, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "professora-dorinha-senado-completo-autoria-substantiva-2023-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC, PL, PLP e PRS) em que Professora Dorinha aparece como autor principal, no recorte 2023-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "rodrigo-pacheco-senado-completo-autoria-substantiva-2019-2025-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP e PRS) em que Rodrigo Pacheco aparece como autor principal, no recorte 2019-2025, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC e PL) em que Sérgio Moro aparece como autor principal, no recorte 2023-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "wellington-fagundes-senado-completo-autoria-substantiva-2015-2026-20260506":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PDL, PEC, PL, PLP, PLS e PRS) em que Wellington Fagundes aparece como autor principal, no recorte 2015-2026, enumerada via Senado Dados Abertos com cutoff em 06/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado; não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "wilder-morais-senado-completo-autoria-substantiva-2023-2026-20260512":
    "Inventário completo da autoria parlamentar: autoria parlamentar substantiva no Senado Federal (PEC, PL e PLP) em que Wilder Morais aparece como autor principal, no recorte do mandato atual 2023-2026, enumerada via Senado Dados Abertos com cutoff em 12/05/2026. Este recorte cobre apenas autoria parlamentar substantiva no Senado no mandato atual; não cobre o mandato anterior no Senado, não cobre inventário global da vida política, Câmara dos Deputados, assembleia estadual, prefeitura, governo estadual ou atos executivos.",
  "paulo-martins-gov-pr-camara-completo-autoria-principal-tipos-legislativos-2016-2022-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PL e PLP) no recorte 2016-2022, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "thiago-de-joaldo-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PL e PLP) no recorte 2023-2026, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "adriana-accorsi-camara-completo-autoria-principal-tipos-legislativos-2023-2025-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PL) no recorte 2023-2025, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "guilherme-derrite-camara-completo-autoria-principal-tipos-legislativos-2019-2024-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PL, PLP e PRC) no recorte 2019-2024, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "nikolas-ferreira-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PL, PLP e PRC) no recorte 2023-2026, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "joao-roma-camara-completo-autoria-principal-tipos-legislativos-1951-2020-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PL e PLP) no recorte 1951-2020, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "fabio-trad-camara-completo-autoria-principal-tipos-legislativos-2011-2022-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PEC, PL, PLP e PRC) no recorte 2011-2022, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "capitao-wagner-camara-completo-autoria-principal-tipos-legislativos-2019-2022-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PL, PLP e PRC) no recorte 2019-2022, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "margarete-coelho-camara-completo-autoria-principal-tipos-legislativos-2019-2021-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PEC e PL) no recorte 2019-2021, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "expedito-netto-camara-completo-autoria-principal-tipos-legislativos-2015-2021-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDC, PL, PLP e PRC) no recorte 2015-2021, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "delegado-eder-mauro-camara-completo-autoria-principal-tipos-legislativos-2015-2026-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PL e PLP) no recorte 2015-2026, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "dr-fernando-maximo-camara-completo-autoria-principal-tipos-legislativos-2023-2025-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PL, PLP e PRC) no recorte 2023-2025, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "erika-hilton-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PEC, PL, PLP e PRC) no recorte 2023-2026, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "jose-carlos-aleluia-camara-completo-autoria-principal-tipos-legislativos-1992-2018-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDC, PEC, PL, PLP e PRC) no recorte 1992-2018, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "luciano-zucco-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PL e PRC) no recorte 2023-2026, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "paula-belmonte-camara-completo-autoria-principal-tipos-legislativos-2019-2022-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PEC, PL, PLP e PRC) no recorte 2019-2022, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
  "vicentinho-junior-camara-completo-autoria-principal-tipos-legislativos-2015-2026-cutoff-20260509":
    "Inventário completo da autoria parlamentar: autoria principal na Câmara dos Deputados em tipos legislativos canônicos (PDL, PEC, PL, PLP e PRC) no recorte 2015-2026, enumerada via Câmara Dados Abertos v2 por idDeputadoAutor e confirmada em /proposicoes/{id}/autores com ordemAssinatura=1, com cutoff em 09/05/2026. Este recorte cobre apenas autoria parlamentar principal na Câmara em tipos legislativos canônicos; não cobre inventário global da vida política, Senado, assembleias, prefeituras, governos estaduais, cargos executivos, atos do Executivo, requerimentos, indicações, emendas, pareceres ou demais atos procedimentais.",
}

const COMPLETE_EXECUTIVE_LEGISLATION_COVERAGE: Record<string, string> = {
  "eduardo-leite-rs-completo-leis-ordinarias-complementares-2019-2022-2023-2026-04-27":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares do RS encontradas na ALRS com assinatura de Eduardo Leite confirmada no DOE-RS até 27/04/2026. Este recorte cobre apenas o exercício de Governador do RS; cargos públicos anteriores ou paralelos não estão refletidos nesta aba.",
  "lula-federal-atual-completo-leis-ordinarias-complementares-2023-2026-04-28":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares federais do mandato presidencial iniciado em 2023, encontradas nos índices do Planalto e verificadas em texto oficial até 28/04/2026. A relação e o signatário de cada norma são exibidos por ato. Este recorte cobre apenas a Presidência atual; mandatos presidenciais anteriores e cargos públicos paralelos não estão refletidos nesta aba.",
  "tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares do governo de São Paulo derivadas do índice oficial da ALESP no mandato iniciado em 2023, com cutoff em 14/04/2026. Quatro atos foram excluídos formalmente por motivo da fonte oficial e estão documentados na auditoria; atos sancionados após 14/04/2026 ficam fora deste recorte e exigirão um novo coverage_id. Este recorte cobre apenas o exercício atual de Governador de SP; cargos públicos anteriores ou paralelos não estão refletidos nesta aba.",
  "tarcisio-gov-sp-alesp-completo-leis-ordinarias-complementares-2023-2026-04-28":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares do governo de São Paulo derivadas do índice oficial da ALESP no mandato iniciado em 2023, com cutoff em 28/04/2026. Quatro atos foram excluídos formalmente por motivo da fonte oficial e estão documentados na auditoria; atos sancionados após 28/04/2026 ficam fora deste recorte e exigirão um novo coverage_id. Este recorte cobre apenas o exercício atual de Governador de SP; cargos públicos anteriores ou paralelos não estão refletidos nesta aba.",
  "romeu-zema-mg-inventario-completo-leis-ordinarias-complementares-2019-2026-04-30":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares de Minas Gerais derivadas da enumeração oficial da ALMG (Legislação Mineira) cobrindo os mandatos iniciados em 2019 e 2023, com cutoff em 29/04/2026. Inclui atos sancionados pelo titular Romeu Zema e por delegados em exercício (Vice-Governador, Presidente da ALMG e Presidente do TJMG), além de leis promulgadas pela Mesa da Assembleia após derrubada de veto. A relação e o signatário de cada norma são exibidos por ato. Atos sancionados após 29/04/2026 ficam fora deste recorte e exigirão um novo coverage_id. Este recorte cobre apenas os exercícios de Governador de MG iniciados em 2019 e 2023; cargos públicos anteriores ou paralelos não estão refletidos nesta aba.",
  "aecio-neves-mg-inventario-completo-leis-ordinarias-complementares-2003-2010-03-31":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares de Minas Gerais derivadas da enumeração oficial da ALMG (Legislação Mineira), com texto original verificado por assinatura Aécio Neves e data até 31/03/2010. Este recorte cobre apenas o exercício de Governador de MG entre 2003 e a renúncia em 31/03/2010; cargos públicos anteriores, Senado, Câmara e atos posteriores do sucessor não estão refletidos nesta aba.",
  "ronaldo-caiado-go-completo-leis-2019-01-01-2026-03-27":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares de Goiás derivadas do índice oficial da Casa Civil (Legisla Goiás) cobrindo os mandatos iniciados em 2019 e 2023, com cutoff em 27/03/2026. O signatário de cada norma foi verificado via busca em texto integral (conteudo_sem_formatacao) na API Legisla Goiás. A relação e o signatário de cada norma são exibidos por ato. Atos sancionados após 27/03/2026 ficam fora deste recorte e exigirão um novo coverage_id. Este recorte cobre apenas os exercícios de Governador de GO iniciados em 2019 e 2023; cargos públicos anteriores ou paralelos não estão refletidos nesta aba.",
  "felicio-ramuth-sp-alesp-vice-completo-leis-ordinarias-complementares-2023-2026-cutoff-20260509":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias e complementares de São Paulo cujo texto integral oficial da ALESP traz Felício Ramuth como Vice-Governador em exercício no cargo de Governador, no recorte 2023-2026 com cutoff em 09/05/2026. Três normas indexadas sem URL de texto integral na ALESP foram formalmente excluídas deste coverage_id. Este recorte cobre apenas esses atos assinados como vice em exercício; não cobre Prefeitura de São José dos Campos, exercício ordinário de Vice-Governador sem assinatura de ato, Governo de SP como titular ou vida política completa.",
  "jeronimo-ba-legislabahia-leis-ordinarias-assinadas-2023-2026-cutoff-20260511":
    "Inventário completo de atos do Executivo no mandato: leis ordinárias estaduais da Bahia encontradas no Portal de Legislação do Estado da Bahia/Casa Civil (Legisla Bahia) com assinatura de Jerônimo Rodrigues confirmada em texto integral, no recorte 2023-2026 com cutoff em 11/05/2026. As Leis 15.123/2026 e 15.121/2026 foram excluídas por fonte oficial DOEL/ALBA como promulgadas pela Assembleia Legislativa, não assinadas pelo Governador. Este recorte cobre apenas leis ordinárias assinadas por Jerônimo como Governador da Bahia; não cobre inventário global da vida política, projetos_lei, leis promulgadas pela Assembleia, atos de governador(a) em exercício diferente, ou atos posteriores ao cutoff.",
  "haddad-sp-prefeitura-completo-leis-municipais-2013-2016-cutoff-20260512":
    "Inventário completo de atos do Executivo no mandato: leis municipais do Catálogo de Legislação Municipal da Prefeitura de São Paulo, tipo LEI, assinadas/promulgadas por Fernando Haddad como Prefeito de São Paulo no recorte 01/01/2013-31/12/2016, enumeradas por busca oficial paginada da PMSP e verificadas em texto integral por fórmula/assinatura nominal. Este recorte cobre apenas leis municipais no Catálogo PMSP durante o exercício de Prefeito; não cobre inventário global da vida política, projetos_lei/autoria parlamentar, decretos, portarias, Ministério da Fazenda, candidatura ao Governo de SP, leis promulgadas pelo Legislativo sem assinatura de Fernando Haddad, atos fora do Catálogo PMSP, nem atos posteriores a 31/12/2016.",
  "ricardo-nunes-sp-prefeitura-completo-leis-municipais-2021-2026-cutoff-20260512":
    "Inventário completo de atos do Executivo no mandato: leis municipais do Catálogo de Legislação Municipal da Prefeitura de São Paulo, tipo LEI, assinadas/promulgadas por Ricardo Nunes como Prefeito de São Paulo no recorte 16/05/2021-12/05/2026, enumeradas por busca oficial paginada da PMSP e verificadas em texto integral por fórmula/assinatura nominal. Este recorte cobre apenas leis municipais no Catálogo PMSP durante o exercício de Prefeito; não cobre inventário global da vida política, projetos_lei/autoria parlamentar, decretos, portarias, leis promulgadas pelo Legislativo sem assinatura de Ricardo Nunes, atos fora do Catálogo PMSP, nem atos posteriores ao cutoff.",
}

export const EXECUTIVE_LEGISLATION_HIGH_IMPACT_PATTERNS = [
  /programa/i,
  /pol[ií]tica/i,
  /sistema/i,
  /fundo/i,
  /benef[ií]cio/i,
  /habitacional/i,
  /assist[eê]ncia social/i,
  /sa[uú]de/i,
  /educa[cç][aã]o/i,
  /seguran[cç]a/i,
  /viol[eê]ncia/i,
  /mulheres?/i,
  /crian[cç]as?/i,
  /adolescentes?/i,
  /or[cç]amento/i,
  /cr[eé]dito/i,
  /tribut/i,
  /icms/i,
  /concess[aã]o/i,
  /privatiza/i,
  /empresa p[uú]blica/i,
  /desenvolvimento/i,
  /infraestrutura/i,
  /meio ambiente/i,
  /clima/i,
  /calamidade/i,
  /emerg[eê]ncia/i,
  /enchente/i,
  /moradia/i,
  /habita[cç][aã]o/i,
  /servidores?/i,
  /carreira/i,
  /magist[eé]rio/i,
  /pol[ií]cia/i,
  /policiais?/i,
  /bombeiros/i,
  /defesa civil/i,
  /opera[cç][aã]o de cr[eé]dito/i,
  /zona franca/i,
  /semi[aá]rido/i,
  /mobilidade/i,
  /transporte/i,
  /aeroport/i,
  /turismo/i,
  /saneamento/i,
  /receita federal/i,
  /fiscal/i,
  /trabalho/i,
  /c[aâ]ncer/i,
  /preven[cç][aã]o/i,
  /cal[cç]adas?/i,
]

export const EXECUTIVE_LEGISLATION_LOW_IMPACT_PATTERNS = [
  /^declara/i,
  /declara .*capital/i,
  /denomina/i,
  /reconhece como de relevante interesse/i,
  /institui .*dia/i,
  /institui .*semana/i,
  /inclui .*calend[aá]rio/i,
  /altera .*calend[aá]rio/i,
  /t[ií]tulo/i,
  /honor/i,
  /patrim[oô]nio hist[oó]rico/i,
]

function scoreLegislationTextPublicRelevance(text: string | null | undefined) {
  const value = text ?? ""
  if (!value.trim()) return 0

  let score = 0

  for (const pattern of EXECUTIVE_LEGISLATION_HIGH_IMPACT_PATTERNS) {
    if (pattern.test(value)) score += 1
  }

  if (/institui/i.test(value)) score += 1
  if (/autoriza o Poder Executivo/i.test(value)) score += 1
  if (/altera a Lei/i.test(value)) score -= 0.5
  if (textMatchesAny(value, EXECUTIVE_LEGISLATION_LOW_IMPACT_PATTERNS)) score -= 2

  return score
}

function scoreExecutiveLegislationPublicRelevance(lei: LegislacaoMandatoExecutivo) {
  const text = lei.ementa ?? ""
  if (!text.trim()) return 0

  let score = scoreLegislationTextPublicRelevance(text)
  if (lei.tipo_relacao === "projeto_enviado_pelo_executivo") score += 2
  if (lei.tipo_relacao === "lei_promulgada_pelo_legislativo") score += 1

  return score
}

function scoreProjetoLeiPublicRelevance(projeto: ProjetoLei) {
  return (projeto.destaque ? 100 : 0) + scoreLegislationTextPublicRelevance(projeto.ementa)
}

/**
 * Precedência do recorte de destaques (item 8 da triagem de 09/08/2026).
 *
 * `0` é ato normativo: lei ou projeto que, aprovado, vira norma. `1` é
 * proposição acessória de autoria (requerimento, requerimento de informação,
 * indicação, emenda a texto de terceiro). A ordem é dura, não um peso somado:
 * requerimento só ocupa vaga que sobrou depois que todo projeto de lei
 * qualificado entrou.
 *
 * O caso do print é `cabo-daciolo`: 204 proposições autorais, 58 delas projeto
 * de lei, e a vaga de destaque disputada por requerimentos de inclusão em pauta
 * cuja ementa cita "Policiais Militares, Bombeiros" e por isso pontua na
 * heurística de relevância. Pedir pauta é atuação parlamentar real, mas não é a
 * proposta que a ficha promete quando diz "autoria legislativa em destaque".
 */
const HIGHLIGHT_RANK_NORMATIVO = 0
const HIGHLIGHT_RANK_ACESSORIO = 1

function compareHighlightCandidates(
  a: { rank: number; score: number; dateKey: string; stableKey: string },
  b: { rank: number; score: number; dateKey: string; stableKey: string }
) {
  const rankCompare = a.rank - b.rank
  if (rankCompare !== 0) return rankCompare

  const scoreCompare = b.score - a.score
  if (scoreCompare !== 0) return scoreCompare

  const dateCompare = b.dateKey.localeCompare(a.dateKey)
  if (dateCompare !== 0) return dateCompare

  return a.stableKey.localeCompare(b.stableKey)
}

function resolveFeaturedLegislation({
  projetosLei,
  legislacaoMandatoExecutivo,
}: {
  projetosLei: ProjetoLei[]
  legislacaoMandatoExecutivo: LegislacaoMandatoExecutivo[]
}) {
  /**
   * Dois filtros antes de pontuar, e eles não são o mesmo:
   *
   * - `deduplicarProposicoesPorEmenta` colapsa reapresentação de verdade e
   *   escolhe o representante (curadoria editorial primeiro, senão a linha mais
   *   recente). Sem ele, as 25 reapresentações do requerimento da PEC 446/09 de
   *   `cabo-daciolo` entram como 25 candidatos de score idêntico e, no
   *   desempate por data, levam as 10 vagas na frente dos projetos de lei.
   * - `umaLinhaPorTextoDeEmenta` gasta no máximo uma vaga por texto de ementa,
   *   ignorando a sigla: vale entre atos distintos (emendas diferentes ao
   *   mesmo projeto) e entre tipos (REQ e PL de mesma ementa). A vaga fica com
   *   a linha curada ou, na falta dela, com o projeto de lei. O acervo inteiro
   *   segue na sub-aba de inventário.
   */
  const candidates = [
    ...umaLinhaPorTextoDeEmenta(deduplicarProposicoesPorEmenta(projetosLei))
      .map((projeto, index) => ({
        kind: "parlamentar" as const,
        item: projeto,
        // `destaque` é curadoria humana e vence a régua de natureza: um
        // requerimento marcado editorialmente continua no topo.
        rank:
          projeto.destaque || isProjetoLei(projeto.tipo)
            ? HIGHLIGHT_RANK_NORMATIVO
            : HIGHLIGHT_RANK_ACESSORIO,
        score: scoreProjetoLeiPublicRelevance(projeto),
        dateKey: projeto.ano ? `${projeto.ano}-12-31` : "0000-00-00",
        stableKey: `parlamentar:${projeto.id || index}`,
      }))
      .filter((candidate) => candidate.score >= LEGISLATION_HIGHLIGHT_THRESHOLD),
    ...legislacaoMandatoExecutivo
      .map((lei, index) => ({
        kind: "executivo" as const,
        item: lei,
        rank: HIGHLIGHT_RANK_NORMATIVO,
        score: scoreExecutiveLegislationPublicRelevance(lei),
        dateKey: lei.data_norma ?? (lei.ano ? `${lei.ano}-12-31` : "0000-00-00"),
        stableKey: `executivo:${lei.id || index}`,
      }))
      .filter((candidate) => candidate.score >= LEGISLATION_HIGHLIGHT_THRESHOLD),
  ]
    .sort(compareHighlightCandidates)
    .slice(0, LEGISLATION_HIGHLIGHT_LIMIT)

  return {
    destaquesParlamentares: candidates
      .filter((candidate) => candidate.kind === "parlamentar")
      .map((candidate) => candidate.item),
    destaquesExecutivo: candidates
      .filter((candidate) => candidate.kind === "executivo")
      .map((candidate) => candidate.item),
  }
}

function getMetadataString(item: LegislacaoMandatoExecutivo, key: string) {
  const value = item.metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getCompleteCoverageDescription(items: LegislacaoMandatoExecutivo[]) {
  for (const item of items) {
    const coverageId = getMetadataString(item, "coverage_id")
    if (coverageId && COMPLETE_EXECUTIVE_LEGISLATION_COVERAGE[coverageId]) {
      return COMPLETE_EXECUTIVE_LEGISLATION_COVERAGE[coverageId]
    }
  }

  return null
}

/**
 * `totalItems` existe porque a ficha carrega apenas uma previa do inventario do
 * Executivo (ver LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT); o inventario
 * inteiro chega depois, sob demanda. Sem o total, a frase "inventario completo de N
 * atos" carimbaria o tamanho da previa enquanto o fetch nao volta, ou seja diria um
 * numero falso ao leitor. As LISTAS continuam mostrando o que ja chegou; o que o
 * total corrige e a AFIRMACAO sobre o tamanho do acervo.
 */
export function resolveExecutiveLegislationInventoryScope(
  items: LegislacaoMandatoExecutivo[],
  totalItems: number = items.length
): ExecutiveLegislationInventoryScope {
  if (items.length === 0) {
    return {
      kind: "empty",
      isComplete: false,
      tabLabel: "Todas",
      listDescription: "",
      featuredDescription: "",
    }
  }

  const completeDescription = getCompleteCoverageDescription(items)

  if (completeDescription) {
    return {
      kind: "complete",
      isComplete: true,
      tabLabel: "Inventário completo do mandato",
      listDescription: completeDescription,
      featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do inventário completo de ${totalItems} atos do Executivo no mandato verificados: ${LEGISLATION_HIGHLIGHT_CRITERIA}. O inventário completo do mandato segue disponível na sub-aba própria. ${COMPLETE_EXECUTIVE_HIGHLIGHT_SCOPE}`,
    }
  }

  return {
    kind: "expanded_partial",
    isComplete: false,
    tabLabel: "Inventário ampliado",
    listDescription:
      "Inventário ampliado parcial: inclui atos já verificados em fonte oficial no recorte disponível. Não é um inventário completo do mandato; ainda não há base oficial suficiente para afirmar completude.",
    featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do inventário ampliado de ${totalItems} atos confirmados em fonte oficial no recorte disponível: ${LEGISLATION_HIGHLIGHT_CRITERIA}. Este inventário não é completo do mandato e segue disponível na sub-aba própria.`,
  }
}

function getParlamentarAuthorshipCoverageDescription(items: ProjetoLei[]) {
  for (const item of items) {
    const coverageId =
      typeof item.coverage_id === "string" ? item.coverage_id.trim() : ""
    if (coverageId && COMPLETE_PARLAMENTAR_AUTHORSHIP_COVERAGE[coverageId]) {
      const coverageCount = items.filter(
        (projeto) =>
          typeof projeto.coverage_id === "string" && projeto.coverage_id.trim() === coverageId
      ).length
      return {
        coverageId,
        description: COMPLETE_PARLAMENTAR_AUTHORSHIP_COVERAGE[coverageId],
        coverageCount,
        outsideCoverageCount: items.length - coverageCount,
      }
    }
  }
  return null
}

function resolveParlamentarAuthorshipInventoryScope(
  projetosLei: ProjetoLei[]
): ExecutiveLegislationInventoryScope {
  if (projetosLei.length === 0) {
    return {
      kind: "empty",
      isComplete: false,
      tabLabel: "Todas",
      listDescription: "",
      featuredDescription: "",
    }
  }

  const coverage = getParlamentarAuthorshipCoverageDescription(projetosLei)
  if (!coverage) {
    return {
      kind: "expanded_partial",
      isComplete: false,
      tabLabel: "Inventário ampliado",
      listDescription:
        "Inventário ampliado parcial: inclui proposições legislativas já verificadas em fonte oficial no recorte disponível. Não é um inventário completo da autoria parlamentar; ainda não há base oficial suficiente para afirmar completude.",
      featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do inventário ampliado de ${projetosLei.length} proposições legislativas confirmadas em fonte oficial no recorte disponível: ${LEGISLATION_HIGHLIGHT_CRITERIA}. Este inventário não é completo da autoria parlamentar e segue disponível na sub-aba própria.`,
    }
  }

  return {
    kind: "parlamentar_complete",
    isComplete: true,
    tabLabel: "Inventário completo da autoria parlamentar",
    listDescription: coverage.description,
    featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do ${coverage.outsideCoverageCount > 0 ? `inventário completo do recorte de ${coverage.coverageCount}` : `inventário completo de ${coverage.coverageCount}`} proposições legislativas verificadas como autoria parlamentar: ${LEGISLATION_HIGHLIGHT_CRITERIA}. ${coverage.outsideCoverageCount > 0 ? `Há mais ${coverage.outsideCoverageCount} registros parlamentares verificados fora desse coverage_id; eles permanecem na lista, mas não ampliam o recorte completo. ` : ""}O inventário completo da autoria parlamentar segue disponível na sub-aba própria. Este recorte cobre apenas a autoria parlamentar verificada; outros cargos públicos do candidato não estão refletidos nesta aba.`,
  }
}

function resolveLegislationProfileInventoryScope({
  totalCount,
  nonExecutiveCount,
  executiveScope,
  parlamentarScope,
}: {
  totalCount: number
  nonExecutiveCount: number
  executiveScope: ExecutiveLegislationInventoryScope
  parlamentarScope: ExecutiveLegislationInventoryScope
}): ExecutiveLegislationInventoryScope {
  if (totalCount === 0) {
    return executiveScope
  }

  const executiveCount = totalCount - nonExecutiveCount

  if (nonExecutiveCount === 0 && executiveScope.kind !== "empty") {
    return executiveScope
  }

  if (executiveCount === 0 && parlamentarScope.kind !== "empty") {
    return parlamentarScope
  }

  if (executiveScope.kind === "complete") {
    return {
      kind: "complete",
      isComplete: true,
      tabLabel: "Inventário completo do mandato",
      listDescription: executiveScope.listDescription,
      featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do inventário completo de ${executiveCount} atos do Executivo no mandato verificados, integrado a ${nonExecutiveCount} registros parlamentares já verificados (total ${totalCount}): ${LEGISLATION_HIGHLIGHT_CRITERIA}. O inventário completo do mandato segue disponível na sub-aba própria. ${COMPLETE_EXECUTIVE_HIGHLIGHT_SCOPE}`,
    }
  }

  if (parlamentarScope.kind === "parlamentar_complete") {
    return {
      kind: "parlamentar_complete",
      isComplete: true,
      tabLabel: "Inventário completo da autoria parlamentar",
      listDescription: `${parlamentarScope.listDescription} A aba também mostra ${executiveCount} atos do Executivo já verificados em fonte oficial como recorte parcial separado; esse recorte executivo não é inventário completo do mandato.`,
      featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do inventário completo do recorte de autoria parlamentar, integrado a ${executiveCount} atos do Executivo já verificados de forma parcial (total ${totalCount}): ${LEGISLATION_HIGHLIGHT_CRITERIA}. O inventário completo da autoria parlamentar segue disponível na sub-aba própria; o recorte de Executivo permanece parcial e separado.`,
    }
  }

  return {
    kind: "expanded_partial",
    isComplete: false,
    tabLabel: "Inventário ampliado",
    listDescription:
      "Inventário ampliado parcial: inclui registros legislativos já verificados em fontes oficiais e bases públicas estruturadas no recorte disponível. Não é um inventário completo do mandato ou da atuação legislativa; ainda não há base oficial suficiente para afirmar completude.",
    featuredDescription: `Recorte inicial de até ${LEGISLATION_HIGHLIGHT_LIMIT} destaques de relevância pública dentro do inventário ampliado de ${totalCount} registros legislativos confirmados no recorte disponível: ${LEGISLATION_HIGHLIGHT_CRITERIA}. Este inventário não é completo do mandato ou da atuação legislativa e segue disponível na sub-aba própria.`,
  }
}

export function groupLegislacaoProfileItems({
  projetosLei,
  legislacaoMandatoExecutivo,
  legislacaoMandatoExecutivoTotal,
  votos,
  cargoDisputado,
}: {
  projetosLei: ProjetoLei[]
  legislacaoMandatoExecutivo: LegislacaoMandatoExecutivo[]
  /**
   * Tamanho real do inventario do Executivo quando `legislacaoMandatoExecutivo`
   * traz apenas a previa da ficha. Governa contagem e texto, nunca as listas.
   */
  legislacaoMandatoExecutivoTotal?: number
  votos: VotoCandidato[]
} & LegislacaoProfileContext): LegislacaoProfileGroups {
  const executivoCount = Math.max(
    legislacaoMandatoExecutivoTotal ?? legislacaoMandatoExecutivo.length,
    legislacaoMandatoExecutivo.length
  )
  const authoredProposicaoKeys = new Set(
    projetosLei
      .map((projeto) => proposicaoSourceKey(projeto.fonte, projeto.proposicao_id_api))
      .filter((key): key is string => key !== null)
  )

  const propostasExecutivo = legislacaoMandatoExecutivo.filter(
    (lei) => lei.tipo_relacao === "projeto_enviado_pelo_executivo"
  )
  const leisSancionadas = legislacaoMandatoExecutivo.filter(
    (lei) => lei.tipo_relacao === "lei_sancionada"
  )
  const projetosAprovados = projetosLei.filter(isProjetoLeiAprovado)
  const { destaquesParlamentares, destaquesExecutivo } = resolveFeaturedLegislation({
    projetosLei,
    legislacaoMandatoExecutivo,
  })
  const executiveInventoryScope = resolveExecutiveLegislationInventoryScope(
    legislacaoMandatoExecutivo,
    executivoCount
  )
  const parlamentarInventoryScope = resolveParlamentarAuthorshipInventoryScope(projetosLei)
  const hasExecutiveInventoryHighlights =
    executivoCount >= LEGISLATION_HIGHLIGHT_MINIMUM && destaquesExecutivo.length > 0
  const votosApenas = votos.filter((voto) => {
    const proposicaoKey = proposicaoSourceKey(
      voto.votacao?.fonte ?? voto.votacao?.casa,
      voto.votacao?.proposicao_id,
    )
    return !proposicaoKey || !authoredProposicaoKeys.has(proposicaoKey)
  })
  const featuredCount = destaquesParlamentares.length + destaquesExecutivo.length
  const totalCount = projetosLei.length + executivoCount + votosApenas.length
  const nonExecutiveCount = projetosLei.length + votosApenas.length
  const inventoryScope = resolveLegislationProfileInventoryScope({
    totalCount,
    nonExecutiveCount,
    executiveScope: executiveInventoryScope,
    parlamentarScope: parlamentarInventoryScope,
  })
  const hasLegislationHighlights =
    featuredCount > 0 &&
    (totalCount >= LEGISLATION_HIGHLIGHT_MINIMUM || isPresidentialProfile(cargoDisputado))

  return {
    propostasParlamentares: projetosLei,
    destaquesParlamentares,
    propostasExecutivo,
    destaquesExecutivo,
    votosApenas,
    projetosAprovados,
    leisSancionadas,
    executivo: legislacaoMandatoExecutivo,
    executivoCount,
    inventoryScope,
    totalCount,
    featuredCount,
    navigationCount: totalCount,
    proposedCount: projetosLei.length + propostasExecutivo.length,
    approvedCount: projetosAprovados.length + leisSancionadas.length,
    hasLegislationHighlights,
    hasExecutiveInventoryHighlights,
  }
}
