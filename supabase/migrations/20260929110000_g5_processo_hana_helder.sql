-- 20260929110000_g5_processo_hana_helder.sql
-- G5, liberação editorial de 29/09/2026. APROVADO, NAO APLICADO.
-- Allowlist: scripts/audit/allowlist-g5-processo-hana-helder-20260929.json (recorte g5-processo-hana-helder-20260929).
-- Processo: 1 CNJ (0009421-71.2009.4.01.3900, TRF1, improbidade) publicado em 2 fichas
-- (hana-ghassan e tse-2026-140002550779), marcador curadoria-g5-20260929, com
-- 2 recibos coleta_log 'encontrado' e 1 recibo global de escrita.
-- Identidade das duas partes conferida pelo identificador oficial do documento
-- do DJEN contra a candidatura TSE 2026 (comparação feita fora do repositório;
-- nenhum identificador pessoal é gravado aqui).
-- Somente INSERT: a preimagem é a ausência do CNJ nas duas fichas, medida em
-- produção em 29/09/2026. CNJ já presente em qualquer das fichas aborta a
-- transação inteira.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.processos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.coleta_log IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_processos_curadoria (
  slug text NOT NULL, candidato_id uuid NOT NULL, tipo text NOT NULL,
  tribunal text NOT NULL, numero_cnj text NOT NULL, descricao text NOT NULL,
  status text NOT NULL, fonte text NOT NULL, url_fonte text NOT NULL,
  PRIMARY KEY (slug, numero_cnj)
) ON COMMIT DROP;
INSERT INTO _pf_processos_curadoria
  (slug, candidato_id, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
  ('hana-ghassan', '13c6d8ac-fee3-49f7-b1cf-c1a80c69fcea', 'improbidade', 'TRF1', '0009421-71.2009.4.01.3900', 'Pedidos julgados improcedentes em 1ª instância; remessa necessária no TRF1. Ação civil de improbidade administrativa proposta pelo Ministério Público Federal, com a União como assistente, que tem Hana Ghassan entre os réus. Fonte: comunicações processuais oficiais publicadas no DJEN/CNJ, incluindo acórdão do TRF1 de setembro de 2023.', 'em_andamento', 'curadoria-g5-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0009421-71.2009.4.01.3900', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00094217120094013900'),
  ('tse-2026-140002550779', 'deb06733-767d-4883-a8de-3757b879126a', 'improbidade', 'TRF1', '0009421-71.2009.4.01.3900', 'Pedidos julgados improcedentes em 1ª instância; remessa necessária no TRF1. Ação civil de improbidade administrativa proposta pelo Ministério Público Federal, com a União como assistente, que tem Helder Barbalho entre os réus. Fonte: comunicações processuais oficiais publicadas no DJEN/CNJ, incluindo acórdão do TRF1 de setembro de 2023.', 'em_andamento', 'curadoria-g5-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0009421-71.2009.4.01.3900', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00094217120094013900');

CREATE TEMP TABLE _pf_g5_recibos (
  slug text PRIMARY KEY, candidato_id uuid NOT NULL, volume integer NOT NULL,
  url text NOT NULL, detalhe text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_g5_recibos VALUES
  ('hana-ghassan', '13c6d8ac-fee3-49f7-b1cf-c1a80c69fcea'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08155919420268140000&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; 1 processo (0815591-94.2026.8.14.0000) fora da ficha porque a candidata consta só como autoridade coatora, pelo cargo; revisão editorial em 29/09/2026'),
  ('tse-2026-140002550779', 'deb06733-767d-4883-a8de-3757b879126a'::uuid, 4, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1; detalhe=4 processo(s) com número CNJ, contexto oficial de identidade e parte na ação (3 da curadoria de 28/09 e 1 novo, 0009421-71.2009.4.01.3900); revisão editorial em 29/09/2026');

DO $apply$
DECLARE n integer; soma integer := 0;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'g5-processo: apenas replay descartável; sem escrita';
    RETURN;
  END IF;

  -- Identidade, contagens fechadas e preimagem (ausência): qualquer divergência aborta.
  IF (SELECT count(*) FROM _pf_processos_curadoria) <> 2
     OR (SELECT count(DISTINCT slug) FROM _pf_processos_curadoria) <> 2
     OR (SELECT count(DISTINCT numero_cnj) FROM _pf_processos_curadoria) <> 1
     OR (SELECT count(*) FROM _pf_g5_recibos) <> 2
  THEN RAISE EXCEPTION 'g5-processo: lista fechada divergiu das contagens'; END IF;

  IF EXISTS (SELECT 1 FROM (
       SELECT slug, candidato_id FROM _pf_processos_curadoria
       UNION SELECT slug, candidato_id FROM _pf_g5_recibos) u
     LEFT JOIN public.candidatos c ON c.id = u.candidato_id AND c.slug = u.slug
     WHERE c.id IS NULL)
  THEN RAISE EXCEPTION 'g5-processo: identidade de ficha divergente'; END IF;

  IF EXISTS (SELECT 1 FROM public.processos p JOIN _pf_processos_curadoria l
       ON p.candidato_id = l.candidato_id
      AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g'))
  THEN RAISE EXCEPTION 'g5-processo: CNJ já existe na ficha; recusar duplicação ou lote parcial'; END IF;

  IF EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260929110000')
  THEN RAISE EXCEPTION 'g5-processo: recibo já existe'; END IF;

  -- Processo novo, um statement por ficha.
  -- @write tabela=processos slug=hana-ghassan campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'hana-ghassan' AND l.numero_cnj = '0009421-71.2009.4.01.3900';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-140002550779 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-140002550779' AND l.numero_cnj = '0009421-71.2009.4.01.3900';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  IF soma <> 2 THEN RAISE EXCEPTION 'g5-processo: processos inseridos %', soma; END IF;

  -- @write tabela=coleta_log ref=migration:20260929110000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'processos-curadoria', 'candidato', r.slug, r.candidato_id, 'encontrado', r.volume,
         r.detalhe, r.url, 'migration:20260929110000', 'coleta'
  FROM _pf_g5_recibos r JOIN public.candidatos c ON c.id = r.candidato_id AND c.slug = r.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'g5-processo: recibos de processos %', n; END IF;

  -- Pós-condição: o que a ficha passa a mostrar.
  IF (SELECT count(*) FROM _pf_processos_curadoria l WHERE (SELECT count(*) FROM public.processos p
        WHERE p.candidato_id = l.candidato_id AND p.fonte = l.fonte AND p.descricao = l.descricao
          AND p.status = l.status AND p.tipo = l.tipo AND p.tribunal = l.tribunal AND p.url_fonte = l.url_fonte
          AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')) <> 1) <> 0
     OR (SELECT count(*) FROM public.processos
        WHERE fonte = 'curadoria-g5-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0009421-71.2009.4.01.3900'
          AND descricao LIKE 'Pedidos julgados improcedentes em 1ª instância; remessa necessária no TRF1. %') <> 2
  THEN RAISE EXCEPTION 'g5-processo: pós-condição falhou'; END IF;

  -- @write tabela=coleta_log ref=migration:20260929110000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'curadoria-g5', 'global', 'processos', 'encontrado', 2,
    jsonb_build_object(
      'resumo', 'G5: 1 processo (0009421-71.2009.4.01.3900, TRF1) publicado em 2 fichas; 0815591-94.2026.8.14.0000 segue fora da ficha de hana-ghassan (autoridade coatora pelo cargo).',
      'processos_novos', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.candidato_id) FROM public.processos p JOIN _pf_processos_curadoria l
        ON p.candidato_id = l.candidato_id AND p.fonte = l.fonte))::text,
    'https://comunica.pje.jus.br/', 'migration:20260929110000', 'escrita';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'g5-processo: recibo global %', n; END IF;
END
$apply$;
COMMIT;
