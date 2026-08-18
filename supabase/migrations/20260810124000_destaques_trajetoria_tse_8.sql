-- Oito fichas vazias tiveram as candidaturas com SQ_CANDIDATO versionado
-- reconsultadas nos pacotes oficiais consulta_cand do TSE. Nenhuma candidatura
-- identificada teve resultado eleitoral que sustente um mandato. O resultado
-- encerra somente os pleitos nomeados em `detalhe`, por isso é
-- sem_achado_no_escopo, nunca vazio_confirmado.

create temp table _destaques_trajetoria_tse_8 (
  slug text primary key,
  detalhe text not null,
  url text
) on commit drop;

insert into _destaques_trajetoria_tse_8 (slug, detalhe, url) values
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
  publicas integer;
  existentes integer;
  posteriores integer;
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

  select count(*) into posteriores
    from public.coleta_log l
    join _destaques_trajetoria_tse_8 a on a.slug = l.alvo
   where l.fonte = 'destaques-trajetoria'
     and l.escopo = 'candidato'
     and l.executado_em >= '2026-08-11T11:28:01.895Z'::timestamptz;
  if posteriores <> 0 then
    raise exception 'pre-condicao: % verificacao(oes) igual(is) ou posterior(es) a auditoria TSE-8', posteriores;
  end if;
end $$;

-- @write tabela=coleta_log ref=destaques-trajetoria:tse-8 campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
insert into public.coleta_log
  (fonte, escopo, alvo, candidato_id, executado_em, resultado, volume, detalhe, url, execucao, natureza)
select
  'destaques-trajetoria',
  'candidato',
  a.slug,
  c.id,
  '2026-08-11T11:28:01.895Z'::timestamptz,
  'sem_achado_no_escopo',
  0,
  a.detalhe,
  a.url,
  'migration:20260810124000',
  'coleta'
from _destaques_trajetoria_tse_8 a
join public.candidatos_publico c on c.slug = a.slug
cross join (values ('destaques-trajetoria:tse-8')) as lote(ref)
where lote.ref = 'destaques-trajetoria:tse-8';

do $$
declare
  gravadas integer;
  divergentes integer;
begin
  select count(*) into gravadas
    from public.coleta_log
   where execucao = 'migration:20260810124000';

  select count(*) into divergentes
    from _destaques_trajetoria_tse_8 a
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

  if gravadas <> 8 or divergentes <> 0 then
    raise exception 'pos-condicao: gravadas %, divergentes %', gravadas, divergentes;
  end if;
end $$;
