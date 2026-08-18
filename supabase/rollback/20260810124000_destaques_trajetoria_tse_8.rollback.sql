-- Remove somente o payload exato da execução nomeada. Qualquer alteração ou
-- carga parcial faz o rollback abortar para preservar estado posterior/manual.

create temp table _rollback_destaques_trajetoria_tse_8 (
  slug text primary key,
  detalhe text not null,
  url text
) on commit drop;

insert into _rollback_destaques_trajetoria_tse_8 (slug, detalhe, url) values
  ('andre-marinho', 'TSE consulta_cand_2026, SQ 190002537524: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('dr-luisinho', 'TSE consulta_cand_2026, SQ 10002533539: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('henrique-areas', 'TSE consulta_cand_2016/2018/2020, SQs 250000077188, 250000615443 e 250001172315: identidade exata e resultados NÃO ELEITO. Recorte limitado aos pleitos conhecidos.', null),
  ('izadora-dias', 'TSE consulta_cand_2022, SQ 250001700018: identidade exata e resultado NÃO ELEITO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'),
  ('jose-estevao', 'TSE consulta_cand_2026, SQ 50002536579: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('luan-monteiro', 'TSE consulta_cand_2020/2022/2024, SQs 190001092078, 190001717287 e 190002346684: identidade exata e resultados NÃO ELEITO. Recorte limitado aos pleitos conhecidos.', null),
  ('preta-lu', 'TSE consulta_cand_2026, SQ 100002534191: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('samara-mineiro', 'TSE consulta_cand_2026, SQ 70002537111: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip');

do $$
declare
  linhas integer;
  divergentes integer;
begin
  select count(*) into linhas
    from public.coleta_log
   where execucao = 'migration:20260810124000';

  select count(*) into divergentes
    from _rollback_destaques_trajetoria_tse_8 a
    join public.candidatos_publico c on c.slug = a.slug
    left join public.coleta_log l
      on l.execucao = 'migration:20260810124000'
     and l.alvo = a.slug
   where l.candidato_id is distinct from c.id
      or l.fonte is distinct from 'destaques-trajetoria'
      or l.escopo is distinct from 'candidato'
      or l.executado_em is distinct from '2026-08-11T11:28:01.895Z'::timestamptz
      or l.resultado is distinct from 'sem_achado_no_escopo'
      or l.volume is distinct from 0
      or l.detalhe is distinct from a.detalhe
      or l.url is distinct from a.url
      or l.natureza is distinct from 'coleta';

  if linhas <> 8 or divergentes <> 0 then
    raise exception 'rollback recusado: linhas %, divergentes %', linhas, divergentes;
  end if;
end $$;

-- @write tabela=coleta_log ref=destaques-trajetoria:tse-8:rollback campos=fonte,execucao
delete from public.coleta_log l
using _rollback_destaques_trajetoria_tse_8 a
 where l.execucao = 'migration:20260810124000'
   and l.fonte = 'destaques-trajetoria'
   and l.alvo = a.slug
   and 'destaques-trajetoria:tse-8:rollback' = 'destaques-trajetoria:tse-8:rollback';

-- @write tabela=schema_migrations ref=20260810124000:rollback campos=version
delete from supabase_migrations.schema_migrations
 where version = '20260810124000'
   and '20260810124000:rollback' = '20260810124000:rollback';

do $$
begin
  if exists (select 1 from public.coleta_log where execucao = 'migration:20260810124000') then
    raise exception 'pos-condicao: sobraram linhas da trajetória TSE-8';
  end if;
end $$;
