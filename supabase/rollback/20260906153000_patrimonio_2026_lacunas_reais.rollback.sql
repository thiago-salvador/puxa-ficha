BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE quantidade integer;
BEGIN
  SELECT count(*) INTO quantidade FROM (
    SELECT p.candidato_id FROM public.patrimonio p
    JOIN public.candidatos c ON c.id=p.candidato_id
    WHERE (c.slug,p.ano_eleicao,p.valor_total,jsonb_array_length(p.bens),p.fonte) IN (
      ('rico-pinheiro',2026,4380000::numeric,3,'TSE'),
      ('ruth-reis',2026,1324017.48::numeric,11,'TSE')
    )
    UNION ALL
    SELECT a.candidato_id FROM public.patrimonio_ausencia_oficial a
    JOIN public.candidatos c ON c.id=a.candidato_id
    WHERE a.execucao='migration:20260906153000'
      AND (c.slug,a.ano_eleicao,a.sq_candidato) IN (
        ('dr-luisinho',2026,'10002533539'),
        ('well-macedo',2026,'140002554108')
      )
  ) x;
  IF quantidade<>4 THEN RAISE EXCEPTION 'rollback patrimonio 2026: postimage divergiu, linhas=%', quantidade; END IF;

  DELETE FROM public.patrimonio p USING public.candidatos c
  WHERE p.candidato_id=c.id AND p.ano_eleicao=2026
    AND (c.slug,p.valor_total,jsonb_array_length(p.bens),p.fonte) IN (
      ('rico-pinheiro',4380000::numeric,3,'TSE'),
      ('ruth-reis',1324017.48::numeric,11,'TSE')
    );
  DELETE FROM public.patrimonio_ausencia_oficial
  WHERE execucao='migration:20260906153000'
    AND ano_eleicao=2026 AND sq_candidato IN ('10002533539','140002554108');
  DELETE FROM public.coleta_log WHERE execucao LIKE 'migration:20260906153000:%';
END
$rollback$;

COMMIT;
