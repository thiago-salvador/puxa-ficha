-- Etapa 1D: Frescor. Auditoria somente leitura, project_id wskpzsobvqwhnbsdsmok.
-- Executado em 2026-07-24. Todas as queries abaixo foram rodadas via
-- mcp execute_sql e os resultados estao citados em scratchpad/audit/frescor.md.

-- 1. Distribuicao de idade de candidatos.ultima_atualizacao entre os 195 publicaveis
select
  count(*) filter (where ultima_atualizacao < current_date - interval '30 days') as mais_30d,
  count(*) filter (where ultima_atualizacao < current_date - interval '60 days') as mais_60d,
  count(*) filter (where ultima_atualizacao < current_date - interval '90 days') as mais_90d,
  count(*) as total_publicaveis
from public.candidatos
where publicavel = true;
-- -> mais_30d=103, mais_60d=8, mais_90d=2, total=195

-- 1b. Estatisticas de idade (dias) do dado
select
  min(ultima_atualizacao) as min_data,
  max(ultima_atualizacao) as max_data,
  percentile_cont(0.5) within group (order by (current_date - ultima_atualizacao::date)) as mediana_dias,
  round(avg(current_date - ultima_atualizacao::date)::numeric,1) as media_dias
from public.candidatos
where publicavel = true;
-- -> min=2026-04-14, max=2026-07-17, mediana=46 dias, media=31.9 dias

-- 1c. Histograma (confirma distribuicao bimodal por lotes de ingestao manual)
select
  width_bucket(current_date - ultima_atualizacao::date, 0, 110, 11) as faixa,
  min(current_date - ultima_atualizacao::date) as dias_min,
  max(current_date - ultima_atualizacao::date) as dias_max,
  count(*) as n
from public.candidatos
where publicavel = true
group by 1 order by 1;

-- 1d. Lotes de ingestao por dia (evidencia de que ultima_atualizacao muda em lotes manuais, nao continuamente)
select date_trunc('day', ultima_atualizacao) as dia, count(*) as n
from public.candidatos
where publicavel = true
group by 1 order by 1 desc;

-- 1e. Os 20 candidatos publicaveis mais desatualizados
select slug, nome_urna, estado, cargo_disputado, ultima_atualizacao,
  (current_date - ultima_atualizacao) as dias_desde_atualizacao
from public.candidatos
where publicavel = true
order by ultima_atualizacao asc
limit 20;

-- 2. Idade do dado por tabela filha (ano de referencia)
select 'patrimonio' as tabela, ano_eleicao::text as ano, count(*) from public.patrimonio group by 1,2
union all
select 'financiamento', ano_eleicao::text, count(*) from public.financiamento group by 1,2
union all
select 'gastos_parlamentares', ano::text, count(*) from public.gastos_parlamentares group by 1,2
union all
select 'projetos_lei', ano::text, count(*) from public.projetos_lei group by 1,2
union all
select 'indicadores_estaduais', ano::text, count(*) from public.indicadores_estaduais group by 1,2
order by 1,2;

-- 2b. Max/min de historico_politico.periodo_fim e votacoes_chave.data_votacao
select max(periodo_fim) as max_fim, min(periodo_fim) as min_fim, count(*) as n from public.historico_politico;
select max(data_votacao) as max_data, min(data_votacao) as min_data, count(*) as n from public.votacoes_chave;

-- 2c. Ano mais recente de patrimonio/financiamento por candidato publicavel
--     (mostra que o teto legal e 2022/2024, nao ha como ser mais novo antes do registro de 2026)
with pub as (select id, slug from public.candidatos where publicavel = true)
select
  (select max(ano_eleicao) from public.patrimonio p where p.candidato_id = pub.id) as patrimonio_max_ano,
  count(*) as n
from pub group by 1 order by 1;

with pub as (select id, slug from public.candidatos where publicavel = true)
select
  (select max(ano_eleicao) from public.financiamento f where f.candidato_id = pub.id) as financ_max_ano,
  count(*) as n
from pub group by 1 order by 1;

-- 2d. Quantos publicaveis tem exatamente 1 registro de patrimonio
--     (o card de topo de perfil so mostra o ano/trend com 2+ registros; ver
--     src/components/CandidatoProfile.tsx:368-385,432-440)
with pub as (select id, slug, nome_urna from public.candidatos where publicavel = true),
cont as (
  select pub.id, pub.slug, pub.nome_urna, count(p.*) as n_registros
  from pub left join public.patrimonio p on p.candidato_id = pub.id
  group by 1,2,3
)
select
  case when n_registros = 0 then '0 (N/D)'
       when n_registros = 1 then '1 (sem trend, sem ano visivel no card)'
       else '2+ (com trend de anos)' end as situacao,
  count(*) as n_candidatos
from cont group by 1 order by 1;

-- 2e. Slugs com exatamente 1 registro de patrimonio, por ano (pior caso: alex-pucineli, 2012)
with pub as (select id, slug, nome_urna from public.candidatos where publicavel = true),
one_reg as (
  select pub.id, pub.slug, pub.nome_urna
  from pub join public.patrimonio p on p.candidato_id = pub.id
  group by 1,2,3
  having count(*) = 1
)
select p.ano_eleicao, count(*) as n, array_agg(o.slug order by o.slug) as slugs
from one_reg o join public.patrimonio p on p.candidato_id = o.id
group by 1 order by 1;

-- 3. candidate_changes: ultima execucao real por tabela_origem (unico proxy de "quando a fonte rodou")
select tabela_origem, tipo, count(*) as n, min(created_at) as primeiro, max(created_at) as ultimo
from public.candidate_changes
group by 1,2
order by ultimo desc;

-- 3b. created_at (min/max/contagem) de cada tabela filha, usado como proxy de
--     ingestao real quando a tabela nao aparece em candidate_changes
--     (financiamento, gastos_parlamentares, historico_politico, projetos_lei,
--     votos_candidato, indicadores_estaduais nao tem tabela_origem proprio em
--     candidate_changes)
select 'patrimonio' t, min(created_at) primeiro, max(created_at) ultimo, count(*) n from public.patrimonio
union all select 'financiamento', min(created_at), max(created_at), count(*) from public.financiamento
union all select 'gastos_parlamentares', min(created_at), max(created_at), count(*) from public.gastos_parlamentares
union all select 'projetos_lei', min(created_at), max(created_at), count(*) from public.projetos_lei
union all select 'historico_politico', min(created_at), max(created_at), count(*) from public.historico_politico
union all select 'indicadores_estaduais', min(created_at), max(created_at), count(*) from public.indicadores_estaduais
union all select 'votos_candidato', min(created_at), max(created_at), count(*) from public.votos_candidato
union all select 'mudancas_partido', min(created_at), max(created_at), count(*) from public.mudancas_partido
union all select 'processos', min(created_at), max(created_at), count(*) from public.processos
union all select 'pontos_atencao', min(created_at), max(created_at), count(*) from public.pontos_atencao
union all select 'noticias_candidato', min(created_at), max(created_at), count(*) from public.noticias_candidato
order by ultimo desc;

-- Evidencias fora do banco (repo + GitHub API), citadas no relatorio:
-- * grep -n "PF_CURATION_PHASE" .env.example vercel.json src/lib/api.ts scripts/lib/freshness-annotator.ts
-- * cat vercel.json (4 crons: send-digest, news/refresh, published-consistency, runtime-smoke)
-- * cat .github/workflows/ingest.yml (header: "Roda apenas por disparo manual")
-- * gh run list --limit 20  (zero execucoes do workflow "Ingestao de dados" no historico)
-- * grep -n "updateFrequency" src/data/methodology-sources.ts (18 fontes, rotulo por fonte)
-- * sed -n '360,385p;415,440p' src/components/CandidatoProfile.tsx (card Patrimonio sem ano)
-- * sed -n '985,1062p' src/lib/api.ts (historico_em_revisao hardcoded false)
