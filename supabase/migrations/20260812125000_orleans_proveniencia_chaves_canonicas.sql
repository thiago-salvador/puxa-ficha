-- A 20260812124000 registrou as cinco proveniências do novo perfil Orleans, mas
-- gravou duas delas sob chaves de fonte que a superfície não consulta. A ficha
-- lê sanções de `transparencia-sanctions` e processos de `processos-curadoria`;
-- só trajetória, patrimônio e votações usam o prefixo `destaques-`. Por isso a
-- Fase 4 seguia lendo essas duas células como `nunca_verificado` embora o dado
-- existisse: 193 das 194 fichas públicas têm linha em `transparencia-sanctions`
-- e a única faltante era esta.
--
-- Esta migration corrige SOMENTE a chave de roteamento. Resultado, detalhe, url,
-- volume, data, execução e natureza permanecem idênticos, porque o conteúdo da
-- proveniência já estava certo: `indeterminado` mapeia para "não foi possível
-- verificar" no DTO. Nenhuma ausência é afirmada, nenhum dado do governador
-- homônimo é transferido e nenhuma célula vira zero.

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
  dependencia integer;
  identidade integer;
  origem integer;
  destino_ocupado integer;
  payload_divergente integer;
begin
  select count(*) into dependencia
    from supabase_migrations.schema_migrations where version='20260812124000';
  if dependencia <> 1 then
    raise exception 'pre-condicao: 20260812124000 ausente ou duplicada (%)', dependencia;
  end if;

  select count(*) into identidade
    from public.candidatos_publico
   where id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'
     and slug='orleans-brandao'
     and nome_completo='Carlos Orleans Braide Brandão'
     and data_nascimento=date '1994-12-08';
  if identidade <> 1 then
    raise exception 'pre-condicao: identidade Orleans divergente (%)', identidade;
  end if;

  -- Exatamente uma linha por chave errada, e nenhuma linha fora do Orleans:
  -- se outra ficha passar a usar essas chaves, o roteamento deixa de ser um
  -- caso isolado e esta migration não pode decidir por ela.
  select count(*) into origem
    from public.coleta_log l
    join _orleans_chaves e on e.fonte_atual = l.fonte;
  if origem <> 2 then
    raise exception 'pre-condicao: esperado 2 linhas nas chaves antigas, encontrado %', origem;
  end if;

  select count(*) into payload_divergente
    from _orleans_chaves e
    left join public.coleta_log l
      on l.fonte = e.fonte_atual
     and l.execucao = 'migration:20260812124000'
   where l.escopo is distinct from 'candidato'
      or l.alvo is distinct from 'orleans-brandao'
      or l.candidato_id is distinct from 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
      or l.executado_em is distinct from e.executado_em
      or l.resultado is distinct from e.resultado
      or l.detalhe is distinct from e.detalhe
      or l.volume is distinct from 0
      or l.url is not null
      or l.natureza is distinct from 'coleta';
  if payload_divergente <> 0 then
    raise exception 'pre-condicao: payload das linhas a mover divergiu em % linha(s)', payload_divergente;
  end if;

  -- O destino tem que estar livre para esta identidade, senão a correção
  -- duplicaria proveniência em vez de rotear a que existe.
  select count(*) into destino_ocupado
    from public.coleta_log l
    join _orleans_chaves e on e.fonte_canonica = l.fonte
   where l.candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;
  if destino_ocupado <> 0 then
    raise exception 'pre-condicao: Orleans ja possui % linha(s) nas chaves canonicas', destino_ocupado;
  end if;
end $$;

-- @write tabela=coleta_log ref=orleans-chaves-canonicas:2 campos=fonte
update public.coleta_log l
   set fonte = e.fonte_canonica
  from _orleans_chaves e
     , (values ('orleans-chaves-canonicas:2')) as lote(ref)
 where lote.ref = 'orleans-chaves-canonicas:2'
   and l.fonte = e.fonte_atual
   and l.execucao = 'migration:20260812124000'
   and l.escopo = 'candidato'
   and l.alvo = 'orleans-brandao'
   and l.candidato_id = 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;

do $$
declare
  sobraram integer;
  chegaram integer;
  payload_divergente integer;
  total_124000 integer;
begin
  select count(*) into sobraram
    from public.coleta_log l
    join _orleans_chaves e on e.fonte_atual = l.fonte;
  if sobraram <> 0 then
    raise exception 'pos-condicao: % linha(s) permanecem nas chaves antigas', sobraram;
  end if;

  select count(*) into chegaram
    from public.coleta_log l
    join _orleans_chaves e on e.fonte_canonica = l.fonte
   where l.candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;
  if chegaram <> 2 then
    raise exception 'pos-condicao: esperado 2 linhas canonicas para Orleans, encontrado %', chegaram;
  end if;

  select count(*) into payload_divergente
    from _orleans_chaves e
    left join public.coleta_log l
      on l.fonte = e.fonte_canonica
     and l.candidato_id = 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid
   where l.execucao is distinct from 'migration:20260812124000'
      or l.escopo is distinct from 'candidato'
      or l.alvo is distinct from 'orleans-brandao'
      or l.executado_em is distinct from e.executado_em
      or l.resultado is distinct from e.resultado
      or l.detalhe is distinct from e.detalhe
      or l.volume is distinct from 0
      or l.url is not null
      or l.natureza is distinct from 'coleta';
  if payload_divergente <> 0 then
    raise exception 'pos-condicao: payload preservado divergiu em % linha(s)', payload_divergente;
  end if;

  select count(*) into total_124000
    from public.coleta_log where execucao='migration:20260812124000';
  if total_124000 <> 5 then
    raise exception 'pos-condicao: lote da 124000 deixou de ter 5 linhas (%)', total_124000;
  end if;
end $$;
