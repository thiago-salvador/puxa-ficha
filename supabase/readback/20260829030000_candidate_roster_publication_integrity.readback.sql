DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug='cleber-rabelo') THEN
    RAISE EXCEPTION 'readback: candidatura terminal de Cleber Rabelo permanece pública';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.candidatos_publico
    WHERE cargo_disputado IN ('Presidente','Governador')
      AND (
        COALESCE(btrim(foto_url),'')='' OR COALESCE(btrim(biografia),'')='' OR
        COALESCE(btrim(naturalidade),'')='' OR data_nascimento IS NULL OR
        COALESCE(btrim(formacao),'')='' OR COALESCE(btrim(profissao_declarada),'')='' OR
        COALESCE(btrim(genero),'')='' OR COALESCE(btrim(estado_civil),'')='' OR
        COALESCE(btrim(cor_raca),'')='' OR
        NOT (verificacao_campos ? 'candidate_registration') OR
        NOT (verificacao_campos ? 'candidate_complement')
      )
  ) THEN
    RAISE EXCEPTION 'readback: existe ficha pública abaixo do gate mínimo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE identidade_status <> 'confirmada') THEN
    RAISE EXCEPTION 'readback: identidade em quarentena visível';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.candidatos'::regclass
      AND conname='candidatos_publicacao_minima_2026_check'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'readback: constraint de admissão não está validada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE titular_slug='laudicerio-aguiar') THEN
    RAISE EXCEPTION 'readback: duplicidade ativa de Laudicério foi publicada';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026_publico WHERE titular_slug='well-macedo' AND vice_nome_urna='SEU ALEX') <> 1 THEN
    RAISE EXCEPTION 'readback: vice vigente de Well Macedo divergiu';
  END IF;
END $$;
