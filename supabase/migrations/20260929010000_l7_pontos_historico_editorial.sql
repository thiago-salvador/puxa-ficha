-- L7, decisão editorial de 29/09/2026. Oito pontos antes ocultos e uma
-- candidatura histórica despublicada. Cada linha tem preimagem integral
-- medida em produção em 28/09/2026; divergência aborta a transação inteira.
--
-- dr-fernando-maximo (6382cd2d): TSE 2022 confirma eleição; Câmara Dados
-- Abertos confirma exercício desde 2023 e partido atual. A página do Governo
-- de Rondônia sobre sua passagem pela Saúde retornou conteúdo indisponível na
-- sonda automatizada, mas é um caminho específico do portal oficial.
-- teresa-surita (c059feb7): histórico e mandatos externos da Câmara; registros
-- de eleição para a Prefeitura no TSE em 2004, 2012 e 2016. O endpoint de
-- mandatos externos é curto para o link-check, mas devolve os períodos citados.
-- enilton-rodrigues (c42f394c): cinco candidaturas anteriores nos registros
-- individuais do TSE 2016, 2018, 2020, 2022 e 2024, sem eleição nelas.
-- marcelo-brigadeiro (c75c15d0): TSE 2018 registra a suplência não eleita;
-- TSE 2026 ancora a ficha atual. O texto limita a negativa a esse histórico.
-- guilherme-derrite (6b344c5b): Câmara, Agência Brasil e CNN sobre a gestão
-- e os dados do MP; Metrópoles sobre os 28 mortos na Operação Escudo.
-- guilherme-derrite (264c8585): reportagem do Metrópoles com custo estimado,
-- declaração patrimonial, contraponto da SSP e atribuições preservadas.
-- lula (de6d8db1): resumo institucional da AP 470 no STF e duas páginas da
-- Câmara. O PDF do STF ficou indisponível à sonda; a Câmara mantém páginas
-- humanas específicas sobre denúncia e 25 condenados.
-- ciro-gomes-gov-ce (88373c8d): Estado de Minas, InfoMoney e Poder360 sobre
-- episódio de 2018; resposta da campanha em sua página específica.
-- histórico 95897450: candidatura a vereador em Osasco em 2012, não eleita,
-- recibo TSE consulta_cand_2012, SQ 250000098971; a proveniência da linha
-- permanece 'tse' e o recibo documental fica no coleta_log.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.historico_politico IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.coleta_log IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_l7_pontos (
  id uuid PRIMARY KEY, slug text NOT NULL, preimage_md5 text NOT NULL,
  titulo text NOT NULL, descricao text NOT NULL, categoria text NOT NULL,
  gravidade text NOT NULL, fontes jsonb NOT NULL, data_referencia date
) ON COMMIT DROP;

INSERT INTO _pf_l7_pontos VALUES
('6382cd2d-a9a8-4616-893a-08396f1ea70d','dr-fernando-maximo','479193b455c054b28514562e0f87d365',
 'Carreira política',
 'Fernando Máximo (PL) foi eleito deputado federal por Rondônia em 2022, pelo União Brasil, e está em exercício na Câmara desde fevereiro de 2023. Antes, foi secretário de Estado da Saúde de Rondônia, cargo de nomeação.',
 'feito_positivo','baixa',
 $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RO/2040602022/candidato/220001600708","titulo":"TSE DivulgaCandContas: eleição de Fernando Máximo em 2022"},{"url":"https://dadosabertos.camara.leg.br/api/v2/deputados/220610","titulo":"Câmara Dados Abertos: deputado Fernando Máximo em exercício"},{"url":"https://rondonia.ro.gov.br/projeto-opera-rondonia-do-governo-de-rondonia-ja-realizou-10-855-cirurgias-eletivas/","titulo":"Governo de Rondônia: Fernando Máximo na Secretaria da Saúde"}]$j$::jsonb,NULL),
('c059feb7-19e2-4a87-b65e-da9f0519cf97','teresa-surita','28b734310523380319079ffae49fa7b3',
 'Carreira política',
 'Teresa Surita (MDB) foi deputada federal por Roraima na legislatura 1991-1995 e na legislatura iniciada em 2011, da qual renunciou em janeiro de 2013. Segundo o TSE, foi eleita prefeita de Boa Vista em 2004, 2012 e 2016. A Câmara registra ainda mandatos de prefeita em 1993-1996 e 2001-2004.',
 'feito_positivo','baixa',
 $j$[{"url":"https://dadosabertos.camara.leg.br/api/v2/deputados/160608/historico","titulo":"Câmara Dados Abertos: histórico de Teresa Surita"},{"url":"https://dadosabertos.camara.leg.br/api/v2/deputados/160608/mandatosExternos","titulo":"Câmara Dados Abertos: mandatos externos de Teresa Surita"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2004/03018/14431/candidato/140","titulo":"TSE DivulgaCandContas: Teresa Surita em 2004"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2012/03018/1699/candidato/230000000097","titulo":"TSE DivulgaCandContas: Teresa Surita em 2012"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2016/03018/2/candidato/230000001881","titulo":"TSE DivulgaCandContas: Teresa Surita em 2016"}]$j$::jsonb,NULL),
('c42f394c-49ea-4e93-b21d-dbf0186512f1','enilton-rodrigues','38209cce562b55e448b546031bfe5e86',
 'Sem histórico de mandato eletivo registrado',
 'Enilton Rodrigues (PSOL) disputou cinco eleições antes de 2026, segundo o TSE, e não foi eleito em nenhuma: vereador em Arame, deputado estadual e governador do Maranhão.',
 'perfil','baixa',
 $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2016/09679/2/candidato/100000015557","titulo":"TSE DivulgaCandContas: Enilton Rodrigues em 2016"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/MA/2022802018/candidato/100000618779","titulo":"TSE DivulgaCandContas: Enilton Rodrigues em 2018"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/09679/2030402020/candidato/100000996020","titulo":"TSE DivulgaCandContas: Enilton Rodrigues em 2020"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/MA/2040602022/candidato/100001713289","titulo":"TSE DivulgaCandContas: Enilton Rodrigues em 2022"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/09679/2045202024/candidato/100002106225","titulo":"TSE DivulgaCandContas: Enilton Rodrigues em 2024"}]$j$::jsonb,NULL),
('c75c15d0-9ed6-4504-babd-9c6d5453575e','marcelo-brigadeiro','aa8d3c8a5688c97c3aa2b211d639c1e8',
 'Sem histórico de mandato eletivo registrado',
 'No histórico de candidaturas do TSE, a única disputa anterior de Marcelo Brigadeiro (Missão) é a de 1º suplente na chapa ao Senado por Santa Catarina em 2018, pelo PSL, que não foi eleita. Não há mandato eletivo registrado.',
 'perfil','baixa',
 $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/SC/2022802018/candidato/240000609728","titulo":"TSE DivulgaCandContas: Marcelo Brigadeiro, suplente em 2018"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/SC/20322002026/candidato/240002544118","titulo":"TSE DivulgaCandContas: Marcelo Brigadeiro em 2026"}]$j$::jsonb,NULL),
('6b344c5b-1568-4c37-b76b-b036bc0d7cb7','guilherme-derrite','4343c92e6e2afa5097f55b2092e96e48',
 'Alta da letalidade policial na gestão como secretário',
 'Guilherme Derrite deixou o mandato de deputado federal para ser secretário de Estado da Segurança Pública de São Paulo a partir de 1º de janeiro de 2023. Segundo dados do Ministério Público, as mortes cometidas por policiais militares no estado passaram de 396 em 2022 para 760 em 2024, alta de 91%. Em 2020 haviam sido 796. A Operação Escudo, no litoral de SP, foi encerrada após 40 dias com 28 mortos.',
 'alerta','alta',
 $j$[{"url":"https://www.camara.leg.br/deputados/204531/biografia","titulo":"Câmara dos Deputados: biografia de Guilherme Derrite"},{"url":"https://www.cnnbrasil.com.br/nacional/sudeste/sp/sao-paulo-registra-760-mortes-por-policiais-militares-em-2024-aponta-mp/","titulo":"CNN Brasil: MP registra 760 mortes por policiais militares em 2024","data":"2025-01-11"},{"url":"https://agenciabrasil.ebc.com.br/direitos-humanos/noticia/2025-01/letalidade-da-policia-militar-paulista-aumentou-em-2024","titulo":"Agência Brasil: letalidade da PM paulista aumentou em 2024","data":"2025-01-15"},{"url":"https://www.metropoles.com/sao-paulo/apos-40-dias-tarcisio-encerra-operacao-que-matou-28-no-litoral-de-sp","titulo":"Metrópoles: Operação Escudo encerrada após 40 dias e 28 mortos","data":"2023-09-05"}]$j$::jsonb,'2025-01-15'),
('264c8585-9ba0-4cc9-81c1-83551cdcd04d','guilherme-derrite','3d96ab48e95e67379f132c14ad55014e',
 'Casa em construção estimada em R$ 3 mi, segundo o Metrópoles',
 'Reportagem do Metrópoles informou que Derrite constrói uma residência de 440 m². Segundo uma fonte ligada à obra ouvida pelo jornal, o projeto e a construção devem custar ao menos R$ 3 milhões, mais que o triplo dos R$ 812 mil em bens que ele declarou ao TSE em 2022. Em 2026 ele declarou R$ 2,02 milhões. Em nota, a SSP afirmou que as aquisições patrimoniais dele e da família são compatíveis com a renda declarada.',
 'alerta','media',
 $j$[{"url":"https://www.metropoles.com/sao-paulo/derrite-casa-de-luxo-3-vezes-bens","titulo":"Metrópoles: reportagem sobre residência e patrimônio declarado de Derrite","data":"2025-07-01"}]$j$::jsonb,'2025-07-01'),
('de6d8db1-d13a-4ce2-bbbe-b9736aa90b17','lula','e15aed6b4130fa6c3e4b6edc3e66d764',
 'Mensalão (Ação Penal 470 no STF)',
 'Segundo o resumo do STF, a Ação Penal 470 (mensalão) tratou de pagamentos mensais a parlamentares de diversos partidos em troca de votos favoráveis a projetos do governo na Câmara dos Deputados. A denúncia do Ministério Público não fez referência a Lula; segundo o procurador-geral, não havia indícios que a justificassem. O STF fixou penas para 25 réus condenados.',
 'alerta','media',
 $j$[{"url":"https://www.stf.jus.br/arquivo/cms/publicacaoBOInternet/anexo/link_download/casos_relevantes/pt/AP_470.pdf","titulo":"STF: resumo institucional da Ação Penal 470","data":"2012-12-17"},{"url":"https://www.camara.leg.br/noticias/83476-ministerio-publico-denuncia-40-envolvidos-com-mensalao/","titulo":"Câmara dos Deputados: denúncia do Ministério Público"},{"url":"https://www.camara.leg.br/tv/camara-hoje/390591-stf-fixa-pena-dos-25-reus-no-processo-do-mensalao/","titulo":"Câmara dos Deputados: penas dos 25 réus condenados"}]$j$::jsonb,'2012-12-17'),
('88373c8d-43c9-400d-a896-5f11e3fd3ed7','ciro-gomes-gov-ce','0abf7874520880c03780168c236f9eff',
 'Acusado de agressão a jornalista durante campanha',
 'Em setembro de 2018, durante agenda de campanha à Presidência em Boa Vista (RR), Ciro Gomes foi filmado empurrando e xingando um repórter, segundo o Estado de Minas e o InfoMoney. O jornalista Luiz Petri disse ao Poder360 que registraria boletim de ocorrência contra o candidato. A campanha de Ciro respondeu à acusação em sua página "Anti Fake News". Não localizamos registro do boletim nem de processo.',
 'alerta','media',
 $j$[{"url":"https://www.em.com.br/app/noticia/politica/2018/09/16/interna_politica,989222/ciro-gomes-empurra-xinga-e-manda-prender-reporter-em-boa-vista.shtml","titulo":"Estado de Minas: episódio com repórter em Boa Vista","data":"2018-09-16"},{"url":"https://www.infomoney.com.br/politica/ciro-da-empurrao-e-xinga-jornalista-durante-ato-de-campanha-em-roraima-video-viraliza-nas-redes-sociais/","titulo":"InfoMoney: vídeo do episódio em Roraima","data":"2018-09-17"},{"url":"https://www.poder360.com.br/eleicoes/jornalista-xingado-por-ciro-gomes-pretende-registrar-ocorrencia/","titulo":"Poder360: declaração do jornalista sobre ocorrência","data":"2018-09-16"},{"url":"https://todoscomciro.com/anti-fake-news/roraima-ciro-gomes-agrediu-reporter/","titulo":"Campanha de Ciro: resposta à acusação"}]$j$::jsonb,'2018-09-16');

DO $apply$
DECLARE n integer; v timestamptz := timestamptz '2026-09-29T01:00:00Z';
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'l7-editorial: apenas replay descartável; sem escrita';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM _pf_l7_pontos) <> 8
     OR (SELECT count(*) FROM public.pontos_atencao p JOIN _pf_l7_pontos u ON u.id=p.id
         JOIN public.candidatos c ON c.id=p.candidato_id AND c.slug=u.slug
         WHERE md5(to_jsonb(p)::text)=u.preimage_md5) <> 8
     OR (SELECT count(*) FROM public.historico_politico h JOIN public.candidatos c
         ON c.id=h.candidato_id AND c.slug='tse-2026-250002541362'
         WHERE h.id='95897450-57c5-466c-a6cb-7eeff98b0631'
           AND md5(to_jsonb(h)::text)='c12cf3d432fcdd508e1c463fd3f6cc1d') <> 1
  THEN RAISE EXCEPTION 'l7-editorial: preimagem ou identidade divergiu'; END IF;

  IF EXISTS (SELECT 1 FROM _pf_l7_pontos u WHERE jsonb_typeof(u.fontes) <> 'array'
     OR jsonb_array_length(u.fontes)=0
     OR NOT public.ponto_atencao_fonte_conforme(u.gravidade,u.fontes)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(u.fontes) f
                WHERE NOT public.fonte_url_aponta_para_documento(f->>'url')
                   OR f->>'url' ~* '^https?://(www\.)?puxaficha\.com\.br/'))
  THEN RAISE EXCEPTION 'l7-editorial: fonte fora do contrato'; END IF;
  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
             WHERE migration_version='l7-editorial-20260929')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='migration:20260929010000')
  THEN RAISE EXCEPTION 'l7-editorial: snapshot ou recibo preexistente'; END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=l7-editorial-20260929 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'l7-editorial-20260929','pontos_atencao',p.id,p.candidato_id,to_jsonb(p),
         to_jsonb(p) || jsonb_build_object('titulo',u.titulo,'descricao',u.descricao,
           'categoria',u.categoria,'gravidade',u.gravidade,'fontes',u.fontes,
           'verificado',true,'gerado_por','curadoria','visivel',true,
           'despublicacao_motivo',NULL,'despublicado_em',NULL,
           'data_referencia',u.data_referencia),v
  FROM public.pontos_atencao p JOIN _pf_l7_pontos u ON u.id=p.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'l7-editorial: snapshots de pontos %',n; END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=l7-editorial-20260929 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'l7-editorial-20260929','historico_politico',h.id,h.candidato_id,to_jsonb(h),
         to_jsonb(h) || jsonb_build_object('despublicacao_motivo',NULL,
           'despublicado_em',NULL,'proveniencia','tse'),v
  FROM public.historico_politico h WHERE h.id='95897450-57c5-466c-a6cb-7eeff98b0631';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l7-editorial: snapshot de histórico %',n; END IF;

  -- @write tabela=pontos_atencao ref=l7-editorial-20260929 campos=titulo,descricao,categoria,gravidade,fontes,verificado,gerado_por,visivel,despublicacao_motivo,despublicado_em,data_referencia
  UPDATE public.pontos_atencao p SET
    titulo=u.titulo, descricao=u.descricao, categoria=u.categoria,
    gravidade=u.gravidade, fontes=u.fontes, verificado=true,
    gerado_por='curadoria', visivel=true, despublicacao_motivo=NULL,
    despublicado_em=NULL, data_referencia=u.data_referencia
  FROM _pf_l7_pontos u JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.row_id=u.id AND s.migration_version='l7-editorial-20260929'
   AND s.tabela='pontos_atencao'
  WHERE p.id=u.id AND to_jsonb(p)=s.preimage;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'l7-editorial: pontos atualizados %',n; END IF;

  -- @write tabela=historico_politico ref=l7-editorial-20260929 campos=despublicacao_motivo,despublicado_em,proveniencia
  UPDATE public.historico_politico h SET despublicacao_motivo=NULL,
    despublicado_em=NULL, proveniencia='tse'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE h.id='95897450-57c5-466c-a6cb-7eeff98b0631'
    AND s.migration_version='l7-editorial-20260929'
    AND s.tabela='historico_politico' AND s.row_id=h.id
    AND to_jsonb(h)=s.preimage;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l7-editorial: histórico atualizado %',n; END IF;

  IF (SELECT count(*) FROM public.pontos_atencao p JOIN _pf_l7_pontos u ON u.id=p.id
      JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=p.id
       AND s.migration_version='l7-editorial-20260929' AND s.tabela='pontos_atencao'
      WHERE to_jsonb(p)=s.postimage AND p.visivel AND p.verificado
        AND p.gerado_por='curadoria' AND public.ponto_atencao_fonte_conforme(p.gravidade,p.fontes)) <> 8
     OR (SELECT count(*) FROM public.historico_politico h
       JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=h.id
        AND s.migration_version='l7-editorial-20260929' AND s.tabela='historico_politico'
       WHERE h.id='95897450-57c5-466c-a6cb-7eeff98b0631'
         AND to_jsonb(h)=s.postimage AND h.despublicado_em IS NULL
         AND h.despublicacao_motivo IS NULL AND h.proveniencia='tse') <> 1
  THEN RAISE EXCEPTION 'l7-editorial: pós-condição falhou'; END IF;

  -- @write tabela=coleta_log ref=migration:20260929010000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'curadoria-l7-editorial','global','pontos_atencao,historico_politico',
    'encontrado',9,
    jsonb_build_object('resumo','Oito pontos publicados e uma candidatura histórica republicada após decisão editorial L7.',
      'recibo_historico',jsonb_build_object('fonte','TSE consulta_cand_2012',
        'url','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2012.zip',
        'sq_candidato','250000098971','municipio','OSASCO','cargo','VEREADOR',
        'partido','PSTU','situacao','NÃO ELEITO'),
      'linhas',(SELECT jsonb_agg(jsonb_build_object('tabela',s.tabela,'id',s.row_id,
        'before',s.preimage,'after',CASE s.tabela
          WHEN 'pontos_atencao' THEN (SELECT to_jsonb(p) FROM public.pontos_atencao p WHERE p.id=s.row_id)
          ELSE (SELECT to_jsonb(h) FROM public.historico_politico h WHERE h.id=s.row_id) END)
        ORDER BY s.tabela,s.row_id)
        FROM public.identidade_timeline_quarentena_snapshot s
        WHERE s.migration_version='l7-editorial-20260929'))::text,
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2012.zip',
    'migration:20260929010000','escrita';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l7-editorial: recibo %',n; END IF;
END
$apply$;
COMMIT;
