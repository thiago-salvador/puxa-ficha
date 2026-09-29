-- READBACK SOMENTE LEITURA de 20260929110000_g5_processo_hana_helder.sql
DO $readback$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations WHERE version = '20260929110000';
  IF n <> 1 THEN RAISE EXCEPTION 'readback g5-processo: ledger=%', n; END IF;

  WITH e(slug, candidato_id, nome) AS (VALUES
    ('hana-ghassan', '13c6d8ac-fee3-49f7-b1cf-c1a80c69fcea'::uuid, 'Hana Ghassan'),
    ('tse-2026-140002550779', 'deb06733-767d-4883-a8de-3757b879126a'::uuid, 'Helder Barbalho')
  ) SELECT count(*) INTO n FROM e WHERE
    (SELECT count(*) FROM public.candidatos c JOIN public.processos p ON p.candidato_id = c.id
      WHERE c.id = e.candidato_id AND c.slug = e.slug
        AND p.numero_processo = '0009421-71.2009.4.01.3900'
        AND p.tipo = 'improbidade' AND p.tribunal = 'TRF1' AND p.status = 'em_andamento'
        AND p.fonte = 'curadoria-g5-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0009421-71.2009.4.01.3900'
        AND p.url_fonte = 'https://comunica.pje.jus.br/consulta?numeroProcesso=00094217120094013900'
        AND left(p.descricao, 75) = 'Pedidos julgados improcedentes em 1ª instância; remessa necessária no TRF1.'
        AND position(e.nome || ' entre os réus' IN p.descricao) > 0) <> 1;
  IF n <> 0 THEN RAISE EXCEPTION 'readback g5-processo: % fichas sem a linha exata (esperadas 2)', n; END IF;
  SELECT count(*) INTO n FROM public.processos
   WHERE regexp_replace(numero_processo, '[^0-9]', '', 'g') = '00094217120094013900';
  IF n <> 2 THEN RAISE EXCEPTION 'readback g5-processo: CNJ em % linhas (esperadas 2)', n; END IF;
  SELECT count(*) INTO n FROM public.processos WHERE fonte LIKE 'curadoria-g5-20260929: %';
  IF n <> 2 THEN RAISE EXCEPTION 'readback g5-processo: marcador=% (esperado 2)', n; END IF;

  WITH e(slug, candidato_id, url, detalhe, volume) AS (VALUES
    ('hana-ghassan', '13c6d8ac-fee3-49f7-b1cf-c1a80c69fcea'::uuid, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08155919420268140000&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; 1 processo (0815591-94.2026.8.14.0000) fora da ficha porque a candidata consta só como autoridade coatora, pelo cargo; revisão editorial em 29/09/2026', 1),
    ('tse-2026-140002550779', 'deb06733-767d-4883-a8de-3757b879126a'::uuid, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00094217120094013900&pagina=1; detalhe=4 processo(s) com número CNJ, contexto oficial de identidade e parte na ação (3 da curadoria de 28/09 e 1 novo, 0009421-71.2009.4.01.3900); revisão editorial em 29/09/2026', 4)
  ) SELECT count(*) INTO n FROM e JOIN public.coleta_log_ultima l
    ON l.fonte = 'processos-curadoria' AND l.escopo = 'candidato' AND l.alvo = e.slug
   AND l.candidato_id = e.candidato_id AND l.resultado = 'encontrado'
   AND l.volume = e.volume AND l.url = e.url AND l.detalhe = e.detalhe AND l.execucao = 'migration:20260929110000';
  IF n <> 2 THEN RAISE EXCEPTION 'readback g5-processo: recibos atuais=% (esperados 2)', n; END IF;

  SELECT count(*) INTO n FROM public.coleta_log WHERE execucao = 'migration:20260929110000' AND fonte = 'curadoria-g5';
  IF n <> 1 THEN RAISE EXCEPTION 'readback g5-processo: recibo global=%', n; END IF;
  RAISE NOTICE 'readback g5-processo: 1 CNJ em 2 fichas, 2 recibos atuais, 1 recibo global';
END
$readback$;
