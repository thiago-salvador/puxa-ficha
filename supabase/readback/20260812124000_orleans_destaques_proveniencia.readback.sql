\set ON_ERROR_STOP on
begin read only;

do $$
declare
  ledger integer;
  dependencia integer;
  identidade integer;
  total integer;
  silenciosas integer;
  expected_payload_mismatch integer;
  extras integer;
  -- A 20260812125000 corrige a chave de roteamento de duas destas cinco linhas:
  -- sanções e processos passam a viver nas fontes que a superfície consulta.
  -- O contrato aceita os dois estados nomeados, antes e depois, e nada além.
  corrigido boolean;
  fonte_sancoes text;
  fonte_processos text;
begin
  select exists(select 1 from supabase_migrations.schema_migrations where version='20260812125000')
    into corrigido;
  fonte_sancoes := case when corrigido then 'transparencia-sanctions' else 'destaques-sancoes' end;
  fonte_processos := case when corrigido then 'processos-curadoria' else 'destaques-processos' end;

  select count(*) into ledger from supabase_migrations.schema_migrations where version='20260812124000';
  select count(*) into dependencia from supabase_migrations.schema_migrations where version='20260811102100';
  select count(*) into identidade from public.candidatos_publico
   where id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601' and slug='orleans-brandao'
     and nome_completo='Carlos Orleans Braide Brandão' and data_nascimento=date '1994-12-08';
  select count(*) into total from public.coleta_log where execucao='migration:20260812124000';
  select count(*) into silenciosas from public.coleta_log
   where execucao='migration:20260812124000' and resultado in ('vazio_confirmado','nao_aplicavel','nao_coletado','nunca_verificado');

  with expected(fonte,resultado,executado_em,detalhe,url) as (values
    (fonte_sancoes,'indeterminado','2026-08-12 17:17:12+00'::timestamptz,'CPF validado não está disponível para atribuir com segurança a consulta nominal nas bases federais de sanções; nenhuma ausência foi inferida.',null::text),
    (fonte_processos,'indeterminado','2026-08-12 17:17:12+00'::timestamptz,'Não há manifesto judicial nominal aprovado para esta identidade; processos do governador homônimo não foram transferidos e nenhuma ausência foi inferida.',null::text),
    ('destaques-trajetoria','sem_achado_no_escopo','2026-08-12 17:17:12+00'::timestamptz,'Consulta oficial TSE 2026 executada por SQ_CANDIDATO, UF, cargo, nome e nascimento; o resultado #NULO ancora a identidade, mas não comprova mandato nem candidatura registrada ou deferida.','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'),
    ('destaques-patrimonio','indeterminado','2026-08-12 17:17:12+00'::timestamptz,'O registro TSE #NULO não autoriza atribuir bens ou declaração negativa a esta identidade; nenhum patrimônio do governador homônimo foi transferido.',null::text),
    ('destaques-votacoes','indeterminado','2026-08-12 17:17:12+00'::timestamptz,'Não há identificador parlamentar federal versionado para consulta nominal; nenhuma votação do governador homônimo foi transferida e nenhum vazio foi inferido.',null::text)
  )
  select count(*) into expected_payload_mismatch
  from expected e left join public.coleta_log l on l.execucao='migration:20260812124000' and l.fonte=e.fonte
  where l.escopo is distinct from 'candidato' or l.alvo is distinct from 'orleans-brandao'
     or l.candidato_id is distinct from 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
     or l.executado_em is distinct from e.executado_em or l.resultado is distinct from e.resultado
     or l.volume is distinct from 0 or l.detalhe is distinct from e.detalhe
     or l.url is distinct from e.url or l.natureza is distinct from 'coleta';

  select count(*) into extras from public.coleta_log l
   where l.execucao='migration:20260812124000'
     and (l.fonte not in (fonte_sancoes,fonte_processos,'destaques-trajetoria','destaques-patrimonio','destaques-votacoes')
       or l.alvo<>'orleans-brandao');
  if ledger<>1 or dependencia<>1 or identidade<>1 or total<>5 or silenciosas<>0 or expected_payload_mismatch<>0 or extras<>0 then
    raise exception 'readback 124000 divergente ledger=% dependencia=% identidade=% total=% silenciosas=% expected_payload_mismatch=% extras=%', ledger,dependencia,identidade,total,silenciosas,expected_payload_mismatch,extras;
  end if;
end $$;

select 1 as ledger_ok, 5 as celulas, 4 as indeterminadas, 1 as limitada, 0 as silenciosas;
rollback;
