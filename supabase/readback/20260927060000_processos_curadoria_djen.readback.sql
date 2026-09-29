-- READBACK SOMENTE LEITURA de 20260927060000_processos_curadoria_djen.sql
-- Rodar depois da aplicacao autorizada e antes de qualquer deploy.
-- Um unico bloco DO sem tabela temporaria: roda em transacao somente leitura.
DO $readback$
DECLARE resultado record;
  ledger integer;
BEGIN
  SELECT count(*) INTO ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260927060000';
  IF ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260927060000: ledger=% (esperado 1)', ledger;
  END IF;
WITH expected_base(
  slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte,
  expected_candidate_id, expected_nome_completo, expected_nome_urna, expected_slug_pos_split
) AS (VALUES
    ('danilo-soares', 'civil', 'TJCE', '3002640-90.2025.8.06.0070', 'O DJEN registra comunicação processual oficial no processo 3002640-90.2025.8.06.0070, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CíVEL, perante Juizado Especial Cível e Criminal da Comarca de Crateús (TJCE). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-08-13 e 2026-06-16. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 3002640-90.2025.8.06.0070', 'https://comunica.pje.jus.br/consulta?numeroProcesso=30026409020258060070', NULL, NULL, NULL, NULL),
    ('tse-2026-30002549911', 'civil', 'TRT10', '0001495-35.2024.5.10.0002', 'O DJEN registra comunicação processual oficial no processo 0001495-35.2024.5.10.0002, nas classes AçãO TRABALHISTA - RITO ORDINáRIO, perante 2ª Vara do Trabalho de Brasília - DF (TRT10). O candidato consta nos polos passivo. As comunicações Intimação e Lista de distribuição foram disponibilizadas entre 2024-12-23 e 2025-06-02. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0001495-35.2024.5.10.0002', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00014953520245100002', NULL, NULL, NULL, NULL),
    ('tse-2026-220002551946', 'criminal', 'SEEU', '4001116-33.2023.8.22.0501', 'O DJEN registra comunicação processual oficial no processo 4001116-33.2023.8.22.0501, nas classes Execução de Medidas Alternativas, perante VEPEMA - Vara de Exec. de Penas e Medidas Alternativas de Porto Velho (Meio Aberto) (SEEU). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2023-06-16 e 2023-06-19. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 4001116-33.2023.8.22.0501', 'https://comunica.pje.jus.br/consulta?numeroProcesso=40011163320238220501', NULL, NULL, NULL, NULL),
    ('tse-2026-200002534447', 'civil', 'TJPE', '0103739-49.2023.8.17.2001', 'O DJEN registra comunicação processual oficial no processo 0103739-49.2023.8.17.2001, nas classes PROCEDIMENTO COMUM CíVEL; Procedimento do Juizado Especial da Fazenda Pública, perante 3ª Vara da Fazenda Pública da Capital; 3º Juizado Especial da Fazenda Pública da Capital - Turno Manhã - 07:00h às 13:00h (TJPE). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-04-03 e 2026-05-22. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0103739-49.2023.8.17.2001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=01037394920238172001', NULL, NULL, NULL, NULL),
    ('tse-2026-90002545243', 'criminal', 'TJGO', '5430476-17.2022.8.09.0051', 'O DJEN registra comunicação processual oficial no processo 5430476-17.2022.8.09.0051, nas classes AçãO PENAL - PROCEDIMENTO ORDINáRIO, perante 4ª Câmara Criminal; Goiânia - 1ª UPJ Varas de Crimes Punidos com Reclusão e Detenção: 1ª, 3ª, 6ª e 7ª (TJGO). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-04-11 e 2026-05-28. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 5430476-17.2022.8.09.0051', 'https://comunica.pje.jus.br/consulta?numeroProcesso=54304761720228090051', NULL, NULL, NULL, NULL),
    ('tse-2026-90002540998', 'improbidade', 'TJGO', '0036819-20.2013.8.09.0206', 'O DJEN registra comunicação processual oficial no processo 0036819-20.2013.8.09.0206, nas classes AçãO CIVIL DE IMPROBIDADE ADMINISTRATIVA, perante Goiânia - Núcleo de Justiça 4.0 - Finalizar Fazendas Públicas (TJGO). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-07-28 e 2026-09-08. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0036819-20.2013.8.09.0206', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00368192020138090206', NULL, NULL, NULL, NULL),
    ('tse-2026-130002552299', 'civil', 'TJMG', '5004222-90.2024.8.13.0439', 'O DJEN registra comunicação processual oficial no processo 5004222-90.2024.8.13.0439, nas classes CUMPRIMENTO DE SENTENçA; PROCEDIMENTO DO JUIZADO ESPECIAL CíVEL, perante Unidade Jurisdicional da Comarca de Muriaé (TJMG). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-02-12 e 2026-06-25. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 5004222-90.2024.8.13.0439', 'https://comunica.pje.jus.br/consulta?numeroProcesso=50042229020248130439', NULL, NULL, NULL, NULL),
    ('tse-2026-220002547310', 'civil', 'STJ / TJRO', '7071212-04.2022.8.22.0001', 'O DJEN registra comunicação processual oficial no processo 7071212-04.2022.8.22.0001, nas classes AGRAVO EM RECURSO ESPECIAL; APELAçãO CíVEL; CUMPRIMENTO DE SENTENçA; PROCEDIMENTO COMUM CíVEL, perante Gabinete Des. Sansão Saldanha; Porto Velho - 2ª Vara Cível; SECRETARIA JUDICIÁRIA; SPF COORDENADORIA DE PROCESSAMENTO DE FEITOS DE DIREITO PRIVADO (STJ / TJRO). A candidata consta nos polos ativo e passivo. As comunicações Intimação foram disponibilizadas entre 2023-05-29 e 2025-08-08. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 7071212-04.2022.8.22.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=70712120420228220001', NULL, NULL, NULL, NULL),
    ('tse-2026-150002548971', 'civil', 'TRF5', '0810272-52.2018.4.05.8200', 'O DJEN registra comunicação processual oficial no processo 0810272-52.2018.4.05.8200, nas classes CUMPRIMENTO DE SENTENçA, perante 10ª Vara Federal PB (TRF5). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-12-05 e 2025-12-05. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0810272-52.2018.4.05.8200', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08102725220184058200', NULL, NULL, NULL, NULL),
    ('tse-2026-260002547285', 'civil', 'TJSE', '0032760-70.2016.8.25.0001', 'O DJEN registra comunicação processual oficial no processo 0032760-70.2016.8.25.0001, nas classes CUMPRIMENTO DE SENTENçA, perante 1ª Vara Cível de Aracaju (TJSE). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2021-03-24 e 2026-09-01. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0032760-70.2016.8.25.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00327607020168250001', NULL, NULL, NULL, NULL),
    ('tse-2026-100002553336', 'civil', 'TRT8', '0000344-04.2023.5.08.0106', 'O DJEN registra comunicação processual oficial no processo 0000344-04.2023.5.08.0106, nas classes AçãO TRABALHISTA - RITO ORDINáRIO, perante VARA DO TRABALHO DE CASTANHAL (TRT8). O candidato consta nos polos ativo e passivo. As comunicações Intimação foram disponibilizadas entre 2024-05-22 e 2026-07-23. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0000344-04.2023.5.08.0106', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00003440420235080106', NULL, NULL, NULL, NULL),
    ('tse-2026-130002551930', 'civil', 'TJMG', '5022273-61.2024.8.13.0145', 'O DJEN registra comunicação processual oficial no processo 5022273-61.2024.8.13.0145, nas classes CUMPRIMENTO DE SENTENçA CONTRA A FAZENDA PúBLICA, perante 2ª Vara da Fazenda Pública e Autarquias Municipais da Comarca de Juiz de Fora (TJMG). A candidata consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2025-02-03 e 2025-12-03. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 5022273-61.2024.8.13.0145', 'https://comunica.pje.jus.br/consulta?numeroProcesso=50222736120248130145', NULL, NULL, NULL, NULL),
    ('tse-2026-140002542691', 'civil', 'TJDFT', '0707805-57.2025.8.07.0020', 'O DJEN registra comunicação processual oficial no processo 0707805-57.2025.8.07.0020, nas classes PROCEDIMENTO COMUM CíVEL, perante 3ª Vara Cível de Águas Claras (TJDFT). O candidato consta nos polos passivo. As comunicações Intimação foram disponibilizadas entre 2025-04-24 e 2025-10-31. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 0707805-57.2025.8.07.0020', 'https://comunica.pje.jus.br/consulta?numeroProcesso=07078055720258070020', NULL, NULL, NULL, NULL),
    ('expedito-netto', 'civil', 'TJRO', '7054945-54.2022.8.22.0001', 'O DJEN registra comunicação processual oficial no processo 7054945-54.2022.8.22.0001, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CíVEL, perante Porto Velho - 2º Juizado Especial Cível (TJRO). O candidato consta nos polos ativo. As comunicações Intimação foram disponibilizadas entre 2023-04-12 e 2023-08-17. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-djen-20260927: Comunicações processuais oficiais do DJEN/CNJ - processo 7054945-54.2022.8.22.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=70549455420228220001', NULL, NULL, NULL, NULL)
), identity_resolution AS (
  SELECT e.numero_cnj,
         count(c.id) AS identity_matches,
         min(c.id::text)::uuid AS candidato_id
  FROM expected_base e
  LEFT JOIN public.candidatos c ON (
    (e.expected_candidate_id IS NULL AND c.slug = e.slug)
    OR (
      e.expected_candidate_id IS NOT NULL
      AND c.id = e.expected_candidate_id::uuid
      AND c.nome_completo = e.expected_nome_completo
      AND c.nome_urna = e.expected_nome_urna
      AND (
        (NOT EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '20260811102100'
        ) AND c.slug = e.slug)
        OR
        (EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '20260811102100'
        ) AND c.slug = e.expected_slug_pos_split)
      )
    )
  )
  GROUP BY e.numero_cnj
), expected AS (
  SELECT e.*, r.identity_matches, r.candidato_id
  FROM expected_base e
  JOIN identity_resolution r USING (numero_cnj)
), actual AS (
  SELECT c.id AS candidato_id, c.slug, p.tipo, p.tribunal, p.numero_processo AS numero_cnj,
         p.descricao, p.status, p.data_inicio, p.data_decisao, p.gravidade,
         p.fonte, p.url_fonte
  FROM public.processos p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.fonte LIKE 'curadoria-djen-20260927: %'
)
SELECT
  (SELECT count(*) FROM expected) AS expected_rows,
  (SELECT count(DISTINCT slug) FROM expected) AS expected_candidates,
  (SELECT count(*) FROM actual) AS actual_rows,
  (SELECT count(DISTINCT candidato_id) FROM actual) AS actual_candidates,
  (SELECT count(*) FROM expected WHERE identity_matches <> 1) AS identity_mismatch,
  (SELECT count(*) FROM expected e LEFT JOIN actual a
     ON a.candidato_id = e.candidato_id
    AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE a.numero_cnj IS NULL) AS missing_expected,
  (SELECT count(*) FROM actual a LEFT JOIN expected e
     ON a.candidato_id = e.candidato_id
    AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE e.numero_cnj IS NULL) AS unexpected_marker,
  (SELECT count(*) FROM expected e
   WHERE (SELECT count(*) FROM public.processos p
          WHERE regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1
      OR (SELECT count(*) FROM public.processos p JOIN public.candidatos c ON c.id = p.candidato_id
          WHERE c.id = e.candidato_id
            AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1) AS global_cnj_mismatch,
  (SELECT count(*) FROM expected e JOIN actual a
     ON a.candidato_id = e.candidato_id
    AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE (a.numero_cnj, a.tipo, a.tribunal, a.descricao, a.status, a.fonte, a.url_fonte)
         IS DISTINCT FROM
         (e.numero_cnj, e.tipo, e.tribunal, e.descricao, e.status, e.fonte, e.url_fonte)) AS payload_mismatch,
  (SELECT count(*) FROM actual
   WHERE data_inicio IS NOT NULL OR data_decisao IS NOT NULL OR gravidade IS NOT NULL) AS inferred_fields,
  (SELECT count(*) FROM actual
   WHERE url_fonte IS NULL OR url_fonte !~ '^https://') AS invalid_source_urls,
  (SELECT count(*) FROM actual
   WHERE url_fonte LIKE 'https://comunica.pje.jus.br/consulta?%'
     AND url_fonte <>
     'https://comunica.pje.jus.br/consulta?numeroProcesso=' ||
     regexp_replace(numero_cnj, '[^0-9]', '', 'g')) AS source_cnj_mismatch
  INTO STRICT resultado;
  IF resultado.expected_rows <> 14 OR resultado.expected_candidates <> 14
     OR resultado.actual_rows <> 14 OR resultado.actual_candidates <> 14
     OR resultado.identity_mismatch <> 0 OR resultado.missing_expected <> 0
     OR resultado.unexpected_marker <> 0 OR resultado.global_cnj_mismatch <> 0
     OR resultado.payload_mismatch <> 0 OR resultado.inferred_fields <> 0
     OR resultado.invalid_source_urls <> 0 OR resultado.source_cnj_mismatch <> 0 THEN
    RAISE EXCEPTION 'readback 20260927060000: %', row_to_json(resultado);
  END IF;
  RAISE NOTICE 'readback 20260927060000: %', row_to_json(resultado);
END
$readback$;
