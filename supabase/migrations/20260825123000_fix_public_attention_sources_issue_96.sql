-- Issue #96: remove fontes mortas ou genericas do recorte publico e preservar
-- a preimagem de cada decisao editorial para rollback auditavel.
--
-- Esta migration e fail-closed: aceita somente a preimagem medida em producao
-- em 2026-08-25 ou o estado final exato, quando executada novamente.

BEGIN;

CREATE TEMP TABLE _pf_issue_96_updates (
  id uuid PRIMARY KEY,
  titulo_antes text NOT NULL,
  descricao_antes text NOT NULL,
  fontes_antes jsonb NOT NULL,
  titulo_depois text NOT NULL,
  descricao_depois text NOT NULL,
  fontes_depois jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_issue_96_updates (
  id, titulo_antes, descricao_antes, fontes_antes,
  titulo_depois, descricao_depois, fontes_depois
) VALUES
(
  '337bc0e5-614c-433d-8da9-584e3fee29f7',
  'Carreira política: 5 cargo(s) eletivo(s) registrado(s)',
  'Ricardo de Rezende Ferraço (MDB) possui 5 cargo(s) eletivo(s) registrado(s): Vereador (Cachoeiro de Itapemirim), Deputado Estadual (ES, dois mandatos), Deputado Federal (ES, 1999-2003), Vice-Governador (ES, dois mandatos) e Senador (ES, 2011-2019). Assumiu o governo do Espírito Santo em 2 de abril de 2026 por sucessão, sem ter sido eleito para o cargo.',
  $j$[{"url":"https://www.es.gov.br/governo/governador","titulo":"Governo ES - Governador Ricardo Ferraço"},{"url":"https://www.es.gov.br/Noticia/ricardo-ferraco-toma-posse-como-governador-do-espirito-santo","titulo":"Governo ES - posse em 02/04/2026"},{"url":"https://legis.senado.leg.br/dadosabertos/senador/635/mandatos?v=5","titulo":"Senado Dados Abertos - mandatos"}]$j$::jsonb,
  'Carreira política: 5 cargo(s) eletivo(s) registrado(s)',
  'Ricardo de Rezende Ferraço (MDB) possui 5 cargo(s) eletivo(s) registrado(s): Vereador (Cachoeiro de Itapemirim), Deputado Estadual (ES, dois mandatos), Deputado Federal (ES, 1999-2003), Vice-Governador (ES, dois mandatos) e Senador (ES, 2011-2019). Assumiu o governo do Espírito Santo em 2 de abril de 2026 por sucessão, sem ter sido eleito para o cargo.',
  $j$[{"url":"https://www.es.gov.br/Noticia/ricardo-ferraco-toma-posse-como-governador-do-espirito-santo","titulo":"Governo ES - posse em 02/04/2026"},{"url":"https://legis.senado.leg.br/dadosabertos/senador/635/mandatos?v=5","titulo":"Senado Dados Abertos - mandatos"}]$j$::jsonb
),
(
  '98d9c7c6-263f-45dd-9442-e568106bae7c',
  'Contas irregulares no TCU',
  'O CPF de Cícero de Lucena Filho consta no cadastro de responsáveis com contas julgadas irregulares do TCU (CADIRREG), pelo processo 015.688/2007-6 (Tomada de Contas Especial), Acórdão 3121/2015 da Primeira Câmara, com trânsito em julgado em 25/05/2018. Registro retornado pela consulta pública da Plataforma de Certidões do TCU em 16/08/2026. Contas julgadas irregulares são decisão administrativa do TCU e não constituem condenação criminal.',
  $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/42733993","data":"2026-08-16","titulo":"TCU, Conecta: processo 015.688/2007-6 (Tomada de Contas Especial)"},{"url":"https://contas.tcu.gov.br/pesquisaJurisprudencia/#/resultado/acordao-completo/01568820076.PROC","data":"2026-08-16","titulo":"TCU, Pesquisa de Jurisprudência: Acórdão 3121/2015, Primeira Câmara"}]$j$::jsonb,
  'TCU julgou irregulares contas no Acórdão 3121/2015',
  'No Acórdão 3121/2015 da Primeira Câmara, o TCU julgou irregulares as contas de Cícero de Lucena Filho no processo 015.688/2007-6. Trata-se de decisão administrativa do TCU, não de condenação criminal.',
  $j$[{"url":"https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A3121%20ANOACORDAO%3A2015%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0","data":"2026-08-25","titulo":"TCU, Acórdão 3121/2015 da Primeira Câmara"}]$j$::jsonb
),
(
  'a6efc579-1e51-4b2a-9f3e-38eb897183a8',
  'Contas irregulares no TCU',
  'O CPF de Elizeu Morais de Aguiar consta no cadastro de responsáveis com contas julgadas irregulares do TCU (CADIRREG), pelo processo 006.099/2022-0 (Tomada de Contas Especial instaurada pela Superintendência Estadual da Funasa no Piauí), Acórdão 1488/2025 da Primeira Câmara, com trânsito em julgado em 21/03/2026. Registro retornado pela consulta pública da Plataforma de Certidões do TCU em 16/08/2026. Contas julgadas irregulares são decisão administrativa do TCU e não constituem condenação criminal.',
  $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/70662366","data":"2026-08-16","titulo":"TCU, Conecta: processo 006.099/2022-0 (Tomada de Contas Especial)"},{"url":"https://contas.tcu.gov.br/pesquisaJurisprudencia/#/resultado/acordao-completo/00609920220.PROC","data":"2026-08-16","titulo":"TCU, Pesquisa de Jurisprudência: Acórdão 1488/2025, Primeira Câmara"}]$j$::jsonb,
  'TCU julgou irregulares contas no Acórdão 1488/2025',
  'No Acórdão 1488/2025 da Primeira Câmara, o TCU julgou irregulares as contas de Elizeu Morais de Aguiar no processo 006.099/2022-0. Trata-se de decisão administrativa do TCU, não de condenação criminal.',
  $j$[{"url":"https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A1488%20ANOACORDAO%3A2025%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0","data":"2026-08-25","titulo":"TCU, Acórdão 1488/2025 da Primeira Câmara"}]$j$::jsonb
),
(
  '3c8cf652-37a7-499a-9b5e-cc095d413295',
  'Sanção administrativa ativa (CEIS)',
  'O CPF de José Roberto Arruda consta com dois registros ativos no Cadastro de Empresas Inidôneas e Suspensas (CEIS) do Portal da Transparência, ambos de impedimento e proibição de contratar com o poder público por prazo determinado, com fundamento na Lei 8.429/1992 (improbidade administrativa): processo (TJDFT, Sexta Turma Cível), vigência de 05/12/2018 a 05/12/2028, e processo 0013585-67.2011.8.07.0001 (TJDFT), vigência de 10/09/2021 a 10/09/2026. Consulta ao CEIS em 16/08/2026. Sanção administrativa não é condenação penal.',
  $j$[{"url":"https://portaldatransparencia.gov.br/sancoes/consulta?paginacaoSimples=true&tamanhoPagina=10&offset=0&direcaoOrdenacao=asc&nomeSancionado=jose%20roberto%20arruda&ordenarPor=nomeSancionado&direcao=asc","data":"2026-08-16","titulo":"Portal da Transparência, Consulta de Sanções (CEIS), busca por nome"}]$j$::jsonb,
  'Sanção administrativa ativa (CEIS)',
  'O CPF de José Roberto Arruda consta com dois registros ativos no Cadastro de Empresas Inidôneas e Suspensas (CEIS) do Portal da Transparência, ambos de impedimento e proibição de contratar com o poder público por prazo determinado, com fundamento na Lei 8.429/1992 (improbidade administrativa): processo (TJDFT, Sexta Turma Cível), vigência de 05/12/2018 a 05/12/2028, e processo 0013585-67.2011.8.07.0001 (TJDFT), vigência de 10/09/2021 a 10/09/2026. Consulta ao CEIS em 16/08/2026. Sanção administrativa não é condenação penal.',
  $j$[{"url":"https://portaldatransparencia.gov.br/sancoes/consulta/127127","data":"2026-08-25","titulo":"Portal da Transparência, registro CEIS 127127"},{"url":"https://portaldatransparencia.gov.br/sancoes/consulta/104199","data":"2026-08-25","titulo":"Portal da Transparência, registro CEIS 104199"}]$j$::jsonb
),
(
  '8e8db2cc-7163-45ed-af6a-0909812f22ac',
  'Carreira política',
  'Foi secretária estadual, deputada estadual por dois mandatos, prefeita de Caruaru por dois mandatos e é governadora de Pernambuco.',
  $j$[{"url":"https://cpiis.saude.pe.gov.br/governo/","data":"2026-08-15","titulo":"Governo - CPIIS"}]$j$::jsonb,
  'Carreira política',
  'Foi secretária estadual, deputada estadual por dois mandatos, prefeita de Caruaru por dois mandatos e é governadora de Pernambuco.',
  $j$[{"url":"https://www.tse.jus.br/comunicacao/noticias/2022/Outubro/raquel-lyra-psdb-vence-disputa-e-e-eleita-governadora-de-pernambuco","data":"2022-10-30","titulo":"TSE, Raquel Lyra eleita governadora de Pernambuco"}]$j$::jsonb
),
(
  'a48921e3-0988-4125-bb39-4ea2729a57a2',
  'Carreira política: 1 mandato(s) registrado(s)',
  'Soldado Sampaio (PL) possui 1 mandato(s) registrado(s): Deputado Estadual (RR).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Quarto mandato consecutivo como deputado estadual',
  'Francisco dos Santos Sampaio foi reeleito para o quarto mandato consecutivo como deputado estadual de Roraima, com 8.746 votos.',
  $j$[{"url":"https://al.rr.leg.br/categoria22/soldado-sampaio/","data":"2026-08-25","titulo":"Assembleia Legislativa de Roraima, perfil de Soldado Sampaio"}]$j$::jsonb
),
(
  '8885902e-c940-44ef-ba04-515e24aaa9fe',
  'Carreira política',
  'Foi vereadora de Porto Alegre, exerceu três mandatos como deputada estadual no Rio Grande do Sul e foi secretária municipal da Juventude.',
  $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001621265","titulo":"TSE DivulgaCandContas — candidatura de 2022"},{"url":"https://ww4.al.rs.gov.br","titulo":"Assembleia Legislativa do Rio Grande do Sul"}]$j$::jsonb,
  'Carreira política',
  'Foi vereadora de Porto Alegre, exerceu três mandatos como deputada estadual no Rio Grande do Sul e foi secretária municipal da Juventude.',
  $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001621265","titulo":"TSE DivulgaCandContas — candidatura de 2022"}]$j$::jsonb
),
(
  'a04dd437-74e9-45c8-95be-64ecc50e1cfc',
  'TSE manteve a negativa do registro de candidatura em 2022',
  'Em setembro de 2022, o TSE manteve a decisão do TRE-SE que negou o registro de candidatura de Valmir de Francisquinho ao governo de Sergipe. O indeferimento se baseou em decisão de 2019 que havia decretado sua inelegibilidade; este alerta descreve o pleito de 2022 e não presume a situação eleitoral atual.',
  $j$[{"url":"https://www.tre-se.jus.br/comunicacao/noticias/2022/Setembro/nota-de-esclarecimento-sobre-a-candidatura-de-valmir-de-francisquinho","data":"2022-09-29","titulo":"Nota de esclarecimento sobre a candidatura de Valmir de Francisquinho"},{"url":"https://noticias.stf.jus.br/postsnoticias/decisao-do-ministro-barroso-mantem-inelegibilidade-de-pre-candidato-ao-governo-de-sergipe/","data":"2022-08-23","titulo":"Decisão do ministro Barroso mantém inelegibilidade no contexto de 2022"}]$j$::jsonb,
  'TSE manteve a negativa do registro de candidatura em 2022',
  'Em setembro de 2022, o TSE manteve a decisão do TRE-SE que negou o registro de candidatura de Valmir de Francisquinho ao governo de Sergipe. O indeferimento se baseou em decisão de 2019 que havia decretado sua inelegibilidade; este alerta descreve o pleito de 2022 e não presume a situação eleitoral atual.',
  $j$[{"url":"https://www.tre-se.jus.br/comunicacao/noticias/2022/Setembro/nota-de-esclarecimento-sobre-a-candidatura-de-valmir-de-francisquinho","data":"2022-09-29","titulo":"TRE-SE, nota sobre a candidatura de Valmir de Francisquinho"}]$j$::jsonb
),
(
  '6452c61b-8632-44d4-be0f-c6e66f161681',
  'Laudo falso contra Boulos',
  'Publicou laudo médico falso sobre Guilherme Boulos durante campanha de SP 2024. Justiça Eleitoral determinou remoção e multou campanha.',
  $j$[{"url":"https://g1.globo.com","data":"2024-10-05","titulo":"TSE determina remocao de laudo falso"}]$j$::jsonb,
  'Participação na divulgação de laudo falso contra Boulos',
  'Em decisão de 2025, a Justiça Eleitoral de São Paulo afirmou que Rubinho Nunes atuou em conluio com Pablo Marçal na divulgação de laudo falso contra Guilherme Boulos durante a campanha municipal de 2024.',
  $j$[{"url":"https://www.tre-sp.jus.br/comunicacao/noticias/2025/Maio/juiz-eleitoral-cassa-diploma-do-vereador-rubinho-nunes","data":"2025-05-15","titulo":"TRE-SP, decisão sobre a divulgação de laudo falso"}]$j$::jsonb
),
(
  'f0922bdd-44f8-496d-8aa5-b6c899f72f99',
  'Condenação por furto qualificado',
  'Condenado em 2010 por integração em quadrilha de furto qualificado (estelionato digital). Pena cumprida.',
  $j$[{"url":"https://www.conjur.com.br","data":"2010-01-01","titulo":"Justica condena Marcal"}]$j$::jsonb,
  'Condenação por furto qualificado, com punibilidade extinta por prescrição',
  'A Terceira Turma do TRF1 considerou comprovadas a materialidade e a autoria do crime de furto qualificado atribuído a Pablo Henrique Costa Marçal e declarou extinta a punibilidade pela prescrição retroativa.',
  $j$[{"url":"https://revista.trf1.jus.br/trf1/issue/download/22/3","data":"2026-08-25","titulo":"TRF1, acórdão sobre furto qualificado e prescrição"}]$j$::jsonb
);

DO $guard$
DECLARE
  existing_count integer;
  matched integer;
BEGIN
  SELECT count(*) INTO existing_count
  FROM _pf_issue_96_updates u
  JOIN public.pontos_atencao p ON p.id = u.id;

  SELECT count(*) INTO matched
  FROM _pf_issue_96_updates u
  JOIN public.pontos_atencao p ON p.id = u.id
  WHERE (
      p.visivel = true
      AND p.titulo = u.titulo_antes
      AND p.descricao = u.descricao_antes
      AND p.fontes = u.fontes_antes
    ) OR (
      p.visivel = true
      AND p.titulo = u.titulo_depois
      AND p.descricao = u.descricao_depois
      AND p.fontes = u.fontes_depois
      AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25'
    );

  IF existing_count <> 0 AND (existing_count <> 10 OR matched <> 10) THEN
    RAISE EXCEPTION 'issue #96: estado parcial ou divergente nas correcoes (existentes=%, correspondentes=%)', existing_count, matched;
  END IF;
END
$guard$;

-- @write tabela=pontos_atencao ref=issue_96 campos=titulo,descricao,fontes,dados_relacionados
UPDATE public.pontos_atencao p
SET titulo = u.titulo_depois,
    descricao = u.descricao_depois,
    fontes = u.fontes_depois,
    dados_relacionados = coalesce(p.dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'issue_96_link_check_2026_08_25',
      jsonb_build_object(
        'acao', 'fonte corrigida',
        'issue', 96,
        'ref', 'issue_96',
        'reversivel', true,
        'titulo_anterior', p.titulo,
        'descricao_anterior', p.descricao,
        'fontes_anteriores', p.fontes
      )
    )
FROM _pf_issue_96_updates u
WHERE p.id = u.id
  AND p.visivel = true
  AND p.titulo = u.titulo_antes
  AND p.descricao = u.descricao_antes
  AND p.fontes = u.fontes_antes;

CREATE TEMP TABLE _pf_issue_96_hide (
  id uuid PRIMARY KEY,
  titulo_antes text NOT NULL,
  descricao_antes text NOT NULL,
  fontes_antes jsonb NOT NULL,
  motivo text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_issue_96_hide (id, titulo_antes, descricao_antes, fontes_antes, motivo) VALUES
(
  '6c9a396b-49be-47bf-974f-8569d4d22986',
  'Trajetória eleitoral sem mandato eletivo',
  'Trajetória eleitoral sem mandato eletivo no recorte auditado.',
  $j$[{"url":"https://www.tse.jus.br","data":"2026-08-15","titulo":"Tribunal Superior Eleitoral"}]$j$::jsonb,
  'Ausência de mandato é um dado neutro de trajetória e não deve ser publicada como alerta editorial.'
),
(
  '3ab64a77-24bd-4662-820f-eebc031b6467',
  'Trajetória eleitoral sem mandato eletivo',
  'Trajetória eleitoral sem mandato eletivo no recorte auditado.',
  $j$[{"url":"https://www.tse.jus.br","data":"2026-08-15","titulo":"Tribunal Superior Eleitoral"}]$j$::jsonb,
  'Ausência de mandato é um dado neutro de trajetória e não deve ser publicada como alerta editorial.'
),
(
  '472db74b-8ed9-484a-95d1-2ea5949a6f80',
  'Trajetória eleitoral sem mandato eletivo',
  'Trajetória eleitoral sem mandato eletivo no recorte auditado.',
  $j$[{"url":"https://www.tse.jus.br","data":"2026-08-15","titulo":"Tribunal Superior Eleitoral"}]$j$::jsonb,
  'Ausência de mandato é um dado neutro de trajetória e não deve ser publicada como alerta editorial.'
),
(
  '67f26e0e-7b2b-40a3-a0c0-b5c9509ae643',
  'Patrimônio declarado de R$ 282 milhões incompativel com histórico',
  'Declarou R$ 282 milhões em bens ao TSE em 2022. Origem patrimonial questionada: empresa de cursos online e coaching sem demonstrações financeiras publicas proporcionais ao patrimônio.',
  $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/2040602022/BR/280001637067","data":"2022-08-15","titulo":"Patrimonio de Marcal no TSE"}]$j$::jsonb,
  'O valor publicado está desatualizado e a fonte atual é uma aplicação genérica que não sustenta a alegação editorial.'
),
(
  'e572f945-3e8d-4257-9309-c8d799ccc2c0',
  'Envolvimento com piramide financeira (ABJ Marketing)',
  'Investigado por envolvimento com a empresa ABJ Marketing, acusada de operar como piramide financeira. Marcal nega envolvimento direto.',
  $j$[{"url":"https://www1.folha.uol.com.br/poder/2024/08/marcal-piramide-financeira.shtml","data":"2024-08-20","titulo":"Marcal e piramide financeira"}]$j$::jsonb,
  'A única fonte está morta e a alegação não foi confirmada por outra fonte confiável.'
);

DO $guard$
DECLARE
  existing_count integer;
  matched integer;
BEGIN
  SELECT count(*) INTO existing_count
  FROM _pf_issue_96_hide h
  JOIN public.pontos_atencao p ON p.id = h.id;

  SELECT count(*) INTO matched
  FROM _pf_issue_96_hide h
  JOIN public.pontos_atencao p ON p.id = h.id
  WHERE (
      p.visivel = true
      AND p.titulo = h.titulo_antes
      AND p.descricao = h.descricao_antes
      AND p.fontes = h.fontes_antes
    ) OR (
      p.visivel = false
      AND p.titulo = h.titulo_antes
      AND p.descricao = h.descricao_antes
      AND p.fontes = h.fontes_antes
      AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25'
    );

  IF existing_count <> 0 AND (existing_count <> 5 OR matched <> 5) THEN
    RAISE EXCEPTION 'issue #96: estado parcial ou divergente nas despublicacoes (existentes=%, correspondentes=%)', existing_count, matched;
  END IF;
END
$guard$;

-- @write tabela=pontos_atencao ref=issue_96 campos=visivel,despublicacao_motivo,despublicado_em,dados_relacionados
UPDATE public.pontos_atencao p
SET visivel = false,
    despublicacao_motivo = h.motivo,
    despublicado_em = coalesce(p.despublicado_em, now()),
    dados_relacionados = coalesce(p.dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'issue_96_link_check_2026_08_25',
      jsonb_build_object(
        'acao', 'despublicado',
        'issue', 96,
        'ref', 'issue_96',
        'reversivel', true,
        'titulo_anterior', p.titulo,
        'descricao_anterior', p.descricao,
        'fontes_anteriores', p.fontes,
        'visivel_anterior', p.visivel
      )
    )
FROM _pf_issue_96_hide h
WHERE p.id = h.id
  AND p.visivel = true
  AND p.titulo = h.titulo_antes
  AND p.descricao = h.descricao_antes
  AND p.fontes = h.fontes_antes;

DO $postcondition$
DECLARE
  updated_count integer;
  hidden_count integer;
BEGIN
  SELECT count(*) INTO updated_count
  FROM _pf_issue_96_updates u
  JOIN public.pontos_atencao p ON p.id = u.id
  WHERE p.visivel = true
    AND p.titulo = u.titulo_depois
    AND p.descricao = u.descricao_depois
    AND p.fontes = u.fontes_depois
    AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25';

  SELECT count(*) INTO hidden_count
  FROM _pf_issue_96_hide h
  JOIN public.pontos_atencao p ON p.id = h.id
  WHERE p.visivel = false
    AND p.titulo = h.titulo_antes
    AND p.descricao = h.descricao_antes
    AND p.fontes = h.fontes_antes
    AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25';

  IF NOT (
    (updated_count = 0 AND hidden_count = 0)
    OR (updated_count = 10 AND hidden_count = 5)
  ) THEN
    RAISE EXCEPTION 'issue #96: pos-condicao falhou (corrigidas=%, despublicadas=%)', updated_count, hidden_count;
  END IF;
END
$postcondition$;

COMMIT;
