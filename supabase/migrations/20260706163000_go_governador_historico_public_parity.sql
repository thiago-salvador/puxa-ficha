-- Alinha o historico bruto de GO/Governador ao payload publico normalizado.
-- As linhas removidas abaixo duplicavam linhas TSE ja publicas e faziam o snapshot
-- bruto contar mais itens que a API publica apos deduplicacao.

do $$
declare
  daniel_id uuid;
  wilder_id uuid;
begin
  select id into daniel_id from public.candidatos where slug = 'daniel-vilela';
  select id into wilder_id from public.candidatos where slug = 'wilder-morais';

  if daniel_id is null or wilder_id is null then
    raise exception 'GO governador candidatos esperados ausentes para limpeza de historico';
  end if;

  delete from public.historico_politico
  where candidato_id = daniel_id
    and id = '66d6c7db-5338-499f-b4ae-b52e44b59456'::uuid
    and cargo = 'Vice-Governador'
    and periodo_inicio = 2023
    and periodo_fim = 2026
    and coalesce(observacoes, '') ilike '%sucessao%';

  delete from public.historico_politico
  where candidato_id = wilder_id
    and id = '9b33ed72-6650-4a3d-bd2b-60d0a7585f5a'::uuid
    and cargo = 'Senador'
    and periodo_inicio = 2023
    and periodo_fim = 2031;
end $$;
