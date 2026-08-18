-- Registro factual (processos) da condenacao de Ciro Gomes (CE), achada na
-- validacao por candidato dos governadores e aprovada para insercao. Verificada
-- em multiplas fontes independentes (CNN Brasil, Diario do Grande ABC, LeiaJa,
-- 2026-05-20/21). E o unico dos 8 deltas juridicos inserido agora: e fato
-- judicial (decisao de 1a instancia), nao alegacao. Os outros 7 (denuncias/
-- operacoes/investigacoes sem condenacao) seguem na fila de curadoria
-- governadores-legal-deltas-curation-20260604.json (needs_human_review), porque
-- auto-publicar fase de investigacao exige revisao editorial (presuncao de
-- inocencia / risco de difamacao).
--
-- Status PRECISO: condenacao de 1a instancia, cabe recurso. NAO torna inelegivel
-- nem remove a candidatura. tipo='eleitoral' (nao 'criminal', pra nao inflar o
-- contador de processos criminais). Idempotente via NOT EXISTS.
BEGIN;

INSERT INTO public.processos
  (candidato_id, tipo, tribunal, descricao, status, data_decisao, gravidade, fonte, url_fonte)
SELECT
  '2df15aa1-0bd3-4bab-89bf-13d780645e54',
  'eleitoral',
  'Justica Eleitoral - 115a Zona Eleitoral de Fortaleza (CE)',
  'Condenado em 1a instancia por violencia politica de genero contra a prefeita de Crateus, Janaina Farias (PT), por declaracoes de 2024. Pena de 1 ano e 4 meses convertida em pagamento de multas (20 + 50 salarios minimos) por ser reu primario. Decisao de 1o grau; a defesa anunciou recurso ao TRE-CE.',
  'Condenado em 1a instancia (cabe recurso)',
  '2026-05-19',
  'alta',
  'CNN Brasil; Diario do Grande ABC; LeiaJa',
  'https://www.cnnbrasil.com.br/politica/ciro-gomes-e-condenado-por-violencia-politica-de-genero-contra-prefeita/'
WHERE NOT EXISTS (
  SELECT 1 FROM public.processos
  WHERE candidato_id = '2df15aa1-0bd3-4bab-89bf-13d780645e54'
    AND data_decisao = '2026-05-19'
    AND tipo = 'eleitoral'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM public.processos
  WHERE candidato_id = '2df15aa1-0bd3-4bab-89bf-13d780645e54'
    AND data_decisao = '2026-05-19';
  IF n <> 1 THEN
    RAISE EXCEPTION 'processo Ciro: esperado exatamente 1 registro da condenacao, encontrado %', n;
  END IF;
END $$;

COMMIT;
