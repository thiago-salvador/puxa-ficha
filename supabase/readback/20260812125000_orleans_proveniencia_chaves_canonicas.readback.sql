begin read only;

do $$
declare
  ledger integer;
  dependencia integer;
  antigas_global integer;
  canonicas_orleans integer;
  payload_divergente integer;
  total_124000 integer;
  silenciosas integer;
begin
  select count(*) into ledger
    from supabase_migrations.schema_migrations where version='20260812125000';
  select count(*) into dependencia
    from supabase_migrations.schema_migrations where version='20260812124000';

  -- As chaves inventadas não podem sobrar em lugar nenhum do banco: elas nunca
  -- foram convenção, existiam só nestas duas linhas.
  select count(*) into antigas_global
    from public.coleta_log
   where fonte in ('destaques-sancoes','destaques-processos');

  select count(*) into canonicas_orleans
    from public.coleta_log
   where candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
     and fonte in ('transparencia-sanctions','processos-curadoria');

  with esperado(fonte,resultado,executado_em,detalhe) as (values
    ('transparencia-sanctions','indeterminado','2026-08-12 17:17:12+00'::timestamptz,'CPF validado não está disponível para atribuir com segurança a consulta nominal nas bases federais de sanções; nenhuma ausência foi inferida.'),
    ('processos-curadoria','indeterminado','2026-08-12 17:17:12+00'::timestamptz,'Não há manifesto judicial nominal aprovado para esta identidade; processos do governador homônimo não foram transferidos e nenhuma ausência foi inferida.')
  )
  select count(*) into payload_divergente
    from esperado e
    left join public.coleta_log l
      on l.fonte = e.fonte
     and l.candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
   where l.execucao is distinct from 'migration:20260812124000'
      or l.escopo is distinct from 'candidato'
      or l.alvo is distinct from 'orleans-brandao'
      or l.executado_em is distinct from e.executado_em
      or l.resultado is distinct from e.resultado
      or l.detalhe is distinct from e.detalhe
      or l.volume is distinct from 0
      or l.url is not null
      or l.natureza is distinct from 'coleta';

  select count(*) into total_124000
    from public.coleta_log where execucao='migration:20260812124000';

  -- Nenhuma das cinco células do Orleans pode ter virado ausência afirmada.
  select count(*) into silenciosas
    from public.coleta_log
   where execucao='migration:20260812124000'
     and resultado in ('vazio_confirmado','nao_aplicavel','nao_coletado','nunca_verificado');

  if ledger<>1 or dependencia<>1 or antigas_global<>0 or canonicas_orleans<>2
     or payload_divergente<>0 or total_124000<>5 or silenciosas<>0 then
    raise exception 'readback 20260812125000 divergente: ledger=% dependencia=% antigas=% canonicas=% payload=% total124000=% silenciosas=%',
      ledger, dependencia, antigas_global, canonicas_orleans, payload_divergente, total_124000, silenciosas;
  end if;
end $$;

select 1 as ledger_ok, 0 as chaves_antigas, 2 as canonicas_orleans, 5 as celulas_124000, 0 as silenciosas;
rollback;
