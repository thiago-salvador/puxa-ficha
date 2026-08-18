-- Fecha as cinco células de destaque criadas pelo split de identidade de Orleans.
-- Nenhuma linha afirma ausência: quatro bloqueios são indeterminados e o único
-- recorte executado é o TSE 2026, registrado como sem_achado_no_escopo.

create temp table _orleans_destaques_proveniencia (
  fonte text primary key,
  resultado text not null,
  executado_em timestamptz not null,
  detalhe text not null,
  url text
) on commit drop;

insert into _orleans_destaques_proveniencia(fonte,resultado,executado_em,detalhe,url) values
  ('destaques-sancoes','indeterminado','2026-08-12 17:17:12+00','CPF validado não está disponível para atribuir com segurança a consulta nominal nas bases federais de sanções; nenhuma ausência foi inferida.',null),
  ('destaques-processos','indeterminado','2026-08-12 17:17:12+00','Não há manifesto judicial nominal aprovado para esta identidade; processos do governador homônimo não foram transferidos e nenhuma ausência foi inferida.',null),
  ('destaques-trajetoria','sem_achado_no_escopo','2026-08-12 17:17:12+00','Consulta oficial TSE 2026 executada por SQ_CANDIDATO, UF, cargo, nome e nascimento; o resultado #NULO ancora a identidade, mas não comprova mandato nem candidatura registrada ou deferida.','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
  ('destaques-patrimonio','indeterminado','2026-08-12 17:17:12+00','O registro TSE #NULO não autoriza atribuir bens ou declaração negativa a esta identidade; nenhum patrimônio do governador homônimo foi transferido.',null),
  ('destaques-votacoes','indeterminado','2026-08-12 17:17:12+00','Não há identificador parlamentar federal versionado para consulta nominal; nenhuma votação do governador homônimo foi transferida e nenhum vazio foi inferido.',null);

do $$
declare
  identidade integer;
  dependencia integer;
  existentes integer;
begin
  select count(*) into identidade
  from public.candidatos_publico
  where id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'
    and slug='orleans-brandao'
    and nome_completo='Carlos Orleans Braide Brandão'
    and data_nascimento=date '1994-12-08';
  if identidade <> 1 then raise exception 'pre-condicao: identidade Orleans divergente (%)', identidade; end if;

  select count(*) into dependencia from supabase_migrations.schema_migrations where version='20260811102100';
  if dependencia <> 1 then raise exception 'pre-condicao: split 20260811102100 ausente ou duplicado (%)', dependencia; end if;

  if (select count(*) from _orleans_destaques_proveniencia) <> 5
     or (select count(*) from _orleans_destaques_proveniencia where resultado='indeterminado') <> 4
     or (select count(*) from _orleans_destaques_proveniencia where resultado='sem_achado_no_escopo') <> 1
     or exists(select 1 from _orleans_destaques_proveniencia where resultado in ('vazio_confirmado','nao_aplicavel'))
  then raise exception 'pre-condicao: manifesto Orleans divergente'; end if;

  select count(*) into existentes
  from public.coleta_log l
  join _orleans_destaques_proveniencia e on e.fonte=l.fonte
  where l.escopo='candidato' and l.alvo='orleans-brandao'
    and (l.execucao='migration:20260812124000' or l.executado_em >= e.executado_em);
  if existentes <> 0 then raise exception 'pre-condicao: % verificacao igual ou posterior', existentes; end if;
end $$;

-- @write tabela=coleta_log ref=orleans-destaques-proveniencia:5 campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
insert into public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)
select e.fonte,'candidato','orleans-brandao',c.id,e.executado_em,e.resultado,0,e.detalhe,e.url,'migration:20260812124000','coleta'
from _orleans_destaques_proveniencia e
cross join public.candidatos_publico c
cross join (values ('orleans-destaques-proveniencia:5')) as lote(ref)
where c.id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'
  and c.slug='orleans-brandao' and lote.ref='orleans-destaques-proveniencia:5';

do $$
declare gravadas integer; divergentes integer;
begin
  select count(*) into gravadas from public.coleta_log where execucao='migration:20260812124000';
  select count(*) into divergentes
  from _orleans_destaques_proveniencia e
  left join public.coleta_log l on l.execucao='migration:20260812124000' and l.fonte=e.fonte
  where l.escopo is distinct from 'candidato' or l.alvo is distinct from 'orleans-brandao'
     or l.candidato_id is distinct from 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
     or l.executado_em is distinct from e.executado_em or l.resultado is distinct from e.resultado
     or l.volume is distinct from 0 or l.detalhe is distinct from e.detalhe
     or l.url is distinct from e.url or l.natureza is distinct from 'coleta';
  if gravadas <> 5 or divergentes <> 0 then raise exception 'pos-condicao: gravadas %, divergentes %', gravadas, divergentes; end if;
end $$;
