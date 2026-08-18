insert into public.historico_politico (
  candidato_id, cargo, cargo_canonico, tipo_evento, periodo_inicio, periodo_fim,
  partido, estado, eleito_por, observacoes, proveniencia
)
select
  c.id, 'Governador', 'Governador', 'candidatura', 2022, 2022,
  'PL', 'RR', 'nao eleito',
  'Candidatura TSE 2022, RR, governador, SQ 230002529896, identidade confirmada em fonte oficial, resultado NÃO ELEITO.',
  'tse'
from public.candidatos c
where c.slug = 'arthur-henrique'
  and not exists (
    select 1 from public.historico_politico h
    where h.candidato_id = c.id and h.periodo_inicio = 2022 and h.cargo = 'Governador'
  );
