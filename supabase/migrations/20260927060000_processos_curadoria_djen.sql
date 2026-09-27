-- 20260927060000_processos_curadoria_djen.sql
-- APROVADO EDITORIALMENTE, NAO APLICADO. Lote judicial curadoria-djen-20260927.
-- As contagens explicitas passadas ao gerador precisam coincidir com este lote.
-- Sem BEGIN/COMMIT proprio: o aplicador envolve migration e ledger na mesma transacao.

CREATE TEMP TABLE _pf_processos_curadoria (
  slug text NOT NULL,
  tipo text NOT NULL,
  tribunal text NOT NULL,
  numero_cnj text NOT NULL,
  descricao text NOT NULL,
  status text NOT NULL,
  fonte text NOT NULL,
  url_fonte text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_processos_curadoria
  (slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
    ('danilo-soares', 'civil', 'TJCE', '3002640-90.2025.8.06.0070', 'O DJEN registra comunicação processual oficial no processo 3002640-90.2025.8.06.0070, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CíVEL, perante Juizado Especial Cível e Criminal da Comarca de Crateús (TJCE). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-08-13 e 2026-06-16. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 3002640-90.2025.8.06.0070', 'https://comunica.pje.jus.br/consulta?numeroProcesso=30026409020258060070'),
    ('tse-2026-30002549911', 'civil', 'TRT10', '0001495-35.2024.5.10.0002', 'O DJEN registra comunicação processual oficial no processo 0001495-35.2024.5.10.0002, nas classes AçãO TRABALHISTA - RITO ORDINáRIO, perante 2ª Vara do Trabalho de Brasília - DF (TRT10). O candidato consta nos polos passivo. As comunicações Intimação e Lista de distribuição foram disponibilizadas entre 2024-12-23 e 2025-06-02. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0001495-35.2024.5.10.0002', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00014953520245100002'),
    ('tse-2026-220002551946', 'criminal', 'SEEU', '4001116-33.2023.8.22.0501', 'O DJEN registra comunicação processual oficial no processo 4001116-33.2023.8.22.0501, nas classes Execução de Medidas Alternativas, perante VEPEMA - Vara de Exec. de Penas e Medidas Alternativas de Porto Velho (Meio Aberto) (SEEU). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2023-06-16 e 2023-06-19. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 4001116-33.2023.8.22.0501', 'https://comunica.pje.jus.br/consulta?numeroProcesso=40011163320238220501'),
    ('tse-2026-200002534447', 'civil', 'TJPE', '0103739-49.2023.8.17.2001', 'O DJEN registra comunicação processual oficial no processo 0103739-49.2023.8.17.2001, nas classes PROCEDIMENTO COMUM CíVEL; Procedimento do Juizado Especial da Fazenda Pública, perante 3ª Vara da Fazenda Pública da Capital; 3º Juizado Especial da Fazenda Pública da Capital - Turno Manhã - 07:00h às 13:00h (TJPE). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-04-03 e 2026-05-22. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0103739-49.2023.8.17.2001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=01037394920238172001'),
    ('tse-2026-90002545243', 'criminal', 'TJGO', '5430476-17.2022.8.09.0051', 'O DJEN registra comunicação processual oficial no processo 5430476-17.2022.8.09.0051, nas classes AçãO PENAL - PROCEDIMENTO ORDINáRIO, perante 4ª Câmara Criminal; Goiânia - 1ª UPJ Varas de Crimes Punidos com Reclusão e Detenção: 1ª, 3ª, 6ª e 7ª (TJGO). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-04-11 e 2026-05-28. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 5430476-17.2022.8.09.0051', 'https://comunica.pje.jus.br/consulta?numeroProcesso=54304761720228090051'),
    ('tse-2026-90002540998', 'improbidade', 'TJGO', '0036819-20.2013.8.09.0206', 'O DJEN registra comunicação processual oficial no processo 0036819-20.2013.8.09.0206, nas classes AçãO CIVIL DE IMPROBIDADE ADMINISTRATIVA, perante Goiânia - Núcleo de Justiça 4.0 - Finalizar Fazendas Públicas (TJGO). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-07-28 e 2026-09-08. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0036819-20.2013.8.09.0206', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00368192020138090206'),
    ('tse-2026-130002552299', 'civil', 'TJMG', '5004222-90.2024.8.13.0439', 'O DJEN registra comunicação processual oficial no processo 5004222-90.2024.8.13.0439, nas classes CUMPRIMENTO DE SENTENçA; PROCEDIMENTO DO JUIZADO ESPECIAL CíVEL, perante Unidade Jurisdicional da Comarca de Muriaé (TJMG). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-02-12 e 2026-06-25. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 5004222-90.2024.8.13.0439', 'https://comunica.pje.jus.br/consulta?numeroProcesso=50042229020248130439'),
    ('tse-2026-220002547310', 'civil', 'STJ / TJRO', '7071212-04.2022.8.22.0001', 'O DJEN registra comunicação processual oficial no processo 7071212-04.2022.8.22.0001, nas classes AGRAVO EM RECURSO ESPECIAL; APELAçãO CíVEL; CUMPRIMENTO DE SENTENçA; PROCEDIMENTO COMUM CíVEL, perante Gabinete Des. Sansão Saldanha; Porto Velho - 2ª Vara Cível; SECRETARIA JUDICIÁRIA; SPF COORDENADORIA DE PROCESSAMENTO DE FEITOS DE DIREITO PRIVADO (STJ / TJRO). A candidata consta nos polos ativo e passivo. As comunicações Intimação foram disponibilizadas entre 2023-05-29 e 2025-08-08. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 7071212-04.2022.8.22.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=70712120420228220001'),
    ('tse-2026-150002548971', 'civil', 'TRF5', '0810272-52.2018.4.05.8200', 'O DJEN registra comunicação processual oficial no processo 0810272-52.2018.4.05.8200, nas classes CUMPRIMENTO DE SENTENçA, perante 10ª Vara Federal PB (TRF5). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-12-05 e 2025-12-05. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0810272-52.2018.4.05.8200', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08102725220184058200'),
    ('tse-2026-260002547285', 'civil', 'TJSE', '0032760-70.2016.8.25.0001', 'O DJEN registra comunicação processual oficial no processo 0032760-70.2016.8.25.0001, nas classes CUMPRIMENTO DE SENTENçA, perante 1ª Vara Cível de Aracaju (TJSE). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2021-03-24 e 2026-09-01. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0032760-70.2016.8.25.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00327607020168250001'),
    ('tse-2026-100002553336', 'civil', 'TRT8', '0000344-04.2023.5.08.0106', 'O DJEN registra comunicação processual oficial no processo 0000344-04.2023.5.08.0106, nas classes AçãO TRABALHISTA - RITO ORDINáRIO, perante VARA DO TRABALHO DE CASTANHAL (TRT8). O candidato consta nos polos ativo e passivo. As comunicações Intimação foram disponibilizadas entre 2024-05-22 e 2026-07-23. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0000344-04.2023.5.08.0106', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00003440420235080106'),
    ('tse-2026-130002551930', 'civil', 'TJMG', '5022273-61.2024.8.13.0145', 'O DJEN registra comunicação processual oficial no processo 5022273-61.2024.8.13.0145, nas classes CUMPRIMENTO DE SENTENçA CONTRA A FAZENDA PúBLICA, perante 2ª Vara da Fazenda Pública e Autarquias Municipais da Comarca de Juiz de Fora (TJMG). A candidata consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-02-03 e 2025-12-03. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 5022273-61.2024.8.13.0145', 'https://comunica.pje.jus.br/consulta?numeroProcesso=50222736120248130145'),
    ('tse-2026-140002542691', 'civil', 'TJDFT', '0707805-57.2025.8.07.0020', 'O DJEN registra comunicação processual oficial no processo 0707805-57.2025.8.07.0020, nas classes PROCEDIMENTO COMUM CíVEL, perante 3ª Vara Cível de Águas Claras (TJDFT). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-04-24 e 2025-10-31. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0707805-57.2025.8.07.0020', 'https://comunica.pje.jus.br/consulta?numeroProcesso=07078055720258070020'),
    ('expedito-netto', 'civil', 'TJRO', '7054945-54.2022.8.22.0001', 'O DJEN registra comunicação processual oficial no processo 7054945-54.2022.8.22.0001, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CíVEL, perante Porto Velho - 2º Juizado Especial Cível (TJRO). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2023-04-12 e 2023-08-17. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 7054945-54.2022.8.22.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=70549455420228220001');

DO $$
DECLARE
  n integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'processos curadoria: checagens ignoradas apenas no replay descartavel';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'processos curadoria: coorte ausente; checagens ignoradas';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria;
  IF n <> 14 THEN
    RAISE EXCEPTION 'processos curadoria: esperados 14 CNJs no lote, encontrados %', n;
  END IF;

  SELECT count(DISTINCT slug) INTO n FROM _pf_processos_curadoria;
  IF n <> 14 THEN
    RAISE EXCEPTION 'processos curadoria: esperadas 14 fichas no lote, encontradas %', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria
  WHERE url_fonte LIKE 'https://comunica.pje.jus.br/consulta?%'
    AND url_fonte <>
    'https://comunica.pje.jus.br/consulta?numeroProcesso=' ||
    regexp_replace(numero_cnj, '[^0-9]', '', 'g');
  IF n <> 0 THEN
    RAISE EXCEPTION 'processos curadoria: % URLs nao provam o proprio CNJ', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria l
  LEFT JOIN public.candidatos c ON c.slug = l.slug
  WHERE c.id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'processos curadoria: % slugs nao resolvidos em candidatos', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria l
  JOIN public.processos p
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') =
       regexp_replace(l.numero_cnj, '[^0-9]', '', 'g');
  IF n <> 0 THEN
    RAISE EXCEPTION 'processos curadoria: % CNJs ja existem; recusar duplicacao ou lote parcial', n;
  END IF;
END $$;

-- @write tabela=processos slug=danilo-soares campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'danilo-soares'
  AND l.numero_cnj = '3002640-90.2025.8.06.0070';

-- @write tabela=processos slug=tse-2026-30002549911 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-30002549911'
  AND l.numero_cnj = '0001495-35.2024.5.10.0002';

-- @write tabela=processos slug=tse-2026-220002551946 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-220002551946'
  AND l.numero_cnj = '4001116-33.2023.8.22.0501';

-- @write tabela=processos slug=tse-2026-200002534447 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-200002534447'
  AND l.numero_cnj = '0103739-49.2023.8.17.2001';

-- @write tabela=processos slug=tse-2026-90002545243 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-90002545243'
  AND l.numero_cnj = '5430476-17.2022.8.09.0051';

-- @write tabela=processos slug=tse-2026-90002540998 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-90002540998'
  AND l.numero_cnj = '0036819-20.2013.8.09.0206';

-- @write tabela=processos slug=tse-2026-130002552299 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-130002552299'
  AND l.numero_cnj = '5004222-90.2024.8.13.0439';

-- @write tabela=processos slug=tse-2026-220002547310 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-220002547310'
  AND l.numero_cnj = '7071212-04.2022.8.22.0001';

-- @write tabela=processos slug=tse-2026-150002548971 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-150002548971'
  AND l.numero_cnj = '0810272-52.2018.4.05.8200';

-- @write tabela=processos slug=tse-2026-260002547285 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-260002547285'
  AND l.numero_cnj = '0032760-70.2016.8.25.0001';

-- @write tabela=processos slug=tse-2026-100002553336 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-100002553336'
  AND l.numero_cnj = '0000344-04.2023.5.08.0106';

-- @write tabela=processos slug=tse-2026-130002551930 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-130002551930'
  AND l.numero_cnj = '5022273-61.2024.8.13.0145';

-- @write tabela=processos slug=tse-2026-140002542691 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'tse-2026-140002542691'
  AND l.numero_cnj = '0707805-57.2025.8.07.0020';

-- @write tabela=processos slug=expedito-netto campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = 'expedito-netto'
  AND l.numero_cnj = '7054945-54.2022.8.22.0001';

DO $$
DECLARE
  n integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'processos curadoria: checagens ignoradas apenas no replay descartavel';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'processos curadoria: coorte ausente; checagens ignoradas';
    RETURN;
  END IF;
  SELECT count(*) INTO n
  FROM public.processos
  WHERE fonte LIKE 'curadoria-djen-20260927: %';
  IF n <> 14 THEN
    RAISE EXCEPTION 'processos curadoria: esperados 14 registros inseridos, encontrados %', n;
  END IF;
END $$;
