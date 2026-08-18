-- Proposta local, não aplicada. Oito fichas vazias tiveram as candidaturas com
-- SQ_CANDIDATO versionado reconsultadas nos pacotes oficiais consulta_cand do
-- TSE. Nenhuma linha identificada tem resultado de eleição que sustente um
-- mandato. Isto encerra somente o recorte desses pleitos, por isso o resultado
-- é sem_achado_no_escopo, nunca vazio_confirmado.

create temp table _destaques_trajetoria_tse_8 (
  slug text primary key,
  detalhe text not null,
  url text not null
) on commit drop;

insert into _destaques_trajetoria_tse_8 (slug, detalhe, url) values
  ('andre-marinho', 'TSE consulta_cand_2026, SQ 190002537524: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('dr-luisinho', 'TSE consulta_cand_2026, SQ 10002533539: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('henrique-areas', 'TSE consulta_cand_2016/2018/2020, SQs 250000077188, 250000615443 e 250001172315: identidade exata e resultados NÃO ELEITO. Recorte limitado aos pleitos conhecidos.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2020.zip'),
  ('izadora-dias', 'TSE consulta_cand_2022, SQ 250001700018: identidade exata e resultado NÃO ELEITO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'),
  ('jose-estevao', 'TSE consulta_cand_2026, SQ 50002536579: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('luan-monteiro', 'TSE consulta_cand_2020/2022/2024, SQs 190001092078, 190001717287 e 190002346684: identidade exata e resultados NÃO ELEITO. Recorte limitado aos pleitos conhecidos.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip'),
  ('preta-lu', 'TSE consulta_cand_2026, SQ 100002534191: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('samara-mineiro', 'TSE consulta_cand_2026, SQ 70002537111: identidade exata e resultado #NULO. Recorte limitado ao pleito conhecido; não prova ausência de cargo fora do TSE.', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip');

do $$
declare
  publicas integer;
  existentes integer;
begin
  select count(*) into publicas
    from public.candidatos_publico c
    join _destaques_trajetoria_tse_8 a on a.slug = c.slug;
  if publicas <> 8 then
    raise exception 'pre-condicao: esperadas 8 fichas publicas, encontradas %', publicas;
  end if;

  select count(*) into existentes
    from public.coleta_log
   where execucao = 'migration:20260810124000';
  if existentes <> 0 then
    raise exception 'pre-condicao: migration:20260810124000 ja tem % linha(s)', existentes;
  end if;
end $$;

-- @write tabela=coleta_log ref=destaques-trajetoria:tse-8 campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao
insert into public.coleta_log
  (fonte, escopo, alvo, candidato_id, executado_em, resultado, volume, detalhe, url, execucao)
select
  'destaques-trajetoria',
  'candidato',
  a.slug,
  c.id,
  '2026-08-11T02:15:00.000Z'::timestamptz,
  'sem_achado_no_escopo',
  0,
  a.detalhe,
  a.url,
  'migration:20260810124000'
from _destaques_trajetoria_tse_8 a
join public.candidatos_publico c on c.slug = a.slug;

do $$
declare
  gravadas integer;
  incoerentes integer;
begin
  select count(*), count(*) filter (
    where fonte <> 'destaques-trajetoria'
       or resultado <> 'sem_achado_no_escopo'
       or volume <> 0
       or candidato_id is null
  ) into gravadas, incoerentes
    from public.coleta_log
   where execucao = 'migration:20260810124000';
  if gravadas <> 8 or incoerentes <> 0 then
    raise exception 'pos-condicao: gravadas %, incoerentes %', gravadas, incoerentes;
  end if;
end $$;
