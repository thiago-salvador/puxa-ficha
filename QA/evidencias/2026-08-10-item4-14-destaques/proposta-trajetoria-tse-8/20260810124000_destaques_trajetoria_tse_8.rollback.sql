-- Rollback da proposta local de trajetória TSE. Remove somente a execução
-- nomeada, preservando verificações posteriores.

do $$
declare
  linhas integer;
  incoerentes integer;
begin
  select count(*), count(*) filter (
    where fonte <> 'destaques-trajetoria'
       or resultado <> 'sem_achado_no_escopo'
       or volume <> 0
  ) into linhas, incoerentes
    from public.coleta_log
   where execucao = 'migration:20260810124000';
  if linhas not in (0, 8) or incoerentes <> 0 then
    raise exception 'rollback recusado: linhas %, incoerentes %', linhas, incoerentes;
  end if;
end $$;

-- @write tabela=coleta_log ref=destaques-trajetoria:tse-8:rollback campos=fonte,execucao
delete from public.coleta_log
 where execucao = 'migration:20260810124000'
   and fonte = 'destaques-trajetoria';

do $$
begin
  if exists (select 1 from public.coleta_log where execucao = 'migration:20260810124000') then
    raise exception 'pos-condicao: sobraram linhas da proposta de trajetória TSE';
  end if;
end $$;
