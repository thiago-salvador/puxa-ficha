-- Snapshot read-only da coorte pública para o gate preventivo de processos.
--
-- A consulta deliberadamente não filtra cargo: candidatos do Senado e de
-- qualquer outro cargo publicado entram na mesma coorte. A junção exige os
-- quatro identificadores do contrato (id, slug, fonte e escopo); um recibo de
-- outro alvo ou de outra fonte não cobre o candidato.
--
-- O comando recomendado é `psql -Atq -f processos-coverage-snapshot.sql`:
-- a única linha devolvida é um objeto JSON consumível pelo checker.
begin transaction read only;
select json_build_object(
  'rows', coalesce(json_agg(to_jsonb(snapshot) order by snapshot.slug, snapshot.candidate_id), '[]'::json)
)::text
from (
  select
    c.id::text as candidate_id,
    c.slug,
    u.candidato_id::text as receipt_candidate_id,
    u.alvo as receipt_slug,
    u.fonte as receipt_source,
    u.escopo as receipt_scope,
    u.executado_em as receipt_executed_at,
    u.resultado as receipt_result,
    u.volume as receipt_volume,
    (u.candidato_id is not null) as has_receipt
  from public.candidatos_publico as c
  left join public.coleta_log_ultima as u
    on u.candidato_id = c.id
   and u.alvo = c.slug
   and u.fonte = 'processos-curadoria'
   and u.escopo = 'candidato'
) as snapshot;
commit;
