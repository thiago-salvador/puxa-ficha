BEGIN;

-- Ajuste editorial da coorte presidencial 2026:
-- remove da superficie publica os slugs presidenciais antigos e preserva
-- o perfil publico especifico de Tarcisio como governador de SP em
-- `tarcisio-gov-sp`.
UPDATE public.candidatos
SET
  publicavel = false,
  status = 'removido',
  ultima_atualizacao = NOW()
WHERE slug IN ('tarcisio', 'eduardo-leite');

INSERT INTO public.candidatos (
  nome_completo,
  nome_urna,
  slug,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  formacao,
  profissao_declarada,
  publicavel,
  fonte_dados,
  ultima_atualizacao
)
VALUES
  (
    'Augusto Jorge Cury',
    'Augusto Cury',
    'augusto-cury',
    'Avante',
    'AVANTE',
    NULL,
    'Presidente',
    NULL,
    'pre-candidato',
    'Medicina',
    'Psiquiatra e escritor',
    true,
    ARRAY['curadoria', 'Avante', 'Band'],
    NOW()
  ),
  (
    'Benevenuto Daciolo Fonseca dos Santos',
    'Cabo Daciolo',
    'cabo-daciolo',
    'Mobilizacao Nacional',
    'MOBILIZA',
    NULL,
    'Presidente',
    NULL,
    'pre-candidato',
    NULL,
    'Militar e ex-deputado federal',
    true,
    ARRAY['curadoria', 'Band', 'Camara', 'TSE'],
    NOW()
  ),
  (
    'Edmilson Silva Costa',
    'Edmilson Costa',
    'edmilson-costa',
    'Partido Comunista Brasileiro',
    'PCB',
    NULL,
    'Presidente',
    NULL,
    'pre-candidato',
    'Economia',
    'Economista e professor',
    true,
    ARRAY['curadoria', 'PCB', 'FAPESP'],
    NOW()
  )
ON CONFLICT (slug) DO UPDATE
SET
  nome_completo = EXCLUDED.nome_completo,
  nome_urna = EXCLUDED.nome_urna,
  partido_atual = EXCLUDED.partido_atual,
  partido_sigla = EXCLUDED.partido_sigla,
  cargo_atual = EXCLUDED.cargo_atual,
  cargo_disputado = EXCLUDED.cargo_disputado,
  estado = EXCLUDED.estado,
  status = EXCLUDED.status,
  formacao = EXCLUDED.formacao,
  profissao_declarada = EXCLUDED.profissao_declarada,
  publicavel = EXCLUDED.publicavel,
  fonte_dados = EXCLUDED.fonte_dados,
  ultima_atualizacao = EXCLUDED.ultima_atualizacao;

DO $$
DECLARE
  old_public_count integer;
  new_public_count integer;
  preserved_governor_count integer;
BEGIN
  SELECT count(*) INTO old_public_count
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Presidente'
    AND slug IN ('tarcisio', 'eduardo-leite');

  IF old_public_count <> 0 THEN
    RAISE EXCEPTION 'coorte presidencial: slugs antigos ainda publicos: %', old_public_count;
  END IF;

  SELECT count(*) INTO new_public_count
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Presidente'
    AND slug IN ('augusto-cury', 'cabo-daciolo', 'edmilson-costa');

  IF new_public_count <> 3 THEN
    RAISE EXCEPTION 'coorte presidencial: esperava 3 novos slugs publicos, encontrei %', new_public_count;
  END IF;

  SELECT count(*) INTO preserved_governor_count
  FROM public.candidatos_publico
  WHERE slug = 'tarcisio-gov-sp'
    AND cargo_disputado = 'Governador'
    AND estado = 'SP';

  IF preserved_governor_count <> 1 THEN
    RAISE EXCEPTION 'coorte presidencial: tarcisio-gov-sp nao preservado como governador SP';
  END IF;
END $$;

COMMIT;
