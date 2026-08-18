-- Backfill de candidaturas oficiais confirmadas no consulta_cand do TSE que
-- nunca foram ingeridas para historico_politico (causa "nao_ingerida" da
-- auditoria A2A, execucao pf-patrimonio-20260807T170643Z):
--   cintia-dias 2012 Vereador GO (SQ 90000012450, INAPTO/INDEFERIDO)
--   jayme-campos 2014 Senador MT (SQ 110000000003, INAPTO)
--   jose-roberto-arruda 2014 Governador DF (SQ 70000000153, INAPTO)
--   mailza-assis 2014 1o Suplente Senador AC (SQ 10000000002, APTO;
--     casamento por CPF oficial publicado pelo TSE, sem SQ previo no seed)
-- Identidade: SQ_CANDIDATO exato por ano (rota 1) nos tres primeiros; CPF
-- exato (rota 2, oficial TSE) no quarto. Zero ambiguidade registrada.
BEGIN;

-- @write tabela=historico_politico slug=cintia-dias campos=cargo,cargo_canonico,periodo_inicio,periodo_fim,partido,estado,tipo_evento,proveniencia,observacoes
INSERT INTO public.historico_politico (
  candidato_id, cargo, cargo_canonico, periodo_inicio, periodo_fim,
  partido, estado, tipo_evento, proveniencia, observacoes
)
SELECT c.id, 'Vereador', 'Vereador', 2012, 2012, 'PSOL', 'GO',
       'candidatura', 'tse',
       'Candidatura: INDEFERIDO (TSE 2012). SQ 90000012450; fonte consulta_cand_2012 (TSE Dados Abertos), verificada em 2026-08-07.'
FROM public.candidatos c
WHERE c.slug = 'cintia-dias'
  AND NOT EXISTS (
    SELECT 1 FROM public.historico_politico h
    WHERE h.candidato_id = c.id
      AND h.periodo_inicio = 2012
      AND h.cargo_canonico = 'Vereador'
  );

-- @write tabela=historico_politico slug=jayme-campos campos=cargo,cargo_canonico,periodo_inicio,periodo_fim,partido,estado,tipo_evento,proveniencia,observacoes
INSERT INTO public.historico_politico (
  candidato_id, cargo, cargo_canonico, periodo_inicio, periodo_fim,
  partido, estado, tipo_evento, proveniencia, observacoes
)
SELECT c.id, 'Senador', 'Senador', 2014, 2014, 'DEM', 'MT',
       'candidatura', 'tse',
       'Candidatura: INAPTO (TSE 2014). SQ 110000000003; fonte consulta_cand_2014 (TSE Dados Abertos), verificada em 2026-08-07.'
FROM public.candidatos c
WHERE c.slug = 'jayme-campos'
  AND NOT EXISTS (
    SELECT 1 FROM public.historico_politico h
    WHERE h.candidato_id = c.id
      AND h.periodo_inicio = 2014
      AND h.cargo_canonico = 'Senador'
  );

-- @write tabela=historico_politico slug=jose-roberto-arruda campos=cargo,cargo_canonico,periodo_inicio,periodo_fim,partido,estado,tipo_evento,proveniencia,observacoes
INSERT INTO public.historico_politico (
  candidato_id, cargo, cargo_canonico, periodo_inicio, periodo_fim,
  partido, estado, tipo_evento, proveniencia, observacoes
)
SELECT c.id, 'Governador', 'Governador', 2014, 2014, 'PR', 'DF',
       'candidatura', 'tse',
       'Candidatura: INAPTO (TSE 2014). SQ 70000000153; fonte consulta_cand_2014 (TSE Dados Abertos), verificada em 2026-08-07.'
FROM public.candidatos c
WHERE c.slug = 'jose-roberto-arruda'
  AND NOT EXISTS (
    SELECT 1 FROM public.historico_politico h
    WHERE h.candidato_id = c.id
      AND h.periodo_inicio = 2014
      AND h.cargo_canonico = 'Governador'
  );

-- @write tabela=historico_politico slug=mailza-assis campos=cargo,cargo_canonico,periodo_inicio,periodo_fim,partido,estado,tipo_evento,proveniencia,observacoes
INSERT INTO public.historico_politico (
  candidato_id, cargo, cargo_canonico, periodo_inicio, periodo_fim,
  partido, estado, tipo_evento, proveniencia, observacoes
)
SELECT c.id, '1o Suplente Senador', '1o Suplente Senador', 2014, 2014, 'PSDB', 'AC',
       'candidatura', 'tse',
       'Candidatura: APTO (TSE 2014). SQ 10000000002; casamento por CPF oficial publicado pelo TSE; fonte consulta_cand_2014 (TSE Dados Abertos), verificada em 2026-08-07.'
FROM public.candidatos c
WHERE c.slug = 'mailza-assis'
  AND NOT EXISTS (
    SELECT 1 FROM public.historico_politico h
    WHERE h.candidato_id = c.id
      AND h.periodo_inicio = 2014
      AND h.cargo_canonico = '1o Suplente Senador'
  );

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE (c.slug = 'cintia-dias' AND h.periodo_inicio = 2012 AND h.cargo_canonico = 'Vereador')
     OR (c.slug = 'jayme-campos' AND h.periodo_inicio = 2014 AND h.cargo_canonico = 'Senador')
     OR (c.slug = 'jose-roberto-arruda' AND h.periodo_inicio = 2014 AND h.cargo_canonico = 'Governador')
     OR (c.slug = 'mailza-assis' AND h.periodo_inicio = 2014 AND h.cargo_canonico = '1o Suplente Senador');

  IF n <> 4 THEN
    RAISE EXCEPTION 'backfill candidaturas oficiais: esperadas 4 linhas na trajetoria, encontradas %', n;
  END IF;
END $$;

COMMIT;
