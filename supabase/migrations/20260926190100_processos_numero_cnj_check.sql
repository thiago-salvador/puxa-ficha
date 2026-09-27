-- Migration de SCHEMA: numero_processo só aceita número único CNJ válido.
--
-- Por quê: processos só é escrito por migration (não há ingestão em runtime),
-- então o banco é o único ponto que barra um número fora do padrão. A
-- 20260926190000 corrigiu o caso que motivou a regra (sufixo /50000 de
-- incidente do e-SAJ gravado junto ao número único, 25 dígitos).
--
-- Regra: NULL ou NNNNNNN-DD.AAAA.J.TR.OOOO com dígito verificador DD correto
-- (módulo 97, Resolução CNJ 65/2008). As 180 linhas no formato CNJ em
-- produção passam no dígito verificador (censo de 2026-09-26).
--
-- NOT VALID de propósito, sem VALIDATE: a regra vale para todo INSERT e UPDATE
-- daqui em diante, mas três linhas publicadas antes dela guardam números de
-- outra natureza e ficam como estão até decisão editorial própria:
--   'HC 201965'               (flavio-bolsonaro)
--   'TC 008.761/2020-5'       (tarcisio-gov-sp, processo do TCU)
--   '43.0719.0000337/2020-0'  (felicio-ramuth)
-- Qualquer UPDATE nessas três linhas precisa antes pôr o número CNJ ou NULL
-- (com o identificador original na descrição). O readback confere que são
-- exatamente essas as linhas fora da regra.
BEGIN;

CREATE OR REPLACE FUNCTION public.processo_numero_cnj_valido(numero text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN numero !~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$' THEN false
    ELSE (
      98 - ((substr(d, 1, 7) || substr(d, 10, 11) || '00')::numeric % 97)
    ) = substr(d, 8, 2)::integer
  END
  FROM (SELECT pg_catalog.regexp_replace(numero, '[^0-9]', '', 'g') AS d) AS digitos
$fn$;

COMMENT ON FUNCTION public.processo_numero_cnj_valido(text) IS
  'Verdadeiro quando o texto é um número único CNJ mascarado (NNNNNNN-DD.AAAA.J.TR.OOOO) com dígito verificador módulo 97 correto.';

REVOKE ALL ON FUNCTION public.processo_numero_cnj_valido(text) FROM PUBLIC, anon, authenticated;
-- A CHECK roda com o papel de quem escreve em processos: só service_role e o
-- dono da tabela escrevem ali.
GRANT EXECUTE ON FUNCTION public.processo_numero_cnj_valido(text) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'processos_numero_processo_cnj_check'
      AND conrelid = 'public.processos'::regclass
  ) THEN
    ALTER TABLE public.processos
      ADD CONSTRAINT processos_numero_processo_cnj_check
      CHECK (numero_processo IS NULL OR public.processo_numero_cnj_valido(numero_processo)) NOT VALID;
  END IF;
END
$$;

COMMIT;
