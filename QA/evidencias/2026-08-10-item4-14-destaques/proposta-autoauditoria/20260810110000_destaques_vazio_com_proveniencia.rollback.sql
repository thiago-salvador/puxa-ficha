-- Rollback da auditoria materializada dos itens 4 e 14. Remove somente as
-- linhas criadas pela execução nomeada; tentativas posteriores ficam intactas.

do $$
declare
  trajetoria integer;
  votacoes integer;
  outras integer;
begin
  select count(*) filter (where fonte = 'destaques-trajetoria'),
         count(*) filter (where fonte = 'destaques-votacoes'),
         count(*) filter (where fonte not in ('destaques-trajetoria', 'destaques-votacoes'))
    into trajetoria, votacoes, outras
    from public.coleta_log
   where execucao = 'migration:20260810110000';
  if outras <> 0 or trajetoria <> votacoes then
    raise exception 'rollback recusado: execucao migration:20260810110000 tem trajetoria %, votacoes %, outras %', trajetoria, votacoes, outras;
  end if;
end $$;
-- @write tabela=coleta_log ref=destaques-proveniencia:rollback campos=fonte,execucao
delete from public.coleta_log
 where execucao = 'migration:20260810110000'
   and fonte in ('destaques-trajetoria', 'destaques-votacoes');

do $$
begin
  if exists (
    select 1
      from public.coleta_log
     where execucao = 'migration:20260810110000'
       and fonte in ('destaques-trajetoria', 'destaques-votacoes')
  ) then
    raise exception 'pos-condicao: sobraram linhas da auditoria de destaques';
  end if;
end $$;
