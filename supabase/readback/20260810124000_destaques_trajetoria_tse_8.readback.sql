create temp table pf_readback_tse_8 as
with expected(slug, detalhe, url) as (values
  ('andre-marinho', 'TSE consulta_cand_2026, SQ 190002537524: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('dr-luisinho', 'TSE consulta_cand_2026, SQ 10002533539: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('henrique-areas', 'TSE consulta_cand_2016/2018/2020, SQs 250000077188, 250000615443 e 250001172315: identidade exata e resultados NÃO ELEITO. Recorte limitado aos pleitos conhecidos.', null),
  ('izadora-dias', 'TSE consulta_cand_2022, SQ 250001700018: identidade exata e resultado NÃO ELEITO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'),
  ('jose-estevao', 'TSE consulta_cand_2026, SQ 50002536579: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('luan-monteiro', 'TSE consulta_cand_2020/2022/2024, SQs 190001092078, 190001717287 e 190002346684: identidade exata e resultados NÃO ELEITO. Recorte limitado aos pleitos conhecidos.', null),
  ('preta-lu', 'TSE consulta_cand_2026, SQ 100002534191: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('samara-mineiro', 'TSE consulta_cand_2026, SQ 70002537111: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip')
), actual as (
  select l.*, c.slug
    from public.coleta_log l
    left join public.candidatos_publico c on c.id = l.candidato_id
   where l.execucao = 'migration:20260810124000'
), compared as (
  select e.slug,
         (a.slug is null) as ausente,
         (a.fonte is distinct from 'destaques-trajetoria'
          or a.escopo is distinct from 'candidato'
          or a.alvo is distinct from e.slug
          or a.executado_em is distinct from '2026-08-11T11:28:01.895Z'::timestamptz
          or a.resultado is distinct from 'sem_achado_no_escopo'
          or a.volume is distinct from 0
          or a.detalhe is distinct from e.detalhe
          or a.url is distinct from e.url
          or a.natureza is distinct from 'coleta') as payload_divergente
    from expected e
    left join actual a on a.slug = e.slug
)
select
  (select count(*) from supabase_migrations.schema_migrations where version='20260810124000') as ledger,
  (select count(*) from actual) as linhas,
  (select count(*) from actual where resultado = 'sem_achado_no_escopo') as limitadas,
  (select count(*) from actual where resultado = 'vazio_confirmado') as vazios_incorretos,
  (select count(distinct candidato_id) from actual) as fichas,
  (select count(*) from compared where ausente) as esperadas_ausentes,
  (select count(*) from actual a where not exists (select 1 from expected e where e.slug = a.slug)) as inesperadas,
  (select count(*) from compared where payload_divergente) as payload_divergente,
  (select array_agg(slug order by slug) from actual) as slugs;

do $readback$
declare r pf_readback_tse_8%rowtype;
begin
  select * into strict r from pf_readback_tse_8;
  if r.ledger <> 1 or r.linhas <> 8 or r.limitadas <> 8
     or r.vazios_incorretos <> 0 or r.fichas <> 8
     or r.esperadas_ausentes <> 0 or r.inesperadas <> 0
     or r.payload_divergente <> 0 then
    raise exception 'readback 20260810124000: %', row_to_json(r);
  end if;
end
$readback$;

table pf_readback_tse_8;
