-- Esperado: 292 linhas, 180 fichas, 241 indeterminados, 51 limitados e zero vazio fabricado.
create temp table pf_readback_destaques_194 as
select
  (select count(*) from supabase_migrations.schema_migrations where version='20260811101000') as ledger,
  (select count(*) from supabase_migrations.schema_migrations where version='20260811102100') as split_identidade_ledger,
  count(*) as linhas,
  count(distinct alvo) as fichas,
  count(*) filter (where fonte='destaques-trajetoria') as trajetoria,
  count(*) filter (where fonte='destaques-patrimonio') as patrimonio,
  count(*) filter (where fonte='destaques-votacoes') as votacoes,
  count(*) filter (where resultado='indeterminado') as indeterminados,
  count(*) filter (where resultado='sem_achado_no_escopo') as limitados,
  count(*) filter (where resultado='vazio_confirmado') as vazios_incorretos,
  md5(string_agg(
    concat_ws(chr(30),
      l.fonte,
      l.escopo,
      l.alvo,
      coalesce(c.slug, '<null>'),
      to_char(l.executado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      l.resultado,
      l.volume::text,
      coalesce(l.detalhe, '<null>'),
      coalesce(l.url, '<null>'),
      l.execucao,
      l.natureza
    ),
    chr(31) order by l.fonte collate "C", l.alvo collate "C"
  )) as assinatura_payload
from public.coleta_log l
left join public.candidatos c on c.id=l.candidato_id
where l.execucao='migration:20260811101000';

do $readback$
declare r pf_readback_destaques_194%rowtype;
begin
  select * into strict r from pf_readback_destaques_194;
  if r.ledger <> 1 or r.linhas <> 292 or r.fichas <> 180
     or r.trajetoria <> 80 or r.patrimonio <> 32 or r.votacoes <> 180
     or r.indeterminados <> 241 or r.limitados <> 51
     or r.vazios_incorretos <> 0
     or r.split_identidade_ledger not in (0, 1)
     or r.assinatura_payload is distinct from (case r.split_identidade_ledger
       when 0 then '456ba86bfc5de2cc7a51714f4cef0f8c'
       when 1 then '95cc5a76055102f6b8684ad33818d731'
       else null
     end) then
    raise exception 'readback 20260811101000: %', row_to_json(r);
  end if;
end
$readback$;

table pf_readback_destaques_194;
