-- Troca url_fonte da API JSON do DJEN pelo portal humano da consulta.
-- A coleta continua em comunicaapi; o leitor abre comunica.pje.jus.br/consulta.

WITH origem AS (
  SELECT
    id,
    'https://comunica.pje.jus.br/consulta?numeroProcesso='
      || regexp_replace(
        substring(url_fonte FROM 'numeroProcesso=([0-9.\-]+)'),
        '[^0-9]',
        '',
        'g'
      ) AS url_consulta
  FROM public.processos
  WHERE url_fonte LIKE 'https://comunicaapi.pje.jus.br/%'
)
-- @write tabela=processos ref=urls_consulta_djen_20260819 campos=url_fonte
UPDATE public.processos AS p
SET url_fonte = origem.url_consulta
FROM origem
WHERE p.id = origem.id
  AND origem.url_consulta ~ '^https://comunica\.pje\.jus\.br/consulta\?numeroProcesso=\d{20}$'
  AND p.url_fonte IS DISTINCT FROM origem.url_consulta
  AND 'urls_consulta_djen_20260819'::text IS NOT NULL;
