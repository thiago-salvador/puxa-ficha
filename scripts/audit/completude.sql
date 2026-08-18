-- Etapa 1B: Completude. Somente leitura. project_id wskpzsobvqwhnbsdsmok.
-- Todas as queries abaixo tem como escopo os 195 candidatos com publicavel = true,
-- exceto onde explicitamente indicado (ex.: contagem total do banco para contexto).

-- ============================================================
-- 1. TAXA DE PREENCHIMENTO DE COLUNAS DE candidatos POR CARGO (so publicaveis)
-- ============================================================
select
  cargo_disputado,
  count(*) as total,
  count(*) filter (where nullif(trim(biografia), '') is not null)          as biografia,
  count(*) filter (where nullif(trim(foto_url), '') is not null)          as foto_url,
  count(*) filter (where redes_sociais is not null and redes_sociais <> '{}'::jsonb) as redes_sociais,
  count(*) filter (where nullif(trim(site_campanha), '') is not null)      as site_campanha,
  count(*) filter (where nullif(trim(naturalidade), '') is not null)       as naturalidade,
  count(*) filter (where nullif(trim(formacao), '') is not null)          as formacao,
  count(*) filter (where nullif(trim(profissao_declarada), '') is not null) as profissao_declarada,
  count(*) filter (where data_nascimento is not null)                    as data_nascimento,
  count(*) filter (where idade is not null)                              as idade,
  count(*) filter (where nullif(trim(cargo_atual), '') is not null)       as cargo_atual,
  count(*) filter (where nullif(trim(wikidata_id), '') is not null)       as wikidata_id,
  count(*) filter (where nullif(trim(genero), '') is not null)           as genero,
  count(*) filter (where nullif(trim(estado_civil), '') is not null)     as estado_civil,
  count(*) filter (where nullif(trim(cor_raca), '') is not null)         as cor_raca,
  count(*) filter (where nullif(trim(email_campanha), '') is not null)   as email_campanha,
  count(*) filter (where fonte_dados is not null and array_length(fonte_dados,1) > 0) as fonte_dados,
  count(*) filter (where nullif(trim(estado), '') is not null)           as estado,
  count(*) filter (where nullif(trim(situacao_candidatura), '') is not null) as situacao_candidatura
from public.candidatos
where publicavel
group by 1
order by 2 desc;

-- Totais gerais (todos os cargos somados), so publicaveis
select
  count(*) as total_publicaveis,
  count(*) filter (where nullif(trim(biografia), '') is not null)          as biografia,
  round(100.0 * count(*) filter (where nullif(trim(biografia), '') is not null) / count(*), 1) as biografia_pct,
  count(*) filter (where nullif(trim(foto_url), '') is not null)          as foto_url,
  round(100.0 * count(*) filter (where nullif(trim(foto_url), '') is not null) / count(*), 1) as foto_url_pct,
  count(*) filter (where redes_sociais is not null and redes_sociais <> '{}'::jsonb) as redes_sociais,
  round(100.0 * count(*) filter (where redes_sociais is not null and redes_sociais <> '{}'::jsonb) / count(*), 1) as redes_sociais_pct,
  count(*) filter (where nullif(trim(site_campanha), '') is not null)      as site_campanha,
  round(100.0 * count(*) filter (where nullif(trim(site_campanha), '') is not null) / count(*), 1) as site_campanha_pct,
  count(*) filter (where nullif(trim(email_campanha), '') is not null)   as email_campanha,
  round(100.0 * count(*) filter (where nullif(trim(email_campanha), '') is not null) / count(*), 1) as email_campanha_pct
from public.candidatos
where publicavel;

-- ============================================================
-- 2. COBERTURA DAS TABELAS FILHAS POR CANDIDATO (so publicaveis, zero linhas)
-- ============================================================
with pub as (
  select id, slug, cargo_disputado from public.candidatos where publicavel
)
select
  (select count(*) from pub) as total_publicaveis,
  (select count(*) from pub p where not exists (select 1 from public.historico_politico h where h.candidato_id = p.id)) as sem_historico_politico,
  (select count(*) from pub p where not exists (select 1 from public.patrimonio t where t.candidato_id = p.id)) as sem_patrimonio,
  (select count(*) from pub p where not exists (select 1 from public.financiamento t where t.candidato_id = p.id)) as sem_financiamento,
  (select count(*) from pub p where not exists (select 1 from public.votos_candidato t where t.candidato_id = p.id)) as sem_votos_candidato,
  (select count(*) from pub p where not exists (select 1 from public.projetos_lei t where t.candidato_id = p.id)) as sem_projetos_lei,
  (select count(*) from pub p where not exists (select 1 from public.processos t where t.candidato_id = p.id)) as sem_processos,
  (select count(*) from pub p where not exists (select 1 from public.pontos_atencao t where t.candidato_id = p.id)) as sem_pontos_atencao,
  (select count(*) from pub p where not exists (select 1 from public.gastos_parlamentares t where t.candidato_id = p.id)) as sem_gastos_parlamentares,
  (select count(*) from pub p where not exists (select 1 from public.mudancas_partido t where t.candidato_id = p.id)) as sem_mudancas_partido,
  (select count(*) from pub p where not exists (select 1 from public.noticias_candidato t where t.candidato_id = p.id)) as sem_noticias_candidato,
  (select count(*) from pub p where not exists (select 1 from public.legislacao_mandato_executivo t where t.candidato_id = p.id)) as sem_legislacao_mandato_executivo,
  (select count(*) from pub p where not exists (select 1 from public.sancoes_administrativas t where t.candidato_id = p.id)) as sem_sancoes_administrativas;

-- Mesma cobertura, quebrada por cargo_disputado
with pub as (
  select id, slug, cargo_disputado from public.candidatos where publicavel
)
select
  p.cargo_disputado,
  count(*) as total,
  count(*) filter (where not exists (select 1 from public.historico_politico h where h.candidato_id = p.id)) as sem_historico_politico,
  count(*) filter (where not exists (select 1 from public.patrimonio t where t.candidato_id = p.id)) as sem_patrimonio,
  count(*) filter (where not exists (select 1 from public.financiamento t where t.candidato_id = p.id)) as sem_financiamento,
  count(*) filter (where not exists (select 1 from public.votos_candidato t where t.candidato_id = p.id)) as sem_votos_candidato,
  count(*) filter (where not exists (select 1 from public.projetos_lei t where t.candidato_id = p.id)) as sem_projetos_lei,
  count(*) filter (where not exists (select 1 from public.processos t where t.candidato_id = p.id)) as sem_processos,
  count(*) filter (where not exists (select 1 from public.pontos_atencao t where t.candidato_id = p.id)) as sem_pontos_atencao,
  count(*) filter (where not exists (select 1 from public.gastos_parlamentares t where t.candidato_id = p.id)) as sem_gastos_parlamentares,
  count(*) filter (where not exists (select 1 from public.mudancas_partido t where t.candidato_id = p.id)) as sem_mudancas_partido,
  count(*) filter (where not exists (select 1 from public.noticias_candidato t where t.candidato_id = p.id)) as sem_noticias_candidato,
  count(*) filter (where not exists (select 1 from public.legislacao_mandato_executivo t where t.candidato_id = p.id)) as sem_legislacao_mandato_executivo
from pub p
group by 1
order by 2 desc;

-- ============================================================
-- 3. ABA PROMETIDA E VAZIA (casos mais graves, lista nominal)
-- ============================================================

-- 3a. Aba GERAL inteira vazia: hasOverviewData=false (ProfileOverview.tsx:92-104),
-- as 9 relacoes (patrimonio, financiamento, processos, votos_candidato, historico_politico,
-- pontos_atencao, projetos_lei, legislacao_mandato_executivo, gastos_parlamentares) zeradas.
with pub as (select id, slug, cargo_disputado, estado from public.candidatos where publicavel)
select p.slug, p.cargo_disputado, p.estado
from pub p
where not exists (select 1 from public.patrimonio t where t.candidato_id = p.id)
  and not exists (select 1 from public.financiamento t where t.candidato_id = p.id)
  and not exists (select 1 from public.processos t where t.candidato_id = p.id)
  and not exists (select 1 from public.votos_candidato t where t.candidato_id = p.id)
  and not exists (select 1 from public.historico_politico t where t.candidato_id = p.id)
  and not exists (select 1 from public.pontos_atencao t where t.candidato_id = p.id)
  and not exists (select 1 from public.projetos_lei t where t.candidato_id = p.id)
  and not exists (select 1 from public.legislacao_mandato_executivo t where t.candidato_id = p.id)
  and not exists (select 1 from public.gastos_parlamentares t where t.candidato_id = p.id)
order by p.slug;

-- 3b. Aba VOTOS: candidato com historico legislativo (cargo/cargo_canonico casando
-- senador|deputad[oa]|vereador, espelhando src/lib/legislative-history.ts) mas ZERO
-- votos_candidato -> cai no texto B "Votacoes ainda nao coletadas" (falha operacional,
-- nao falha logica).
with pub as (select id, slug, cargo_disputado from public.candidatos where publicavel),
legislativo as (
  select distinct h.candidato_id
  from public.historico_politico h
  where h.cargo ~* '(senador|deputad[oa]|vereador)'
     or h.cargo_canonico ~* '(senador|deputad[oa]|vereador)'
)
select p.slug, p.cargo_disputado
from pub p
join legislativo l on l.candidato_id = p.id
where not exists (select 1 from public.votos_candidato v where v.candidato_id = p.id)
order by p.cargo_disputado, p.slug;

-- 3c. Aba LEGISLACAO: mesmo criterio de historico legislativo, mas ZERO projetos_lei
-- E ZERO legislacao_mandato_executivo -> nao ha autoria nem atos, aba renderiza so o
-- estado vazio, apesar do candidato ter sido parlamentar.
with pub as (select id, slug, cargo_disputado from public.candidatos where publicavel),
legislativo as (
  select distinct h.candidato_id
  from public.historico_politico h
  where h.cargo ~* '(senador|deputad[oa]|vereador)'
     or h.cargo_canonico ~* '(senador|deputad[oa]|vereador)'
)
select p.slug, p.cargo_disputado
from pub p
join legislativo l on l.candidato_id = p.id
where not exists (select 1 from public.projetos_lei pl where pl.candidato_id = p.id)
  and not exists (select 1 from public.legislacao_mandato_executivo le where le.candidato_id = p.id)
order by p.cargo_disputado, p.slug;

-- 3d. C1+C2 do contrato: Governador publicavel COM estado preenchido, mas ZERO linhas
-- em indicadores_estaduais para aquele estado -> bloco "Indicadores estaduais" nunca
-- e buscado (api.ts:963-967) nem renderizado (CandidatoProfile.tsx:496).
with pub as (
  select id, slug, cargo_disputado, estado from public.candidatos
  where publicavel and cargo_disputado = 'Governador'
)
select p.slug, p.estado
from pub p
where p.estado is not null
  and not exists (
    select 1 from public.indicadores_estaduais ie
    where ie.estado = p.estado
  )
order by p.slug;

-- 3d-bis. Governador publicavel SEM estado preenchido (falha hard de published-consistency.ts:67,
-- nao deveria existir; conferir se ha algum)
select slug, estado from public.candidatos
where publicavel and cargo_disputado = 'Governador' and (estado is null or trim(estado) = '');

-- 3e. Aba TRAJETORIA totalmente vazia: zero historico_politico E zero mudancas_partido
-- (cai no vazio-explicito "Primeira candidatura", legitimo para estreantes, mas listado
-- para checagem de plausibilidade contra cargo_atual/idade)
with pub as (select id, slug, cargo_disputado, cargo_atual, idade from public.candidatos where publicavel)
select p.slug, p.cargo_disputado, p.cargo_atual, p.idade
from pub p
where not exists (select 1 from public.historico_politico h where h.candidato_id = p.id)
  and not exists (select 1 from public.mudancas_partido m where m.candidato_id = p.id)
order by p.slug;

-- 3f. Aba DINHEIRO totalmente vazia: zero patrimonio E zero financiamento
with pub as (select id, slug, cargo_disputado from public.candidatos where publicavel)
select p.slug, p.cargo_disputado
from pub p
where not exists (select 1 from public.patrimonio t where t.candidato_id = p.id)
  and not exists (select 1 from public.financiamento t where t.candidato_id = p.id)
order by p.slug;

-- 3g. Aba DESTAQUES totalmente vazia: zero pontos_atencao
with pub as (select id, slug, cargo_disputado from public.candidatos where publicavel)
select p.slug, p.cargo_disputado
from pub p
where not exists (select 1 from public.pontos_atencao t where t.candidato_id = p.id)
order by p.slug;

-- ============================================================
-- 4. CAMPOS PARCIALMENTE PREENCHIDOS (exibicao capenga)
-- ============================================================

-- 4a. biografia vazia, foto_url nula, redes_sociais vazio -- contagem conjunta e isolada
select
  count(*) filter (where nullif(trim(biografia), '') is null) as biografia_vazia,
  count(*) filter (where nullif(trim(foto_url), '') is null) as foto_url_nula,
  count(*) filter (where redes_sociais is null or redes_sociais = '{}'::jsonb) as redes_sociais_vazio,
  count(*) filter (
    where nullif(trim(biografia), '') is null
      and nullif(trim(foto_url), '') is null
      and (redes_sociais is null or redes_sociais = '{}'::jsonb)
  ) as todos_tres_vazios
from public.candidatos
where publicavel;

-- 4b. patrimonio sem ano de referencia (ano_eleicao e NOT NULL no schema; deve dar 0)
select count(*) as patrimonio_sem_ano_referencia
from public.patrimonio pt
join public.candidatos c on c.id = pt.candidato_id
where c.publicavel and pt.ano_eleicao is null;

-- 4b-bis. patrimonio com valor_total nulo (esse SIM e nullable)
select count(*) as patrimonio_valor_nulo, count(*) as total_linhas_patrimonio_publicaveis
from public.patrimonio pt
join public.candidatos c on c.id = pt.candidato_id
where c.publicavel;

select count(*) filter (where pt.valor_total is null) as patrimonio_valor_nulo,
       count(*) as total_linhas_patrimonio_publicaveis
from public.patrimonio pt
join public.candidatos c on c.id = pt.candidato_id
where c.publicavel;

-- 4c. financiamento sem valor (total_arrecadado nulo)
select count(*) filter (where f.total_arrecadado is null) as financiamento_sem_valor,
       count(*) as total_linhas_financiamento_publicaveis
from public.financiamento f
join public.candidatos c on c.id = f.candidato_id
where c.publicavel;

-- 4d. quantos candidatos publicaveis tem PELO MENOS uma linha de patrimonio mas
-- TODAS com valor_total nulo (pior caso: aba "tem dado" mas sem numero nenhum pra mostrar)
with pub as (select id, slug from public.candidatos where publicavel)
select p.slug
from pub p
where exists (select 1 from public.patrimonio pt where pt.candidato_id = p.id)
  and not exists (select 1 from public.patrimonio pt where pt.candidato_id = p.id and pt.valor_total is not null)
order by p.slug;

-- ============================================================
-- 5. FONTES DECLARADAS EM /metodologia SEM DADO (M7, ja com achado A0.3 para sancoes)
-- ============================================================
select 'sancoes_administrativas' as tabela, count(*) as linhas from public.sancoes_administrativas
union all
select 'posicoes_declaradas', count(*) from public.posicoes_declaradas
union all
select 'indicadores_estaduais', count(*) from public.indicadores_estaduais
union all
select 'votacoes_chave', count(*) from public.votacoes_chave;

-- Quantos publicaveis tem ao menos 1 linha em posicoes_declaradas (14 linhas totais no banco)
select count(distinct pd.candidato_id) as candidatos_com_posicao
from public.posicoes_declaradas pd
join public.candidatos c on c.id = pd.candidato_id
where c.publicavel;

-- ============================================================
-- 6. CAMPO idade: verificacao dedicada (achado grave, ver completude.md)
-- ============================================================
select
  count(*) filter (where idade is not null) as com_idade,
  count(*) filter (where idade is null) as sem_idade,
  count(*) filter (where data_nascimento is not null) as com_data_nascimento
from public.candidatos where publicavel;
-- Fonte de que a UI le ficha.idade cru (nao deriva de data_nascimento):
-- src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx:273 -> `ficha.idade ? `${ficha.idade} anos` : null`
-- src/lib/public-profile-dto.ts:289 -> idade: ficha.idade
-- src/lib/api.ts:121 -> CANDIDATO_COLUMNS inclui "idade" cru do banco

-- ============================================================
-- 7. NOMINAL Deputado Federal e Senador: cargo_atual x cobertura de votos/projetos/gastos
-- (a tabela mais sensivel para o cargo que MAIS deveria ter voto/CEAP rastreados)
-- ============================================================
select c.slug, c.cargo_disputado, c.cargo_atual, c.estado,
  (select count(*) from public.votos_candidato v where v.candidato_id = c.id) as n_votos,
  (select count(*) from public.projetos_lei pl where pl.candidato_id = c.id) as n_projetos_lei,
  (select count(*) from public.gastos_parlamentares g where g.candidato_id = c.id) as n_gastos,
  (select count(*) from public.legislacao_mandato_executivo le where le.candidato_id = c.id) as n_legislacao_exec,
  (select count(*) from public.historico_politico h where h.candidato_id = c.id) as n_historico
from public.candidatos c
where c.publicavel and c.cargo_disputado in ('Deputado Federal','Senador')
order by c.cargo_disputado, c.slug;

-- ============================================================
-- 8. Aba TRAJETORIA / DINHEIRO / ALERTAS totalmente vazias (listas nominais completas)
-- ============================================================

-- 8a. trajetoria: zero historico_politico E zero mudancas_partido (deve dar 0, ja que
-- sem_historico_politico=0 para todo publicavel)
with pub as (select id, slug, cargo_disputado, cargo_atual, idade from public.candidatos where publicavel)
select p.slug, p.cargo_disputado, p.cargo_atual
from pub p
where not exists (select 1 from public.historico_politico h where h.candidato_id = p.id)
  and not exists (select 1 from public.mudancas_partido m where m.candidato_id = p.id)
order by p.slug;

-- 8b. dinheiro: zero patrimonio E zero financiamento (26 casos)
with pub as (select id, slug, cargo_disputado from public.candidatos where publicavel)
select p.slug, p.cargo_disputado
from pub p
where not exists (select 1 from public.patrimonio t where t.candidato_id = p.id)
  and not exists (select 1 from public.financiamento t where t.candidato_id = p.id)
order by p.slug;

-- 8c. alertas: zero pontos_atencao (86 casos, legitimo na maioria: ausencia de red flag)
with pub as (select id, slug, cargo_disputado from public.candidatos where publicavel)
select p.slug, p.cargo_disputado
from pub p
where not exists (select 1 from public.pontos_atencao t where t.candidato_id = p.id)
order by p.slug;
