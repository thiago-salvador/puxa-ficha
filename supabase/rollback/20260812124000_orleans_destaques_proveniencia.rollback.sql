\set ON_ERROR_STOP on
begin;

do $$
declare ledger integer; total integer; divergentes integer; extras integer;
begin
  select count(*) into ledger from supabase_migrations.schema_migrations where version='20260812124000';
  select count(*) into total from public.coleta_log where execucao='migration:20260812124000';
  with expected(fonte,resultado,detalhe,url) as (values
    ('destaques-sancoes','indeterminado','CPF validado não está disponível para atribuir com segurança a consulta nominal nas bases federais de sanções; nenhuma ausência foi inferida.',null::text),
    ('destaques-processos','indeterminado','Não há manifesto judicial nominal aprovado para esta identidade; processos do governador homônimo não foram transferidos e nenhuma ausência foi inferida.',null::text),
    ('destaques-trajetoria','sem_achado_no_escopo','Consulta oficial TSE 2026 executada por SQ_CANDIDATO, UF, cargo, nome e nascimento; o resultado #NULO ancora a identidade, mas não comprova mandato nem candidatura registrada ou deferida.','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
    ('destaques-patrimonio','indeterminado','O registro TSE #NULO não autoriza atribuir bens ou declaração negativa a esta identidade; nenhum patrimônio do governador homônimo foi transferido.',null::text),
    ('destaques-votacoes','indeterminado','Não há identificador parlamentar federal versionado para consulta nominal; nenhuma votação do governador homônimo foi transferida e nenhum vazio foi inferido.',null::text)
  )
  select count(*) into divergentes from expected e
  left join public.coleta_log l on l.execucao='migration:20260812124000' and l.fonte=e.fonte
  where l.alvo is distinct from 'orleans-brandao' or l.candidato_id is distinct from 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
     or l.resultado is distinct from e.resultado or l.executado_em is distinct from '2026-08-12 17:17:12+00'::timestamptz
     or l.escopo is distinct from 'candidato' or l.volume is distinct from 0 or l.natureza is distinct from 'coleta'
     or l.detalhe is distinct from e.detalhe or l.url is distinct from e.url;
  select count(*) into extras from public.coleta_log
   where execucao='migration:20260812124000'
     and fonte not in ('destaques-sancoes','destaques-processos','destaques-trajetoria','destaques-patrimonio','destaques-votacoes');
  if ledger<>1 or total<>5 or divergentes<>0 or extras<>0 then
    raise exception 'rollback recusado: payload atual diverge da forward ledger=% total=% divergentes=% extras=%',ledger,total,divergentes,extras;
  end if;
end $$;

delete from public.coleta_log where execucao='migration:20260812124000';
delete from supabase_migrations.schema_migrations where version='20260812124000';

do $$ begin
  if exists(select 1 from public.coleta_log where execucao='migration:20260812124000')
     or exists(select 1 from supabase_migrations.schema_migrations where version='20260812124000')
  then raise exception 'rollback recusado: resíduos persistidos'; end if;
end $$;

commit;
