-- ES Governador: ajuste de acentos em strings publicas da ficha.

UPDATE public.candidatos
SET
  biografia = 'Lorenzo Silva de Pazolini é delegado de polícia, advogado e político brasileiro, filiado ao Republicanos. Foi deputado estadual e prefeito de Vitória; a Câmara de Vitória registrou em 01/04/2026 a comunicação de renúncia ao mandato de prefeito, com efeitos a partir de 04/04/2026, para fins de desincompatibilização eleitoral.',
  ultima_atualizacao = now()
WHERE slug = 'pazolini';

UPDATE public.historico_politico
SET
  observacoes = 'Reeleito prefeito de Vitória em 2024 pelo TSE; a Câmara Municipal de Vitória registrou em 01/04/2026 a comunicação de renúncia ao mandato, com efeitos a partir de 04/04/2026.'
WHERE id = 'd94d5b4d-8182-44ad-8cdd-9f82cad38ba3';

UPDATE public.pontos_atencao
SET
  fontes = '[
    {"url":"https://www.tse.jus.br","titulo":"TSE - candidaturas 2018/2020/2024"},
    {"url":"https://www.cmv.es.gov.br/noticia/ler/11679/-cmara-de-vitria-recebe-comunicao-de-renncia-de-pazolini","titulo":"Câmara de Vitória - renúncia de Pazolini"}
  ]'::jsonb
WHERE id = '9c885daa-3da5-489c-80c2-6dab87585ec1';

UPDATE public.candidatos
SET
  cargo_atual = 'Governador do Espírito Santo',
  biografia = 'Ricardo de Rezende Ferraço é político brasileiro, filiado ao MDB. Foi vereador, deputado estadual, deputado federal, senador e vice-governador do Espírito Santo; o Governo ES registrou sua posse como governador do Estado em 02/04/2026, após a renúncia de Renato Casagrande.',
  ultima_atualizacao = now()
WHERE slug = 'ricardo-ferraco';

UPDATE public.historico_politico
SET
  eleito_por = 'sucessão constitucional',
  observacoes = 'Vice-governador do Espírito Santo eleito em 2022 pelo TSE; mandato encerrado em 02/04/2026 com posse como governador, conforme Governo ES.'
WHERE id = '58b6227c-4bcf-427e-a556-1ab7a6ff7418';

UPDATE public.historico_politico
SET
  eleito_por = 'sucessão constitucional',
  observacoes = 'Governo ES registrou a posse de Ricardo Ferraço como governador do Estado do Espírito Santo em 02/04/2026, após a renúncia de Renato Casagrande.'
WHERE id = 'f4c6375a-f6b7-46e9-9965-2b92196b0e42';

UPDATE public.pontos_atencao
SET
  fontes = '[
    {"url":"https://www.es.gov.br/governo/governador","titulo":"Governo ES - Governador Ricardo Ferraço"},
    {"url":"https://www.es.gov.br/Noticia/ricardo-ferraco-toma-posse-como-governador-do-espirito-santo","titulo":"Governo ES - posse em 02/04/2026"},
    {"url":"https://legis.senado.leg.br/dadosabertos/senador/635/mandatos?v=5","titulo":"Senado Dados Abertos - mandatos"}
  ]'::jsonb
WHERE id = '337bc0e5-614c-433d-8da9-584e3fee29f7';

UPDATE public.legislacao_mandato_executivo
SET
  ementa = 'Lei que inverte fases em licitações públicas para serviços médicos, exigindo comprovação de capacidade técnica antes da apresentação de preços.',
  signatario = 'RICARDO DE REZENDE FERRAÇO',
  fonte_primaria_titulo = 'Ales - sanção da Lei 12.858/2026'
WHERE identificador_fonte = 'ALES:LEI-12858-2026';

UPDATE public.legislacao_mandato_executivo
SET
  signatario = 'RICARDO DE REZENDE FERRAÇO',
  fonte_primaria_titulo = 'Ales - Lei 12.871/2026 sobre navegação de pacientes'
WHERE identificador_fonte = 'ALES:LEI-12871-2026';

UPDATE public.gastos_parlamentares
SET
  detalhamento = replace(
    replace(
      replace(
        replace(
          replace(detalhamento::text,
            'Passagens aereas, aquaticas e terrestres nacionais',
            'Passagens aéreas, aquáticas e terrestres nacionais'
          ),
          'Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes',
          'Locomoção, hospedagem, alimentação, combustíveis e lubrificantes'
        ),
        'Aluguel de imoveis para escritorio politico, compreendendo despesas concernentes a eles.',
        'Aluguel de imóveis para escritório político, compreendendo despesas concernentes a eles.'
      ),
      'Divulgacao da atividade parlamentar',
      'Divulgação da atividade parlamentar'
    ),
    'Aquisicao de material de consumo para uso no escritorio politico',
    'Aquisição de material de consumo para uso no escritório político'
  )::jsonb,
  gastos_destaque = replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(gastos_destaque::text,
                  'Passagens aereas, aquaticas e terrestres nacionais',
                  'Passagens aéreas, aquáticas e terrestres nacionais'
                ),
                'Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes',
                'Locomoção, hospedagem, alimentação, combustíveis e lubrificantes'
              ),
              'Aluguel de imoveis para escritorio politico, compreendendo despesas concernentes a eles.',
              'Aluguel de imóveis para escritório político, compreendendo despesas concernentes a eles.'
            ),
            'Divulgacao da atividade parlamentar',
            'Divulgação da atividade parlamentar'
          ),
          'Aquisicao de material de consumo para uso no escritorio politico',
          'Aquisição de material de consumo para uso no escritório político'
        ),
        'Adria Viagens e Turismo Ltda',
        'Ádria Viagens e Turismo Ltda'
      ),
      'Britanica Viagens e Turismo',
      'Britânica Viagens e Turismo'
    ),
    'Posto Tres Coqueiros Ltda',
    'Posto Três Coqueiros Ltda'
  )::jsonb
WHERE candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'magno-malta')
  AND fonte = 'Senado CEAPS';
