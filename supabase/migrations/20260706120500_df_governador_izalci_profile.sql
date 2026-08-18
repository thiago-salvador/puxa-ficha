-- DF Governador: perfil oficial TSE de Izalci Lucas.
-- Fonte: TSE consulta_cand 2010/2014/2018 para SQs 70000000726,
-- 70000001075 e 70000625515.

BEGIN;

UPDATE public.candidatos c
SET
  nome_completo = 'Izalci Lucas Ferreira',
  data_nascimento = DATE '1956-04-07',
  idade = NULL,
  naturalidade = 'Araújos (MG)',
  formacao = 'Superior completo',
  profissao_declarada = 'Deputado',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['curadoria', 'TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'izalci-lucas';

DO $$
DECLARE
  profile_ok integer;
BEGIN
  SELECT count(*) INTO profile_ok
  FROM public.candidatos_publico
  WHERE slug = 'izalci-lucas'
    AND nome_completo = 'Izalci Lucas Ferreira'
    AND data_nascimento = DATE '1956-04-07'
    AND naturalidade = 'Araújos (MG)'
    AND formacao = 'Superior completo'
    AND profissao_declarada = 'Deputado'
    AND 'TSE' = ANY(fonte_dados);

  IF profile_ok <> 1 THEN
    RAISE EXCEPTION 'izalci-lucas perfil TSE nao materializado em candidatos_publico';
  END IF;
END $$;

COMMIT;
