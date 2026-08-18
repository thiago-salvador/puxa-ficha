-- GO/Governador: materializa CEAPS Senado de Wilder Morais para remover gap acionavel de gastos.
-- Fonte oficial: https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_{ano}.csv
-- Filtro: SENADOR = 'WILDER MORAIS'. Dados agregados por ano e tipo de despesa, sem CPF/CNPJ.

do $$
declare
  wilder_id uuid;
  row_count int;
begin
  select id into wilder_id
  from public.candidatos
  where slug = 'wilder-morais'
    and publicavel = true;

  if wilder_id is null then
    raise exception 'wilder-morais publicavel ausente';
  end if;

  delete from public.gastos_parlamentares
  where candidato_id = wilder_id
    and fonte = 'Senado CEAPS'
    and ano between 2023 and 2026;

  insert into public.gastos_parlamentares (
    candidato_id,
    ano,
    total_gasto,
    detalhamento,
    gastos_destaque,
    fonte
  )
  values
    (
      wilder_id,
      2023,
      156069.27,
      '[
        {"categoria":"Aluguel de imóveis para escritório político, compreendendo despesas concernentes a eles.","valor":68054.71,"quantidade":49},
        {"categoria":"Aquisição de material de consumo para uso no escritório político, inclusive aquisição ou locação de software, despesas postais, aquisição de publicações, locação de móveis e de equipamentos.","valor":49947.20,"quantidade":29},
        {"categoria":"Locomoção, hospedagem, alimentação, combustíveis e lubrificantes","valor":34307.36,"quantidade":137},
        {"categoria":"Divulgação da atividade parlamentar","valor":3340.00,"quantidade":3},
        {"categoria":"Serviços de Segurança Privada","valor":420.00,"quantidade":3}
      ]'::jsonb,
      '[{"descricao":"CEAPS Senado 2023: 221 linhas oficiais agregadas, total R$ 156.069,27","valor":156069.27,"categoria":"Senado CEAPS"}]'::jsonb,
      'Senado CEAPS'
    ),
    (
      wilder_id,
      2024,
      196152.69,
      '[
        {"categoria":"Aquisição de material de consumo para uso no escritório político, inclusive aquisição ou locação de software, despesas postais, aquisição de publicações, locação de móveis e de equipamentos.","valor":82295.01,"quantidade":35},
        {"categoria":"Aluguel de imóveis para escritório político, compreendendo despesas concernentes a eles.","valor":73446.68,"quantidade":53},
        {"categoria":"Locomoção, hospedagem, alimentação, combustíveis e lubrificantes","valor":36046.78,"quantidade":137},
        {"categoria":"Divulgação da atividade parlamentar","valor":2637.25,"quantidade":2},
        {"categoria":"Serviços de Segurança Privada","valor":1440.00,"quantidade":8},
        {"categoria":"Contratação de consultorias, assessorias, pesquisas, trabalhos técnicos e outros serviços de apoio ao exercício do mandato parlamentar","valor":286.97,"quantidade":1}
      ]'::jsonb,
      '[{"descricao":"CEAPS Senado 2024: 236 linhas oficiais agregadas, total R$ 196.152,69","valor":196152.69,"categoria":"Senado CEAPS"}]'::jsonb,
      'Senado CEAPS'
    ),
    (
      wilder_id,
      2025,
      0,
      '[{"categoria":"Sem registros para WILDER MORAIS no arquivo CEAPS oficial do Senado de 2025","valor":0,"quantidade":0}]'::jsonb,
      '[]'::jsonb,
      'Senado CEAPS'
    ),
    (
      wilder_id,
      2026,
      72431.84,
      '[
        {"categoria":"Aluguel de imóveis para escritório político, compreendendo despesas concernentes a eles.","valor":35315.89,"quantidade":22},
        {"categoria":"Aquisição de material de consumo para uso no escritório político, inclusive aquisição ou locação de software, despesas postais, aquisição de publicações, locação de móveis e de equipamentos.","valor":34844.70,"quantidade":16},
        {"categoria":"Locomoção, hospedagem, alimentação, combustíveis e lubrificantes","valor":1638.25,"quantidade":5},
        {"categoria":"Serviços de Segurança Privada","valor":390.00,"quantidade":2},
        {"categoria":"Divulgação da atividade parlamentar","valor":243.00,"quantidade":1}
      ]'::jsonb,
      '[{"descricao":"CEAPS Senado 2026: 46 linhas oficiais agregadas, total R$ 72.431,84","valor":72431.84,"categoria":"Senado CEAPS"}]'::jsonb,
      'Senado CEAPS'
    );

  select count(*) into row_count
  from public.gastos_parlamentares
  where candidato_id = wilder_id
    and fonte = 'Senado CEAPS'
    and ano between 2023 and 2026;

  if row_count <> 4 then
    raise exception 'wilder-morais CEAPS esperado 4 anos, encontrado %', row_count;
  end if;
end $$;
