-- Devolve as duas proveniências do Orleans às chaves originais da 20260812124000.
-- O rollback só é legítimo no estado exato deixado pela forward: duas linhas
-- canônicas do Orleans, com payload preservado, e nenhuma linha nas chaves
-- antigas. Fora disso ele aborta, para não desfazer o que não escreveu.

create temp table _orleans_chaves (
  fonte_atual text primary key,
  fonte_canonica text not null,
  resultado text not null,
  executado_em timestamptz not null,
  detalhe text not null
) on commit drop;

insert into _orleans_chaves(fonte_atual,fonte_canonica,resultado,executado_em,detalhe) values
  ('destaques-sancoes','transparencia-sanctions','indeterminado','2026-08-12 17:17:12+00','CPF validado não está disponível para atribuir com segurança a consulta nominal nas bases federais de sanções; nenhuma ausência foi inferida.'),
  ('destaques-processos','processos-curadoria','indeterminado','2026-08-12 17:17:12+00','Não há manifesto judicial nominal aprovado para esta identidade; processos do governador homônimo não foram transferidos e nenhuma ausência foi inferida.');

do $$
declare
  ledger integer;
  presentes integer;
  antigas integer;
begin
  -- Sem a versão no ledger não existe o que desfazer: rodar assim moveria
  -- linhas que esta migration não escreveu.
  select count(*) into ledger
    from supabase_migrations.schema_migrations where version='20260812125000';
  if ledger <> 1 then
    raise exception 'rollback: 20260812125000 ausente ou duplicada no ledger (%)', ledger;
  end if;

  select count(*) into presentes
    from public.coleta_log l
    join _orleans_chaves e on e.fonte_canonica = l.fonte
   where l.candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
     and l.execucao='migration:20260812124000'
     and l.executado_em = e.executado_em
     and l.resultado = e.resultado
     and l.detalhe = e.detalhe;
  if presentes <> 2 then
    raise exception 'rollback: estado esperado ausente, % linha(s) canonicas do Orleans', presentes;
  end if;

  select count(*) into antigas
    from public.coleta_log l
    join _orleans_chaves e on e.fonte_atual = l.fonte;
  if antigas <> 0 then
    raise exception 'rollback: % linha(s) ja estao nas chaves antigas', antigas;
  end if;
end $$;

-- @write tabela=coleta_log ref=orleans-chaves-canonicas:2 campos=fonte
update public.coleta_log l
   set fonte = e.fonte_atual
  from _orleans_chaves e
     , (values ('orleans-chaves-canonicas:2')) as lote(ref)
 where lote.ref = 'orleans-chaves-canonicas:2'
   and l.fonte = e.fonte_canonica
   and l.execucao = 'migration:20260812124000'
   and l.escopo = 'candidato'
   and l.alvo = 'orleans-brandao'
   and l.candidato_id = 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;

do $$
declare voltaram integer; sobraram integer;
begin
  select count(*) into voltaram
    from public.coleta_log l join _orleans_chaves e on e.fonte_atual = l.fonte;
  select count(*) into sobraram
    from public.coleta_log l join _orleans_chaves e on e.fonte_canonica = l.fonte
   where l.candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;
  if voltaram <> 2 or sobraram <> 0 then
    raise exception 'rollback: pos-condicao falhou voltaram=% sobraram=%', voltaram, sobraram;
  end if;
end $$;

delete from supabase_migrations.schema_migrations where version='20260812125000';
