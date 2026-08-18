-- MG Governador: perfis TSE estruturados para remover gaps acionáveis do HTML.
-- Fonte: TSE Dados Abertos consulta_cand 2016/2018/2020/2022/2024 por SQ_CANDIDATO já curado no seed.

BEGIN;

UPDATE public.candidatos
SET
  data_nascimento = '1984-09-11',
  naturalidade = 'MG',
  formacao = 'Superior incompleto',
  profissao_declarada = 'Técnico de Mineração, Metalurgia e Geologia'
WHERE slug = 'rafael-duda';

UPDATE public.candidatos
SET
  data_nascimento = '1951-05-03',
  naturalidade = 'Distrito Federal (DF)',
  formacao = 'Superior completo',
  profissao_declarada = 'Empresário'
WHERE slug = 'vittorio-medioli';

UPDATE public.candidatos
SET
  data_nascimento = '1985-05-18',
  naturalidade = 'Rieirão Preto (SP)',
  formacao = 'Superior completo',
  profissao_declarada = 'Jornalista e redator'
WHERE slug = 'henrique-areas';

UPDATE public.candidatos
SET
  data_nascimento = '1984-10-04',
  naturalidade = 'AL',
  formacao = 'Superior incompleto',
  profissao_declarada = 'Outros'
WHERE slug = 'indira-xavier';

DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing
  FROM public.candidatos
  WHERE slug IN ('rafael-duda', 'vittorio-medioli', 'henrique-areas', 'indira-xavier')
    AND (
      data_nascimento IS NULL
      OR naturalidade IS NULL
      OR formacao IS NULL
      OR profissao_declarada IS NULL
    );

  IF missing > 0 THEN
    RAISE EXCEPTION 'MG profile update incomplete: % rows still missing profile fields', missing;
  END IF;
END $$;

COMMIT;
